import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
import unittest
from unittest.mock import patch

import pandas as pd
from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.dependencies import get_db
from app.main import app
from app.models import Base, StatementImport, Transaction, User
from app.statements import (
    get_statement_history,
    import_statement,
    preview_uploaded_statement,
)


class _AsyncBytesUploadFile(UploadFile):
    def __init__(self, filename: str, content: bytes):
        super().__init__(file=BytesIO(content), filename=filename)
        self._content = content
        self._offset = 0

    async def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            chunk = self._content[self._offset :]
            self._offset = len(self._content)
            return chunk
        chunk = self._content[self._offset : self._offset + size]
        self._offset += len(chunk)
        return chunk


def _make_upload_file(filename: str, content: bytes) -> UploadFile:
    return _AsyncBytesUploadFile(filename=filename, content=content)


def _run_sync(coro):
    """Run in-memory coroutines synchronously without socket/thread loops."""
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


def _csv_bytes(rows: list[dict[str, object]]) -> bytes:
    df = pd.DataFrame(rows)
    buf = BytesIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


def _xlsx_bytes(rows: list[dict[str, object]]) -> bytes:
    df = pd.DataFrame(rows)
    buf = BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return buf.getvalue()


def _multi_sheet_xlsx_bytes(sheets: dict[str, list[dict[str, object]] | pd.DataFrame]) -> bytes:
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        for sheet_name, data in sheets.items():
            if isinstance(data, pd.DataFrame):
                df = data
            else:
                df = pd.DataFrame(data)
            df.to_excel(writer, sheet_name=sheet_name, index=False)
    return buf.getvalue()


