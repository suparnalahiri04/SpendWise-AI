import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { saveToken } from '@/features/auth/session'
import type { ReportSummaryResponse } from '@/lib/api/types'
import { ReportsPage } from './ReportsPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

function renderReportsPage(
  props: {
    initialPeriod?: ReportSummaryResponse['period']
    initialStartDate?: string
    initialEndDate?: string
  } = {},
) {
  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthProvider>
          <ReportsPage
            initialPeriod={props.initialPeriod as any}
            initialStartDate={props.initialStartDate}
            initialEndDate={props.initialEndDate}
          />
        </AuthProvider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

const sampleSummary: ReportSummaryResponse = {
  period: 'this-month',
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  total_income: '60000.00',
  total_expenses: '18000.00',
  net_savings: '42000.00',
  savings_rate_pct: 70.0,
  transaction_count: 6,
  income_transaction_count: 1,
  expense_transaction_count: 5,
  categories: [
    {
      category: 'Groceries',
      amount: '10000.00',
      transaction_count: 3,
      percentage: 55.6,
    },
    {
      category: 'Bills/Utilities',
      amount: '8000.00',
      transaction_count: 2,
      percentage: 44.4,
    },
  ],
  has_transactions: true,
}

describe('ReportsPage', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    saveToken('test-token')

    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test-uuid') as any
    window.URL.revokeObjectURL = vi.fn() as any
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows loading state, then renders monthly summary metrics and category breakdown', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/reports/summary')) {
        return jsonResponse(sampleSummary)
      }
      return jsonResponse({ detail: 'Not found' }, 404)
    })

    renderReportsPage()

    // Loading indicator
    expect(screen.getByText('Generating report metrics…')).toBeInTheDocument()

    // Wait for metrics to load
    await waitFor(() => {
      expect(screen.getByText('₹60,000.00')).toBeInTheDocument()
    })

    expect(screen.getByText('₹18,000.00')).toBeInTheDocument()
    expect(screen.getByText('₹42,000.00')).toBeInTheDocument()
    expect(screen.getByText('70.0%')).toBeInTheDocument()

    // Categories
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('₹10,000.00')).toBeInTheDocument()
    expect(screen.getByText('Bills/Utilities')).toBeInTheDocument()
    expect(screen.getByText('₹8,000.00')).toBeInTheDocument()
  })

  it('switches period tabs and updates summary data', async () => {
    const lastMonthSummary: ReportSummaryResponse = {
      ...sampleSummary,
      period: 'last-month',
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      total_income: '55000.00',
      total_expenses: '20000.00',
      net_savings: '35000.00',
      savings_rate_pct: 63.6,
    }

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('period=last-month')) {
        return jsonResponse(lastMonthSummary)
      }
      return jsonResponse(sampleSummary)
    })

    const user = userEvent.setup()
    renderReportsPage()

    await waitFor(() => {
      expect(screen.getByText('₹60,000.00')).toBeInTheDocument()
    })

    // Click 'Last Month' tab
    const lastMonthTab = screen.getByRole('tab', { name: 'Last Month' })
    await user.click(lastMonthTab)

    await waitFor(() => {
      expect(screen.getByText('₹55,000.00')).toBeInTheDocument()
    })
    expect(screen.getByText('63.6%')).toBeInTheDocument()
  })

  it('validates custom date ranges and submits valid custom query', async () => {
    const customSummary: ReportSummaryResponse = {
      ...sampleSummary,
      period: 'custom',
      start_date: '2026-10-01',
      end_date: '2026-10-15',
      total_income: '60000.00',
      total_expenses: '5000.00',
      net_savings: '55000.00',
    }

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('start_date=2026-10-01&end_date=2026-10-15')) {
        return jsonResponse(customSummary)
      }
      return jsonResponse(sampleSummary)
    })

    const user = userEvent.setup()
    renderReportsPage()

    await waitFor(() => {
      expect(screen.getByText('₹60,000.00')).toBeInTheDocument()
    })

    // Click 'Custom Range' tab
    const customTab = screen.getByRole('tab', { name: 'Custom Range' })
    await user.click(customTab)

    // Inputs are visible
    const startInput = screen.getByLabelText('Start date')
    const endInput = screen.getByLabelText('End date')
    const applyButton = screen.getByRole('button', { name: 'Apply date range' })

    // Test invalid range (start > end)
    await user.clear(startInput)
    await user.type(startInput, '2026-10-20')
    await user.clear(endInput)
    await user.type(endInput, '2026-10-10')
    await user.click(applyButton)

    expect(screen.getByText('Start date cannot be after end date.')).toBeInTheDocument()

    // Test valid range
    await user.clear(startInput)
    await user.type(startInput, '2026-10-01')
    await user.clear(endInput)
    await user.type(endInput, '2026-10-15')
    await user.click(applyButton)

    await waitFor(() => {
      expect(screen.getByText('₹55,000.00')).toBeInTheDocument()
    })
  })

  it('executes CSV export and PDF download with feedback banner', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/reports/transactions/csv')) {
        return new Response('Date,Description,Amount\r\n2026-10-01,Salary,60000', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="spendwise_transactions_this-month.csv"',
          },
        })
      }
      if (url.includes('/reports/summary/pdf')) {
        return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="spendwise_summary_this-month.pdf"',
          },
        })
      }
      return jsonResponse(sampleSummary)
    })

    const user = userEvent.setup()
    renderReportsPage()

    await waitFor(() => {
      expect(screen.getByText('₹60,000.00')).toBeInTheDocument()
    })

    // Click Export CSV
    const csvBtn = screen.getByRole('button', { name: 'Export CSV' })
    await user.click(csvBtn)

    await waitFor(() => {
      expect(
        screen.getByText(/Downloaded spendwise_transactions_this-month\.csv successfully\./),
      ).toBeInTheDocument()
    })

    // Click Download PDF
    const pdfBtn = screen.getByRole('button', { name: 'Download PDF' })
    await user.click(pdfBtn)

    await waitFor(() => {
      expect(
        screen.getByText(/Downloaded spendwise_summary_this-month\.pdf successfully\./),
      ).toBeInTheDocument()
    })
  })

  it('handles error state and recovers on retry', async () => {
    let fail = true
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/reports/summary')) {
        if (fail) {
          return jsonResponse({ detail: 'Failed to fetch financial report.' }, 500)
        }
        return jsonResponse(sampleSummary)
      }
      return jsonResponse({ detail: 'Not found' }, 404)
    })

    const user = userEvent.setup()
    renderReportsPage()

    await waitFor(() => {
      expect(
        screen.getByText('The server ran into a problem. Please try again in a moment.'),
      ).toBeInTheDocument()
    })

    fail = false
    const retryBtn = screen.getByRole('button', { name: /Try again/i })
    await user.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('₹60,000.00')).toBeInTheDocument()
    })
  })

  it('handles empty periods and zero-income savings rate cleanly', async () => {
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

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/reports/summary')) {
        return jsonResponse(emptySummary)
      }
      return jsonResponse({ detail: 'Not found' }, 404)
    })

    renderReportsPage()

    await waitFor(() => {
      expect(screen.getByText('No category spending recorded')).toBeInTheDocument()
    })

    expect(screen.getByText('N/A')).toBeInTheDocument()
    expect(screen.getByText('No income recorded')).toBeInTheDocument()
  })

  describe('Export Cards Layout & Structure (Stage 1 Correction)', () => {
    it('renders Financial Summary (PDF) card with vertical flex stacking and grouped title/description', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/reports/summary')) return jsonResponse(sampleSummary)
        return jsonResponse({}, 404)
      })

      renderReportsPage()

      await waitFor(() => {
        expect(screen.getByText('Financial Summary (PDF)')).toBeInTheDocument()
      })

      const pdfTitle = screen.getByText('Financial Summary (PDF)')
      const card = pdfTitle.closest('[data-slot="card"]')
      expect(card).toBeInTheDocument()

      const header = card?.querySelector('[data-slot="card-header"]')
      expect(header).toBeInTheDocument()

      // Header has vertical column flex layout
      expect(header).toHaveClass('flex-col')
      expect(header).toHaveClass('items-start')

      // Eyebrow label is present with icon
      const eyebrow = header?.querySelector('.text-forest')
      expect(eyebrow).toBeInTheDocument()
      expect(eyebrow).toHaveTextContent('Executive Document')
      expect(eyebrow?.querySelector('svg')).toBeInTheDocument()

      // Title and description are wrapped together inside a container div
      const titleWrapper = pdfTitle.parentElement
      expect(titleWrapper?.tagName).toBe('DIV')
      expect(titleWrapper).toContainElement(pdfTitle)

      const description = screen.getByText(/Official PDF report styled in SpendWise branding/i)
      expect(titleWrapper).toContainElement(description)
      expect(description).toHaveClass('text-xs')

      // Download button exists and is usable
      const downloadBtn = screen.getByRole('button', { name: 'Download Summary PDF' })
      expect(downloadBtn).toBeInTheDocument()
      expect(downloadBtn).not.toBeDisabled()
    })

    it('renders Transaction Ledger (CSV) card with vertical flex stacking and grouped title/description', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/reports/summary')) return jsonResponse(sampleSummary)
        return jsonResponse({}, 404)
      })

      renderReportsPage()

      await waitFor(() => {
        expect(screen.getByText('Transaction Ledger (CSV)')).toBeInTheDocument()
      })

      const csvTitle = screen.getByText('Transaction Ledger (CSV)')
      const card = csvTitle.closest('[data-slot="card"]')
      expect(card).toBeInTheDocument()

      const header = card?.querySelector('[data-slot="card-header"]')
      expect(header).toBeInTheDocument()

      // Header has vertical column flex layout
      expect(header).toHaveClass('flex-col')
      expect(header).toHaveClass('items-start')

      // Eyebrow label is present with icon
      const eyebrow = header?.querySelector('.text-forest')
      expect(eyebrow).toBeInTheDocument()
      expect(eyebrow).toHaveTextContent('Spreadsheet')
      expect(eyebrow?.querySelector('svg')).toBeInTheDocument()

      // Title and description are wrapped together inside a container div
      const titleWrapper = csvTitle.parentElement
      expect(titleWrapper?.tagName).toBe('DIV')
      expect(titleWrapper).toContainElement(csvTitle)

      const description = screen.getByText(/Complete tabular export with date, description/i)
      expect(titleWrapper).toContainElement(description)
      expect(description).toHaveClass('text-xs')

      // Download button exists and is usable
      const downloadBtn = screen.getByRole('button', { name: 'Download Ledger CSV' })
      expect(downloadBtn).toBeInTheDocument()
      expect(downloadBtn).not.toBeDisabled()
    })

    it('triggers PDF download and CSV export cleanly from the export card buttons', async () => {
      const user = userEvent.setup()
      fetchMock.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/reports/summary')) return jsonResponse(sampleSummary)
        if (url.includes('/reports/summary/pdf')) {
          return new Response(new Blob(['%PDF-1.4 dummy']), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'attachment; filename="spendwise-summary-2026-10.pdf"',
            },
          })
        }
        if (url.includes('/reports/transactions/csv')) {
          return new Response(new Blob(['date,description,amount\n2026-10-01,salary,60000']), {
            status: 200,
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': 'attachment; filename="spendwise-transactions-2026-10.csv"',
            },
          })
        }
        return jsonResponse({}, 404)
      })

      // Mock URL.createObjectURL and URL.revokeObjectURL
      window.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
      window.URL.revokeObjectURL = vi.fn()

      renderReportsPage()

      await waitFor(() => {
        expect(screen.getByText('Financial Summary (PDF)')).toBeInTheDocument()
      })

      const pdfBtn = screen.getByRole('button', { name: 'Download Summary PDF' })
      await user.click(pdfBtn)

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/reports/summary/pdf'),
          expect.anything(),
        )
      })

      const csvBtn = screen.getByRole('button', { name: 'Download Ledger CSV' })
      await user.click(csvBtn)

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/reports/transactions/csv'),
          expect.anything(),
        )
      })
    })

    it('renders Category-Wise Spending card header with vertical layout, full-width eyebrow, and grouped title-description', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/reports/summary')) return jsonResponse(sampleSummary)
        return jsonResponse({}, 404)
      })

      renderReportsPage()

      await waitFor(() => {
        expect(screen.getByText('Category-Wise Spending')).toBeInTheDocument()
      })

      const categoryTitle = screen.getByText('Category-Wise Spending')
      const card = categoryTitle.closest('[data-slot="card"]')
      expect(card).toBeInTheDocument()

      const header = card?.querySelector('[data-slot="card-header"]')
      expect(header).toBeInTheDocument()

      // Header has vertical column flex layout with items-start
      expect(header).toHaveClass('flex-col')
      expect(header).toHaveClass('items-start')

      // Eyebrow row spans full width and contains icon, label, and category count badge
      const eyebrowRow = header?.firstElementChild as HTMLElement
      expect(eyebrowRow).toHaveClass('flex')
      expect(eyebrowRow).toHaveClass('w-full')
      expect(eyebrowRow).toHaveClass('justify-between')
      expect(eyebrowRow).toHaveTextContent('Breakdown')
      expect(eyebrowRow).toHaveTextContent('2 Categories')

      // Title and description are wrapped together inside a container div
      const titleWrapper = categoryTitle.parentElement
      expect(titleWrapper?.tagName).toBe('DIV')
      expect(titleWrapper).toContainElement(categoryTitle)

      const description = screen.getByText('Spending allocations across categories sorted by total amount.')
      expect(titleWrapper).toContainElement(description)
      expect(description).toHaveClass('mt-1')
      expect(description).toHaveClass('text-xs')

      // Description is rendered after the title inside the wrapper
      expect(categoryTitle.compareDocumentPosition(description)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      )
    })
  })
})

