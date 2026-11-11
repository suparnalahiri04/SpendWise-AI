from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth_dependencies import get_current_user
from app.budgets import classify_budget_status, get_month_datetime_range
from app.dependencies import get_db
from app.timezone import get_current_ist_date
from app.insights import (
    MIN_ANOMALY_BASELINE_COUNT,
    check_transaction_anomaly,
    format_anomaly_description,
)
from app.models import AlertDismissal, Budget, RecurringPayment, Transaction, User
from app.schemas import (
    AlertDismissAllResponse,
    AlertDismissResponse,
    AlertItem,
    AlertListResponse,
)

router = APIRouter(prefix="/alerts", tags=["Smart Financial Alerts"])


def generate_budget_alerts(
    user_id: int,
    db: Session,
    ref_date: date,
) -> list[AlertItem]:
    """Generate budget warnings (80% to 99.9%) and budget-exceeded alerts (>= 100%)

    for active budgets in the reference date's calendar month.
    Key includes the tier so dismissing a warning cannot suppress an escalation.
    """
    alerts: list[AlertItem] = []
    month_str = ref_date.strftime("%Y-%m")
    start_dt, end_dt = get_month_datetime_range(month_str)

    budgets = list(
        db.scalars(
            select(Budget)
            .where(Budget.user_id == user_id, Budget.month == month_str)
            .order_by(Budget.category.asc())
        ).all()
    )

    if not budgets:
        return alerts

    spending_stmt = (
        select(
            func.lower(func.trim(Transaction.category)).label("cat"),
            func.coalesce(func.sum(Transaction.amount), Decimal("0.00")).label("spent"),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.transaction_type == "expense",
            Transaction.transaction_date >= start_dt,
            Transaction.transaction_date < end_dt,
        )
        .group_by(func.lower(func.trim(Transaction.category)))
    )
    spent_map = {row.cat: row.spent for row in db.execute(spending_stmt).all()}

    created_dt = datetime.combine(ref_date, datetime.min.time(), tzinfo=timezone.utc)

    for b in budgets:
        if b.limit_amount <= Decimal("0.00"):
            continue

        cat_key = b.category.strip().casefold()
        spent = spent_map.get(cat_key, Decimal("0.00"))
        limit = b.limit_amount
        pct_used = round(float(spent / limit) * 100, 2)
        status = classify_budget_status(spent, limit)

        if status in ("over_budget", "limit_reached"):
            key = f"budget:{b.id}:{month_str}:critical"
            is_limit_reached = status == "limit_reached"
            title = (
                f"Budget Limit Reached: {b.category}"
                if is_limit_reached
                else f"Budget Exceeded: {b.category}"
            )
            message = (
                f"You have reached 100.0% of your {b.category} budget "
                f"(₹{spent:,.2f} of ₹{limit:,.2f})."
                if is_limit_reached
                else (
                    f"You have spent ₹{spent:,.2f} of your ₹{limit:,.2f} "
                    f"budget for {b.category} ({pct_used:.1f}% used)."
                )
            )
            alerts.append(
                AlertItem(
                    id=key,
                    alert_type="budget_exceeded",
                    severity="critical",
                    title=title,
                    message=message,
                    created_at=created_dt,
                    link_to="/budgets",
                    metadata={
                        "budget_id": b.id,
                        "category": b.category,
                        "month": b.month,
                        "limit_amount": float(limit),
                        "spent_amount": float(spent),
                        "percentage_used": pct_used,
                        "status": status,
                        "tier": "critical",
                    },
                )
            )
        elif status == "approaching_limit":
            key = f"budget:{b.id}:{month_str}:warning"
            alerts.append(
                AlertItem(
                    id=key,
                    alert_type="budget_warning",
                    severity="warning",
                    title=f"Approaching Budget Limit: {b.category}",
                    message=(
                        f"You have spent ₹{spent:,.2f} of your ₹{limit:,.2f} "
                        f"budget for {b.category} ({pct_used:.1f}% used)."
                    ),
                    created_at=created_dt,
                    link_to="/budgets",
                    metadata={
                        "budget_id": b.id,
                        "category": b.category,
                        "month": b.month,
                        "limit_amount": float(limit),
                        "spent_amount": float(spent),
                        "percentage_used": pct_used,
                        "status": status,
                        "tier": "warning",
                    },
                )
            )

    return alerts


