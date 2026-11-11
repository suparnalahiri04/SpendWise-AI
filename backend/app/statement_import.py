from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO, StringIO
import logging
import math
from pathlib import Path
import re
from typing import Literal
import warnings
import zipfile

import pandas as pd
from fastapi import HTTPException, UploadFile, status

from app.schemas import StatementPreviewRow, StatementPreviewResponse
from ml.predict import predict_category


logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".csv", ".xlsx"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
UPLOAD_CHUNK_SIZE = 64 * 1024  # 64 KB
MAX_XLSX_ZIP_ENTRIES = 1000
MAX_XLSX_UNCOMPRESSED_SIZE = 25 * 1024 * 1024  # 25 MB
MAX_ROWS = 10_000
MAX_TRANSACTION_AMOUNT = Decimal("9999999999.99")
CSV_ENCODINGS = ("utf-8-sig", "utf-8", "cp1252")
_NON_ISO_DATE_FORMATS = (
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d/%m/%y",
    "%d-%m-%y",
    "%d %b %Y",
    "%d-%b-%Y",
    "%d %B %Y",
    "%d/%m/%Y %H:%M:%S",
    "%d-%m-%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%d-%m-%Y %H:%M",
)

STATEMENT_COLUMN_ALIASES: dict[str, str] = {
    "date": "date",
    "transaction_date": "date",
    "description": "description",
    "narration": "description",
    "details": "description",
    "transaction_details": "description",
    "particulars": "description",
    "amount": "amount",
    "transaction_type": "transaction_type",
    "type": "transaction_type",
    "category": "category",
    "tags": "category",
    "tag": "category",
    "status": "status",
    "transaction_status": "status",
}

_PAYTM_KNOWN_STATUSES = {"SUCCESS", "PENDING", "FAILED"}
_OTHER_BANK_SETTLED_STATUSES = {
    "CLEARED",
    "POSTED",
    "SETTLED",
    "COMPLETED",
    "APPROVED",
}

PAYTM_TAG_TO_CANONICAL: dict[str, str] = {
    "shopping": "Shopping",
    "money received": "Income",
    "travel": "Transport",
    "money transfer": "Transfers/Repayments",
    "food": "Food/Dining",
    "groceries": "Groceries",
    "entertainment": "Entertainment",
    "services": "Other",
    "miscellaneous": "Other",
    "refund": "Income",
}


def normalize_paytm_tag(value: object) -> str:
    """Normalize a Paytm tag value by stripping emojis, hashes, and whitespace."""
    if value is None or pd.isna(value):
        return ""
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return ""
    # Strip leading '#' and whitespace
    text = text.lstrip("#").strip()
    # Strip leading emojis and symbols (anything non-alphanumeric and non-space)
    text = re.sub(r"^[^\w\s]+", "", text).strip()
    return text.lower()


def get_merchant_category_override(description: str | None) -> str | None:
    """Return a verified canonical category override for known merchants, if matched.

    Applies strictly to verified merchants where description provides strong evidence:
    - DMRC / Delhi Metro Rail Corporation -> Transport
    - Rapido / Roppen Transportation Services Private Limited -> Transport
    - Protean eGov Technologies Limited -> Other
    - Ray Ri S Eatery -> Food/Dining
    """
    if not description:
        return None

    desc_lower = description.strip().lower()

    # DMRC / Delhi Metro Rail Corporation -> Transport
    if re.search(r"\b(dmrc|delhi metro rail cor(?:p|poration)?)\b", desc_lower):
        return "Transport"

    # Rapido / Roppen Transportation Services Private Limited -> Transport
    if re.search(r"\b(rapido|roppen transportation)\b", desc_lower):
        return "Transport"

    # Protean eGov Technologies Limited -> Other
    if "protean egov" in desc_lower:
        return "Other"

    # Ray Ri S Eatery -> Food/Dining
    if "ray ri s eatery" in desc_lower:
        return "Food/Dining"

    return None


def normalize_column_name(name: object) -> str:
    """Normalize column names for flexible matching."""
    return str(name).strip().lower().replace(" ", "_")




