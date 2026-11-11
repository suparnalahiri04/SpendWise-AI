import { ApiError, apiDownload, apiRequest } from './client'
import type { ReportFilterParams, ReportSummaryResponse } from './types'

export function buildReportQuery(params?: ReportFilterParams): string {
  if (!params) return ''
  const searchParams = new URLSearchParams()

  if (params.period) {
    searchParams.set('period', params.period)
  }
  if (params.start_date) {
    searchParams.set('start_date', params.start_date)
  }
  if (params.end_date) {
    searchParams.set('end_date', params.end_date)
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export function validateReportParams(params?: ReportFilterParams): void {
  if (!params) return

  const hasStart = Boolean(params.start_date)
  const hasEnd = Boolean(params.end_date)

  if (hasStart !== hasEnd) {
    throw new ApiError(
      'validation',
      'Both start date and end date must be provided for custom date ranges.',
      422,
    )
  }

  if (hasStart && hasEnd && params.start_date! > params.end_date!) {
    throw new ApiError('validation', 'Start date cannot be after end date.', 422)
  }
}

/**
 * Triggers a browser file download from a Blob and safely revokes the temporary object URL.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || !window.URL?.createObjectURL) {
    return
  }

  const url = window.URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } finally {
    // Revoke the temporary object URL to prevent memory leaks
    window.URL.revokeObjectURL(url)
  }
}

/**
 * GET /reports/summary — fetch financial report summary metrics and category breakdown.
 */
export async function fetchReportSummary(
  params?: ReportFilterParams,
  signal?: AbortSignal,
): Promise<ReportSummaryResponse> {
  validateReportParams(params)
  const query = buildReportQuery(params)
  return apiRequest<ReportSummaryResponse>(`/reports/summary${query}`, { signal })
}

/**
 * GET /reports/transactions/csv — download transaction ledger as an RFC 4180 CSV file.
 */
export async function downloadTransactionsCsv(
  params?: ReportFilterParams,
  signal?: AbortSignal,
): Promise<string> {
  validateReportParams(params)
  const query = buildReportQuery(params)
  const result = await apiDownload(`/reports/transactions/csv${query}`, {
    signal,
    accept: 'text/csv',
  })

  const fallbackPeriod = params?.period ?? 'this-month'
  const filename = result.filename || `spendwise_transactions_${fallbackPeriod}.csv`

  triggerBrowserDownload(result.blob, filename)
  return filename
}

/**
 * GET /reports/summary/pdf — download executive financial summary report as a PDF.
 */
export async function downloadSummaryPdf(
  params?: ReportFilterParams,
  signal?: AbortSignal,
): Promise<string> {
  validateReportParams(params)
  const query = buildReportQuery(params)
  const result = await apiDownload(`/reports/summary/pdf${query}`, {
    signal,
    accept: 'application/pdf',
  })

  const fallbackPeriod = params?.period ?? 'this-month'
  const filename = result.filename || `spendwise_summary_${fallbackPeriod}.pdf`

  triggerBrowserDownload(result.blob, filename)
  return filename
}

