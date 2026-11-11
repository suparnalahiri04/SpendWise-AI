import { ApiError, apiRequest } from './client'
import type {
  AlertDismissAllResponse,
  AlertDismissResponse,
  AlertItem,
  AlertListResponse,
  AlertSeverity,
  AlertType,
} from './types'

export type {
  AlertDismissAllResponse,
  AlertDismissResponse,
  AlertItem,
  AlertListResponse,
  AlertSeverity,
  AlertType,
}

/**
 * GET /alerts/ — fetch active, non-dismissed financial alerts for the current user.
 */
export async function fetchAlerts(
  refDate?: string,
  signal?: AbortSignal,
): Promise<AlertListResponse> {
  const query = refDate ? `?ref_date=${encodeURIComponent(refDate)}` : ''
  return apiRequest<AlertListResponse>(`/alerts/${query}`, { signal })
}

/**
 * POST /alerts/{alert_key}/dismiss — dismiss an individual alert by its stable key.
 */
export async function dismissAlert(
  alertKey: string,
  signal?: AbortSignal,
): Promise<AlertDismissResponse> {
  const trimmed = alertKey?.trim()
  if (!trimmed) {
    throw new ApiError('validation', 'Alert key is required.', 422)
  }

  const encodedKey = encodeURIComponent(trimmed)
  return apiRequest<AlertDismissResponse>(`/alerts/${encodedKey}/dismiss`, {
    method: 'POST',
    signal,
  })
}

/**
 * POST /alerts/dismiss-all — dismiss all currently active alerts for the current user.
 */
export async function dismissAllAlerts(
  refDate?: string,
  signal?: AbortSignal,
): Promise<AlertDismissAllResponse> {
  const query = refDate ? `?ref_date=${encodeURIComponent(refDate)}` : ''
  return apiRequest<AlertDismissAllResponse>(`/alerts/dismiss-all${query}`, {
    method: 'POST',
    signal,
  })
}

