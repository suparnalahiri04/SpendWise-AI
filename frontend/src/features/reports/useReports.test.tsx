import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import * as reportsApi from '@/lib/api/reports'
import type { ReportSummaryResponse } from '@/lib/api/types'
import { useReports } from './useReports'

describe('useReports hook', () => {
  const mockSummary: ReportSummaryResponse = {
    period: 'this-month',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    total_income: '50000.00',
    total_expenses: '15000.00',
    net_savings: '35000.00',
    savings_rate_pct: 70.0,
    transaction_count: 5,
    income_transaction_count: 1,
    expense_transaction_count: 4,
    categories: [
      {
        category: 'Groceries',
        amount: '8000.00',
        transaction_count: 2,
        percentage: 53.3,
      },
    ],
    has_transactions: true,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads report summary on mount for default period (this-month)', async () => {
    const fetchSpy = vi
      .spyOn(reportsApi, 'fetchReportSummary')
      .mockResolvedValueOnce(mockSummary)

    const { result } = renderHook(() => useReports())

    expect(result.current.status).toBe('loading')
    expect(result.current.period).toBe('this-month')

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    expect(result.current.summary).toEqual(mockSummary)
    expect(result.current.error).toBeNull()
    expect(fetchSpy).toHaveBeenCalledWith(
      { period: 'this-month', start_date: undefined, end_date: undefined },
      expect.any(AbortSignal),
    )
  })

  it('switches period and fetches corresponding summary', async () => {
    const lastMonthSummary: ReportSummaryResponse = {
      ...mockSummary,
      period: 'last-month',
      start_date: '2026-09-01',
      end_date: '2026-09-30',
    }

    const fetchSpy = vi
      .spyOn(reportsApi, 'fetchReportSummary')
      .mockResolvedValueOnce(mockSummary)
      .mockResolvedValueOnce(lastMonthSummary)

    const { result } = renderHook(() => useReports())

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    act(() => {
      result.current.setPeriod('last-month')
    })

    expect(result.current.status).toBe('loading')

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    expect(result.current.period).toBe('last-month')
    expect(result.current.summary?.period).toBe('last-month')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('prevents stale responses from overwriting newer state', async () => {
    let resolveFirst: (val: ReportSummaryResponse) => void
    const firstPromise = new Promise<ReportSummaryResponse>((resolve) => {
      resolveFirst = resolve
    })

    const secondSummary: ReportSummaryResponse = {
      ...mockSummary,
      period: 'last-month',
    }

    vi.spyOn(reportsApi, 'fetchReportSummary')
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => Promise.resolve(secondSummary))

    const { result } = renderHook(() => useReports())

    // Immediately switch period before first request resolves
    act(() => {
      result.current.setPeriod('last-month')
    })

    // Second request finishes
    await waitFor(() => {
      expect(result.current.status).toBe('success')
      expect(result.current.period).toBe('last-month')
      expect(result.current.summary?.period).toBe('last-month')
    })

    // Now first request finishes late
    await act(async () => {
      resolveFirst!(mockSummary)
    })

    // Must still reflect second request, not overwritten by stale first request
    expect(result.current.summary?.period).toBe('last-month')
  })

  it('handles error state and recovers upon reload', async () => {
    vi.spyOn(reportsApi, 'fetchReportSummary')
      .mockRejectedValueOnce(new ApiError('server', 'Failed to calculate report metrics.'))
      .mockResolvedValueOnce(mockSummary)

    const { result } = renderHook(() => useReports())

    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })

    expect(result.current.error).toBe('Failed to calculate report metrics.')
    expect(result.current.summary).toBeNull()

    // Trigger reload
    act(() => {
      result.current.reload()
    })

    expect(result.current.status).toBe('loading')

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    expect(result.current.error).toBeNull()
    expect(result.current.summary).toEqual(mockSummary)
  })

  it('handles custom date range validation and triggers custom fetch', async () => {
    vi.spyOn(reportsApi, 'fetchReportSummary').mockResolvedValue(mockSummary)

    const { result } = renderHook(() => useReports())

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    // Start date > end date
    act(() => {
      result.current.setCustomDateRange('2026-10-20', '2026-10-10')
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('Start date cannot be after end date.')

    // Valid range
    act(() => {
      result.current.setCustomDateRange('2026-10-01', '2026-10-15')
    })

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    expect(result.current.period).toBe('custom')
    expect(result.current.startDate).toBe('2026-10-01')
    expect(result.current.endDate).toBe('2026-10-15')
  })

  it('manages CSV download state, prevents duplicates, and handles failure', async () => {
    vi.spyOn(reportsApi, 'fetchReportSummary').mockResolvedValue(mockSummary)

    let resolveDownload: (filename: string) => void
    const downloadPromise = new Promise<string>((resolve) => {
      resolveDownload = resolve
    })

    const downloadCsvSpy = vi
      .spyOn(reportsApi, 'downloadTransactionsCsv')
      .mockImplementationOnce(() => downloadPromise)

    const { result } = renderHook(() => useReports())

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    // Start CSV download
    let promise1: Promise<string | null>
    act(() => {
      promise1 = result.current.downloadCsv()
    })

    expect(result.current.isDownloadingCsv).toBe(true)

    // Duplicate call while downloading should return null
    let promise2: Promise<string | null>
    act(() => {
      promise2 = result.current.downloadCsv()
    })

    const dupResult = await promise2!
    expect(dupResult).toBeNull()
    expect(downloadCsvSpy).toHaveBeenCalledTimes(1)

    // Complete download
    await act(async () => {
      resolveDownload!('spendwise_transactions_this-month.csv')
    })

    const res1 = await promise1!
    expect(res1).toBe('spendwise_transactions_this-month.csv')
    expect(result.current.isDownloadingCsv).toBe(false)
    expect(result.current.lastDownloadedFile).toBe('spendwise_transactions_this-month.csv')
    expect(result.current.downloadError).toBeNull()

    // Test failure scenario
    vi.spyOn(reportsApi, 'downloadTransactionsCsv').mockRejectedValueOnce(
      new Error('Network error during CSV export'),
    )

    await act(async () => {
      await result.current.downloadCsv()
    })

    expect(result.current.isDownloadingCsv).toBe(false)
    expect(result.current.downloadError).toBe('Network error during CSV export')
  })

  it('manages PDF download state, prevents duplicates, and handles failure', async () => {
    vi.spyOn(reportsApi, 'fetchReportSummary').mockResolvedValue(mockSummary)

    const downloadPdfSpy = vi
      .spyOn(reportsApi, 'downloadSummaryPdf')
      .mockResolvedValueOnce('spendwise_summary_this-month.pdf')

    const { result } = renderHook(() => useReports())

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    await act(async () => {
      const filename = await result.current.downloadPdf()
      expect(filename).toBe('spendwise_summary_this-month.pdf')
    })

    expect(downloadPdfSpy).toHaveBeenCalledTimes(1)
    expect(result.current.isDownloadingPdf).toBe(false)
    expect(result.current.lastDownloadedFile).toBe('spendwise_summary_this-month.pdf')
    expect(result.current.downloadError).toBeNull()

    // Test failure scenario
    vi.spyOn(reportsApi, 'downloadSummaryPdf').mockRejectedValueOnce(
      new Error('Failed to generate PDF summary'),
    )

    await act(async () => {
      await result.current.downloadPdf()
    })

    expect(result.current.isDownloadingPdf).toBe(false)
    expect(result.current.downloadError).toBe('Failed to generate PDF summary')
  })

  it('correctly handles zero-income savings rate and empty transactions', async () => {
    const emptySummary: ReportSummaryResponse = {
      period: 'this-month',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      total_income: '0.00',
      total_expenses: '0.00',
      net_savings: '0.00',
      savings_rate_pct: null,
      transaction_count: 0,
      income_transaction_count: 0,
      expense_transaction_count: 0,
      categories: [],
      has_transactions: false,
    }

    vi.spyOn(reportsApi, 'fetchReportSummary').mockResolvedValueOnce(emptySummary)

    const { result } = renderHook(() => useReports())

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    expect(result.current.summary?.savings_rate_pct).toBeNull()
    expect(result.current.summary?.has_transactions).toBe(false)
    expect(result.current.summary?.categories).toEqual([])
  })

  it('cancels pending fetch on unmount', async () => {
    let capturedSignal: AbortSignal | undefined
    vi.spyOn(reportsApi, 'fetchReportSummary').mockImplementation((_params, signal) => {
      capturedSignal = signal
      return new Promise(() => {})
    })

    const { unmount } = renderHook(() => useReports())

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal?.aborted).toBe(false)

    unmount()

    expect(capturedSignal?.aborted).toBe(true)
  })
})

