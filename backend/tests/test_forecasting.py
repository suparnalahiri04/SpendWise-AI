import calendar
from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.dependencies import get_db
from app.forecasting import (
    generate_financial_forecast,
    get_future_month_str,
    get_month_bounds,
    get_month_label,
    get_forecast,
)
from app.main import app
from app.models import Base, RecurringPayment, Transaction, User


class FinancialForecastingTestCase(unittest.TestCase):
    def setUp(self):
        # Create an isolated in-memory SQLite database
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        def override_get_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db

        # Create two test users for isolation testing
        self.user1 = User(id=1, email="user1@spendwise.ai", password_hash="hash1")
        self.user2 = User(id=2, email="user2@spendwise.ai", password_hash="hash2")
        self.db.add_all([self.user1, self.user2])
        self.db.commit()

        # Fixed reference date: 2026-11-15 (mid-month)
        self.ref_date = date(2026, 11, 15)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    # -------------------------------------------------------------------------
    # 1. Cold Start / Empty History
    # -------------------------------------------------------------------------
    def test_cold_start_zero_transactions_zero_recurring(self):
        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=3,
            ref_date=self.ref_date,
        )

        self.assertEqual(forecast.confidence_level, "low")
        self.assertEqual(forecast.history_months_count, 0)
        self.assertLessEqual(forecast.confidence_score, 0.40)
        self.assertEqual(forecast.current_month_forecast.predicted_amount, Decimal("0.00"))
        self.assertEqual(forecast.current_month_forecast.actual_amount, Decimal("0.00"))
        self.assertEqual(forecast.current_month_forecast.fixed_commitments, Decimal("0.00"))
        self.assertEqual(forecast.current_month_forecast.variable_estimate, Decimal("0.00"))

        # 3 horizon months + 1 current month = 4 points total
        self.assertEqual(len(forecast.monthly_forecasts), 4)
        for point in forecast.monthly_forecasts:
            self.assertEqual(point.predicted_amount, Decimal("0.00"))
            self.assertEqual(point.lower_bound, Decimal("0.00"))
            self.assertEqual(point.upper_bound, Decimal("0.00"))

        self.assertEqual(forecast.category_forecasts, [])
        self.assertTrue(any("Cold-start" in note for note in forecast.methodology_notes))
        self.assertTrue(any("Limited transaction history" in lim for lim in forecast.limitations))

    # -------------------------------------------------------------------------
    # 2. Only Recurring Payments (No Historical Transactions)
    # -------------------------------------------------------------------------
    def test_only_recurring_payments_deterministic_commitments(self):
        # Monthly rent of 2,000 due on 1st, weekly gym of 500 due on 10th
        r1 = RecurringPayment(
            user_id=self.user1.id,
            description="Apartment Rent",
            amount=Decimal("2000.00"),
            category="Housing",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 1),
            status="active",
        )
        r2 = RecurringPayment(
            user_id=self.user1.id,
            description="Gym Membership",
            amount=Decimal("500.00"),
            category="Health",
            frequency="weekly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 10),
            status="active",
        )
        self.db.add_all([r1, r2])
        self.db.commit()

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=3,
            ref_date=self.ref_date,
        )

        # Monthly equivalent: 2000 + round(500 * 52 / 12, 2) = 2000 + 2166.67 = 4166.67
        expected_monthly_fixed = Decimal("4166.67")

        for point in forecast.monthly_forecasts[1:]:  # future months
            self.assertEqual(point.fixed_commitments, expected_monthly_fixed)
            self.assertEqual(point.variable_estimate, Decimal("0.00"))
            self.assertEqual(point.predicted_amount, expected_monthly_fixed)

        # Categories match recurring commitments
        cats = {c.category: c.predicted_amount for c in forecast.category_forecasts}
        self.assertIn("Housing", cats)
        self.assertIn("Health", cats)
        self.assertEqual(cats["Housing"], Decimal("2000.00"))
        self.assertEqual(cats["Health"], Decimal("2166.67"))

    # -------------------------------------------------------------------------
    # 3. Double-Counting Prevention: Paid vs Pending in Current Month
    # -------------------------------------------------------------------------
    def test_prevent_double_counting_current_month_already_paid_recurring(self):
        # Active recurring payment: ₹3,000 for Internet due 2026-11-05
        rec = RecurringPayment(
            user_id=self.user1.id,
            description="Fiber Internet",
            amount=Decimal("3000.00"),
            category="Utilities",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 5),
            status="active",
        )
        # Active recurring payment: ₹2,000 for Electricity due 2026-11-25 (not yet paid)
        rec2 = RecurringPayment(
            user_id=self.user1.id,
            description="Power Bill",
            amount=Decimal("2000.00"),
            category="Utilities",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 25),
            status="active",
        )
        self.db.add_all([rec, rec2])

        # User ALREADY recorded a transaction on 2026-11-04 for the Fiber Internet
        t_paid = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc),
            description="Paid Fiber Internet bill",
            amount=Decimal("3000.00"),
            transaction_type="expense",
            category="Utilities",
        )
        self.db.add(t_paid)
        self.db.commit()

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=1,
            ref_date=self.ref_date,  # 2026-11-15
        )

        # Actual spend so far = 3,000.
        # Fiber Internet (3,000) was already paid and is counted in actual spend.
        # Power Bill (2,000) is due on 25th and NOT yet paid.
        # Therefore, pending recurring is ONLY 2,000.
        # Predicted current month spend should be actual (3000) + pending (2000) = 5000 (not 8000).
        self.assertEqual(forecast.current_month_forecast.actual_amount, Decimal("3000.00"))
        self.assertEqual(forecast.current_month_forecast.predicted_amount, Decimal("5000.00"))

    def test_unrelated_expense_not_falsely_matched_to_recurring_schedule(self):
        # Active recurring payment: ₹1,000 for "Amazon Prime" under "Subscriptions"
        prime = RecurringPayment(
            user_id=self.user1.id,
            description="Amazon Prime",
            amount=Decimal("1000.00"),
            category="Subscriptions",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 20),
            status="active",
        )
        self.db.add(prime)

        # User recorded an unrelated purchase: ₹1,000 for "Cotton Shirt" under "Shopping"
        t_unrelated = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 11, 5, 10, 0, 0, tzinfo=timezone.utc),
            description="Cotton Shirt",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add(t_unrelated)
        self.db.commit()

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=1,
            ref_date=self.ref_date,  # 2026-11-15
        )

        # The cotton shirt should NOT match Amazon Prime.
        # So actual spend = 1,000 (discretionary).
        # Amazon Prime is still pending (due Nov 20) = 1,000 (fixed commitment).
        # Because ₹1,000 variable was spent across the first 15 days, pacing projects
        # another ₹1,000 variable across the remaining 15 days.
        # Total predicted = 1,000 (actual) + 1,000 (pending recurring) + 1,000 (projected remaining variable) = 3,000.
        # If it HAD falsely matched, pending recurring would be 0 and variable would be 0 (total 1,000).
        self.assertEqual(forecast.current_month_forecast.actual_amount, Decimal("1000.00"))
        self.assertEqual(forecast.current_month_forecast.fixed_commitments, Decimal("1000.00"))
        self.assertEqual(forecast.current_month_forecast.variable_estimate, Decimal("2000.00"))
        self.assertEqual(forecast.current_month_forecast.predicted_amount, Decimal("3000.00"))

    def test_single_transaction_cannot_fulfill_multiple_recurring_schedules(self):
        # Two distinct recurring payments of identical amounts:
        # e.g. Netflix (₹500) and Spotify (₹500), both due in November
        rec1 = RecurringPayment(
            user_id=self.user1.id,
            description="Netflix Subscription",
            amount=Decimal("500.00"),
            category="Entertainment",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 18),
            status="active",
        )
        rec2 = RecurringPayment(
            user_id=self.user1.id,
            description="Spotify Subscription",
            amount=Decimal("500.00"),
            category="Entertainment",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 22),
            status="active",
        )
        self.db.add_all([rec1, rec2])

        # Only one transaction recorded for Netflix
        t_netflix = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 11, 10, 10, 0, 0, tzinfo=timezone.utc),
            description="Netflix Subscription Payment",
            amount=Decimal("500.00"),
            transaction_type="expense",
            category="Entertainment",
        )
        self.db.add(t_netflix)
        self.db.commit()

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=1,
            ref_date=self.ref_date,  # 2026-11-15
        )

        # Actual spend = 500 (Netflix).
        # Spotify (500) must remain pending, NOT fulfilled by the single Netflix transaction.
        # Predicted spend = 500 (actual) + 500 (pending Spotify) = 1,000.
        self.assertEqual(forecast.current_month_forecast.actual_amount, Decimal("500.00"))
        self.assertEqual(forecast.current_month_forecast.predicted_amount, Decimal("1000.00"))

    # -------------------------------------------------------------------------
    # 4. Double-Counting Prevention in Historical Baseline
    # -------------------------------------------------------------------------
    def test_prevent_double_counting_in_historical_baseline(self):
        # User has ₹5,000 monthly rent as active recurring payment
        rent = RecurringPayment(
            user_id=self.user1.id,
            description="Rent",
            amount=Decimal("5000.00"),
            category="Housing",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 12, 1),
            status="active",
        )
        self.db.add(rent)

        # In previous month (October 2026), user spent ₹20,000 total (which included ₹5,000 rent)
        t_rent = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 1, 10, 0, 0, tzinfo=timezone.utc),
            description="October Rent",
            amount=Decimal("5000.00"),
            transaction_type="expense",
            category="Housing",
        )
        t_var = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 15, 12, 0, 0, tzinfo=timezone.utc),
            description="Shopping and Dining",
            amount=Decimal("15000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add_all([t_rent, t_var])
        self.db.commit()

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=1,
            ref_date=self.ref_date,
        )

        # Next month (December 2026):
        # Variable spend should be 20,000 - 5,000 = 15,000.
        # Fixed recurring is 5,000.
        # Total predicted must be 5,000 + 15,000 = 20,000 (NOT 25,000).
        next_month = forecast.monthly_forecasts[1]
        self.assertEqual(next_month.month, "2026-12")
        self.assertEqual(next_month.fixed_commitments, Decimal("5000.00"))
        self.assertEqual(next_month.variable_estimate, Decimal("15000.00"))
        self.assertEqual(next_month.predicted_amount, Decimal("20000.00"))

    # -------------------------------------------------------------------------
    # 5. Three-Month Recency-Weighted Moving Average & Trend
    # -------------------------------------------------------------------------
    def test_three_month_recency_weighted_moving_average_and_trend(self):
        # Add 3 months of historical data with upward trend:
        # August 2026 (m-3): 10,000
        # September 2026 (m-2): 12,000
        # October 2026 (m-1): 14,000
        txs = [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc),
                description="August variable",
                amount=Decimal("10000.00"),
                transaction_type="expense",
                category="General",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc),
                description="September variable",
                amount=Decimal("12000.00"),
                transaction_type="expense",
                category="General",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
                description="October variable",
                amount=Decimal("14000.00"),
                transaction_type="expense",
                category="General",
            ),
        ]
        self.db.add_all(txs)
        self.db.commit()

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=3,
            ref_date=self.ref_date,
        )

        self.assertEqual(forecast.history_months_count, 3)
        # 14000 * 0.50 + 12000 * 0.33 + 10000 * 0.17 = 7000 + 3960 + 1700 = 12660
        expected_base = Decimal("12660.00")
        # Slope: (14000 - 10000) / 2 = 2000. Clamped to 20% of 12660 = 2532. So slope is 2000.
        slope = Decimal("2000.00")

        # Future month 1 (2026-12)
        m1 = forecast.monthly_forecasts[1]
        self.assertEqual(m1.month, "2026-12")
        self.assertEqual(m1.variable_estimate, expected_base + slope)

        # Future month 2 (2027-01)
        m2 = forecast.monthly_forecasts[2]
        self.assertEqual(m2.month, "2027-01")
        self.assertEqual(m2.variable_estimate, expected_base + Decimal("2") * slope)

    # -------------------------------------------------------------------------
    # 6. Outlier Winsorization
    # -------------------------------------------------------------------------
    def test_outlier_winsorization_dampens_sudden_extreme_spend(self):
        # August: 10,000, September: 75,000 (abnormal laptop purchase), October: 10,000
        # Median = 10,000. Outlier 75,000 > 2.5 * 10,000 -> winsorized to 20,000.
        txs = [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc),
                description="August regular",
                amount=Decimal("10000.00"),
                transaction_type="expense",
                category="General",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc),
                description="MacBook purchase",
                amount=Decimal("75000.00"),
                transaction_type="expense",
                category="Electronics",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
                description="October regular",
                amount=Decimal("10000.00"),
                transaction_type="expense",
                category="General",
            ),
        ]
        self.db.add_all(txs)
        self.db.commit()

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=1,
            ref_date=self.ref_date,
        )

        # Confirm outlier detection note is present
        self.assertTrue(
            any("outlier detected" in note.lower() for note in forecast.methodology_notes)
        )
        # Future forecast should be dampened (not inflated by the raw 75,000)
        # Winsorized value for Sept is 20,000: Base = 10000*0.5 + 20000*0.33 + 10000*0.17 = 5000 + 6600 + 1700 = 13300
        m1 = forecast.monthly_forecasts[1]
        self.assertLess(m1.predicted_amount, Decimal("20000.00"))

    # -------------------------------------------------------------------------
    # 7. Current Month Pacing & Closed Month Handling
    # -------------------------------------------------------------------------
    def test_closed_month_matches_actual_spend_exactly(self):
        # Reference date set to last day of month
        end_of_month = date(2026, 11, 30)

        t1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 11, 10, 10, 0, tzinfo=timezone.utc),
            description="Mid-month expense",
            amount=Decimal("7500.00"),
            transaction_type="expense",
            category="Dining",
        )
        self.db.add(t1)
        self.db.commit()

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=1,
            ref_date=end_of_month,
        )

        # On the last day, current month prediction equals actual spend exactly
        curr = forecast.current_month_forecast
        self.assertEqual(curr.actual_amount, Decimal("7500.00"))
        self.assertEqual(curr.predicted_amount, Decimal("7500.00"))
        self.assertEqual(curr.lower_bound, Decimal("7500.00"))
        self.assertEqual(curr.upper_bound, Decimal("7500.00"))

    # -------------------------------------------------------------------------
    # 8. Strict User Isolation
    # -------------------------------------------------------------------------
    def test_strict_user_data_isolation(self):
        # User 1 has massive spending and high recurring commitments
        r1 = RecurringPayment(
            user_id=self.user1.id,
            description="Luxury Villa",
            amount=Decimal("95000.00"),
            category="Housing",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 12, 1),
            status="active",
        )
        t1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="User 1 expense",
            amount=Decimal("50000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add_all([r1, t1])
        self.db.commit()

        # Query forecast for User 2 (who has no records)
        forecast_user2 = generate_financial_forecast(
            db=self.db,
            current_user=self.user2,
            horizon_months=2,
            ref_date=self.ref_date,
        )

        self.assertEqual(forecast_user2.confidence_level, "low")
        self.assertEqual(forecast_user2.current_month_forecast.predicted_amount, Decimal("0.00"))
        for m in forecast_user2.monthly_forecasts:
            self.assertEqual(m.predicted_amount, Decimal("0.00"))
            self.assertEqual(m.fixed_commitments, Decimal("0.00"))
        self.assertEqual(forecast_user2.category_forecasts, [])

    # -------------------------------------------------------------------------
    # 9. Uncertainty Envelopes & Horizon Widening
    # -------------------------------------------------------------------------
    def test_uncertainty_bounds_widen_with_forecast_horizon(self):
        # Add 3 historical months with volatility
        txs = [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc),
                amount=Decimal("8000.00"),
                transaction_type="expense",
                category="General",
                description="Aug",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc),
                amount=Decimal("16000.00"),
                transaction_type="expense",
                category="General",
                description="Sep",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
                amount=Decimal("12000.00"),
                transaction_type="expense",
                category="General",
                description="Oct",
            ),
        ]
        self.db.add_all(txs)
        self.db.commit()

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=3,
            ref_date=self.ref_date,
        )

        # Monthly forecasts: [current (m0), m+1, m+2, m+3]
        m1 = forecast.monthly_forecasts[1]
        m2 = forecast.monthly_forecasts[2]
        m3 = forecast.monthly_forecasts[3]

        # For every month, lower <= predicted <= upper
        for m in forecast.monthly_forecasts:
            self.assertLessEqual(m.lower_bound, m.predicted_amount)
            self.assertGreaterEqual(m.upper_bound, m.predicted_amount)

        # Width of envelope (upper - lower) should widen from month 1 to month 3
        spread_m1 = m1.upper_bound - m1.lower_bound
        spread_m3 = m3.upper_bound - m3.lower_bound
        self.assertGreater(spread_m3, spread_m1)

    # -------------------------------------------------------------------------
    # 10. Year-End Boundary Rollover
    # -------------------------------------------------------------------------
    def test_year_end_boundary_rollover(self):
        dec_ref_date = date(2026, 12, 10)
        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=3,
            ref_date=dec_ref_date,
        )

        months = [m.month for m in forecast.monthly_forecasts]
        self.assertEqual(months, ["2026-12", "2027-01", "2027-02", "2027-03"])
        labels = [m.month_label for m in forecast.monthly_forecasts]
        self.assertEqual(
            labels,
            ["December 2026", "January 2027", "February 2027", "March 2027"],
        )

    # -------------------------------------------------------------------------
    # 11. Leap Year Handling
    # -------------------------------------------------------------------------
    def test_leap_year_handling(self):
        leap_ref_date = date(2024, 2, 29)
        self.assertEqual(calendar.monthrange(2024, 2)[1], 29)

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=2,
            ref_date=leap_ref_date,
        )

        self.assertEqual(forecast.current_month_forecast.month, "2024-02")
        self.assertEqual(forecast.monthly_forecasts[1].month, "2024-03")
        self.assertEqual(forecast.monthly_forecasts[2].month, "2024-04")

    # -------------------------------------------------------------------------
    # 12. Category Forecast Percentages
    # -------------------------------------------------------------------------
    def test_category_forecast_percentages_sum_properly(self):
        t1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
            amount=Decimal("6000.00"),
            transaction_type="expense",
            category="Groceries",
            description="Grocery store",
        )
        t2 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 12, 12, 0, tzinfo=timezone.utc),
            amount=Decimal("4000.00"),
            transaction_type="expense",
            category="Dining",
            description="Restaurants",
        )
        self.db.add_all([t1, t2])
        self.db.commit()

        forecast = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=1,
            ref_date=self.ref_date,
        )

        cats = forecast.category_forecasts
        self.assertEqual(len(cats), 2)
        # Groceries (60%) should be first, Dining (40%) second
        self.assertEqual(cats[0].category, "Groceries")
        self.assertEqual(cats[0].percentage, 60.0)
        self.assertEqual(cats[1].category, "Dining")
        self.assertEqual(cats[1].percentage, 40.0)

    # -------------------------------------------------------------------------
    # 13. API Route Function Execution
    # -------------------------------------------------------------------------
    def test_get_forecast_route_invocation(self):
        result = get_forecast(
            horizon_months=2,
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(result.horizon_months, 2)
        self.assertEqual(result.reference_date, self.ref_date)
        self.assertEqual(len(result.monthly_forecasts), 3)

    # -------------------------------------------------------------------------
    # 14. First-of-Month Calendar Date Boundary & Determinism Regression Test
    # -------------------------------------------------------------------------
    def test_first_of_month_calendar_date_inclusion_and_determinism(self):
        # October baseline expenses: 2,800.00
        t_oct = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 15, 14, 0, tzinfo=timezone.utc),
            amount=Decimal("2800.00"),
            transaction_type="expense",
            category="Other",
            description="October expenses",
        )
        # November 1 expenses (at midnight boundary): 500, 300, 1000 = 1,800.00
        t_nov1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc),
            amount=Decimal("500.00"),
            transaction_type="expense",
            category="Food/Dining",
            description="Nov Food",
        )
        t_nov2 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc),
            amount=Decimal("300.00"),
            transaction_type="expense",
            category="Transport",
            description="Nov Bus",
        )
        t_nov3 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc),
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Shopping",
            description="Nov Shopping",
        )
        # November 1 income: 20,000.00 (must be excluded from expense totals)
        t_nov_inc = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc),
            amount=Decimal("20000.00"),
            transaction_type="income",
            category="Income",
            description="Nov Salary",
        )
        self.db.add_all([t_oct, t_nov1, t_nov2, t_nov3, t_nov_inc])
        self.db.commit()

        # Forecast requested on Nov 2 (day 2 of 30, 28 days remaining)
        ref_d = date(2026, 11, 2)
        res1 = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=3,
            ref_date=ref_d,
        )
        # Run second time on identical state to verify determinism
        res2 = generate_financial_forecast(
            db=self.db,
            current_user=self.user1,
            horizon_months=3,
            ref_date=ref_d,
        )

        # 1. Determinism
        self.assertEqual(res1.model_dump(), res2.model_dump())

        # 2. Actual spending MTD in November must be exactly 1,800.00
        curr_pt = res1.current_month_forecast
        self.assertEqual(curr_pt.actual_amount, Decimal("1800.00"))

        # 3. Oct baseline = 2,800 / 30 = 93.3333/day. Remaining 28 days = round(93.3333 * 28, 2) = 2,613.33.
        # Predicted = 1,800 (actual) + 2,613.33 (variable pace) = 4,413.33.
        self.assertEqual(curr_pt.predicted_amount, Decimal("4413.33"))
        self.assertEqual(curr_pt.fixed_commitments, Decimal("0.00"))
        self.assertEqual(curr_pt.variable_estimate, Decimal("4413.33"))


if __name__ == "__main__":
    unittest.main()

