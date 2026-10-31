

from datetime import datetime, time, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth_dependencies import get_current_user
from app.dependencies import get_db
from app.models import StatementImport, Transaction, User
from app.schemas import StatementImportResponse, StatementPreviewResponse
from app.statement_import import (
    build_statement_preview,
    preview_statement,
    read_statement_file,
)


router = APIRouter(prefix="/statements", tags=["Statements"])


@router.post("/preview", response_model=StatementPreviewResponse)
async def preview_uploaded_statement(
    upload: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> StatementPreviewResponse:
    """Preview and validate a statement without saving transactions."""
    return await preview_statement(upload)


@router.post("/import")
async def import_statement(
    upload: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Validate a statement and import valid, non-duplicate transactions."""
    filename = Path(upload.filename or "statement.csv").name[:255]
    content = await upload.read()

    # Validate and parse the file before writing anything to the database.
    dataframe = read_statement_file(filename, content)
    preview = build_statement_preview(filename, dataframe)

    # Build duplicate keys for this user's existing transactions.
    existing_transactions = db.scalars(
        select(Transaction).where(
            Transaction.user_id == current_user.id
        )
    ).all()

    def transaction_key(
        transaction_date,
        description,
        amount,
        transaction_type,
        category,
    ):
        return (
            transaction_date,
            description.strip().casefold(),
            amount,
            transaction_type,
            category.strip().casefold(),
        )

    seen = {
        transaction_key(
            transaction.transaction_date.date(),
            transaction.description,
            transaction.amount,
            transaction.transaction_type,
            transaction.category,
        )
        for transaction in existing_transactions
    }

    imported_count = 0
    rejected_count = 0

    import_record = StatementImport(
        user_id=current_user.id,
        filename=filename,
        status="processing",
        rows_total=preview.total_rows,
        rows_imported=0,
        rows_rejected=0,
    )
    db.add(import_record)

    try:
        for row in preview.preview:
            if not row.is_valid:
                rejected_count += 1
                continue

            key = transaction_key(
                row.transaction_date,
                row.description,
                row.amount,
                row.transaction_type,
                row.category,
            )

            # Skip duplicates already in the database or this file.
            if key in seen:
                rejected_count += 1
                continue

            transaction = Transaction(
                user_id=current_user.id,
                transaction_date=datetime.combine(
                    row.transaction_date,
                    time.min,
                    tzinfo=timezone.utc,
                ),
                description=row.description,
                amount=row.amount,
                transaction_type=row.transaction_type,
                category=row.category,
                is_reviewed=False,
            )
            db.add(transaction)
            seen.add(key)
            imported_count += 1

        import_record.rows_imported = imported_count
        import_record.rows_rejected = rejected_count
        import_record.status = (
            "completed_with_errors"
            if rejected_count
            else "completed"
        )

        db.commit()
        db.refresh(import_record)

    except Exception:
        db.rollback()
        raise

    return {
        "message": "Statement import completed.",
        "import_id": import_record.id,
        "filename": filename,
        "status": import_record.status,
        "total_rows": preview.total_rows,
        "imported_rows": imported_count,
        "rejected_rows": rejected_count,
    }


@router.get("/history", response_model=list[StatementImportResponse])
def get_statement_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[StatementImportResponse]:
    """Return statement import history for the authenticated user."""
    statement_imports = db.scalars(
        select(StatementImport)
        .where(StatementImport.user_id == current_user.id)
        .order_by(StatementImport.created_at.desc(), StatementImport.id.desc())
    ).all()

    return statement_imports
