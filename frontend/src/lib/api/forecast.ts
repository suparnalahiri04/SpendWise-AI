import { apiRequest } from './client'
import type {
  CategoryForecastItem,
  ForecastConfidenceLevel,
  ForecastQueryParams,
  ForecastSummaryResponse,
  MonthlyForecastPoint,
} from './types'

export type {
  CategoryForecastItem,
  ForecastConfidenceLevel,
  ForecastQueryParams,
  ForecastSummaryResponse,
  MonthlyForecastPoint,
}

/**
 * Builds the URL query string for GET /forecast/.
 * Clamps horizon_months between 1 and 6 if supplied.
 */
export function buildForecastQuery(params?: ForecastQueryParams): string {
  if (!params) return ''
  const searchParams = new URLSearchParams()

  const horizon = params.horizon_months ?? params.horizonMonths
  if (horizon !== undefined && horizon !== null && !Number.isNaN(Number(horizon))) {
    const clamped = Math.min(6, Math.max(1, Math.round(Number(horizon))))
    searchParams.set('horizon_months', String(clamped))
  }

  const ref = params.ref_date ?? params.refDate
  if (ref && typeof ref === 'string' && ref.trim()) {
    searchParams.set('ref_date', ref.trim())
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

/**
 * GET /forecast/ — fetch component-decomposed financial forecast for the authenticated user.
 */
export async function fetchForecast(
  params?: ForecastQueryParams,
  signal?: AbortSignal,
): Promise<ForecastSummaryResponse> {
  const query = buildForecastQuery(params)
  return apiRequest<ForecastSummaryResponse>(`/forecast/${query}`, { signal })
}

