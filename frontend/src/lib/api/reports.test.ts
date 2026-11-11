import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTokenProvider } from './client'
import {
  buildReportQuery,
  downloadSummaryPdf,
  downloadTransactionsCsv,
  fetchReportSummary,
  triggerBrowserDownload,
  validateReportParams,
} from './reports'
import type { ReportSummaryResponse } from './types'

describe('reports API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>

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
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setTokenProvider(() => 'test-bearer-token')

    createObjectURLMock = vi.fn(() => 'blob:http://localhost/test-uuid')
    revokeObjectURLMock = vi.fn()
    window.URL.createObjectURL = createObjectURLMock as unknown as typeof window.URL.createObjectURL
    window.URL.revokeObjectURL = revokeObjectURLMock as unknown as typeof window.URL.revokeObjectURL
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setTokenProvider(() => null)
  })

  describe('query building and validation', () => {
    it('builds query parameters for named periods and custom date ranges', () => {
      expect(buildReportQuery()).toBe('')
      expect(buildReportQuery({ period: 'last-month' })).toBe('?period=last-month')
      expect(
        buildReportQuery({
          period: 'custom',
          start_date: '2026-10-01',
          end_date: '2026-10-15',
        }),
      ).toBe('?period=custom&start_date=2026-10-01&end_date=2026-10-15')
    })

    it('validates custom date ranges on client before sending', () => {
      expect(() =>
        validateReportParams({ start_date: '2026-10-01' }),
      ).toThrow('Both start date and end date must be provided')

      expect(() =>
        validateReportParams({ end_date: '2026-10-15' }),
      ).toThrow('Both start date and end date must be provided')

      expect(() =>
        validateReportParams({
          start_date: '2026-10-20',
          end_date: '2026-10-10',
        }),
      ).toThrow('Start date cannot be after end date')

      expect(() =>
        validateReportParams({
          start_date: '2026-10-01',
          end_date: '2026-10-15',
        }),
      ).not.toThrow()
    })
  })

  describe('fetchReportSummary', () => {
    it('sends authenticated GET request and returns JSON report summary', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(mockSummary), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const result = await fetchReportSummary({ period: 'this-month' })
      expect(result).toEqual(mockSummary)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toContain('/reports/summary?period=this-month')
      expect(init?.headers?.Authorization).toBe('Bearer test-bearer-token')
    })
  })

  describe('downloadTransactionsCsv', () => {
    it('fetches CSV blob, extracts filename header, and triggers browser download', async () => {
      const csvContent = 'Date,Description,Amount\r\n2026-10-01,Salary,50000.00'
      fetchMock.mockResolvedValueOnce(
        new Response(csvContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="spendwise_transactions_oct2026.csv"',
          },
        }),
      )

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      const filename = await downloadTransactionsCsv({ period: 'this-month' })
      expect(filename).toBe('spendwise_transactions_oct2026.csv')

      expect(createObjectURLMock).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/test-uuid')

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toContain('/reports/transactions/csv?period=this-month')
      expect(init?.headers?.Accept).toBe('text/csv')
      expect(init?.headers?.Authorization).toBe('Bearer test-bearer-token')

      clickSpy.mockRestore()
    })

    it('falls back to default filename when Content-Disposition is absent', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('col1,col2\r\nval1,val2', {
          status: 200,
          headers: { 'Content-Type': 'text/csv' },
        }),
      )

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      const filename = await downloadTransactionsCsv({ period: 'last-3-months' })
      expect(filename).toBe('spendwise_transactions_last-3-months.csv')

      clickSpy.mockRestore()
    })
  })

  describe('downloadSummaryPdf', () => {
    it('fetches binary PDF blob, extracts filename, and revokes object URL', async () => {
      const dummyPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
      fetchMock.mockResolvedValueOnce(
        new Response(dummyPdfBytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="spendwise_summary_oct2026.pdf"',
          },
        }),
      )

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      const filename = await downloadSummaryPdf({ period: 'this-month' })
      expect(filename).toBe('spendwise_summary_oct2026.pdf')

      expect(createObjectURLMock).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/test-uuid')

      clickSpy.mockRestore()
    })
  })

  describe('triggerBrowserDownload', () => {
    it('creates temporary anchor, triggers click, and revokes object URL in finally', () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      const dummyBlob = new Blob(['test content'], { type: 'text/plain' })

      triggerBrowserDownload(dummyBlob, 'test_export.csv')

      expect(createObjectURLMock).toHaveBeenCalledWith(dummyBlob)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/test-uuid')

      clickSpy.mockRestore()
    })
  })
})
