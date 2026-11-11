from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.assistant import list_starter_prompts, query_assistant
from app.assistant_service import process_assistant_query
from app.auth_dependencies import get_current_user
from app.dependencies import get_db
from app.main import app
from app.models import Base, Budget, RecurringPayment, Transaction, User
from app.schemas import AssistantQueryRequest
from app.token import create_access_token


class AssistantAPITestCase(unittest.TestCase):
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

        # Create two test users
        self.user1 = User(id=1, email="alice@example.com", password_hash="hash1")
        self.user2 = User(id=2, email="bob@example.com", password_hash="hash2")
        self.db.add_all([self.user1, self.user2])
        self.db.commit()

        self.month = "2026-10"

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_starter_prompts_endpoint(self):
        """GET /assistant/starter-prompts returns sensible starter prompts."""
        res = list_starter_prompts(current_user=self.user1)
        self.assertGreaterEqual(len(res.prompts), 7)
        prompt_texts = [p.prompt for p in res.prompts]
        self.assertTrue(any("spend this month" in p for p in prompt_texts))
        self.assertTrue(any("biggest spending" in p for p in prompt_texts))
        self.assertTrue(any("save this month" in p for p in prompt_texts))
        self.assertTrue(any("budgets" in p for p in prompt_texts))
        self.assertTrue(any("recurring" in p or "bills" in p for p in prompt_texts))
        self.assertTrue(any("unusual" in p for p in prompt_texts))
        self.assertTrue(any("last month" in p for p in prompt_texts))

    def test_query_spending_summary(self):
        """POST /assistant/query -> spending_summary intent."""
        tx1 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc),
            description="Office Supplies",
            amount=Decimal("1200.00"),
            transaction_type="expense",
            category="Shopping",
        )
        tx2 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc),
            description="Team Lunch",
            amount=Decimal("800.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        self.db.add_all([tx1, tx2])
        self.db.commit()

        req = AssistantQueryRequest(query="How much did I spend this month?", month=self.month)
        res = query_assistant(request=req, current_user=self.user1, db=self.db)

        self.assertEqual(res.intent, "spending_summary")
        self.assertEqual(res.engine, "deterministic")
        self.assertIn("₹2,000.00", res.answer_markdown)
        self.assertIn("Shopping", res.answer_markdown)
        self.assertTrue(any(f.metric_key == "total_expenses" for f in res.facts))
        self.assertTrue(any(e.metric_key == "projected_month_end_expense" for e in res.estimates))
        self.assertGreaterEqual(len(res.suggested_followups), 1)

    def test_query_top_categories(self):
        """POST /assistant/query -> top_categories intent."""
        tx1 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
            description="Groceries Store",
            amount=Decimal("5000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        tx2 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 3, 10, 0, tzinfo=timezone.utc),
            description="Cafe",
            amount=Decimal("1500.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        self.db.add_all([tx1, tx2])
        self.db.commit()

        req = AssistantQueryRequest(query="What are my biggest spending categories?", month=self.month)
        res = query_assistant(request=req, current_user=self.user1, db=self.db)

        self.assertEqual(res.intent, "top_categories")
        self.assertIn("Groceries", res.answer_markdown)
        self.assertIn("Food/Dining", res.answer_markdown)
        self.assertIn("₹5,000.00", res.answer_markdown)
        self.assertTrue(any("cat_spend_" in f.metric_key for f in res.facts))

    def test_query_savings_summary(self):
        """POST /assistant/query -> savings_summary intent."""
        inc = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="Paycheck",
            amount=Decimal("40000.00"),
            transaction_type="income",
            category="Income",
        )
        exp = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 4, 15, 0, tzinfo=timezone.utc),
            description="Rent",
            amount=Decimal("15000.00"),
            transaction_type="expense",
            category="Bills/Utilities",
        )
        self.db.add_all([inc, exp])
        self.db.commit()

        req = AssistantQueryRequest(query="How much did I save this month?", month=self.month)
        res = query_assistant(request=req, current_user=self.user1, db=self.db)

        self.assertEqual(res.intent, "savings_summary")
        self.assertIn("₹40,000.00", res.answer_markdown)
        self.assertIn("₹15,000.00", res.answer_markdown)
        self.assertIn("₹25,000.00", res.answer_markdown)  # Net savings = 25,000
        self.assertIn("62.5%", res.answer_markdown)  # 25000 / 40000 = 62.5%
        self.assertTrue(any(f.metric_key == "net_savings" for f in res.facts))

    def test_query_budget_status(self):
        """POST /assistant/query -> budget_status intent."""
        b_warn = Budget(user_id=1, category="Dining", month="2026-10", limit_amount=Decimal("1000.00"))
        b_exceeded = Budget(user_id=1, category="Transport", month="2026-10", limit_amount=Decimal("500.00"))
        b_ontrack = Budget(user_id=1, category="Groceries", month="2026-10", limit_amount=Decimal("2000.00"))
        self.db.add_all([b_warn, b_exceeded, b_ontrack])

        # Dining: 850 spent (85% -> warning)
        tx1 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc),
            description="Dinner",
            amount=Decimal("850.00"),
            transaction_type="expense",
            category="Dining",
        )
        # Transport: 600 spent (120% -> exceeded)
        tx2 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 6, 10, 0, tzinfo=timezone.utc),
            description="Taxi",
            amount=Decimal("600.00"),
            transaction_type="expense",
            category="Transport",
        )
        # Groceries: 400 spent (20% -> on track)
        tx3 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 7, 10, 0, tzinfo=timezone.utc),
            description="Milk",
            amount=Decimal("400.00"),
            transaction_type="expense",
            category="Groceries",
        )
        self.db.add_all([tx1, tx2, tx3])
        self.db.commit()

        req = AssistantQueryRequest(query="Am I staying within my budgets?", month=self.month)
        res = query_assistant(request=req, current_user=self.user1, db=self.db)

        self.assertEqual(res.intent, "budget_status")
        self.assertIn("Exceeded", res.answer_markdown)
        self.assertIn("Approaching Limit", res.answer_markdown)
        self.assertIn("On Track", res.answer_markdown)
        self.assertTrue(any("rec_budget_exceeded" in r.metric_key for r in res.recommendations))

    def test_query_anomaly_detection_with_and_without_outlier(self):
        """POST /assistant/query -> anomaly_detection intent."""
        # Query when no anomalies exist
        req_clean = AssistantQueryRequest(query="What unusual transactions were detected?", month=self.month)
        res_clean = query_assistant(request=req_clean, current_user=self.user1, db=self.db)

        self.assertEqual(res_clean.intent, "anomaly_detection")
        self.assertIn("No unusual expense transactions were detected", res_clean.answer_markdown)
        self.assertIn("do not signify confirmed fraud", res_clean.answer_markdown)

        # Create baseline of 3 ordinary grocery txs, plus 1 genuine extreme outlier
        txs = [
            Transaction(
                user_id=1,
                transaction_date=datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc),
                description="Groceries 1",
                amount=Decimal("100.00"),
                transaction_type="expense",
                category="Groceries",
            ),
            Transaction(
                user_id=1,
                transaction_date=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
                description="Groceries 2",
                amount=Decimal("105.00"),
                transaction_type="expense",
                category="Groceries",
            ),
            Transaction(
                user_id=1,
                transaction_date=datetime(2026, 10, 3, 10, 0, tzinfo=timezone.utc),
                description="Groceries 3",
                amount=Decimal("95.00"),
                transaction_type="expense",
                category="Groceries",
            ),
            Transaction(
                user_id=1,
                transaction_date=datetime(2026, 10, 10, 10, 0, tzinfo=timezone.utc),
                description="Massive Bulk Buy",
                amount=Decimal("2500.00"),
                transaction_type="expense",
                category="Groceries",
            ),
        ]
        self.db.add_all(txs)
        self.db.commit()

        res_outlier = query_assistant(request=req_clean, current_user=self.user1, db=self.db)
        self.assertEqual(res_outlier.intent, "anomaly_detection")
        self.assertIn("statistically unusual transaction", res_outlier.answer_markdown)
        self.assertIn("Groceries", res_outlier.answer_markdown)
        # Verify it specifically disclaims fraud
        self.assertIn("do not imply fraud", res_outlier.answer_markdown)

    def test_query_recurring_status(self):
        """POST /assistant/query -> recurring_status intent."""
        # Overdue bill
        r_overdue = RecurringPayment(
            user_id=1,
            description="Internet Service",
            amount=Decimal("1200.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 10, 5),  # Overdue
            status="active",
        )
        # Upcoming bill
        r_upcoming = RecurringPayment(
            user_id=1,
            description="Cloud Backup",
            amount=Decimal("300.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 10, 25),  # Upcoming
            status="active",
        )
        self.db.add_all([r_overdue, r_upcoming])
        self.db.commit()

        req = AssistantQueryRequest(query="What recurring payments are upcoming or overdue?", month=self.month)
        res = query_assistant(request=req, current_user=self.user1, db=self.db)

        self.assertEqual(res.intent, "recurring_status")
        self.assertIn("Internet Service", res.answer_markdown)
        self.assertIn("Cloud Backup", res.answer_markdown)
        self.assertTrue(any(f.source == "recurring_payments" for f in res.facts))

    def test_query_mom_comparison(self):
        """POST /assistant/query -> mom_comparison intent."""
        # Prior month (2026-09) expense: 10,000
        prev_tx = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc),
            description="September Expenses",
            amount=Decimal("10000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        # Current month (2026-10) expense: 12,500 (+25.0% increase)
        curr_tx = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc),
            description="October Expenses",
            amount=Decimal("12500.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add_all([prev_tx, curr_tx])
        self.db.commit()

        req = AssistantQueryRequest(query="How does my spending compare with last month?", month=self.month)
        res = query_assistant(request=req, current_user=self.user1, db=self.db)

        self.assertEqual(res.intent, "mom_comparison")
        self.assertIn("25.0% higher", res.answer_markdown)
        self.assertIn("2026-09", res.answer_markdown)
        self.assertTrue(any(e.metric_key == "mom_spending_change_pct" for e in res.estimates))

    def test_query_mom_comparison_incomplete_month_zero_spending(self):
        """In-progress month with zero expenses and prior positive spending must not report -100%."""
        prev_tx = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc),
            description="September Expenses",
            amount=Decimal("10000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        curr_income = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="Salary",
            amount=Decimal("40000.00"),
            transaction_type="income",
            category="Income",
        )
        self.db.add_all([prev_tx, curr_income])
        self.db.commit()

        # Test both penultimate day (Oct 30) and final day (Oct 31) of current month
        for test_ref_date in [date(2026, 10, 30), date(2026, 10, 31)]:
            with self.subTest(ref_date=test_ref_date):
                res = process_assistant_query(
                    query="How does my spending compare with last month?",
                    user=self.user1,
                    db=self.db,
                    month="2026-10",
                    ref_date=test_ref_date,
                )

                self.assertEqual(res.intent, "mom_comparison")
                # Must not falsely report -100% decrease
                self.assertNotIn("-100%", res.answer_markdown)
                self.assertNotIn("100.0% lower", res.answer_markdown)
                # Must clearly explain that month is in progress
                self.assertIn("still in progress with no spending recorded yet", res.answer_markdown)
                self.assertIn("2026-09", res.answer_markdown)
                # Must not include MoM estimate item
                self.assertFalse(any(e.metric_key == "mom_spending_change_pct" for e in res.estimates))
                # Limitations must communicate in-progress status
                self.assertTrue(any("still in progress" in lim for lim in res.data_limitations))

    def test_query_mom_comparison_completed_month_zero_spending(self):
        """Completed month with zero expenses and prior positive spending legitimately reports -100.0% lower."""
        prev_tx = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc),
            description="September Expenses",
            amount=Decimal("10000.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add(prev_tx)
        self.db.commit()

        # Oct 2026 evaluated on Nov 1 (>= Oct 31 end of month)
        res = process_assistant_query(
            query="How does my spending compare with last month?",
            user=self.user1,
            db=self.db,
            month="2026-10",
            ref_date=date(2026, 11, 1),
        )

        self.assertEqual(res.intent, "mom_comparison")
        self.assertIn("100.0% lower", res.answer_markdown)
        self.assertIn("₹0.00 this month", res.answer_markdown)
        mom_est = next(e for e in res.estimates if e.metric_key == "mom_spending_change_pct")
        self.assertEqual(mom_est.value_formatted, "-100.0%")

    def test_query_mom_comparison_both_months_zero_spending(self):
        """Both months with zero spending report 0.0% unchanged without division by zero error."""
        prev_income = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc),
            description="Salary Sep",
            amount=Decimal("30000.00"),
            transaction_type="income",
            category="Income",
        )
        curr_income = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="Salary Oct",
            amount=Decimal("30000.00"),
            transaction_type="income",
            category="Income",
        )
        self.db.add_all([prev_income, curr_income])
        self.db.commit()

        res = process_assistant_query(
            query="How does my spending compare with last month?",
            user=self.user1,
            db=self.db,
            month="2026-10",
            ref_date=date(2026, 10, 15),
        )

        self.assertEqual(res.intent, "mom_comparison")
        self.assertIn("0.0% unchanged", res.answer_markdown)
        mom_est = next(e for e in res.estimates if e.metric_key == "mom_spending_change_pct")
        self.assertEqual(mom_est.value_formatted, "0.0%")

    def test_savings_vs_top_category_collision(self):
        """Verify that savings queries containing 'most' or 'money' do not collide into top_categories."""
        inc = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="Salary",
            amount=Decimal("30000.00"),
            transaction_type="income",
            category="Income",
        )
        exp = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc),
            description="Food",
            amount=Decimal("5000.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        self.db.add_all([inc, exp])
        self.db.commit()

        # Primary test case: "How can I save the most money?" must classify as savings_summary
        req1 = AssistantQueryRequest(query="How can I save the most money?", month=self.month)
        res1 = query_assistant(request=req1, current_user=self.user1, db=self.db)
        self.assertEqual(res1.intent, "savings_summary")
        self.assertIn("Net Savings", res1.answer_markdown)

        # Paraphrase 1: "How can I maximize my savings?"
        req2 = AssistantQueryRequest(query="How can I maximize my savings?", month=self.month)
        res2 = query_assistant(request=req2, current_user=self.user1, db=self.db)
        self.assertEqual(res2.intent, "savings_summary")

        # Paraphrase 2: "What is my remaining cash this month?"
        req3 = AssistantQueryRequest(query="What is my remaining cash this month?", month=self.month)
        res3 = query_assistant(request=req3, current_user=self.user1, db=self.db)
        self.assertEqual(res3.intent, "savings_summary")

        # Confirm genuine top-category queries still route to top_categories
        req_top1 = AssistantQueryRequest(query="What did I spend the most on?", month=self.month)
        res_top1 = query_assistant(request=req_top1, current_user=self.user1, db=self.db)
        self.assertEqual(res_top1.intent, "top_categories")

        req_top2 = AssistantQueryRequest(query="Where did my money go?", month=self.month)
        res_top2 = query_assistant(request=req_top2, current_user=self.user1, db=self.db)
        self.assertEqual(res_top2.intent, "top_categories")

    def test_ambiguous_word_false_positives(self):
        """Verify ambiguous words ('Bill', 'left') do not trigger false positives, while preserving valid queries."""
        # Setup active bills and income/expenses
        r1 = RecurringPayment(
            user_id=1,
            description="Broadband Bill",
            amount=Decimal("999.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 1, 1),
            next_due_date=date(2026, 10, 18),
            status="active",
        )
        inc = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
            description="Salary",
            amount=Decimal("20000.00"),
            transaction_type="income",
            category="Income",
        )
        exp = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 3, 10, 0, tzinfo=timezone.utc),
            description="Groceries",
            amount=Decimal("4000.00"),
            transaction_type="expense",
            category="Groceries",
        )
        self.db.add_all([r1, inc, exp])
        self.db.commit()

        # 1. "Who is Bill Gates?" must be unsupported
        req_gates = AssistantQueryRequest(query="Who is Bill Gates?", month=self.month)
        res_gates = query_assistant(request=req_gates, current_user=self.user1, db=self.db)
        self.assertEqual(res_gates.intent, "unsupported")

        # 2. "Turn left at the next street" must be unsupported
        req_left = AssistantQueryRequest(query="Turn left at the next street", month=self.month)
        res_left = query_assistant(request=req_left, current_user=self.user1, db=self.db)
        self.assertEqual(res_left.intent, "unsupported")

        # 3. Valid recurring queries
        req_bills = AssistantQueryRequest(query="What bills are due this week?", month=self.month)
        res_bills = query_assistant(request=req_bills, current_user=self.user1, db=self.db)
        self.assertEqual(res_bills.intent, "recurring_status")
        self.assertIn("Broadband Bill", res_bills.answer_markdown)

        req_para_rec1 = AssistantQueryRequest(query="Are there any upcoming utility bills?", month=self.month)
        res_para_rec1 = query_assistant(request=req_para_rec1, current_user=self.user1, db=self.db)
        self.assertEqual(res_para_rec1.intent, "recurring_status")

        req_para_rec2 = AssistantQueryRequest(query="Show my scheduled recurring payments", month=self.month)
        res_para_rec2 = query_assistant(request=req_para_rec2, current_user=self.user1, db=self.db)
        self.assertEqual(res_para_rec2.intent, "recurring_status")

        # 4. Valid savings queries
        req_money_left = AssistantQueryRequest(query="What money do I have left?", month=self.month)
        res_money_left = query_assistant(request=req_money_left, current_user=self.user1, db=self.db)
        self.assertEqual(res_money_left.intent, "savings_summary")
        self.assertIn("Net Savings", res_money_left.answer_markdown)

        req_saved = AssistantQueryRequest(query="How much did I save this month?", month=self.month)
        res_saved = query_assistant(request=req_saved, current_user=self.user1, db=self.db)
        self.assertEqual(res_saved.intent, "savings_summary")

    def test_historical_spending_vs_mom_comparison(self):
        """Verify historical single-month queries calculate previous month totals, distinct from MoM comparisons."""
        # August 2026 expense: 7,000
        tx_aug = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 8, 10, 10, 0, tzinfo=timezone.utc),
            description="August Rent",
            amount=Decimal("7000.00"),
            transaction_type="expense",
            category="Bills/Utilities",
        )
        # September 2026 expense: 10,000
        tx_sep = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 9, 10, 10, 0, tzinfo=timezone.utc),
            description="September Rent",
            amount=Decimal("10000.00"),
            transaction_type="expense",
            category="Bills/Utilities",
        )
        # October 2026 expense: 12,500
        tx_oct = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 10, 10, 0, tzinfo=timezone.utc),
            description="October Rent",
            amount=Decimal("12500.00"),
            transaction_type="expense",
            category="Bills/Utilities",
        )
        self.db.add_all([tx_aug, tx_sep, tx_oct])
        self.db.commit()

        # 1. "How much did I spend last month?" with anchor 2026-10 must return spending_summary for 2026-09 (10,000)
        req_last_m = AssistantQueryRequest(query="How much did I spend last month?", month="2026-10")
        res_last_m = query_assistant(request=req_last_m, current_user=self.user1, db=self.db)

        self.assertEqual(res_last_m.intent, "spending_summary")
        self.assertIn("2026-09", res_last_m.answer_markdown)
        self.assertIn("₹10,000.00", res_last_m.answer_markdown)
        self.assertNotIn("₹12,500.00", res_last_m.answer_markdown)

        # Check raw fact amount
        fact_exp = next(f for f in res_last_m.facts if f.metric_key == "total_expenses")
        self.assertEqual(fact_exp.raw_amount, Decimal("10000.00"))

        # Paraphrase 1: "What were my total expenses last month?"
        req_p1 = AssistantQueryRequest(query="What were my total expenses last month?", month="2026-10")
        res_p1 = query_assistant(request=req_p1, current_user=self.user1, db=self.db)
        self.assertEqual(res_p1.intent, "spending_summary")
        self.assertIn("2026-09", res_p1.answer_markdown)
        self.assertIn("₹10,000.00", res_p1.answer_markdown)

        # Paraphrase 2: "What did I spend in the previous month?"
        req_p2 = AssistantQueryRequest(query="What did I spend in the previous month?", month="2026-10")
        res_p2 = query_assistant(request=req_p2, current_user=self.user1, db=self.db)
        self.assertEqual(res_p2.intent, "spending_summary")
        self.assertIn("2026-09", res_p2.answer_markdown)
        self.assertIn("₹10,000.00", res_p2.answer_markdown)

        # 2. "Compare my spending with last month" remains mom_comparison (evaluating 2026-10 vs 2026-09)
        req_comp = AssistantQueryRequest(query="Compare my spending with last month", month="2026-10")
        res_comp = query_assistant(request=req_comp, current_user=self.user1, db=self.db)
        self.assertEqual(res_comp.intent, "mom_comparison")
        self.assertIn("2026-10", res_comp.answer_markdown)
        self.assertIn("25.0% higher", res_comp.answer_markdown)

        # Paraphrase comparison: "Is my spending higher or lower than last month?"
        req_comp_p = AssistantQueryRequest(query="Is my spending higher or lower than last month?", month="2026-10")
        res_comp_p = query_assistant(request=req_comp_p, current_user=self.user1, db=self.db)
        self.assertEqual(res_comp_p.intent, "mom_comparison")
        self.assertIn("25.0% higher", res_comp_p.answer_markdown)

        # 3. Verify interaction with explicit month anchor (e.g. anchor set to 2026-09)
        # Last month relative to 2026-09 should resolve to 2026-08 (7,000)
        req_anchor = AssistantQueryRequest(query="How much did I spend last month?", month="2026-09")
        res_anchor = query_assistant(request=req_anchor, current_user=self.user1, db=self.db)
        self.assertEqual(res_anchor.intent, "spending_summary")
        self.assertIn("2026-08", res_anchor.answer_markdown)
        self.assertIn("₹7,000.00", res_anchor.answer_markdown)

        # Whereas current month relative to 2026-09 stays 2026-09 (10,000)
        req_anchor_this = AssistantQueryRequest(query="How much did I spend this month?", month="2026-09")
        res_anchor_this = query_assistant(request=req_anchor_this, current_user=self.user1, db=self.db)
        self.assertEqual(res_anchor_this.intent, "spending_summary")
        self.assertIn("2026-09", res_anchor_this.answer_markdown)
        self.assertIn("₹10,000.00", res_anchor_this.answer_markdown)

    def test_query_general_summary(self):
        """POST /assistant/query -> general_summary intent."""
        tx1 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
            description="Salary",
            amount=Decimal("50000.00"),
            transaction_type="income",
            category="Income",
        )
        tx2 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 3, 10, 0, tzinfo=timezone.utc),
            description="Rent",
            amount=Decimal("15000.00"),
            transaction_type="expense",
            category="Bills/Utilities",
        )
        self.db.add_all([tx1, tx2])
        self.db.commit()

        req = AssistantQueryRequest(query="Give me a summary of my financial health", month=self.month)
        res = query_assistant(request=req, current_user=self.user1, db=self.db)

        self.assertEqual(res.intent, "general_summary")
        self.assertIn("Financial Summary for **2026-10**", res.answer_markdown)
        self.assertIn("₹50,000.00 income", res.answer_markdown)
        self.assertIn("₹15,000.00 expenses", res.answer_markdown)

    def test_unsupported_query_fallback(self):
        """POST /assistant/query -> unsupported query fallback."""
        req = AssistantQueryRequest(query="What is the stock price of Tesla today?", month=self.month)
        res = query_assistant(request=req, current_user=self.user1, db=self.db)

        self.assertEqual(res.intent, "unsupported")
        self.assertIn("I am your SpendWise AI Money Assistant", res.answer_markdown)
        self.assertIn("How much did I spend this month?", res.answer_markdown)
        self.assertGreaterEqual(len(res.suggested_followups), 1)

    def test_empty_financial_history_queries(self):
        """Empty history handles queries without inventing figures."""
        # 1. Spending query with empty history
        req1 = AssistantQueryRequest(query="How much did I spend this month?", month=self.month)
        res1 = query_assistant(request=req1, current_user=self.user1, db=self.db)
        self.assertIn("no expense transactions", res1.answer_markdown)
        self.assertTrue(len(res1.data_limitations) > 0)

        # 2. Savings query with empty history
        req2 = AssistantQueryRequest(query="How much did I save this month?", month=self.month)
        res2 = query_assistant(request=req2, current_user=self.user1, db=self.db)
        self.assertIn("No income or expense records", res2.answer_markdown)

        # 3. Budget query with empty history
        req3 = AssistantQueryRequest(query="Am I staying within my budgets?", month=self.month)
        res3 = query_assistant(request=req3, current_user=self.user1, db=self.db)
        self.assertIn("not established any monthly category budgets", res3.answer_markdown)

        # 4. MoM comparison with empty history
        req4 = AssistantQueryRequest(query="How does my spending compare with last month?", month=self.month)
        res4 = query_assistant(request=req4, current_user=self.user1, db=self.db)
        self.assertIn("comparison is unavailable because there is no transaction history", res4.answer_markdown)

    def test_input_validation(self):
        """Request validation blocks empty queries and invalid month formats."""
        # Empty query
        with self.assertRaises(ValidationError):
            AssistantQueryRequest(query="")

        # Query exceeding 1000 characters
        with self.assertRaises(ValidationError):
            AssistantQueryRequest(query="a" * 1001)

        # Invalid month formats
        with self.assertRaises(ValidationError):
            AssistantQueryRequest(query="test", month="2026-1")  # not YYYY-MM
        with self.assertRaises(ValidationError):
            AssistantQueryRequest(query="test", month="2026-13")  # invalid month
        with self.assertRaises(ValidationError):
            AssistantQueryRequest(query="test", month="invalid")

    def test_authentication_and_user_isolation(self):
        """Verify unauthenticated rejection and strict cross-user isolation."""
        # 1. Unauthenticated rejection from get_current_user
        with self.assertRaises(HTTPException) as ctx:
            get_current_user(credentials=None, db=self.db)
        self.assertEqual(ctx.exception.status_code, 401)

        # 2. Strict cross-user isolation
        # Alice's transactions and budgets
        tx_alice = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 10, 4, 10, 0, tzinfo=timezone.utc),
            description="Alice Coffee",
            amount=Decimal("300.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        b_alice = Budget(user_id=1, category="Food/Dining", month="2026-10", limit_amount=Decimal("1000.00"))

        # Bob's confidential transactions and budgets
        tx_bob = Transaction(
            user_id=2,
            transaction_date=datetime(2026, 10, 4, 10, 0, tzinfo=timezone.utc),
            description="Bob Supercar Downpayment",
            amount=Decimal("80000.00"),
            transaction_type="expense",
            category="Luxury",
        )
        b_bob = Budget(user_id=2, category="Luxury", month="2026-10", limit_amount=Decimal("100000.00"))

        self.db.add_all([tx_alice, b_alice, tx_bob, b_bob])
        self.db.commit()

        # Alice queries spending
        req = AssistantQueryRequest(query="How much did I spend this month?", month=self.month)
        res_alice = query_assistant(request=req, current_user=self.user1, db=self.db)

        self.assertIn("₹300.00", res_alice.answer_markdown)
        self.assertNotIn("80000", res_alice.answer_markdown)
        self.assertNotIn("Supercar", res_alice.answer_markdown)
        self.assertNotIn("Bob", str(res_alice.model_dump()))

        # Bob queries spending
        res_bob = query_assistant(request=req, current_user=self.user2, db=self.db)
        self.assertIn("₹80,000.00", res_bob.answer_markdown)
        self.assertNotIn("300.00", res_bob.answer_markdown)
        self.assertNotIn("Alice", str(res_bob.model_dump()))

    def test_november_2026_first_of_month_transactions_regression(self):
        """Reproduce the 2026-11-01 ledger scenario with the 4 transactions:
        - Salary: +₹20,000 (Income)
        - Shopping: -₹1,000 (Expense, Shopping)
        - Metro: -₹300 (Expense, Transport)
        - food: -₹500 (Expense, Food/Dining)
        Asserts correct income, expenses, net savings, highest expense category, and savings rate.
        """
        tx1 = Transaction(
            user_id=1,
            transaction_date=date(2026, 11, 1),
            description="Salary",
            amount=Decimal("20000.00"),
            transaction_type="income",
            category="Income",
            is_reviewed=True,
        )
        tx2 = Transaction(
            user_id=1,
            transaction_date=datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc),
            description="Shopping",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Shopping",
            is_reviewed=True,
        )
        tx3 = Transaction(
            user_id=1,
            transaction_date=date(2026, 11, 1),
            description="Metro",
            amount=Decimal("300.00"),
            transaction_type="expense",
            category="Transport",
            is_reviewed=True,
        )
        tx4 = Transaction(
            user_id=1,
            transaction_date=date(2026, 11, 1),
            description="food",
            amount=Decimal("500.00"),
            transaction_type="expense",
            category="Food/Dining",
            is_reviewed=True,
        )

        # User 2 transactions on the same day for isolation check
        tx_user2 = Transaction(
            user_id=2,
            transaction_date=date(2026, 11, 1),
            description="Bob Secret Expense",
            amount=Decimal("9999.00"),
            transaction_type="expense",
            category="Secret",
            is_reviewed=True,
        )

        self.db.add_all([tx1, tx2, tx3, tx4, tx_user2])
        self.db.commit()

        # 1. Top categories query with month="2026-11"
        req_cats = AssistantQueryRequest(query="What are my biggest spending categories?", month="2026-11")
        res_cats = query_assistant(request=req_cats, current_user=self.user1, db=self.db)
        self.assertEqual(res_cats.intent, "top_categories")
        self.assertNotIn("No category spending records have been recorded", res_cats.answer_markdown)
        self.assertIn("Shopping", res_cats.answer_markdown)
        self.assertIn("₹1,000.00", res_cats.answer_markdown)
        self.assertIn("Food/Dining", res_cats.answer_markdown)
        self.assertIn("₹500.00", res_cats.answer_markdown)
        self.assertIn("Transport", res_cats.answer_markdown)
        self.assertIn("₹300.00", res_cats.answer_markdown)
        self.assertNotIn("Bob Secret Expense", res_cats.answer_markdown)

        # 2. Savings summary query with month="2026-11"
        req_savings = AssistantQueryRequest(query="How much did I save this month?", month="2026-11")
        res_savings = query_assistant(request=req_savings, current_user=self.user1, db=self.db)
        self.assertEqual(res_savings.intent, "savings_summary")
        # Income: ₹20,000, Expenses: ₹1,800, Net savings: ₹18,200, Savings rate: 91.0%
        self.assertIn("₹20,000.00", res_savings.answer_markdown)
        self.assertIn("₹1,800.00", res_savings.answer_markdown)
        self.assertIn("₹18,200.00", res_savings.answer_markdown)
        self.assertIn("91.0%", res_savings.answer_markdown)

        # 3. Query with explicit natural month extraction: "analyze spending for November 2026"
        req_spend = AssistantQueryRequest(query="analyze spending for November 2026", month=None)
        res_spend = query_assistant(request=req_spend, current_user=self.user1, db=self.db)
        self.assertEqual(res_spend.intent, "spending_summary")
        self.assertIn("2026-11", res_spend.answer_markdown)
        self.assertIn("₹1,800.00", res_spend.answer_markdown)
        self.assertIn("Shopping", res_spend.answer_markdown)
        self.assertIn("₹1,000.00", res_spend.answer_markdown)

        # Verify fact objects
        facts_by_key = {f.metric_key: f for f in res_spend.facts}
        self.assertIn("total_expenses", facts_by_key)
        self.assertEqual(facts_by_key["total_expenses"].raw_amount, Decimal("1800.00"))

        # Verify user isolation: Bob queries November 2026
        req_bob = AssistantQueryRequest(query="What are my biggest spending categories?", month="2026-11")
        res_bob = query_assistant(request=req_bob, current_user=self.user2, db=self.db)
        self.assertIn("Secret", res_bob.answer_markdown)
        self.assertNotIn("Shopping", res_bob.answer_markdown)
        self.assertNotIn("Food/Dining", res_bob.answer_markdown)
        self.assertNotIn("Transport", res_bob.answer_markdown)

    def test_november_2026_created_via_api_and_queried(self):
        """Verify transactions created via create_transaction are correctly aggregated."""
        from app.transactions import create_transaction
        from app.schemas import TransactionCreate

        create_transaction(
            transaction_data=TransactionCreate(
                transaction_date=date(2026, 11, 1),
                description="Salary",
                amount=Decimal("20000.00"),
                transaction_type="income",
                category="Income",
            ),
            current_user=self.user1,
            db=self.db,
        )
        create_transaction(
            transaction_data=TransactionCreate(
                transaction_date=date(2026, 11, 1),
                description="Shopping",
                amount=Decimal("1000.00"),
                transaction_type="expense",
                category="Shopping",
            ),
            current_user=self.user1,
            db=self.db,
        )
        create_transaction(
            transaction_data=TransactionCreate(
                transaction_date=date(2026, 11, 1),
                description="Metro",
                amount=Decimal("300.00"),
                transaction_type="expense",
                category="Transport",
            ),
            current_user=self.user1,
            db=self.db,
        )
        create_transaction(
            transaction_data=TransactionCreate(
                transaction_date=date(2026, 11, 1),
                description="food",
                amount=Decimal("500.00"),
                transaction_type="expense",
                category="Food/Dining",
            ),
            current_user=self.user1,
            db=self.db,
        )

        req = AssistantQueryRequest(query="What are my biggest spending categories?", month="2026-11")
        res = query_assistant(request=req, current_user=self.user1, db=self.db)
        self.assertEqual(res.intent, "top_categories")
        self.assertIn("Shopping", res.answer_markdown)
        self.assertIn("₹1,000.00", res.answer_markdown)
        self.assertIn("Food/Dining", res.answer_markdown)
        self.assertIn("Transport", res.answer_markdown)


if __name__ == "__main__":
    unittest.main()

