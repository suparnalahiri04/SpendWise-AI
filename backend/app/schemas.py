from datetime import date, date as dt_date, datetime
from decimal import Decimal
from typing import Any, Literal

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

StatementRowStatusCategory = Literal[
    "success",
    "pending",
    "failed",
    "missing",
    "unknown",
]


class StatementPreviewRow(BaseModel):
    row_number: int
    transaction_date: date | None = None
    description: str | None = None
    amount: Decimal | None = None
    transaction_type: Literal["income", "expense"] | None = None
    category: str = "Other"
    predicted_category: str | None = None
    prediction_confidence: Decimal | None = None
    source_status: str | None = None
    status_category: StatementRowStatusCategory | None = None
    is_status_excluded: bool = False
    exclusion_reason: str | None = None
    is_valid: bool
    is_duplicate: bool = False
    errors: list[str] = Field(default_factory=list)


class StatementPreviewResponse(BaseModel):
    filename: str
    total_rows: int
    valid_rows: int
    importable_rows: int = 0
    invalid_rows: int
    duplicate_rows: int = 0
    status_excluded_rows: int = 0
    pending_rows: int = 0
    failed_rows: int = 0
    missing_status_rows: int = 0
    unknown_status_rows: int = 0
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


BudgetStatusSemantic = Literal[
    "on_track",
    "approaching_limit",
    "limit_reached",
    "over_budget",
]


class BudgetProgressItem(BaseModel):
    id: int
    category: str
    month: str
    limit_amount: Decimal
    spent_amount: Decimal
    remaining_amount: Decimal
    percentage_used: float
    is_exceeded: bool
    status: BudgetStatusSemantic | None = None

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


# AI Money Assistant schemas

FactKind = Literal["fact", "estimate", "recommendation"]


class AssistantFactItem(BaseModel):
    metric_key: str
    label: str
    value_formatted: str
    raw_amount: Decimal | None = None
    kind: FactKind = "fact"
    category: str | None = None
    source: str
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CategorySpendingFact(BaseModel):
    category: str
    total_spent: Decimal
    transaction_count: int
    percentage_of_total_expenses: float

    model_config = ConfigDict(from_attributes=True)


class BudgetUtilizationFact(BaseModel):
    id: int
    category: str
    month: str
    limit_amount: Decimal
    spent_amount: Decimal
    remaining_amount: Decimal
    percentage_used: float
    is_exceeded: bool
    status: Literal["on_track", "warning", "limit_reached", "exceeded"]

    model_config = ConfigDict(from_attributes=True)


class RecurringPaymentFact(BaseModel):
    id: int
    description: str
    amount: Decimal
    category: str
    frequency: str
    next_due_date: date
    is_overdue: bool
    days_until_due: int

    model_config = ConfigDict(from_attributes=True)


