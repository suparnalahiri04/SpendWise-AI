from datetime import date, date as dt_date, datetime
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


# Budget schemas

class BudgetCreate(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    limit_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class BudgetUpdate(BaseModel):
    category: str | None = Field(default=None, min_length=1, max_length=100)
    month: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    limit_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class BudgetResponse(BaseModel):
    id: int
    user_id: int
    category: str
    month: str
    limit_amount: Decimal
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BudgetProgressItem(BaseModel):
    id: int
    category: str
    month: str
    limit_amount: Decimal
    spent_amount: Decimal
    remaining_amount: Decimal
    percentage_used: float
    is_exceeded: bool

    model_config = ConfigDict(from_attributes=True)


class BudgetProgressSummaryResponse(BaseModel):
    month: str
    total_budgeted: Decimal
    total_spent: Decimal
    total_remaining: Decimal
    items: list[BudgetProgressItem]


# Recurring Payment schemas

FrequencyType = Literal["weekly", "monthly", "quarterly", "yearly"]
RecurringStatusType = Literal["active", "cancelled"]


class RecurringPaymentCreate(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    category: str = Field(default="Other", min_length=1, max_length=100)
    frequency: FrequencyType
    start_date: date | None = None
    next_due_date: date | None = None


class RecurringPaymentUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=500)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    frequency: FrequencyType | None = None
    start_date: date | None = None
    next_due_date: date | None = None
    status: RecurringStatusType | None = None


class RecurringPaymentResponse(BaseModel):
    id: int
    user_id: int
    description: str
    amount: Decimal
    category: str
    frequency: str
    start_date: date
    next_due_date: date
    status: str
    is_active: bool
    is_overdue: bool = False
    days_until_due: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("start_date", "next_due_date", mode="before")
    @classmethod
    def coerce_date(cls, v: object) -> object:
        if isinstance(v, datetime):
            return v.date()
        return v


class RecurringPaymentSummaryResponse(BaseModel):
    total_active_count: int
    total_monthly_commitment: Decimal
    upcoming_count: int
    upcoming_total: Decimal
    overdue_count: int
    overdue_total: Decimal
    upcoming_items: list[RecurringPaymentResponse]
    overdue_items: list[RecurringPaymentResponse]


# Financial Insights schemas

class InsightItem(BaseModel):
    id: str
    type: Literal["pattern", "anomaly", "forecast", "recommendation"]
    severity: Literal["info", "warning", "critical", "positive"]
    title: str
    description: str
    category: str | None = None
    amount: Decimal | None = None
    metric_label: str | None = None
    date: dt_date | None = None

    model_config = ConfigDict(from_attributes=True)


class InsightsSummary(BaseModel):
    current_month: str
    total_spent_current_month: Decimal
    total_spent_previous_month: Decimal | None
    projected_month_end_expense: Decimal
    savings_rate_percentage: float | None
    fixed_commitment_ratio: float | None
    month_over_month_change_pct: float | None

    model_config = ConfigDict(from_attributes=True)


class FinancialInsightsResponse(BaseModel):
    summary: InsightsSummary
    insights: list[InsightItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

