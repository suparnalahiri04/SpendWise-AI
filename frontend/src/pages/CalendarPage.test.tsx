import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { saveToken } from '@/features/auth/session'
import type {
  BudgetProgressSummary,
  RecurringPayment,
  SavingsGoalsSummaryResponse,
  Transaction,
} from '@/lib/api/types'
import { CalendarPage } from './CalendarPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

function renderCalendarPage(props: { initialMonth?: string; initialDate?: string; refDate?: Date } = {}) {
  const { initialMonth = '2026-10', initialDate = '2026-10-15', refDate = new Date(2026, 9, 15) } = props
  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthProvider>
          <CalendarPage initialMonth={initialMonth} initialDate={initialDate} refDate={refDate} />
        </AuthProvider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

const sampleTransactions: Transaction[] = [
  {
    id: 1,
    transaction_date: '2026-10-01',
    description: 'Monthly Salary',
    amount: '75000.00',
    transaction_type: 'income',
    category: 'Income',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
  {
    id: 2,
    transaction_date: '2026-10-05',
    description: 'Grocery Run',
    amount: '3200.00',
    transaction_type: 'expense',
    category: 'Groceries',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
  {
    id: 3,
    transaction_date: '2026-10-15',
    description: 'Electric Utility',
    amount: '1850.00',
    transaction_type: 'expense',
    category: 'Bills/Utilities',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
  // Previous month transaction (excluded from Oct summary)
  {
    id: 4,
    transaction_date: '2026-09-25',
    description: 'September Flight',
    amount: '5000.00',
    transaction_type: 'expense',
    category: 'Transport',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
]

const sampleRecurring: RecurringPayment[] = [
  {
    id: 10,
    user_id: 1,
    description: 'Fiber Internet',
    amount: '1200.00',
    category: 'Bills/Utilities',
    frequency: 'monthly',
    start_date: '2026-01-15',
    next_due_date: '2026-10-15',
    status: 'active',
    is_active: true,
    is_overdue: false,
    days_until_due: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 11,
    user_id: 1,
    description: 'Cloud Server',
    amount: '800.00',
    category: 'Bills/Utilities',
    frequency: 'monthly',
    start_date: '2026-01-05',
    next_due_date: '2026-10-05',
    status: 'active',
    is_active: true,
    is_overdue: true,
    days_until_due: -10,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

const sampleGoalsSummary: SavingsGoalsSummaryResponse = {
  total_target_amount: '50000.00',
  total_saved_amount: '20000.00',
  total_remaining_amount: '30000.00',
  overall_progress_pct: 40.0,
  goals_count: 1,
  completed_goals_count: 0,
  items: [
    {
      id: 20,
      user_id: 1,
      name: 'Emergency Fund',
      target_amount: '50000.00',
      target_date: '2026-10-15',
      status: 'in_progress',
      total_contributed: '20000.00',
      remaining_amount: '30000.00',
      progress_pct: 40.0,
      is_completed: false,
      is_on_track: true,
      days_remaining: 0,
      recent_contributions: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
}

const sampleBudgetProgress: BudgetProgressSummary = {
  month: '2026-10',
  total_budgeted: '40000.00',
  total_spent: '5050.00',
  total_remaining: '34950.00',
  items: [],
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

describe('CalendarPage', () => {
  it('shows loading state, then renders monthly summary metrics and calendar grid', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/transactions/')) {
        return jsonResponse(sampleTransactions)
      }
      if (url.includes('/recurring-payments/')) {
        return jsonResponse(sampleRecurring)
      }
      if (url.includes('/goals/')) {
        return jsonResponse(sampleGoalsSummary)
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse(sampleBudgetProgress)
      }
      return jsonResponse({}, 404)
    })

    renderCalendarPage()

    // Loading indicator
    expect(screen.getByText('Loading financial calendar…')).toBeInTheDocument()

    // Real content appears
    await waitFor(() => {
      expect(screen.getByText('Financial Calendar')).toBeInTheDocument()
    })

    // StatCard monthly numbers (75,000 income, 5,050 expenses, 69,950 net flow)
    expect(screen.getByText('₹75,000.00')).toBeInTheDocument()
    expect(screen.getByText('₹5,050.00')).toBeInTheDocument()
    expect(screen.getByText('₹69,950.00')).toBeInTheDocument()

    // Active bills due (1200 + 800 = 2000)
    expect(screen.getByText('₹2,000.00')).toBeInTheDocument()

    // Overdue banner present because id 11 is overdue
    expect(screen.getByRole('alert')).toHaveTextContent(/1 bill overdue totaling ₹800.00/i)

    // Calendar grid
    expect(screen.getByRole('grid', { name: 'Financial Calendar Grid' })).toBeInTheDocument()
  })

  it('navigates previous and next months via header controls', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/transactions/')) {
        return jsonResponse(sampleTransactions)
      }
      if (url.includes('/recurring-payments/')) {
        return jsonResponse(sampleRecurring)
      }
      if (url.includes('/goals/')) {
        return jsonResponse(sampleGoalsSummary)
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse(sampleBudgetProgress)
      }
      return jsonResponse({}, 404)
    })

    renderCalendarPage()

    await waitFor(() => {
      expect(screen.getByText('Financial Calendar')).toBeInTheDocument()
    })

    // Click Previous Month
    const prevBtn = screen.getByRole('button', { name: 'Previous month' })
    await user.click(prevBtn)

    // Click Next Month twice
    const nextBtn = screen.getByRole('button', { name: 'Next month' })
    await user.click(nextBtn)
    await user.click(nextBtn)

    // Click Today
    const todayBtn = screen.getByRole('button', { name: 'Go to today' })
    await user.click(todayBtn)

    expect(screen.getByText('Financial Calendar')).toBeInTheDocument()
  })

  it('inspects events when a date cell is selected in the grid', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/transactions/')) {
        return jsonResponse(sampleTransactions)
      }
      if (url.includes('/recurring-payments/')) {
        return jsonResponse(sampleRecurring)
      }
      if (url.includes('/goals/')) {
        return jsonResponse(sampleGoalsSummary)
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse(sampleBudgetProgress)
      }
      return jsonResponse({}, 404)
    })

    renderCalendarPage()

    await waitFor(() => {
      expect(screen.getByText('Financial Calendar')).toBeInTheDocument()
    })

    // Click on date cell October 1
    const cellOct1 = screen.getByRole('gridcell', { name: /2026-10-01/ })
    await user.click(cellOct1)

    // DayEventsPanel updates with Monthly Salary
    await waitFor(() => {
      expect(screen.getByText('Monthly Salary')).toBeInTheDocument()
    })
    expect(screen.getByText('Income record')).toBeInTheDocument()

    // Click on date cell October 15 (has transaction, recurring bill, and milestone)
    const cellOct15 = screen.getByRole('gridcell', { name: /2026-10-15/ })
    await user.click(cellOct15)

    await waitFor(() => {
      expect(screen.getByText('Electric Utility')).toBeInTheDocument()
      expect(screen.getByText('Fiber Internet')).toBeInTheDocument()
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })
  })

  it('handles API loading failure and recovers when clicking retry', async () => {
    let failMode = true

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (failMode && url.includes('/transactions/')) {
        return jsonResponse({ detail: 'Database connection failed' }, 400)
      }
      if (url.includes('/transactions/')) {
        return jsonResponse(sampleTransactions)
      }
      if (url.includes('/recurring-payments/')) {
        return jsonResponse(sampleRecurring)
      }
      if (url.includes('/goals/')) {
        return jsonResponse(sampleGoalsSummary)
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse(sampleBudgetProgress)
      }
      return jsonResponse({}, 404)
    })

    renderCalendarPage()

    await waitFor(() => {
      expect(screen.getByText('Database connection failed')).toBeInTheDocument()
    })

    failMode = false
    const retryBtn = screen.getByRole('button', { name: /try again/i })
    await userEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Financial Calendar')).toBeInTheDocument()
    })
  })

  it('displays empty placeholders when user has no transactions or commitments', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/transactions/')) {
        return jsonResponse([])
      }
      if (url.includes('/recurring-payments/')) {
        return jsonResponse([])
      }
      if (url.includes('/goals/')) {
        return jsonResponse({
          total_target_amount: '0.00',
          total_saved_amount: '0.00',
          total_remaining_amount: '0.00',
          overall_progress_pct: 0,
          goals_count: 0,
          completed_goals_count: 0,
          items: [],
        })
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse({
          month: '2026-10',
          total_budgeted: '0.00',
          total_spent: '0.00',
          total_remaining: '0.00',
          items: [],
        })
      }
      return jsonResponse({}, 404)
    })

    renderCalendarPage()

    await waitFor(() => {
      expect(screen.getByText('Financial Calendar')).toBeInTheDocument()
    })

    expect(screen.getAllByText('₹0.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('No bills due this month')).toBeInTheDocument()
    expect(screen.getByText('No financial events recorded')).toBeInTheDocument()
  })
})
