import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import math
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth_dependencies import get_current_user
from app.dependencies import get_db
from app.models import RecurringPayment, Transaction, User
from app.recurring_payments import calculate_monthly_equivalent
from app.timezone import get_current_ist_date
from app.schemas import (
    CategoryForecastItem,
    ForecastSummaryResponse,
    MonthlyForecastPoint,
)

router = APIRouter(prefix="/forecast", tags=["Financial Forecasting"])


def get_month_bounds(year_month: str) -> tuple[datetime, datetime]:
    """Return timezone-aware (start_dt, end_dt) in UTC covering the given YYYY-MM month."""
    parts = year_month.split("-")
    year = int(parts[0])
    month = int(parts[1])
    start_dt = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    if month == 12:
        end_dt = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        end_dt = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    return start_dt, end_dt


def get_month_date_bounds(year_month: str) -> tuple[date, date]:
    """Return (start_date, end_date) as inclusive calendar date objects covering the given YYYY-MM month."""
    parts = year_month.split("-")
    year = int(parts[0])
    month = int(parts[1])
    start_date = date(year, month, 1)
    if month == 12:
        next_month_start = date(year + 1, 1, 1)
    else:
        next_month_start = date(year, month + 1, 1)
    end_date = next_month_start - timedelta(days=1)
    return start_date, end_date


def get_future_month_str(base_year: int, base_month: int, offset: int) -> str:
    """Calculate the YYYY-MM string for a month offset from base_year-base_month."""
    total_months = (base_year * 12 + (base_month - 1)) + offset
    year = total_months // 12
    month = (total_months % 12) + 1
    return f"{year:04d}-{month:02d}"


def get_month_label(year_month: str) -> str:
    """Return human-readable label like 'November 2026'."""
    parts = year_month.split("-")
    year = int(parts[0])
    month = int(parts[1])
    return f"{calendar.month_name[month]} {year}"


def detect_recurring_match(tx: Transaction, recurring_item: RecurringPayment) -> bool:
    """Determine if a transaction likely represents an occurrence of a recurring payment.

    Uses a conservative matching strategy:
    1. Transaction must be an expense.
    2. Amount must match within ₹1.00.
    3. Requires description similarity (direct substring, token overlap, or category
       match with explicit bill/recurring keywords) to avoid false positives.
    """
    if tx.transaction_type != "expense":
        return False

    amount_match = abs(tx.amount - recurring_item.amount) <= Decimal("1.00")
    if not amount_match:
        return False

    rec_desc = (recurring_item.description or "").strip().lower()
    tx_desc = (tx.description or "").strip().lower()

    # 1. Direct or substring description match
    if rec_desc and (rec_desc in tx_desc or tx_desc in rec_desc):
        return True

    # 2. Token overlap between descriptions (e.g. "Netflix Standard" and "Netflix")
    rec_tokens = set(rec_desc.split())
    tx_tokens = set(tx_desc.split())
    if rec_tokens and tx_tokens and (rec_tokens & tx_tokens):
        return True

    # 3. Category match ONLY if category is Housing/Rent or transaction has explicit bill keywords
    cat_match = (tx.category or "").strip().lower() == (recurring_item.category or "").strip().lower()
    bill_keywords = {"bill", "autopay", "auto-debit", "subscription", "recurring", "payment", "due"}
    has_bill_keyword = any(kw in tx_desc for kw in bill_keywords)
    is_dedicated_fixed_cat = (recurring_item.category or "").strip().lower() in {"housing", "rent"}

    return cat_match and (has_bill_keyword or is_dedicated_fixed_cat)