def generate_recurring_alerts(
    user_id: int,
    db: Session,
    ref_date: date,
) -> list[AlertItem]:
    """Generate upcoming active recurring-payment reminders (due from today through 3 days ahead)

    and overdue active recurring-payment alerts (due before today).
    Cancelled, paused, or inactive schedules are strictly ignored.
    """
    alerts: list[AlertItem] = []

    recurring_payments = list(
        db.scalars(
            select(RecurringPayment)
            .where(
                RecurringPayment.user_id == user_id,
                RecurringPayment.status == "active",
                RecurringPayment.is_active == True,
            )
            .order_by(RecurringPayment.next_due_date.asc())
        ).all()
    )

    three_days_ahead = ref_date + timedelta(days=3)

    for r in recurring_payments:
        due_date = r.next_due_date.date() if isinstance(r.next_due_date, datetime) else r.next_due_date
        created_dt = datetime.combine(due_date, datetime.min.time(), tzinfo=timezone.utc)

        if due_date < ref_date:
            days_overdue = (ref_date - due_date).days
            day_str = f"{days_overdue} day{'s' if days_overdue != 1 else ''} overdue"
            key = f"recurring_overdue:{r.id}:{due_date.isoformat()}"
            alerts.append(
                AlertItem(
                    id=key,
                    alert_type="recurring_overdue",
                    severity="critical",
                    title=f"Overdue Payment: {r.description}",
                    message=(
                        f"Scheduled {r.frequency} payment of ₹{r.amount:,.2f} for {r.description} "
                        f"was due on {due_date.strftime('%Y-%m-%d')} ({day_str})."
                    ),
                    created_at=created_dt,
                    link_to="/recurring",
                    metadata={
                        "recurring_payment_id": r.id,
                        "description": r.description,
                        "amount": float(r.amount),
                        "category": r.category,
                        "frequency": r.frequency,
                        "next_due_date": due_date.isoformat(),
                        "days_overdue": days_overdue,
                    },
                )
            )
        elif ref_date <= due_date <= three_days_ahead:
            days_until = (due_date - ref_date).days
            if days_until == 0:
                day_str = "due today"
            elif days_until == 1:
                day_str = "due tomorrow"
            else:
                day_str = f"due in {days_until} days"

            key = f"recurring_upcoming:{r.id}:{due_date.isoformat()}"
            alerts.append(
                AlertItem(
                    id=key,
                    alert_type="recurring_upcoming",
                    severity="info",
                    title=f"Upcoming Payment: {r.description}",
                    message=(
                        f"Scheduled {r.frequency} payment of ₹{r.amount:,.2f} for {r.description} "
                        f"is {day_str} on {due_date.strftime('%Y-%m-%d')}."
                    ),
                    created_at=created_dt,
                    link_to="/recurring",
                    metadata={
                        "recurring_payment_id": r.id,
                        "description": r.description,
                        "amount": float(r.amount),
                        "category": r.category,
                        "frequency": r.frequency,
                        "next_due_date": due_date.isoformat(),
                        "days_until_due": days_until,
                    },
                )
            )

    return alerts


def generate_anomaly_alerts(
    user_id: int,
    db: Session,
    ref_date: date,
) -> list[AlertItem]:
    """Detect unusual spending in recent expense transactions using shared anomaly-detection logic

    from app.insights.

    Architectural Window Distinction:
    - Insights Page: Evaluates all expenses across the entire user-selected calendar month (curr_txs)
      for retrospective monthly reporting.
    - Alerts System: Intentionally evaluates only recent expenses from a rolling 7-calendar-day window
      (ref_date - 7 days <= tx_date <= ref_date) to provide timely, actionable notifications without
      alerting on stale historical transactions.

    Statistical threshold criteria and message formatting are strictly shared with app.insights
    via check_transaction_anomaly and format_anomaly_description.
    """
    alerts: list[AlertItem] = []

    start_recent_dt = datetime.combine(ref_date - timedelta(days=7), datetime.min.time(), tzinfo=timezone.utc)
    end_ref_dt = datetime.combine(ref_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)

    # Candidate transactions in recent window
    candidates = list(
        db.scalars(
            select(Transaction)
            .where(
                Transaction.user_id == user_id,
                Transaction.transaction_type == "expense",
                Transaction.transaction_date >= start_recent_dt,
                Transaction.transaction_date < end_ref_dt,
            )
            .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
        ).all()
    )

    if not candidates:
        return alerts

    # Historical expenses for user up to reference date to build category baselines
    history_txs = list(
        db.scalars(
            select(Transaction)
            .where(
                Transaction.user_id == user_id,
                Transaction.transaction_type == "expense",
                Transaction.transaction_date < end_ref_dt,
            )
        ).all()
    )

    history_by_cat: dict[str, list[Transaction]] = {}
    for t in history_txs:
        cat = (t.category or "").strip() or "Other"
        history_by_cat.setdefault(cat, []).append(t)

    for tx in candidates:
        tx_date = tx.transaction_date.date() if isinstance(tx.transaction_date, datetime) else tx.transaction_date
        if tx_date > ref_date:
            continue

        cat = (tx.category or "").strip() or "Other"
        cat_history = [
            t for t in history_by_cat.get(cat, [])
            if (t.id != tx.id if (t.id is not None and tx.id is not None) else t is not tx)
        ]

        # Reuse shared statistical outlier check from app.insights
        is_outlier, mean_val, std_dev, z_score = check_transaction_anomaly(tx, cat_history)

        if is_outlier:
            key = f"anomaly:{tx.id}"
            date_str = tx_date.strftime("%Y-%m-%d")
            mean_dec = Decimal(str(round(mean_val, 2)))

            # Reuse shared human-readable description formatting from app.insights
            desc = format_anomaly_description(
                amount=tx.amount,
                date_str=date_str,
                category=cat,
                mean_dec=mean_dec,
                std_dev=std_dev,
                z_score=z_score,
            )

            created_dt = (
                tx.transaction_date
                if isinstance(tx.transaction_date, datetime)
                else datetime.combine(tx.transaction_date, datetime.min.time(), tzinfo=timezone.utc)
            )

            alerts.append(
                AlertItem(
                    id=key,
                    alert_type="spending_anomaly",
                    severity="warning",
                    title=f"Unusual Expense in {cat}",
                    message=desc,
                    created_at=created_dt,
                    link_to="/transactions",
                    metadata={
                        "transaction_id": tx.id,
                        "amount": float(tx.amount),
                        "category": cat,
                        "transaction_date": date_str,
                        "mean": float(mean_dec),
                        "z_score": round(z_score, 2) if std_dev > 0.0 else None,
                    },
                )
            )

    return alerts


