from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth_dependencies import get_current_user
from app.dependencies import get_db
from app.models import Budget, RecurringPayment, Transaction, User
from app.recurring_payments import calculate_monthly_equivalent
from app.schemas import (
    FinancialInsightsResponse,
    InsightItem,
    InsightsSummary,
)

# Financial Insights router
router = APIRouter(prefix="/insights", tags=["Financial Insights"])

MIN_ANOMALY_BASELINE_COUNT = 3


def detect_unusual_expenses(
    candidate_txs: list[Transaction],
    history_txs: list[Transaction],
    selected_month: str,
) -> list[InsightItem]:
    """Detect potentially unusual expense transactions in candidate_txs using
    category-specific historical spending from history_txs.

    Statistical criteria:
    - Minimum baseline count: 3 transactions in the same category (excluding the evaluated tx).
    - If history is insufficient (< 3), no alert is generated.
    - If variance > 0: z-score >= 2.5, amount >= mean * 1.5, and (amount - mean) >= 10.00.
    - If variance == 0: amount >= mean * 1.5 and (amount - mean) >= 10.00.
    - Excludes candidate transaction from its own baseline.
    - Limitations: Identifies statistical deviations from personal category habits;
      this does not imply fraud, accounting error, or confirmed duplicate billing.
    """
    anomaly_insights: list[InsightItem] = []

    # Group history by category (expenses only)
    history_by_cat: dict[str, list[Transaction]] = {}
    for t in history_txs:
        if t.transaction_type == "expense":
            cat = (t.category or "").strip() or "Other"
            history_by_cat.setdefault(cat, []).append(t)

    for tx in candidate_txs:
        if tx.transaction_type != "expense":
            continue

        cat = (tx.category or "").strip() or "Other"
        # Exclude candidate transaction from its own baseline
        cat_history = [
            t for t in history_by_cat.get(cat, [])
            if (t.id != tx.id if (t.id is not None and tx.id is not None) else t is not tx)
        ]

        if len(cat_history) < MIN_ANOMALY_BASELINE_COUNT:
            # Insufficient historical observations to establish a statistical baseline
            continue

        amounts = [float(t.amount) for t in cat_history]
        n = len(amounts)
        mean_val = sum(amounts) / n

        # Calculate sample standard deviation
        if n > 1:
            variance = sum((x - mean_val) ** 2 for x in amounts) / (n - 1)
            std_dev = variance ** 0.5
        else:
            std_dev = 0.0

        tx_amt = float(tx.amount)
        diff_from_mean = tx_amt - mean_val

        # Check outlier criteria
        is_outlier = False
        z_score = 0.0

        if diff_from_mean >= 10.0 and tx_amt >= mean_val * 1.5:
            if std_dev > 0.0:
                z_score = diff_from_mean / std_dev
                if z_score >= 2.5:
                    is_outlier = True
            else:
                # Zero variance: historical spending was identical
                is_outlier = True

        if is_outlier:
            tx_date = tx.transaction_date.date() if isinstance(tx.transaction_date, datetime) else tx.transaction_date
            date_str = tx_date.strftime("%Y-%m-%d")
            pct_above_mean = (diff_from_mean / mean_val) * 100 if mean_val > 0 else 0.0
            mean_dec = Decimal(str(round(mean_val, 2)))

            if std_dev > 0.0:
                metric_label = f"+{pct_above_mean:.0f}% vs avg"
                desc = (
                    f"Transaction of ₹{tx.amount:,.2f} on {date_str} in {cat} "
                    f"is significantly higher than your typical average of ₹{mean_dec:,.2f} "
                    f"({z_score:.1f} standard deviations above baseline)."
                )
            else:
                metric_label = f"+{pct_above_mean:.0f}% vs avg"
                desc = (
                    f"Transaction of ₹{tx.amount:,.2f} on {date_str} in {cat} "
                    f"is higher than your fixed baseline of ₹{mean_dec:,.2f}."
                )

            tx_ident = tx.id if tx.id is not None else f"{cat}-{int(tx_amt)}"
            anomaly_insights.append(
                InsightItem(
                    id=f"anomaly-tx-{tx_ident}-{selected_month}",
                    type="anomaly",
                    severity="warning",
                    title=f"Unusual expense in {cat}",
                    description=desc,
                    category=cat,
                    amount=tx.amount,
                    metric_label=metric_label,
                    date=tx_date,
                )
            )

    # Sort anomalies by amount descending
    anomaly_insights.sort(key=lambda item: item.amount or Decimal("0.00"), reverse=True)
    return anomaly_insights