class StatementImportMLTestCase(unittest.TestCase):
    def setUp(self):
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

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_high_confidence_prediction_assigns_predicted_category(self):
        """1, 9, 10: High-confidence prediction sets active category and saves metadata."""
        csv_data = _csv_bytes([
            {
                "date": "2026-03-10",
                "description": "Starbucks Coffee",
                "amount": "350.00",
                "transaction_type": "expense",
            }
        ])

        with patch("app.statement_import.predict_category") as mock_predict:
            mock_predict.return_value = {
                "predicted_category": "Food/Dining",
                "confidence": 0.875,
                "needs_review": False,
            }

            preview = _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("statement.csv", csv_data),
                    current_user=self.user1,
                )
            )
            self.assertEqual(mock_predict.call_count, 1)
            mock_predict.assert_called_once_with("Starbucks Coffee")

            self.assertEqual(preview.valid_rows, 1)
            row = preview.preview[0]
            self.assertTrue(row.is_valid)
            self.assertEqual(row.category, "Food/Dining")
            self.assertEqual(row.predicted_category, "Food/Dining")
            self.assertEqual(row.prediction_confidence, Decimal("0.875"))

            # Now test import persistence and confirm predict_category is called only once per import
            mock_predict.reset_mock()
            result = _run_sync(
                import_statement(
                    upload=_make_upload_file("statement.csv", csv_data),
                    current_user=self.user1,
                    db=self.db,
                )
            )
            self.assertEqual(mock_predict.call_count, 1)
            self.assertEqual(result["imported_rows"], 1)
            self.assertEqual(result["rejected_rows"], 0)

        saved_tx = self.db.scalar(
            select(Transaction).where(Transaction.user_id == self.user1.id)
        )
        self.assertIsNotNone(saved_tx)
        self.assertEqual(saved_tx.category, "Food/Dining")
        self.assertEqual(saved_tx.predicted_category, "Food/Dining")
        self.assertEqual(saved_tx.prediction_confidence, Decimal("0.8750"))
        self.assertFalse(saved_tx.is_reviewed)

    def test_low_confidence_prediction_keeps_other_and_saves_suggestion(self):
        """2, 9, 10: Low-confidence prediction keeps category as Other but preserves suggestion metadata."""
        csv_data = _csv_bytes([
            {
                "date": "2026-03-11",
                "description": "Ambiguous vendor payment",
                "amount": "1200.00",
                "transaction_type": "expense",
            }
        ])

        with patch("app.statement_import.predict_category") as mock_predict:
            mock_predict.return_value = {
                "predicted_category": "Shopping",
                "confidence": 0.4215,
                "needs_review": True,
            }

            preview = _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("low_conf.csv", csv_data),
                    current_user=self.user1,
                )
            )
            row = preview.preview[0]
            self.assertTrue(row.is_valid)
            self.assertEqual(row.category, "Other")
            self.assertEqual(row.predicted_category, "Shopping")
            self.assertEqual(row.prediction_confidence, Decimal("0.4215"))

            _run_sync(
                import_statement(
                    upload=_make_upload_file("low_conf.csv", csv_data),
                    current_user=self.user1,
                    db=self.db,
                )
            )

        saved_tx = self.db.scalar(
            select(Transaction).where(Transaction.user_id == self.user1.id)
        )
        self.assertIsNotNone(saved_tx)
        self.assertEqual(saved_tx.category, "Other")
        self.assertEqual(saved_tx.predicted_category, "Shopping")
        self.assertEqual(saved_tx.prediction_confidence, Decimal("0.4215"))
        self.assertFalse(saved_tx.is_reviewed)

    def test_explicit_categories_preserved_without_invoking_ml(self):
        """3: Explicit non-empty categories (including explicit 'Other') are preserved and skip ML."""
        csv_data = _csv_bytes([
            {
                "date": "2026-03-12",
                "description": "Starbucks Coffee",
                "amount": "250.00",
                "transaction_type": "expense",
                "category": "Groceries",
            },
            {
                "date": "2026-03-13",
                "description": "Uber Trip",
                "amount": "400.00",
                "transaction_type": "expense",
                "category": "Other",
            },
            {
                "date": "2026-03-14",
                "description": "Netflix Subscription",
                "amount": "649.00",
                "transaction_type": "expense",
                "category": "   ",
            },
        ])

        with patch("app.statement_import.predict_category") as mock_predict:
            mock_predict.return_value = {
                "predicted_category": "Entertainment",
                "confidence": 0.91,
                "needs_review": False,
            }

            result = _run_sync(
                import_statement(
                    upload=_make_upload_file("explicit.csv", csv_data),
                    current_user=self.user1,
                    db=self.db,
                )
            )
            # Only the 3rd row (blank category) should trigger ML prediction
            self.assertEqual(mock_predict.call_count, 1)
            mock_predict.assert_called_once_with("Netflix Subscription")
            self.assertEqual(result["imported_rows"], 3)

        txs = self.db.scalars(
            select(Transaction)
            .where(Transaction.user_id == self.user1.id)
            .order_by(Transaction.transaction_date.asc())
        ).all()
        self.assertEqual(len(txs), 3)

        self.assertEqual(txs[0].description, "Starbucks Coffee")
        self.assertEqual(txs[0].category, "Groceries")
        self.assertIsNone(txs[0].predicted_category)
        self.assertIsNone(txs[0].prediction_confidence)
        self.assertFalse(txs[0].is_reviewed)

        self.assertEqual(txs[1].description, "Uber Trip")
        self.assertEqual(txs[1].category, "Other")
        self.assertIsNone(txs[1].predicted_category)
        self.assertIsNone(txs[1].prediction_confidence)
        self.assertFalse(txs[1].is_reviewed)

        self.assertEqual(txs[2].description, "Netflix Subscription")
        self.assertEqual(txs[2].category, "Entertainment")
        self.assertEqual(txs[2].predicted_category, "Entertainment")
        self.assertEqual(txs[2].prediction_confidence, Decimal("0.9100"))
        self.assertFalse(txs[2].is_reviewed)

    def test_missing_model_file_falls_back_to_other_and_logs_warning(self):
        """4: Missing model file safely assigns Other with no prediction metadata and logs warning."""
        csv_data = _csv_bytes([
            {
                "date": "2026-03-15",
                "description": "Electricity Bill",
                "amount": "1800.00",
                "transaction_type": "expense",
            }
        ])

        with patch(
            "app.statement_import.predict_category",
            side_effect=FileNotFoundError("Trained model not found"),
        ) as mock_predict:
            with self.assertLogs("app.statement_import", level="WARNING") as cm:
                result = _run_sync(
                    import_statement(
                        upload=_make_upload_file("missing_model.csv", csv_data),
                        current_user=self.user1,
                        db=self.db,
                    )
                )
            self.assertEqual(mock_predict.call_count, 1)
            self.assertTrue(
                any("ML category prediction unavailable" in msg for msg in cm.output)
            )
            self.assertEqual(result["imported_rows"], 1)

        saved_tx = self.db.scalar(
            select(Transaction).where(Transaction.user_id == self.user1.id)
        )
        self.assertEqual(saved_tx.category, "Other")
        self.assertIsNone(saved_tx.predicted_category)
        self.assertIsNone(saved_tx.prediction_confidence)

    def test_prediction_runtime_failure_falls_back_to_other_and_logs_error(self):
        """5: Runtime prediction error safely assigns Other with no metadata and logs exception."""
        csv_data = _csv_bytes([
            {
                "date": "2026-03-16",
                "description": "Pharmacy Purchase",
                "amount": "540.00",
                "transaction_type": "expense",
            }
        ])

        with patch(
            "app.statement_import.predict_category",
            side_effect=RuntimeError("Corrupt model state"),
        ) as mock_predict:
            with self.assertLogs("app.statement_import", level="ERROR") as cm:
                result = _run_sync(
                    import_statement(
                        upload=_make_upload_file("runtime_err.csv", csv_data),
                        current_user=self.user1,
                        db=self.db,
                    )
                )
            self.assertEqual(mock_predict.call_count, 1)
            self.assertTrue(
                any(
                    "Unexpected error during ML category prediction" in msg
                    for msg in cm.output
                )
            )
            self.assertEqual(result["imported_rows"], 1)

        saved_tx = self.db.scalar(
            select(Transaction).where(Transaction.user_id == self.user1.id)
        )
        self.assertEqual(saved_tx.category, "Other")
        self.assertIsNone(saved_tx.predicted_category)
        self.assertIsNone(saved_tx.prediction_confidence)

    def test_duplicate_import_prevention_with_ml_categorization(self):
        """6: Repeated imports and intra-file duplicates are deterministically skipped."""
        rows = [
            {
                "date": "2026-03-17",
                "description": "Metro Card Recharge",
                "amount": "500.00",
                "transaction_type": "expense",
            },
            {
                "date": "2026-03-17",
                "description": "  metro card recharge ",
                "amount": "500.00",
                "transaction_type": "expense",
            },
        ]
        csv_data = _csv_bytes(rows)

        with patch("app.statement_import.predict_category") as mock_predict:
            mock_predict.return_value = {
                "predicted_category": "Transport",
                "confidence": 0.82,
                "needs_review": False,
            }

            first_import = _run_sync(
                import_statement(
                    upload=_make_upload_file("dups.csv", csv_data),
                    current_user=self.user1,
                    db=self.db,
                )
            )
            self.assertEqual(first_import["total_rows"], 2)
            self.assertEqual(first_import["imported_rows"], 1)
            self.assertEqual(first_import["rejected_rows"], 1)
            self.assertEqual(first_import["status"], "completed_with_errors")

            # Re-importing the same file should skip all rows as duplicates
            second_import = _run_sync(
                import_statement(
                    upload=_make_upload_file("dups.csv", csv_data),
                    current_user=self.user1,
                    db=self.db,
                )
            )
            self.assertEqual(second_import["total_rows"], 2)
            self.assertEqual(second_import["imported_rows"], 0)
            self.assertEqual(second_import["rejected_rows"], 2)

        txs = self.db.scalars(
            select(Transaction).where(Transaction.user_id == self.user1.id)
        ).all()
        self.assertEqual(len(txs), 1)
        self.assertEqual(txs[0].category, "Transport")

        history = get_statement_history(current_user=self.user1, db=self.db)
        self.assertEqual(len(history), 2)

    def test_csv_and_xlsx_parity(self):
        """7: CSV and XLSX files produce identical preview and import categorization results."""
        rows = [
            {
                "date": "2026-03-18",
                "description": "Fresh Supermarket Groceries",
                "amount": "1450.50",
                "transaction_type": "expense",
            },
            {
                "date": "2026-03-19",
                "description": "Monthly Salary",
                "amount": "75000.00",
                "transaction_type": "income",
                "category": "Income",
            },
        ]
        csv_content = _csv_bytes(rows)
        xlsx_content = _xlsx_bytes(rows)

        with patch("app.statement_import.predict_category") as mock_predict:
            mock_predict.return_value = {
                "predicted_category": "Groceries",
                "confidence": 0.94,
                "needs_review": False,
            }

            csv_preview = _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("march.csv", csv_content),
                    current_user=self.user1,
                )
            )
            xlsx_preview = _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("march.xlsx", xlsx_content),
                    current_user=self.user2,
                )
            )

            self.assertEqual(csv_preview.total_rows, xlsx_preview.total_rows)
            self.assertEqual(csv_preview.valid_rows, xlsx_preview.valid_rows)
            for r_csv, r_xlsx in zip(csv_preview.preview, xlsx_preview.preview):
                self.assertEqual(r_csv.transaction_date, r_xlsx.transaction_date)
                self.assertEqual(r_csv.description, r_xlsx.description)
                self.assertEqual(r_csv.amount, r_xlsx.amount)
                self.assertEqual(r_csv.transaction_type, r_xlsx.transaction_type)
                self.assertEqual(r_csv.category, r_xlsx.category)
                self.assertEqual(r_csv.predicted_category, r_xlsx.predicted_category)
                self.assertEqual(
                    r_csv.prediction_confidence, r_xlsx.prediction_confidence
                )

            _run_sync(
                import_statement(
                    upload=_make_upload_file("march.csv", csv_content),
                    current_user=self.user1,
                    db=self.db,
                )
            )
            _run_sync(
                import_statement(
                    upload=_make_upload_file("march.xlsx", xlsx_content),
                    current_user=self.user2,
                    db=self.db,
                )
            )

        user1_txs = self.db.scalars(
            select(Transaction)
            .where(Transaction.user_id == self.user1.id)
            .order_by(Transaction.transaction_date.asc())
        ).all()
        user2_txs = self.db.scalars(
            select(Transaction)
            .where(Transaction.user_id == self.user2.id)
            .order_by(Transaction.transaction_date.asc())
        ).all()

        self.assertEqual(len(user1_txs), 2)
        self.assertEqual(len(user2_txs), 2)
        for t1, t2 in zip(user1_txs, user2_txs):
            self.assertEqual(t1.description, t2.description)
            self.assertEqual(t1.amount, t2.amount)
            self.assertEqual(t1.category, t2.category)
            self.assertEqual(t1.predicted_category, t2.predicted_category)
            self.assertEqual(t1.prediction_confidence, t2.prediction_confidence)
            self.assertEqual(t1.is_reviewed, t2.is_reviewed)

    def test_invalid_rows_do_not_invoke_ml_prediction(self):
        """8: Invalid rows (missing date, description, amount, or type) never invoke predict_category."""
        csv_data = _csv_bytes([
            {
                "date": "invalid-date",
                "description": "Starbucks Coffee",
                "amount": "300.00",
                "transaction_type": "expense",
            },
            {
                "date": "2026-03-20",
                "description": "",
                "amount": "300.00",
                "transaction_type": "expense",
            },
            {
                "date": "2026-03-20",
                "description": "Uber Ride",
                "amount": "+50.00",
                "transaction_type": "expense",
            },
            {
                "date": "2026-03-20",
                "description": "Grocery Store",
                "amount": "500.00",
                "transaction_type": "invalid_type",
            },
        ])

        with patch("app.statement_import.predict_category") as mock_predict:
            preview = _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("invalid.csv", csv_data),
                    current_user=self.user1,
                )
            )
            self.assertEqual(mock_predict.call_count, 0)
            self.assertEqual(preview.valid_rows, 0)
            self.assertEqual(preview.invalid_rows, 4)
            for row in preview.preview:
                self.assertFalse(row.is_valid)
                self.assertEqual(row.category, "Other")
                self.assertIsNone(row.predicted_category)
                self.assertIsNone(row.prediction_confidence)

    def test_alias_collision_description_and_narration_rejected(self):
        """Reject files where both description and narration normalize to description."""
        csv_data = _csv_bytes([
            {
                "date": "2026-03-25",
                "description": "Coffee Shop",
                "narration": "UPI payment to coffee shop",
                "amount": "250.00",
                "transaction_type": "expense",
            }
        ])

        with self.assertRaises(HTTPException) as ctx:
            _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("collision1.csv", csv_data),
                    current_user=self.user1,
                )
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("multiple columns mapping to the same field", ctx.exception.detail)
        self.assertIn("'description'", ctx.exception.detail)
        self.assertIn("description", ctx.exception.detail)
        self.assertIn("narration", ctx.exception.detail)

    def test_alias_collision_description_and_details_rejected(self):
        """Reject files where both description and details normalize to description."""
        csv_data = _csv_bytes([
            {
                "date": "2026-03-25",
                "description": "Supermarket",
                "details": "Card swipe at supermarket",
                "amount": "1450.00",
                "transaction_type": "expense",
            }
        ])

        with self.assertRaises(HTTPException) as ctx:
            _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("collision2.csv", csv_data),
                    current_user=self.user1,
                )
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("multiple columns mapping to the same field", ctx.exception.detail)
        self.assertIn("'description'", ctx.exception.detail)
        self.assertIn("description", ctx.exception.detail)
        self.assertIn("details", ctx.exception.detail)

    def test_valid_single_alias_imports(self):
        """Allow valid single aliases (transaction_date -> date, narration -> description, type -> transaction_type)."""
        csv_data = _csv_bytes([
            {
                "transaction_date": "2026-03-25",
                "narration": "Metro Card Recharge",
                "amount": "500.00",
                "type": "expense",
            }
        ])

        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("single_alias.csv", csv_data),
                current_user=self.user1,
            )
        )
        self.assertEqual(preview.total_rows, 1)
        self.assertEqual(preview.valid_rows, 1)
        row = preview.preview[0]
        self.assertTrue(row.is_valid)
        self.assertEqual(str(row.transaction_date), "2026-03-25")
        self.assertEqual(row.description, "Metro Card Recharge")
        self.assertEqual(row.transaction_type, "expense")
        self.assertEqual(row.amount, Decimal("500.00"))

    def test_case_insensitive_alias_handling(self):
        """Support case-insensitive and title-case aliases (e.g. PARTICULARS, Date, TYPE)."""
        csv_data = _csv_bytes([
            {
                "Date": "2026-03-25",
                "PARTICULARS": "Bookstore Online",
                "Amount": "750.00",
                "Type": "expense",
            }
        ])

        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("case_alias.csv", csv_data),
                current_user=self.user1,
            )
        )
        self.assertEqual(preview.total_rows, 1)
        self.assertEqual(preview.valid_rows, 1)
        row = preview.preview[0]
        self.assertTrue(row.is_valid)
        self.assertEqual(str(row.transaction_date), "2026-03-25")
        self.assertEqual(row.description, "Bookstore Online")
        self.assertEqual(row.transaction_type, "expense")
        self.assertEqual(row.amount, Decimal("750.00"))

    def test_statement_history_user_isolation(self):
        """Statement import history strictly returns records for the authenticated user (GAP-ISO-01)."""
        csv_u1 = _csv_bytes([
            {
                "date": "2026-03-20",
                "description": "User1 Groceries",
                "amount": "1200.00",
                "transaction_type": "expense",
            }
        ])
        csv_u2 = _csv_bytes([
            {
                "date": "2026-03-22",
                "description": "User2 Utilities",
                "amount": "2500.00",
                "transaction_type": "expense",
            }
        ])

        with patch("app.statement_import.predict_category") as mock_predict:
            mock_predict.return_value = {
                "predicted_category": "Food/Dining",
                "confidence": 0.95,
                "needs_review": False,
            }
            res_u1 = _run_sync(
                import_statement(
                    upload=_make_upload_file("user1_statement.csv", csv_u1),
                    current_user=self.user1,
                    db=self.db,
                )
            )
            res_u2 = _run_sync(
                import_statement(
                    upload=_make_upload_file("user2_statement.csv", csv_u2),
                    current_user=self.user2,
                    db=self.db,
                )
            )

        u1_import_id = res_u1["import_id"]
        u2_import_id = res_u2["import_id"]
        self.assertNotEqual(u1_import_id, u2_import_id)

        # User 1 queries history: receives only User 1's records
        u1_history = get_statement_history(current_user=self.user1, db=self.db)
        self.assertEqual(len(u1_history), 1)
        self.assertEqual(u1_history[0].id, u1_import_id)
        self.assertEqual(u1_history[0].user_id, self.user1.id)
        self.assertEqual(u1_history[0].filename, "user1_statement.csv")

        # User 2 queries history: receives only User 2's records (not empty, avoiding false positive on empty DB)
        u2_history = get_statement_history(current_user=self.user2, db=self.db)
        self.assertEqual(len(u2_history), 1)
        self.assertEqual(u2_history[0].id, u2_import_id)
        self.assertEqual(u2_history[0].user_id, self.user2.id)
        self.assertEqual(u2_history[0].filename, "user2_statement.csv")

        # Explicit negative isolation assertions
        u1_ids = {item.id for item in u1_history}
        u2_ids = {item.id for item in u2_history}
        self.assertNotIn(u2_import_id, u1_ids)
        self.assertNotIn(u1_import_id, u2_ids)

        u1_filenames = {item.filename for item in u1_history}
        u2_filenames = {item.filename for item in u2_history}
        self.assertNotIn("user2_statement.csv", u1_filenames)
        self.assertNotIn("user1_statement.csv", u2_filenames)


