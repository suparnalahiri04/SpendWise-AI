from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.dependencies import get_db
from app.insights import (
    MIN_ANOMALY_BASELINE_COUNT,
    detect_unusual_expenses,
    generate_budget_insights,
    generate_recurring_insights,
    get_financial_insights,
    get_month_datetime_range,
    get_previous_month,
    slugify_category,
)
from app.main import app
from app.models import Base, Budget, RecurringPayment, Transaction, User


class FinancialInsightsTestCase(unittest.TestCase):
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

        self.user1 = User(id=1, email="user1@example.com", password_hash="hash1")
        self.user2 = User(id=2, email="user2@example.com", password_hash="hash2")
        self.db.add_all([self.user1, self.user2])
        self.db.commit()

        # Fixed reference date in October 2026
        self.ref_date = date(2026, 10, 10)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_helpers_month_and_boundaries(self):
        # Normal previous month
        self.assertEqual(get_previous_month("2026-10"), "2026-09")
        # Year boundary previous month
        self.assertEqual(get_previous_month("2026-01"), "2025-12")

        # Range for October
        start_dt, end_dt = get_month_datetime_range("2026-10")
        self.assertEqual(start_dt, datetime(2026, 10, 1, 0, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(end_dt, datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc))

        # Range for December across year boundary
        dec_start, dec_end = get_month_datetime_range("2026-12")
        self.assertEqual(dec_start, datetime(2026, 12, 1, 0, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(dec_end, datetime(2027, 1, 1, 0, 0, 0, tzinfo=timezone.utc))

    def test_empty_account(self):
        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        summary = res.summary
        self.assertEqual(summary.current_month, "2026-10")
        self.assertEqual(summary.total_spent_current_month, Decimal("0.00"))
        self.assertIsNone(summary.total_spent_previous_month)
        self.assertIsNone(summary.month_over_month_change_pct)
        self.assertIsNone(summary.savings_rate_percentage)
        self.assertIsNone(summary.fixed_commitment_ratio)
        self.assertEqual(summary.projected_month_end_expense, Decimal("0.00"))
        self.assertEqual(res.insights, [])

    def test_zero_income_and_no_division_by_zero(self):
        t1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="Groceries",
            amount=Decimal("3500.00"),
            transaction_type="expense",
            category="Groceries",
        )
        self.db.add(t1)
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        summary = res.summary
        self.assertEqual(summary.total_spent_current_month, Decimal("3500.00"))
        # With zero income, rates must be None, not crash or infinity
        self.assertIsNone(summary.savings_rate_percentage)
        self.assertIsNone(summary.fixed_commitment_ratio)

    def test_month_over_month_comparison(self):
        # Previous month (September 2026) expense
        t_prev = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 15, 10, 0, tzinfo=timezone.utc),
            description="September Groceries",
            amount=Decimal("5000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        # Current month (October 2026) expense: 6000.00 (+20%)
        t_curr = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 8, 11, 0, tzinfo=timezone.utc),
            description="October Groceries",
            amount=Decimal("6000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        self.db.add_all([t_prev, t_curr])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        summary = res.summary
        self.assertEqual(summary.total_spent_previous_month, Decimal("5000.00"))
        self.assertEqual(summary.total_spent_current_month, Decimal("6000.00"))
        self.assertEqual(summary.month_over_month_change_pct, 20.0)

        # Check that month-over-month insight was generated
        insight_ids = [i.id for i in res.insights]
        self.assertIn("mom-spending-2026-10", insight_ids)
        mom_item = next(i for i in res.insights if i.id == "mom-spending-2026-10")
        self.assertEqual(mom_item.severity, "warning")
        self.assertEqual(mom_item.metric_label, "+20.0%")

    def test_savings_rate_and_fixed_commitment_ratio(self):
        # Current month income: 50,000.00
        t_income = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="Salary",
            amount=Decimal("50000.00"),
            transaction_type="income",
            category="Income",
        )
        # Current month expenses: 30,000.00 -> Net savings: 20,000.00 -> 40.0%
        t_expense = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 14, 0, tzinfo=timezone.utc),
            description="Various Expenses",
            amount=Decimal("30000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        # Active recurring payment: 10,000.00 monthly -> Fixed commitment: 20.0%
        rec = RecurringPayment(
            user_id=self.user1.id,
            description="Apartment Rent",
            amount=Decimal("10000.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 10, 1),
            next_due_date=date(2026, 11, 1),
            status="active",
            is_active=True,
        )
        self.db.add_all([t_income, t_expense, rec])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        summary = res.summary
        self.assertEqual(summary.savings_rate_percentage, 40.0)
        self.assertEqual(summary.fixed_commitment_ratio, 20.0)

        # Check savings rate insight card
        savings_item = next(i for i in res.insights if i.id == "savings-rate-2026-10")
        self.assertEqual(savings_item.severity, "positive")
        self.assertEqual(savings_item.metric_label, "40.0%")

    def test_projected_month_end_expense(self):
        # On Oct 10 (day 10 of 31), user spent 10,000.00 -> Projected: (10000 / 10) * 31 = 31,000.00
        t1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc),
            description="First 10 days spend",
            amount=Decimal("10000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add(t1)
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=date(2026, 10, 10),
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(res.summary.projected_month_end_expense, Decimal("31000.00"))

        # On last day of the month (Oct 31), projection matches actual current spend
        res_end = get_financial_insights(
            month="2026-10",
            ref_date=date(2026, 10, 31),
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(res_end.summary.projected_month_end_expense, Decimal("10000.00"))

    def test_date_boundaries_exclusion(self):
        # Transaction on Sep 30 23:59:59 (prior to Oct 1)
        t_sep = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 30, 23, 59, 59, tzinfo=timezone.utc),
            description="Late Sep Coffee",
            amount=Decimal("200.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        # Transaction on Oct 1 00:00:00 (inside Oct)
        t_oct = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 1, 0, 0, 0, tzinfo=timezone.utc),
            description="Early Oct Coffee",
            amount=Decimal("250.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        # Transaction on Nov 1 00:00:00 (boundary of next month -> excluded from Oct)
        t_nov = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc),
            description="Nov Coffee",
            amount=Decimal("300.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        self.db.add_all([t_sep, t_oct, t_nov])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(res.summary.total_spent_current_month, Decimal("250.00"))
        self.assertEqual(res.summary.total_spent_previous_month, Decimal("200.00"))

    def test_strict_user_isolation(self):
        # User 1 has 1,000.00 expense in Oct
        t_u1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="User 1 Coffee",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        # User 2 has 50,000.00 expense and 100,000.00 income
        t_u2_exp = Transaction(
            user_id=self.user2.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="User 2 Luxury",
            amount=Decimal("50000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        t_u2_inc = Transaction(
            user_id=self.user2.id,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="User 2 Big Income",
            amount=Decimal("100000.00"),
            transaction_type="income",
            category="Income",
        )
        # User 2 has recurring payment
        rec_u2 = RecurringPayment(
            user_id=self.user2.id,
            description="User 2 Villa",
            amount=Decimal("25000.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 10, 1),
            next_due_date=date(2026, 11, 1),
            status="active",
            is_active=True,
        )
        self.db.add_all([t_u1, t_u2_exp, t_u2_inc, rec_u2])
        self.db.commit()

        # User 1 insights MUST NOT contain any of User 2's data
        res_u1 = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(res_u1.summary.total_spent_current_month, Decimal("1000.00"))
        self.assertIsNone(res_u1.summary.savings_rate_percentage)
        self.assertIsNone(res_u1.summary.fixed_commitment_ratio)

        # User 2 insights contains User 2's data only
        res_u2 = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user2,
            db=self.db,
        )
        self.assertEqual(res_u2.summary.total_spent_current_month, Decimal("50000.00"))
        self.assertEqual(res_u2.summary.savings_rate_percentage, 50.0)
        self.assertEqual(res_u2.summary.fixed_commitment_ratio, 25.0)

    def test_slugify_category(self):
        self.assertEqual(slugify_category("Dining"), "dining")
        self.assertEqual(slugify_category("Food/Dining"), "food-dining")
        self.assertEqual(slugify_category("Bills & Utilities"), "bills-utilities")
        self.assertEqual(slugify_category("   "), "other")
        self.assertEqual(slugify_category(None), "other")

    def test_category_increase(self):
        # Sep: Dining = 2,000.00
        t_prev = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc),
            description="Dinner out",
            amount=Decimal("2000.00"),
            transaction_type="expense",
            category="Dining",
        )
        # Oct: Dining = 3,500.00 (+1,500.00, +75.0%)
        t_curr = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 10, 19, 0, tzinfo=timezone.utc),
            description="Fancy Dinners",
            amount=Decimal("3500.00"),
            transaction_type="expense",
            category="Dining",
        )
        self.db.add_all([t_prev, t_curr])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        insight_map = {i.id: i for i in res.insights}
        self.assertIn("cat-increase-dining-2026-10", insight_map)

        item = insight_map["cat-increase-dining-2026-10"]
        self.assertEqual(item.type, "pattern")
        self.assertEqual(item.severity, "warning")
        self.assertEqual(item.category, "Dining")
        self.assertEqual(item.amount, Decimal("1500.00"))
        self.assertEqual(item.metric_label, "+75.0%")
        self.assertIn("₹1,500.00", item.description)
        self.assertIn("+75.0%", item.description)

    def test_category_decrease(self):
        # Sep: Shopping = 5,000.00, Entertainment = 1,000.00
        t_prev1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 12, 14, 0, tzinfo=timezone.utc),
            description="Clothes Shopping",
            amount=Decimal("5000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        t_prev2 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 18, 20, 0, tzinfo=timezone.utc),
            description="Movies & Concert",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Entertainment",
        )
        # Oct: Shopping = 2,000.00 (-3,000.00, -60.0%), Entertainment = 0 (dropped to zero)
        t_curr = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 16, 0, tzinfo=timezone.utc),
            description="Light Shopping",
            amount=Decimal("2000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add_all([t_prev1, t_prev2, t_curr])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        insight_map = {i.id: i for i in res.insights}

        # Partial decrease
        self.assertIn("cat-decrease-shopping-2026-10", insight_map)
        item_shop = insight_map["cat-decrease-shopping-2026-10"]
        self.assertEqual(item_shop.type, "pattern")
        self.assertEqual(item_shop.severity, "positive")
        self.assertEqual(item_shop.category, "Shopping")
        self.assertEqual(item_shop.amount, Decimal("3000.00"))
        self.assertEqual(item_shop.metric_label, "-60.0%")
        self.assertIn("₹3,000.00", item_shop.description)

        # Spending stopped completely (-100%)
        self.assertIn("cat-decrease-entertainment-2026-10", insight_map)
        item_ent = insight_map["cat-decrease-entertainment-2026-10"]
        self.assertEqual(item_ent.type, "pattern")
        self.assertEqual(item_ent.severity, "positive")
        self.assertEqual(item_ent.category, "Entertainment")
        self.assertEqual(item_ent.amount, Decimal("1000.00"))
        self.assertEqual(item_ent.metric_label, "-100.0%")
        self.assertIn("₹1,000.00", item_ent.description)

    def test_unchanged_categories(self):
        # Sep: Rent = 15,000.00, Utilities = 2,000.00
        t_prev1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc),
            description="Sep Rent",
            amount=Decimal("15000.00"),
            transaction_type="expense",
            category="Rent",
        )
        t_prev2 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 5, 10, 0, tzinfo=timezone.utc),
            description="Sep Power",
            amount=Decimal("2000.00"),
            transaction_type="expense",
            category="Utilities",
        )
        # Oct: Rent = 15,000.00 (identical), Utilities = 2,500.00 (+500.00)
        t_curr1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="Oct Rent",
            amount=Decimal("15000.00"),
            transaction_type="expense",
            category="Rent",
        )
        t_curr2 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc),
            description="Oct Power",
            amount=Decimal("25000.00"),
            transaction_type="expense",
            category="Utilities",
        )
        self.db.add_all([t_prev1, t_prev2, t_curr1, t_curr2])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        insight_map = {i.id: i for i in res.insights}

        # Utilities should have an increase insight
        self.assertIn("cat-increase-utilities-2026-10", insight_map)

        # Rent is unchanged: must NOT generate increase or decrease insight
        self.assertNotIn("cat-increase-rent-2026-10", insight_map)
        self.assertNotIn("cat-decrease-rent-2026-10", insight_map)
        rent_items = [i for i in res.insights if i.category == "Rent"]
        self.assertEqual(rent_items, [])

    def test_zero_previous_month_baseline(self):
        # Sep: User had Groceries expense
        t_prev = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 20, 11, 0, tzinfo=timezone.utc),
            description="Sep Groceries",
            amount=Decimal("4000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        # Oct: User has a brand new category (Travel = 8,000.00) with 0 in Sep
        t_curr1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 2, 11, 0, tzinfo=timezone.utc),
            description="Oct Groceries",
            amount=Decimal("4000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        t_curr2 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc),
            description="Flight Tickets",
            amount=Decimal("8000.00"),
            transaction_type="expense",
            category="Travel",
        )
        self.db.add_all([t_prev, t_curr1, t_curr2])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        insight_map = {i.id: i for i in res.insights}

        self.assertIn("cat-new-travel-2026-10", insight_map)
        travel_item = insight_map["cat-new-travel-2026-10"]
        self.assertEqual(travel_item.type, "pattern")
        self.assertEqual(travel_item.severity, "info")
        self.assertEqual(travel_item.category, "Travel")
        self.assertEqual(travel_item.amount, Decimal("8000.00"))
        # Percentage change cannot be computed against zero baseline, so metric_label is None
        self.assertIsNone(travel_item.metric_label)
        self.assertIn("₹8,000.00", travel_item.description)

    def test_no_prior_month_data(self):
        # User has current month expenses, but NO transactions in September
        t_curr1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 3, 10, 0, tzinfo=timezone.utc),
            description="Groceries",
            amount=Decimal("3000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        t_curr2 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 4, 15, 0, tzinfo=timezone.utc),
            description="Shopping",
            amount=Decimal("2000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add_all([t_curr1, t_curr2])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        # Prior month spend and change must be None
        self.assertIsNone(res.summary.total_spent_previous_month)
        self.assertIsNone(res.summary.month_over_month_change_pct)

        # No misleading category comparison cards should be created
        category_insights = [i for i in res.insights if i.category is not None]
        self.assertEqual(category_insights, [])

    def test_user_isolation_category_insights(self):
        # User 1 has Groceries increase (+1,000.00)
        u1_prev = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc),
            description="U1 Groceries Sep",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        u1_curr = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="U1 Groceries Oct",
            amount=Decimal("2000.00"),
            transaction_type="expense",
            category="Groceries",
        )

        # User 2 has Groceries decrease (-5,000.00) and Luxury new (+50,000.00)
        u2_prev = Transaction(
            user_id=self.user2.id,
            transaction_date=datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc),
            description="U2 Groceries Sep",
            amount=Decimal("10000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        u2_curr1 = Transaction(
            user_id=self.user2.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="U2 Groceries Oct",
            amount=Decimal("5000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        u2_curr2 = Transaction(
            user_id=self.user2.id,
            transaction_date=datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc),
            description="U2 Luxury Watch",
            amount=Decimal("50000.00"),
            transaction_type="expense",
            category="Luxury",
        )
        self.db.add_all([u1_prev, u1_curr, u2_prev, u2_curr1, u2_curr2])
        self.db.commit()

        # Check User 1 insights
        res1 = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        u1_ids = [i.id for i in res1.insights]
        self.assertIn("cat-increase-groceries-2026-10", u1_ids)
        self.assertNotIn("cat-decrease-groceries-2026-10", u1_ids)
        self.assertNotIn("cat-new-luxury-2026-10", u1_ids)

        # Check User 2 insights
        res2 = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user2,
            db=self.db,
        )
        u2_ids = [i.id for i in res2.insights]
        self.assertIn("cat-decrease-groceries-2026-10", u2_ids)
        self.assertIn("cat-new-luxury-2026-10", u2_ids)
        self.assertNotIn("cat-increase-groceries-2026-10", u2_ids)

    def test_income_excluded_from_category_comparisons(self):
        # Sep: Expense in Groceries = 1,000.00
        t_prev_exp = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 10, 10, 0, tzinfo=timezone.utc),
            description="Sep Food",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        # Oct: Expense in Groceries = 1,500.00 (+500.00, +50%)
        t_curr_exp = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 10, 10, 0, tzinfo=timezone.utc),
            description="Oct Food",
            amount=Decimal("1500.00"),
            transaction_type="expense",
            category="Groceries",
        )
        # Oct: Income with category="Groceries" = 20,000.00 (refund or miscategorized)
        t_curr_inc1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 12, 10, 0, tzinfo=timezone.utc),
            description="Groceries Refund/Cashback",
            amount=Decimal("20000.00"),
            transaction_type="income",
            category="Groceries",
        )
        # Oct: Income with category="Salary" = 80,000.00
        t_curr_inc2 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="Monthly Paycheck",
            amount=Decimal("80000.00"),
            transaction_type="income",
            category="Salary",
        )
        self.db.add_all([t_prev_exp, t_curr_exp, t_curr_inc1, t_curr_inc2])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        insight_map = {i.id: i for i in res.insights}

        # Groceries increase must be calculated solely on expenses (1,500 vs 1,000 -> +500, +50%)
        self.assertIn("cat-increase-groceries-2026-10", insight_map)
        item = insight_map["cat-increase-groceries-2026-10"]
        self.assertEqual(item.amount, Decimal("500.00"))
        self.assertEqual(item.metric_label, "+50.0%")

        # Salary income must NOT be present as an expense category insight
        salary_items = [i for i in res.insights if i.category == "Salary"]
        self.assertEqual(salary_items, [])

    def test_genuine_high_value_outlier(self):
        # 4 historical baseline transactions in Dining around ₹500
        t_base = [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc),
                description="Lunch 1",
                amount=Decimal("500.00"),
                transaction_type="expense",
                category="Dining",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 12, 13, 0, tzinfo=timezone.utc),
                description="Lunch 2",
                amount=Decimal("520.00"),
                transaction_type="expense",
                category="Dining",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 20, 19, 0, tzinfo=timezone.utc),
                description="Dinner 1",
                amount=Decimal("480.00"),
                transaction_type="expense",
                category="Dining",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 28, 20, 0, tzinfo=timezone.utc),
                description="Dinner 2",
                amount=Decimal("500.00"),
                transaction_type="expense",
                category="Dining",
            ),
        ]
        # Current month: a 10x outlier of ₹5,000 on Oct 10
        t_outlier = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 10, 21, 0, tzinfo=timezone.utc),
            description="Luxury Banquet",
            amount=Decimal("5000.00"),
            transaction_type="expense",
            category="Dining",
        )
        self.db.add_all(t_base + [t_outlier])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        anomalies = [i for i in res.insights if i.type == "anomaly"]
        self.assertEqual(len(anomalies), 1)

        anomaly = anomalies[0]
        self.assertEqual(anomaly.id, f"anomaly-tx-{t_outlier.id}-2026-10")
        self.assertEqual(anomaly.severity, "warning")
        self.assertEqual(anomaly.category, "Dining")
        self.assertEqual(anomaly.amount, Decimal("5000.00"))
        self.assertEqual(anomaly.date, date(2026, 10, 10))
        self.assertIn("Dining", anomaly.title)
        self.assertIn("₹5,000.00", anomaly.description)
        self.assertIn("2026-10-10", anomaly.description)
        self.assertIn("Dining", anomaly.description)
        self.assertIn("+900%", anomaly.metric_label)

    def test_ordinary_transactions_not_flagged_as_anomaly(self):
        # 4 historical baseline transactions in Dining around ₹500
        t_base = [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc),
                description="Lunch 1",
                amount=Decimal("500.00"),
                transaction_type="expense",
                category="Dining",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 12, 13, 0, tzinfo=timezone.utc),
                description="Lunch 2",
                amount=Decimal("520.00"),
                transaction_type="expense",
                category="Dining",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 20, 19, 0, tzinfo=timezone.utc),
                description="Dinner 1",
                amount=Decimal("480.00"),
                transaction_type="expense",
                category="Dining",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 28, 20, 0, tzinfo=timezone.utc),
                description="Dinner 2",
                amount=Decimal("500.00"),
                transaction_type="expense",
                category="Dining",
            ),
        ]
        # Current month: ordinary transaction of ₹530 (within normal variation)
        t_normal = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
            description="Regular Lunch",
            amount=Decimal("530.00"),
            transaction_type="expense",
            category="Dining",
        )
        self.db.add_all(t_base + [t_normal])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        anomalies = [i for i in res.insights if i.type == "anomaly"]
        self.assertEqual(anomalies, [])

    def test_insufficient_history_suppresses_anomaly_alert(self):
        # Only 2 baseline observations (< MIN_ANOMALY_BASELINE_COUNT = 3)
        t_base = [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc),
                description="Lunch 1",
                amount=Decimal("500.00"),
                transaction_type="expense",
                category="Dining",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 12, 13, 0, tzinfo=timezone.utc),
                description="Lunch 2",
                amount=Decimal("520.00"),
                transaction_type="expense",
                category="Dining",
            ),
        ]
        # High value transaction in current month
        t_large = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 10, 20, 0, tzinfo=timezone.utc),
            description="Expensive Meal",
            amount=Decimal("10000.00"),
            transaction_type="expense",
            category="Dining",
        )
        self.db.add_all(t_base + [t_large])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        # Should not alert when history is insufficient (< 3 observations)
        anomalies = [i for i in res.insights if i.type == "anomaly"]
        self.assertEqual(anomalies, [])

    def test_zero_variance_history_handled_safely(self):
        # 3 baseline transactions with identical amount (variance = 0, std_dev = 0)
        t_base = [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc),
                description="Monthly Service 1",
                amount=Decimal("200.00"),
                transaction_type="expense",
                category="Subscriptions",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 10, 10, 0, tzinfo=timezone.utc),
                description="Monthly Service 2",
                amount=Decimal("200.00"),
                transaction_type="expense",
                category="Subscriptions",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 20, 10, 0, tzinfo=timezone.utc),
                description="Monthly Service 3",
                amount=Decimal("200.00"),
                transaction_type="expense",
                category="Subscriptions",
            ),
        ]
        # Current month: a 5x outlier of ₹1,000 in Subscriptions
        t_outlier = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc),
            description="Annual Pass Upgrade",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Subscriptions",
        )
        # Current month: another ordinary ₹200 transaction
        t_normal = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc),
            description="Normal Subscription",
            amount=Decimal("200.00"),
            transaction_type="expense",
            category="Subscriptions",
        )
        self.db.add_all(t_base + [t_outlier, t_normal])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        anomalies = [i for i in res.insights if i.type == "anomaly"]
        self.assertEqual(len(anomalies), 1)

        anomaly = anomalies[0]
        self.assertEqual(anomaly.id, f"anomaly-tx-{t_outlier.id}-2026-10")
        self.assertEqual(anomaly.amount, Decimal("1000.00"))
        self.assertEqual(anomaly.category, "Subscriptions")
        self.assertIn("fixed baseline", anomaly.description)

    def test_income_exclusion_from_anomaly_detection(self):
        # 4 salary transactions
        t_base = [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
                description="July Salary",
                amount=Decimal("50000.00"),
                transaction_type="income",
                category="Salary",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc),
                description="August Salary",
                amount=Decimal("50000.00"),
                transaction_type="income",
                category="Salary",
            ),
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc),
                description="September Salary",
                amount=Decimal("50000.00"),
                transaction_type="income",
                category="Salary",
            ),
        ]
        # Huge bonus income in current month (₹500,000)
        t_bonus = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="Annual Mega Bonus",
            amount=Decimal("500000.00"),
            transaction_type="income",
            category="Salary",
        )
        self.db.add_all(t_base + [t_bonus])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        # Income must never trigger an expense anomaly alert
        anomalies = [i for i in res.insights if i.type == "anomaly"]
        self.assertEqual(anomalies, [])

    def test_selected_month_boundaries_for_anomalies(self):
        # Baseline in August (4 transactions)
        t_base = [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 8, d, 12, 0, tzinfo=timezone.utc),
                description=f"Aug Lunch {d}",
                amount=Decimal("500.00"),
                transaction_type="expense",
                category="Dining",
            )
            for d in (5, 12, 19, 26)
        ]
        # Outlier in September (prior month)
        t_sep_outlier = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 20, 19, 0, tzinfo=timezone.utc),
            description="Sep Big Dinner",
            amount=Decimal("6000.00"),
            transaction_type="expense",
            category="Dining",
        )
        # Outlier in November (next month)
        t_nov_outlier = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 11, 5, 19, 0, tzinfo=timezone.utc),
            description="Nov Big Dinner",
            amount=Decimal("7000.00"),
            transaction_type="expense",
            category="Dining",
        )
        # Normal transaction in October (current month)
        t_oct_normal = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
            description="Oct Normal Lunch",
            amount=Decimal("510.00"),
            transaction_type="expense",
            category="Dining",
        )
        self.db.add_all(t_base + [t_sep_outlier, t_nov_outlier, t_oct_normal])
        self.db.commit()

        # Querying October 2026 must NOT report Sep or Nov outliers as October anomalies
        res_oct = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        oct_anomalies = [i for i in res_oct.insights if i.type == "anomaly"]
        self.assertEqual(oct_anomalies, [])

        # Querying September 2026 DOES report the September outlier
        res_sep = get_financial_insights(
            month="2026-09",
            ref_date=date(2026, 9, 25),
            current_user=self.user1,
            db=self.db,
        )
        sep_anomalies = [i for i in res_sep.insights if i.type == "anomaly"]
        self.assertEqual(len(sep_anomalies), 1)
        self.assertEqual(sep_anomalies[0].amount, Decimal("6000.00"))

    def test_strict_user_isolation_for_anomalies(self):
        # User 1 has normal baseline and normal current spend
        u1_txs = [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 9, d, 12, 0, tzinfo=timezone.utc),
                description=f"U1 Shopping {d}",
                amount=Decimal("500.00"),
                transaction_type="expense",
                category="Shopping",
            )
            for d in (5, 12, 19, 26)
        ] + [
            Transaction(
                user_id=self.user1.id,
                transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
                description="U1 Regular Shopping",
                amount=Decimal("510.00"),
                transaction_type="expense",
                category="Shopping",
            )
        ]

        # User 2 has baseline and a massive outlier in October
        u2_txs = [
            Transaction(
                user_id=self.user2.id,
                transaction_date=datetime(2026, 9, d, 12, 0, tzinfo=timezone.utc),
                description=f"U2 Shopping {d}",
                amount=Decimal("500.00"),
                transaction_type="expense",
                category="Shopping",
            )
            for d in (5, 12, 19, 26)
        ] + [
            Transaction(
                user_id=self.user2.id,
                transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
                description="U2 Luxury Spree",
                amount=Decimal("25000.00"),
                transaction_type="expense",
                category="Shopping",
            )
        ]
        self.db.add_all(u1_txs + u2_txs)
        self.db.commit()

        # User 1 must have ZERO anomalies
        res_u1 = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        u1_anomalies = [i for i in res_u1.insights if i.type == "anomaly"]
        self.assertEqual(u1_anomalies, [])

        # User 2 must have 1 anomaly for User 2's transaction
        res_u2 = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user2,
            db=self.db,
        )
        u2_anomalies = [i for i in res_u2.insights if i.type == "anomaly"]
        self.assertEqual(len(u2_anomalies), 1)
        self.assertEqual(u2_anomalies[0].amount, Decimal("25000.00"))

    def test_budget_threshold_approaching_limit(self):
        # Budget: Dining = ₹5,000 for 2026-10
        b_dining = Budget(
            user_id=self.user1.id,
            category="Dining",
            month="2026-10",
            limit_amount=Decimal("5000.00"),
        )
        # Expense: Dining = ₹4,200 (84.0% used, >= 80% and < 100%)
        t_dining = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="Lunches & Dinners",
            amount=Decimal("4200.00"),
            transaction_type="expense",
            category="Dining",
        )
        self.db.add_all([b_dining, t_dining])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        insight_map = {i.id: i for i in res.insights}
        self.assertIn("budget-warning-dining-2026-10", insight_map)

        item = insight_map["budget-warning-dining-2026-10"]
        self.assertEqual(item.type, "recommendation")
        self.assertEqual(item.severity, "warning")
        self.assertEqual(item.title, "Approaching budget limit: Dining")
        self.assertEqual(item.category, "Dining")
        self.assertEqual(item.amount, Decimal("4200.00"))
        self.assertEqual(item.metric_label, "84.0%")
        self.assertIn("₹4,200.00", item.description)
        self.assertIn("₹5,000.00", item.description)

    def test_budget_threshold_over_budget(self):
        # Budget: Shopping = ₹3,000 for 2026-10
        b_shopping = Budget(
            user_id=self.user1.id,
            category="Shopping",
            month="2026-10",
            limit_amount=Decimal("3000.00"),
        )
        # Expense: Shopping = ₹3,600 (120.0% used, >= 100%)
        t_shopping = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 6, 15, 0, tzinfo=timezone.utc),
            description="Autumn Clothes",
            amount=Decimal("3600.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add_all([b_shopping, t_shopping])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        insight_map = {i.id: i for i in res.insights}
        self.assertIn("budget-exceeded-shopping-2026-10", insight_map)

        item = insight_map["budget-exceeded-shopping-2026-10"]
        self.assertEqual(item.type, "recommendation")
        self.assertEqual(item.severity, "critical")
        self.assertEqual(item.title, "Budget exceeded: Shopping")
        self.assertEqual(item.category, "Shopping")
        self.assertEqual(item.amount, Decimal("3600.00"))
        self.assertEqual(item.metric_label, "120.0%")
        self.assertIn("₹3,600.00", item.description)
        self.assertIn("₹3,000.00", item.description)

    def test_missing_budget_generates_no_alert(self):
        # Expense in Travel = ₹15,000 (no budget for Travel exists)
        t_travel = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="Flight Tickets",
            amount=Decimal("15000.00"),
            transaction_type="expense",
            category="Travel",
        )
        # Budget for Groceries = ₹5,000, spent only ₹2,000 (40% < 80%)
        b_groceries = Budget(
            user_id=self.user1.id,
            category="Groceries",
            month="2026-10",
            limit_amount=Decimal("5000.00"),
        )
        t_groceries = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="Groceries",
            amount=Decimal("2000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        self.db.add_all([t_travel, b_groceries, t_groceries])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        # No budget alerts should be generated (neither for Travel without a budget, nor for Groceries under 80%)
        budget_alerts = [i for i in res.insights if i.id.startswith("budget-")]
        self.assertEqual(budget_alerts, [])

    def test_income_exclusion_from_budget_alerts(self):
        # Budget for Groceries = ₹5,000
        b_groceries = Budget(
            user_id=self.user1.id,
            category="Groceries",
            month="2026-10",
            limit_amount=Decimal("5000.00"),
        )
        # Expense: Groceries = ₹2,000 (40% used, safely under 80%)
        t_expense = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc),
            description="Weekly Groceries",
            amount=Decimal("2000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        # Income: Groceries = ₹10,000 (e.g. cashback or refund transaction)
        t_income = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 6, 10, 0, tzinfo=timezone.utc),
            description="Big Cashback",
            amount=Decimal("10000.00"),
            transaction_type="income",
            category="Groceries",
        )
        self.db.add_all([b_groceries, t_expense, t_income])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        # Income must not count towards expense budget calculations
        budget_alerts = [i for i in res.insights if i.id.startswith("budget-")]
        self.assertEqual(budget_alerts, [])

    def test_inactive_and_cancelled_recurring_schedules_ignored(self):
        # Cancelled schedule past due
        r_cancelled = RecurringPayment(
            user_id=self.user1.id,
            description="Old Magazine",
            amount=Decimal("300.00"),
            category="Entertainment",
            frequency="monthly",
            start_date=date(2026, 9, 1),
            next_due_date=date(2026, 10, 5),  # 5 days past ref_date (Oct 10)
            status="cancelled",
            is_active=False,
        )
        # Inactive schedule upcoming
        r_inactive = RecurringPayment(
            user_id=self.user1.id,
            description="Paused Gym",
            amount=Decimal("1500.00"),
            category="Health/Medical",
            frequency="monthly",
            start_date=date(2026, 9, 1),
            next_due_date=date(2026, 10, 15),  # 5 days after ref_date
            status="active",
            is_active=False,
        )
        self.db.add_all([r_cancelled, r_inactive])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        recurring_alerts = [i for i in res.insights if i.id.startswith("recurring-")]
        self.assertEqual(recurring_alerts, [])

    def test_recurring_upcoming_and_overdue_alerts(self):
        # Ref date: Oct 10, 2026
        # Active overdue payment: due Oct 4 (6 days overdue)
        r_overdue = RecurringPayment(
            user_id=self.user1.id,
            description="Fiber Internet",
            amount=Decimal("1200.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 9, 4),
            next_due_date=date(2026, 10, 4),
            status="active",
            is_active=True,
        )
        # Active upcoming payment: due Oct 15 (5 days in future)
        r_upcoming = RecurringPayment(
            user_id=self.user1.id,
            description="Gym Membership",
            amount=Decimal("2500.00"),
            category="Health/Medical",
            frequency="monthly",
            start_date=date(2026, 9, 15),
            next_due_date=date(2026, 10, 15),
            status="active",
            is_active=True,
        )
        self.db.add_all([r_overdue, r_upcoming])
        self.db.commit()

        res = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        insight_map = {i.id: i for i in res.insights}

        # Check overdue alert
        overdue_id = f"recurring-overdue-{r_overdue.id}-2026-10"
        self.assertIn(overdue_id, insight_map)
        item_od = insight_map[overdue_id]
        self.assertEqual(item_od.severity, "warning")
        self.assertEqual(item_od.amount, Decimal("1200.00"))
        self.assertEqual(item_od.metric_label, "6d overdue")
        self.assertEqual(item_od.date, date(2026, 10, 4))
        self.assertIn("does not confirm actual debit", item_od.description)

        # Check upcoming alert
        upcoming_id = f"recurring-upcoming-{r_upcoming.id}-2026-10"
        self.assertIn(upcoming_id, insight_map)
        item_uc = insight_map[upcoming_id]
        self.assertEqual(item_uc.severity, "info")
        self.assertEqual(item_uc.amount, Decimal("2500.00"))
        self.assertEqual(item_uc.metric_label, "in 5d")
        self.assertEqual(item_uc.date, date(2026, 10, 15))
        self.assertIn("does not confirm payment execution", item_uc.description)

    def test_user_isolation_budget_and_recurring_insights(self):
        # User 1: Budget Dining = 5,000, spent 4,500 (90% warning)
        b_u1 = Budget(
            user_id=self.user1.id,
            category="Dining",
            month="2026-10",
            limit_amount=Decimal("5000.00"),
        )
        t_u1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="U1 Dinners",
            amount=Decimal("4500.00"),
            transaction_type="expense",
            category="Dining",
        )
        r_u1 = RecurringPayment(
            user_id=self.user1.id,
            description="U1 Water Bill",
            amount=Decimal("600.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 9, 14),
            next_due_date=date(2026, 10, 14),  # upcoming in 4 days
            status="active",
            is_active=True,
        )

        # User 2: Budget Shopping = 2,000, spent 3,000 (150% exceeded)
        b_u2 = Budget(
            user_id=self.user2.id,
            category="Shopping",
            month="2026-10",
            limit_amount=Decimal("2000.00"),
        )
        t_u2 = Transaction(
            user_id=self.user2.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="U2 Shopping",
            amount=Decimal("3000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        r_u2 = RecurringPayment(
            user_id=self.user2.id,
            description="U2 Car Loan",
            amount=Decimal("15000.00"),
            category="Loans",
            frequency="monthly",
            start_date=date(2026, 9, 2),
            next_due_date=date(2026, 10, 2),  # overdue 8 days
            status="active",
            is_active=True,
        )
        self.db.add_all([b_u1, t_u1, r_u1, b_u2, t_u2, r_u2])
        self.db.commit()

        # Check User 1 insights
        res1 = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        u1_ids = [i.id for i in res1.insights]
        self.assertIn("budget-warning-dining-2026-10", u1_ids)
        self.assertIn(f"recurring-upcoming-{r_u1.id}-2026-10", u1_ids)
        self.assertNotIn("budget-exceeded-shopping-2026-10", u1_ids)
        self.assertNotIn(f"recurring-overdue-{r_u2.id}-2026-10", u1_ids)

        # Check User 2 insights
        res2 = get_financial_insights(
            month="2026-10",
            ref_date=self.ref_date,
            current_user=self.user2,
            db=self.db,
        )
        u2_ids = [i.id for i in res2.insights]
        self.assertIn("budget-exceeded-shopping-2026-10", u2_ids)
        self.assertIn(f"recurring-overdue-{r_u2.id}-2026-10", u2_ids)
        self.assertNotIn("budget-warning-dining-2026-10", u2_ids)
        self.assertNotIn(f"recurring-upcoming-{r_u1.id}-2026-10", u2_ids)


if __name__ == "__main__":
    unittest.main()

