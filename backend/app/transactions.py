
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth_dependencies import get_current_user
from app.dependencies import get_db
from app.models import Transaction, User
from app.schemas import (
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)
from ml.predict import predict_category

router = APIRouter(prefix="/transactions", tags=["Transactions"])


def _coerce_to_utc_datetime(d: date | datetime) -> datetime:
    """Coerce date or datetime to a timezone-aware UTC datetime."""
    if isinstance(d, datetime):
        if d.tzinfo is None:
            return d.replace(tzinfo=timezone.utc)
        return d.astimezone(timezone.utc)
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


@router.post(
    "/",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_transaction(
    transaction_data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    """Create a transaction for the authenticated user."""

    description = transaction_data.description.strip()

    if not description:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Transaction description cannot be empty.",
        )

    predicted_category = None
    prediction_confidence = None
    is_reviewed = transaction_data.category is not None

    if transaction_data.category is not None:
        # Preserve the category explicitly selected by the user.
        category = transaction_data.category.strip()

        if not category:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Category cannot be empty.",
            )
    else:
        # Suggest a category when the user did not provide one.
        try:
            prediction = predict_category(description)
            predicted_category = prediction["predicted_category"]
            prediction_confidence = prediction["confidence"]

            if prediction["needs_review"]:
                # Keep the suggestion separate until the user reviews it.
                category = "Other"
            else:
                category = predicted_category

        except (FileNotFoundError, ValueError):
            # Keep transaction creation available if the model is unavailable.
            category = "Other"

    transaction = Transaction(
        user_id=current_user.id,
        transaction_date=_coerce_to_utc_datetime(transaction_data.transaction_date),
        description=description,
        amount=transaction_data.amount,
        transaction_type=transaction_data.transaction_type,
        category=category,
        predicted_category=predicted_category,
        prediction_confidence=prediction_confidence,
        is_reviewed=is_reviewed,
    )

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    return transaction


@router.get("/", response_model=list[TransactionResponse])
def list_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Transaction]:
    """List transactions belonging only to the authenticated user."""

    statement = (
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(
            Transaction.transaction_date.desc(),
            Transaction.id.desc(),
        )
    )

    return list(db.scalars(statement).all())


@router.put(
    "/{transaction_id}",
    response_model=TransactionResponse,
)
def update_transaction(
    transaction_id: int,
    transaction_data: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    """Update a transaction belonging to the authenticated user."""

    statement = select(Transaction).where(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id,
    )
    transaction = db.scalar(statement)

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )

    description = transaction_data.description.strip()
    if not description:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Transaction description cannot be empty.",
        )

    category = transaction_data.category.strip()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Category cannot be empty.",
        )

    transaction.transaction_date = _coerce_to_utc_datetime(transaction_data.transaction_date)
    transaction.description = description
    transaction.amount = transaction_data.amount
    transaction.transaction_type = transaction_data.transaction_type
    transaction.category = category
    transaction.is_reviewed = True

    db.commit()
    db.refresh(transaction)

    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a transaction belonging to the authenticated user."""

    statement = select(Transaction).where(
        Transaction.id == transaction_id,
        Transaction.user_id == current_user.id,
    )
    transaction = db.scalar(statement)

    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )

    db.delete(transaction)
    db.commit()
