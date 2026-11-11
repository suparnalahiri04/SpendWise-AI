import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { saveToken } from '@/features/auth/session'
import type { FinancialInsightsResponse } from '@/lib/api/types'
import { InsightsPage } from './InsightsPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

function renderInsightsPage() {
  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthProvider>
          <InsightsPage />
        </AuthProvider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

function sampleInsightsResponse(
  overrides?: Partial<FinancialInsightsResponse>,
): FinancialInsightsResponse {
  return {
    summary: {
      current_month: '2026-11',
      total_spent_current_month: '15000.00',
      total_spent_previous_month: '18000.00',
      projected_month_end_expense: '22000.00',
      savings_rate_percentage: 35.0,
      fixed_commitment_ratio: 20.0,
      month_over_month_change_pct: -16.7,
      ...overrides?.summary,
    },
    insights: overrides?.insights ?? [
      {
        id: 'mom-spending-2026-11',
        type: 'pattern',
        severity: 'positive',
        title: 'Month-over-month spending',
        description: 'Outflows are 16.7% lower compared to 2026-10.',
        category: null,
        amount: '3000.00',
        metric_label: '-16.7%',
        date: null,
      },
      {
        id: 'cat-decrease-dining-2026-11',
        type: 'pattern',
        severity: 'positive',
        title: 'Spending decrease in Dining',
        description: 'Spending in Dining decreased by ₹2,000.00 (-40.0%) compared to 2026-10.',
        category: 'Dining',
        amount: '2000.00',
        metric_label: '-40.0%',
        date: null,
      },
      {
        id: 'anomaly-tx-10-2026-11',
        type: 'anomaly',
        severity: 'warning',
        title: 'Unusual expense in Electronics',
        description:
          'Transaction of ₹25,000.00 on 2026-11-12 in Electronics is significantly higher than your typical average of ₹1,200.00.',
        category: 'Electronics',
        amount: '25000.00',
        metric_label: '+1983% vs avg',
        date: '2026-11-12',
      },
      {
        id: 'budget-warning-groceries-2026-11',
        type: 'recommendation',
        severity: 'warning',
        title: 'Approaching budget limit: Groceries',
        description: 'You have spent ₹4,200.00 of your ₹5,000.00 budget for Groceries (84.0% used).',
        category: 'Groceries',
        amount: '4200.00',
        metric_label: '84.0%',
        date: null,
      },
      {
        id: 'recurring-overdue-1-2026-11',
        type: 'recommendation',
        severity: 'warning',
        title: 'Overdue recurring payment: Internet Bill',
        description:
          'Scheduled monthly payment of ₹1,200.00 for Internet Bill was due on 2026-11-04 (6 days overdue).',
        category: 'Bills/Utilities',
        amount: '1200.00',
        metric_label: '6d overdue',
        date: '2026-11-04',
      },
    ],
  }
}

describe('InsightsPage', () => {
  beforeEach(() => {
    saveToken('fake-jwt-token')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows loading state, then renders summary metrics and insights', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/insights/')) {
        return jsonResponse(sampleInsightsResponse())
      }
      return jsonResponse({}, 404)
    })

    renderInsightsPage()

    // Loading indicator
    expect(screen.getByText(/Analyzing financial history for/i)).toBeInTheDocument()

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText('Month-over-month spending')).toBeInTheDocument()
    })

    // Check KPI cards
    expect(screen.getByText('₹15,000.00')).toBeInTheDocument()
    expect(screen.getByText('₹22,000.00')).toBeInTheDocument()
    expect(screen.getByText('35.0%')).toBeInTheDocument()
    expect(screen.getByText('20.0%')).toBeInTheDocument()

    // Check specific insight titles
    expect(screen.getByText('Spending decrease in Dining')).toBeInTheDocument()
    expect(screen.getByText('Unusual expense in Electronics')).toBeInTheDocument()
    expect(screen.getByText('Approaching budget limit: Groceries')).toBeInTheDocument()
    expect(screen.getByText('Overdue recurring payment: Internet Bill')).toBeInTheDocument()

    // Check metric labels
    expect(screen.getByText('-16.7%')).toBeInTheDocument()
    expect(screen.getByText('+1983% vs avg')).toBeInTheDocument()
    expect(screen.getByText('84.0%')).toBeInTheDocument()
    expect(screen.getByText('6d overdue')).toBeInTheDocument()
  })

  it('handles empty insights response and displays friendly empty state', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/insights/')) {
        return jsonResponse(sampleInsightsResponse({ insights: [] }))
      }
      return jsonResponse({}, 404)
    })

    renderInsightsPage()

    await waitFor(() => {
      expect(screen.getByText(/No notable insights (yet )?for this month/i)).toBeInTheDocument()
    })

    expect(
      screen.getByText(/SpendWise AI hasn't detected any spending spikes|No category spikes/i),
    ).toBeInTheDocument()
  })

  it('handles API error and recovers when clicking retry', async () => {
    const user = userEvent.setup()
    let hasFailedOnce = false

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/insights/')) {
        if (!hasFailedOnce) {
          hasFailedOnce = true
          return jsonResponse({ detail: 'Database connection failed' }, 500)
        }
        return jsonResponse(sampleInsightsResponse())
      }
      return jsonResponse({}, 404)
    })

    renderInsightsPage()

    await waitFor(() => {
      expect(screen.getByText('Failed to load insights')).toBeInTheDocument()
    })

    expect(
      screen.getByText('The server ran into a problem. Please try again in a moment.'),
    ).toBeInTheDocument()

    const retryBtn = screen.getByRole('button', { name: /try again/i })
    await user.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Month-over-month spending')).toBeInTheDocument()
    })
  })

  it('filters insights using tab buttons (All, Patterns, Anomalies, Budgets, Recurring)', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/insights/')) {
        return jsonResponse(sampleInsightsResponse())
      }
      return jsonResponse({}, 404)
    })

    renderInsightsPage()

    await waitFor(() => {
      expect(screen.getByText('Month-over-month spending')).toBeInTheDocument()
    })

    // Default: All 5 insights present
    const filterGroup = screen.getByRole('group', { name: /filter observations by category/i })
    expect(filterGroup).toBeInTheDocument()

    const allTab = screen.getByRole('button', { name: /^all/i })
    expect(allTab).toHaveAttribute('aria-pressed', 'true')

    expect(screen.getByText('Month-over-month spending')).toBeInTheDocument()
    expect(screen.getByText('Unusual expense in Electronics')).toBeInTheDocument()
    expect(screen.getByText('Approaching budget limit: Groceries')).toBeInTheDocument()
    expect(screen.getByText('Overdue recurring payment: Internet Bill')).toBeInTheDocument()

    // Filter by Anomalies
    const anomaliesTab = screen.getByRole('button', { name: /anomalies/i })
    expect(anomaliesTab).toHaveAttribute('aria-pressed', 'false')
    await user.click(anomaliesTab)
    expect(anomaliesTab).toHaveAttribute('aria-pressed', 'true')
    expect(allTab).toHaveAttribute('aria-pressed', 'false')

    expect(screen.getByText('Unusual expense in Electronics')).toBeInTheDocument()
    expect(screen.queryByText('Spending decrease in Dining')).not.toBeInTheDocument()
    expect(screen.queryByText('Approaching budget limit: Groceries')).not.toBeInTheDocument()
    expect(screen.queryByText('Overdue recurring payment: Internet Bill')).not.toBeInTheDocument()

    // Filter by Budgets
    const budgetsTab = screen.getByRole('button', { name: /budgets/i })
    await user.click(budgetsTab)

    expect(screen.getByText('Approaching budget limit: Groceries')).toBeInTheDocument()
    expect(screen.queryByText('Unusual expense in Electronics')).not.toBeInTheDocument()

    // Filter by Recurring
    const recurringTab = screen.getByRole('button', { name: /recurring/i })
    await user.click(recurringTab)

    expect(screen.getByText('Overdue recurring payment: Internet Bill')).toBeInTheDocument()
    expect(screen.queryByText('Approaching budget limit: Groceries')).not.toBeInTheDocument()

    // Filter by Patterns
    const patternsTab = screen.getByRole('button', { name: /patterns/i })
    await user.click(patternsTab)

    expect(screen.getByText('Month-over-month spending')).toBeInTheDocument()
    expect(screen.getByText('Spending decrease in Dining')).toBeInTheDocument()
    expect(screen.queryByText('Unusual expense in Electronics')).not.toBeInTheDocument()
  })

  it('switches months when clicking previous/next month in MonthSelector', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/insights/')) {
        return jsonResponse(sampleInsightsResponse())
      }
      return jsonResponse({}, 404)
    })

    renderInsightsPage()

    await waitFor(() => {
      expect(screen.getByText('Month-over-month spending')).toBeInTheDocument()
    })

    const prevMonthBtn = screen.getByRole('button', { name: /previous month/i })
    await user.click(prevMonthBtn)

    // Verify request URL included month parameter
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/insights/?month='),
        expect.anything(),
      )
    })
  })

  it('handles unavailable summary metrics with explicit explanatory hints without substituting zero', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/insights/')) {
        return jsonResponse(
          sampleInsightsResponse({
            summary: {
              current_month: '2026-11',
              total_spent_current_month: '5000.00',
              total_spent_previous_month: null,
              projected_month_end_expense: '15500.00',
              savings_rate_percentage: null,
              fixed_commitment_ratio: null,
              month_over_month_change_pct: null,
            },
            insights: [],
          }),
        )
      }
      return jsonResponse({}, 404)
    })

    renderInsightsPage()

    await waitFor(() => {
      expect(
        screen.getByText('Requires income recorded in this month'),
      ).toBeInTheDocument()
    })

    expect(
      screen.getByText('Requires income to calculate commitment ratio'),
    ).toBeInTheDocument()

    // Assert that placeholder "—" is rendered for the null values, not 0% or 0.00
    const noDataElements = screen.getAllByText('—')
    expect(noDataElements.length).toBeGreaterThanOrEqual(2)
  })

  it('renders cards cleanly with long titles and long category names like Bills/Utilities', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/insights/')) {
        return jsonResponse(
          sampleInsightsResponse({
            insights: [
              {
                id: 'cat-decrease-bills-utilities-2026-11',
                type: 'pattern',
                severity: 'positive',
                title: 'No spending in Bills/Utilities this month',
                description:
                  'No spending in Bills/Utilities this month, saving ₹3,500.00 compared to 2026-10.',
                category: 'Bills/Utilities',
                amount: '3500.00',
                metric_label: '-100.0%',
                date: null,
              },
              {
                id: 'cat-increase-transfers-repayments-2026-11',
                type: 'pattern',
                severity: 'warning',
                title: 'Spending increase in Transfers/Repayments',
                description:
                  'Spending in Transfers/Repayments increased by ₹12,000.00 (+80.0%) compared to 2026-10.',
                category: 'Transfers/Repayments',
                amount: '12000.00',
                metric_label: '+80.0%',
                date: null,
              },
            ],
          }),
        )
      }
      return jsonResponse({}, 404)
    })

    renderInsightsPage()

    await waitFor(() => {
      expect(
        screen.getByText('No spending in Bills/Utilities this month'),
      ).toBeInTheDocument()
    })

    expect(screen.getByText('Bills/Utilities')).toBeInTheDocument()
    expect(
      screen.getByText('Spending increase in Transfers/Repayments'),
    ).toBeInTheDocument()
    expect(screen.getByText('Transfers/Repayments')).toBeInTheDocument()
    expect(screen.getByText('-100.0%')).toBeInTheDocument()
    expect(screen.getByText('+80.0%')).toBeInTheDocument()
  })

  it('displays appropriate month-to-date messaging for zero spending in current month', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/insights/')) {
        return jsonResponse(
          sampleInsightsResponse({
            summary: {
              current_month: '2026-11',
              total_spent_current_month: '0.00',
              total_spent_previous_month: null,
              projected_month_end_expense: '0.00',
              savings_rate_percentage: null,
              fixed_commitment_ratio: null,
              month_over_month_change_pct: null,
            },
            insights: [],
          }),
        )
      }
      return jsonResponse({}, 404)
    })

    renderInsightsPage()

    await waitFor(() => {
      expect(screen.getAllByText('₹0.00').length).toBeGreaterThanOrEqual(1)
    })

    // Should indicate zero spending recorded so far
    expect(
      screen.getByText(/Zero spending recorded so far|No expenses recorded/i),
    ).toBeInTheDocument()
  })
})
