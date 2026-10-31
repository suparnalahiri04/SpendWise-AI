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

