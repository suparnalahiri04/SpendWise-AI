/** Types mirroring the backend Pydantic schemas (backend/app/schemas.py). */

export interface UserResponse {
  id: number
  email: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface Credentials {
  email: string
  password: string
}

export type TransactionType = 'income' | 'expense'

/**
 * Backend `Decimal` fields are serialised as JSON strings (e.g. "1250.50"),
 * so amount and confidence are typed as strings and parsed only for display.
 */
export interface Transaction {
  id: number
  transaction_date: string // ISO date, YYYY-MM-DD
  description: string
  amount: string
  transaction_type: TransactionType | string
  category: string
  predicted_category: string | null
  prediction_confidence: string | null
  is_reviewed: boolean
}

export interface TransactionCreatePayload {
  transaction_date: string // YYYY-MM-DD
  description: string
  amount: number | string
  transaction_type: TransactionType
  category?: string | null
}

export interface TransactionUpdatePayload {
  transaction_date: string // YYYY-MM-DD
  description: string
  amount: number | string
  transaction_type: TransactionType
  category: string
}

export const TRANSACTION_CATEGORIES = [
  'Food/Dining',
  'Shopping',
  'Transport',
  'Groceries',
  'Bills/Utilities',
  'Education',
  'Entertainment',
  'Healthcare',
  'Income',
  'Transfers/Repayments',
  'Other',
] as const

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number]

export type StatementRowStatusCategory =
  | 'success'
  | 'pending'
  | 'failed'
  | 'missing'
  | 'unknown'

/** Row parsed and validated by POST /statements/preview. */
export interface StatementPreviewRow {
  row_number: number
  transaction_date: string | null // ISO date YYYY-MM-DD
  description: string | null
  amount: string | number | null
  transaction_type: TransactionType | null
  category: string
  predicted_category?: string | null
  prediction_confidence?: string | number | null
  source_status?: string | null
  status_category?: StatementRowStatusCategory | null
  is_status_excluded?: boolean
  exclusion_reason?: string | null
  is_valid: boolean
  is_duplicate?: boolean
  errors: string[]
}

/** Result returned by POST /statements/preview. */
export interface StatementPreviewResponse {
  filename: string
  total_rows: number
  valid_rows: number
  importable_rows?: number
  invalid_rows: number
  duplicate_rows?: number
  status_excluded_rows?: number
  pending_rows?: number
  failed_rows?: number
  missing_status_rows?: number
  unknown_status_rows?: number
  preview: StatementPreviewRow[]
}

/** Result returned by POST /statements/import. */
export interface StatementImportResult {
  message: string
  import_id: number
  filename: string
  status: 'completed' | 'completed_with_errors' | string
  total_rows: number
  imported_rows: number
  rejected_rows: number
}

/** Historical statement record returned by GET /statements/history. */
export interface StatementImportHistoryItem {
  id: number
  filename: string
  status: 'completed' | 'completed_with_errors' | 'processing' | string
  rows_total: number
  rows_imported: number
  rows_rejected: number
  created_at: string // ISO timestamp
}

/** Types mirroring the backend Budget Pydantic schemas (backend/app/schemas.py). */

export interface Budget {
  id: number
  user_id: number
  category: string
  month: string // YYYY-MM
  limit_amount: string | number
  created_at: string
}

export interface BudgetCreatePayload {
  category: string
  month: string // YYYY-MM
  limit_amount: number
}

export interface BudgetUpdatePayload {
  category?: string
  month?: string
  limit_amount: number
}

export type BudgetStatusSemantic =
  | 'on_track'
  | 'approaching_limit'
  | 'limit_reached'
  | 'over_budget'

export interface BudgetProgressItem {
  id: number
  category: string
  month: string
  limit_amount: string | number
  spent_amount: string | number
  remaining_amount: string | number
  percentage_used: number
  is_exceeded: boolean
  status?: BudgetStatusSemantic | string | null
}

