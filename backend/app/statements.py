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
    read_bounded_upload_bytes,
    read_statement_file,
    transaction_dedup_key,
)


router = APIRouter(prefix="/statements", tags=["Statements"])


def _load_existing_dedup_keys(db: Session, user_id: int) -> set:
    existing_transactions = db.scalars(
        select(Transaction).where(Transaction.user_id == user_id)
    ).all()
    return {
        transaction_dedup_key(
            transaction.transaction_date,
            transaction.description,
            transaction.amount,
            transaction.transaction_type,
        )
        for transaction in existing_transactions
    }


@router.post("/preview", response_model=StatementPreviewResponse)
async def preview_uploaded_statement(
    upload: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StatementPreviewResponse:
    """Preview and validate a statement without saving transactions."""
    existing_keys = (
        _load_existing_dedup_keys(db, current_user.id)
        if isinstance(db, Session)
        else None
    )
    return await preview_statement(upload, existing_keys=existing_keys)


@router.post("/import")
async def import_statement(
    upload: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Validate a statement and import valid, non-duplicate transactions."""
    filename, content = await read_bounded_upload_bytes(upload)

    # Validate and parse the file before writing anything to the database.
    dataframe = read_statement_file(filename, content)
    preview = build_statement_preview(filename, dataframe)

    seen = _load_existing_dedup_keys(db, current_user.id)

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
            if row.is_status_excluded or not row.is_valid:
                rejected_count += 1
                continue

            key = transaction_dedup_key(
                row.transaction_date,
                row.description,
                row.amount,
                row.transaction_type,
            )

            # Skip duplicates already in the database or earlier in this file.
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
                description=row.description.replace("\x00", ""),
                amount=row.amount,
                transaction_type=row.transaction_type,
                category=row.category.replace("\x00", ""),
                predicted_category=row.predicted_category,
                prediction_confidence=row.prediction_confidence,
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