def get_active_alerts(
    user_id: int,
    db: Session,
    ref_date: Optional[date] = None,
) -> list[AlertItem]:
    """Generate all qualified financial alerts and filter out previously dismissed ones for user_id.

    Returns alerts sorted by severity (critical, warning, info) and urgency.
    """
    effective_date = ref_date or get_current_ist_date()

    all_alerts: list[AlertItem] = []
    all_alerts.extend(generate_budget_alerts(user_id=user_id, db=db, ref_date=effective_date))
    all_alerts.extend(generate_recurring_alerts(user_id=user_id, db=db, ref_date=effective_date))
    all_alerts.extend(generate_anomaly_alerts(user_id=user_id, db=db, ref_date=effective_date))

    # Query persistent dismissals strictly for this user
    dismissed_keys = set(
        db.scalars(
            select(AlertDismissal.alert_key).where(AlertDismissal.user_id == user_id)
        ).all()
    )

    active_alerts = [a for a in all_alerts if a.id not in dismissed_keys]

    # Predictable ordering: critical first, then warning, then info
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    active_alerts.sort(
        key=lambda a: (
            severity_order.get(a.severity, 3),
            -a.metadata.get("percentage_used", 0),
            -a.metadata.get("days_overdue", 0),
            a.metadata.get("days_until_due", 999),
            -a.metadata.get("amount", 0),
        )
    )

    return active_alerts


@router.get("/", response_model=AlertListResponse)
def list_alerts(
    ref_date: Optional[date] = Query(default=None, description="Optional reference date for deterministic testing"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AlertListResponse:
    """Retrieve all active, non-dismissed financial alerts for the current authenticated user."""
    active_alerts = get_active_alerts(user_id=current_user.id, db=db, ref_date=ref_date)
    return AlertListResponse(
        alert_count=len(active_alerts),
        active_count=len(active_alerts),
        alerts=active_alerts,
    )


@router.post("/{alert_key}/dismiss", response_model=AlertDismissResponse)
def dismiss_alert(
    alert_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AlertDismissResponse:
    """Dismiss an individual alert for the current authenticated user.

    Safe and idempotent on repeated dismissals.
    """
    key = alert_key.strip()
    if not key or len(key) > 128:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid alert key.",
        )

    existing = db.scalar(
        select(AlertDismissal).where(
            AlertDismissal.user_id == current_user.id,
            AlertDismissal.alert_key == key,
        )
    )
    if not existing:
        dismissal = AlertDismissal(user_id=current_user.id, alert_key=key)
        db.add(dismissal)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()

    return AlertDismissResponse(
        success=True,
        alert_key=key,
        message="Alert dismissed successfully.",
    )


@router.post("/dismiss-all", response_model=AlertDismissAllResponse)
def dismiss_all_alerts(
    ref_date: Optional[date] = Query(default=None, description="Optional reference date for deterministic testing"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AlertDismissAllResponse:
    """Dismiss all currently active alerts for the current authenticated user."""
    active_alerts = get_active_alerts(user_id=current_user.id, db=db, ref_date=ref_date)
    dismissed_count = 0

    for a in active_alerts:
        dismissal = AlertDismissal(user_id=current_user.id, alert_key=a.id)
        db.add(dismissal)
        dismissed_count += 1

    if dismissed_count > 0:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()

    return AlertDismissAllResponse(
        success=True,
        dismissed_count=dismissed_count,
        message=f"Dismissed {dismissed_count} alerts.",
    )

