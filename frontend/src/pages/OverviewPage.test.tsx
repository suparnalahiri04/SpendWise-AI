import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { saveToken } from '@/features/auth/session'
import { PeriodContext, type PeriodContextValue } from '@/features/period/period'
import type { Transaction } from '@/lib/api/types'
import { OverviewPage } from './OverviewPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

function renderOverview(periodContextOverride?: Partial<PeriodContextValue>) {
  const periodValue: PeriodContextValue = {
    period: 'this-month',
    periodLabel: 'This month',
    setPeriod: vi.fn(),
    ...periodContextOverride,
  }

  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthProvider>
          <PeriodContext.Provider value={periodValue}>
            <OverviewPage />
          </PeriodContext.Provider>
        </AuthProvider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

function getTodayString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getFirstOfMonthString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  saveToken('test-token-value')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  fetchMock.mockReset()
})

describe('OverviewPage', () => {
  it('displays empty placeholders when user has no transactions', async () => {
    fetchMock.mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/transactions/')) return jsonResponse([])
      return jsonResponse({}, 404)
    })

    renderOverview()

    // Top cards show empty placeholder dash
    expect(await screen.findAllByText('—')).toHaveLength(4)
    expect(screen.getByText('Total spending')).toBeInTheDocument()
    expect(screen.getByText('No spending data yet')).toBeInTheDocument()
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })

  it('calculates and displays spending, income, savings, and top categories from transactions', async () => {
    const today = getTodayString()
    const firstOfMonth = getFirstOfMonthString()

    const mockTransactions: Transaction[] = [
      {
        id: 1,
        transaction_date: today,
        description: 'Swiggy Biryani Order',
        amount: '600.00',
        transaction_type: 'expense',
        category: 'Food/Dining',
        predicted_category: 'Food/Dining',
        prediction_confidence: '0.85',
        is_reviewed: true,
      },
      {
        id: 2,
        transaction_date: firstOfMonth,
        description: 'Nature Basket Groceries',
        amount: '400.00',
        transaction_type: 'expense',
        category: 'Groceries',
        predicted_category: 'Groceries',
        prediction_confidence: '0.90',
        is_reviewed: true,
      },
      {
        id: 3,
        transaction_date: firstOfMonth,
        description: 'Monthly Salary Credited',
        amount: '50000.00',
        transaction_type: 'income',
        category: 'Income',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      },
    ]

    fetchMock.mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/transactions/')) return jsonResponse(mockTransactions)
      return jsonResponse({}, 404)
    })

    renderOverview()

    // Total spending: 600 + 400 = 1,000.00
    expect(await screen.findByText('₹1,000.00')).toBeInTheDocument()
    expect(screen.getByText(/total outflows in this month/i)).toBeInTheDocument()

    // Total income: 50,000.00
    expect(screen.getByText('₹50,000.00')).toBeInTheDocument()
    expect(screen.getByText(/total inflows in this month/i)).toBeInTheDocument()

    // Net savings: +₹49,000.00
    expect(screen.getByText('+₹49,000.00')).toBeInTheDocument()

    // Budget used remains available once budgets are set
    expect(screen.getByText(/available once budgets are set/i)).toBeInTheDocument()

    // Top categories list is rendered with breakdown
    expect(screen.getByText('Food/Dining')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('updates dashboard calculations when reporting period changes to last-month', async () => {
    // Generate dates for last month
    const now = new Date()
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-15`

    const mockTransactions: Transaction[] = [
      {
        id: 1,
        transaction_date: lastMonthStr,
        description: 'Last month utility bill',
        amount: '2500.00',
        transaction_type: 'expense',
        category: 'Bills/Utilities',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      },
      {
        id: 2,
        transaction_date: getTodayString(), // in current month, should be filtered out
        description: 'Current month coffee',
        amount: '150.00',
        transaction_type: 'expense',
        category: 'Food/Dining',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      },
    ]

    fetchMock.mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/transactions/')) return jsonResponse(mockTransactions)
      return jsonResponse({}, 404)
    })

    // Render with period "last-month"
    renderOverview({
      period: 'last-month',
      periodLabel: 'Last month',
    })

    // Last month spending should only include 2500.00, not 150.00
    const matches = await screen.findAllByText('₹2,500.00')
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/total outflows in last month/i)).toBeInTheDocument()
    expect(screen.getByText('Bills/Utilities')).toBeInTheDocument()
    expect(screen.queryByText('Food/Dining')).not.toBeInTheDocument()
  })

  it('handles API loading failure and recovers with retry button', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/transactions/')) {
        return jsonResponse({ detail: 'Database error' }, 500)
      }
      return jsonResponse({}, 404)
    })

    renderOverview()

    expect(await screen.findByRole('alert')).toHaveTextContent(/the server ran into a problem|database error/i)

    // Setup success response for retry
    fetchMock.mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/transactions/')) {
        return jsonResponse([
          {
            id: 1,
            transaction_date: getTodayString(),
            description: 'Recovered item',
            amount: '300.00',
            transaction_type: 'expense',
            category: 'Shopping',
            predicted_category: null,
            prediction_confidence: null,
            is_reviewed: true,
          },
        ])
      }
      return jsonResponse({}, 404)
    })

    await user.click(screen.getByRole('button', { name: /try again/i }))

    const recoveredMatches = await screen.findAllByText('₹300.00')
    expect(recoveredMatches.length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not display a network error alert when requests are aborted during lifecycle cleanup', async () => {
    let callCount = 0
    fetchMock.mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/transactions/')) {
        callCount++
        if (callCount === 1) {
          const abortError = new Error('The user aborted a request.')
          abortError.name = 'AbortError'
          throw abortError
        }
        return jsonResponse([])
      }
      return jsonResponse({}, 404)
    })

    const { unmount } = renderOverview()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    unmount()
  })
})
