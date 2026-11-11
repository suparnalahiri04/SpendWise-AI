import csv
from datetime import date, datetime, timezone
from decimal import Decimal
import io
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.dependencies import get_db
from app.main import app
from app.models import Base, Transaction, User
from app.reports import (
    calculate_report_summary,
    download_summary_pdf,
    download_transactions_csv,
    generate_csv_report,
    generate_pdf_report,
    get_report_summary,
    resolve_period_date_range,
    sanitize_csv_cell,
)


class ReportsBackendTestCase(unittest.TestCase):
    def setUp(self):
        # In-memory SQLite isolated per test
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
        self.user1 = User(id=1, email="user1@spendwise.ai", password_hash="hash1")
        self.user2 = User(id=2, email="user2@spendwise.ai", password_hash="hash2")
        self.db.add_all([self.user1, self.user2])
        self.db.commit()

        # Seed User 1 transactions
        self.tx_u1_salary = Transaction(
            id=1,
            user_id=1,
            transaction_date=datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc),
            description="Salary",
            amount=Decimal("50000.00"),
            transaction_type="income",
            category="Salary",
            is_reviewed=True,
        )
        self.tx_u1_groceries = Transaction(
            id=2,
            user_id=1,
            transaction_date=datetime(2026, 10, 5, 14, 30, tzinfo=timezone.utc),
            description="Supermarket Groceries",
            amount=Decimal("4000.00"),
            transaction_type="expense",
            category="Groceries",
            is_reviewed=True,
        )
        self.tx_u1_bills = Transaction(
            id=3,
            user_id=1,
            transaction_date=datetime(2026, 10, 15, 9, 0, tzinfo=timezone.utc),
            description="Fiber Internet",
            amount=Decimal("1000.00"),
            transaction_type="expense",
            category="Bills/Utilities",
            is_reviewed=False,
            predicted_category="Bills/Utilities",
        )
        # Transaction with formula injection characters in description & category
        self.tx_u1_injection = Transaction(
            id=4,
            user_id=1,
            transaction_date=datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc),
            description="=SUM(A1:A10)",
            amount=Decimal("500.00"),
            transaction_type="expense",
            category="@SpecialOffer",
            is_reviewed=False,
            predicted_category="-PromoDiscount",
        )

        # Seed User 2 transaction
        self.tx_u2_secret = Transaction(
            id=5,
            user_id=2,
            transaction_date=datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
            description="User2 Secret Income",
            amount=Decimal("99999.00"),
            transaction_type="income",
            category="Consulting",
            is_reviewed=True,
        )

        self.db.add_all([
            self.tx_u1_salary,
            self.tx_u1_groceries,
            self.tx_u1_bills,
            self.tx_u1_injection,
            self.tx_u2_secret,
        ])
        self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    # ---------------------------------------------------------
    # 1. Formula Injection Sanitization Tests
    # ---------------------------------------------------------
    def test_sanitize_csv_cell_neutralizes_formula_triggers(self):
        self.assertEqual(sanitize_csv_cell("=1+1"), "'=1+1")
        self.assertEqual(sanitize_csv_cell("+cmd"), "'+cmd")
        self.assertEqual(sanitize_csv_cell("-20% discount"), "'-20% discount")
        self.assertEqual(sanitize_csv_cell("@admin"), "'@admin")
        self.assertEqual(sanitize_csv_cell("\tTabbed"), "'\tTabbed")
        self.assertEqual(sanitize_csv_cell("\rReturn"), "'\rReturn")

    def test_sanitize_csv_cell_leaves_benign_text_untouched(self):
        self.assertEqual(sanitize_csv_cell("Normal Description"), "Normal Description")
        self.assertEqual(sanitize_csv_cell("Groceries"), "Groceries")
        self.assertEqual(sanitize_csv_cell(""), "")
        self.assertEqual(sanitize_csv_cell(None), "")

    # ---------------------------------------------------------
    # 2. Date Range Resolution & Validation Tests
    # ---------------------------------------------------------
    def test_resolve_period_custom_valid(self):
        start = date(2026, 10, 1)
        end = date(2026, 10, 15)
        res_start, res_end, label = resolve_period_date_range(None, start, end)
        self.assertEqual(res_start, start)
        self.assertEqual(res_end, end)
        self.assertEqual(label, "custom")

    def test_resolve_period_custom_missing_one_date_raises_422(self):
        with self.assertRaises(HTTPException) as ctx:
            resolve_period_date_range(None, date(2026, 10, 1), None)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Both start_date and end_date must be provided", ctx.exception.detail)

        with self.assertRaises(HTTPException) as ctx:
            resolve_period_date_range(None, None, date(2026, 10, 15))
        self.assertEqual(ctx.exception.status_code, 422)

    def test_resolve_period_custom_start_after_end_raises_422(self):
        with self.assertRaises(HTTPException) as ctx:
            resolve_period_date_range(None, date(2026, 10, 20), date(2026, 10, 10))
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("start_date cannot be after end_date", ctx.exception.detail)

    def test_resolve_period_named_periods(self):
        ref = date(2026, 10, 15)

        # this-month
        s, e, label = resolve_period_date_range("this-month", None, None, ref_date=ref)
        self.assertEqual(s, date(2026, 10, 1))
        self.assertEqual(e, date(2026, 10, 15))
        self.assertEqual(label, "this-month")

        # last-month
        s, e, label = resolve_period_date_range("last-month", None, None, ref_date=ref)
        self.assertEqual(s, date(2026, 9, 1))
        self.assertEqual(e, date(2026, 9, 30))
        self.assertEqual(label, "last-month")

        # last-3-months
        s, e, label = resolve_period_date_range("last-3-months", None, None, ref_date=ref)
        self.assertEqual(s, date(2026, 8, 1))
        self.assertEqual(e, date(2026, 10, 15))
        self.assertEqual(label, "last-3-months")

        # year-to-date
        s, e, label = resolve_period_date_range("year-to-date", None, None, ref_date=ref)
        self.assertEqual(s, date(2026, 1, 1))
        self.assertEqual(e, date(2026, 10, 15))
        self.assertEqual(label, "year-to-date")

        # all
        s, e, label = resolve_period_date_range("all", None, None, ref_date=ref)
        self.assertIsNone(s)
        self.assertIsNone(e)
        self.assertEqual(label, "all")

    def test_resolve_period_invalid_raises_422(self):
        with self.assertRaises(HTTPException) as ctx:
            resolve_period_date_range("invalid-period", None, None)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Invalid period", ctx.exception.detail)

    # ---------------------------------------------------------
    # 3. Financial Calculations & Zero Income Behavior
    # ---------------------------------------------------------
    def test_calculate_report_summary_standard(self):
        txs = [self.tx_u1_salary, self.tx_u1_groceries, self.tx_u1_bills]
        summary = calculate_report_summary(txs, "this-month", date(2026, 10, 1), date(2026, 10, 31))

        self.assertEqual(summary.total_income, Decimal("50000.00"))
        self.assertEqual(summary.total_expenses, Decimal("50000.00") - Decimal("45000.00"))  # 5000.00
        self.assertEqual(summary.net_savings, Decimal("45000.00"))
        # savings rate = (45000 / 50000) * 100 = 90.0%
        self.assertEqual(summary.savings_rate_pct, 90.0)
        self.assertEqual(summary.transaction_count, 3)
        self.assertEqual(summary.income_transaction_count, 1)
        self.assertEqual(summary.expense_transaction_count, 2)
        self.assertTrue(summary.has_transactions)

        # Categories: Groceries (4000 = 80%), Bills/Utilities (1000 = 20%)
        self.assertEqual(len(summary.categories), 2)
        self.assertEqual(summary.categories[0].category, "Groceries")
        self.assertEqual(summary.categories[0].amount, Decimal("4000.00"))
        self.assertEqual(summary.categories[0].percentage, 80.0)
        self.assertEqual(summary.categories[1].category, "Bills/Utilities")
        self.assertEqual(summary.categories[1].amount, Decimal("1000.00"))
        self.assertEqual(summary.categories[1].percentage, 20.0)

    def test_calculate_report_summary_zero_income_returns_none_savings_rate(self):
        txs = [self.tx_u1_groceries]
        summary = calculate_report_summary(txs, "this-month", date(2026, 10, 1), date(2026, 10, 31))

        self.assertEqual(summary.total_income, Decimal("0.00"))
        self.assertEqual(summary.total_expenses, Decimal("4000.00"))
        self.assertEqual(summary.net_savings, Decimal("-4000.00"))
        self.assertIsNone(summary.savings_rate_pct)
        self.assertEqual(summary.income_transaction_count, 0)
        self.assertEqual(summary.expense_transaction_count, 1)

    def test_calculate_report_summary_empty_transactions(self):
        summary = calculate_report_summary([], "this-month", date(2026, 10, 1), date(2026, 10, 31))

        self.assertEqual(summary.total_income, Decimal("0.00"))
        self.assertEqual(summary.total_expenses, Decimal("0.00"))
        self.assertEqual(summary.net_savings, Decimal("0.00"))
        self.assertIsNone(summary.savings_rate_pct)
        self.assertEqual(summary.transaction_count, 0)
        self.assertEqual(len(summary.categories), 0)
        self.assertFalse(summary.has_transactions)

    # ---------------------------------------------------------
    # 4. CSV Export Content & Formula Protection Tests
    # ---------------------------------------------------------
    def test_generate_csv_report_protects_formulas_and_preserves_db(self):
        txs = [self.tx_u1_injection]
        csv_bytes = generate_csv_report(txs)
        csv_text = csv_bytes.decode("utf-8-sig")

        reader = list(csv.reader(io.StringIO(csv_text)))
        self.assertEqual(reader[0], [
            "Date",
            "Description",
            "Category",
            "Type",
            "Amount (INR)",
            "Status",
            "Suggested Category",
        ])

        # Sanitized row: '=SUM(A1:A10)' was prefixed with '
        data_row = reader[1]
        self.assertEqual(data_row[1], "'=SUM(A1:A10)")
        self.assertEqual(data_row[2], "'@SpecialOffer")
        self.assertEqual(data_row[3], "expense")
        self.assertEqual(data_row[4], "500.00")
        self.assertEqual(data_row[5], "To Review")
        self.assertEqual(data_row[6], "'-PromoDiscount")

        # Database record must NOT have been altered
        db_tx = self.db.get(Transaction, 4)
        self.assertEqual(db_tx.description, "=SUM(A1:A10)")
        self.assertEqual(db_tx.category, "@SpecialOffer")

    # ---------------------------------------------------------
    # 5. PDF Export Generation Tests
    # ---------------------------------------------------------
    def test_generate_pdf_report_returns_valid_pdf_bytes(self):
        txs = [self.tx_u1_salary, self.tx_u1_groceries]
        summary = calculate_report_summary(txs, "this-month", date(2026, 10, 1), date(2026, 10, 31))

        pdf_bytes = generate_pdf_report(summary, "user1@spendwise.ai")
        self.assertIsInstance(pdf_bytes, bytes)
        self.assertTrue(len(pdf_bytes) > 500)
        # PDF magic header
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))

    def test_generate_pdf_report_empty_summary(self):
        summary = calculate_report_summary([], "this-month", date(2026, 10, 1), date(2026, 10, 31))
        pdf_bytes = generate_pdf_report(summary, "user1@spendwise.ai")
        self.assertIsInstance(pdf_bytes, bytes)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))

    def test_generate_pdf_report_with_xml_special_characters(self):
        """Verify PDF generation succeeds and preserves readable text for categories with &, <, >."""
        import base64
        import zlib

        special_txs = [
            Transaction(
                id=10,
                user_id=1,
                transaction_date=datetime(2026, 10, 2, tzinfo=timezone.utc),
                description="Dinner with friends",
                amount=Decimal("450.00"),
                transaction_type="expense",
                category="Food & Dining",
                is_reviewed=True,
            ),
            Transaction(
                id=11,
                user_id=1,
                transaction_date=datetime(2026, 10, 3, tzinfo=timezone.utc),
                description="Comparative test 1",
                amount=Decimal("120.00"),
                transaction_type="expense",
                category="A < B",
                is_reviewed=True,
            ),
            Transaction(
                id=12,
                user_id=1,
                transaction_date=datetime(2026, 10, 4, tzinfo=timezone.utc),
                description="Comparative test 2",
                amount=Decimal("80.00"),
                transaction_type="expense",
                category="A > B",
                is_reviewed=True,
            ),
        ]
        summary = calculate_report_summary(
            special_txs,
            "this-month",
            date(2026, 10, 1),
            date(2026, 10, 31),
        )

        pdf_bytes = generate_pdf_report(summary, "user<qa>&test@spendwise.ai")
        self.assertIsInstance(pdf_bytes, bytes)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))

        # Extract and decompress PDF stream contents to verify readable text
        idx = 0
        decoded_streams = []
        while True:
            start = pdf_bytes.find(b"stream", idx)
            if start == -1:
                break
            end = pdf_bytes.find(b"endstream", start)
            if end == -1:
                break
            content = pdf_bytes[start + 6:end].strip()
            try:
                decoded_streams.append(zlib.decompress(base64.a85decode(content, adobe=True)))
            except Exception:
                pass
            idx = end + 9

        all_stream_text = b"".join(decoded_streams)
        self.assertIn(b"Food & Dining", all_stream_text)
        self.assertIn(b"A < B", all_stream_text)
        self.assertIn(b"A > B", all_stream_text)
        self.assertIn(b"test@spendwise.ai", all_stream_text)

    # ---------------------------------------------------------
    # 6. Endpoint & User Data Isolation Tests
    # ---------------------------------------------------------
    def test_get_report_summary_user_isolation(self):
        # User 1 has 4 transactions (50000 income, 5500 expenses)
        res_u1 = get_report_summary(
            period="all",
            start_date=None,
            end_date=None,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(res_u1.transaction_count, 4)
        self.assertEqual(res_u1.total_income, Decimal("50000.00"))
        self.assertEqual(res_u1.total_expenses, Decimal("5500.00"))

        # User 2 has only their own transaction (99999 income, 0 expenses)
        res_u2 = get_report_summary(
            period="all",
            start_date=None,
            end_date=None,
            current_user=self.user2,
            db=self.db,
        )
        self.assertEqual(res_u2.transaction_count, 1)
        self.assertEqual(res_u2.total_income, Decimal("99999.00"))
        self.assertEqual(res_u2.total_expenses, Decimal("0.00"))

    def test_download_transactions_csv_endpoint(self):
        response = download_transactions_csv(
            period="all",
            start_date=None,
            end_date=None,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.media_type, "text/csv")
        self.assertIn("spendwise_transactions_all.csv", response.headers["Content-Disposition"])

        # Decode CSV and check rows belong exclusively to user 1
        reader = list(csv.reader(io.StringIO(response.body.decode("utf-8-sig"))))
        self.assertEqual(len(reader), 5)  # 1 header + 4 data rows
        # User 2's secret income should NOT appear anywhere
        for row in reader:
            self.assertNotIn("User2 Secret Income", row)

    def test_download_summary_pdf_endpoint(self):
        response = download_summary_pdf(
            period="this-month",
            start_date=None,
            end_date=None,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.media_type, "application/pdf")
        self.assertIn("spendwise_summary_this-month.pdf", response.headers["Content-Disposition"])
        self.assertTrue(response.body.startswith(b"%PDF"))

    def test_calendar_date_boundary_filtering(self):
        # Range: 2026-10-05 to 2026-10-15 (inclusive)
        # Should include Groceries (10-05) and Bills (10-15)
        # Should exclude Salary (10-01) and Injection (10-20)
        res = get_report_summary(
            period=None,
            start_date=date(2026, 10, 5),
            end_date=date(2026, 10, 15),
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(res.transaction_count, 2)
        self.assertEqual(res.total_income, Decimal("0.00"))
        self.assertEqual(res.total_expenses, Decimal("5000.00"))


if __name__ == "__main__":
    unittest.main()

