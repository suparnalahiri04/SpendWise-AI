import asyncio
import json
from datetime import datetime, timezone
from decimal import Decimal
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.budgets import (
    classify_budget_status,
    create_budget,
    delete_budget,
    get_budget,
    get_budget_progress,
    get_single_budget_progress,
    list_budgets,
    update_budget,
)
from app.dependencies import get_db
from app.main import app
from app.models import Base, Budget, Transaction, User
from app.schemas import BudgetCreate, BudgetUpdate
from app.token import create_access_token


class BudgetBackendTestCase(unittest.TestCase):
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
        self.user1 = User(id=1, email="user1@example.com", password_hash="hash1")
        self.user2 = User(id=2, email="user2@example.com", password_hash="hash2")
        self.db.add_all([self.user1, self.user2])
        self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_create_budget_success(self):
        payload = BudgetCreate(
            category="Food/Dining",
            month="2026-10",
            limit_amount=Decimal("5000.00"),
        )
        budget = create_budget(budget_data=payload, current_user=self.user1, db=self.db)
        self.assertIsNotNone(budget.id)
        self.assertEqual(budget.user_id, self.user1.id)
        self.assertEqual(budget.category, "Food/Dining")
        self.assertEqual(budget.month, "2026-10")
        self.assertEqual(budget.limit_amount, Decimal("5000.00"))

    def test_create_budget_duplicate_rejected(self):
        payload = BudgetCreate(
            category="Food/Dining",
            month="2026-10",
            limit_amount=Decimal("5000.00"),
        )
        create_budget(budget_data=payload, current_user=self.user1, db=self.db)

        # Exact duplicate
        with self.assertRaises(HTTPException) as ctx:
            create_budget(budget_data=payload, current_user=self.user1, db=self.db)
        self.assertEqual(ctx.exception.status_code, 409)

        # Case-insensitive duplicate
        case_payload = BudgetCreate(
            category="food/dining",
            month="2026-10",
            limit_amount=Decimal("6000.00"),
        )
        with self.assertRaises(HTTPException) as ctx2:
            create_budget(budget_data=case_payload, current_user=self.user1, db=self.db)
        self.assertEqual(ctx2.exception.status_code, 409)

        # Different user can create budget for same category and month
        user2_budget = create_budget(budget_data=payload, current_user=self.user2, db=self.db)
        self.assertEqual(user2_budget.user_id, self.user2.id)

        # Same user can create budget for same category in different month
        nov_payload = BudgetCreate(
            category="Food/Dining",
            month="2026-11",
            limit_amount=Decimal("5500.00"),
        )
        nov_budget = create_budget(budget_data=nov_payload, current_user=self.user1, db=self.db)
        self.assertEqual(nov_budget.month, "2026-11")

    def test_create_budget_validation_zero_or_negative_amount(self):
        with self.assertRaises(Exception):
            BudgetCreate(category="Food/Dining", month="2026-10", limit_amount=Decimal("0.00"))

        with self.assertRaises(Exception):
            BudgetCreate(category="Food/Dining", month="2026-10", limit_amount=Decimal("-150.00"))

    def test_create_budget_validation_invalid_month(self):
        with self.assertRaises(Exception):
            BudgetCreate(category="Food/Dining", month="2026-13", limit_amount=Decimal("100.00"))

        with self.assertRaises(Exception):
            BudgetCreate(category="Food/Dining", month="2026/10", limit_amount=Decimal("100.00"))

    def test_create_budget_empty_category(self):
        with self.assertRaises(HTTPException) as ctx:
            create_budget(
                budget_data=BudgetCreate(category="   ", month="2026-10", limit_amount=Decimal("100.00")),
                current_user=self.user1,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_list_budgets_user_isolation(self):
        b1 = Budget(user_id=self.user1.id, category="Food/Dining", month="2026-10", limit_amount=Decimal("5000.00"))
        b2 = Budget(user_id=self.user1.id, category="Shopping", month="2026-10", limit_amount=Decimal("2000.00"))
        b3 = Budget(user_id=self.user2.id, category="Food/Dining", month="2026-10", limit_amount=Decimal("3000.00"))
        self.db.add_all([b1, b2, b3])
        self.db.commit()

        user1_budgets = list_budgets(current_user=self.user1, db=self.db)
        self.assertEqual(len(user1_budgets), 2)
        self.assertTrue(all(b.user_id == self.user1.id for b in user1_budgets))

        user2_budgets = list_budgets(current_user=self.user2, db=self.db)
        self.assertEqual(len(user2_budgets), 1)
        self.assertEqual(user2_budgets[0].user_id, self.user2.id)

    def test_list_budgets_filtered_by_month(self):
        b1 = Budget(user_id=self.user1.id, category="Food/Dining", month="2026-10", limit_amount=Decimal("5000.00"))
        b2 = Budget(user_id=self.user1.id, category="Food/Dining", month="2026-11", limit_amount=Decimal("5500.00"))
        self.db.add_all([b1, b2])
        self.db.commit()

        oct_budgets = list_budgets(month="2026-10", current_user=self.user1, db=self.db)
        self.assertEqual(len(oct_budgets), 1)
        self.assertEqual(oct_budgets[0].month, "2026-10")

    def test_get_single_budget(self):
        b1 = Budget(user_id=self.user1.id, category="Food/Dining", month="2026-10", limit_amount=Decimal("5000.00"))
        self.db.add(b1)
        self.db.commit()

        fetched = get_budget(budget_id=b1.id, current_user=self.user1, db=self.db)
        self.assertEqual(fetched.id, b1.id)

        # Another user cannot fetch user1's budget (isolation)
        with self.assertRaises(HTTPException) as ctx:
            get_budget(budget_id=b1.id, current_user=self.user2, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

        # Non-existent ID returns 404
        with self.assertRaises(HTTPException) as ctx2:
            get_budget(budget_id=9999, current_user=self.user1, db=self.db)
        self.assertEqual(ctx2.exception.status_code, 404)

    def test_update_budget(self):
        b1 = Budget(user_id=self.user1.id, category="Food/Dining", month="2026-10", limit_amount=Decimal("5000.00"))
        self.db.add(b1)
        self.db.commit()

        update_payload = BudgetUpdate(limit_amount=Decimal("6000.00"))
        updated = update_budget(budget_id=b1.id, budget_data=update_payload, current_user=self.user1, db=self.db)
        self.assertEqual(updated.limit_amount, Decimal("6000.00"))

        # User 2 cannot update User 1's budget
        with self.assertRaises(HTTPException) as ctx:
            update_budget(budget_id=b1.id, budget_data=update_payload, current_user=self.user2, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_delete_budget(self):
        b1 = Budget(user_id=self.user1.id, category="Food/Dining", month="2026-10", limit_amount=Decimal("5000.00"))
        self.db.add(b1)
        self.db.commit()

        # User 2 cannot delete User 1's budget
        with self.assertRaises(HTTPException) as ctx:
            delete_budget(budget_id=b1.id, current_user=self.user2, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

        # User 1 successfully deletes budget
        delete_budget(budget_id=b1.id, current_user=self.user1, db=self.db)

        # Now fetching returns 404
        with self.assertRaises(HTTPException) as ctx2:
            get_budget(budget_id=b1.id, current_user=self.user1, db=self.db)
        self.assertEqual(ctx2.exception.status_code, 404)

    def test_budget_progress_calculations(self):
        b1 = Budget(user_id=self.user1.id, category="Food/Dining", month="2026-10", limit_amount=Decimal("5000.00"))
        b2 = Budget(user_id=self.user1.id, category="Shopping", month="2026-10", limit_amount=Decimal("2000.00"))
        self.db.add_all([b1, b2])
        self.db.commit()

        # Transactions
        t1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="Lunch",
            amount=Decimal("1200.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        t2 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 20, 18, 30, tzinfo=timezone.utc),
            description="Dinner",
            amount=Decimal("800.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        # Income transaction in Food/Dining (MUST NOT be counted as expense)
        t3 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 15, 10, 0, tzinfo=timezone.utc),
            description="Cashback",
            amount=Decimal("500.00"),
            transaction_type="income",
            category="Food/Dining",
        )
        # Expense in previous month (MUST NOT be counted)
        t4 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc),
            description="Previous month dinner",
            amount=Decimal("600.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        # Expense belonging to User 2 (MUST NOT be counted for User 1)
        t5 = Transaction(
            user_id=self.user2.id,
            transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
            description="User 2 groceries",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        # Expense exceeding budget for Shopping
        t6 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 12, 14, 0, tzinfo=timezone.utc),
            description="Shoes",
            amount=Decimal("2500.00"),
            transaction_type="expense",
            category="Shopping",
        )
        self.db.add_all([t1, t2, t3, t4, t5, t6])
        self.db.commit()

        progress = get_budget_progress(month="2026-10", current_user=self.user1, db=self.db)
        self.assertEqual(progress.month, "2026-10")
        self.assertEqual(progress.total_budgeted, Decimal("7000.00"))
        # Spent: 1200 + 800 (Food) + 2500 (Shopping) = 4500.00
        self.assertEqual(progress.total_spent, Decimal("4500.00"))
        self.assertEqual(progress.total_remaining, Decimal("2500.00"))
        self.assertEqual(len(progress.items), 2)

        food_item = next(item for item in progress.items if item.category == "Food/Dining")
        self.assertEqual(food_item.spent_amount, Decimal("2000.00"))
        self.assertEqual(food_item.remaining_amount, Decimal("3000.00"))
        self.assertEqual(food_item.percentage_used, 40.0)
        self.assertFalse(food_item.is_exceeded)

        shop_item = next(item for item in progress.items if item.category == "Shopping")
        self.assertEqual(shop_item.spent_amount, Decimal("2500.00"))
        self.assertEqual(shop_item.remaining_amount, Decimal("-500.00"))
        self.assertEqual(shop_item.percentage_used, 125.0)
        self.assertTrue(shop_item.is_exceeded)

    def test_single_budget_progress(self):
        b1 = Budget(user_id=self.user1.id, category="Food/Dining", month="2026-10", limit_amount=Decimal("5000.00"))
        self.db.add(b1)
        self.db.commit()

        t1 = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
            description="Lunch",
            amount=Decimal("1500.00"),
            transaction_type="expense",
            category="Food/Dining",
        )
        self.db.add(t1)
        self.db.commit()

        single_prog = get_single_budget_progress(budget_id=b1.id, current_user=self.user1, db=self.db)
        self.assertEqual(single_prog.id, b1.id)
        self.assertEqual(single_prog.spent_amount, Decimal("1500.00"))
        self.assertEqual(single_prog.remaining_amount, Decimal("3500.00"))
        self.assertEqual(single_prog.percentage_used, 30.0)
        self.assertFalse(single_prog.is_exceeded)

        # Another user cannot fetch single progress
        with self.assertRaises(HTTPException) as ctx:
            get_single_budget_progress(budget_id=b1.id, current_user=self.user2, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_budget_boundary_classification_semantics(self):
        """Test standardized domain rules across all boundary thresholds:
        - 79.99% -> 'on_track'
        - 80.00% -> 'approaching_limit'
        - 99.99% -> 'approaching_limit'
        - 100.00% -> 'limit_reached' (NOT 'over_budget')
        - 100.01% -> 'over_budget'
        """
        limit = Decimal("10000.00")

        # 1. 79.99% -> on_track
        self.assertEqual(classify_budget_status(Decimal("0.00"), limit), "on_track")
        self.assertEqual(classify_budget_status(Decimal("5000.00"), limit), "on_track")
        self.assertEqual(classify_budget_status(Decimal("7999.00"), limit), "on_track")

        # Also test with limit=100 for exact 79.99
        self.assertEqual(classify_budget_status(Decimal("79.99"), Decimal("100.00")), "on_track")

        # 2. 80.00% -> approaching_limit
        self.assertEqual(classify_budget_status(Decimal("8000.00"), limit), "approaching_limit")
        self.assertEqual(classify_budget_status(Decimal("80.00"), Decimal("100.00")), "approaching_limit")

        # 3. 99.99% -> approaching_limit
        self.assertEqual(classify_budget_status(Decimal("9999.00"), limit), "approaching_limit")
        self.assertEqual(classify_budget_status(Decimal("99.99"), Decimal("100.00")), "approaching_limit")

        # 4. 100.00% -> limit_reached
        self.assertEqual(classify_budget_status(Decimal("10000.00"), limit), "limit_reached")
        self.assertEqual(classify_budget_status(Decimal("100.00"), Decimal("100.00")), "limit_reached")

        # 5. 100.01% -> over_budget
        self.assertEqual(classify_budget_status(Decimal("10001.00"), limit), "over_budget")
        self.assertEqual(classify_budget_status(Decimal("100.01"), Decimal("100.00")), "over_budget")

    def test_budget_progress_exact_100_percent_boundary(self):
        """Verify that get_budget_progress correctly flags exactly 100% as limit_reached with is_exceeded=False."""
        b_exact = Budget(
            user_id=self.user1.id,
            category="Utilities",
            month="2026-10",
            limit_amount=Decimal("3000.00"),
        )
        self.db.add(b_exact)
        self.db.commit()

        t_exact = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 10, 10, 0, tzinfo=timezone.utc),
            description="Electricity bill exactly at limit",
            amount=Decimal("3000.00"),
            transaction_type="expense",
            category="Utilities",
        )
        self.db.add(t_exact)
        self.db.commit()

        prog = get_budget_progress(month="2026-10", current_user=self.user1, db=self.db)
        item = next(i for i in prog.items if i.category == "Utilities")

        self.assertEqual(item.spent_amount, Decimal("3000.00"))
        self.assertEqual(item.remaining_amount, Decimal("0.00"))
        self.assertEqual(item.percentage_used, 100.0)
        self.assertFalse(item.is_exceeded, "Exactly 100% utilization must NOT be marked is_exceeded=True")
        self.assertEqual(item.status, "limit_reached")

    def test_budget_progress_rounded_percentage_100_below_limit(self):
        """Verify that when rounded percentage_used rounds to 100.00 but actual spending is below limit,
        status remains 'approaching_limit' and is_exceeded remains False.
        """
        b_near = Budget(
            user_id=self.user1.id,
            category="Health",
            month="2026-10",
            limit_amount=Decimal("10000.00"),
        )
        self.db.add(b_near)
        self.db.commit()

        # Spent 9,999.60 out of 10,000.00 -> 99.996%, which rounds to 100.00%
        t_near = Transaction(
            user_id=self.user1.id,
            transaction_date=datetime(2026, 10, 12, 10, 0, tzinfo=timezone.utc),
            description="Pharmacy expense near limit",
            amount=Decimal("9999.60"),
            transaction_type="expense",
            category="Health",
        )
        self.db.add(t_near)
        self.db.commit()

        prog = get_budget_progress(month="2026-10", current_user=self.user1, db=self.db)
        item = next(i for i in prog.items if i.category == "Health")

        self.assertEqual(item.spent_amount, Decimal("9999.60"))
        self.assertEqual(item.remaining_amount, Decimal("0.40"))
        self.assertEqual(item.percentage_used, 100.0)  # rounded representation
        self.assertEqual(item.status, "approaching_limit", "Unrounded check must prevent false limit_reached")
        self.assertFalse(item.is_exceeded)


if __name__ == "__main__":
    unittest.main()