def transaction_dedup_key(
    transaction_date: date | datetime,
    description: str,
    amount: Decimal,
    transaction_type: str,
) -> tuple[date, str, Decimal, str]:
    """Build a canonical, category-independent duplicate detection key."""
    normalized_date = (
        transaction_date.date()
        if isinstance(transaction_date, datetime)
        else transaction_date
    )
    normalized_desc = re.sub(r"\s+", " ", description.strip()).casefold()
    normalized_amount = Decimal(amount).quantize(Decimal("0.01"))
    return (
        normalized_date,
        normalized_desc,
        normalized_amount,
        transaction_type,
    )


def _finalize_positive_amount(amount: Decimal) -> Decimal | None:
    """Quantize to Numeric(12, 2) and enforce strictly positive DB bounds."""
    if not amount.is_finite():
        return None
    try:
        quantized = amount.quantize(Decimal("0.01"))
    except InvalidOperation:
        return None
    if quantized <= 0 or quantized > MAX_TRANSACTION_AMOUNT:
        return None
    return quantized


def parse_date(value: object) -> date | None:
    """Parse native dates/timestamps, ISO strings, and localized dates cleanly."""
    if value is None or pd.isna(value):
        return None

    if isinstance(value, (pd.Timestamp, datetime)):
        return value.date()

    if isinstance(value, date):
        return value

    text = str(value).strip()
    if not text or "\x00" in text:
        return None

    # Exact ISO date (YYYY-MM-DD)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        try:
            return datetime.strptime(text, "%Y-%m-%d").date()
        except ValueError:
            return None

    # ISO datetime with optional 'T'/space separator, fractional seconds, and Z/offset
    if re.match(r"^\d{4}-\d{2}-\d{2}[T ]", text):
        iso_candidate = text[:-1] + "+00:00" if text.endswith(("Z", "z")) else text
        iso_candidate = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", iso_candidate)
        try:
            return datetime.fromisoformat(iso_candidate).date()
        except ValueError:
            return None

    # Explicit common non-ISO date / datetime formats before pandas fallback
    for fmt in _NON_ISO_DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)

    if pd.isna(parsed):
        return None

    return parsed.date()


def parse_amount(value: object):
    """Parse a positive transaction amount fitting Numeric(12, 2)."""
    if value is None or pd.isna(value):
        return None

    cleaned = str(value).strip().replace(",", "").replace("₹", "").replace("$", "")

    # Support amounts written as (500.00) to indicate a negative value.
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]

    try:
        amount = Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None

    if amount <= 0:
        return None

    return _finalize_positive_amount(amount)


AmountSignKind = Literal["negative", "explicit_positive", "unsigned_positive"]


def _parse_signed_amount_with_sign(
    value: object,
) -> tuple[Decimal | None, AmountSignKind | None]:
    """Parse a currency amount into positive Decimal(12,2) magnitude and sign kind."""
    if value is None or pd.isna(value):
        return None, None

    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        if isinstance(value, Decimal):
            if not value.is_finite() or value == 0:
                return None, None
            sign_kind: AmountSignKind = "negative" if value < 0 else "unsigned_positive"
            quantized = _finalize_positive_amount(abs(value))
            if quantized is None:
                return None, None
            return quantized, sign_kind

        try:
            if math.isnan(value) or not math.isfinite(value) or value == 0:
                return None, None
        except (TypeError, ValueError):
            return None, None

        sign_kind = "negative" if value < 0 else "unsigned_positive"
        raw_str = str(abs(value))
    else:
        text = str(value).strip().replace(",", "").replace("₹", "").replace("$", "").strip()
        if not text:
            return None, None

        if text.startswith("-"):
            sign_kind = "negative"
            raw_str = text[1:].strip()
        elif text.startswith("(") and text.endswith(")"):
            sign_kind = "negative"
            raw_str = text[1:-1].strip()
        elif text.startswith("+"):
            sign_kind = "explicit_positive"
            raw_str = text[1:].strip()
        else:
            sign_kind = "unsigned_positive"
            raw_str = text

        if not raw_str or raw_str.startswith(("+", "-")):
            return None, None

    try:
        magnitude = Decimal(raw_str)
    except (InvalidOperation, ValueError):
        return None, None

    if magnitude <= 0:
        return None, None

    quantized = _finalize_positive_amount(magnitude)
    if quantized is None:
        return None, None

    return quantized, sign_kind


