import { apiRequest } from './client'
import type { FinancialInsightsResponse } from './types'

export interface FetchInsightsOptions {
  month?: string
  refDate?: string
}

/**
 * GET /insights/ — retrieve financial insights and month summary for the authenticated user.
 */
export async function fetchFinancialInsights(
  options: FetchInsightsOptions = {},
  signal?: AbortSignal,
): Promise<FinancialInsightsResponse> {
  const params = new URLSearchParams()
  if (options.month) params.set('month', options.month)
  if (options.refDate) params.set('ref_date', options.refDate)

  const queryString = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<FinancialInsightsResponse>(`/insights/${queryString}`, { signal })
}

