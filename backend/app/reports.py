import csv
from datetime import date, datetime, timezone
from decimal import Decimal
import io
from typing import Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth_dependencies import get_current_user
from app.dependencies import get_db
from app.models import Transaction, User
from app.timezone import get_current_ist_date, get_current_ist_datetime
from app.schemas import ReportCategorySpending, ReportSummaryResponse

router = APIRouter(prefix="/reports", tags=["Reports"])

# Characters that trigger spreadsheet formula execution in Excel/Calc/Sheets
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize_csv_cell(value: Optional[str]) -> str:
    """Neutralize spreadsheet formula injection by prepending a single quote if string

    starts with formula triggers (=, +, -, @, tab, cr). Preserves raw data in DB.
    """
    if not value:
        return ""
    val_str = str(value)
    if val_str.startswith(_FORMULA_PREFIXES):
        return "'" + val_str
    return val_str


def resolve_period_date_range(
    period: Optional[str],
    start_date: Optional[date],
    end_date: Optional[date],
    ref_date: Optional[date] = None,
) -> tuple[Optional[date], Optional[date], str]:
    """Resolve and validate period date range.

    Returns (resolved_start_date, resolved_end_date, period_label).
    """
    ref = ref_date or get_current_ist_date()

    # 1. Custom range validation
    if start_date is not None or end_date is not None:
        if start_date is None or end_date is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Both start_date and end_date must be provided for custom date ranges.",
            )
        if start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_date cannot be after end_date.",
            )
        return start_date, end_date, "custom"

    # 2. Named period resolution
    period_key = (period or "this-month").lower().strip()

    if period_key == "this-month":
        start = date(ref.year, ref.month, 1)
        return start, ref, "this-month"

    if period_key == "last-month":
        # 1st of previous month
        if ref.month == 1:
            prev_year = ref.year - 1
            prev_month = 12
        else:
            prev_year = ref.year
            prev_month = ref.month - 1
        start = date(prev_year, prev_month, 1)

        # Last day of previous month
        # First day of current month minus 1 day
        first_of_curr = date(ref.year, ref.month, 1)
        from datetime import timedelta

        end = first_of_curr - timedelta(days=1)
        return start, end, "last-month"

    if period_key == "last-3-months":
        # Month 2 months prior, 1st day
        # e.g., if ref is Oct (10), 2 months prior is Aug (8)
        month_offset = ref.month - 2
        year_offset = ref.year
        while month_offset <= 0:
            month_offset += 12
            year_offset -= 1
        start = date(year_offset, month_offset, 1)
        return start, ref, "last-3-months"

    if period_key == "year-to-date":
        start = date(ref.year, 1, 1)
        return start, ref, "year-to-date"

    if period_key == "all":
        return None, None, "all"

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            f"Invalid period '{period}'. Valid options are: this-month, "
            "last-month, last-3-months, year-to-date, all, custom."
        ),
    )


def fetch_user_report_transactions(
    user_id: int,
    db: Session,
    start_date: Optional[date],
    end_date: Optional[date],
) -> list[Transaction]:
    """Fetch transactions belonging exclusively to the authenticated user within the inclusive calendar date range."""
    query = select(Transaction).where(Transaction.user_id == user_id)

    if start_date is not None:
        query = query.where(func.date(Transaction.transaction_date) >= start_date)
    if end_date is not None:
        query = query.where(func.date(Transaction.transaction_date) <= end_date)

    query = query.order_by(
        Transaction.transaction_date.desc(),
        Transaction.id.desc(),
    )
    return list(db.scalars(query).all())


def calculate_report_summary(
    transactions: list[Transaction],
    period_label: str,
    start_date: Optional[date],
    end_date: Optional[date],
) -> ReportSummaryResponse:
    """Calculate deterministic financial totals, savings rate, and category breakdowns."""
    income_txs = [t for t in transactions if t.transaction_type == "income"]
    expense_txs = [t for t in transactions if t.transaction_type == "expense"]

    total_income = sum((t.amount for t in income_txs), Decimal("0.00"))
    total_expenses = sum((t.amount for t in expense_txs), Decimal("0.00"))
    net_savings = total_income - total_expenses

    if total_income > Decimal("0.00"):
        savings_rate_pct: Optional[float] = round(float(net_savings / total_income) * 100, 2)
    else:
        savings_rate_pct = None

    # Group expenses by category
    cat_totals: dict[str, Decimal] = {}
    cat_counts: dict[str, int] = {}
    for t in expense_txs:
        cat = t.category or "Other"
        cat_totals[cat] = cat_totals.get(cat, Decimal("0.00")) + t.amount
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    categories: list[ReportCategorySpending] = []
    for cat, amt in cat_totals.items():
        if total_expenses > Decimal("0.00"):
            pct = round(float(amt / total_expenses) * 100, 1)
        else:
            pct = 0.0
        categories.append(
            ReportCategorySpending(
                category=cat,
                amount=amt,
                transaction_count=cat_counts[cat],
                percentage=pct,
            )
        )

    # Sort descending by amount, then alphabetically by category
    categories.sort(key=lambda c: (-c.amount, c.category.lower()))

    return ReportSummaryResponse(
        period=period_label,
        start_date=start_date,
        end_date=end_date,
        total_income=total_income,
        total_expenses=total_expenses,
        net_savings=net_savings,
        savings_rate_pct=savings_rate_pct,
        transaction_count=len(transactions),
        income_transaction_count=len(income_txs),
        expense_transaction_count=len(expense_txs),
        categories=categories,
        has_transactions=len(transactions) > 0,
    )


