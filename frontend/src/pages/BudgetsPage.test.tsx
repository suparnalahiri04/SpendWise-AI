import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { saveToken } from '@/features/auth/session'
import type { BudgetProgressSummary } from '@/lib/api/types'
import { BudgetsPage } from './BudgetsPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

function renderBudgetsPage() {
  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthProvider>
          <BudgetsPage />
        </AuthProvider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

function sampleBudgetProgress(overrides?: Partial<BudgetProgressSummary>): BudgetProgressSummary {
  return {
    month: '2026-10',
    total_budgeted: '10000.00',
    total_spent: '6500.00',
    total_remaining: '3500.00',
    items: [
      {
        id: 1,
        category: 'Food/Dining',
        month: '2026-10',
        limit_amount: '5000.00',
        spent_amount: '2000.00',
        remaining_amount: '3000.00',
        percentage_used: 40.0,
        is_exceeded: false,
      },
      {
        id: 2,
        category: 'Shopping',
        month: '2026-10',
        limit_amount: '3000.00',
        spent_amount: '2700.00',
        remaining_amount: '300.00',
        percentage_used: 90.0,
        is_exceeded: false,
      },
      {
        id: 3,
        category: 'Entertainment',
        month: '2026-10',
        limit_amount: '2000.00',
        spent_amount: '2500.00',
        remaining_amount: '-500.00',
        percentage_used: 125.0,
        is_exceeded: true,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  saveToken('test-token-value')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('BudgetsPage', () => {
  it('shows loading state while fetching budgets, then displays real data', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse(sampleBudgetProgress())
      }
      return jsonResponse({}, 404)
    })

    renderBudgetsPage()

    // Loading indicator is present initially
    expect(screen.getByRole('status')).toBeInTheDocument()

    // Real content appears after data loads
    await waitFor(() => {
      expect(screen.getByText('Food/Dining')).toBeInTheDocument()
    })

    expect(screen.getByText('Shopping')).toBeInTheDocument()
    expect(screen.getByText('Entertainment')).toBeInTheDocument()

    // Summary cards reflect backend numbers
    expect(screen.getByText('10,000.00', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('6,500.00', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('3,500.00', { exact: false })).toBeInTheDocument()
  })

  it('displays visual status indicators for on-track, approaching limit, and over budget', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse(sampleBudgetProgress())
      }
      return jsonResponse({}, 404)
    })

    renderBudgetsPage()

    await waitFor(() => {
      expect(screen.getByText('On track')).toBeInTheDocument()
    })

    expect(screen.getByText('Approaching limit')).toBeInTheDocument()
    expect(screen.getByText('Over budget')).toBeInTheDocument()

    // Check remaining amounts text
    expect(screen.getByText('₹3,000.00 left')).toBeInTheDocument()
    expect(screen.getByText('₹300.00 left')).toBeInTheDocument()
    expect(screen.getByText('Over by ₹500.00')).toBeInTheDocument()
  })

  it('displays empty state when user has no budgets for the month', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
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

    renderBudgetsPage()

    await waitFor(() => {
      expect(screen.getByText(/No budgets for/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Set your first budget/i })).toBeInTheDocument()
  })

  it('handles API error and recovers with retry button', async () => {
    let callCount = 0
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/budgets/progress')) {
        callCount++
        if (callCount === 1) {
          return new Response(JSON.stringify({ detail: 'Database error' }), { status: 500 })
        }
        return jsonResponse(sampleBudgetProgress())
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderBudgetsPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    const retryButton = screen.getByRole('button', { name: /Try again/i })
    await user.click(retryButton)

    await waitFor(() => {
      expect(screen.getByText('Food/Dining')).toBeInTheDocument()
    })
  })

  it('switches months when clicking previous and next month buttons', async () => {
    const requestedMonths: string[] = []

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/budgets/progress')) {
        const match = /month=([\d-]+)/.exec(url)
        if (match) {
          requestedMonths.push(match[1])
        }
        return jsonResponse(sampleBudgetProgress())
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderBudgetsPage()

    await waitFor(() => {
      expect(screen.getByText('Food/Dining')).toBeInTheDocument()
    })

    // Click previous month
    const prevBtn = screen.getByRole('button', { name: /Previous month/i })
    await user.click(prevBtn)

    await waitFor(() => {
      expect(requestedMonths.length).toBeGreaterThan(1)
    })
  })

  it('opens Set Budget dialog, validates, and creates a new budget', async () => {
    let createdPayload: unknown = null
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.endsWith('/budgets/') && init?.method === 'POST') {
        createdPayload = JSON.parse(String(init.body))
        return jsonResponse(
          {
            id: 4,
            user_id: 1,
            category: 'Groceries',
            month: '2026-10',
            limit_amount: '4000.00',
            created_at: new Date().toISOString(),
          },
          201,
        )
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse(sampleBudgetProgress())
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderBudgetsPage()

    await waitFor(() => {
      expect(screen.getByText('Food/Dining')).toBeInTheDocument()
    })

    // Click "Set budget" button
    const setBudgetButtons = screen.getAllByRole('button', { name: /Set budget/i })
    await user.click(setBudgetButtons[0])

    // Dialog appears
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Set monthly budget/i })).toBeInTheDocument()
    })

    // Select category Groceries
    const select = screen.getByLabelText(/Category/i)
    await user.selectOptions(select, 'Groceries')

    // Enter limit amount
    const amountInput = screen.getByLabelText(/Monthly limit/i)
    await user.clear(amountInput)
    await user.type(amountInput, '4000')

    // Submit form
    const submitButton = screen.getByRole('button', { name: /^Set budget$/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(createdPayload).toEqual({
        category: 'Groceries',
        month: expect.any(String),
        limit_amount: 4000,
      })
    })
  })

  it('displays duplicate budget conflict error from backend in Set Budget dialog', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.endsWith('/budgets/') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ detail: "A budget for 'Food/Dining' in 2026-10 already exists." }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse(sampleBudgetProgress())
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderBudgetsPage()

    await waitFor(() => {
      expect(screen.getByText('Food/Dining')).toBeInTheDocument()
    })

    const setBudgetButtons = screen.getAllByRole('button', { name: /Set budget/i })
    await user.click(setBudgetButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Set monthly budget/i })).toBeInTheDocument()
    })

    const select = screen.getByLabelText(/Category/i)
    await user.selectOptions(select, 'Food/Dining')

    const amountInput = screen.getByLabelText(/Monthly limit/i)
    await user.type(amountInput, '5000')

    const submitButton = screen.getByRole('button', { name: /^Set budget$/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(
        screen.getByText("A budget for 'Food/Dining' in 2026-10 already exists."),
      ).toBeInTheDocument()
    })
  })

  it('opens Edit Budget dialog and submits updated limit', async () => {
    let updatedPayload: unknown = null
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/budgets/1') && init?.method === 'PUT') {
        updatedPayload = JSON.parse(String(init.body))
        return jsonResponse({
          id: 1,
          user_id: 1,
          category: 'Food/Dining',
          month: '2026-10',
          limit_amount: '6000.00',
          created_at: new Date().toISOString(),
        })
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse(sampleBudgetProgress())
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderBudgetsPage()

    await waitFor(() => {
      expect(screen.getByText('Food/Dining')).toBeInTheDocument()
    })

    const editButton = screen.getByRole('button', { name: /Edit Food\/Dining budget/i })
    await user.click(editButton)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Edit budget/i })).toBeInTheDocument()
    })

    const amountInput = screen.getByLabelText(/Monthly limit/i)
    await user.clear(amountInput)
    await user.type(amountInput, '6000')

    const saveButton = screen.getByRole('button', { name: /Save changes/i })
    await user.click(saveButton)

    await waitFor(() => {
      expect(updatedPayload).toEqual({
        category: 'Food/Dining',
        month: '2026-10',
        limit_amount: 6000,
      })
    })
  })

  it('opens Delete confirmation dialog and deletes the budget on confirm', async () => {
    let deletedId: string | null = null
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/budgets/1') && init?.method === 'DELETE') {
        deletedId = '1'
        return new Response(null, { status: 204 })
      }
      if (url.includes('/budgets/progress')) {
        return jsonResponse(sampleBudgetProgress())
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderBudgetsPage()

    await waitFor(() => {
      expect(screen.getByText('Food/Dining')).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /Delete Food\/Dining budget/i })
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Delete budget/i })).toBeInTheDocument()
    })

    const confirmButton = screen.getByRole('button', { name: /^Delete budget$/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(deletedId).toBe('1')
    })
  })
})

