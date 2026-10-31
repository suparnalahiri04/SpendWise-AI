
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path

import pandas as pd
from fastapi import HTTPException, UploadFile, status

from app.schemas import StatementPreviewRow, StatementPreviewResponse


ALLOWED_EXTENSIONS = {".csv", ".xlsx"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_ROWS = 10_000


def normalize_column_name(name: object) -> str:
    """Normalize column names for flexible matching."""
    return str(name).strip().lower().replace(" ", "_")




def parse_date(value: object):
    """Parse dates safely without warnings for ISO-formatted dates."""
    if pd.isna(value):
        return None

    if isinstance(value, (pd.Timestamp,)):
        return value.date()

    text = str(value).strip()

    # Handle YYYY-MM-DD dates explicitly.
    if len(text) >= 10 and text[4:5] == "-" and text[7:8] == "-":
        parsed = pd.to_datetime(text, format="%Y-%m-%d", errors="coerce")
    else:
        parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)

    if pd.isna(parsed):
        return None

    return parsed.date()




def parse_amount(value: object):
    """Parse a positive transaction amount."""
    if pd.isna(value):
        return None

    cleaned = str(value).strip().replace(",", "").replace("₹", "").replace("$", "")

    # Support amounts written as (500.00) to indicate a negative value.
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]

    try:
        amount = Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None

    if not amount.is_finite() or amount <= 0:
        return None

    try:
        return amount.quantize(Decimal("0.01"))
    except InvalidOperation:
        return None


def read_statement_file(filename: str, content: bytes) -> pd.DataFrame:
    """Read a supported statement file into a DataFrame."""
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Upload a CSV or XLSX file.",
        )

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds the 5 MB upload limit.",
        )

    try:
        if extension == ".csv":
            dataframe = pd.read_csv(BytesIO(content))
        else:
            dataframe = pd.read_excel(BytesIO(content), engine="openpyxl")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read the file. Check that it is a valid CSV or XLSX file.",
        ) from None

    if dataframe.empty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The file contains no transaction rows.",
        )

    if len(dataframe) > MAX_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The file exceeds the {MAX_ROWS:,}-row limit.",
        )

    dataframe.columns = [
        normalize_column_name(column) for column in dataframe.columns
    ]

    if len(set(dataframe.columns)) != len(dataframe.columns):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The file contains duplicate column names.",
        )

    return dataframe


def build_statement_preview(
    filename: str,
    dataframe: pd.DataFrame,
) -> StatementPreviewResponse:
    """Validate transaction rows and return a preview without saving them."""
    aliases = {
        "date": "date",
        "transaction_date": "date",
        "description": "description",
        "narration": "description",
        "details": "description",
        "particulars": "description",
        "amount": "amount",
        "transaction_type": "transaction_type",
        "type": "transaction_type",
        "category": "category",
    }

    rename_map = {
        column: aliases[column]
        for column in dataframe.columns
        if column in aliases
    }
    dataframe = dataframe.rename(columns=rename_map)

    required_columns = {"date", "description", "amount"}
    missing_columns = required_columns - set(dataframe.columns)

    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Missing required columns: "
                + ", ".join(sorted(missing_columns))
                + ". Required: date, description, amount."
            ),
        )

    preview_rows = []

    for index, record in enumerate(
        dataframe.to_dict(orient="records"), start=2
    ):
        errors = []

        transaction_date = parse_date(record.get("date"))
        description_value = record.get("description")
        description = (
            str(description_value).strip()
            if not pd.isna(description_value)
            else ""
        )
        amount = parse_amount(record.get("amount"))

        if transaction_date is None:
            errors.append("Invalid or missing transaction date.")

        if not description or description.lower() == "nan":
            errors.append("Missing transaction description.")
            description = None
        elif len(description) > 500:
            errors.append("Description exceeds 500 characters.")

        if amount is None:
            errors.append("Invalid amount; enter a positive number.")

        raw_type = record.get("transaction_type")
        transaction_type = None

        if raw_type is not None and not pd.isna(raw_type):
            normalized_type = str(raw_type).strip().lower()

            if normalized_type in {"income", "credit", "cr"}:
                transaction_type = "income"
            elif normalized_type in {"expense", "debit", "dr"}:
                transaction_type = "expense"
            else:
                errors.append("Transaction type must be income or expense.")
        elif amount is not None:
            errors.append(
                "Transaction type is missing. Add an income/expense column."
            )

        category_value = record.get("category", "Other")
        category = (
            str(category_value).strip()
            if not pd.isna(category_value)
            else "Other"
        )
        if not category or category.lower() == "nan":
            category = "Other"
        if len(category) > 100:
            errors.append("Category exceeds 100 characters.")
            category = category[:100]

        preview_rows.append(
            StatementPreviewRow(
                row_number=index,
                transaction_date=transaction_date,
                description=description,
                amount=amount,
                transaction_type=transaction_type,
                category=category,
                is_valid=len(errors) == 0,
                errors=errors,
            )
        )

    valid_count = sum(row.is_valid for row in preview_rows)

    return StatementPreviewResponse(
        filename=filename,
        total_rows=len(preview_rows),
        valid_rows=valid_count,
        invalid_rows=len(preview_rows) - valid_count,
        preview=preview_rows,
    )


async def preview_statement(upload: UploadFile) -> StatementPreviewResponse:
    """Read and validate an uploaded statement without database writes."""
    filename = upload.filename or "statement.csv"
    content = await upload.read()

    dataframe = read_statement_file(filename, content)

    return build_statement_preview(filename, dataframe)
