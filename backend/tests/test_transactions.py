from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, Transaction, User
from app.schemas import TransactionCreate, TransactionResponse, TransactionUpdate
from app.transactions import (
    _coerce_to_utc_datetime,
    create_transaction,
    delete_transaction,
    list_transactions,
    update_transaction,
)


class TransactionCrudBackendTestCase(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite database isolated for each test
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        # Seed two distinct test users for isolation verification
        self.user1 = User(id=1, email="user1@spendwise.ai", password_hash="hash1")
        self.user2 = User(id=2, email="user2@spendwise.ai", password_hash="hash2")
        self.db.add_all([self.user1, self.user2])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    # -------------------------------------------------------------------------
    # 1. Transaction Creation Tests
    # -------------------------------------------------------------------------
    def test_create_expense_success_with_explicit_category(self):
        """Creating an expense with an explicit category marks is_reviewed=True and skips ML."""
        payload = TransactionCreate(
            transaction_date=date(2026, 3, 15),
            description="Supermarket Groceries",
            amount=Decimal("1250.75"),
            transaction_type="expense",
            category="Food & Dining",
        )

        with patch("app.transactions.predict_category") as mock_predict:
            tx = create_transaction(
                transaction_data=payload,
                current_user=self.user1,
                db=self.db,
            )
            mock_predict.assert_not_called()

        self.assertIsNotNone(tx.id)
        self.assertEqual(tx.user_id, self.user1.id)
        self.assertEqual(tx.description, "Supermarket Groceries")
        self.assertEqual(tx.amount, Decimal("1250.75"))
        self.assertEqual(tx.transaction_type, "expense")
        self.assertEqual(tx.category, "Food & Dining")
        self.assertIsNone(tx.predicted_category)
        self.assertIsNone(tx.prediction_confidence)
        self.assertTrue(tx.is_reviewed)

        # Verify response schema serialization
        response = TransactionResponse.model_validate(tx)
        self.assertEqual(response.id, tx.id)
        self.assertEqual(response.transaction_date, date(2026, 3, 15))
        self.assertEqual(response.category, "Food & Dining")
        self.assertTrue(response.is_reviewed)

    def test_create_income_success_with_explicit_category(self):
        """Creating an income transaction persists amount, type, and category properly."""
        payload = TransactionCreate(
            transaction_date=date(2026, 3, 1),
            description="Monthly Base Salary",
            amount=Decimal("50000.00"),
            transaction_type="income",
            category="Salary",
        )

        tx = create_transaction(
            transaction_data=payload,
            current_user=self.user1,
            db=self.db,
        )

        self.assertEqual(tx.transaction_type, "income")
        self.assertEqual(tx.amount, Decimal("50000.00"))
        self.assertEqual(tx.category, "Salary")
        self.assertTrue(tx.is_reviewed)

    def test_create_transaction_ml_high_confidence(self):
        """Without category, high-confidence ML prediction assigns predicted category and saves metadata."""
        payload = TransactionCreate(
            transaction_date=date(2026, 3, 16),
            description="Starbucks Cappuccino",
            amount=Decimal("250.00"),
            transaction_type="expense",
            category=None,
        )

        mock_prediction = {
            "predicted_category": "Food",
            "confidence": 0.9254,
            "needs_review": False,
        }

        with patch("app.transactions.predict_category", return_value=mock_prediction) as mock_predict:
            tx = create_transaction(
                transaction_data=payload,
                current_user=self.user1,
                db=self.db,
            )
            mock_predict.assert_called_once_with("Starbucks Cappuccino")

        self.assertEqual(tx.category, "Food")
        self.assertEqual(tx.predicted_category, "Food")
        self.assertEqual(tx.prediction_confidence, Decimal("0.9254"))
        self.assertFalse(tx.is_reviewed)

    def test_create_transaction_ml_low_confidence(self):
        """Without category, low-confidence ML prediction leaves category as Other and saves suggestion."""
        payload = TransactionCreate(
            transaction_date=date(2026, 3, 17),
            description="Ambiguous POS Transaction",
            amount=Decimal("1400.00"),
            transaction_type="expense",
            category=None,
        )

        mock_prediction = {
            "predicted_category": "Shopping",
            "confidence": 0.4200,
            "needs_review": True,
        }

        with patch("app.transactions.predict_category", return_value=mock_prediction):
            tx = create_transaction(
                transaction_data=payload,
                current_user=self.user1,
                db=self.db,
            )

        self.assertEqual(tx.category, "Other")
        self.assertEqual(tx.predicted_category, "Shopping")
        self.assertEqual(tx.prediction_confidence, Decimal("0.4200"))
        self.assertFalse(tx.is_reviewed)

    def test_create_transaction_ml_model_missing_fallback(self):
        """When the ML model file is missing, transaction creation safely defaults to Other."""
        payload = TransactionCreate(
            transaction_date=date(2026, 3, 18),
            description="Movie Theater Ticket",
            amount=Decimal("350.00"),
            transaction_type="expense",
            category=None,
        )

        with patch("app.transactions.predict_category", side_effect=FileNotFoundError("Model file not found")):
            tx = create_transaction(
                transaction_data=payload,
                current_user=self.user1,
                db=self.db,
            )

        self.assertEqual(tx.category, "Other")
        self.assertIsNone(tx.predicted_category)
        self.assertIsNone(tx.prediction_confidence)
        self.assertFalse(tx.is_reviewed)

    def test_create_transaction_ml_value_error_fallback(self):
        """When ML prediction encounters a ValueError, creation safely falls back to Other."""
        payload = TransactionCreate(
            transaction_date=date(2026, 3, 19),
            description="Odd Characters %$#",
            amount=Decimal("100.00"),
            transaction_type="expense",
            category=None,
        )

        with patch("app.transactions.predict_category", side_effect=ValueError("Feature extraction error")):
            tx = create_transaction(
                transaction_data=payload,
                current_user=self.user1,
                db=self.db,
            )

        self.assertEqual(tx.category, "Other")
        self.assertIsNone(tx.predicted_category)
        self.assertIsNone(tx.prediction_confidence)
        self.assertFalse(tx.is_reviewed)

    def test_create_transaction_validation_whitespace_description_raises_422(self):
        """A description of pure whitespace passes Pydantic min_length=1 but is rejected by the route with HTTP 422."""
        payload = TransactionCreate(
            transaction_date=date(2026, 3, 20),
            description="    ",
            amount=Decimal("100.00"),
            transaction_type="expense",
        )

        with self.assertRaises(HTTPException) as ctx:
            create_transaction(
                transaction_data=payload,
                current_user=self.user1,
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail, "Transaction description cannot be empty.")

    def test_create_transaction_validation_whitespace_category_raises_422(self):
        """An explicit category of whitespace is rejected by the route with HTTP 422."""
        payload = TransactionCreate(
            transaction_date=date(2026, 3, 20),
            description="Valid Description",
            amount=Decimal("100.00"),
            transaction_type="expense",
            category="    ",
        )

        with self.assertRaises(HTTPException) as ctx:
            create_transaction(
                transaction_data=payload,
                current_user=self.user1,
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail, "Category cannot be empty.")

    def test_create_transaction_validation_pydantic_rules(self):
        """Pydantic rejects zero/negative amounts, empty descriptions, and invalid transaction types."""
        # Zero amount
        with self.assertRaises(ValidationError) as ctx:
            TransactionCreate(
                transaction_date=date(2026, 3, 20),
                description="Valid Item",
                amount=Decimal("0.00"),
                transaction_type="expense",
            )
        self.assertTrue(any(err["loc"] == ("amount",) for err in ctx.exception.errors()))

        # Negative amount
        with self.assertRaises(ValidationError) as ctx:
            TransactionCreate(
                transaction_date=date(2026, 3, 20),
                description="Valid Item",
                amount=Decimal("-50.00"),
                transaction_type="expense",
            )
        self.assertTrue(any(err["loc"] == ("amount",) for err in ctx.exception.errors()))

        # Empty description
        with self.assertRaises(ValidationError) as ctx:
            TransactionCreate(
                transaction_date=date(2026, 3, 20),
                description="",
                amount=Decimal("50.00"),
                transaction_type="expense",
            )
        self.assertTrue(any(err["loc"] == ("description",) for err in ctx.exception.errors()))

        # Invalid transaction type
        with self.assertRaises(ValidationError) as ctx:
            TransactionCreate(
                transaction_date=date(2026, 3, 20),
                description="Valid Item",
                amount=Decimal("50.00"),
                transaction_type="transfer",  # type: ignore[arg-type]
            )
        self.assertTrue(any(err["loc"] == ("transaction_type",) for err in ctx.exception.errors()))

    def test_date_coercion_to_utc_datetime(self):
        """_coerce_to_utc_datetime converts date, naive datetime, and aware datetime into UTC datetime."""
        # 1. date object
        d = date(2026, 3, 20)
        coerced_d = _coerce_to_utc_datetime(d)
        self.assertEqual(coerced_d, datetime(2026, 3, 20, 0, 0, tzinfo=timezone.utc))

        # 2. naive datetime
        naive = datetime(2026, 3, 20, 15, 30, 45)
        coerced_naive = _coerce_to_utc_datetime(naive)
        self.assertEqual(coerced_naive, datetime(2026, 3, 20, 15, 30, 45, tzinfo=timezone.utc))

        # 3. aware datetime with offset (e.g. UTC+5:30)
        ist = timezone(timedelta(hours=5, minutes=30))
        aware = datetime(2026, 3, 20, 15, 30, 0, tzinfo=ist)
        coerced_aware = _coerce_to_utc_datetime(aware)
        self.assertEqual(coerced_aware, datetime(2026, 3, 20, 10, 0, 0, tzinfo=timezone.utc))

    # -------------------------------------------------------------------------
    # 2. Transaction Listing Tests
    # -------------------------------------------------------------------------
    def test_list_transactions_descending_order(self):
        """list_transactions returns records ordered newest-first by transaction_date then ID."""
        # Create 3 transactions with different dates
        t1 = create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 3, 10),
                description="T1 Early",
                amount=Decimal("10.00"),
                transaction_type="expense",
                category="General",
            ),
            current_user=self.user1,
            db=self.db,
        )
        t2 = create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 3, 20),
                description="T2 Late",
                amount=Decimal("20.00"),
                transaction_type="expense",
                category="General",
            ),
            current_user=self.user1,
            db=self.db,
        )
        t3 = create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 3, 20),
                description="T3 Late Newer ID",
                amount=Decimal("30.00"),
                transaction_type="expense",
                category="General",
            ),
            current_user=self.user1,
            db=self.db,
        )

        results = list_transactions(current_user=self.user1, db=self.db)
        self.assertEqual(len(results), 3)
        # Expected order: t3 (Mar 20, higher ID), t2 (Mar 20, lower ID), t1 (Mar 10)
        self.assertEqual([t.id for t in results], [t3.id, t2.id, t1.id])

    def test_list_transactions_user_isolation(self):
        """list_transactions strictly isolates data between users."""
        create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 3, 10),
                description="User 1 Secret Expense",
                amount=Decimal("100.00"),
                transaction_type="expense",
                category="Private",
            ),
            current_user=self.user1,
            db=self.db,
        )
        create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 3, 11),
                description="User 2 Secret Expense",
                amount=Decimal("200.00"),
                transaction_type="expense",
                category="Private",
            ),
            current_user=self.user2,
            db=self.db,
        )

        u1_txs = list_transactions(current_user=self.user1, db=self.db)
        self.assertEqual(len(u1_txs), 1)
        self.assertEqual(u1_txs[0].description, "User 1 Secret Expense")

        u2_txs = list_transactions(current_user=self.user2, db=self.db)
        self.assertEqual(len(u2_txs), 1)
        self.assertEqual(u2_txs[0].description, "User 2 Secret Expense")

    def test_list_transactions_empty_for_user_with_no_records(self):
        """A user with no transactions receives an empty list."""
        results = list_transactions(current_user=self.user2, db=self.db)
        self.assertEqual(results, [])

    # -------------------------------------------------------------------------
    # 3. Transaction Updating Tests
    # -------------------------------------------------------------------------
    def test_update_transaction_success_and_marks_reviewed(self):
        """Updating a transaction modifies fields and marks is_reviewed=True."""
        tx = create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 3, 10),
                description="Initial Description",
                amount=Decimal("50.00"),
                transaction_type="expense",
                category=None,  # is_reviewed is False initially
            ),
            current_user=self.user1,
            db=self.db,
        )
        self.assertFalse(tx.is_reviewed)

        update_payload = TransactionUpdate(
            transaction_date=date(2026, 3, 12),
            description="Updated Description",
            amount=Decimal("95.50"),
            transaction_type="expense",
            category="Utilities",
        )

        updated_tx = update_transaction(
            transaction_id=tx.id,
            transaction_data=update_payload,
            current_user=self.user1,
            db=self.db,
        )

        self.assertEqual(updated_tx.id, tx.id)
        self.assertEqual(updated_tx.description, "Updated Description")
        self.assertEqual(updated_tx.amount, Decimal("95.50"))
        self.assertEqual(updated_tx.category, "Utilities")
        self.assertTrue(updated_tx.is_reviewed)

        # Verify DB reflection
        db_record = self.db.scalar(select(Transaction).where(Transaction.id == tx.id))
        self.assertEqual(db_record.description, "Updated Description")
        self.assertEqual(db_record.amount, Decimal("95.50"))
        self.assertTrue(db_record.is_reviewed)

    def test_update_transaction_nonexistent_raises_404(self):
        """Updating a non-existent transaction ID raises HTTP 404."""
        update_payload = TransactionUpdate(
            transaction_date=date(2026, 3, 12),
            description="Ghost Update",
            amount=Decimal("10.00"),
            transaction_type="expense",
            category="Other",
        )

        with self.assertRaises(HTTPException) as ctx:
            update_transaction(
                transaction_id=99999,
                transaction_data=update_payload,
                current_user=self.user1,
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Transaction not found.")

    def test_update_transaction_empty_description_or_category_rejected_with_422(self):
        """PUT /transactions/{id} rejects empty/whitespace-only description or category with HTTP 422."""
        tx = create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 3, 10),
                description="Initial Expense",
                amount=Decimal("250.00"),
                transaction_type="expense",
                category="Food",
            ),
            current_user=self.user1,
            db=self.db,
        )

        # Empty/whitespace description
        with self.assertRaises(HTTPException) as desc_ctx:
            update_transaction(
                transaction_id=tx.id,
                transaction_data=TransactionUpdate(
                    transaction_date=date(2026, 3, 10),
                    description="   \t  ",
                    amount=Decimal("250.00"),
                    transaction_type="expense",
                    category="Food",
                ),
                current_user=self.user1,
                db=self.db,
            )
        self.assertEqual(desc_ctx.exception.status_code, 422)
        self.assertEqual(desc_ctx.exception.detail, "Transaction description cannot be empty.")

        # Empty/whitespace category
        with self.assertRaises(HTTPException) as cat_ctx:
            update_transaction(
                transaction_id=tx.id,
                transaction_data=TransactionUpdate(
                    transaction_date=date(2026, 3, 10),
                    description="Valid Description",
                    amount=Decimal("250.00"),
                    transaction_type="expense",
                    category="   \n  ",
                ),
                current_user=self.user1,
                db=self.db,
            )
        self.assertEqual(cat_ctx.exception.status_code, 422)
        self.assertEqual(cat_ctx.exception.detail, "Category cannot be empty.")

        # Verify database record was left unchanged
        refreshed = self.db.scalar(select(Transaction).where(Transaction.id == tx.id))
        self.assertEqual(refreshed.description, "Initial Expense")
        self.assertEqual(refreshed.category, "Food")

    def test_update_transaction_cross_user_isolation_raises_404(self):
        """Attempting to update another user's transaction raises HTTP 404 and does not modify the record."""
        u1_tx = create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 3, 10),
                description="Original User1 Expense",
                amount=Decimal("500.00"),
                transaction_type="expense",
                category="Food",
            ),
            current_user=self.user1,
            db=self.db,
        )

        tamper_payload = TransactionUpdate(
            transaction_date=date(2026, 3, 10),
            description="Tampered by User2",
            amount=Decimal("1.00"),
            transaction_type="expense",
            category="Hacked",
        )

        with self.assertRaises(HTTPException) as ctx:
            update_transaction(
                transaction_id=u1_tx.id,
                transaction_data=tamper_payload,
                current_user=self.user2,
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Transaction not found.")

        # Verify User 1's record remains pristine
        self.db.expire_all()
        refreshed = self.db.scalar(select(Transaction).where(Transaction.id == u1_tx.id))
        self.assertEqual(refreshed.description, "Original User1 Expense")
        self.assertEqual(refreshed.amount, Decimal("500.00"))
        self.assertEqual(refreshed.category, "Food")

    # -------------------------------------------------------------------------
    # 4. Transaction Deletion Tests
    # -------------------------------------------------------------------------
    def test_delete_transaction_success(self):
        """Deleting a transaction removes it from the database."""
        tx = create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 3, 10),
                description="To be deleted",
                amount=Decimal("50.00"),
                transaction_type="expense",
                category="Other",
            ),
            current_user=self.user1,
            db=self.db,
        )

        delete_transaction(
            transaction_id=tx.id,
            current_user=self.user1,
            db=self.db,
        )

        # Verify transaction is gone
        db_record = self.db.scalar(select(Transaction).where(Transaction.id == tx.id))
        self.assertIsNone(db_record)

    def test_delete_transaction_nonexistent_raises_404(self):
        """Deleting a non-existent transaction ID raises HTTP 404."""
        with self.assertRaises(HTTPException) as ctx:
            delete_transaction(
                transaction_id=99999,
                current_user=self.user1,
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Transaction not found.")

    def test_delete_transaction_cross_user_isolation_raises_404(self):
        """Attempting to delete another user's transaction raises HTTP 404 and does not delete it."""
        u1_tx = create_transaction(
            TransactionCreate(
                transaction_date=date(2026, 3, 10),
                description="User 1 Safe Expense",
                amount=Decimal("700.00"),
                transaction_type="expense",
                category="Rent",
            ),
            current_user=self.user1,
            db=self.db,
        )

        with self.assertRaises(HTTPException) as ctx:
            delete_transaction(
                transaction_id=u1_tx.id,
                current_user=self.user2,
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Transaction not found.")

        # Verify User 1's record still exists in DB
        db_record = self.db.scalar(select(Transaction).where(Transaction.id == u1_tx.id))
        self.assertIsNotNone(db_record)
        self.assertEqual(db_record.description, "User 1 Safe Expense")


if __name__ == "__main__":
    unittest.main()