def parse_signed_amount(value: object) -> tuple[Decimal | None, str | None]:
    """Parse an amount and infer direction ('expense' or 'income') from its sign.

    Handles string formats such as '-135.00', '+338.00', '(135.00)', and numeric values.
    Returns (magnitude: Decimal | None, inferred_type: 'expense' | 'income' | None).
    Magnitude is always returned as a positive Decimal fitting Numeric(12, 2).
    Returns (None, None) if value is zero, sub-cent, overflow, malformed, or missing.
    """
    quantized, sign_kind = _parse_signed_amount_with_sign(value)
    if quantized is None or sign_kind is None:
        return None, None

    direction = "expense" if sign_kind == "negative" else "income"
    return quantized, direction


def parse_amount_for_type(
    value: object,
    transaction_type: str | None,
) -> tuple[Decimal | None, str | None]:
    """Parse an amount when an explicit transaction Type column exists and validate sign consistency."""
    quantized, sign_kind = _parse_signed_amount_with_sign(value)
    if quantized is None or sign_kind is None:
        return None, "Invalid amount; enter a positive number."

    if transaction_type == "income" and sign_kind == "negative":
        return None, "Credit/income transaction cannot have a negative amount."

    if transaction_type == "expense" and sign_kind == "explicit_positive":
        return None, "Debit/expense transaction cannot have a positive-signed amount."

    return quantized, None


def _should_enforce_paytm_status(
    filename: str,
    columns: set[str],
    dataframe: pd.DataFrame,
) -> bool:
    """Detect whether a statement's Status column uses Paytm's SUCCESS-only eligibility model."""
    if "status" not in columns:
        return False

    if (
        "tags" in columns
        or "tag" in columns
        or "transaction_id" in columns
        or "paytm" in filename.lower()
    ):
        return True

    non_empty_statuses: set[str] = set()
    for value in dataframe["status"]:
        if value is None or pd.isna(value):
            continue
        cleaned = str(value).replace("\x00", "").strip().upper()
        if cleaned and cleaned != "NAN":
            non_empty_statuses.add(cleaned)

    if non_empty_statuses & _PAYTM_KNOWN_STATUSES:
        return True

    if non_empty_statuses and non_empty_statuses.issubset(_OTHER_BANK_SETTLED_STATUSES):
        return False

    return True


def classify_paytm_status(
    raw_status: object,
) -> tuple[
    str | None,
    Literal["success", "pending", "failed", "missing", "unknown"],
    bool,
    str | None,
    str | None,
]:
    """Normalize and classify a Paytm Status cell value for SUCCESS-only import eligibility."""
    nul_error: str | None = None
    if raw_status is None or pd.isna(raw_status):
        source_status = None
    else:
        raw_text = str(raw_status)
        if "\x00" in raw_text:
            nul_error = "Status contains invalid null characters."
        cleaned = raw_text.replace("\x00", "").strip()
        source_status = None if (not cleaned or cleaned.lower() == "nan") else cleaned

    if source_status is None:
        return (
            None,
            "missing",
            True,
            "Missing status — excluded (only SUCCESS transactions are imported).",
            nul_error,
        )

    normalized = source_status.upper()
    if normalized == "SUCCESS":
        return (source_status, "success", False, None, nul_error)
    if normalized == "PENDING":
        return (
            source_status,
            "pending",
            True,
            "Pending transaction — excluded (only SUCCESS transactions are imported).",
            nul_error,
        )
    if normalized == "FAILED":
        return (
            source_status,
            "failed",
            True,
            "Failed transaction — excluded (only SUCCESS transactions are imported).",
            nul_error,
        )

    return (
        source_status,
        "unknown",
        True,
        f"Unrecognized status '{source_status}' — excluded (only SUCCESS transactions are imported).",
        nul_error,
    )