def generate_financial_forecast(
    db: Session,
    current_user: User,
    horizon_months: int = 3,
    ref_date: Optional[date] = None,
) -> ForecastSummaryResponse:
    """Generate a component-decomposed financial forecast for the authenticated user.

    Architecture:
    1. Fixed commitments: computed deterministically from active recurring payments.
    2. Historical discretionary baseline: 3-month recency-weighted moving average with
       outlier dampening.
    3. Trend adjustment: bounded linear slope applied over the forecast horizon.
    4. Current month: dynamic blend of month-to-date actuals + remaining pending commitments
       + expected remaining variable pacing.
    5. Uncertainty bounds: estimated volatility envelopes based on historical variance.
    """
    effective_ref_date = ref_date or get_current_ist_date()
    curr_year = effective_ref_date.year
    curr_month = effective_ref_date.month
    curr_day = effective_ref_date.day
    curr_month_str = f"{curr_year:04d}-{curr_month:02d}"
    curr_days_in_month = calendar.monthrange(curr_year, curr_month)[1]

    methodology_notes: list[str] = []
    limitations: list[str] = [
        "Projections are statistical estimates based on historical patterns and active recurring schedules, not guaranteed financial outcomes.",
        "Unplanned one-off expenditures (medical emergencies, major capital purchases) are not anticipated by the model.",
        "Future income variability and employment changes are not modeled.",
    ]

    # --- 1. Query Active Recurring Payment Schedules ---
    active_recurring = list(
        db.scalars(
            select(RecurringPayment).where(
                RecurringPayment.user_id == current_user.id,
                RecurringPayment.status == "active",
            )
        ).all()
    )

    monthly_fixed_commitment = sum(
        (calculate_monthly_equivalent(r.amount, r.frequency) for r in active_recurring),
        Decimal("0.00"),
    )

    # Category breakdown of recurring commitments
    recurring_by_category: dict[str, Decimal] = {}
    for r in active_recurring:
        cat = (r.category or "").strip() or "Other"
        equiv = calculate_monthly_equivalent(r.amount, r.frequency)
        recurring_by_category[cat] = recurring_by_category.get(cat, Decimal("0.00")) + equiv

    if active_recurring:
        methodology_notes.append(
            f"Incorporated ₹{monthly_fixed_commitment:,.2f} in fixed monthly commitments across {len(active_recurring)} active schedule(s)."
        )
    else:
        methodology_notes.append("No active recurring payment commitments registered.")

    # --- 2. Query Current Month Actuals & Detect Paid vs Pending Recurring ---
    curr_start_date, curr_end_date = get_month_date_bounds(curr_month_str)
    curr_txs = list(
        db.scalars(
            select(Transaction).where(
                Transaction.user_id == current_user.id,
                func.date(Transaction.transaction_date) >= curr_start_date,
                func.date(Transaction.transaction_date) <= curr_end_date,
            )
        ).all()
    )
    curr_expenses = [t for t in curr_txs if t.transaction_type == "expense"]
    total_curr_spent = sum((t.amount for t in curr_expenses), Decimal("0.00"))

    # Identify which recurring payments were already paid this month vs still pending
    paid_recurring_ids: set[int] = set()
    matched_tx_ids: set[int] = set()
    paid_recurring_amount = Decimal("0.00")

    for r in active_recurring:
        for t in curr_expenses:
            if t.id not in matched_tx_ids and detect_recurring_match(t, r):
                paid_recurring_ids.add(r.id)
                matched_tx_ids.add(t.id)
                paid_recurring_amount += r.amount
                break

    # Pending recurring commitments for the rest of current month
    pending_recurring_this_month = Decimal("0.00")
    for r in active_recurring:
        if r.id in paid_recurring_ids:
            continue  # Already represented in total_curr_spent, prevent double counting

        # Check if due this month
        is_due_this_month = (
            (r.next_due_date.year == curr_year and r.next_due_date.month == curr_month)
            or (r.next_due_date < effective_ref_date)  # Overdue
        )
        if is_due_this_month:
            pending_recurring_this_month += r.amount

    # --- 3. Historical Baseline (Prior 3 Calendar Months) ---
    hist_months_data: list[dict] = []
    for k in (1, 2, 3):
        h_month_str = get_future_month_str(curr_year, curr_month, -k)
        h_start_date, h_end_date = get_month_date_bounds(h_month_str)
        h_txs = list(
            db.scalars(
                select(Transaction).where(
                    Transaction.user_id == current_user.id,
                    func.date(Transaction.transaction_date) >= h_start_date,
                    func.date(Transaction.transaction_date) <= h_end_date,
                )
            ).all()
        )
        h_expenses = [t for t in h_txs if t.transaction_type == "expense"]
        h_total = sum((t.amount for t in h_expenses), Decimal("0.00"))
        # Variable spend is total minus fixed recurring commitments
        h_variable = max(Decimal("0.00"), h_total - monthly_fixed_commitment)

        # Category spending in historical month
        h_cat_spending: dict[str, Decimal] = {}
        for t in h_expenses:
            cat = (t.category or "").strip() or "Other"
            h_cat_spending[cat] = h_cat_spending.get(cat, Decimal("0.00")) + t.amount

        hist_months_data.append(
            {
                "month_str": h_month_str,
                "total_expense": h_total,
                "variable_expense": h_variable,
                "tx_count": len(h_expenses),
                "category_spending": h_cat_spending,
            }
        )

    # Valid history months are those with at least 1 recorded transaction
    valid_hist = [h for h in hist_months_data if h["tx_count"] > 0]
    history_months_count = len(valid_hist)

    # --- 4. Moving Average, Outlier Handling & Trend Adjustment ---
    # hist_months_data has [m-1, m-2, m-3]
    v_1 = hist_months_data[0]["variable_expense"]
    v_2 = hist_months_data[1]["variable_expense"]
    v_3 = hist_months_data[2]["variable_expense"]

    # Outlier winsorization on historical variable spend
    if history_months_count == 3:
        all_v = sorted([v_1, v_2, v_3])
        median_v = all_v[1]
        if median_v > Decimal("0.00"):
            for i, h in enumerate(hist_months_data):
                if h["variable_expense"] > median_v * Decimal("2.5"):
                    original_val = h["variable_expense"]
                    h["variable_expense"] = median_v * Decimal("2.0")
                    methodology_notes.append(
                        f"One-off outlier detected in {h['month_str']} (₹{original_val:,.2f}) — dampened to prevent projection inflation."
                    )
            v_1 = hist_months_data[0]["variable_expense"]
            v_2 = hist_months_data[1]["variable_expense"]
            v_3 = hist_months_data[2]["variable_expense"]

    # Recency-weighted moving average
    if history_months_count == 3:
        baseline_variable = round(
            v_1 * Decimal("0.50") + v_2 * Decimal("0.33") + v_3 * Decimal("0.17"),
            2,
        )
        # Linear slope per month: (v_1 - v_3) / 2
        raw_slope = (v_1 - v_3) / Decimal("2.0")
        max_slope = baseline_variable * Decimal("0.20")
        damped_slope = max(-max_slope, min(max_slope, raw_slope))
        methodology_notes.append(
            "Baseline variable spend modeled using 3-month recency-weighted moving average (weights: 50%, 33%, 17%)."
        )
    elif history_months_count == 2:
        baseline_variable = round(v_1 * Decimal("0.65") + v_2 * Decimal("0.35"), 2)
        raw_slope = v_1 - v_2
        max_slope = baseline_variable * Decimal("0.15")
        damped_slope = max(-max_slope, min(max_slope, raw_slope))
        methodology_notes.append(
            "Baseline variable spend modeled using 2-month weighted moving average (weights: 65%, 35%)."
        )
    elif history_months_count == 1:
        baseline_variable = v_1
        damped_slope = Decimal("0.00")
        methodology_notes.append(
            "Baseline variable spend derived from single prior month of transaction records."
        )
    else:
        # Cold start (0 historical months)
        baseline_variable = Decimal("0.00")
        damped_slope = Decimal("0.00")
        methodology_notes.append(
            "Cold-start: zero historical monthly transactions available. Projections based strictly on active recurring commitments and current month pace."
        )

    # --- 5. Uncertainty & Volatility Estimation ---
    if history_months_count >= 2:
        variances = [h["variable_expense"] for h in valid_hist]
        mean_v = sum(variances, Decimal("0.00")) / Decimal(len(variances))
        var_sq = sum(((v - mean_v) ** 2 for v in variances), Decimal("0.00")) / Decimal(len(variances))
        volatility_sigma = Decimal(str(round(math.sqrt(float(var_sq)), 2)))
    elif history_months_count == 1:
        volatility_sigma = round(baseline_variable * Decimal("0.20"), 2)
    else:
        volatility_sigma = (
            round(monthly_fixed_commitment * Decimal("0.25"), 2)
            if monthly_fixed_commitment > Decimal("0.00")
            else Decimal("0.00")
        )

    # Confidence Level Evaluation
    total_hist_txs = sum(h["tx_count"] for h in hist_months_data)
    if history_months_count >= 3 and total_hist_txs >= 10:
        cv = float(volatility_sigma / baseline_variable) if baseline_variable > Decimal("0.00") else 0.0
        if cv < 0.45:
            confidence_level = "high"
            confidence_score = 0.85
        else:
            confidence_level = "moderate"
            confidence_score = 0.65
    elif history_months_count >= 2:
        confidence_level = "moderate"
        confidence_score = 0.60
    else:
        confidence_level = "low"
        confidence_score = 0.30
        limitations.append(
            "Limited transaction history available (<2 months); forecast accuracy will improve as more transactions are recorded."
        )

    # --- 6. Current Month Forecast Point ---
    if curr_day >= curr_days_in_month:
        # Month is fully closed
        curr_predicted = total_curr_spent
        curr_fixed = min(monthly_fixed_commitment, curr_predicted)
        curr_variable = max(Decimal("0.00"), curr_predicted - curr_fixed)
        curr_lower = curr_predicted
        curr_upper = curr_predicted
    else:
        days_remaining = curr_days_in_month - curr_day
        fraction_remaining = Decimal(days_remaining) / Decimal(curr_days_in_month)

        if baseline_variable > Decimal("0.00"):
            daily_var_rate = baseline_variable / Decimal(curr_days_in_month)
        else:
            var_spent_mtd = max(Decimal("0.00"), total_curr_spent - (monthly_fixed_commitment - pending_recurring_this_month))
            daily_var_rate = var_spent_mtd / Decimal(curr_day) if curr_day > 0 else Decimal("0.00")

        remaining_variable_est = round(daily_var_rate * Decimal(days_remaining), 2)
        curr_predicted = total_curr_spent + pending_recurring_this_month + remaining_variable_est
        curr_fixed = monthly_fixed_commitment
        curr_variable = max(Decimal("0.00"), curr_predicted - curr_fixed)

        # Scaled volatility for remaining days
        sigma_curr = volatility_sigma * fraction_remaining
        curr_lower = max(
            total_curr_spent + pending_recurring_this_month,
            round(curr_predicted - Decimal("1.28") * sigma_curr, 2),
        )
        curr_upper = round(curr_predicted + Decimal("1.28") * sigma_curr, 2)

    current_month_point = MonthlyForecastPoint(
        month=curr_month_str,
        month_label=get_month_label(curr_month_str),
        is_current_month=True,
        is_historical=False,
        actual_amount=total_curr_spent,
        predicted_amount=curr_predicted,
        lower_bound=curr_lower,
        upper_bound=curr_upper,
        fixed_commitments=curr_fixed,
        variable_estimate=curr_variable,
    )

    # --- 7. Future Horizon Forecast Points (1 to horizon_months) ---
    monthly_forecasts: list[MonthlyForecastPoint] = []
    # Include current month as the anchor point in the trajectory
    monthly_forecasts.append(current_month_point)

    for h in range(1, horizon_months + 1):
        fut_month_str = get_future_month_str(curr_year, curr_month, h)
        fut_var = max(Decimal("0.00"), round(baseline_variable + (Decimal(h) * damped_slope), 2))
        fut_fixed = monthly_fixed_commitment
        fut_predicted = fut_fixed + fut_var

        # Uncertainty widens with horizon: sqrt(1 + 0.25 * (h - 1))
        horizon_factor = Decimal(str(round(math.sqrt(1.0 + 0.25 * (h - 1)), 3)))
        sigma_h = volatility_sigma * horizon_factor
        fut_lower = max(fut_fixed, round(fut_predicted - Decimal("1.28") * sigma_h, 2))
        fut_upper = round(fut_predicted + Decimal("1.28") * sigma_h, 2)

        monthly_forecasts.append(
            MonthlyForecastPoint(
                month=fut_month_str,
                month_label=get_month_label(fut_month_str),
                is_current_month=False,
                is_historical=False,
                actual_amount=None,
                predicted_amount=fut_predicted,
                lower_bound=fut_lower,
                upper_bound=fut_upper,
                fixed_commitments=fut_fixed,
                variable_estimate=fut_var,
            )
        )

    # --- 8. Category-Level Forecasts (Targeting Next Month m+1) ---
    # Aggregate category discretionary average from historical months
    category_var_totals: dict[str, Decimal] = {}
    for h in valid_hist:
        for cat, amt in h["category_spending"].items():
            fixed_in_cat = recurring_by_category.get(cat, Decimal("0.00"))
            var_part = max(Decimal("0.00"), amt - fixed_in_cat)
            category_var_totals[cat] = category_var_totals.get(cat, Decimal("0.00")) + var_part

    # Average variable per category
    divisor = Decimal(max(1, history_months_count))
    category_estimates: dict[str, dict[str, Decimal]] = {}

    all_categories = sorted(set(category_var_totals.keys()) | set(recurring_by_category.keys()))
    for cat in all_categories:
        fixed_val = recurring_by_category.get(cat, Decimal("0.00"))
        var_val = round(category_var_totals.get(cat, Decimal("0.00")) / divisor, 2) if history_months_count > 0 else Decimal("0.00")
        total_cat = fixed_val + var_val
        if total_cat > Decimal("0.00"):
            category_estimates[cat] = {
                "predicted_amount": total_cat,
                "fixed_amount": fixed_val,
                "variable_amount": var_val,
            }

    # Calculate percentages
    total_cat_forecast = sum((c["predicted_amount"] for c in category_estimates.values()), Decimal("0.00"))
    category_forecast_items: list[CategoryForecastItem] = []
    for cat, vals in category_estimates.items():
        pct = (
            round(float(vals["predicted_amount"] / total_cat_forecast) * 100.0, 1)
            if total_cat_forecast > Decimal("0.00")
            else 0.0
        )
        category_forecast_items.append(
            CategoryForecastItem(
                category=cat,
                predicted_amount=vals["predicted_amount"],
                percentage=pct,
                fixed_amount=vals["fixed_amount"],
                variable_amount=vals["variable_amount"],
            )
        )

    category_forecast_items.sort(key=lambda x: x.predicted_amount, reverse=True)

    return ForecastSummaryResponse(
        horizon_months=horizon_months,
        reference_date=effective_ref_date,
        confidence_level=confidence_level,
        confidence_score=confidence_score,
        history_months_count=history_months_count,
        current_month_forecast=current_month_point,
        monthly_forecasts=monthly_forecasts,
        category_forecasts=category_forecast_items,
        methodology_notes=methodology_notes,
        limitations=limitations,
    )


@router.get(
    "/",
    response_model=ForecastSummaryResponse,
)
def get_forecast(
    horizon_months: int = Query(
        default=3,
        ge=1,
        le=6,
        description="Number of forward months to forecast (1 to 6)",
    ),
    ref_date: Optional[date] = Query(
        default=None,
        description="Optional reference date for deterministic testing",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ForecastSummaryResponse:
    """Retrieve financial forecasts with fixed commitments, trend projections, and uncertainty bounds."""
    return generate_financial_forecast(
        db=db,
        current_user=current_user,
        horizon_months=horizon_months,
        ref_date=ref_date,
    )

