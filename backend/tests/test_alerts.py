from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.alerts import (
    dismiss_alert,
    dismiss_all_alerts,
    generate_anomaly_alerts,
    generate_budget_alerts,
    generate_recurring_alerts,
    get_active_alerts,
    list_alerts,
)
from app.dependencies import get_db
from app.main import app
from app.models import AlertDismissal, Base, Budget, RecurringPayment, Transaction, User


class SmartFinancialAlertsTestCase(unittest.TestCase):
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

        # Fixed reference date
        self.ref_date = date(2026, 11, 2)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    # -------------------------------------------------------------------------
    # 1. Budget Alerts & Threshold Boundaries
    # -------------------------------------------------------------------------
    def test_budget_below_80_percent_no_alert(self):
        """Budget spent below 80% (e.g. 79.9%) must not trigger an alert."""
        b = Budget(id=1, user_id=1, category="Groceries", month="2026-11", limit_amount=Decimal("1000.00"))
        tx = Transaction(
            id=1,
            user_id=1,
            transaction_date=datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc),
            description="Supermarket",
            amount=Decimal("799.00"),
            transaction_type="expense",
            category="Groceries",
        )
        self.db.add_all([b, tx])
        self.db.commit()

        alerts = generate_budget_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 0)

    def test_budget_at_exactly_80_percent_triggers_warning(self):
        """Budget spent at exactly 80.0% must trigger a warning alert with tier in key."""
        b = Budget(id=1, user_id=1, category="Groceries", month="2026-11", limit_amount=Decimal("1000.00"))
        tx = Transaction(
            id=1,
            user_id=1,
            transaction_date=datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc),
            description="Supermarket",
            amount=Decimal("800.00"),
            transaction_type="expense",
            category="Groceries",
        )
        self.db.add_all([b, tx])
        self.db.commit()

        alerts = generate_budget_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 1)
        alert = alerts[0]
        self.assertEqual(alert.id, "budget:1:2026-11:warning")
        self.assertEqual(alert.alert_type, "budget_warning")
        self.assertEqual(alert.severity, "warning")
        self.assertIn("Approaching Budget Limit", alert.title)
        self.assertIn("80.0% used", alert.message)
        self.assertIn("₹800.00", alert.message)
        self.assertEqual(alert.link_to, "/budgets")
        self.assertEqual(alert.metadata["tier"], "warning")

    def test_budget_at_99_9_percent_is_warning(self):
        """Budget spent at 99.9% remains a warning alert."""
        b = Budget(id=1, user_id=1, category="Dining", month="2026-11", limit_amount=Decimal("1000.00"))
        tx = Transaction(
            id=1,
            user_id=1,
            transaction_date=datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc),
            description="Dinner",
            amount=Decimal("999.00"),
            transaction_type="expense",
            category="Dining",
        )
        self.db.add_all([b, tx])
        self.db.commit()

        alerts = generate_budget_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0].severity, "warning")
        self.assertEqual(alerts[0].id, "budget:1:2026-11:warning")

    def test_budget_at_100_percent_and_above_triggers_critical(self):
        """Budget spent at >= 100% triggers critical budget_exceeded alert."""
        b = Budget(id=1, user_id=1, category="Shopping", month="2026-11", limit_amount=Decimal("5000.00"))
        tx = Transaction(
            id=1,
            user_id=1,
            transaction_date=datetime(2026, 11, 2, 10, 0, tzinfo=timezone.utc),
            description="Clothes",
            amount=Decimal("5250.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add_all([b, tx])
        self.db.commit()

        alerts = generate_budget_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 1)
        alert = alerts[0]
        self.assertEqual(alert.id, "budget:1:2026-11:critical")
        self.assertEqual(alert.alert_type, "budget_exceeded")
        self.assertEqual(alert.severity, "critical")
        self.assertIn("Budget Exceeded", alert.title)
        self.assertIn("105.0% used", alert.message)
        self.assertEqual(alert.metadata["tier"], "critical")

    def test_budget_at_exact_100_percent_vs_rounded_100_percent(self):
        """Exact 100% triggers Budget Limit Reached; 9999.60/10000.00 remains a warning alert."""
        b_exact = Budget(id=1, user_id=1, category="Utilities", month="2026-11", limit_amount=Decimal("1000.00"))
        b_near = Budget(id=2, user_id=1, category="Travel", month="2026-11", limit_amount=Decimal("10000.00"))
        tx1 = Transaction(
            id=1,
            user_id=1,
            transaction_date=datetime(2026, 11, 2, 10, 0, tzinfo=timezone.utc),
            description="Power bill",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Utilities",
        )
        tx2 = Transaction(
            id=2,
            user_id=1,
            transaction_date=datetime(2026, 11, 2, 11, 0, tzinfo=timezone.utc),
            description="Flight ticket",
            amount=Decimal("9999.60"),
            transaction_type="expense",
            category="Travel",
        )
        self.db.add_all([b_exact, b_near, tx1, tx2])
        self.db.commit()

        alerts = generate_budget_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        by_cat = {a.metadata["category"]: a for a in alerts}

        self.assertIn("Budget Limit Reached", by_cat["Utilities"].title)
        self.assertEqual(by_cat["Utilities"].severity, "critical")
        self.assertEqual(by_cat["Utilities"].metadata["status"], "limit_reached")

        self.assertIn("Approaching Budget Limit", by_cat["Travel"].title)
        self.assertEqual(by_cat["Travel"].alert_type, "budget_warning")
        self.assertEqual(by_cat["Travel"].severity, "warning")
        self.assertEqual(by_cat["Travel"].metadata["status"], "approaching_limit")

    def test_budget_ignores_income_and_non_matching_month(self):
        """Income transactions and expenses from other months must not affect budget spent amount."""
        b = Budget(id=1, user_id=1, category="Groceries", month="2026-11", limit_amount=Decimal("1000.00"))
        tx_income = Transaction(
            id=1,
            user_id=1,
            transaction_date=datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc),
            description="Refund",
            amount=Decimal("900.00"),
            transaction_type="income",
            category="Groceries",
        )
        tx_october = Transaction(
            id=2,
            user_id=1,
            transaction_date=datetime(2026, 10, 31, 23, 59, tzinfo=timezone.utc),
            description="Oct Grocery",
            amount=Decimal("950.00"),
            transaction_type="expense",
            category="Groceries",
        )
        self.db.add_all([b, tx_income, tx_october])
        self.db.commit()

        alerts = generate_budget_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 0)

    # -------------------------------------------------------------------------
    # 2. Escalation After Dismissal
    # -------------------------------------------------------------------------
    def test_escalation_after_dismissing_warning_re_triggers_critical(self):
        """Dismissing an 80% warning must NOT suppress a later 100% critical alert."""
        b = Budget(id=1, user_id=1, category="Dining", month="2026-11", limit_amount=Decimal("1000.00"))
        tx1 = Transaction(
            id=1,
            user_id=1,
            transaction_date=datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc),
            description="Lunch",
            amount=Decimal("850.00"),
            transaction_type="expense",
            category="Dining",
        )
        self.db.add_all([b, tx1])
        self.db.commit()

        # Step 1: User gets warning alert
        alerts_step1 = get_active_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts_step1), 1)
        self.assertEqual(alerts_step1[0].id, "budget:1:2026-11:warning")

        # Step 2: User dismisses warning alert
        dismiss_resp = dismiss_alert(alert_key="budget:1:2026-11:warning", current_user=self.user1, db=self.db)
        self.assertTrue(dismiss_resp.success)

        # Alerts should now be empty
        alerts_dismissed = get_active_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts_dismissed), 0)

        # Step 3: Spending increases to 105% (budget exceeded)
        tx2 = Transaction(
            id=2,
            user_id=1,
            transaction_date=datetime(2026, 11, 2, 14, 0, tzinfo=timezone.utc),
            description="Dinner",
            amount=Decimal("200.00"),
            transaction_type="expense",
            category="Dining",
        )
        self.db.add(tx2)
        self.db.commit()

        # Step 4: Critical alert surfaces with new key
        alerts_step3 = get_active_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts_step3), 1)
        self.assertEqual(alerts_step3[0].id, "budget:1:2026-11:critical")
        self.assertEqual(alerts_step3[0].severity, "critical")

    # -------------------------------------------------------------------------
    # 3. Recurring Payment Reminders (Upcoming & Overdue)
    # -------------------------------------------------------------------------
    def test_recurring_upcoming_window_today_through_three_days(self):
        """Active bills due today, tomorrow, +2d, +3d are alerted; +4d is excluded."""
        # Due today (2026-11-02)
        r_today = RecurringPayment(
            id=1, user_id=1, description="Internet", amount=Decimal("999.00"),
            category="Utilities", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 2), status="active", is_active=True,
        )
        # Due tomorrow (2026-11-03)
        r_tomorrow = RecurringPayment(
            id=2, user_id=1, description="Gym", amount=Decimal("1500.00"),
            category="Health", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 3), status="active", is_active=True,
        )
        # Due in 2 days (2026-11-04)
        r_in_2d = RecurringPayment(
            id=3, user_id=1, description="Netflix", amount=Decimal("649.00"),
            category="Entertainment", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 4), status="active", is_active=True,
        )
        # Due in 3 days (2026-11-05) - boundary test (inclusive)
        r_in_3d = RecurringPayment(
            id=4, user_id=1, description="Cloud Storage", amount=Decimal("219.00"),
            category="Utilities", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 5), status="active", is_active=True,
        )
        # Due in 4 days (2026-11-06) - boundary test (must be excluded)
        r_in_4d = RecurringPayment(
            id=5, user_id=1, description="Insurance", amount=Decimal("5000.00"),
            category="Insurance", frequency="yearly", start_date=date(2025, 11, 6),
            next_due_date=date(2026, 11, 6), status="active", is_active=True,
        )
        self.db.add_all([r_today, r_tomorrow, r_in_2d, r_in_3d, r_in_4d])
        self.db.commit()

        alerts = generate_recurring_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        alert_ids = [a.id for a in alerts]
        self.assertEqual(len(alerts), 4)
        self.assertIn("recurring_upcoming:1:2026-11-02", alert_ids)
        self.assertIn("recurring_upcoming:2:2026-11-03", alert_ids)
        self.assertIn("recurring_upcoming:3:2026-11-04", alert_ids)
        self.assertIn("recurring_upcoming:4:2026-11-05", alert_ids)
        self.assertNotIn("recurring_upcoming:5:2026-11-06", alert_ids)

        # Verify labels
        today_alert = next(a for a in alerts if a.id == "recurring_upcoming:1:2026-11-02")
        self.assertIn("is due today", today_alert.message)
        self.assertEqual(today_alert.link_to, "/recurring")
        tomorrow_alert = next(a for a in alerts if a.id == "recurring_upcoming:2:2026-11-03")
        self.assertIn("is due tomorrow", tomorrow_alert.message)
        self.assertEqual(tomorrow_alert.link_to, "/recurring")
        in_3d_alert = next(a for a in alerts if a.id == "recurring_upcoming:4:2026-11-05")
        self.assertIn("is due in 3 days", in_3d_alert.message)
        self.assertEqual(in_3d_alert.link_to, "/recurring")

    def test_recurring_overdue_alert(self):
        """Active bills past due date must trigger recurring_overdue critical alerts."""
        r_overdue = RecurringPayment(
            id=1, user_id=1, description="Electricity Bill", amount=Decimal("2450.00"),
            category="Utilities", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 10, 30), status="active", is_active=True,
        )
        self.db.add(r_overdue)
        self.db.commit()

        alerts = generate_recurring_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 1)
        alert = alerts[0]
        self.assertEqual(alert.id, "recurring_overdue:1:2026-10-30")
        self.assertEqual(alert.alert_type, "recurring_overdue")
        self.assertEqual(alert.severity, "critical")
        self.assertEqual(alert.link_to, "/recurring")
        self.assertIn("3 days overdue", alert.message)
        self.assertEqual(alert.metadata["days_overdue"], 3)

    def test_recurring_ignores_cancelled_and_inactive(self):
        """Cancelled or inactive recurring payments must never generate alerts."""
        r_cancelled = RecurringPayment(
            id=1, user_id=1, description="Cancelled Magazine", amount=Decimal("300.00"),
            category="Entertainment", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 2), status="cancelled", is_active=True,
        )
        r_inactive = RecurringPayment(
            id=2, user_id=1, description="Inactive Gym", amount=Decimal("1200.00"),
            category="Health", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 2), status="active", is_active=False,
        )
        self.db.add_all([r_cancelled, r_inactive])
        self.db.commit()

        alerts = generate_recurring_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 0)

    # -------------------------------------------------------------------------
    # 4. Spending Anomaly Alerts (INR formatting, 7-day window, baseline)
    # -------------------------------------------------------------------------
    def test_spending_anomaly_detection_with_std_dev(self):
        """Outlier expense in last 7 days exceeding mean + 2.5 std dev triggers anomaly alert."""
        # 3 baseline expenses in Dining
        tx_base1 = Transaction(
            id=1, user_id=1, transaction_date=datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc),
            description="Lunch 1", amount=Decimal("200.00"), transaction_type="expense", category="Dining",
        )
        tx_base2 = Transaction(
            id=2, user_id=1, transaction_date=datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc),
            description="Lunch 2", amount=Decimal("220.00"), transaction_type="expense", category="Dining",
        )
        tx_base3 = Transaction(
            id=3, user_id=1, transaction_date=datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc),
            description="Lunch 3", amount=Decimal("210.00"), transaction_type="expense", category="Dining",
        )
        # Outlier purchase 2 days ago (2026-10-31)
        tx_outlier = Transaction(
            id=4, user_id=1, transaction_date=datetime(2026, 10, 31, 19, 0, tzinfo=timezone.utc),
            description="Luxury Dinner", amount=Decimal("2500.00"), transaction_type="expense", category="Dining",
        )
        self.db.add_all([tx_base1, tx_base2, tx_base3, tx_outlier])
        self.db.commit()

        alerts = generate_anomaly_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 1)
        alert = alerts[0]
        self.assertEqual(alert.id, "anomaly:4")
        self.assertEqual(alert.alert_type, "spending_anomaly")
        self.assertEqual(alert.severity, "warning")
        self.assertIn("Unusual Expense in Dining", alert.title)
        self.assertIn("₹2,500.00", alert.message)
        self.assertIn("Dining", alert.message)
        self.assertIn("standard deviations above baseline", alert.message)
        self.assertEqual(alert.link_to, "/transactions")

    def test_spending_anomaly_zero_variance_case(self):
        """Identical past purchases (zero variance) with a >= 1.5x spike triggers anomaly alert."""
        tx1 = Transaction(
            id=1, user_id=1, transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
            description="Coffee", amount=Decimal("150.00"), transaction_type="expense", category="Coffee",
        )
        tx2 = Transaction(
            id=2, user_id=1, transaction_date=datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc),
            description="Coffee", amount=Decimal("150.00"), transaction_type="expense", category="Coffee",
        )
        tx3 = Transaction(
            id=3, user_id=1, transaction_date=datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc),
            description="Coffee", amount=Decimal("150.00"), transaction_type="expense", category="Coffee",
        )
        tx_spike = Transaction(
            id=4, user_id=1, transaction_date=datetime(2026, 11, 1, 15, 0, tzinfo=timezone.utc),
            description="Coffee Machine", amount=Decimal("600.00"), transaction_type="expense", category="Coffee",
        )
        self.db.add_all([tx1, tx2, tx3, tx_spike])
        self.db.commit()

        alerts = generate_anomaly_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0].id, "anomaly:4")
        self.assertIn("fixed baseline", alerts[0].message)

    def test_anomaly_ignored_when_insufficient_baseline(self):
        """Fewer than 3 historical transactions in category must not produce false-positive anomaly alert."""
        tx1 = Transaction(
            id=1, user_id=1, transaction_date=datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc),
            description="Electronics", amount=Decimal("500.00"), transaction_type="expense", category="Electronics",
        )
        tx2 = Transaction(
            id=2, user_id=1, transaction_date=datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc),
            description="TV", amount=Decimal("50000.00"), transaction_type="expense", category="Electronics",
        )
        self.db.add_all([tx1, tx2])
        self.db.commit()

        alerts = generate_anomaly_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 0)

    def test_anomaly_ignored_when_outside_7_day_recent_window(self):
        """Outlier expense older than 7 calendar days must not trigger recent alert."""
        tx1 = Transaction(
            id=1, user_id=1, transaction_date=datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc),
            description="Meal 1", amount=Decimal("100.00"), transaction_type="expense", category="Meals",
        )
        tx2 = Transaction(
            id=2, user_id=1, transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="Meal 2", amount=Decimal("100.00"), transaction_type="expense", category="Meals",
        )
        tx3 = Transaction(
            id=3, user_id=1, transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
            description="Meal 3", amount=Decimal("100.00"), transaction_type="expense", category="Meals",
        )
        # Outlier 15 days ago (outside 7-day window)
        tx_old_outlier = Transaction(
            id=4, user_id=1, transaction_date=datetime(2026, 10, 18, 12, 0, tzinfo=timezone.utc),
            description="Big Banquet", amount=Decimal("5000.00"), transaction_type="expense", category="Meals",
        )
        self.db.add_all([tx1, tx2, tx3, tx_old_outlier])
        self.db.commit()

        alerts = generate_anomaly_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alerts), 0)

    def test_architectural_distinction_insights_monthly_vs_alerts_rolling_window(self):
        """Demonstrate and verify the intentional distinction between Insights and Alerts:

        - Retrospective Insights page detects anomalies across the entire chosen calendar month (e.g. October).
        - Real-time Alerts feed evaluates only recent transactions from the 7-day rolling window
          (ref_date - 7 days to ref_date), avoiding stale alerts from earlier in the month.
        Both share the exact same statistical outlier formula and INR formatting from app.insights.
        """
        from app.insights import detect_unusual_expenses

        # 4 baseline meals in Dining around ₹150 in early October
        base_txs = [
            Transaction(
                id=1, user_id=1, transaction_date=datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc),
                description="Meal 1", amount=Decimal("150.00"), transaction_type="expense", category="Dining",
            ),
            Transaction(
                id=2, user_id=1, transaction_date=datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc),
                description="Meal 2", amount=Decimal("155.00"), transaction_type="expense", category="Dining",
            ),
            Transaction(
                id=3, user_id=1, transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
                description="Meal 3", amount=Decimal("150.00"), transaction_type="expense", category="Dining",
            ),
            Transaction(
                id=4, user_id=1, transaction_date=datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc),
                description="Meal 4", amount=Decimal("152.00"), transaction_type="expense", category="Dining",
            ),
        ]
        # Anomaly occurring earlier in October (Oct 10)
        old_anomaly = Transaction(
            id=5, user_id=1, transaction_date=datetime(2026, 10, 10, 20, 0, tzinfo=timezone.utc),
            description="Banquet", amount=Decimal("2500.00"), transaction_type="expense", category="Dining",
        )
        all_txs = base_txs + [old_anomaly]
        self.db.add_all(all_txs)
        self.db.commit()

        # 1. Monthly Insights evaluation for October 2026:
        # The Oct 10 anomaly is within October, so it IS detected in the retrospective monthly report.
        insights_anomalies = detect_unusual_expenses(
            candidate_txs=all_txs,
            history_txs=all_txs,
            selected_month="2026-10",
        )
        self.assertEqual(len(insights_anomalies), 1)
        self.assertEqual(insights_anomalies[0].id, "anomaly-tx-5-2026-10")
        self.assertIn("₹2,500.00", insights_anomalies[0].description)

        # 2. Alerts evaluation as of ref_date = 2026-11-02:
        # The Oct 10 anomaly is 23 days old (> 7 days), so it is intentionally excluded from active alerts.
        alert_items = generate_anomaly_alerts(user_id=1, db=self.db, ref_date=self.ref_date)
        self.assertEqual(len(alert_items), 0)

        # 3. But when evaluated on Oct 12 (within 7 days of the Oct 10 transaction):
        # The anomaly alert is active and shares the exact description and calculations!
        fresh_alerts = generate_anomaly_alerts(user_id=1, db=self.db, ref_date=date(2026, 10, 12))
        self.assertEqual(len(fresh_alerts), 1)
        self.assertEqual(fresh_alerts[0].id, "anomaly:5")
        self.assertEqual(fresh_alerts[0].message, insights_anomalies[0].description)



    # -------------------------------------------------------------------------
    # 5. Repeat Request Stability & Ordering
    # -------------------------------------------------------------------------
    def test_repeat_request_stability_and_predictable_keys(self):
        """Consecutive calls return identical lists, stable keys, and no duplicate items."""
        b = Budget(id=1, user_id=1, category="Groceries", month="2026-11", limit_amount=Decimal("1000.00"))
        tx_b = Transaction(
            id=1, user_id=1, transaction_date=datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc),
            description="Groceries", amount=Decimal("850.00"), transaction_type="expense", category="Groceries",
        )
        r = RecurringPayment(
            id=1, user_id=1, description="Wifi", amount=Decimal("800.00"),
            category="Utilities", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 2), status="active", is_active=True,
        )
        self.db.add_all([b, tx_b, r])
        self.db.commit()

        resp1 = list_alerts(ref_date=self.ref_date, current_user=self.user1, db=self.db)
        resp2 = list_alerts(ref_date=self.ref_date, current_user=self.user1, db=self.db)

        self.assertEqual(resp1.alert_count, 2)
        self.assertEqual(resp1.active_count, 2)
        self.assertEqual(resp1.alert_count, resp2.alert_count)
        self.assertEqual([a.id for a in resp1.alerts], [a.id for a in resp2.alerts])

    # -------------------------------------------------------------------------
    # 6. Empty Data
    # -------------------------------------------------------------------------
    def test_empty_financial_records_returns_empty_alert_list(self):
        """User with no records receives zero alerts and clean counts."""
        resp = list_alerts(ref_date=self.ref_date, current_user=self.user1, db=self.db)
        self.assertEqual(resp.alert_count, 0)
        self.assertEqual(resp.active_count, 0)
        self.assertEqual(len(resp.alerts), 0)

    # -------------------------------------------------------------------------
    # 7. Date Boundaries & Month Transitions
    # -------------------------------------------------------------------------
    def test_month_boundary_transitions(self):
        """Budget for October is not evaluated as current-month budget on November 1."""
        b_oct = Budget(id=1, user_id=1, category="Groceries", month="2026-10", limit_amount=Decimal("1000.00"))
        tx_oct = Transaction(
            id=1, user_id=1, transaction_date=datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc),
            description="Oct Supermarket", amount=Decimal("1200.00"), transaction_type="expense", category="Groceries",
        )
        self.db.add_all([b_oct, tx_oct])
        self.db.commit()

        # Evaluated on Oct 31 -> critical alert
        oct_alerts = generate_budget_alerts(user_id=1, db=self.db, ref_date=date(2026, 10, 31))
        self.assertEqual(len(oct_alerts), 1)
        self.assertEqual(oct_alerts[0].id, "budget:1:2026-10:critical")

        # Evaluated on Nov 1 -> no active budget for 2026-11 yet
        nov_alerts = generate_budget_alerts(user_id=1, db=self.db, ref_date=date(2026, 11, 1))
        self.assertEqual(len(nov_alerts), 0)

    # -------------------------------------------------------------------------
    # 8. Malformed Keys & Idempotent Dismissals
    # -------------------------------------------------------------------------
    def test_dismiss_individual_alert_and_idempotent_retry(self):
        """Dismissing an alert key stores dismissal; dismissing again succeeds idempotently."""
        r = RecurringPayment(
            id=10, user_id=1, description="Streaming", amount=Decimal("499.00"),
            category="Entertainment", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 2), status="active", is_active=True,
        )
        self.db.add(r)
        self.db.commit()

        key = "recurring_upcoming:10:2026-11-02"

        # First dismissal
        res1 = dismiss_alert(alert_key=key, current_user=self.user1, db=self.db)
        self.assertTrue(res1.success)

        # Repeated dismissal of same key
        res2 = dismiss_alert(alert_key=key, current_user=self.user1, db=self.db)
        self.assertTrue(res2.success)

        # Verify only one row persisted in db
        rows = list(self.db.scalars(select(AlertDismissal).where(AlertDismissal.user_id == 1, AlertDismissal.alert_key == key)).all())
        self.assertEqual(len(rows), 1)

    def test_dismiss_malformed_key_raises_422(self):
        """Empty or whitespace-only alert key raises HTTP 422."""
        with self.assertRaises(HTTPException) as ctx:
            dismiss_alert(alert_key="   ", current_user=self.user1, db=self.db)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_dismiss_all_active_alerts(self):
        """dismiss_all_alerts dismisses all currently active alerts in a single call."""
        b = Budget(id=1, user_id=1, category="Fuel", month="2026-11", limit_amount=Decimal("2000.00"))
        tx = Transaction(
            id=1, user_id=1, transaction_date=datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc),
            description="Petrol", amount=Decimal("2100.00"), transaction_type="expense", category="Fuel",
        )
        r = RecurringPayment(
            id=1, user_id=1, description="Gym", amount=Decimal("1500.00"),
            category="Health", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 11, 2), status="active", is_active=True,
        )
        self.db.add_all([b, tx, r])
        self.db.commit()

        # Before dismiss-all: 2 active alerts
        before = list_alerts(ref_date=self.ref_date, current_user=self.user1, db=self.db)
        self.assertEqual(before.alert_count, 2)

        # Execute dismiss-all
        dismiss_all_res = dismiss_all_alerts(ref_date=self.ref_date, current_user=self.user1, db=self.db)
        self.assertTrue(dismiss_all_res.success)
        self.assertEqual(dismiss_all_res.dismissed_count, 2)

        # After dismiss-all: 0 active alerts
        after = list_alerts(ref_date=self.ref_date, current_user=self.user1, db=self.db)
        self.assertEqual(after.alert_count, 0)
        self.assertEqual(after.active_count, 0)

        # Calling dismiss-all again when already cleared returns dismissed_count=0
        repeat_dismiss_all = dismiss_all_alerts(ref_date=self.ref_date, current_user=self.user1, db=self.db)
        self.assertEqual(repeat_dismiss_all.dismissed_count, 0)

    # -------------------------------------------------------------------------
    # 9. Cross-User Isolation
    # -------------------------------------------------------------------------
    def test_strict_cross_user_isolation(self):
        """User 1's alerts must never be visible to User 2, and User 2's dismissals must not affect User 1."""
        # User 1 has an overdue bill
        r_u1 = RecurringPayment(
            id=1, user_id=1, description="User 1 Rent", amount=Decimal("15000.00"),
            category="Rent", frequency="monthly", start_date=date(2026, 1, 1),
            next_due_date=date(2026, 10, 31), status="active", is_active=True,
        )
        # User 2 has an approaching budget
        b_u2 = Budget(id=2, user_id=2, category="Dining", month="2026-11", limit_amount=Decimal("3000.00"))
        tx_u2 = Transaction(
            id=2, user_id=2, transaction_date=datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc),
            description="User 2 Dinner", amount=Decimal("2700.00"), transaction_type="expense", category="Dining",
        )
        self.db.add_all([r_u1, b_u2, tx_u2])
        self.db.commit()

        # User 1 sees only User 1's alerts
        u1_res = list_alerts(ref_date=self.ref_date, current_user=self.user1, db=self.db)
        self.assertEqual(u1_res.alert_count, 1)
        self.assertEqual(u1_res.alerts[0].id, "recurring_overdue:1:2026-10-31")

        # User 2 sees only User 2's alerts
        u2_res = list_alerts(ref_date=self.ref_date, current_user=self.user2, db=self.db)
        self.assertEqual(u2_res.alert_count, 1)
        self.assertEqual(u2_res.alerts[0].id, "budget:2:2026-11:warning")

        # User 2 dismisses all their alerts
        u2_dismiss = dismiss_all_alerts(ref_date=self.ref_date, current_user=self.user2, db=self.db)
        self.assertEqual(u2_dismiss.dismissed_count, 1)

        # User 2 now has 0 alerts
        u2_after = list_alerts(ref_date=self.ref_date, current_user=self.user2, db=self.db)
        self.assertEqual(u2_after.alert_count, 0)

        # User 1 still has their 1 active alert completely unaffected
        u1_after = list_alerts(ref_date=self.ref_date, current_user=self.user1, db=self.db)
        self.assertEqual(u1_after.alert_count, 1)
        self.assertEqual(u1_after.alerts[0].id, "recurring_overdue:1:2026-10-31")