def slugify_category(name: str | None) -> str:
    """Convert category name to a lowercase hyphenated slug for deterministic insight IDs."""
    if not name or not name.strip():
        return "other"
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "other"


def generate_budget_insights(
    budgets: list[Budget],
    curr_txs: list[Transaction],
    selected_month: str,
) -> list[InsightItem]:
    """Generate alerts for categories reaching at least 80% of their monthly budget,
    distinguishing approaching-limit categories from over-budget categories.
    Excludes income and ignores categories without an established budget.
    """
    budget_insights: list[InsightItem] = []

    # Map current expense spend by normalized category (expenses only)
    cat_expenses: dict[str, Decimal] = {}
    for t in curr_txs:
        if t.transaction_type == "expense":
            norm_cat = (t.category or "").strip().casefold()
            cat_expenses[norm_cat] = cat_expenses.get(norm_cat, Decimal("0.00")) + t.amount

    for b in budgets:
        norm_b_cat = b.category.strip().casefold()
        spent = cat_expenses.get(norm_b_cat, Decimal("0.00"))

        if b.limit_amount <= Decimal("0.00"):
            continue

        pct_used = round(float(spent / b.limit_amount) * 100, 2)
        slug = slugify_category(b.category)

        if pct_used >= 100.0:
            budget_insights.append(
                InsightItem(
                    id=f"budget-exceeded-{slug}-{selected_month}",
                    type="recommendation",
                    severity="critical",
                    title=f"Budget exceeded: {b.category}",
                    description=(
                        f"You have spent ₹{spent:,.2f} of your ₹{b.limit_amount:,.2f} "
                        f"budget for {b.category} ({pct_used:.1f}% used)."
                    ),
                    category=b.category,
                    amount=spent,
                    metric_label=f"{pct_used:.1f}%",
                )
            )
        elif pct_used >= 80.0:
            budget_insights.append(
                InsightItem(
                    id=f"budget-warning-{slug}-{selected_month}",
                    type="recommendation",
                    severity="warning",
                    title=f"Approaching budget limit: {b.category}",
                    description=(
                        f"You have spent ₹{spent:,.2f} of your ₹{b.limit_amount:,.2f} "
                        f"budget for {b.category} ({pct_used:.1f}% used)."
                    ),
                    category=b.category,
                    amount=spent,
                    metric_label=f"{pct_used:.1f}%",
                )
            )

    # Sort budget insights: highest percentage used first
    budget_insights.sort(
        key=lambda item: float((item.metric_label or "0%").rstrip("%")),
        reverse=True,
    )
    return budget_insights


def generate_recurring_insights(
    recurring_payments: list[RecurringPayment],
    ref_date: date,
    selected_month: str,
) -> list[InsightItem]:
    """Generate upcoming or overdue recurring commitment insights using active schedules.
    Scheduled reminders do not confirm that actual payment or bank settlement occurred.
    """
    recurring_insights: list[InsightItem] = []

    for r in recurring_payments:
        # Strictly ignore non-active schedules
        if r.status != "active" or not r.is_active:
            continue

        due_date = r.next_due_date
        if isinstance(due_date, datetime):
            due_date = due_date.date()

        if due_date < ref_date:
            days_overdue = (ref_date - due_date).days
            day_str = f"{days_overdue} day{'s' if days_overdue != 1 else ''} overdue"
            recurring_insights.append(
                InsightItem(
                    id=f"recurring-overdue-{r.id}-{selected_month}",
                    type="recommendation",
                    severity="warning",
                    title=f"Overdue recurring payment: {r.description}",
                    description=(
                        f"Scheduled {r.frequency} payment of ₹{r.amount:,.2f} for {r.description} "
                        f"was due on {due_date.strftime('%Y-%m-%d')} ({day_str}). "
                        "Note: scheduled reminder does not confirm actual debit."
                    ),
                    category=r.category,
                    amount=r.amount,
                    metric_label=f"{days_overdue}d overdue",
                    date=due_date,
                )
            )
        elif ref_date <= due_date <= ref_date + timedelta(days=14):
            days_until = (due_date - ref_date).days
            if days_until == 0:
                day_str = "due today"
                label = "due today"
            else:
                day_str = f"due in {days_until} day{'s' if days_until != 1 else ''}"
                label = f"in {days_until}d"

            recurring_insights.append(
                InsightItem(
                    id=f"recurring-upcoming-{r.id}-{selected_month}",
                    type="forecast",
                    severity="info",
                    title=f"Upcoming payment: {r.description}",
                    description=(
                        f"Scheduled {r.frequency} payment of ₹{r.amount:,.2f} for {r.description} "
                        f"is {day_str} on {due_date.strftime('%Y-%m-%d')}. "
                        "Note: scheduled reminder does not confirm payment execution."
                    ),
                    category=r.category,
                    amount=r.amount,
                    metric_label=label,
                    date=due_date,
                )
            )

    # Sort recurring insights: overdue first, then soonest upcoming
    return recurring_insights