export interface BudgetProgressSummary {
  month: string
  total_budgeted: string | number
  total_spent: string | number
  total_remaining: string | number
  items: BudgetProgressItem[]
}

/** Categories suitable for expense budgets (excludes Income). */
export const BUDGET_EXPENSE_CATEGORIES = TRANSACTION_CATEGORIES.filter(
  (cat) => cat !== 'Income',
)

/** Recurring payment types mirroring backend schemas (backend/app/schemas.py). */

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export type RecurringStatus = 'active' | 'cancelled'

export const RECURRING_FREQUENCIES: readonly RecurringFrequency[] = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const

export interface RecurringPayment {
  id: number
  user_id: number
  description: string
  amount: string | number
  category: string
  frequency: RecurringFrequency | string
  start_date: string // YYYY-MM-DD
  next_due_date: string // YYYY-MM-DD
  status: RecurringStatus | string
  is_active: boolean
  is_overdue: boolean
  days_until_due: number
  created_at: string
  updated_at: string
}

export interface RecurringPaymentCreatePayload {
  description: string
  amount: number
  category: string
  frequency: RecurringFrequency
  start_date?: string
  next_due_date?: string
}

export interface RecurringPaymentUpdatePayload {
  description?: string
  amount?: number
  category?: string
  frequency?: RecurringFrequency
  start_date?: string
  next_due_date?: string
  status?: RecurringStatus
}

export interface RecurringPaymentSummary {
  total_active_count: number
  total_monthly_commitment: string | number
  upcoming_count: number
  upcoming_total: string | number
  overdue_count: number
  overdue_total: string | number
  upcoming_items: RecurringPayment[]
  overdue_items: RecurringPayment[]
}

/** Financial Insights types mirroring backend schemas (backend/app/schemas.py). */

export type InsightType = 'pattern' | 'anomaly' | 'forecast' | 'recommendation'
export type InsightSeverity = 'info' | 'warning' | 'critical' | 'positive'

export interface InsightItem {
  id: string
  type: InsightType
  severity: InsightSeverity
  title: string
  description: string
  category: string | null
  amount: string | number | null
  metric_label: string | null
  date: string | null // YYYY-MM-DD
}

export interface InsightsSummary {
  current_month: string // YYYY-MM
  total_spent_current_month: string | number
  total_spent_previous_month: string | number | null
  projected_month_end_expense: string | number
  savings_rate_percentage: number | null
  fixed_commitment_ratio: number | null
  month_over_month_change_pct: number | null
}

export interface FinancialInsightsResponse {
  summary: InsightsSummary
  insights: InsightItem[]
}

/** AI Money Assistant types mirroring backend schemas (backend/app/schemas.py). */

export type AssistantFactKind = 'fact' | 'estimate' | 'recommendation'
export type AssistantEngine = 'deterministic' | 'llm'

export interface AssistantFactItem {
  metric_key: string
  label: string
  value_formatted: string
  raw_amount: string | number | null
  kind: AssistantFactKind
  category: string | null
  source: string
  notes: string | null
}

export interface AssistantQueryPayload {
  query: string
  month?: string | null
}

export interface AssistantQueryResponse {
  query: string
  intent: string
  answer_markdown: string
  facts: AssistantFactItem[]
  estimates: AssistantFactItem[]
  recommendations: AssistantFactItem[]
  data_limitations: string[]
  suggested_followups: string[]
  engine: AssistantEngine
}

export interface StarterPromptItem {
  id: string
  prompt: string
  category: string
}

export interface StarterPromptsResponse {
  prompts: StarterPromptItem[]
}

/** Savings Goals types mirroring backend schemas (backend/app/schemas.py). */

export type GoalStatus = 'in_progress' | 'completed' | 'archived'

export interface GoalContribution {
  id: number
  goal_id: number
  user_id: number
  amount: string | number
  contribution_date: string // YYYY-MM-DD
  notes: string | null
  created_at: string | null
}