def select_excel_worksheet(excel_file: pd.ExcelFile) -> str | int:
    """Select the best candidate transaction worksheet from an Excel workbook.

    For single-sheet workbooks, returns 0 to preserve existing behavior.
    For multi-sheet workbooks, inspects sheet headers to select a worksheet containing
    all required transaction fields (date, description, amount), taking aliases into account.
    If no sheet has all three, falls back to the sheet with the most matches.
    If no sheet has any transaction headers, raises HTTPException(400).
    """
    sheet_names = excel_file.sheet_names
    if len(sheet_names) <= 1:
        return 0

    required_fields = {"date", "description", "amount"}
    best_sheet = None
    max_matches = 0

    for name in sheet_names:
        try:
            sample_df = pd.read_excel(excel_file, sheet_name=name, nrows=0)
        except Exception:
            continue

        normalized_cols = [
            normalize_column_name(col) for col in sample_df.columns
        ]
        canonical_cols = {
            STATEMENT_COLUMN_ALIASES.get(col, col) for col in normalized_cols
        }
        matched_required = required_fields.intersection(canonical_cols)

        if len(matched_required) == 3:
            return name

        if len(matched_required) > max_matches:
            max_matches = len(matched_required)
            best_sheet = name

    if max_matches == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No transaction worksheet found in Excel workbook. Required columns: date, description, amount.",
        )

    return best_sheet


def validate_statement_extension(filename: str) -> str:
    """Validate uploaded filename extension before reading file contents."""
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Upload a CSV or XLSX file.",
        )
    return extension


async def read_bounded_upload_bytes(upload: UploadFile) -> tuple[str, bytes]:
    """Validate extension and read an upload in bounded chunks up to MAX_FILE_SIZE."""
    filename = Path(upload.filename or "statement.csv").name[:255]
    validate_statement_extension(filename)

    buffer = bytearray()
    while True:
        remaining = (MAX_FILE_SIZE + 1) - len(buffer)
        chunk_size = min(UPLOAD_CHUNK_SIZE, remaining)
        chunk = await upload.read(chunk_size)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="File exceeds the 5 MB upload limit.",
            )

    if not buffer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    return filename, bytes(buffer)


def decode_csv_bytes(content: bytes) -> str:
    """Decode CSV bytes safely across supported encodings without silently mangling binary garbage."""
    for encoding in CSV_ENCODINGS:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Could not decode CSV file. Save it as UTF-8 or Windows-1252 CSV and try again.",
    )


def _validate_xlsx_archive(content: bytes) -> None:
    """Reject corrupted, excessive-entry, or zip-bomb XLSX archives before openpyxl parsing."""
    try:
        with zipfile.ZipFile(BytesIO(content)) as zf:
            infos = zf.infolist()
            if len(infos) > MAX_XLSX_ZIP_ENTRIES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Excel workbook archive exceeds the safe entry limit.",
                )
            total_uncompressed = sum(info.file_size for info in infos)
            if total_uncompressed > MAX_XLSX_UNCOMPRESSED_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Excel workbook uncompressed size exceeds the 25 MB safety limit.",
                )
    except HTTPException:
        raise
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read the file. Check that it is a valid CSV or XLSX file.",
        ) from None