class FinancialContextSummary(BaseModel):
    month: str
    has_transactions: bool
    total_income: Decimal
    total_expenses: Decimal
    net_savings: Decimal
    savings_rate_pct: float | None = None
    transaction_count: int
    expense_count: int
    income_count: int

    # Estimates
    projected_month_end_expense: Decimal | None = None
    fixed_commitment_ratio: float | None = None
    mom_spending_change_pct: float | None = None

    # Breakdowns
    category_spending: list[CategorySpendingFact] = Field(default_factory=list)
    budget_utilization: list[BudgetUtilizationFact] = Field(default_factory=list)
    recurring_upcoming: list[RecurringPaymentFact] = Field(default_factory=list)
    recurring_overdue: list[RecurringPaymentFact] = Field(default_factory=list)
    active_insights: list[InsightItem] = Field(default_factory=list)

    # Segregated facts
    verified_facts: list[AssistantFactItem] = Field(default_factory=list)
    estimates: list[AssistantFactItem] = Field(default_factory=list)
    recommendations: list[AssistantFactItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class AssistantContextResponse(BaseModel):
    user_id: int
    month: str
    generated_at: datetime
    summary: FinancialContextSummary
    data_limitations: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class AssistantQueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    month: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class AssistantQueryResponse(BaseModel):
    query: str
    intent: str
    answer_markdown: str
    facts: list[AssistantFactItem] = Field(default_factory=list)
    estimates: list[AssistantFactItem] = Field(default_factory=list)
    recommendations: list[AssistantFactItem] = Field(default_factory=list)
    data_limitations: list[str] = Field(default_factory=list)
    suggested_followups: list[str] = Field(default_factory=list)
    engine: Literal["deterministic", "llm"] = "deterministic"

    model_config = ConfigDict(from_attributes=True)


class StarterPromptItem(BaseModel):
    id: str
    prompt: str
    category: str

    model_config = ConfigDict(from_attributes=True)


class StarterPromptsResponse(BaseModel):
    prompts: list[StarterPromptItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# Savings Goal schemas

GoalStatusType = Literal["in_progress", "completed", "archived"]


class GoalContributionCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    contribution_date: date | None = None
    notes: str | None = Field(default=None, max_length=255)


class GoalContributionResponse(BaseModel):
    id: int
    goal_id: int
    user_id: int
    amount: Decimal
    contribution_date: date
    notes: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SavingsGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    target_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    target_date: date | None = None


class SavingsGoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    target_amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    target_date: date | None = None
    status: GoalStatusType | None = None


class SavingsGoalProgressItem(BaseModel):
    id: int
    user_id: int
    name: str
    target_amount: Decimal
    target_date: date | None = None
    status: GoalStatusType
    total_contributed: Decimal
    remaining_amount: Decimal
    progress_pct: float
    is_completed: bool
    is_on_track: bool | None = None
    days_remaining: int | None = None
    recent_contributions: list[GoalContributionResponse] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SavingsGoalsSummaryResponse(BaseModel):
    total_target_amount: Decimal
    total_saved_amount: Decimal
    total_remaining_amount: Decimal
    overall_progress_pct: float
    goals_count: int
    completed_goals_count: int
    items: list[SavingsGoalProgressItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)




# Financial Reports schemas

class ReportCategorySpending(BaseModel):
    category: str
    amount: Decimal
    transaction_count: int
    percentage: float  # 0 to 100

    model_config = ConfigDict(from_attributes=True)




class ReportSummaryResponse(BaseModel):
    period: str
    start_date: date | None = None
    end_date: date | None = None
    total_income: Decimal
    total_expenses: Decimal
    net_savings: Decimal
    savings_rate_pct: float | None = None
    transaction_count: int
    income_transaction_count: int
    expense_transaction_count: int
    categories: list[ReportCategorySpending]
    has_transactions: bool

    model_config = ConfigDict(from_attributes=True)

# Smart Financial Alerts schemas

class AlertItem(BaseModel):
    id: str  # stable alert_key
    alert_type: str  # budget_warning, budget_exceeded, recurring_upcoming, recurring_overdue, spending_anomaly
    severity: str  # info, warning, critical
    title: str
    message: str
    created_at: datetime
    link_to: str
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class AlertListResponse(BaseModel):
    alert_count: int
    active_count: int
    alerts: list[AlertItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class AlertDismissResponse(BaseModel):
    success: bool
    alert_key: str
    message: str


class AlertDismissAllResponse(BaseModel):
    success: bool
    dismissed_count: int
    message: str


# Financial Forecasting schemas

class MonthlyForecastPoint(BaseModel):
    month: str  # YYYY-MM
    month_label: str  # e.g. "November 2026"
    is_current_month: bool
    is_historical: bool
    actual_amount: Decimal | None = None
    predicted_amount: Decimal
    lower_bound: Decimal
    upper_bound: Decimal
    fixed_commitments: Decimal
    variable_estimate: Decimal

    model_config = ConfigDict(from_attributes=True)


class CategoryForecastItem(BaseModel):
    category: str
    predicted_amount: Decimal
    percentage: float  # 0.0 to 100.0
    fixed_amount: Decimal
    variable_amount: Decimal

    model_config = ConfigDict(from_attributes=True)


class ForecastSummaryResponse(BaseModel):
    horizon_months: int
    reference_date: date
    confidence_level: Literal["low", "moderate", "high"]
    confidence_score: float  # 0.0 to 1.0
    history_months_count: int
    current_month_forecast: MonthlyForecastPoint
    monthly_forecasts: list[MonthlyForecastPoint]
    category_forecasts: list[CategoryForecastItem]
    methodology_notes: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


