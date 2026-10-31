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

/** Row parsed and validated by POST /statements/preview. */
export interface StatementPreviewRow {
  row_number: number
  transaction_date: string | null // ISO date YYYY-MM-DD
  description: string | null
  amount: string | number | null
  transaction_type: TransactionType | null
  category: string
  is_valid: boolean
  errors: string[]
}

/** Result returned by POST /statements/preview. */
export interface StatementPreviewResponse {
  filename: string
  total_rows: number
  valid_rows: number
  invalid_rows: number
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

export interface BudgetProgressItem {
  id: number
  category: string
  month: string
  limit_amount: string | number
  spent_amount: string | number
  remaining_amount: string | number
  percentage_used: number
  is_exceeded: boolean
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