def read_statement_file(filename: str, content: bytes) -> pd.DataFrame:
    """Read a supported statement file into a DataFrame."""
    extension = validate_statement_extension(filename)

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="File exceeds the 5 MB upload limit.",
        )

    try:
        if extension == ".csv":
            csv_text = decode_csv_bytes(content)
            dataframe = pd.read_csv(
                StringIO(csv_text),
                nrows=MAX_ROWS + 1,
                dtype=str,
            )
        else:
            _validate_xlsx_archive(content)
            with pd.ExcelFile(BytesIO(content), engine="openpyxl") as excel_file:
                target_sheet = select_excel_worksheet(excel_file)
                dataframe = pd.read_excel(
                    excel_file,
                    sheet_name=target_sheet,
                    nrows=MAX_ROWS + 1,
                    dtype=str,
                )
    except HTTPException:
        raise
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
    existing_keys: set | None = None,
) -> StatementPreviewResponse:
    """Validate transaction rows and return a preview without saving them."""
    aliases = STATEMENT_COLUMN_ALIASES

    # Group source columns by their canonical column name to detect collisions
    canonical_sources: dict[str, list[str]] = {}
    for col in dataframe.columns:
        canonical = aliases.get(col, col)
        canonical_sources.setdefault(canonical, []).append(col)

    collisions = {
        canonical: cols
        for canonical, cols in canonical_sources.items()
        if len(cols) > 1
    }
    if collisions:
        collision_details = ", ".join(
            f"'{canonical}' (from: {', '.join(sorted(cols))})"
            for canonical, cols in sorted(collisions.items())
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"The file contains multiple columns mapping to the same field: {collision_details}. "
                "Keep only one of these columns."
            ),
        )

    is_tags_column = any(
        aliases.get(col) == "category" and col in {"tags", "tag"}
        for col in dataframe.columns
    )

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

    has_type_column = "transaction_type" in dataframe.columns
    has_status_column = "status" in dataframe.columns
    enforce_status = _should_enforce_paytm_status(
        filename, set(dataframe.columns), dataframe
    )
    preview_rows = []
    seen_keys = set(existing_keys or ())

    for index, record in enumerate(
        dataframe.to_dict(orient="records"), start=2
    ):
        errors = []

        transaction_date = parse_date(record.get("date"))
        description_value = record.get("description")
        if description_value is not None and not pd.isna(description_value):
            raw_description = str(description_value)
            if "\x00" in raw_description:
                errors.append("Description contains invalid null characters.")
            description = raw_description.replace("\x00", "").strip()
        else:
            description = ""

        raw_type = record.get("transaction_type")
        transaction_type = None

        if has_type_column:
            if raw_type is not None and not pd.isna(raw_type):
                normalized_type = str(raw_type).replace("\x00", "").strip().lower()

                if normalized_type in {"income", "credit", "cr"}:
                    transaction_type = "income"
                elif normalized_type in {"expense", "debit", "dr"}:
                    transaction_type = "expense"
                else:
                    errors.append("Transaction type must be income or expense.")
            else:
                errors.append("Transaction type must be income or expense.")

            amount, amount_error = parse_amount_for_type(
                record.get("amount"),
                transaction_type,
            )
            if amount_error is not None:
                errors.append(amount_error)
        else:
            amount, inferred_type = parse_signed_amount(record.get("amount"))
            if amount is not None:
                transaction_type = inferred_type
            else:
                transaction_type = None
                errors.append("Invalid amount; enter a positive number.")

        if transaction_date is None:
            errors.append("Invalid or missing transaction date.")

        if not description or description.lower() == "nan":
            errors.append("Missing transaction description.")
            description = None
        elif len(description) > 500:
            errors.append("Description exceeds 500 characters.")

        if not has_type_column and amount is not None and transaction_type is None:
            errors.append(
                "Transaction type is missing. Add an income/expense column."
            )

        source_status = None
        status_category = None
        is_status_excluded = False
        exclusion_reason = None
        if has_status_column:
            if enforce_status:
                (
                    source_status,
                    status_category,
                    is_status_excluded,
                    exclusion_reason,
                    status_nul_error,
                ) = classify_paytm_status(record.get("status"))
                if status_nul_error is not None:
                    errors.append(status_nul_error)
            else:
                raw_status_val = record.get("status")
                if raw_status_val is not None and not pd.isna(raw_status_val):
                    raw_status_text = str(raw_status_val)
                    if "\x00" in raw_status_text:
                        errors.append("Status contains invalid null characters.")
                    cleaned_status = raw_status_text.replace("\x00", "").strip()
                    if cleaned_status and cleaned_status.lower() != "nan":
                        source_status = cleaned_status

        raw_category = record.get("category")
        explicit_category = ""
        if raw_category is not None and not pd.isna(raw_category):
            raw_cat_text = str(raw_category)
            if "\x00" in raw_cat_text:
                errors.append("Category contains invalid null characters.")
            sanitized_cat = raw_cat_text.replace("\x00", "")
        else:
            sanitized_cat = raw_category

        if is_tags_column:
            cleaned_tag = normalize_paytm_tag(sanitized_cat)
            if cleaned_tag:
                mapped_category = PAYTM_TAG_TO_CANONICAL.get(cleaned_tag, "Other")
                override = get_merchant_category_override(description)
                explicit_category = override if override is not None else mapped_category
        else:
            if sanitized_cat is not None and not pd.isna(sanitized_cat):
                cleaned_cat = str(sanitized_cat).strip()
                if cleaned_cat.lower() != "nan":
                    explicit_category = cleaned_cat

        predicted_category = None
        prediction_confidence = None

        if explicit_category:
            category = explicit_category
            if len(category) > 100:
                errors.append("Category exceeds 100 characters.")
                category = category[:100]
        else:
            category = "Other"
            if len(errors) == 0 and not is_status_excluded and description:
                try:
                    prediction = predict_category(description)
                    predicted_category = prediction["predicted_category"]
                    prediction_confidence = Decimal(
                        str(round(float(prediction["confidence"]), 4))
                    )
                    if prediction["needs_review"]:
                        category = "Other"
                    else:
                        category = predicted_category
                except (FileNotFoundError, ValueError) as exc:
                    logger.warning(
                        "ML category prediction unavailable for statement row %d: %s",
                        index,
                        exc,
                    )
                    category = "Other"
                    predicted_category = None
                    prediction_confidence = None
                except Exception:
                    logger.exception(
                        "Unexpected error during ML category prediction for statement row %d",
                        index,
                    )
                    category = "Other"
                    predicted_category = None
                    prediction_confidence = None

        is_valid = len(errors) == 0 and not is_status_excluded
        is_duplicate = False
        if (
            is_valid
            and description is not None
            and transaction_date is not None
            and amount is not None
            and transaction_type is not None
        ):
            row_key = transaction_dedup_key(
                transaction_date,
                description,
                amount,
                transaction_type,
            )
            if row_key in seen_keys:
                is_duplicate = True
            else:
                seen_keys.add(row_key)

        preview_rows.append(
            StatementPreviewRow(
                row_number=index,
                transaction_date=transaction_date,
                description=description,
                amount=amount,
                transaction_type=transaction_type,
                category=category,
                predicted_category=predicted_category,
                prediction_confidence=prediction_confidence,
                source_status=source_status,
                status_category=status_category,
                is_status_excluded=is_status_excluded,
                exclusion_reason=exclusion_reason,
                is_valid=is_valid,
                is_duplicate=is_duplicate,
                errors=errors,
            )
        )

    valid_count = sum(1 for row in preview_rows if row.is_valid)
    duplicate_count = sum(1 for row in preview_rows if row.is_valid and row.is_duplicate)
    importable_count = valid_count - duplicate_count
    status_excluded_count = sum(1 for row in preview_rows if row.is_status_excluded)
    pending_count = sum(
        1 for row in preview_rows if row.is_status_excluded and row.status_category == "pending"
    )
    failed_count = sum(
        1 for row in preview_rows if row.is_status_excluded and row.status_category == "failed"
    )
    missing_status_count = sum(
        1 for row in preview_rows if row.is_status_excluded and row.status_category == "missing"
    )
    unknown_status_count = sum(
        1 for row in preview_rows if row.is_status_excluded and row.status_category == "unknown"
    )
    invalid_count = sum(
        1 for row in preview_rows if not row.is_status_excluded and not row.is_valid
    )

    return StatementPreviewResponse(
        filename=filename,
        total_rows=len(preview_rows),
        valid_rows=valid_count,
        importable_rows=importable_count,
        invalid_rows=invalid_count,
        duplicate_rows=duplicate_count,
        status_excluded_rows=status_excluded_count,
        pending_rows=pending_count,
        failed_rows=failed_count,
        missing_status_rows=missing_status_count,
        unknown_status_rows=unknown_status_count,
        preview=preview_rows,
    )


async def preview_statement(
    upload: UploadFile,
    existing_keys: set | None = None,
) -> StatementPreviewResponse:
    """Read and validate an uploaded statement without database writes."""
    filename, content = await read_bounded_upload_bytes(upload)

    dataframe = read_statement_file(filename, content)

    return build_statement_preview(filename, dataframe, existing_keys=existing_keys)