export interface GoalContributionCreatePayload {
  amount: number
  contribution_date?: string // YYYY-MM-DD
  notes?: string
}

export interface SavingsGoal {
  id: number
  user_id: number
  name: string
  target_amount: string | number
  target_date: string | null // YYYY-MM-DD
  status: GoalStatus
  total_contributed: string | number
  remaining_amount: string | number
  progress_pct: number
  is_completed: boolean
  is_on_track: boolean | null
  days_remaining: number | null
  recent_contributions: GoalContribution[]
  created_at: string | null
  updated_at: string | null
}

export interface SavingsGoalCreatePayload {
  name: string
  target_amount: number
  target_date?: string | null
}

export interface SavingsGoalUpdatePayload {
  name?: string
  target_amount?: number
  target_date?: string | null
  status?: GoalStatus
}

export interface SavingsGoalsSummaryResponse {
  total_target_amount: string | number
  total_saved_amount: string | number
  total_remaining_amount: string | number
  overall_progress_pct: number
  goals_count: number
  completed_goals_count: number
  items: SavingsGoal[]
}

// Financial Reports types

export type ReportPeriod =
  | 'this-month'
  | 'last-month'
  | 'last-3-months'
  | 'year-to-date'
  | 'all'
  | 'custom'

export interface ReportCategorySpending {
  category: string
  amount: string | number
  transaction_count: number
  percentage: number
}

export interface ReportSummaryResponse {
  period: string
  start_date: string | null // YYYY-MM-DD
  end_date: string | null // YYYY-MM-DD
  total_income: string | number
  total_expenses: string | number
  net_savings: string | number
  savings_rate_pct: number | null
  transaction_count: number
  income_transaction_count: number
  expense_transaction_count: number
  categories: ReportCategorySpending[]
  has_transactions: boolean
}

export interface ReportFilterParams {
  period?: ReportPeriod
  start_date?: string
  end_date?: string
}

// Smart Financial Alerts types

export type AlertType =
  | 'budget_warning'
  | 'budget_exceeded'
  | 'recurring_upcoming'
  | 'recurring_overdue'
  | 'spending_anomaly'
  | string

export type AlertSeverity = 'info' | 'warning' | 'critical' | string

export interface AlertItem {
  id: string // stable alert_key
  alert_type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  created_at: string
  link_to: string
  metadata: Record<string, unknown>
}

export interface AlertListResponse {
  alert_count: number
  active_count: number
  alerts: AlertItem[]
}

export interface AlertDismissResponse {
  success: boolean
  alert_key: string
  message: string
}

export interface AlertDismissAllResponse {
  success: boolean
  dismissed_count: number
  message: string
}

// Financial Forecasting types

export type ForecastConfidenceLevel = 'low' | 'moderate' | 'high'

export interface MonthlyForecastPoint {
  month: string // YYYY-MM
  month_label: string // e.g. "November 2026"
  is_current_month: boolean
  is_historical: boolean
  actual_amount: string | number | null
  predicted_amount: string | number
  lower_bound: string | number
  upper_bound: string | number
  fixed_commitments: string | number
  variable_estimate: string | number
}

export interface CategoryForecastItem {
  category: string
  predicted_amount: string | number
  percentage: number // 0.0 to 100.0
  fixed_amount: string | number
  variable_amount: string | number
}

export interface ForecastSummaryResponse {
  horizon_months: number
  reference_date: string // ISO date YYYY-MM-DD
  confidence_level: ForecastConfidenceLevel
  confidence_score: number // 0.0 to 1.0
  history_months_count: number
  current_month_forecast: MonthlyForecastPoint
  monthly_forecasts: MonthlyForecastPoint[]
  category_forecasts: CategoryForecastItem[]
  methodology_notes: string[]
  limitations: string[]
}

export interface ForecastQueryParams {
  horizon_months?: number
  horizonMonths?: number
  ref_date?: string
  refDate?: string
}


