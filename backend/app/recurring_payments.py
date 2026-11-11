from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth_dependencies import get_current_user
from app.dependencies import get_db
from app.models import RecurringPayment, User
from app.timezone import get_current_ist_date
from app.schemas import (
    RecurringPaymentCreate,
    RecurringPaymentResponse,
    RecurringPaymentSummaryResponse,
    RecurringPaymentUpdate,
)

router = APIRouter(prefix="/recurring-payments", tags=["Recurring Payments"])

VALID_FREQUENCIES = {"weekly", "monthly", "quarterly", "yearly"}
VALID_STATUSES = {"active", "cancelled"}


def calculate_monthly_equivalent(amount: Decimal, frequency: str) -> Decimal:
    """Normalize payment amount to an approximate monthly expense commitment."""
    if frequency == "weekly":
        return round(amount * Decimal("52") / Decimal("12"), 2)
    elif frequency == "monthly":
        return amount
    elif frequency == "quarterly":
        return round(amount / Decimal("3"), 2)
    elif frequency == "yearly":
        return round(amount / Decimal("12"), 2)
    return amount


def to_response(payment: RecurringPayment, ref_date: date) -> RecurringPaymentResponse:
    """Decorate a RecurringPayment model instance with calculated overdue & days fields."""
    is_overdue = payment.status == "active" and payment.next_due_date < ref_date
    days_until_due = (payment.next_due_date - ref_date).days
    return RecurringPaymentResponse(
        id=payment.id,
        user_id=payment.user_id,
        description=payment.description,
        amount=payment.amount,
        category=payment.category,
        frequency=payment.frequency,
        start_date=payment.start_date,
        next_due_date=payment.next_due_date,
        status=payment.status,
        is_active=payment.is_active,
        is_overdue=is_overdue,
        days_until_due=days_until_due,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
    )


