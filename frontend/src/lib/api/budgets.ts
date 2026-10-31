import { ApiError, apiRequest } from './client'
import type {
  Budget,
  BudgetCreatePayload,
  BudgetProgressSummary,
  BudgetUpdatePayload,
} from './types'

/**
 * GET /budgets/ — list budgets belonging to the authenticated user.
 */
export async function fetchBudgets(month?: string, signal?: AbortSignal): Promise<Budget[]> {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  const payload = await apiRequest<unknown>(`/budgets/${query}`, { signal })
  if (!Array.isArray(payload)) {
    throw new ApiError('unknown', 'The server sent an unexpected response. Please try again.')
  }
  return payload as Budget[]
}

/**
 * GET /budgets/progress — calculate actual expenses against monthly budgets.
 */
export async function fetchBudgetProgress(
  month?: string,
  signal?: AbortSignal,
): Promise<BudgetProgressSummary> {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  return apiRequest<BudgetProgressSummary>(`/budgets/progress${query}`, { signal })
}

/**
 * POST /budgets/ — create a new monthly budget.
 */
export async function createBudget(
  payload: BudgetCreatePayload,
  signal?: AbortSignal,
): Promise<Budget> {
  return apiRequest<Budget>('/budgets/', {
    method: 'POST',
    body: payload,
    signal,
  })
}

/**
 * PUT /budgets/{id} — update an existing budget.
 */
export async function updateBudget(
  id: number,
  payload: BudgetUpdatePayload,
  signal?: AbortSignal,
): Promise<Budget> {
  return apiRequest<Budget>(`/budgets/${id}`, {
    method: 'PUT',
    body: payload,
    signal,
  })
}

/**
 * DELETE /budgets/{id} — delete a budget.
 */
export async function deleteBudget(id: number, signal?: AbortSignal): Promise<void> {
  await apiRequest<void>(`/budgets/${id}`, {
    method: 'DELETE',
    signal,
  })
}