class PaytmAndMultiSheetStatementTestCase(unittest.TestCase):
    """Integration and unit tests for multi-sheet Excel statements, alias mapping, and signed amounts."""

    def setUp(self):
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
        self.user = User(id=1, email="paytm_user@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_multi_sheet_workbook_selects_transaction_sheet_over_summary(self):
        """1 & 2: Automatically detects and selects Passbook Payment History sheet over Summary sheet."""
        summary_rows = [
            {"Account Holder": "John Doe", "Generated On": "2026-11-06"},
            {"Total Debits": "1500.00", "Total Credits": "2000.00"},
        ]
        tx_rows = [
            {
                "Date": "2026-11-06",
                "Transaction Details": "Paid to Meesho",
                "Amount": "-135.00",
            },
            {
                "Date": "2026-11-02",
                "Transaction Details": "Received from Client",
                "Amount": "+338.00",
            },
        ]
        xlsx_bytes = _multi_sheet_xlsx_bytes({
            "Summary": summary_rows,
            "Passbook Payment History": tx_rows,
        })

        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("Paytm_Statement.xlsx", xlsx_bytes),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.total_rows, 2)
        self.assertEqual(preview.valid_rows, 2)
        self.assertEqual(preview.invalid_rows, 0)
        # Check Row 1 (Expense)
        r1 = preview.preview[0]
        self.assertEqual(r1.description, "Paid to Meesho")
        self.assertEqual(r1.amount, Decimal("135.00"))
        self.assertEqual(r1.transaction_type, "expense")
        self.assertTrue(r1.is_valid)
        # Check Row 2 (Income)
        r2 = preview.preview[1]
        self.assertEqual(r2.description, "Received from Client")
        self.assertEqual(r2.amount, Decimal("338.00"))
        self.assertEqual(r2.transaction_type, "income")
        self.assertTrue(r2.is_valid)

    def test_transaction_details_alias_maps_to_description(self):
        """3: 'Transaction Details' maps cleanly to canonical 'description'."""
        rows = [
            {
                "date": "2026-10-15",
                "transaction_details": "Coffee Shop Order",
                "amount": "250.00",
                "transaction_type": "expense",
            }
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("test.xlsx", _xlsx_bytes(rows)),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.total_rows, 1)
        self.assertEqual(preview.preview[0].description, "Coffee Shop Order")

    def test_negative_signed_amount_string_infers_expense_with_positive_magnitude(self):
        """4: Negative signed amount string (e.g. '-135.00') infers expense with positive Decimal magnitude."""
        rows = [
            {"date": "2026-10-01", "description": "Electric Bill", "amount": "-135.00"}
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("test.xlsx", _xlsx_bytes(rows)),
                current_user=self.user,
            )
        )
        r = preview.preview[0]
        self.assertTrue(r.is_valid)
        self.assertEqual(r.amount, Decimal("135.00"))
        self.assertEqual(r.transaction_type, "expense")

    def test_positive_signed_amount_string_infers_income_with_positive_magnitude(self):
        """5: Positive signed amount string (e.g. '+338.00') infers income with positive Decimal magnitude."""
        rows = [
            {"date": "2026-10-02", "description": "Cashback Bonus", "amount": "+338.00"}
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("test.xlsx", _xlsx_bytes(rows)),
                current_user=self.user,
            )
        )
        r = preview.preview[0]
        self.assertTrue(r.is_valid)
        self.assertEqual(r.amount, Decimal("338.00"))
        self.assertEqual(r.transaction_type, "income")

    def test_signed_numeric_amounts(self):
        """6: Both negative and positive numeric values (float/int) correctly infer direction and magnitude."""
        rows = [
            {"date": "2026-10-03", "description": "Supermarket", "amount": -140.50},
            {"date": "2026-10-04", "description": "Freelance Payout", "amount": 350},
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("test.xlsx", _xlsx_bytes(rows)),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.valid_rows, 2)
        r1, r2 = preview.preview[0], preview.preview[1]
        self.assertEqual(r1.amount, Decimal("140.50"))
        self.assertEqual(r1.transaction_type, "expense")
        self.assertEqual(r2.amount, Decimal("350.00"))
        self.assertEqual(r2.transaction_type, "income")

    def test_invalid_zero_and_malformed_amounts(self):
        """7: Zero, empty, non-numeric, and non-finite amounts are rejected as invalid."""
        rows = [
            {"date": "2026-10-05", "description": "Zero String", "amount": "0.00"},
            {"date": "2026-10-06", "description": "Zero Numeric", "amount": 0},
            {"date": "2026-10-07", "description": "Alphabet Amount", "amount": "invalid_amt"},
            {"date": "2026-10-08", "description": "Empty Amount", "amount": ""},
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("test.xlsx", _xlsx_bytes(rows)),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.total_rows, 4)
        self.assertEqual(preview.valid_rows, 0)
        self.assertEqual(preview.invalid_rows, 4)
        for r in preview.preview:
            self.assertFalse(r.is_valid)
            self.assertIn("Invalid amount; enter a positive number.", r.errors)

    def test_parenthesised_negative_amount_infers_expense(self):
        """Optional: Parenthesised negative amounts like '(135.00)' cleanly infer expense."""
        rows = [
            {"date": "2026-10-09", "description": "Bank Fee", "amount": "(135.00)"}
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("test.xlsx", _xlsx_bytes(rows)),
                current_user=self.user,
            )
        )
        r = preview.preview[0]
        self.assertTrue(r.is_valid)
        self.assertEqual(r.amount, Decimal("135.00"))
        self.assertEqual(r.transaction_type, "expense")

    def test_explicit_transaction_type_preserves_existing_behaviour(self):
        """8: Explicit transaction_type respects unsigned amounts, signed matching debits, and rejects sign conflicts."""
        rows = [
            {
                "date": "2026-10-10",
                "description": "Explicit Income",
                "amount": "1000.00",
                "transaction_type": "income",
            },
            {
                "date": "2026-10-11",
                "description": "Explicit Expense",
                "amount": "50.00",
                "transaction_type": "expense",
            },
            {
                "date": "2026-10-12",
                "description": "Signed Negative Debit",
                "amount": "-50.00",
                "transaction_type": "expense",
            },
            {
                "date": "2026-10-13",
                "description": "Conflicting Positive Debit",
                "amount": "+50.00",
                "transaction_type": "expense",
            },
            {
                "date": "2026-10-14",
                "description": "Conflicting Negative Credit",
                "amount": "-200.00",
                "transaction_type": "income",
            },
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("test.xlsx", _xlsx_bytes(rows)),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.total_rows, 5)
        self.assertEqual(preview.valid_rows, 3)
        self.assertEqual(preview.invalid_rows, 2)
        self.assertTrue(preview.preview[0].is_valid)
        self.assertEqual(preview.preview[0].transaction_type, "income")
        self.assertTrue(preview.preview[1].is_valid)
        self.assertEqual(preview.preview[1].transaction_type, "expense")
        self.assertTrue(preview.preview[2].is_valid)
        self.assertEqual(preview.preview[2].amount, Decimal("50.00"))
        self.assertEqual(preview.preview[2].transaction_type, "expense")
        self.assertFalse(preview.preview[3].is_valid)
        self.assertFalse(preview.preview[4].is_valid)

    def test_single_sheet_excel_import_compatibility(self):
        """9: Ordinary single-sheet Excel files continue to parse and preview identically."""
        rows = [
            {
                "date": "2026-10-13",
                "description": "Single Sheet Groceries",
                "amount": "750.00",
                "transaction_type": "expense",
            }
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("single.xlsx", _xlsx_bytes(rows)),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.valid_rows, 1)
        self.assertEqual(preview.preview[0].description, "Single Sheet Groceries")
        self.assertEqual(preview.preview[0].transaction_type, "expense")

    def test_csv_import_compatibility(self):
        """10: Standard CSV files continue to parse and preview identically."""
        rows = [
            {
                "date": "2026-10-14",
                "description": "CSV Dining",
                "amount": "450.00",
                "transaction_type": "expense",
            }
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("test.csv", _csv_bytes(rows)),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.valid_rows, 1)
        self.assertEqual(preview.preview[0].description, "CSV Dining")

    def test_multi_sheet_workbook_with_no_transaction_sheet_raises_clean_error(self):
        """11: Multi-sheet workbook with no identifiable transaction worksheet raises descriptive HTTPException(400)."""
        xlsx_bytes = _multi_sheet_xlsx_bytes({
            "Summary": [{"A": "1", "B": "2"}],
            "Instructions": [{"Notes": "Read carefully"}],
        })
        with self.assertRaises(HTTPException) as cm:
            _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("no_tx.xlsx", xlsx_bytes),
                    current_user=self.user,
                )
            )
        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn("No transaction worksheet found in Excel workbook", cm.exception.detail)

    def test_alias_collision_description_and_transaction_details_rejected(self):
        """Collision detection correctly rejects files with both description and transaction_details."""
        rows = [
            {
                "date": "2026-10-15",
                "description": "Desc 1",
                "transaction_details": "Desc 2",
                "amount": "100.00",
                "transaction_type": "expense",
            }
        ]
        with self.assertRaises(HTTPException) as cm:
            _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("collision.xlsx", _xlsx_bytes(rows)),
                    current_user=self.user,
                )
            )
        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn("multiple columns mapping to the same field", cm.exception.detail)