@router.post(
    "/",
    response_model=RecurringPaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_recurring_payment(
    payment_data: RecurringPaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringPaymentResponse:
    """Create a new recurring payment schedule for the authenticated user."""
    description = payment_data.description.strip()
    if not description:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Description cannot be empty.",
        )

    if payment_data.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Recurring payment amount must be greater than zero.",
        )

    category = payment_data.category.strip() if payment_data.category else "Other"
    if not category:
        category = "Other"

    if payment_data.frequency not in VALID_FREQUENCIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Frequency must be one of: {', '.join(sorted(VALID_FREQUENCIES))}.",
        )

    today = get_current_ist_date()
    start_date = payment_data.start_date or today
    next_due_date = payment_data.next_due_date or start_date

    payment = RecurringPayment(
        user_id=current_user.id,
        description=description,
        amount=payment_data.amount,
        category=category,
        frequency=payment_data.frequency,
        start_date=start_date,
        next_due_date=next_due_date,
        status="active",
        is_active=True,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return to_response(payment, today)


@router.get(
    "/",
    response_model=list[RecurringPaymentResponse],
)
def list_recurring_payments(
    status_filter: str | None = Query(default=None, alias="status"),
    category: str | None = Query(default=None),
    frequency: str | None = Query(default=None),
    ref_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RecurringPaymentResponse]:
    """List recurring payments belonging only to the authenticated user."""
    today = ref_date or get_current_ist_date()

    statement = select(RecurringPayment).where(RecurringPayment.user_id == current_user.id)

    if isinstance(status_filter, str) and status_filter.strip():
        val = status_filter.strip().lower()
        if val != "all":
            statement = statement.where(RecurringPayment.status == val)

    if isinstance(category, str) and category.strip():
        statement = statement.where(RecurringPayment.category == category.strip())

    if isinstance(frequency, str) and frequency.strip():
        statement = statement.where(RecurringPayment.frequency == frequency.strip().lower())

    statement = statement.order_by(RecurringPayment.next_due_date.asc(), RecurringPayment.id.asc())
    records = list(db.scalars(statement).all())

    return [to_response(r, today) for r in records]


@router.get(
    "/upcoming",
    response_model=list[RecurringPaymentResponse],
)
def get_upcoming_recurring_payments(
    days: int = Query(default=30, ge=1, le=365),
    ref_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RecurringPaymentResponse]:
    """Get upcoming active recurring payments due within the next N days."""
    today = ref_date or get_current_ist_date()
    cutoff_date = today + timedelta(days=days)

    statement = (
        select(RecurringPayment)
        .where(
            RecurringPayment.user_id == current_user.id,
            RecurringPayment.status == "active",
            RecurringPayment.next_due_date >= today,
            RecurringPayment.next_due_date <= cutoff_date,
        )
        .order_by(RecurringPayment.next_due_date.asc(), RecurringPayment.id.asc())
    )
    records = list(db.scalars(statement).all())
    return [to_response(r, today) for r in records]


@router.get(
    "/overdue",
    response_model=list[RecurringPaymentResponse],
)
def get_overdue_recurring_payments(
    ref_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RecurringPaymentResponse]:
    """Get active recurring payments that have passed their due date."""
    today = ref_date or get_current_ist_date()

    statement = (
        select(RecurringPayment)
        .where(
            RecurringPayment.user_id == current_user.id,
            RecurringPayment.status == "active",
            RecurringPayment.next_due_date < today,
        )
        .order_by(RecurringPayment.next_due_date.asc(), RecurringPayment.id.asc())
    )
    records = list(db.scalars(statement).all())
    return [to_response(r, today) for r in records]


@router.get(
    "/summary",
    response_model=RecurringPaymentSummaryResponse,
)
def get_recurring_payments_summary(
    days: int = Query(default=30, ge=1, le=365),
    ref_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringPaymentSummaryResponse:
    """Provide summary metrics: active commitments, upcoming bills, and overdue payments."""
    today = ref_date or get_current_ist_date()
    cutoff_date = today + timedelta(days=days)

    statement = (
        select(RecurringPayment)
        .where(RecurringPayment.user_id == current_user.id)
        .order_by(RecurringPayment.next_due_date.asc(), RecurringPayment.id.asc())
    )
    records = list(db.scalars(statement).all())

    active_records = [r for r in records if r.status == "active"]
    total_monthly = sum(
        (calculate_monthly_equivalent(r.amount, r.frequency) for r in active_records),
        Decimal("0.00"),
    )

    upcoming_records = [
        r for r in active_records if today <= r.next_due_date <= cutoff_date
    ]
    upcoming_total = sum((r.amount for r in upcoming_records), Decimal("0.00"))

    overdue_records = [r for r in active_records if r.next_due_date < today]
    overdue_total = sum((r.amount for r in overdue_records), Decimal("0.00"))

    return RecurringPaymentSummaryResponse(
        total_active_count=len(active_records),
        total_monthly_commitment=total_monthly,
        upcoming_count=len(upcoming_records),
        upcoming_total=upcoming_total,
        overdue_count=len(overdue_records),
        overdue_total=overdue_total,
        upcoming_items=[to_response(r, today) for r in upcoming_records],
        overdue_items=[to_response(r, today) for r in overdue_records],
    )


@router.get(
    "/{payment_id}",
    response_model=RecurringPaymentResponse,
)
def get_recurring_payment(
    payment_id: int,
    ref_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringPaymentResponse:
    """Retrieve a single recurring payment belonging to the authenticated user."""
    today = ref_date or get_current_ist_date()
    payment = db.scalar(
        select(RecurringPayment).where(
            RecurringPayment.id == payment_id,
            RecurringPayment.user_id == current_user.id,
        )
    )
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring payment not found.",
        )
    return to_response(payment, today)


@router.put(
    "/{payment_id}",
    response_model=RecurringPaymentResponse,
)
def update_recurring_payment(
    payment_id: int,
    payment_data: RecurringPaymentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringPaymentResponse:
    """Update details of an existing recurring payment schedule."""
    payment = db.scalar(
        select(RecurringPayment).where(
            RecurringPayment.id == payment_id,
            RecurringPayment.user_id == current_user.id,
        )
    )
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring payment not found.",
        )

    if payment_data.description is not None:
        desc = payment_data.description.strip()
        if not desc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Description cannot be empty.",
            )
        payment.description = desc

    if payment_data.amount is not None:
        if payment_data.amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Recurring payment amount must be greater than zero.",
            )
        payment.amount = payment_data.amount

    if payment_data.category is not None:
        cat = payment_data.category.strip()
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Category cannot be empty.",
            )
        payment.category = cat

    if payment_data.frequency is not None:
        if payment_data.frequency not in VALID_FREQUENCIES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Frequency must be one of: {', '.join(sorted(VALID_FREQUENCIES))}.",
            )
        payment.frequency = payment_data.frequency

    if payment_data.start_date is not None:
        payment.start_date = payment_data.start_date

    if payment_data.next_due_date is not None:
        payment.next_due_date = payment_data.next_due_date

    if payment_data.status is not None:
        if payment_data.status not in VALID_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Status must be one of: {', '.join(sorted(VALID_STATUSES))}.",
            )
        payment.status = payment_data.status
        payment.is_active = payment_data.status == "active"

    db.commit()
    db.refresh(payment)
    today = get_current_ist_date()
    return to_response(payment, today)


@router.patch(
    "/{payment_id}/cancel",
    response_model=RecurringPaymentResponse,
)
@router.post(
    "/{payment_id}/cancel",
    response_model=RecurringPaymentResponse,
)
def cancel_recurring_payment(
    payment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringPaymentResponse:
    """Cancel a recurring payment schedule without deleting its historical record."""
    payment = db.scalar(
        select(RecurringPayment).where(
            RecurringPayment.id == payment_id,
            RecurringPayment.user_id == current_user.id,
        )
    )
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring payment not found.",
        )

    payment.status = "cancelled"
    payment.is_active = False

    db.commit()
    db.refresh(payment)
    today = get_current_ist_date()
    return to_response(payment, today)


@router.delete(
    "/{payment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_recurring_payment(
    payment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a recurring payment record belonging to the authenticated user."""
    payment = db.scalar(
        select(RecurringPayment).where(
            RecurringPayment.id == payment_id,
            RecurringPayment.user_id == current_user.id,
        )
    )
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring payment not found.",
        )

    db.delete(payment)
    db.commit()

