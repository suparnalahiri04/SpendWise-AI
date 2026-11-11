import { notifyFinancialMutation } from '@/features/alerts/alertEvents'
import { ApiError, apiRequest } from './client'
import type {
  RecurringPayment,
  RecurringPaymentCreatePayload,
  RecurringPaymentSummary,
  RecurringPaymentUpdatePayload,
} from './types'

export interface FetchRecurringOptions {
  status?: string
  category?: string
  frequency?: string
  refDate?: string
}

/**
 * GET /recurring-payments/ — list recurring payments for the authenticated user.
 */
export async function fetchRecurringPayments(
  options: FetchRecurringOptions = {},
  signal?: AbortSignal,
): Promise<RecurringPayment[]> {
  const params = new URLSearchParams()
  if (options.status) params.set('status', options.status)
  if (options.category) params.set('category', options.category)
  if (options.frequency) params.set('frequency', options.frequency)
  if (options.refDate) params.set('ref_date', options.refDate)

  const queryString = params.toString() ? `?${params.toString()}` : ''
  const payload = await apiRequest<unknown>(`/recurring-payments/${queryString}`, { signal })
  if (!Array.isArray(payload)) {
    throw new ApiError('unknown', 'The server sent an unexpected response. Please try again.')
  }
  return payload as RecurringPayment[]
}

/**
 * GET /recurring-payments/summary — summary of commitments, upcoming and overdue bills.
 */
export async function fetchRecurringSummary(
  days = 30,
  signal?: AbortSignal,
): Promise<RecurringPaymentSummary> {
  return apiRequest<RecurringPaymentSummary>(`/recurring-payments/summary?days=${days}`, { signal })
}

/**
 * POST /recurring-payments/ — schedule a new recurring payment.
 */
export async function createRecurringPayment(
  payload: RecurringPaymentCreatePayload,
  signal?: AbortSignal,
): Promise<RecurringPayment> {
  return apiRequest<RecurringPayment>('/recurring-payments/', {
    method: 'POST',
    body: payload,
    signal,
  })
}

/**
 * PUT /recurring-payments/{id} — update an existing schedule.
 */
export async function updateRecurringPayment(
  id: number,
  payload: RecurringPaymentUpdatePayload,
  signal?: AbortSignal,
): Promise<RecurringPayment> {
  return apiRequest<RecurringPayment>(`/recurring-payments/${id}`, {
    method: 'PUT',
    body: payload,
    signal,
  })
}

/**
 * PATCH /recurring-payments/{id}/cancel — cancel a recurring payment.
 */
export async function cancelRecurringPayment(
  id: number,
  signal?: AbortSignal,
): Promise<RecurringPayment> {
  return apiRequest<RecurringPayment>(`/recurring-payments/${id}/cancel`, {
    method: 'PATCH',
    signal,
  })
}

/**
 * DELETE /recurring-payments/{id} — delete a recurring payment schedule.
 */
export async function deleteRecurringPayment(id: number, signal?: AbortSignal): Promise<void> {
  await apiRequest<void>(`/recurring-payments/${id}`, {
    method: 'DELETE',
    signal,
  })
  notifyFinancialMutation('recurring:deleted')
}