class PaytmTagMappingAndMerchantOverridesTestCase(unittest.TestCase):
    """Focused tests for Paytm Tags category mapping, merchant overrides, and precedence rules."""

    def setUp(self):
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
        self.user = User(
            id=1,
            email="tagtester@example.com",
            password_hash="hash",
        )
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)

    def test_all_ten_paytm_tags_mapped_to_canonical_categories(self):
        """All ten Paytm tags map cleanly to their verified canonical SpendWise categories."""
        tag_test_cases = [
            ("#🛍 Shopping", "Shopping"),
            ("#💵 Money Received", "Income"),
            ("#✈️ Travel", "Transport"),
            ("#💵 Money Transfer", "Transfers/Repayments"),
            ("#🥘 Food", "Food/Dining"),
            ("#🛒 Groceries", "Groceries"),
            ("#🎈 Entertainment", "Entertainment"),
            ("#🏦 Services", "Other"),
            ("#🔄 Miscellaneous", "Other"),
            ("#↩️ Refund", "Income"),
        ]
        rows = [
            {
                "Date": f"2026-10-{i+1:02d}",
                "Transaction Details": f"Generic Transaction {i+1}",
                "Amount": "-100.00",
                "Tags": tag,
            }
            for i, (tag, _) in enumerate(tag_test_cases)
        ]
        xlsx_bytes = _multi_sheet_xlsx_bytes({
            "Summary": [{"Note": "Summary"}],
            "Passbook Payment History": rows,
        })
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("tags_test.xlsx", xlsx_bytes),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.valid_rows, 10)
        for i, (_, expected_category) in enumerate(tag_test_cases):
            self.assertEqual(
                preview.preview[i].category,
                expected_category,
                f"Row {i+1} tag failed: expected {expected_category}, got {preview.preview[i].category}",
            )
            self.assertIsNone(preview.preview[i].predicted_category)

    def test_tag_normalization_case_whitespace_and_emojis(self):
        """Tags with variations in casing, whitespace, and prefixes normalize correctly."""
        rows = [
            {"Date": "2026-10-01", "Transaction Details": "Item 1", "Amount": "-10.00", "Tags": "  #  travel  "},
            {"Date": "2026-10-02", "Transaction Details": "Item 2", "Amount": "-20.00", "Tags": "SHOPPING"},
            {"Date": "2026-10-03", "Transaction Details": "Item 3", "Amount": "+30.00", "Tags": "money received"},
            {"Date": "2026-10-04", "Transaction Details": "Item 4", "Amount": "-40.00", "Tags": "#🥘 Food"},
        ]
        xlsx_bytes = _xlsx_bytes(rows)
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("norm.xlsx", xlsx_bytes),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.valid_rows, 4)
        self.assertEqual(preview.preview[0].category, "Transport")
        self.assertEqual(preview.preview[1].category, "Shopping")
        self.assertEqual(preview.preview[2].category, "Income")
        self.assertEqual(preview.preview[3].category, "Food/Dining")

    def test_unknown_non_empty_tags_map_to_other(self):
        """Unknown non-empty tags map to canonical 'Other'."""
        rows = [
            {"Date": "2026-10-01", "Transaction Details": "Unusual Item", "Amount": "-50.00", "Tags": "#🛠 Hardware"},
            {"Date": "2026-10-02", "Transaction Details": "Bespoke Service", "Amount": "-60.00", "Tags": "CustomTag"},
        ]
        xlsx_bytes = _xlsx_bytes(rows)
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("unknown.xlsx", xlsx_bytes),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.valid_rows, 2)
        self.assertEqual(preview.preview[0].category, "Other")
        self.assertEqual(preview.preview[1].category, "Other")

    def test_blank_and_missing_tags_fall_back_to_ml_categorization(self):
        """Blank, whitespace-only, or NaN tags fall back to standard ML prediction."""
        rows = [
            {"Date": "2026-10-01", "Transaction Details": "Starbucks Coffee", "Amount": "-250.00", "Tags": ""},
            {"Date": "2026-10-02", "Transaction Details": "Uber Trip", "Amount": "-350.00", "Tags": "   "},
        ]
        xlsx_bytes = _xlsx_bytes(rows)
        with patch("app.statement_import.predict_category") as mock_predict:
            mock_predict.side_effect = [
                {"predicted_category": "Food/Dining", "confidence": 0.88, "needs_review": False},
                {"predicted_category": "Transport", "confidence": 0.91, "needs_review": False},
            ]
            preview = _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("blank_tags.xlsx", xlsx_bytes),
                    current_user=self.user,
                )
            )
        self.assertEqual(preview.valid_rows, 2)
        self.assertEqual(preview.preview[0].category, "Food/Dining")
        self.assertEqual(preview.preview[1].category, "Transport")

    def test_merchant_overrides_transport_food_other(self):
        """Verified merchant overrides apply strictly to known merchants regardless of tag."""
        rows = [
            # Ray Ri S Eatery: tagged as Groceries, overridden to Food/Dining
            {"Date": "2026-10-01", "Transaction Details": "Paid to Ray Ri S Eatery", "Amount": "-138.00", "Tags": "#🛒 Groceries"},
            # Roppen Transportation / Rapido: tagged as Services, overridden to Transport
            {"Date": "2026-10-02", "Transaction Details": "Paid to Roppen Transportation Services Private Limited", "Amount": "-63.00", "Tags": "#🏦 Services"},
            # DMRC: tagged as Services or Miscellaneous, overridden to Transport
            {"Date": "2026-10-03", "Transaction Details": "Paid to DMRC", "Amount": "-100.00", "Tags": "#🏦 Services"},
            {"Date": "2026-10-04", "Transaction Details": "Paid to Delhi Metro Rail Cor", "Amount": "-21.00", "Tags": "#🔄 Miscellaneous"},
            # Protean eGov: tagged as Shopping, overridden to Other
            {"Date": "2026-10-05", "Transaction Details": "Paid to Protean eGov Technologies Limited Pan Sg 1434", "Amount": "-8.26", "Tags": "#🛍 Shopping"},
            # Generic Person descriptions: do NOT trigger overrides, preserve mapped tag
            {"Date": "2026-10-06", "Transaction Details": "Paid to Person", "Amount": "-50.00", "Tags": "#🛒 Groceries"},
            {"Date": "2026-10-07", "Transaction Details": "Paid to Person", "Amount": "-140.00", "Tags": "#🥘 Food"},
        ]
        xlsx_bytes = _xlsx_bytes(rows)
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("overrides.xlsx", xlsx_bytes),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.valid_rows, 7)
        self.assertEqual(preview.preview[0].category, "Food/Dining")
        self.assertEqual(preview.preview[1].category, "Transport")
        self.assertEqual(preview.preview[2].category, "Transport")
        self.assertEqual(preview.preview[3].category, "Transport")
        self.assertEqual(preview.preview[4].category, "Other")
        # Generic Person preserved tags
        self.assertEqual(preview.preview[5].category, "Groceries")
        self.assertEqual(preview.preview[6].category, "Food/Dining")

    def test_precedence_explicit_category_column_not_overwritten_by_tags_or_merchant_rules(self):
        """When an explicit 'Category' column is present, its values are respected as-is without merchant overrides."""
        rows = [
            # Ray Ri S Eatery has an explicit 'Groceries' category; explicit category takes precedence
            {"date": "2026-10-01", "description": "Paid to Ray Ri S Eatery", "amount": "138.00", "transaction_type": "expense", "category": "Groceries"},
            {"date": "2026-10-02", "description": "Paid to DMRC", "amount": "100.00", "transaction_type": "expense", "category": "Entertainment"},
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("explicit_cat.xlsx", _xlsx_bytes(rows)),
                current_user=self.user,
            )
        )
        self.assertEqual(preview.valid_rows, 2)
        self.assertEqual(preview.preview[0].category, "Groceries")
        self.assertEqual(preview.preview[1].category, "Entertainment")

    def test_precedence_collision_between_category_and_tags_raises_http_400(self):
        """Files containing both 'Category' and 'Tags' columns trigger the strict HTTP 400 collision error."""
        rows = [
            {"date": "2026-10-01", "description": "Store A", "amount": "100.00", "category": "Shopping", "tags": "#🛍 Shopping"}
        ]
        with self.assertRaises(HTTPException) as cm:
            _run_sync(
                preview_uploaded_statement(
                    upload=_make_upload_file("both_cols.xlsx", _xlsx_bytes(rows)),
                    current_user=self.user,
                )
            )
        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn("multiple columns mapping to the same field", cm.exception.detail)
        self.assertIn("'category'", cm.exception.detail)

    def test_paytm_tags_import_deduplication_and_persistence(self):
        """Transactions imported with Paytm tags persist their mapped categories and deduplicate correctly."""
        rows = [
            {"Date": "2026-10-01", "Transaction Details": "Paid to Meesho", "Amount": "-135.00", "Tags": "#🛍 Shopping"},
            {"Date": "2026-10-02", "Transaction Details": "Received from Meesho", "Amount": "+338.00", "Tags": "#💵 Money Received"},
        ]
        xlsx_bytes = _multi_sheet_xlsx_bytes({
            "Passbook Payment History": rows,
        })
        import_res = _run_sync(
            import_statement(
                upload=_make_upload_file("paytm_import.xlsx", xlsx_bytes),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(import_res["total_rows"], 2)
        self.assertEqual(import_res["imported_rows"], 2)

        txs = self.db.scalars(
            select(Transaction).where(Transaction.user_id == self.user.id).order_by(Transaction.transaction_date.asc())
        ).all()
        self.assertEqual(len(txs), 2)
        self.assertEqual(txs[0].category, "Shopping")
        self.assertEqual(txs[0].transaction_type, "expense")
        self.assertEqual(txs[0].amount, Decimal("135.00"))
        self.assertEqual(txs[1].category, "Income")
        self.assertEqual(txs[1].transaction_type, "income")
        self.assertEqual(txs[1].amount, Decimal("338.00"))

        # Re-importing identical statement should skip duplicates
        second_res = _run_sync(
            import_statement(
                upload=_make_upload_file("paytm_import.xlsx", xlsx_bytes),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(second_res["imported_rows"], 0)
        self.assertEqual(second_res["rejected_rows"], 2)


class StatementImportSafetyAndParsingTestCase(unittest.TestCase):
    """Focused Batch 1 Workstream B regression tests (B1-B6)."""

    def setUp(self):
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
        self.user = User(id=1, email="safety@spendwise.ai", password_hash="hash1")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_parse_date_supports_native_iso_timestamps_tz_and_dayfirst_without_warnings(self):
        """B1: parse_date handles native objects, ISO datetimes, offsets, and dayfirst without warnings."""
        from datetime import date
        import warnings
        from app.statement_import import parse_date

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            self.assertEqual(parse_date(date(2026, 3, 17)), date(2026, 3, 17))
            self.assertEqual(parse_date(datetime(2026, 3, 17, 14, 30, 0)), date(2026, 3, 17))
            self.assertEqual(parse_date(pd.Timestamp("2026-03-17 09:15:00")), date(2026, 3, 17))
            self.assertEqual(parse_date("2026-03-17"), date(2026, 3, 17))
            self.assertEqual(parse_date("2026-03-17 10:30:00"), date(2026, 3, 17))
            self.assertEqual(parse_date("2026-03-17T10:30:00"), date(2026, 3, 17))
            self.assertEqual(parse_date("2026-03-17T10:30:00Z"), date(2026, 3, 17))
            self.assertEqual(parse_date("2026-03-17T10:30:00+05:30"), date(2026, 3, 17))
            self.assertEqual(parse_date("17/03/2026"), date(2026, 3, 17))
            self.assertEqual(parse_date("17-03-2026"), date(2026, 3, 17))
            self.assertEqual(parse_date("17 Mar 2026"), date(2026, 3, 17))
            self.assertIsNone(parse_date("2026-02-30"))
            self.assertIsNone(parse_date("not-a-date"))
            self.assertIsNone(parse_date(None))
            self.assertIsNone(parse_date(pd.NaT))

        user_warnings = [w for w in caught if issubclass(w.category, UserWarning)]
        self.assertEqual(user_warnings, [], f"Unexpected warnings: {[str(w.message) for w in user_warnings]}")

    def test_dedup_persists_after_recategorization_and_handles_identical_rows(self):
        """B2 & B6: Recategorized transactions still deduplicate on re-import, and preview flags duplicates."""
        base_csv = (
            "date,description,amount,transaction_type,category\n"
            "2026-03-17,Metro Card Recharge,500.00,expense,Transport\n"
        ).encode("utf-8")

        first = _run_sync(
            import_statement(
                upload=_make_upload_file("metro.csv", base_csv),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(first["imported_rows"], 1)

        # User manually recategorizes the imported transaction in their ledger
        saved_tx = self.db.scalar(select(Transaction).where(Transaction.user_id == self.user.id))
        saved_tx.category = "Bills/Commute"
        self.db.commit()

        # Preview with DB session should flag it as a duplicate even after recategorization
        preview_reimport = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("metro.csv", base_csv),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(preview_reimport.valid_rows, 1)
        self.assertEqual(preview_reimport.duplicate_rows, 1)
        self.assertTrue(preview_reimport.preview[0].is_duplicate)

        # Re-importing unchanged statement after recategorization must skip it cleanly
        reimport = _run_sync(
            import_statement(
                upload=_make_upload_file("metro.csv", base_csv),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(reimport["imported_rows"], 0)
        self.assertEqual(reimport["rejected_rows"], 1)

        # Two identical-looking rows inside one CSV (no distinguishing ID in format): 1st imported, 2nd skipped
        identical_csv = (
            "date,description,amount,transaction_type,category\n"
            "2026-03-18,Morning Coffee,120.00,expense,Food/Dining\n"
            "2026-03-18,Morning Coffee,120.00,expense,Food/Dining\n"
        ).encode("utf-8")
        preview_dup = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("coffee.csv", identical_csv),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(preview_dup.valid_rows, 2)
        self.assertEqual(preview_dup.duplicate_rows, 1)
        self.assertFalse(preview_dup.preview[0].is_duplicate)
        self.assertTrue(preview_dup.preview[1].is_duplicate)

        coffee_import = _run_sync(
            import_statement(
                upload=_make_upload_file("coffee.csv", identical_csv),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(coffee_import["imported_rows"], 1)
        self.assertEqual(coffee_import["rejected_rows"], 1)

    def test_upload_extension_checked_before_reading_and_oversize_aborts_with_413(self):
        """B3: Extension is checked before read(), and chunked read enforces MAX_FILE_SIZE -> 413."""
        from app.statement_import import MAX_FILE_SIZE, UPLOAD_CHUNK_SIZE

        class _TrackingUploadFile(UploadFile):
            def __init__(self, filename: str, total_size: int):
                super().__init__(file=BytesIO(), filename=filename)
                self.total_size = total_size
                self.bytes_read = 0
                self.read_calls = 0

            async def read(self, size: int = -1) -> bytes:
                self.read_calls += 1
                remaining = self.total_size - self.bytes_read
                if remaining <= 0:
                    return b""
                n = remaining if (size is None or size < 0) else min(size, remaining)
                self.bytes_read += n
                return b"a" * n

        bad_ext_upload = _TrackingUploadFile("malware.exe", 1024)
        with self.assertRaises(HTTPException) as ext_ctx:
            _run_sync(
                preview_uploaded_statement(
                    upload=bad_ext_upload,
                    current_user=self.user,
                    db=self.db,
                )
            )
        self.assertEqual(ext_ctx.exception.status_code, 400)
        self.assertEqual(bad_ext_upload.read_calls, 0, "Invalid extension must fail before reading upload bytes")

        # 50 MB virtual stream must abort cleanly right past MAX_FILE_SIZE instead of buffering all 50 MB
        huge_upload = _TrackingUploadFile("huge.csv", 50 * 1024 * 1024)
        with self.assertRaises(HTTPException) as size_ctx:
            _run_sync(
                import_statement(
                    upload=huge_upload,
                    current_user=self.user,
                    db=self.db,
                )
            )
        self.assertEqual(size_ctx.exception.status_code, 413)
        self.assertLessEqual(huge_upload.bytes_read, MAX_FILE_SIZE + UPLOAD_CHUNK_SIZE)

    def test_xlsx_zip_guard_and_csv_row_limit_enforced(self):
        """B3: XLSX entry/uncompressed size guards and 10,000-row cap reject unsafe files with 400."""
        import zipfile
        from app.statement_import import (
            MAX_ROWS,
            MAX_XLSX_UNCOMPRESSED_SIZE,
            MAX_XLSX_ZIP_ENTRIES,
            read_statement_file,
        )

        # Fake zip exceeding MAX_XLSX_ZIP_ENTRIES
        many_entries_buf = BytesIO()
        with zipfile.ZipFile(many_entries_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for i in range(MAX_XLSX_ZIP_ENTRIES + 2):
                zf.writestr(f"entry_{i}.xml", "x")
        with self.assertRaises(HTTPException) as entry_ctx:
            read_statement_file("many.xlsx", many_entries_buf.getvalue())
        self.assertEqual(entry_ctx.exception.status_code, 400)
        self.assertIn("entry limit", entry_ctx.exception.detail)

        # Fake zip exceeding MAX_XLSX_UNCOMPRESSED_SIZE via highly compressible payload
        bomb_buf = BytesIO()
        with zipfile.ZipFile(bomb_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("xl/worksheets/sheet1.xml", b"0" * (MAX_XLSX_UNCOMPRESSED_SIZE + 1024))
        with self.assertRaises(HTTPException) as size_ctx:
            read_statement_file("bomb.xlsx", bomb_buf.getvalue())
        self.assertEqual(size_ctx.exception.status_code, 400)
        self.assertIn("safety limit", size_ctx.exception.detail)

        # Row limit > 10,000 rows rejected cleanly
        header = "date,description,amount\n"
        one_row = "2026-03-17,Tea,10\n"
        over_limit_csv = (header + one_row * (MAX_ROWS + 1)).encode("utf-8")
        with self.assertRaises(HTTPException) as rows_ctx:
            read_statement_file("too_many_rows.csv", over_limit_csv)
        self.assertEqual(rows_ctx.exception.status_code, 400)
        self.assertIn("10,000-row limit", rows_ctx.exception.detail)

    def test_amount_bounds_match_numeric_12_2_and_nul_bytes_rejected(self):
        """B4: Sub-cent (0.001) and > Numeric(12,2) amounts are rejected; NUL bytes blocked from DB."""
        from app.statement_import import MAX_TRANSACTION_AMOUNT, parse_amount, parse_signed_amount

        self.assertIsNone(parse_amount("0.001"))
        self.assertIsNone(parse_amount("0.004"))
        self.assertEqual(parse_signed_amount("0.001"), (None, None))
        self.assertEqual(parse_signed_amount("-0.001"), (None, None))
        self.assertIsNone(parse_amount("10000000000.00"))
        self.assertEqual(parse_signed_amount("-10000000000.00"), (None, None))
        self.assertEqual(parse_amount("9999999999.99"), MAX_TRANSACTION_AMOUNT)
        self.assertEqual(parse_signed_amount("-9999999999.99"), (MAX_TRANSACTION_AMOUNT, "expense"))

        nul_csv = (
            b"date,description,amount,transaction_type,category\n"
            b"2026-03-17,Coffee\x00Shop,150.00,expense,Food\x00Extra\n"
            b"2026-03-18,Clean Cafe,200.00,expense,Food/Dining\n"
        )
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("nul.csv", nul_csv),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(preview.invalid_rows, 1)
        self.assertFalse(preview.preview[0].is_valid)
        self.assertTrue(any("null characters" in err for err in preview.preview[0].errors))
        self.assertNotIn("\x00", preview.preview[0].description or "")
        self.assertNotIn("\x00", preview.preview[0].category or "")

        imp = _run_sync(
            import_statement(
                upload=_make_upload_file("nul.csv", nul_csv),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(imp["imported_rows"], 1)
        self.assertEqual(imp["rejected_rows"], 1)
        tx = self.db.scalar(select(Transaction).where(Transaction.user_id == self.user.id))
        self.assertEqual(tx.description, "Clean Cafe")

    def test_csv_decoding_supports_utf8_bom_cp1252_and_rejects_corrupt_bytes(self):
        """B5: Decodes UTF-8 BOM and Windows-1252 CSVs cleanly, while rejecting corrupt binary bytes."""
        from app.statement_import import read_statement_file

        bom_csv = "date,description,amount,transaction_type\n2026-03-17,Chai ₹20,20.00,expense\n".encode("utf-8-sig")
        df_bom = read_statement_file("bom.csv", bom_csv)
        self.assertEqual(list(df_bom.columns), ["date", "description", "amount", "transaction_type"])
        self.assertEqual(df_bom.iloc[0]["description"], "Chai ₹20")

        cp1252_csv = "date,description,amount,transaction_type\n2026-03-17,Café \u2013 Lunch,350.00,expense\n".encode(
            "cp1252", errors="strict"
        )
        df_cp = read_statement_file("cp1252.csv", cp1252_csv)
        self.assertIn("Café", df_cp.iloc[0]["description"])

        # Bytes 0x81, 0x8d, 0x8f, 0x90, 0x9d are invalid in utf-8 AND undefined in cp1252
        corrupt_csv = b"date,description,amount\n2026-03-17,Bad\x81\x8d\x90Data,100.00\n"
        with self.assertRaises(HTTPException) as dec_ctx:
            read_statement_file("corrupt.csv", corrupt_csv)
        self.assertEqual(dec_ctx.exception.status_code, 400)
        self.assertIn("Could not decode CSV file", dec_ctx.exception.detail)


class PaytmSignedAmountAndStatusEligibilityTestCase(unittest.TestCase):
    """Focused Batch 1B regression tests for signed Debit/Credit types and SUCCESS-only status policy."""

    def setUp(self):
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
        self.user = User(id=1, email="paytm1b@spendwise.ai", password_hash="hash1")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_signed_amounts_with_explicit_type_validation_and_limits(self):
        """1-7: Explicit Debit/Credit validates matching signs, rejects conflicts, zero, invalid, sub-cent, overflow."""
        rows = [
            {"Date": "2026-04-01", "Description": "Paytm Order", "Amount": "-₹450.00", "Type": "Debit"},
            {"Date": "2026-04-02", "Description": "Salary Credit", "Amount": "+₹2,000.00", "Type": "Credit"},
            {"Date": "2026-04-03", "Description": "Bad Positive Debit", "Amount": "+₹450.00", "Type": "Debit"},
            {"Date": "2026-04-04", "Description": "Bad Negative Credit", "Amount": "-₹2,000.00", "Type": "Credit"},
            {"Date": "2026-04-05", "Description": "Zero Debit", "Amount": "0.00", "Type": "Debit"},
            {"Date": "2026-04-06", "Description": "Zero Credit", "Amount": 0, "Type": "Credit"},
            {"Date": "2026-04-07", "Description": "Malformed Text", "Amount": "abc", "Type": "Debit"},
            {"Date": "2026-04-08", "Description": "Sub-cent", "Amount": "-0.001", "Type": "Debit"},
            {"Date": "2026-04-09", "Description": "Over Max Limit", "Amount": "-10000000000.00", "Type": "Debit"},
            {"Date": "2026-04-10", "Description": "At Max Limit", "Amount": "-9999999999.99", "Type": "Debit"},
        ]
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("signed_types.csv", _csv_bytes(rows)),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(preview.total_rows, 10)
        self.assertEqual(preview.valid_rows, 3)
        self.assertEqual(preview.invalid_rows, 7)

        r0, r1, r9 = preview.preview[0], preview.preview[1], preview.preview[9]
        self.assertTrue(r0.is_valid)
        self.assertEqual(r0.transaction_type, "expense")
        self.assertEqual(r0.amount, Decimal("450.00"))
        self.assertTrue(r1.is_valid)
        self.assertEqual(r1.transaction_type, "income")
        self.assertEqual(r1.amount, Decimal("2000.00"))
        self.assertTrue(r9.is_valid)
        self.assertEqual(r9.amount, Decimal("9999999999.99"))

        for bad_idx in (2, 3, 4, 5, 6, 7, 8):
            self.assertFalse(preview.preview[bad_idx].is_valid, f"Row {bad_idx} should fail validation")

    def test_paytm_status_policy_filters_preview_and_import_without_double_counting(self):
        """8-13, 15, 19: Only SUCCESS enters ledger; PENDING/FAILED/missing/unknown excluded cleanly."""
        rows = [
            {"Date": "2026-04-01", "Description": "Payment to Swiggy", "Amount": -350.50, "Type": "Debit", "Tags": "Food", "Status": "SUCCESS"},
            {"Date": "2026-04-02", "Description": "Cashback Bonus", "Amount": 125.00, "Type": "Credit", "Tags": "Money Received", "Status": "  success  "},
            {"Date": "2026-04-03", "Description": "Pending Cab", "Amount": -240.00, "Type": "Debit", "Tags": "Travel", "Status": " pending "},
            {"Date": "2026-04-04", "Description": "Failed Bill", "Amount": -999.00, "Type": "Debit", "Tags": "Services", "Status": "FAILED"},
            {"Date": "2026-04-05", "Description": "Blank Status", "Amount": -100.00, "Type": "Debit", "Tags": "Other", "Status": "   "},
            {"Date": "2026-04-06", "Description": "Unknown Status", "Amount": -75.00, "Type": "Debit", "Tags": "Shopping", "Status": "REVERSED"},
            # Malformed SUCCESS row (0 amount) verifies invalid_rows stays distinct from status_excluded_rows
            {"Date": "2026-04-07", "Description": "Zero Success", "Amount": 0, "Type": "Debit", "Tags": "Food", "Status": "SUCCESS"},
            # Exact duplicate of row 1 (SUCCESS signed Debit)
            {"Date": "2026-04-01", "Description": "Payment to Swiggy", "Amount": -350.50, "Type": "Debit", "Tags": "Food", "Status": "SUCCESS"},
            # Exact duplicate of row 3 (PENDING) stays status-excluded, not double-counted in duplicate_rows
            {"Date": "2026-04-03", "Description": "Pending Cab", "Amount": -240.00, "Type": "Debit", "Tags": "Travel", "Status": "PENDING"},
        ]
        xlsx_data = _multi_sheet_xlsx_bytes({"Passbook Payment History": rows})
        preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("paytm_status.xlsx", xlsx_data),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(preview.total_rows, 9)
        self.assertEqual(preview.valid_rows, 3)  # Swiggy, Cashback, Swiggy-dup
        self.assertEqual(preview.duplicate_rows, 1)
        self.assertEqual(preview.importable_rows, 2)
        self.assertEqual(preview.status_excluded_rows, 5)  # 2 pending, 1 failed, 1 missing, 1 unknown
        self.assertEqual(preview.pending_rows, 2)
        self.assertEqual(preview.failed_rows, 1)
        self.assertEqual(preview.missing_status_rows, 1)
        self.assertEqual(preview.unknown_status_rows, 1)
        self.assertEqual(preview.invalid_rows, 1)  # Zero Success only
        # Exact partition check: valid + status_excluded + invalid == total
        self.assertEqual(
            preview.valid_rows + preview.status_excluded_rows + preview.invalid_rows,
            preview.total_rows,
        )
        self.assertEqual(preview.importable_rows + preview.duplicate_rows, preview.valid_rows)
        self.assertFalse(preview.preview[2].is_valid)
        self.assertTrue(preview.preview[2].is_status_excluded)
        self.assertEqual(preview.preview[2].source_status, "pending")
        self.assertIn("Pending", preview.preview[2].exclusion_reason or "")
        self.assertTrue(preview.preview[7].is_duplicate)
        self.assertTrue(preview.preview[8].is_status_excluded)
        self.assertFalse(preview.preview[8].is_duplicate)

        # Verify backend import_statement enforces SUCCESS-only independently
        imp = _run_sync(
            import_statement(
                upload=_make_upload_file("paytm_status.xlsx", xlsx_data),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(imp["total_rows"], 9)
        self.assertEqual(imp["imported_rows"], 2)
        self.assertEqual(imp["rejected_rows"], 7)

        saved_txs = self.db.scalars(
            select(Transaction).where(Transaction.user_id == self.user.id).order_by(Transaction.transaction_date.asc())
        ).all()
        self.assertEqual(len(saved_txs), 2)
        self.assertEqual([t.description for t in saved_txs], ["Payment to Swiggy", "Cashback Bonus"])
        self.assertEqual([t.amount for t in saved_txs], [Decimal("350.50"), Decimal("125.00")])

    def test_status_absent_and_other_bank_status_vocabularies_preserve_existing_behavior(self):
        """14: Files without Status or unrelated bank settled statuses ('Cleared', 'Posted') are not rejected."""
        no_status_csv = _csv_bytes([
            {"date": "2026-04-01", "description": "Groceries", "amount": "-250.00"},
        ])
        bank_csv = _csv_bytes([
            {"Date": "2026-04-02", "Description": "Utility Autopay", "Amount": "850.00", "Type": "Debit", "Status": "Cleared"},
            {"Date": "2026-04-03", "Description": "Salary Credit", "Amount": "5000.00", "Type": "Credit", "Status": "Posted"},
        ])
        p_no_status = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("plain.csv", no_status_csv),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(p_no_status.valid_rows, 1)
        self.assertEqual(p_no_status.status_excluded_rows, 0)

        p_bank = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("bank_export.csv", bank_csv),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(p_bank.valid_rows, 2)
        self.assertEqual(p_bank.status_excluded_rows, 0)

    def test_signed_debit_dedup_similar_distinct_and_category_independence(self):
        """16-18: Signed Debits deduplicate regardless of category while '(Secondary)' pairs stay distinct."""
        initial_rows = [
            {"Date": "2026-04-18", "Description": "Payment to Netflix", "Amount": -649.00, "Type": "Debit", "Tags": "Entertainment", "Status": "SUCCESS"},
            {"Date": "2026-04-18", "Description": "Payment to Netflix (Secondary)", "Amount": -649.00, "Type": "Debit", "Tags": "Entertainment", "Status": "SUCCESS"},
            {"Date": "2026-04-18", "Description": "Payment to Netflix", "Amount": -649.00, "Type": "Debit", "Tags": "Entertainment", "Status": "SUCCESS"},
        ]
        xlsx1 = _xlsx_bytes(initial_rows)
        preview1 = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("paytm_dedup.xlsx", xlsx1),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(preview1.valid_rows, 3)
        self.assertEqual(preview1.duplicate_rows, 1)
        self.assertEqual(preview1.importable_rows, 2)
        self.assertFalse(preview1.preview[1].is_duplicate)
        self.assertTrue(preview1.preview[2].is_duplicate)

        imp1 = _run_sync(
            import_statement(
                upload=_make_upload_file("paytm_dedup.xlsx", xlsx1),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(imp1["imported_rows"], 2)

        # Recategorize saved Netflix transaction and re-import with a different Tag -> still caught as duplicate
        tx = self.db.scalar(
            select(Transaction).where(Transaction.description == "Payment to Netflix")
        )
        tx.category = "Bills/Utilities"
        self.db.commit()

        reimport_rows = [
            {"Date": "2026-04-18", "Description": "Payment to Netflix", "Amount": -649.00, "Type": "Debit", "Tags": "Services", "Status": "SUCCESS"},
        ]
        reimport_preview = _run_sync(
            preview_uploaded_statement(
                upload=_make_upload_file("paytm_reimport.xlsx", _xlsx_bytes(reimport_rows)),
                current_user=self.user,
                db=self.db,
            )
        )
        self.assertEqual(reimport_preview.duplicate_rows, 1)
        self.assertEqual(reimport_preview.importable_rows, 0)


if __name__ == "__main__":
    unittest.main()


