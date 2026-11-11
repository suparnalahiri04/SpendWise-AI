from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.budgets import classify_budget_status, get_month_datetime_range
from app.insights import (
    detect_unusual_expenses,
    generate_budget_insights,
    generate_recurring_insights,
    get_month_date_range,
    get_previous_month,
)
from app.llm_adapter import get_llm_adapter
from app.models import Budget, RecurringPayment, Transaction, User
from app.recurring_payments import calculate_monthly_equivalent
from app.timezone import get_current_ist_datetime
from app.schemas import (
    AssistantContextResponse,
    AssistantFactItem,
    AssistantQueryResponse,
    BudgetUtilizationFact,
    CategorySpendingFact,
    FinancialContextSummary,
    RecurringPaymentFact,
    StarterPromptItem,
    StarterPromptsResponse,
)


def calculate_user_financial_facts(
    user: User,
    db: Session,
    month: str | None = None,
    ref_date: date | None = None,
) -> AssistantContextResponse:
    """Calculate deterministic financial facts, estimates, and recommendations exclusively

    for the authenticated user. Never mixes data across users or invents transactions.
    """
    now_ist = get_current_ist_datetime()
    now_utc = datetime.now(timezone.utc)
    selected_month = month.strip() if isinstance(month, str) and month.strip() else now_ist.strftime("%Y-%m")
    effective_ref_date = ref_date or now_ist.date()

    curr_start_date, curr_end_date = get_month_date_range(selected_month)
    prev_month = get_previous_month(selected_month)
    prev_start_date, prev_end_date = get_month_date_range(prev_month)
    curr_start_dt, curr_end_dt = get_month_datetime_range(selected_month)

    data_limitations: list[str] = []

    # 1. Fetch current month transactions belonging exclusively to the user
    curr_txs = list(
        db.scalars(
            select(Transaction)
            .where(
                Transaction.user_id == user.id,
                func.date(Transaction.transaction_date) >= curr_start_date,
                func.date(Transaction.transaction_date) <= curr_end_date,
            )
            .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        ).all()
    )

    income_txs = [t for t in curr_txs if t.transaction_type == "income"]
    expense_txs = [t for t in curr_txs if t.transaction_type == "expense"]

    total_income = sum((t.amount for t in income_txs), Decimal("0.00"))
    total_expenses = sum((t.amount for t in expense_txs), Decimal("0.00"))
    net_savings = total_income - total_expenses
    has_transactions = len(curr_txs) > 0

    if not has_transactions:
        data_limitations.append(f"No transactions recorded for {selected_month}.")

    # Savings rate percentage
    if total_income > 0:
        savings_rate_pct: float | None = round(float(net_savings / total_income) * 100, 2)
    else:
        savings_rate_pct = None
        if has_transactions:
            data_limitations.append("No income recorded for this month; savings rate is unavailable.")

    # 2. Category spending breakdowns
    cat_spent: dict[str, Decimal] = {}
    cat_counts: dict[str, int] = {}
    for t in expense_txs:
        cat_name = (t.category or "").strip() or "Other"
        cat_spent[cat_name] = cat_spent.get(cat_name, Decimal("0.00")) + t.amount
        cat_counts[cat_name] = cat_counts.get(cat_name, 0) + 1

    category_spending: list[CategorySpendingFact] = []
    for cat_name, spent_amt in sorted(cat_spent.items(), key=lambda item: item[1], reverse=True):
        pct = round(float(spent_amt / total_expenses) * 100, 2) if total_expenses > 0 else 0.0
        category_spending.append(
            CategorySpendingFact(
                category=cat_name,
                total_spent=spent_amt,
                transaction_count=cat_counts[cat_name],
                percentage_of_total_expenses=pct,
            )
        )

    # 3. Previous month spending & MoM trend
    prev_txs = list(
        db.scalars(
            select(Transaction).where(
                Transaction.user_id == user.id,
                func.date(Transaction.transaction_date) >= prev_start_date,
                func.date(Transaction.transaction_date) <= prev_end_date,
            )
        ).all()
    )

    if not prev_txs:
        mom_spending_change_pct: float | None = None
        data_limitations.append(f"No transactions found for previous month ({prev_month}); MoM comparison is unavailable.")
    else:
        total_prev_spent = sum(
            (t.amount for t in prev_txs if t.transaction_type == "expense"),
            Decimal("0.00"),
        )
        if total_prev_spent > 0:
            if total_expenses > 0:
                diff = total_expenses - total_prev_spent
                mom_spending_change_pct = round(float(diff / total_prev_spent) * 100, 2)
            elif effective_ref_date > curr_end_date:
                # Closed past month with genuine zero spending
                mom_spending_change_pct = -100.0
            else:
                # In-progress month with no recorded spending yet: comparison lacks a valid baseline
                mom_spending_change_pct = None
                data_limitations.append(
                    f"Month-over-month spending comparison is unavailable because {selected_month} is still in progress with no spending recorded yet."
                )
        elif total_expenses == 0:
            mom_spending_change_pct = 0.0
        else:
            mom_spending_change_pct = None

    # 4. Projected month-end expense (Strictly an estimate based on run-rate)
    total_days_in_month = (curr_end_date - curr_start_date).days + 1
    if effective_ref_date < curr_start_date:
        day_of_month = 1
    elif effective_ref_date > curr_end_date:
        day_of_month = total_days_in_month
    else:
        day_of_month = effective_ref_date.day

    if day_of_month >= total_days_in_month:
        projected_month_end = total_expenses
    elif day_of_month > 0:
        projected_month_end = round(
            (total_expenses / Decimal(day_of_month)) * Decimal(total_days_in_month),
            2,
        )
    else:
        projected_month_end = total_expenses

    # 5. Budgets & Utilization
    user_budgets = list(
        db.scalars(
            select(Budget)
            .where(Budget.user_id == user.id, Budget.month == selected_month)
            .order_by(Budget.category.asc())
        ).all()
    )

    if not user_budgets:
        data_limitations.append(f"No spending budgets established for {selected_month}.")

    budget_utilization: list[BudgetUtilizationFact] = []
    for b in user_budgets:
        b_cat = b.category.strip()
        # Sum spending matching this budget category (case-insensitive)
        spent = sum(
            (amt for cat_name, amt in cat_spent.items() if cat_name.casefold() == b_cat.casefold()),
            Decimal("0.00"),
        )
        limit = b.limit_amount
        remaining = limit - spent
        pct = round(float(spent / limit) * 100, 2) if limit > 0 else 0.0
        classified_status = classify_budget_status(spent, limit) if limit > 0 else "on_track"
        is_exceeded = classified_status == "over_budget"
        status_map = {
            "over_budget": "exceeded",
            "limit_reached": "limit_reached",
            "approaching_limit": "warning",
            "on_track": "on_track",
        }
        b_status = status_map[classified_status]

        budget_utilization.append(
            BudgetUtilizationFact(
                id=b.id,
                category=b.category,
                month=b.month,
                limit_amount=limit,
                spent_amount=spent,
                remaining_amount=remaining,
                percentage_used=pct,
                is_exceeded=is_exceeded,
                status=b_status,
            )
        )

    # 6. Recurring Payments (upcoming and overdue)
    active_recurring = list(
        db.scalars(
            select(RecurringPayment)
            .where(RecurringPayment.user_id == user.id, RecurringPayment.status == "active")
            .order_by(RecurringPayment.next_due_date.asc())
        ).all()
    )

    if not active_recurring:
        data_limitations.append("No active recurring payments or subscriptions recorded.")

    total_monthly_recurring = sum(
        (calculate_monthly_equivalent(r.amount, r.frequency) for r in active_recurring),
        Decimal("0.00"),
    )

    if total_income > 0:
        fixed_commitment_ratio: float | None = round(
            float(total_monthly_recurring / total_income) * 100, 2
        )
    else:
        fixed_commitment_ratio = None

    cutoff_date = effective_ref_date + timedelta(days=14)
    recurring_upcoming: list[RecurringPaymentFact] = []
    recurring_overdue: list[RecurringPaymentFact] = []

    for r in active_recurring:
        days_diff = (r.next_due_date - effective_ref_date).days
        is_overdue = r.next_due_date < effective_ref_date
        fact_item = RecurringPaymentFact(
            id=r.id,
            description=r.description,
            amount=r.amount,
            category=r.category,
            frequency=r.frequency,
            next_due_date=r.next_due_date,
            is_overdue=is_overdue,
            days_until_due=days_diff,
        )
        if is_overdue:
            recurring_overdue.append(fact_item)
        elif effective_ref_date <= r.next_due_date <= cutoff_date:
            recurring_upcoming.append(fact_item)

    # 7. Existing Statistical Insights
    all_user_exp_history = list(
        db.scalars(
            select(Transaction).where(
                Transaction.user_id == user.id,
                Transaction.transaction_type == "expense",
                func.date(Transaction.transaction_date) <= curr_end_date,
            )
        ).all()
    )
    anomaly_insights = detect_unusual_expenses(
        candidate_txs=curr_txs,
        history_txs=all_user_exp_history,
        selected_month=selected_month,
    )
    budget_insights = generate_budget_insights(
        budgets=user_budgets,
        curr_txs=curr_txs,
        selected_month=selected_month,
    )
    recurring_insights = generate_recurring_insights(
        recurring_payments=active_recurring,
        ref_date=effective_ref_date,
        selected_month=selected_month,
    )
    active_insights = anomaly_insights + budget_insights + recurring_insights

    # 8. Segregate Verified Facts vs Estimates vs Recommendations
    verified_facts: list[AssistantFactItem] = [
        AssistantFactItem(
            metric_key="total_income",
            label="Total Income",
            value_formatted=f"₹{total_income:,.2f}",
            raw_amount=total_income,
            kind="fact",
            source="transactions",
            notes=f"{len(income_txs)} income entries recorded",
        ),
        AssistantFactItem(
            metric_key="total_expenses",
            label="Total Expenses",
            value_formatted=f"₹{total_expenses:,.2f}",
            raw_amount=total_expenses,
            kind="fact",
            source="transactions",
            notes=f"{len(expense_txs)} expense entries recorded",
        ),
        AssistantFactItem(
            metric_key="net_savings",
            label="Net Savings",
            value_formatted=f"₹{net_savings:,.2f}",
            raw_amount=net_savings,
            kind="fact",
            source="transactions",
            notes="Net cash flow (Income minus Expenses)",
        ),
    ]

    for cat in category_spending[:3]:
        slug = cat.category.lower().replace(" ", "_").replace("/", "_")
        verified_facts.append(
            AssistantFactItem(
                metric_key=f"cat_spend_{slug}",
                label=f"Spent on {cat.category}",
                value_formatted=f"₹{cat.total_spent:,.2f}",
                raw_amount=cat.total_spent,
                kind="fact",
                category=cat.category,
                source="transactions",
                notes=f"{cat.percentage_of_total_expenses:.1f}% of expenses ({cat.transaction_count} txs)",
            )
        )

    for b in budget_utilization:
        slug = b.category.lower().replace(" ", "_").replace("/", "_")
        verified_facts.append(
            AssistantFactItem(
                metric_key=f"budget_{slug}",
                label=f"{b.category} Budget",
                value_formatted=f"₹{b.spent_amount:,.2f} of ₹{b.limit_amount:,.2f} ({b.percentage_used:.1f}%)",
                raw_amount=b.spent_amount,
                kind="fact",
                category=b.category,
                source="budgets",
                notes=f"Remaining: ₹{b.remaining_amount:,.2f} | Status: {b.status.replace('_', ' ').title()}",
            )
        )

    for r in recurring_overdue:
        verified_facts.append(
            AssistantFactItem(
                metric_key=f"overdue_bill_{r.id}",
                label=f"Overdue Bill: {r.description}",
                value_formatted=f"₹{r.amount:,.2f} (Due {r.next_due_date})",
                raw_amount=r.amount,
                kind="fact",
                category=r.category,
                source="recurring_payments",
                notes=f"Overdue by {abs(r.days_until_due)} days",
            )
        )

    for r in recurring_upcoming:
        verified_facts.append(
            AssistantFactItem(
                metric_key=f"upcoming_bill_{r.id}",
                label=f"Upcoming Bill: {r.description}",
                value_formatted=f"₹{r.amount:,.2f} (Due {r.next_due_date})",
                raw_amount=r.amount,
                kind="fact",
                category=r.category,
                source="recurring_payments",
                notes=f"Due in {r.days_until_due} days",
            )
        )

    # Estimates
    estimates: list[AssistantFactItem] = [
        AssistantFactItem(
            metric_key="projected_month_end_expense",
            label="Projected Month-End Outflow",
            value_formatted=f"₹{projected_month_end:,.2f}",
            raw_amount=projected_month_end,
            kind="estimate",
            source="projections",
            notes=f"Run-rate extrapolation based on {day_of_month} of {total_days_in_month} days elapsed",
        )
    ]

    if savings_rate_pct is not None:
        estimates.append(
            AssistantFactItem(
                metric_key="savings_rate_pct",
                label="Monthly Savings Rate",
                value_formatted=f"{savings_rate_pct:.1f}%",
                kind="estimate",
                source="insights",
                notes="Portion of earned income retained as surplus",
            )
        )

    if mom_spending_change_pct is not None:
        sign = "+" if mom_spending_change_pct > 0 else ""
        estimates.append(
            AssistantFactItem(
                metric_key="mom_spending_change_pct",
                label="Month-over-Month Spending Change",
                value_formatted=f"{sign}{mom_spending_change_pct:.1f}%",
                kind="estimate",
                source="insights",
                notes=f"Spending trend compared to {prev_month}",
            )
        )

    if fixed_commitment_ratio is not None:
        estimates.append(
            AssistantFactItem(
                metric_key="fixed_commitment_ratio",
                label="Fixed Recurring Commitment Ratio",
                value_formatted=f"{fixed_commitment_ratio:.1f}%",
                kind="estimate",
                source="recurring_payments",
                notes="Percentage of current income required to cover recurring commitments",
            )
        )

    # Recommendations
    recommendations: list[AssistantFactItem] = []
    for b in budget_utilization:
        if b.is_exceeded:
            recommendations.append(
                AssistantFactItem(
                    metric_key=f"rec_budget_exceeded_{b.id}",
                    label=f"Budget Exceeded in {b.category}",
                    value_formatted=f"Exceeded by ₹{abs(b.remaining_amount):,.2f}",
                    raw_amount=abs(b.remaining_amount),
                    kind="recommendation",
                    category=b.category,
                    source="budgets",
                    notes=f"Pause non-essential {b.category} purchases for the remainder of {selected_month}.",
                )
            )
        elif b.status == "limit_reached":
            recommendations.append(
                AssistantFactItem(
                    metric_key=f"rec_budget_limit_reached_{b.id}",
                    label=f"Budget Limit Reached in {b.category}",
                    value_formatted="100.0% limit reached (₹0.00 remaining)",
                    raw_amount=Decimal("0.00"),
                    kind="recommendation",
                    category=b.category,
                    source="budgets",
                    notes=f"No budget headroom remains in {b.category} for the remainder of {selected_month}.",
                )
            )
        elif b.status == "warning":
            recommendations.append(
                AssistantFactItem(
                    metric_key=f"rec_budget_warning_{b.id}",
                    label=f"Budget Approaching Limit in {b.category}",
                    value_formatted=f"{b.percentage_used:.1f}% utilized (₹{b.remaining_amount:,.2f} left)",
                    raw_amount=b.remaining_amount,
                    kind="recommendation",
                    category=b.category,
                    source="budgets",
                    notes=f"Monitor upcoming {b.category} expenses to prevent exceeding the ₹{b.limit_amount:,.2f} cap.",
                )
            )

    for r in recurring_overdue:
        recommendations.append(
            AssistantFactItem(
                metric_key=f"rec_overdue_{r.id}",
                label=f"Settle Overdue Bill: {r.description}",
                value_formatted=f"₹{r.amount:,.2f}",
                raw_amount=r.amount,
                kind="recommendation",
                category=r.category,
                source="recurring_payments",
                notes=f"Bill was due on {r.next_due_date}. Verify payment to avoid service disruption or late fees.",
            )
        )

    for insight in anomaly_insights:
        recommendations.append(
            AssistantFactItem(
                metric_key=f"rec_anomaly_{insight.id}",
                label=insight.title,
                value_formatted=insight.metric_label or "Statistical Outlier",
                raw_amount=insight.amount,
                kind="recommendation",
                category=insight.category,
                source="insights",
                notes=insight.description,
            )
        )

    summary = FinancialContextSummary(
        month=selected_month,
        has_transactions=has_transactions,
        total_income=total_income,
        total_expenses=total_expenses,
        net_savings=net_savings,
        savings_rate_pct=savings_rate_pct,
        transaction_count=len(curr_txs),
        expense_count=len(expense_txs),
        income_count=len(income_txs),
        projected_month_end_expense=projected_month_end,
        fixed_commitment_ratio=fixed_commitment_ratio,
        mom_spending_change_pct=mom_spending_change_pct,
        category_spending=category_spending,
        budget_utilization=budget_utilization,
        recurring_upcoming=recurring_upcoming,
        recurring_overdue=recurring_overdue,
        active_insights=active_insights,
        verified_facts=verified_facts,
        estimates=estimates,
        recommendations=recommendations,
    )

    return AssistantContextResponse(
        user_id=user.id,
        month=selected_month,
        generated_at=now_utc,
        summary=summary,
        data_limitations=data_limitations,
    )


