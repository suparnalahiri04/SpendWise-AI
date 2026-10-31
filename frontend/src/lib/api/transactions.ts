import { ApiError, apiRequest } from './client'
import type { Transaction, TransactionCreatePayload, TransactionUpdatePayload } from './types'

/**
 * GET /transactions/ — transactions belonging to the authenticated user.
 *
 * The body must be a JSON array. Anything else is surfaced as an error rather than being
 * mistaken for "no transactions", so an empty list always means the server really sent [].
 */
export async function fetchTransactions(signal?: AbortSignal): Promise<Transaction[]> {
  const payload = await apiRequest<unknown>('/transactions/', { signal })
  if (!Array.isArray(payload)) {
    throw new ApiError('unknown', 'The server sent an unexpected response. Please try again.')
  }
  return payload as Transaction[]
}

/**
 * POST /transactions/ — create a new transaction for the authenticated user.
 *
 * If category is omitted or null, the backend runs the ML classifier to predict
 * the category and determine whether it needs review.
 */
export async function createTransaction(
  payload: TransactionCreatePayload,
  signal?: AbortSignal,
): Promise<Transaction> {
  return apiRequest<Transaction>('/transactions/', {
    method: 'POST',
    body: payload,
    signal,
  })
}

/**
 * PUT /transactions/{id} — update an owned transaction.
 *
 * Updates all core transaction attributes and explicitly assigns a category.
 * The backend marks the transaction as reviewed (is_reviewed = true).
 */
export async function updateTransaction(
  id: number,
  payload: TransactionUpdatePayload,
  signal?: AbortSignal,
): Promise<Transaction> {
  return apiRequest<Transaction>(`/transactions/${id}`, {
    method: 'PUT',
    body: payload,
    signal,
  })
}
