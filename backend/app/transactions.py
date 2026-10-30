
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

router = APIRouter(prefix="/transactions", tags=["Transactions"])


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

    transaction = Transaction(
        user_id=current_user.id,
        transaction_date=transaction_data.transaction_date,
        description=transaction_data.description.strip(),
        amount=transaction_data.amount,
        transaction_type=transaction_data.transaction_type,
        category=transaction_data.category.strip(),
        predicted_category=None,
        prediction_confidence=None,
        is_reviewed=True,
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

    transaction.transaction_date = transaction_data.transaction_date
    transaction.description = transaction_data.description.strip()
    transaction.amount = transaction_data.amount
    transaction.transaction_type = transaction_data.transaction_type
    transaction.category = transaction_data.category.strip()
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