STARTER_PROMPTS = [
    StarterPromptItem(
        id="spending-summary",
        prompt="How much did I spend this month?",
        category="Spending",
    ),
    StarterPromptItem(
        id="top-categories",
        prompt="What are my biggest spending categories?",
        category="Spending",
    ),
    StarterPromptItem(
        id="savings-summary",
        prompt="How much did I save this month?",
        category="Savings",
    ),
    StarterPromptItem(
        id="budget-status",
        prompt="Am I staying within my budgets?",
        category="Budgets",
    ),
    StarterPromptItem(
        id="recurring-status",
        prompt="What recurring payments are upcoming or overdue?",
        category="Bills",
    ),
    StarterPromptItem(
        id="anomaly-detection",
        prompt="What unusual transactions were detected?",
        category="Insights",
    ),
    StarterPromptItem(
        id="mom-comparison",
        prompt="How does my spending compare with last month?",
        category="Insights",
    ),
]


def get_starter_prompts() -> StarterPromptsResponse:
    """Return initial recommended prompt chips for the assistant."""
    return StarterPromptsResponse(prompts=STARTER_PROMPTS)


def classify_intent(query: str) -> str:
    """Classify user query into a supported financial intent."""
    q = query.strip().lower()
    q_clean = re.sub(r"[^\w\s]", " ", q)
    words = set(q_clean.split())

    # 1. Month-over-month comparison
    # Requires an explicit comparative or trend term alongside prior-month terms
    has_prior_month = "last month" in q or "previous month" in q or "prior month" in q or "mom" in words
    has_comparison = (
        "compare" in q
        or "comparison" in q
        or "more or less" in q
        or "higher or lower" in q
        or "versus" in q
        or "vs" in words
        or "difference" in words
        or "change" in words
        or "trend" in words
    )
    if has_prior_month and has_comparison:
        return "mom_comparison"

    # 2. Top / biggest spending categories
    # Requires meaningful category or spending-breakdown wording
    has_category_term = (
        "categor" in q
        or "categories" in words
        or "category" in words
        or "breakdown" in words
        or "break down" in q
        or "breakdowns" in words
    )
    has_ranking_term = (
        "biggest" in words
        or "top" in words
        or "highest" in words
        or "largest" in words
        or "main" in words
    )
    is_where_money_went = (
        "where did my money go" in q
        or "where does my money go" in q
        or "where did most of my money go" in q
        or "where is my money going" in q
        or "spend the most on" in q
        or "spent the most on" in q
        or "spending the most on" in q
        or "spend most of my money on" in q
        or "spent most of my money on" in q
    )
    if (has_category_term and (has_ranking_term or "spend" in words or "spent" in words or "spending" in words)) or is_where_money_went:
        return "top_categories"

    # 3. Budgets & limits
    if "budget" in q or "budgets" in words or "spending limit" in q or "spending limits" in q:
        return "budget_status"

    # 4. Unusual transactions / anomalies
    if (
        "unusual" in words
        or "anomaly" in words
        or "anomalies" in words
        or "outlier" in words
        or "outliers" in words
        or "spike" in words
        or "unexpected" in words
    ):
        return "anomaly_detection"

    # 5. Recurring / upcoming / overdue bills & subscriptions
    # Excludes non-financial proper names like "Bill Gates"
    has_recurring_term = (
        "recurring" in words
        or "subscription" in words
        or "subscriptions" in words
        or "overdue" in words
    )
    has_bill_term = (
        "bills" in words
        or "bill" in words
        or "due" in words
    ) and (
        "pay" in words
        or "payment" in words
        or "payments" in words
        or "due" in words
        or "upcoming" in words
        or "overdue" in words
        or "monthly" in words
        or "utility" in words
        or "utilities" in words
        or "active" in words
        or "subscription" in words
        or "subscriptions" in words
        or "scheduled" in words
        or "what" in words
        or "any" in words
        or "my" in words
        or "the" in words
        or "week" in words
        or "month" in words
    )
    is_not_proper_noun_bill = not (
        "bill gates" in q
        or "bill clinton" in q
        or "who is bill" in q
        or "tell me about bill" in q
    )
    if has_recurring_term or (has_bill_term and is_not_proper_noun_bill):
        return "recurring_status"

    # 6. Savings / Income / Net cash flow
    # Contextual check for 'left' or 'save' to prevent directional false positives
    has_savings_term = (
        "save" in words
        or "saved" in words
        or "saving" in words
        or "savings" in words
        or "income" in words
        or "earn" in words
        or "earned" in words
        or "net" in words
        or "money left" in q
        or "how much left" in q
        or "have left" in q
        or "what is left" in q
        or "what do i have left" in q
        or "remaining cash" in q
        or "remaining money" in q
        or "remaining balance" in q
        or "remaining" in words
    )
    if has_savings_term:
        return "savings_summary"

    # 7. Spending / Expenses (including historical single-month queries like "How much did I spend last month?")
    if (
        "spend" in words
        or "spent" in words
        or "spending" in words
        or "expense" in words
        or "expenses" in words
        or "outflow" in words
        or "outflows" in words
        or "cost" in words
        or "costs" in words
    ):
        return "spending_summary"

    # 8. General financial summary / overview
    if (
        "summary" in words
        or "overview" in words
        or "health" in words
        or "picture" in words
        or "how am i doing" in q
    ):
        return "general_summary"

    return "unsupported"


