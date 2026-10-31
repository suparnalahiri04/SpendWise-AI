from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.dependencies import get_db
from app.main import app
from app.models import Base, RecurringPayment, User
from app.recurring_payments import (
    calculate_monthly_equivalent,
    cancel_recurring_payment,
    create_recurring_payment,
    delete_recurring_payment,
    get_overdue_recurring_payments,
    get_recurring_payment,
    get_recurring_payments_summary,
    get_upcoming_recurring_payments,
    list_recurring_payments,
    update_recurring_payment,
)
from app.schemas import RecurringPaymentCreate, RecurringPaymentUpdate


class RecurringPaymentsTestCase(unittest.TestCase):
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

        # Fixed reference date for deterministic testing
        self.ref_date = date(2026, 10, 31)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_calculate_monthly_equivalent(self):
        # Monthly remains identical
        self.assertEqual(calculate_monthly_equivalent(Decimal("1000.00"), "monthly"), Decimal("1000.00"))
        # Weekly: 100 * 52 / 12 = 433.33
        self.assertEqual(calculate_monthly_equivalent(Decimal("100.00"), "weekly"), Decimal("433.33"))
        # Quarterly: 3000 / 3 = 1000.00
        self.assertEqual(calculate_monthly_equivalent(Decimal("3000.00"), "quarterly"), Decimal("1000.00"))
        # Yearly: 12000 / 12 = 1000.00
        self.assertEqual(calculate_monthly_equivalent(Decimal("12000.00"), "yearly"), Decimal("1000.00"))

    def test_create_recurring_payment_success(self):
        payload = RecurringPaymentCreate(
            description="Netflix Subscription",
            amount=Decimal("649.00"),
            category="Entertainment",
            frequency="monthly",
            start_date=date(2026, 10, 1),
            next_due_date=date(2026, 11, 1),
        )
        res = create_recurring_payment(payment_data=payload, current_user=self.user1, db=self.db)
        self.assertIsNotNone(res.id)
        self.assertEqual(res.user_id, self.user1.id)
        self.assertEqual(res.description, "Netflix Subscription")
        self.assertEqual(res.amount, Decimal("649.00"))
        self.assertEqual(res.category, "Entertainment")
        self.assertEqual(res.frequency, "monthly")
        self.assertEqual(res.start_date, date(2026, 10, 1))
        self.assertEqual(res.next_due_date, date(2026, 11, 1))
        self.assertEqual(res.status, "active")
        self.assertTrue(res.is_active)

    def test_create_recurring_payment_defaults(self):
        payload = RecurringPaymentCreate(
            description="Gym Membership",
            amount=Decimal("2000.00"),
            frequency="monthly",
        )
        res = create_recurring_payment(payment_data=payload, current_user=self.user1, db=self.db)
        self.assertEqual(res.category, "Other")
        self.assertIsNotNone(res.start_date)
        self.assertEqual(res.next_due_date, res.start_date)

    def test_create_recurring_payment_validation(self):
        # Reject empty description in handler
        with self.assertRaises(HTTPException) as ctx:
            create_recurring_payment(
                payment_data=RecurringPaymentCreate(
                    description="   ",
                    amount=Decimal("500.00"),
                    frequency="monthly",
                ),
                current_user=self.user1,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 422)

        # Reject zero or negative amount in schema validation
        with self.assertRaises(Exception):
            RecurringPaymentCreate(
                description="Valid",
                amount=Decimal("0.00"),
                frequency="monthly",
            )

        with self.assertRaises(Exception):
            RecurringPaymentCreate(
                description="Valid",
                amount=Decimal("-10.00"),
                frequency="monthly",
            )

        # Reject invalid frequency in schema validation
        with self.assertRaises(Exception):
            RecurringPaymentCreate(
                description="Valid",
                amount=Decimal("100.00"),
                frequency="biweekly",  # type: ignore
            )

    def test_list_recurring_payments_and_user_isolation(self):
        p1 = RecurringPayment(
            user_id=self.user1.id,
            description="Internet Bill",
            amount=Decimal("999.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 10, 1),
            next_due_date=date(2026, 11, 5),
            status="active",
            is_active=True,
        )
        p2 = RecurringPayment(
            user_id=self.user1.id,
            description="Cancelled Sub",
            amount=Decimal("199.00"),
            category="Entertainment",
            frequency="monthly",
            start_date=date(2026, 9, 1),
            next_due_date=date(2026, 10, 1),
            status="cancelled",
            is_active=False,
        )
        p3 = RecurringPayment(
            user_id=self.user2.id,
            description="User2 Rent",
            amount=Decimal("15000.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 10, 1),
            next_due_date=date(2026, 11, 1),
            status="active",
            is_active=True,
        )
        self.db.add_all([p1, p2, p3])
        self.db.commit()

        # User 1 lists all payments
        all_user1 = list_recurring_payments(
            status_filter=None,
            category=None,
            frequency=None,
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(len(all_user1), 2)
        descriptions = [p.description for p in all_user1]
        self.assertIn("Internet Bill", descriptions)
        self.assertIn("Cancelled Sub", descriptions)
        self.assertNotIn("User2 Rent", descriptions)

        # Filter by status="active"
        active_user1 = list_recurring_payments(
            status_filter="active",
            category=None,
            frequency=None,
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(len(active_user1), 1)
        self.assertEqual(active_user1[0].description, "Internet Bill")

        # Filter by category="Entertainment"
        ent_user1 = list_recurring_payments(
            status_filter="all",
            category="Entertainment",
            frequency=None,
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(len(ent_user1), 1)
        self.assertEqual(ent_user1[0].description, "Cancelled Sub")

        # User 2 lists payments
        user2_list = list_recurring_payments(
            status_filter=None,
            category=None,
            frequency=None,
            ref_date=self.ref_date,
            current_user=self.user2,
            db=self.db,
        )
        self.assertEqual(len(user2_list), 1)
        self.assertEqual(user2_list[0].description, "User2 Rent")

    def test_get_single_recurring_payment(self):
        p1 = RecurringPayment(
            user_id=self.user1.id,
            description="Spotify",
            amount=Decimal("119.00"),
            category="Entertainment",
            frequency="monthly",
            start_date=date(2026, 10, 1),
            next_due_date=date(2026, 11, 10),
            status="active",
            is_active=True,
        )
        self.db.add(p1)
        self.db.commit()

        # User 1 retrieves
        res = get_recurring_payment(payment_id=p1.id, ref_date=self.ref_date, current_user=self.user1, db=self.db)
        self.assertEqual(res.id, p1.id)
        self.assertEqual(res.days_until_due, 10)  # Nov 10 - Oct 31 = 10 days
        self.assertFalse(res.is_overdue)

        # User 2 receives 404
        with self.assertRaises(HTTPException) as ctx:
            get_recurring_payment(payment_id=p1.id, ref_date=self.ref_date, current_user=self.user2, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_update_recurring_payment(self):
        p1 = RecurringPayment(
            user_id=self.user1.id,
            description="Broadband",
            amount=Decimal("799.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 10, 1),
            next_due_date=date(2026, 11, 1),
            status="active",
            is_active=True,
        )
        self.db.add(p1)
        self.db.commit()

        # Update amount and next_due_date
        update_payload = RecurringPaymentUpdate(
            amount=Decimal("899.00"),
            next_due_date=date(2026, 11, 15),
        )
        updated = update_recurring_payment(
            payment_id=p1.id,
            payment_data=update_payload,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(updated.amount, Decimal("899.00"))
        self.assertEqual(updated.next_due_date, date(2026, 11, 15))
        self.assertEqual(updated.description, "Broadband")  # Unchanged

        # User 2 cannot update User 1's payment
        with self.assertRaises(HTTPException) as ctx:
            update_recurring_payment(
                payment_id=p1.id,
                payment_data=update_payload,
                current_user=self.user2,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_cancel_recurring_payment(self):
        p1 = RecurringPayment(
            user_id=self.user1.id,
            description="Magazine",
            amount=Decimal("150.00"),
            category="Entertainment",
            frequency="monthly",
            start_date=date(2026, 10, 1),
            next_due_date=date(2026, 11, 1),
            status="active",
            is_active=True,
        )
        self.db.add(p1)
        self.db.commit()

        cancelled = cancel_recurring_payment(payment_id=p1.id, current_user=self.user1, db=self.db)
        self.assertEqual(cancelled.status, "cancelled")
        self.assertFalse(cancelled.is_active)

        # Cancelled in database
        refreshed = self.db.get(RecurringPayment, p1.id)
        self.assertEqual(refreshed.status, "cancelled")
        self.assertFalse(refreshed.is_active)

        # User 2 cannot cancel User 1's payment
        with self.assertRaises(HTTPException) as ctx:
            cancel_recurring_payment(payment_id=p1.id, current_user=self.user2, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_delete_recurring_payment(self):
        p1 = RecurringPayment(
            user_id=self.user1.id,
            description="To be deleted",
            amount=Decimal("100.00"),
            category="Other",
            frequency="monthly",
            start_date=date(2026, 10, 1),
            next_due_date=date(2026, 11, 1),
            status="active",
            is_active=True,
        )
        self.db.add(p1)
        self.db.commit()

        # User 2 cannot delete
        with self.assertRaises(HTTPException) as ctx:
            delete_recurring_payment(payment_id=p1.id, current_user=self.user2, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

        # User 1 deletes
        delete_recurring_payment(payment_id=p1.id, current_user=self.user1, db=self.db)
        self.assertIsNone(self.db.get(RecurringPayment, p1.id))

    def test_upcoming_and_overdue_and_summary(self):
        # 1. Overdue active payment (due Oct 25, ref Oct 31)
        overdue_pay = RecurringPayment(
            user_id=self.user1.id,
            description="Water Utility",
            amount=Decimal("450.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 9, 25),
            next_due_date=date(2026, 10, 25),
            status="active",
            is_active=True,
        )
        # 2. Upcoming payment due Nov 5 (within 30 days)
        upcoming_pay = RecurringPayment(
            user_id=self.user1.id,
            description="Broadband",
            amount=Decimal("1200.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 10, 5),
            next_due_date=date(2026, 11, 5),
            status="active",
            is_active=True,
        )
        # 3. Far future payment due Dec 15 (outside 30-day window)
        far_pay = RecurringPayment(
            user_id=self.user1.id,
            description="Annual Insurance",
            amount=Decimal("12000.00"),
            category="Bills/Utilities",
            frequency="yearly",
            start_date=date(2025, 12, 15),
            next_due_date=date(2026, 12, 15),
            status="active",
            is_active=True,
        )
        # 4. Overdue but CANCELLED payment (due Oct 20) -> must not appear in overdue
        cancelled_pay = RecurringPayment(
            user_id=self.user1.id,
            description="Old Sub",
            amount=Decimal("300.00"),
            category="Entertainment",
            frequency="monthly",
            start_date=date(2026, 9, 20),
            next_due_date=date(2026, 10, 20),
            status="cancelled",
            is_active=False,
        )
        # 5. User 2 payment -> must not leak into user 1
        user2_pay = RecurringPayment(
            user_id=self.user2.id,
            description="User2 Bill",
            amount=Decimal("5000.00"),
            category="Bills/Utilities",
            frequency="monthly",
            start_date=date(2026, 10, 1),
            next_due_date=date(2026, 10, 20),
            status="active",
            is_active=True,
        )
        self.db.add_all([overdue_pay, upcoming_pay, far_pay, cancelled_pay, user2_pay])
        self.db.commit()

        # Test Overdue Endpoint
        overdue_list = get_overdue_recurring_payments(
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(len(overdue_list), 1)
        self.assertEqual(overdue_list[0].description, "Water Utility")
        self.assertTrue(overdue_list[0].is_overdue)
        self.assertEqual(overdue_list[0].days_until_due, -6)  # 25 - 31 = -6 days

        # Test Upcoming Endpoint (30 days)
        upcoming_list = get_upcoming_recurring_payments(
            days=30,
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(len(upcoming_list), 1)
        self.assertEqual(upcoming_list[0].description, "Broadband")
        self.assertFalse(upcoming_list[0].is_overdue)
        self.assertEqual(upcoming_list[0].days_until_due, 5)  # Nov 5 - Oct 31 = 5 days

        # Test Summary Endpoint
        summary = get_recurring_payments_summary(
            days=30,
            ref_date=self.ref_date,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(summary.total_active_count, 3)  # Water, Broadband, Insurance
        # Monthly commitment: Water (450) + Broadband (1200) + Insurance (12000 / 12 = 1000) = 2650.00
        self.assertEqual(summary.total_monthly_commitment, Decimal("2650.00"))
        self.assertEqual(summary.upcoming_count, 1)
        self.assertEqual(summary.upcoming_total, Decimal("1200.00"))
        self.assertEqual(summary.overdue_count, 1)
        self.assertEqual(summary.overdue_total, Decimal("450.00"))
        self.assertEqual(len(summary.upcoming_items), 1)
        self.assertEqual(len(summary.overdue_items), 1)


if __name__ == "__main__":
    unittest.main()
