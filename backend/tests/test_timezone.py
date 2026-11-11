from datetime import date, datetime, timezone
from decimal import Decimal
import unittest
from unittest.mock import patch

import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.alerts import get_active_alerts
from app.assistant_service import calculate_user_financial_facts, resolve_target_month
from app.budgets import get_budget_progress
from app.database import settings
from app.forecasting import generate_financial_forecast
from app.insights import get_financial_insights
from app.models import Base, Budget, RecurringPayment, SavingsGoal, Transaction, User
from app.recurring_payments import list_recurring_payments
from app.reports import download_summary_pdf, resolve_period_date_range
from app.savings_goals import add_goal_contribution, calculate_goal_progress
from app.schemas import GoalContributionCreate
from app.timezone import (
    IST_TIMEZONE,
    get_current_ist_date,
    get_current_ist_datetime,
    get_current_ist_month,
)
from app.token import create_access_token


# 2026-10-31 18:45:00 UTC == 2026-11-01 00:15:00 IST (month & calendar-date rollover!)
CROSS_MIDNIGHT_UTC_INSTANT = datetime(2026, 10, 31, 18, 45, 0, tzinfo=timezone.utc)


def _mock_now(tz=None):
    if tz is None:
        return CROSS_MIDNIGHT_UTC_INSTANT.replace(tzinfo=None)
    return CROSS_MIDNIGHT_UTC_INSTANT.astimezone(tz)


class IstBusinessTimezoneTestCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.user = User(id=1, email="ist@spendwise.ai", password_hash="hash1")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_ist_helpers_resolve_next_day_and_month_across_utc_midnight(self):
        """At 18:45 UTC on Oct 31, IST helper resolves to 2026-11-01 and month 2026-11."""
        with patch("app.timezone.datetime") as mock_dt:
            mock_dt.now.side_effect = _mock_now
            ist_dt = get_current_ist_datetime()
            self.assertEqual(ist_dt.date(), date(2026, 11, 1))
            self.assertEqual(ist_dt.tzinfo, IST_TIMEZONE)
            self.assertEqual(get_current_ist_date(), date(2026, 11, 1))
            self.assertEqual(get_current_ist_month(), "2026-11")

    def test_business_defaults_use_ist_while_jwt_and_stored_timestamps_stay_utc(self):
        """Business date/month defaults follow IST across UTC midnight; JWT claims stay UTC."""
        self.db.add(Budget(id=1, user_id=1, category="Food", month="2026-11", limit_amount=Decimal("1000.00")))
        self.db.add(
            Transaction(
                user_id=1,
                transaction_date=datetime(2026, 11, 1, 0, 5, tzinfo=timezone.utc),
                description="Late night snack",
                amount=Decimal("850.00"),
                transaction_type="expense",
                category="Food",
            )
        )
        self.db.add(
            RecurringPayment(
                user_id=1,
                description="Rent",
                amount=Decimal("5000.00"),
                category="Housing",
                frequency="monthly",
                start_date=date(2026, 10, 1),
                next_due_date=date(2026, 10, 31),
                status="active",
            )
        )
        goal = SavingsGoal(
            id=1,
            user_id=1,
            name="Emergency Fund",
            target_amount=Decimal("10000.00"),
            target_date=date(2026, 12, 31),
            status="in_progress",
        )
        self.db.add(goal)
        self.db.commit()

        from app.reports import Paragraph as RealParagraph

        captured_paragraphs: list[str] = []

        def _capturing_paragraph(text, *args, **kwargs):
            captured_paragraphs.append(str(text))
            return RealParagraph(text, *args, **kwargs)

        with patch("app.timezone.datetime") as mock_dt, patch(
            "app.reports.Paragraph", side_effect=_capturing_paragraph
        ):
            mock_dt.now.side_effect = _mock_now

            # 1. Budgets default month -> 2026-11 (IST), picks up Nov budget
            progress = get_budget_progress(month=None, current_user=self.user, db=self.db)
            self.assertEqual(progress.month, "2026-11")
            self.assertEqual(len(progress.items), 1)

            # 2. Insights default month & ref_date -> 2026-11
            insights = get_financial_insights(month=None, ref_date=None, current_user=self.user, db=self.db)
            self.assertEqual(insights.summary.current_month, "2026-11")

            # 3. Alerts default date -> 2026-11-01 (Oct 31 bill is overdue by 1 day in IST)
            alerts = get_active_alerts(user_id=self.user.id, db=self.db, ref_date=None)
            self.assertTrue(any(a.alert_type == "budget_warning" and a.metadata["month"] == "2026-11" for a in alerts))
            self.assertTrue(any(a.alert_type == "recurring_overdue" for a in alerts))

            # 4. Reports default month range & PDF IST timestamp
            r_start, r_end, label = resolve_period_date_range(
                period="this-month",
                start_date=None,
                end_date=None,
            )
            self.assertEqual((r_start, r_end, label), (date(2026, 11, 1), date(2026, 11, 1), "this-month"))
            pdf_res = download_summary_pdf(
                period="this-month",
                start_date=None,
                end_date=None,
                current_user=self.user,
                db=self.db,
            )
            self.assertEqual(pdf_res.status_code, 200)
            self.assertTrue(pdf_res.body.startswith(b"%PDF"))
            self.assertTrue(any("01 Nov 2026, 00:15 IST" in p for p in captured_paragraphs))

            # 5. Recurring payments overdue check uses IST date (2026-11-01 > 2026-10-31)
            rec_list = list_recurring_payments(
                status_filter=None,
                category=None,
                frequency=None,
                ref_date=None,
                current_user=self.user,
                db=self.db,
            )
            self.assertEqual(len(rec_list), 1)
            self.assertTrue(rec_list[0].is_overdue)
            self.assertEqual(rec_list[0].days_until_due, -1)

            # 6. Savings goals default today uses IST date
            goal_prog = calculate_goal_progress(goal)
            self.assertEqual(goal_prog.days_remaining, 60)  # Nov 1 -> Dec 31 is 60 days
            contrib = add_goal_contribution(
                goal_id=1,
                payload=GoalContributionCreate(amount=Decimal("500.00")),
                current_user=self.user,
                db=self.db,
            )
            self.assertEqual(contrib.recent_contributions[0].contribution_date, date(2026, 11, 1))

            # 7. Forecasting default ref_date uses IST (2026-11-01)
            forecast = generate_financial_forecast(
                db=self.db,
                current_user=self.user,
                horizon_months=1,
                ref_date=None,
            )
            self.assertEqual(forecast.reference_date, date(2026, 11, 1))
            self.assertEqual(forecast.current_month_forecast.month, "2026-11")

            # 8. Assistant target month & financial facts use IST month/date
            self.assertEqual(resolve_target_month("how is my budget?", "budget_status"), "2026-11")
            facts = calculate_user_financial_facts(self.user, self.db)
            self.assertEqual(facts.summary.month, "2026-11")

        # 9. JWT iat/exp claims remain UTC-based
        token = create_access_token(user_id=1)
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        now_utc_ts = datetime.now(timezone.utc).timestamp()
        self.assertLess(abs(payload["iat"] - now_utc_ts), 10)
        self.assertLess(abs((payload["exp"] - payload["iat"]) - settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60), 2)