MONTH_NAME_TO_NUM = {
    "january": "01",
    "february": "02",
    "march": "03",
    "april": "04",
    "may": "05",
    "june": "06",
    "july": "07",
    "august": "08",
    "september": "09",
    "october": "10",
    "november": "11",
    "december": "12",
}


def extract_explicit_month(query: str) -> str | None:
    """Extract an explicit YYYY-MM or 'Month YYYY' target month from user query if present."""
    q = query.strip().lower()
    m_iso = re.search(r"\b(\d{4})-(0[1-9]|1[0-2])\b", q)
    if m_iso:
        return f"{m_iso.group(1)}-{m_iso.group(2)}"
    m_name = re.search(
        r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b",
        q,
    )
    if m_name:
        return f"{m_name.group(2)}-{MONTH_NAME_TO_NUM[m_name.group(1)]}"
    return None


def resolve_target_month(
    query: str,
    intent: str,
    requested_month: str | None = None,
    ref_date: date | None = None,
) -> str:
    """Resolve the effective target month for financial analysis.

    Resolution rules:
    1. Base anchor month:
       - Uses `requested_month` if explicitly provided (e.g., '2026-10').
       - Otherwise uses explicit month mentioned in `query` (e.g., 'November 2026' -> '2026-11').
       - Otherwise defaults to the calendar month of `ref_date` (or current UTC month).
    2. Relative previous-month expressions:
       - If the user query specifically asks about 'last month', 'previous month', or 'prior month'
         for an absolute single-month metric (e.g., `spending_summary`, `top_categories`),
         the target month shifts to the month immediately preceding the anchor month
         via `get_previous_month(base_month)`.
       - For `mom_comparison`, the target month remains `base_month` because MoM comparison
         evaluates `base_month` against its preceding month baseline.
       - Otherwise, the target month remains `base_month`.
    """
    now_ist = get_current_ist_datetime()
    effective_ref_date = ref_date or now_ist.date()
    explicit_month = extract_explicit_month(query)
    base_month = (
        requested_month.strip()
        if isinstance(requested_month, str) and requested_month.strip()
        else (explicit_month or effective_ref_date.strftime("%Y-%m"))
    )

    q = query.strip().lower()
    has_prior_month = "last month" in q or "previous month" in q or "prior month" in q

    # Only shift target month for absolute single-month metrics
    if has_prior_month and intent != "mom_comparison":
        return get_previous_month(base_month)

    return base_month