def get_month_datetime_range(month_str: str) -> tuple[datetime, datetime]:
    """Return timezone-aware (start_dt, end_dt) in UTC covering the given YYYY-MM month."""
    parts = month_str.split("-")
    year = int(parts[0])
    month = int(parts[1])
    start_dt = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    if month == 12:
        end_dt = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        end_dt = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    return start_dt, end_dt


def get_previous_month(month_str: str) -> str:
    """Return the YYYY-MM string for the calendar month immediately preceding month_str."""
    parts = month_str.split("-")
    year = int(parts[0])
    month = int(parts[1])
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


@router.get(
    "/",
    response_model=FinancialInsightsResponse,
)
def get_financial_insights(
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    ref_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FinancialInsightsResponse:
    """Calculate financial insights, month-over-month changes, and baselines for the authenticated user."""
    # Resolve target month safely
    if isinstance(month, str) and month.strip():
        selected_month = month.strip()
    elif ref_date is not None:
        selected_month = ref_date.strftime("%Y-%m")
    else:
        selected_month = datetime.now(timezone.utc).strftime("%Y-%m")

    prev_month = get_previous_month(selected_month)
    curr_start_dt, curr_end_dt = get_month_datetime_range(selected_month)
    prev_start_dt, prev_end_dt = get_month_datetime_range(prev_month)

    # 1. Current month transactions for authenticated user
    curr_txs = list(
        db.scalars(
            select(Transaction).where(
                Transaction.user_id == current_user.id,
                Transaction.transaction_date >= curr_start_dt,
                Transaction.transaction_date < curr_end_dt,
            )
        ).all()
    )

    total_curr_spent = sum(
        (t.amount for t in curr_txs if t.transaction_type == "expense"),
        Decimal("0.00"),
    )
    total_curr_income = sum(
        (t.amount for t in curr_txs if t.transaction_type == "income"),
        Decimal("0.00"),
    )

    # 2. Previous month transactions for authenticated user
    prev_txs = list(
        db.scalars(
            select(Transaction).where(
                Transaction.user_id == current_user.id,
                Transaction.transaction_date >= prev_start_dt,
                Transaction.transaction_date < prev_end_dt,
            )
        ).all()
    )

    if not prev_txs:
        # User has no transaction history for the previous month
        total_prev_spent: Decimal | None = None
        mom_change_pct: float | None = None
    else:
        total_prev_spent = sum(
            (t.amount for t in prev_txs if t.transaction_type == "expense"),
            Decimal("0.00"),
        )
        if total_prev_spent > 0:
            diff = total_curr_spent - total_prev_spent
            mom_change_pct = round(float(diff / total_prev_spent) * 100, 2)
        elif total_curr_spent == 0:
            mom_change_pct = 0.0
        else:
            mom_change_pct = None

    # 3. Savings rate percentage
    if total_curr_income > 0:
        net_savings = total_curr_income - total_curr_spent
        savings_rate_pct: float | None = round(float(net_savings / total_curr_income) * 100, 2)
    else:
        savings_rate_pct = None

    # 4. Fixed commitment ratio from active recurring payments
    active_recurring = list(
        db.scalars(
            select(RecurringPayment).where(
                RecurringPayment.user_id == current_user.id,
                RecurringPayment.status == "active",
            )
        ).all()
    )
    total_monthly_recurring = sum(
        (calculate_monthly_equivalent(r.amount, r.frequency) for r in active_recurring),
        Decimal("0.00"),
    )

    if total_curr_income > 0:
        fixed_commitment_ratio: float | None = round(
            float(total_monthly_recurring / total_curr_income) * 100, 2
        )
    else:
        fixed_commitment_ratio = None

    # 5. Projected month-end expense
    total_days_in_month = (curr_end_dt.date() - curr_start_dt.date()).days
    effective_ref_date = ref_date or datetime.now(timezone.utc).date()

    if effective_ref_date < curr_start_dt.date():
        day_of_month = 1
    elif effective_ref_date >= curr_end_dt.date():
        day_of_month = total_days_in_month
    else:
        day_of_month = effective_ref_date.day

    if day_of_month >= total_days_in_month:
        projected_month_end = total_curr_spent
    elif day_of_month > 0:
        projected_month_end = round(
            (total_curr_spent / Decimal(day_of_month)) * Decimal(total_days_in_month),
            2,
        )
    else:
        projected_month_end = total_curr_spent

    # 6. Overall insight cards
    insights: list[InsightItem] = []

    if mom_change_pct is not None:
        if mom_change_pct > 0:
            mom_severity = "warning"
            mom_direction = f"{mom_change_pct:.1f}% higher"
            mom_metric_label = f"+{mom_change_pct:.1f}%"
            mom_desc = f"Outflows are {mom_direction} compared to {prev_month}."
        elif mom_change_pct < 0:
            mom_severity = "positive"
            mom_direction = f"{abs(mom_change_pct):.1f}% lower"
            mom_metric_label = f"{mom_change_pct:.1f}%"
            mom_desc = f"Outflows are {mom_direction} compared to {prev_month}."
        else:
            mom_severity = "info"
            mom_metric_label = "0.0%"
            mom_desc = f"Outflows are unchanged compared to {prev_month}."

        mom_diff = abs(total_curr_spent - (total_prev_spent or Decimal("0.00")))
        insights.append(
            InsightItem(
                id=f"mom-spending-{selected_month}",
                type="pattern",
                severity=mom_severity,
                title="Month-over-month spending",
                description=mom_desc,
                amount=mom_diff,
                metric_label=mom_metric_label,
            )
        )

    if savings_rate_pct is not None:
        severity = "positive" if savings_rate_pct >= 20 else ("info" if savings_rate_pct >= 0 else "warning")
        insights.append(
            InsightItem(
                id=f"savings-rate-{selected_month}",
                type="forecast",
                severity=severity,
                title="Monthly savings rate",
                description=(
                    f"Retained {savings_rate_pct:.1f}% of income as surplus this month."
                    if savings_rate_pct >= 0
                    else f"Expenses exceeded income by {abs(savings_rate_pct):.1f}%."
                ),
                metric_label=f"{savings_rate_pct:.1f}%",
            )
        )

    # 7. Category-level spending pattern insights (expenses only)
    if total_prev_spent is not None:
        curr_cat_expenses: dict[str, Decimal] = {}
        for t in curr_txs:
            if t.transaction_type == "expense":
                cat_name = (t.category or "").strip() or "Other"
                curr_cat_expenses[cat_name] = curr_cat_expenses.get(cat_name, Decimal("0.00")) + t.amount

        prev_cat_expenses: dict[str, Decimal] = {}
        for t in prev_txs:
            if t.transaction_type == "expense":
                cat_name = (t.category or "").strip() or "Other"
                prev_cat_expenses[cat_name] = prev_cat_expenses.get(cat_name, Decimal("0.00")) + t.amount

        all_categories = sorted(set(curr_cat_expenses.keys()) | set(prev_cat_expenses.keys()))
        category_insights: list[InsightItem] = []

        for cat in all_categories:
            c_amt = curr_cat_expenses.get(cat, Decimal("0.00"))
            p_amt = prev_cat_expenses.get(cat, Decimal("0.00"))
            slug = slugify_category(cat)

            if p_amt > 0 and c_amt > 0:
                diff = c_amt - p_amt
                if diff > 0:
                    pct = round(float(diff / p_amt) * 100, 2)
                    category_insights.append(
                        InsightItem(
                            id=f"cat-increase-{slug}-{selected_month}",
                            type="pattern",
                            severity="warning",
                            title=f"Spending increase in {cat}",
                            description=(
                                f"Spending in {cat} increased by ₹{diff:,.2f} "
                                f"(+{pct:.1f}%) compared to {prev_month}."
                            ),
                            category=cat,
                            amount=diff,
                            metric_label=f"+{pct:.1f}%",
                        )
                    )
                elif diff < 0:
                    abs_diff = abs(diff)
                    pct = round(float(diff / p_amt) * 100, 2)
                    category_insights.append(
                        InsightItem(
                            id=f"cat-decrease-{slug}-{selected_month}",
                            type="pattern",
                            severity="positive",
                            title=f"Spending decrease in {cat}",
                            description=(
                                f"Spending in {cat} decreased by ₹{abs_diff:,.2f} "
                                f"({pct:.1f}%) compared to {prev_month}."
                            ),
                            category=cat,
                            amount=abs_diff,
                            metric_label=f"{pct:.1f}%",
                        )
                    )
                # diff == 0: unchanged category, deliberately omit to avoid duplicating totals
            elif p_amt == 0 and c_amt > 0:
                # Category appeared this month with zero previous-month baseline
                category_insights.append(
                    InsightItem(
                        id=f"cat-new-{slug}-{selected_month}",
                        type="pattern",
                        severity="info",
                        title=f"New spending in {cat}",
                        description=(
                            f"New expense category this month: ₹{c_amt:,.2f} "
                            f"spent on {cat} with no spending recorded in {prev_month}."
                        ),
                        category=cat,
                        amount=c_amt,
                        metric_label=None,
                    )
                )
            elif p_amt > 0 and c_amt == 0:
                # Category had spending in previous month but dropped to zero
                category_insights.append(
                    InsightItem(
                        id=f"cat-decrease-{slug}-{selected_month}",
                        type="pattern",
                        severity="positive",
                        title=f"No spending in {cat}",
                        description=(
                            f"No spending in {cat} this month, saving "
                            f"₹{p_amt:,.2f} compared to {prev_month}."
                        ),
                        category=cat,
                        amount=p_amt,
                        metric_label="-100.0%",
                    )
                )

        # Sort category insights by impact (largest absolute difference first, then category name)
        category_insights.sort(
            key=lambda item: (item.amount or Decimal("0.00"), item.category or ""),
            reverse=True,
        )
        insights.extend(category_insights)

    # 8. Unusual transaction detection (Stage 3A: Statistical Anomaly Detection)
    # Query authenticated user's expense history up to the end of the selected month
    all_user_exp_history = list(
        db.scalars(
            select(Transaction).where(
                Transaction.user_id == current_user.id,
                Transaction.transaction_type == "expense",
                Transaction.transaction_date < curr_end_dt,
            )
        ).all()
    )
    anomaly_insights = detect_unusual_expenses(
        candidate_txs=curr_txs,
        history_txs=all_user_exp_history,
        selected_month=selected_month,
    )
    insights.extend(anomaly_insights)

    # 9. Budget alerts (Stage 3B: Categories reaching >= 80% of monthly budget)
    user_budgets = list(
        db.scalars(
            select(Budget).where(
                Budget.user_id == current_user.id,
                Budget.month == selected_month,
            )
        ).all()
    )
    budget_insights = generate_budget_insights(
        budgets=user_budgets,
        curr_txs=curr_txs,
        selected_month=selected_month,
    )
    insights.extend(budget_insights)

    # 10. Recurring commitment insights (Stage 3B: Active schedules upcoming or overdue)
    recurring_insights = generate_recurring_insights(
        recurring_payments=active_recurring,
        ref_date=effective_ref_date,
        selected_month=selected_month,
    )
    insights.extend(recurring_insights)

    summary = InsightsSummary(
        current_month=selected_month,
        total_spent_current_month=total_curr_spent,
        total_spent_previous_month=total_prev_spent,
        projected_month_end_expense=projected_month_end,
        savings_rate_percentage=savings_rate_pct,
        fixed_commitment_ratio=fixed_commitment_ratio,
        month_over_month_change_pct=mom_change_pct,
    )

    return FinancialInsightsResponse(summary=summary, insights=insights)


