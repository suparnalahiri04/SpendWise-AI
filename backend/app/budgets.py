from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth_dependencies import get_current_user
from app.dependencies import get_db
from app.models import Budget, Transaction, User
from app.schemas import (
    BudgetCreate,
    BudgetProgressItem,
    BudgetProgressSummaryResponse,
    BudgetResponse,
    BudgetUpdate,
)

router = APIRouter(prefix="/budgets", tags=["Budgets"])


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


@router.post(
    "/",
    response_model=BudgetResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_budget(
    budget_data: BudgetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Budget:
    """Create a monthly spending budget for the authenticated user."""
    category = budget_data.category.strip()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Budget category cannot be empty.",
        )

    if budget_data.limit_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Budget limit amount must be greater than zero.",
        )

    # Check for duplicate budget for this user, category, and month.
    existing = db.scalar(
        select(Budget).where(
            Budget.user_id == current_user.id,
            func.lower(func.trim(Budget.category)) == category.casefold(),
            Budget.month == budget_data.month,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A budget for '{category}' in {budget_data.month} already exists.",
        )

    budget = Budget(
        user_id=current_user.id,
        category=category,
        month=budget_data.month,
        limit_amount=budget_data.limit_amount,
    )
    db.add(budget)

    try:
        db.commit()
        db.refresh(budget)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A budget for '{category}' in {budget_data.month} already exists.",
        ) from None

    return budget


@router.get(
    "/",
    response_model=list[BudgetResponse],
)
def list_budgets(
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Budget]:
    """List budgets belonging only to the authenticated user, optionally filtered by month."""
    statement = select(Budget).where(Budget.user_id == current_user.id)
    if isinstance(month, str) and month.strip():
        statement = statement.where(Budget.month == month.strip())

    statement = statement.order_by(Budget.month.desc(), Budget.category.asc())
    return list(db.scalars(statement).all())


@router.get(
    "/progress",
    response_model=BudgetProgressSummaryResponse,
)
def get_budget_progress(
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetProgressSummaryResponse:
    """Calculate actual expenses against monthly budgets for the authenticated user.

    Only expense transactions are counted; income transactions are strictly excluded.
    """
    if isinstance(month, str) and month.strip():
        selected_month = month.strip()
    else:
        selected_month = datetime.now(timezone.utc).strftime("%Y-%m")
    start_dt, end_dt = get_month_datetime_range(selected_month)

    budgets = list(
        db.scalars(
            select(Budget)
            .where(Budget.user_id == current_user.id, Budget.month == selected_month)
            .order_by(Budget.category.asc())
        ).all()
    )

    spending_stmt = (
        select(
            func.lower(func.trim(Transaction.category)).label("cat"),
            func.coalesce(func.sum(Transaction.amount), Decimal("0.00")).label("spent"),
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.transaction_type == "expense",
            Transaction.transaction_date >= start_dt,
            Transaction.transaction_date < end_dt,
        )
        .group_by(func.lower(func.trim(Transaction.category)))
    )
    spent_map = {row.cat: row.spent for row in db.execute(spending_stmt).all()}

    items: list[BudgetProgressItem] = []
    total_budgeted = Decimal("0.00")
    total_spent = Decimal("0.00")

    for b in budgets:
        cat_key = b.category.strip().casefold()
        spent = spent_map.get(cat_key, Decimal("0.00"))
        limit = b.limit_amount
        remaining = limit - spent
        pct = round(float(spent / limit) * 100, 2) if limit > 0 else 0.0
        is_exceeded = spent > limit

        items.append(
            BudgetProgressItem(
                id=b.id,
                category=b.category,
                month=b.month,
                limit_amount=limit,
                spent_amount=spent,
                remaining_amount=remaining,
                percentage_used=pct,
                is_exceeded=is_exceeded,
            )
        )
        total_budgeted += limit
        total_spent += spent

    total_remaining = total_budgeted - total_spent

    return BudgetProgressSummaryResponse(
        month=selected_month,
        total_budgeted=total_budgeted,
        total_spent=total_spent,
        total_remaining=total_remaining,
        items=items,
    )


@router.get(
    "/{budget_id}",
    response_model=BudgetResponse,
)
def get_budget(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Budget:
    """Get a single budget belonging to the authenticated user."""
    budget = db.scalar(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.user_id == current_user.id,
        )
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )
    return budget


@router.get(
    "/{budget_id}/progress",
    response_model=BudgetProgressItem,
)
def get_single_budget_progress(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetProgressItem:
    """Get spending progress for a single budget belonging to the authenticated user."""
    budget = db.scalar(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.user_id == current_user.id,
        )
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )

    start_dt, end_dt = get_month_datetime_range(budget.month)

    spending_stmt = (
        select(func.coalesce(func.sum(Transaction.amount), Decimal("0.00")))
        .where(
            Transaction.user_id == current_user.id,
            Transaction.transaction_type == "expense",
            func.lower(func.trim(Transaction.category)) == budget.category.strip().casefold(),
            Transaction.transaction_date >= start_dt,
            Transaction.transaction_date < end_dt,
        )
    )
    spent = db.scalar(spending_stmt) or Decimal("0.00")
    limit = budget.limit_amount
    remaining = limit - spent
    pct = round(float(spent / limit) * 100, 2) if limit > 0 else 0.0
    is_exceeded = spent > limit

    return BudgetProgressItem(
        id=budget.id,
        category=budget.category,
        month=budget.month,
        limit_amount=limit,
        spent_amount=spent,
        remaining_amount=remaining,
        percentage_used=pct,
        is_exceeded=is_exceeded,
    )


@router.put(
    "/{budget_id}",
    response_model=BudgetResponse,
)
def update_budget(
    budget_id: int,
    budget_data: BudgetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Budget:
    """Update a budget belonging to the authenticated user."""
    budget = db.scalar(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.user_id == current_user.id,
        )
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )

    if budget_data.limit_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Budget limit amount must be greater than zero.",
        )

    new_cat = budget_data.category.strip() if budget_data.category is not None else budget.category
    new_month = budget_data.month if budget_data.month is not None else budget.month

    if not new_cat:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Budget category cannot be empty.",
        )

    # Check for conflict if category or month is changing
    if new_cat.casefold() != budget.category.casefold() or new_month != budget.month:
        conflict = db.scalar(
            select(Budget).where(
                Budget.user_id == current_user.id,
                Budget.id != budget_id,
                func.lower(func.trim(Budget.category)) == new_cat.casefold(),
                Budget.month == new_month,
            )
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A budget for '{new_cat}' in {new_month} already exists.",
            )

    budget.category = new_cat
    budget.month = new_month
    budget.limit_amount = budget_data.limit_amount

    try:
        db.commit()
        db.refresh(budget)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A budget for '{new_cat}' in {new_month} already exists.",
        ) from None

    return budget


@router.delete(
    "/{budget_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_budget(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a budget belonging to the authenticated user."""
    budget = db.scalar(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.user_id == current_user.id,
        )
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )

    db.delete(budget)
    db.commit()
