from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.assistant_service import calculate_user_financial_facts
from app.dependencies import get_db
from app.main import app
from app.models import Base, Budget, RecurringPayment, Transaction, User


class AssistantFactsTestCase(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite database isolated for each test
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

        # Create two test users to verify strict isolation
        self.user1 = User(id=1, email="alice@example.com", password_hash="hash1")
        self.user2 = User(id=2, email="bob@example.com", password_hash="hash2")
        self.db.add_all([self.user1, self.user2])
        self.db.commit()

        # Fixed reference date: 2026-10-15 (Day 15 of 31)
        self.ref_date = date(2026, 10, 15)
        self.month = "2026-10"

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_empty_financial_history(self):
        """User with no transactions, no budgets, and no recurring payments."""
        res = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month=self.month,
            ref_date=self.ref_date,
        )

        summary = res.summary
        self.assertEqual(res.user_id, 1)
        self.assertEqual(res.month, "2026-10")
        self.assertFalse(summary.has_transactions)
        self.assertEqual(summary.total_income, Decimal("0.00"))
        self.assertEqual(summary.total_expenses, Decimal("0.00"))
        self.assertEqual(summary.net_savings, Decimal("0.00"))
        self.assertIsNone(summary.savings_rate_pct)
        self.assertIsNone(summary.mom_spending_change_pct)
        self.assertIsNone(summary.fixed_commitment_ratio)
        self.assertEqual(summary.projected_month_end_expense, Decimal("0.00"))
        self.assertEqual(len(summary.category_spending), 0)
        self.assertEqual(len(summary.budget_utilization), 0)
        self.assertEqual(len(summary.recurring_upcoming), 0)
        self.assertEqual(len(summary.recurring_overdue), 0)

        # Confirm data limitations accurately communicate missing records
        limitations = " ".join(res.data_limitations)
        self.assertIn("No transactions recorded", limitations)
        self.assertIn("No spending budgets established", limitations)
        self.assertIn("No active recurring payments", limitations)

    def test_accurate_financial_calculations(self):
        """Verify calculations of income, expenses, net savings, savings rate, and category breakdowns."""
        tx1 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
            description="Monthly Salary",
            amount=Decimal("50000.00"),
            transaction_type="income",
            category="Income",
        )
        tx2 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="Supermarket Groceries",
            amount=Decimal("4500.00"),
            transaction_type="expense",
            category="Groceries",
        )
        tx3 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 10, 19, 30, tzinfo=timezone.utc),
            description="Italian Bistro",
            amount=Decimal("1500.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        tx4 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 12, 14, 0, tzinfo=timezone.utc),
            description="Coffee Shop",
            amount=Decimal("500.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        self.db.add_all([tx1, tx2, tx3, tx4])
        self.db.commit()

        res = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month=self.month,
            ref_date=self.ref_date,
        )

        summary = res.summary
        self.assertTrue(summary.has_transactions)
        self.assertEqual(summary.total_income, Decimal("50000.00"))
        self.assertEqual(summary.total_expenses, Decimal("6500.00"))
        self.assertEqual(summary.net_savings, Decimal("43500.00"))
        # Savings rate = (43500 / 50000) * 100 = 87.0%
        self.assertEqual(summary.savings_rate_pct, 87.0)

        # Check category spending breakdown
        # Groceries: 4500 (69.23%), Food/Dining: 2000 (30.77%)
        self.assertEqual(len(summary.category_spending), 2)
        top_cat = summary.category_spending[0]
        self.assertEqual(top_cat.category, "Groceries")
        self.assertEqual(top_cat.total_spent, Decimal("4500.00"))
        self.assertEqual(top_cat.transaction_count, 1)
        self.assertEqual(top_cat.percentage_of_total_expenses, 69.23)

        second_cat = summary.category_spending[1]
        self.assertEqual(second_cat.category, "Food/Dining")
        self.assertEqual(second_cat.total_spent, Decimal("2000.00"))
        self.assertEqual(second_cat.transaction_count, 2)
        self.assertEqual(second_cat.percentage_of_total_expenses, 30.77)

        # Run-rate projection: day 15 of 31 => (6500 / 15) * 31 = 13433.33
        self.assertEqual(summary.projected_month_end_expense, Decimal("13433.33"))

    def test_budget_utilization_and_recommendations(self):
        """Test on-track, approaching limit (>=80%), and exceeded budget detection."""
        b1 = Budget(user_id=1, category="Groceries", month="2026-10", limit_amount=Decimal("10000.00"))
        b2 = Budget(user_id=1, category="Food/Dining", month="2026-10", limit_amount=Decimal("3000.00"))
        b3 = Budget(user_id=1, category="Transport", month="2026-10", limit_amount=Decimal("2000.00"))
        self.db.add_all([b1, b2, b3])

        # Groceries: 3000 spent / 10000 = 30% (on track)
        tx_groc = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 3, 10, 0, tzinfo=timezone.utc),
            description="Market",
            amount=Decimal("3000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        # Food/Dining: 2700 spent / 3000 = 90% (warning)
        tx_food = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc),
            description="Dinner party",
            amount=Decimal("2700.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        # Transport: 2500 spent / 2000 = 125% (exceeded)
        tx_trans = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 7, 10, 0, tzinfo=timezone.utc),
            description="Cab fare",
            amount=Decimal("2500.00"),
            transaction_type="expense",
            category="Transport",
        )
        self.db.add_all([tx_groc, tx_food, tx_trans])
        self.db.commit()

        res = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month=self.month,
            ref_date=self.ref_date,
        )

        b_map = {b.category: b for b in res.summary.budget_utilization}
        self.assertEqual(b_map["Groceries"].status, "on_track")
        self.assertEqual(b_map["Groceries"].percentage_used, 30.0)

        self.assertEqual(b_map["Food/Dining"].status, "warning")
        self.assertEqual(b_map["Food/Dining"].percentage_used, 90.0)

        self.assertEqual(b_map["Transport"].status, "exceeded")
        self.assertTrue(b_map["Transport"].is_exceeded)
        self.assertEqual(b_map["Transport"].remaining_amount, Decimal("-500.00"))

        # Verify recommendations generated for warning & exceeded budgets
        rec_keys = [r.metric_key for r in res.summary.recommendations]
        self.assertTrue(any("rec_budget_exceeded" in k for k in rec_keys))
        self.assertTrue(any("rec_budget_warning" in k for k in rec_keys))

    def test_budget_threshold_boundary_cases(self):
        """Verify boundary precision for:

        - Spending just below 80% -> on_track
        - Exactly 80% -> warning
        - Just below 100% (including 9,999.60 / 10,000.00 rounding to 100.0%) -> warning
        - Exactly 100% -> limit_reached (is_exceeded=False)
        - Above 100% -> exceeded (is_exceeded=True)
        """
        # Set up 6 budgets
        b_below_80 = Budget(user_id=1, category="Category A", month="2026-10", limit_amount=Decimal("1000.00"))
        b_exact_80 = Budget(user_id=1, category="Category B", month="2026-10", limit_amount=Decimal("1000.00"))
        b_below_100 = Budget(user_id=1, category="Category C", month="2026-10", limit_amount=Decimal("1000.00"))
        b_exact_100 = Budget(user_id=1, category="Category D", month="2026-10", limit_amount=Decimal("1000.00"))
        b_above_100 = Budget(user_id=1, category="Category E", month="2026-10", limit_amount=Decimal("1000.00"))
        b_round_100 = Budget(user_id=1, category="Category F", month="2026-10", limit_amount=Decimal("10000.00"))
        self.db.add_all([b_below_80, b_exact_80, b_below_100, b_exact_100, b_above_100, b_round_100])

        tx_below_80 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
            description="Spend A (79.9%)",
            amount=Decimal("799.00"),
            transaction_type="expense",
            category="Category A",
        )
        tx_exact_80 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
            description="Spend B (80.0%)",
            amount=Decimal("800.00"),
            transaction_type="expense",
            category="Category B",
        )
        tx_below_100 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
            description="Spend C (99.9%)",
            amount=Decimal("999.00"),
            transaction_type="expense",
            category="Category C",
        )
        tx_exact_100 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
            description="Spend D (100.0%)",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Category D",
        )
        tx_above_100 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
            description="Spend E (100.1%)",
            amount=Decimal("1001.00"),
            transaction_type="expense",
            category="Category E",
        )
        tx_round_100 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
            description="Spend F (9999.60 / 10000.00)",
            amount=Decimal("9999.60"),
            transaction_type="expense",
            category="Category F",
        )
        self.db.add_all([tx_below_80, tx_exact_80, tx_below_100, tx_exact_100, tx_above_100, tx_round_100])
        self.db.commit()

        res = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month=self.month,
            ref_date=self.ref_date,
        )

        b_map = {b.category: b for b in res.summary.budget_utilization}

        # 1. Just below 80% (79.90%) -> on_track
        self.assertEqual(b_map["Category A"].percentage_used, 79.9)
        self.assertEqual(b_map["Category A"].status, "on_track")
        self.assertFalse(b_map["Category A"].is_exceeded)

        # 2. Exactly 80% (80.00%) -> warning
        self.assertEqual(b_map["Category B"].percentage_used, 80.0)
        self.assertEqual(b_map["Category B"].status, "warning")
        self.assertFalse(b_map["Category B"].is_exceeded)

        # 3. Just below 100% (99.90%) -> warning
        self.assertEqual(b_map["Category C"].percentage_used, 99.9)
        self.assertEqual(b_map["Category C"].status, "warning")
        self.assertFalse(b_map["Category C"].is_exceeded)

        # 4. Exactly 100% (100.00%) -> limit_reached (NOT is_exceeded)
        self.assertEqual(b_map["Category D"].percentage_used, 100.0)
        self.assertEqual(b_map["Category D"].status, "limit_reached")
        self.assertFalse(b_map["Category D"].is_exceeded)
        self.assertEqual(b_map["Category D"].remaining_amount, Decimal("0.00"))

        # 5. Above 100% (100.10%) -> exceeded
        self.assertEqual(b_map["Category E"].percentage_used, 100.1)
        self.assertEqual(b_map["Category E"].status, "exceeded")
        self.assertTrue(b_map["Category E"].is_exceeded)
        self.assertEqual(b_map["Category E"].remaining_amount, Decimal("-1.00"))

        # 6. Float-rounded 100.0% below limit (9999.60 / 10000.00) -> warning, NOT limit_reached/exceeded
        self.assertEqual(b_map["Category F"].percentage_used, 100.0)
        self.assertEqual(b_map["Category F"].status, "warning")
        self.assertFalse(b_map["Category F"].is_exceeded)
        self.assertEqual(b_map["Category F"].remaining_amount, Decimal("0.40"))

        # Verify recommendation generated for exactly 100% (limit reached) and >100% (exceeded)
        rec_d = next(
            r for r in res.summary.recommendations if r.metric_key == f"rec_budget_limit_reached_{b_exact_100.id}"
        )
        self.assertIn("100.0% limit reached", rec_d.value_formatted)
        rec_e = next(
            r for r in res.summary.recommendations if r.metric_key == f"rec_budget_exceeded_{b_above_100.id}"
        )
        self.assertIn("Exceeded by", rec_e.value_formatted)

    def test_recurring_payments_upcoming_and_overdue(self):
        """Verify handling of upcoming bills vs overdue bills and commitment ratio."""
        # Overdue: due 2026-10-10 (< 2026-10-15)
        r_overdue = RecurringPayment(
            user_id=1,
            description="Broadband Internet",
            amount=Decimal("1200.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 10, 10),
            status="active",
        )
        # Upcoming: due 2026-10-20 (within 14 days of 2026-10-15)
        r_upcoming = RecurringPayment(
            user_id=1,
            description="Gym Membership",
            amount=Decimal("2000.00"),
            category="Healthcare",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 10, 20),
            status="active",
        )
        # Cancelled: should be ignored
        r_cancelled = RecurringPayment(
            user_id=1,
            description="Music Streaming",
            amount=Decimal("299.00"),
            category="Entertainment",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 10, 12),
            status="cancelled",
        )
        # Income to test commitment ratio: 3200 / 32000 = 10%
        income = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="Salary",
            amount=Decimal("32000.00"),
            transaction_type="income",
            category="Income",
        )
        self.db.add_all([r_overdue, r_upcoming, r_cancelled, income])
        self.db.commit()

        res = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month=self.month,
            ref_date=self.ref_date,
        )

        summary = res.summary
        self.assertEqual(len(summary.recurring_overdue), 1)
        self.assertEqual(summary.recurring_overdue[0].description, "Broadband Internet")
        self.assertTrue(summary.recurring_overdue[0].is_overdue)
        self.assertEqual(summary.recurring_overdue[0].days_until_due, -5)

        self.assertEqual(len(summary.recurring_upcoming), 1)
        self.assertEqual(summary.recurring_upcoming[0].description, "Gym Membership")
        self.assertFalse(summary.recurring_upcoming[0].is_overdue)
        self.assertEqual(summary.recurring_upcoming[0].days_until_due, 5)

        # Monthly total commitment = 1200 + 2000 = 3200; 3200 / 32000 = 10.0%
        self.assertEqual(summary.fixed_commitment_ratio, 10.0)

        # Overdue bill recommendation check
        rec_keys = [r.metric_key for r in res.summary.recommendations]
        self.assertTrue(any("rec_overdue" in k for k in rec_keys))

    def test_strict_user_data_isolation(self):
        """Confirm that User 1's facts NEVER contain User 2's financial data."""
        # User 1 data
        tx1 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc),
            description="Alice Coffee",
            amount=Decimal("250.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        b1 = Budget(user_id=1, category="Food/Dining", month="2026-10", limit_amount=Decimal("1000.00"))
        r1 = RecurringPayment(
            user_id=1,
            description="Alice Cloud Storage",
            amount=Decimal("199.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 10, 20),
            status="active",
        )

        # User 2 data (Confidential)
        tx2 = Transaction(
            user_id=2,
            transaction_date=datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc),
            description="Bob Luxury Watch",
            amount=Decimal("95000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        b2 = Budget(user_id=2, category="Shopping", month="2026-10", limit_amount=Decimal("100000.00"))
        r2 = RecurringPayment(
            user_id=2,
            description="Bob Supercar Lease",
            amount=Decimal("45000.00"),
            category="Transport",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 10, 22),
            status="active",
        )

        self.db.add_all([tx1, b1, r1, tx2, b2, r2])
        self.db.commit()

        # Query User 1
        res1 = calculate_user_financial_facts(user=self.user1, db=self.db, month=self.month, ref_date=self.ref_date)
        # Query User 2
        res2 = calculate_user_financial_facts(user=self.user2, db=self.db, month=self.month, ref_date=self.ref_date)

        # User 1 assertions
        self.assertEqual(res1.summary.total_expenses, Decimal("250.00"))
        self.assertEqual(len(res1.summary.category_spending), 1)
        self.assertEqual(res1.summary.category_spending[0].category, "Food/Dining")
        self.assertEqual(len(res1.summary.budget_utilization), 1)
        self.assertEqual(res1.summary.budget_utilization[0].category, "Food/Dining")
        self.assertEqual(len(res1.summary.recurring_upcoming), 1)
        self.assertEqual(res1.summary.recurring_upcoming[0].description, "Alice Cloud Storage")

        # Confirm Bob's data is completely absent from Alice's facts
        all_alice_text = str(res1.model_dump())
        self.assertNotIn("Bob", all_alice_text)
        self.assertNotIn("95000", all_alice_text)
        self.assertNotIn("Supercar", all_alice_text)

        # User 2 assertions
        self.assertEqual(res2.summary.total_expenses, Decimal("95000.00"))
        self.assertEqual(res2.summary.category_spending[0].category, "Shopping")
        self.assertEqual(res2.summary.recurring_upcoming[0].description, "Bob Supercar Lease")
        all_bob_text = str(res2.model_dump())
        self.assertNotIn("Alice", all_bob_text)
        self.assertNotIn("250.00", all_bob_text)

    def test_november_2026_ledger_facts_verification(self):
        """Verify financial calculations for the November 2026 test ledger:
        - Salary income: ₹20,000
        - Shopping expense: ₹1,000
        - Food/Dining expense: ₹500
        - Transport expense: ₹300
        """
        tx_salary = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc),
            description="Salary",
            amount=Decimal("20000.00"),
            transaction_type="income",
            category="Income",
            is_reviewed=True,
        )
        tx_shopping = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 11, 1, 11, 0, tzinfo=timezone.utc),
            description="Shopping",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Shopping",
            is_reviewed=True,
        )
        tx_transport = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 11, 1, 14, 0, tzinfo=timezone.utc),
            description="Metro",
            amount=Decimal("300.00"),
            transaction_type="expense",
            category="Transport",
            is_reviewed=True,
        )
        tx_food = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 11, 1, 19, 0, tzinfo=timezone.utc),
            description="food",
            amount=Decimal("500.00"),
            transaction_type="expense",
            category="Food/Dining",
            is_reviewed=True,
        )

        self.db.add_all([tx_salary, tx_shopping, tx_transport, tx_food])
        self.db.commit()

        res = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month="2026-11",
            ref_date=date(2026, 11, 1),
        )

        summary = res.summary
        # 1. Total income: ₹20,000.00
        self.assertEqual(summary.total_income, Decimal("20000.00"))
        self.assertEqual(summary.income_count, 1)

        # 2. Total expenses: ₹1,800.00
        self.assertEqual(summary.total_expenses, Decimal("1800.00"))
        self.assertEqual(summary.expense_count, 3)

        # 3. Net savings: ₹18,200.00
        self.assertEqual(summary.net_savings, Decimal("18200.00"))

        # 4. Savings rate: 91% ((20000 - 1800) / 20000 * 100)
        self.assertEqual(summary.savings_rate_pct, 91.0)

        # 5. Category totals: Shopping ₹1,000; Food/Dining ₹500; Transport ₹300
        cats_by_name = {c.category: c for c in summary.category_spending}
        self.assertIn("Shopping", cats_by_name)
        self.assertEqual(cats_by_name["Shopping"].total_spent, Decimal("1000.00"))
        self.assertAlmostEqual(cats_by_name["Shopping"].percentage_of_total_expenses, 55.56, places=1)

        self.assertIn("Food/Dining", cats_by_name)
        self.assertEqual(cats_by_name["Food/Dining"].total_spent, Decimal("500.00"))
        self.assertAlmostEqual(cats_by_name["Food/Dining"].percentage_of_total_expenses, 27.78, places=1)

        self.assertIn("Transport", cats_by_name)
        self.assertEqual(cats_by_name["Transport"].total_spent, Decimal("300.00"))
        self.assertAlmostEqual(cats_by_name["Transport"].percentage_of_total_expenses, 16.67, places=1)

        # Verified facts list
        facts_dict = {f.metric_key: f for f in summary.verified_facts}
        self.assertEqual(facts_dict["total_income"].value_formatted, "₹20,000.00")
        self.assertEqual(facts_dict["total_expenses"].value_formatted, "₹1,800.00")
        self.assertEqual(facts_dict["net_savings"].value_formatted, "₹18,200.00")
        self.assertEqual(facts_dict["cat_spend_shopping"].value_formatted, "₹1,000.00")
        self.assertEqual(facts_dict["cat_spend_food_dining"].value_formatted, "₹500.00")
        self.assertEqual(facts_dict["cat_spend_transport"].value_formatted, "₹300.00")

    def test_month_over_month_spending_comparison_semantics(self):
        """Regression tests for Phase 3E-2 MoM spending comparison:
        1. Incomplete current month + zero current spending + positive previous spending:
           returns None (no misleading -100%), adds explanatory data limitation.
        2. Completed current month + zero current spending + positive previous spending:
           returns -100.0% reduction.
        3. Both months having zero spending:
           returns 0.0% unchanged without division by zero.
        4. Current month having positive spending:
           returns standard percentage change.
        """
        # 1. Incomplete current month (October 2026 evaluated on Oct 15) with previous spending (Sep 2026: 5,000)
        sep_tx = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc),
            description="September Groceries",
            amount=Decimal("5000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        oct_salary = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="October Salary",
            amount=Decimal("50000.00"),
            transaction_type="income",
            category="Income",
        )
        self.db.add_all([sep_tx, oct_salary])
        self.db.commit()

        # 1a. Penultimate day evaluation: Oct 30 (< Oct 31 end of month)
        res_penultimate = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month="2026-10",
            ref_date=date(2026, 10, 30),
        )
        self.assertEqual(res_penultimate.summary.total_expenses, Decimal("0.00"))
        self.assertIsNone(res_penultimate.summary.mom_spending_change_pct)
        self.assertFalse(any(e.metric_key == "mom_spending_change_pct" for e in res_penultimate.summary.estimates))
        self.assertIn("still in progress with no spending recorded yet", " ".join(res_penultimate.data_limitations))

        # 1b. Final calendar day evaluation: Oct 31 (month still in progress on its final day)
        res_final_day = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month="2026-10",
            ref_date=date(2026, 10, 31),
        )
        self.assertEqual(res_final_day.summary.total_expenses, Decimal("0.00"))
        # Crucial boundary: final calendar day is still in progress; must return None, not -100%
        self.assertIsNone(res_final_day.summary.mom_spending_change_pct)
        self.assertFalse(any(e.metric_key == "mom_spending_change_pct" for e in res_final_day.summary.estimates))
        self.assertIn("still in progress with no spending recorded yet", " ".join(res_final_day.data_limitations))

        # 2. Completed current month: Oct 2026 evaluated on Nov 1 (> Oct 31 end of month)
        res_completed = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month="2026-10",
            ref_date=date(2026, 11, 1),
        )
        self.assertEqual(res_completed.summary.total_expenses, Decimal("0.00"))
        # Completed month with zero spending must report -100.0%
        self.assertEqual(res_completed.summary.mom_spending_change_pct, -100.0)
        est_completed = next(e for e in res_completed.summary.estimates if e.metric_key == "mom_spending_change_pct")
        self.assertEqual(est_completed.value_formatted, "-100.0%")

        # 3. Both months having zero spending (income only in both months)
        self.db.delete(sep_tx)
        sep_income = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc),
            description="September Salary",
            amount=Decimal("50000.00"),
            transaction_type="income",
            category="Income",
        )
        self.db.add(sep_income)
        self.db.commit()

        res_both_zero = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month="2026-10",
            ref_date=date(2026, 10, 15),
        )
        self.assertEqual(res_both_zero.summary.total_expenses, Decimal("0.00"))
        # Safe 0.0% comparison without division by zero
        self.assertEqual(res_both_zero.summary.mom_spending_change_pct, 0.0)
        est_both_zero = next(e for e in res_both_zero.summary.estimates if e.metric_key == "mom_spending_change_pct")
        self.assertEqual(est_both_zero.value_formatted, "0.0%")

        # 4. Current month having positive spending
        oct_exp = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
            description="October Shopping",
            amount=Decimal("4000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        sep_exp = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc),
            description="September Shopping",
            amount=Decimal("5000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add_all([oct_exp, sep_exp])
        self.db.commit()

        res_positive = calculate_user_financial_facts(
            user=self.user1,
            db=self.db,
            month="2026-10",
            ref_date=date(2026, 10, 15),
        )
        self.assertEqual(res_positive.summary.total_expenses, Decimal("4000.00"))
        # (4000 - 5000) / 5000 * 100 = -20.0%
        self.assertEqual(res_positive.summary.mom_spending_change_pct, -20.0)
        est_positive = next(e for e in res_positive.summary.estimates if e.metric_key == "mom_spending_change_pct")
        self.assertEqual(est_positive.value_formatted, "-20.0%")


if __name__ == "__main__":
    unittest.main()

