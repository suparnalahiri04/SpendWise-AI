from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# Authentication schemas

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# Transaction schemas

class TransactionCreate(BaseModel):
    transaction_date: date
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    transaction_type: Literal["income", "expense"]
    category: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )


class TransactionUpdate(BaseModel):
    transaction_date: date
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    transaction_type: Literal["income", "expense"]
    category: str = Field(min_length=1, max_length=100)


class TransactionResponse(BaseModel):
    id: int
    transaction_date: date
    description: str
    amount: Decimal
    transaction_type: str
    category: str
    predicted_category: str | None
    prediction_confidence: Decimal | None
    is_reviewed: bool

    model_config = ConfigDict(from_attributes=True)

    @field_validator("transaction_date", mode="before")
    @classmethod
    def coerce_transaction_date(cls, v: object) -> object:
        if isinstance(v, datetime):
            return v.date()
        return v


# Statement import preview schemas

class StatementPreviewRow(BaseModel):
    row_number: int
    transaction_date: date | None = None
    description: str | None = None
    amount: Decimal | None = None
    transaction_type: Literal["income", "expense"] | None = None
    category: str = "Other"
    is_valid: bool
    errors: list[str] = Field(default_factory=list)


class StatementPreviewResponse(BaseModel):
    filename: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    preview: list[StatementPreviewRow]


# Statement import history schema

class StatementImportResponse(BaseModel):
    id: int
    filename: str
    status: str
    rows_total: int
    rows_imported: int
    rows_rejected: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