def answer_deterministic_query(
    query: str,
    intent: str,
    context: AssistantContextResponse,
) -> AssistantQueryResponse:
    """Generate a fact-grounded response for the recognized intent using context facts."""
    summary = context.summary
    month = context.month
    relevant_facts: list[AssistantFactItem] = []
    relevant_estimates: list[AssistantFactItem] = []
    relevant_recommendations: list[AssistantFactItem] = []
    relevant_limitations: list[str] = []
    followups: list[str] = []

    if intent == "spending_summary":
        if not summary.has_transactions or summary.expense_count == 0:
            answer = f"You have recorded no expense transactions for **{month}**."
            relevant_limitations.append(f"No expense transactions recorded for {month}.")
        else:
            lines = [
                f"In **{month}**, your total recorded expenses are **₹{summary.total_expenses:,.2f}** "
                f"across **{summary.expense_count}** transaction(s)."
            ]
            if summary.projected_month_end_expense is not None:
                lines.append(
                    f"\n\n* **Projected Month-End Outflow**: ₹{summary.projected_month_end_expense:,.2f} "
                    "(estimated based on your daily run-rate)."
                )
            if summary.category_spending:
                top = summary.category_spending[0]
                lines.append(
                    f"\n* **Primary Spending Driver**: {top.category} "
                    f"(₹{top.total_spent:,.2f}, {top.percentage_of_total_expenses:.1f}% of total outflow)."
                )
            answer = "".join(lines)

        relevant_facts = [f for f in summary.verified_facts if f.metric_key == "total_expenses" or f.metric_key.startswith("cat_spend_")][:3]
        relevant_estimates = (
            [e for e in summary.estimates if e.metric_key == "projected_month_end_expense"]
            if summary.expense_count > 0
            else []
        )
        relevant_recommendations = [r for r in summary.recommendations if "budget" in r.metric_key][:2]
        followups = [
            "What are my biggest spending categories?",
            "Am I staying within my budgets?",
            "How much did I save this month?",
        ]

    elif intent == "top_categories":
        if not summary.category_spending:
            answer = f"No category spending records have been recorded for **{month}**."
            relevant_limitations.append(f"No expense transactions available to rank categories in {month}.")
        else:
            lines = [f"Your top spending categories for **{month}** are:\n"]
            for idx, c in enumerate(summary.category_spending[:5], start=1):
                tx_label = "transaction" if c.transaction_count == 1 else "transactions"
                lines.append(
                    f"{idx}. **{c.category}**: ₹{c.total_spent:,.2f} "
                    f"({c.percentage_of_total_expenses:.1f}% of total expenses, {c.transaction_count} {tx_label})"
                )
            answer = "\n".join(lines)

        relevant_facts = [f for f in summary.verified_facts if f.metric_key.startswith("cat_spend_")][:5]
        relevant_recommendations = [r for r in summary.recommendations if "budget" in r.metric_key][:2]
        followups = [
            "How much did I spend this month?",
            "Am I staying within my budgets?",
            "What unusual transactions were detected?",
        ]

    elif intent == "savings_summary":
        if not summary.has_transactions:
            answer = f"No income or expense records have been recorded for **{month}**."
            relevant_limitations.append(f"No transactions recorded for {month}.")
        else:
            inc_label = "entry" if summary.income_count == 1 else "entries"
            exp_label = "entry" if summary.expense_count == 1 else "entries"
            lines = [
                f"Here is your cash flow and savings summary for **{month}**:\n",
                f"- **Total Income**: ₹{summary.total_income:,.2f} ({summary.income_count} {inc_label})",
                f"- **Total Expenses**: ₹{summary.total_expenses:,.2f} ({summary.expense_count} {exp_label})",
                f"- **Net Savings**: **₹{summary.net_savings:,.2f}**\n",
            ]
            if summary.savings_rate_pct is not None:
                lines.append(f"Your monthly savings rate is **{summary.savings_rate_pct:.1f}%** of income.")
            else:
                lines.append("An estimated savings rate percentage is unavailable because no income was recorded for this month.")
                relevant_limitations.append("No income recorded for this month; savings rate is unavailable.")
            answer = "\n".join(lines)

        relevant_facts = [f for f in summary.verified_facts if f.metric_key in ("total_income", "total_expenses", "net_savings")]
        relevant_estimates = [e for e in summary.estimates if e.metric_key == "savings_rate_pct"]
        followups = [
            "How much did I spend this month?",
            "What are my biggest spending categories?",
            "How does my spending compare with last month?",
        ]

    elif intent == "budget_status":
        if not summary.budget_utilization:
            answer = (
                f"You have not established any monthly category budgets for **{month}**. "
                "You can configure monthly spending limits on the Budgets page."
            )
            relevant_limitations.append(f"No spending budgets established for {month}.")
        else:
            exceeded = [b for b in summary.budget_utilization if b.is_exceeded]
            limit_reached = [b for b in summary.budget_utilization if b.status == "limit_reached"]
            warning = [b for b in summary.budget_utilization if b.status == "warning"]
            on_track = [b for b in summary.budget_utilization if b.status == "on_track"]
            limit_reached_part = f"{len(limit_reached)} limit reached, " if limit_reached else ""

            lines = [
                f"Here is your budget utilization for **{month}** "
                f"({len(exceeded)} exceeded, {limit_reached_part}{len(warning)} approaching limit, {len(on_track)} on track):\n"
            ]
            for b in summary.budget_utilization:
                if b.is_exceeded:
                    status_text = f"⚠️ **Exceeded** (by ₹{abs(b.remaining_amount):,.2f})"
                elif b.status == "limit_reached":
                    status_text = "⚠️ **Limit Reached** (₹0.00 remaining)"
                elif b.status == "warning":
                    status_text = f"⚠️ **Approaching Limit** (₹{b.remaining_amount:,.2f} remaining)"
                else:
                    status_text = f"✅ **On Track** (₹{b.remaining_amount:,.2f} remaining)"

                lines.append(
                    f"- **{b.category}**: ₹{b.spent_amount:,.2f} of ₹{b.limit_amount:,.2f} "
                    f"({b.percentage_used:.1f}%) — {status_text}"
                )
            answer = "\n".join(lines)

        relevant_facts = [f for f in summary.verified_facts if f.source == "budgets"]
        relevant_recommendations = [r for r in summary.recommendations if r.source == "budgets"]
        followups = [
            "What are my biggest spending categories?",
            "How much did I spend this month?",
            "What recurring payments are upcoming or overdue?",
        ]

    elif intent == "anomaly_detection":
        anomalies = [i for i in summary.active_insights if i.type == "anomaly"]
        if not anomalies:
            answer = (
                f"No unusual expense transactions were detected for **{month}**.\n\n"
                "*Note: Outlier detection evaluates category-specific spending requiring at least 3 historical transactions "
                "in a category to establish a baseline. Statistical deviations reflect departures from your typical habits "
                "and do not signify confirmed fraud.*"
            )
        else:
            lines = [f"We detected **{len(anomalies)}** statistically unusual transaction(s) for **{month}**:\n"]
            for a in anomalies:
                lines.append(f"- **{a.title}**: {a.description}")
            lines.append(
                "\n*Note: Statistical anomalies highlight notable deviations from your historical spending baseline. "
                "They do not imply fraud, accounting errors, or duplicate billing.*"
            )
            answer = "\n".join(lines)

        relevant_recommendations = [r for r in summary.recommendations if "rec_anomaly" in r.metric_key]
        followups = [
            "What are my biggest spending categories?",
            "Am I staying within my budgets?",
            "How does my spending compare with last month?",
        ]

    elif intent == "recurring_status":
        overdue = summary.recurring_overdue
        upcoming = summary.recurring_upcoming
        has_schedules = len(overdue) > 0 or len(upcoming) > 0 or summary.fixed_commitment_ratio is not None

        if not has_schedules:
            answer = "You have no active recurring payments or subscriptions recorded."
            relevant_limitations.append("No active recurring payments or subscriptions recorded.")
        elif len(overdue) == 0 and len(upcoming) == 0:
            lines = ["You have no overdue bills and no recurring payments scheduled within the next 14 days."]
            if summary.fixed_commitment_ratio is not None:
                lines.append(f"\nYour active recurring commitments represent **{summary.fixed_commitment_ratio:.1f}%** of your monthly income.")
            answer = "".join(lines)
        else:
            lines = []
            if overdue:
                lines.append("⚠️ **Overdue Bills:**")
                for r in overdue:
                    lines.append(
                        f"- **{r.description}**: ₹{r.amount:,.2f} ({r.category}) "
                        f"was due on {r.next_due_date} ({abs(r.days_until_due)} days overdue)"
                    )
                lines.append("")

            if upcoming:
                lines.append("📅 **Upcoming Payments (Next 14 Days):**")
                for r in upcoming:
                    due_str = "today" if r.days_until_due == 0 else f"in {r.days_until_due} days"
                    lines.append(
                        f"- **{r.description}**: ₹{r.amount:,.2f} ({r.category}) "
                        f"due on {r.next_due_date} ({due_str})"
                    )

            if summary.fixed_commitment_ratio is not None:
                lines.append(
                    f"\nActive recurring commitments account for **{summary.fixed_commitment_ratio:.1f}%** "
                    "of your monthly income."
                )
            answer = "\n".join(lines)

        relevant_facts = [f for f in summary.verified_facts if f.source == "recurring_payments"]
        relevant_estimates = [e for e in summary.estimates if e.metric_key == "fixed_commitment_ratio"]
        relevant_recommendations = [r for r in summary.recommendations if r.source == "recurring_payments"]
        followups = [
            "Am I staying within my budgets?",
            "How much did I spend this month?",
            "How much did I save this month?",
        ]

    elif intent == "mom_comparison":
        if summary.mom_spending_change_pct is None:
            prev_m = get_previous_month(month)
            in_progress_limitation = next(
                (lim for lim in context.data_limitations if "still in progress" in lim),
                None,
            )
            if in_progress_limitation:
                answer = (
                    f"A month-over-month spending comparison is unavailable because **{month}** is still "
                    f"in progress with no spending recorded yet. Once expenses occur or the month closes, "
                    f"SpendWise AI will compare your spending against **{prev_m}**."
                )
                relevant_limitations.append(in_progress_limitation)
            else:
                answer = (
                    f"A month-over-month spending comparison is unavailable because there is no transaction "
                    f"history recorded for the previous month ({prev_m}) to serve as a baseline."
                )
                relevant_limitations.append(f"No transactions found for previous month ({prev_m}); MoM comparison is unavailable.")
        else:
            pct = summary.mom_spending_change_pct
            prev_m = get_previous_month(month)
            direction = "higher" if pct > 0 else ("lower" if pct < 0 else "unchanged")
            lines = [
                f"Your recorded spending for **{month}** is **{abs(pct):.1f}% {direction}** compared to **{prev_m}** "
                f"(₹{summary.total_expenses:,.2f} this month).\n"
            ]
            cat_patterns = [i for i in summary.active_insights if i.type == "pattern" and i.category]
            if cat_patterns:
                lines.append("**Key Category Shifts:**")
                for cp in cat_patterns[:4]:
                    lines.append(f"- **{cp.title}**: {cp.description}")
            answer = "\n".join(lines)

        relevant_estimates = [e for e in summary.estimates if e.metric_key == "mom_spending_change_pct"]
        followups = [
            "What are my biggest spending categories?",
            "How much did I spend this month?",
            "Am I staying within my budgets?",
        ]

    elif intent == "general_summary":
        if not summary.has_transactions:
            answer = (
                f"No financial transactions have been recorded for **{month}**. "
                "Once you add income, expenses, or import bank statements, SpendWise AI will provide real-time analytics."
            )
            relevant_limitations.append(f"No transactions recorded for {month}.")
        else:
            lines = [
                f"### Financial Summary for **{month}**\n",
                f"- **Cash Flow**: ₹{summary.total_income:,.2f} income vs ₹{summary.total_expenses:,.2f} expenses (**₹{summary.net_savings:,.2f}** net savings)",
            ]
            if summary.savings_rate_pct is not None:
                lines.append(f"- **Savings Rate**: {summary.savings_rate_pct:.1f}% of income")
            if summary.budget_utilization:
                exceeded_count = len([b for b in summary.budget_utilization if b.is_exceeded])
                lines.append(f"- **Budgets**: {exceeded_count} exceeded of {len(summary.budget_utilization)} active budget(s)")
            if summary.recurring_overdue:
                lines.append(f"- **Overdue Bills**: ⚠️ {len(summary.recurring_overdue)} bill(s) require attention")
            elif summary.recurring_upcoming:
                lines.append(f"- **Upcoming Bills**: {len(summary.recurring_upcoming)} bill(s) due in the next 14 days")

            anomalies = [i for i in summary.active_insights if i.type == "anomaly"]
            if anomalies:
                lines.append(f"- **Anomalies**: {len(anomalies)} unusual transaction(s) flagged")

            answer = "\n".join(lines)

        relevant_facts = summary.verified_facts[:4]
        relevant_estimates = summary.estimates[:2]
        relevant_recommendations = summary.recommendations[:2]
        followups = [
            "How much did I spend this month?",
            "What are my biggest spending categories?",
            "Am I staying within my budgets?",
        ]

    else:  # unsupported
        answer = (
            "I am your SpendWise AI Money Assistant, focused on your personal financial data. "
            "I can answer questions about your income, expenses, category spending, monthly budgets, "
            "recurring bills, and savings.\n\n"
            "Here are some questions you can ask:\n"
            "- *How much did I spend this month?*\n"
            "- *What are my biggest spending categories?*\n"
            "- *How much did I save this month?*\n"
            "- *Am I staying within my budgets?*\n"
            "- *What unusual transactions were detected?*\n"
            "- *What recurring payments are upcoming or overdue?*\n"
            "- *How does my spending compare with last month?*"
        )
        followups = [
            "How much did I spend this month?",
            "What are my biggest spending categories?",
            "Am I staying within my budgets?",
        ]

    return AssistantQueryResponse(
        query=query,
        intent=intent,
        answer_markdown=answer,
        facts=relevant_facts,
        estimates=relevant_estimates,
        recommendations=relevant_recommendations,
        data_limitations=relevant_limitations,
        suggested_followups=followups,
        engine="deterministic",
    )