def generate_csv_report(transactions: list[Transaction]) -> bytes:
    """Generate RFC 4180 compliant CSV stream with formula injection sanitization."""
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")

    # Header
    writer.writerow([
        "Date",
        "Description",
        "Category",
        "Type",
        "Amount (INR)",
        "Status",
        "Suggested Category",
    ])

    for t in transactions:
        tx_date_str = (
            t.transaction_date.strftime("%Y-%m-%d")
            if isinstance(t.transaction_date, (datetime, date))
            else str(t.transaction_date)
        )
        writer.writerow([
            tx_date_str,
            sanitize_csv_cell(t.description),
            sanitize_csv_cell(t.category),
            t.transaction_type,
            f"{t.amount:.2f}",
            "Reviewed" if t.is_reviewed else "To Review",
            sanitize_csv_cell(t.predicted_category or ""),
        ])

    return output.getvalue().encode("utf-8-sig")


def generate_pdf_report(
    summary: ReportSummaryResponse,
    user_email: str,
) -> bytes:
    """Generate a clean executive financial summary PDF with ReportLab."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Brand colors
    forest = colors.HexColor("#1E3A2F")
    forest_soft = colors.HexColor("#2D5A46")
    neutral_ink = colors.HexColor("#1A201C")
    muted_text = colors.HexColor("#5A6B60")
    card_bg = colors.HexColor("#FAF8F5")
    card_border = colors.HexColor("#E5E0D8")
    destructive = colors.HexColor("#B91C1C")

    # Custom styles
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=forest,
    )
    eyebrow_style = ParagraphStyle(
        "ReportEyebrow",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=forest_soft,
        textTransform="uppercase",
    )
    meta_style = ParagraphStyle(
        "ReportMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=muted_text,
    )
    h2_style = ParagraphStyle(
        "ReportH2",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=neutral_ink,
    )
    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=neutral_ink,
    )
    body_bold = ParagraphStyle(
        "ReportBodyBold",
        parent=body_style,
        fontName="Helvetica-Bold",
    )
    num_style = ParagraphStyle(
        "ReportNum",
        parent=body_style,
        alignment=2,  # Right aligned
    )
    num_bold = ParagraphStyle(
        "ReportNumBold",
        parent=body_bold,
        alignment=2,  # Right aligned
    )

    story = []

    # 1. Header & Branding
    story.append(Paragraph("SPENDWISE AI", eyebrow_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Financial Summary Report", title_style))
    story.append(Spacer(1, 6))

    # Period display string
    if summary.start_date and summary.end_date:
        period_str = f"{summary.period.capitalize()} ({summary.start_date.strftime('%d %b %Y')} to {summary.end_date.strftime('%d %b %Y')})"
    else:
        period_str = "All Time"

    gen_time_str = get_current_ist_datetime().strftime("%d %b %Y, %H:%M IST")
    safe_email = escape(str(user_email))
    safe_period = escape(str(period_str))
    meta_text = f"<b>Account:</b> {safe_email} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Reporting Period:</b> {safe_period} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Generated:</b> {gen_time_str}"
    story.append(Paragraph(meta_text, meta_style))
    story.append(Spacer(1, 16))

    # 2. Executive Financial Summary Cards
    net_val_color = forest if summary.net_savings >= Decimal("0.00") else destructive
    net_sign = "+" if summary.net_savings > Decimal("0.00") else ""
    savings_rate_display = (
        f"{summary.savings_rate_pct:.1f}%"
        if summary.savings_rate_pct is not None
        else "N/A"
    )

    kpi_data = [
        [
            Paragraph("TOTAL INCOME", eyebrow_style),
            Paragraph("TOTAL EXPENSES", eyebrow_style),
            Paragraph("NET CASH FLOW", eyebrow_style),
            Paragraph("SAVINGS RATE", eyebrow_style),
        ],
        [
            Paragraph(f"INR {summary.total_income:,.2f}", title_style),
            Paragraph(f"INR {summary.total_expenses:,.2f}", title_style),
            Paragraph(
                f"{net_sign}INR {summary.net_savings:,.2f}",
                ParagraphStyle("NetFlowNum", parent=title_style, textColor=net_val_color),
            ),
            Paragraph(savings_rate_display, title_style),
        ],
        [
            Paragraph(f"{summary.income_transaction_count} income txs", meta_style),
            Paragraph(f"{summary.expense_transaction_count} expense txs", meta_style),
            Paragraph(
                "Positive savings" if summary.net_savings >= Decimal("0.00") else "Deficit",
                meta_style,
            ),
            Paragraph(
                "Of total income" if summary.total_income > Decimal("0.00") else "Zero income",
                meta_style,
            ),
        ],
    ]

    kpi_table = Table(kpi_data, colWidths=[130, 130, 130, 130])
    kpi_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), card_bg),
            ("BOX", (0, 0), (-1, -1), 1, card_border),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, card_border),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ])
    )
    story.append(kpi_table)
    story.append(Spacer(1, 20))

    # 3. Category Spending Breakdown
    story.append(Paragraph("Category Spending Breakdown", h2_style))
    story.append(Spacer(1, 8))

    if summary.categories:
        cat_table_data = [
            [
                Paragraph("Category", eyebrow_style),
                Paragraph("Transactions", eyebrow_style),
                Paragraph("Amount (INR)", ParagraphStyle("EyebrowR", parent=eyebrow_style, alignment=2)),
                Paragraph("% of Expenses", ParagraphStyle("EyebrowR", parent=eyebrow_style, alignment=2)),
            ]
        ]

        for idx, cat in enumerate(summary.categories):
            row_bg = colors.white if idx % 2 == 0 else card_bg
            cat_table_data.append([
                Paragraph(escape(str(cat.category)), body_bold),
                Paragraph(str(cat.transaction_count), body_style),
                Paragraph(f"INR {cat.amount:,.2f}", num_bold),
                Paragraph(f"{cat.percentage:.1f}%", num_style),
            ])

        # Total footer row
        cat_table_data.append([
            Paragraph("Total Category Spending", body_bold),
            Paragraph(str(summary.expense_transaction_count), body_bold),
            Paragraph(f"INR {summary.total_expenses:,.2f}", num_bold),
            Paragraph("100.0%", num_bold),
        ])

        cat_table = Table(cat_table_data, colWidths=[200, 100, 120, 100])
        cat_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), card_bg),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, 0), 1, forest),
                ("LINEBELOW", (0, -1), (-1, -1), 1, forest),
                ("LINEABOVE", (0, -1), (-1, -1), 0.5, forest_soft),
                ("GRID", (0, 0), (-1, -1), 0.25, card_border),
            ])
        )
        story.append(cat_table)
    else:
        # Empty Category Table state
        empty_text = "No expense transactions recorded for the selected period."
        story.append(
            Table(
                [[Paragraph(empty_text, meta_style)]],
                colWidths=[520],
                style=TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), card_bg),
                    ("BOX", (0, 0), (-1, -1), 1, card_border),
                    ("PADDING", (0, 0), (-1, -1), 16),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ]),
            )
        )

    story.append(Spacer(1, 24))

    # 4. Footer Note
    footer_text = "Generated securely by SpendWise AI • Confidential Personal Financial Document"
    story.append(Paragraph(footer_text, ParagraphStyle("Footer", parent=meta_style, alignment=1)))

    doc.build(story)
    return buffer.getvalue()


@router.get("/summary", response_model=ReportSummaryResponse)
def get_report_summary(
    period: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportSummaryResponse:
    """Retrieve financial summary metrics and category breakdowns for a period."""
    resolved_start, resolved_end, period_label = resolve_period_date_range(
        period=period,
        start_date=start_date,
        end_date=end_date,
    )
    transactions = fetch_user_report_transactions(
        user_id=current_user.id,
        db=db,
        start_date=resolved_start,
        end_date=resolved_end,
    )
    return calculate_report_summary(
        transactions=transactions,
        period_label=period_label,
        start_date=resolved_start,
        end_date=resolved_end,
    )


@router.get("/transactions/csv")
def download_transactions_csv(
    period: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Export transactions as an RFC 4180 CSV file with formula-injection protection."""
    resolved_start, resolved_end, period_label = resolve_period_date_range(
        period=period,
        start_date=start_date,
        end_date=end_date,
    )
    transactions = fetch_user_report_transactions(
        user_id=current_user.id,
        db=db,
        start_date=resolved_start,
        end_date=resolved_end,
    )
    csv_bytes = generate_csv_report(transactions)

    filename = f"spendwise_transactions_{period_label}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    )


@router.get("/summary/pdf")
def download_summary_pdf(
    period: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Generate and download a clean executive financial summary PDF with ReportLab."""
    resolved_start, resolved_end, period_label = resolve_period_date_range(
        period=period,
        start_date=start_date,
        end_date=end_date,
    )
    transactions = fetch_user_report_transactions(
        user_id=current_user.id,
        db=db,
        start_date=resolved_start,
        end_date=resolved_end,
    )
    summary = calculate_report_summary(
        transactions=transactions,
        period_label=period_label,
        start_date=resolved_start,
        end_date=resolved_end,
    )
    pdf_bytes = generate_pdf_report(summary=summary, user_email=current_user.email)

    filename = f"spendwise_summary_{period_label}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    )