def process_assistant_query(
    query: str,
    user: User,
    db: Session,
    month: str | None = None,
    ref_date: date | None = None,
) -> AssistantQueryResponse:
    """End-to-end handler for assistant questions with fact grounding and fallback."""
    # 1. Classify intent
    intent = classify_intent(query)

    # 2. Resolve effective target month taking into account relative time expressions
    target_month = resolve_target_month(
        query=query,
        intent=intent,
        requested_month=month,
        ref_date=ref_date,
    )

    # 3. Fetch strictly authenticated user financial context for the target month
    context = calculate_user_financial_facts(
        user=user,
        db=db,
        month=target_month,
        ref_date=ref_date,
    )

    # 3. Optional LLM Adapter Hook (strictly returns None in Phase 2)
    llm_adapter = get_llm_adapter()
    llm_result = llm_adapter.generate_response(query=query, context=context)
    if llm_result is not None:
        return AssistantQueryResponse(
            query=query,
            intent=intent,
            answer_markdown=llm_result,
            facts=context.summary.verified_facts,
            estimates=context.summary.estimates,
            recommendations=context.summary.recommendations,
            data_limitations=context.data_limitations,
            suggested_followups=[
                "How much did I spend this month?",
                "What are my biggest spending categories?",
                "Am I staying within my budgets?",
            ],
            engine="llm",
        )

    # 4. Fallback to deterministic query synthesis
    return answer_deterministic_query(
        query=query,
        intent=intent,
        context=context,
    )


