import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { saveToken } from '@/features/auth/session'
import type { GoalContribution, SavingsGoal, SavingsGoalsSummaryResponse } from '@/lib/api/types'
import { GoalsPage } from './GoalsPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

function renderGoalsPage() {
  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthProvider>
          <GoalsPage />
        </AuthProvider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

const sampleGoal1: SavingsGoal = {
  id: 1,
  user_id: 1,
  name: 'Emergency Fund',
  target_amount: '50000.00',
  target_date: '2026-12-31',
  status: 'in_progress',
  total_contributed: '20000.00',
  remaining_amount: '30000.00',
  progress_pct: 40.0,
  is_completed: false,
  is_on_track: true,
  days_remaining: 60,
  recent_contributions: [],
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

const sampleGoal2: SavingsGoal = {
  id: 2,
  user_id: 1,
  name: 'MacBook Air',
  target_amount: '90000.00',
  target_date: '2026-11-30',
  status: 'completed',
  total_contributed: '90000.00',
  remaining_amount: '0.00',
  progress_pct: 100.0,
  is_completed: true,
  is_on_track: true,
  days_remaining: 29,
  recent_contributions: [],
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-10-15T00:00:00Z',
}

const sampleSummary: SavingsGoalsSummaryResponse = {
  total_target_amount: '140000.00',
  total_saved_amount: '110000.00',
  total_remaining_amount: '30000.00',
  overall_progress_pct: 78.57,
  goals_count: 2,
  completed_goals_count: 1,
  items: [sampleGoal1, sampleGoal2],
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

describe('GoalsPage', () => {
  it('shows loading state, then renders summary metrics and goals', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/goals/')) {
        return jsonResponse(sampleSummary)
      }
      return jsonResponse({}, 404)
    })

    renderGoalsPage()

    // Loading indicator
    expect(screen.getByText('Loading savings goals…')).toBeInTheDocument()

    // Real content appears after data loads
    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })

    expect(screen.getByText('MacBook Air')).toBeInTheDocument()
    expect(screen.getByText('₹1,40,000.00')).toBeInTheDocument()
    expect(screen.getByText('₹1,10,000.00')).toBeInTheDocument()
    expect(screen.getAllByText('₹30,000.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('78.57%')).toBeInTheDocument()
  })

  it('renders empty state when user has no goals', async () => {
    const emptySummary: SavingsGoalsSummaryResponse = {
      total_target_amount: '0.00',
      total_saved_amount: '0.00',
      total_remaining_amount: '0.00',
      overall_progress_pct: 0,
      goals_count: 0,
      completed_goals_count: 0,
      items: [],
    }

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/goals/')) {
        return jsonResponse(emptySummary)
      }
      return jsonResponse({}, 404)
    })

    renderGoalsPage()

    await waitFor(() => {
      expect(screen.getByText('No savings goals yet')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Create your first goal' })).toBeInTheDocument()
  })

  it('handles API loading failure and recovers when clicking retry', async () => {
    let failGoals = true

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/goals/')) {
        if (failGoals) {
          return jsonResponse({ detail: 'Backend service error' }, 400)
        }
        return jsonResponse(sampleSummary)
      }
      return jsonResponse({}, 404)
    })

    renderGoalsPage()

    await waitFor(() => {
      expect(screen.getByText('Backend service error')).toBeInTheDocument()
    })

    failGoals = false
    const retryBtn = screen.getByRole('button', { name: /try again/i })
    await userEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })
  })

  it('filters goals using the status filter tabs', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/goals/')) {
        return jsonResponse(sampleSummary)
      }
      return jsonResponse({}, 404)
    })

    renderGoalsPage()

    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })
    expect(screen.getByText('MacBook Air')).toBeInTheDocument()

    // Click 'Completed' tab
    const completedTab = screen.getByRole('tab', { name: 'Completed' })
    await userEvent.click(completedTab)

    expect(screen.queryByText('Emergency Fund')).not.toBeInTheDocument()
    expect(screen.getByText('MacBook Air')).toBeInTheDocument()

    // Click 'In Progress' tab
    const inProgressTab = screen.getByRole('tab', { name: 'In Progress' })
    await userEvent.click(inProgressTab)

    expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    expect(screen.queryByText('MacBook Air')).not.toBeInTheDocument()
  })

  it('creates a new goal through the New Goal dialog', async () => {
    const user = userEvent.setup()
    let created = false

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.endsWith('/goals/') && method === 'POST') {
        created = true
        return jsonResponse(
          {
            ...sampleGoal1,
            id: 3,
            name: 'Home Renovation',
            target_amount: '200000.00',
          },
          201,
        )
      }
      if (url.includes('/goals/') && method === 'GET') {
        if (created) {
          return jsonResponse({
            ...sampleSummary,
            items: [
              ...sampleSummary.items,
              {
                ...sampleGoal1,
                id: 3,
                name: 'Home Renovation',
                target_amount: '200000.00',
              },
            ],
          })
        }
        return jsonResponse(sampleSummary)
      }
      return jsonResponse({}, 404)
    })

    renderGoalsPage()

    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })

    const newGoalBtn = screen.getByRole('button', { name: 'Create new savings goal' })
    await user.click(newGoalBtn)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('New Savings Goal')).toBeInTheDocument()

    // Fill form
    const nameInput = screen.getByLabelText(/Goal Name/i)
    const amountInput = screen.getByLabelText(/Target Amount/i)
    await user.type(nameInput, 'Home Renovation')
    await user.type(amountInput, '200000')

    const submitBtn = screen.getByRole('button', { name: 'Create Goal' })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText('Home Renovation')).toBeInTheDocument()
    })
  })

  it('records a contribution toward a goal via Add Savings dialog', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/contributions') && method === 'POST') {
        return jsonResponse(
          {
            ...sampleGoal1,
            total_contributed: '25000.00',
            remaining_amount: '25000.00',
            progress_pct: 50.0,
          },
          201,
        )
      }
      if (url.includes('/goals/')) {
        return jsonResponse(sampleSummary)
      }
      return jsonResponse({}, 404)
    })

    renderGoalsPage()

    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })

    const addSavingsBtn = screen.getByRole('button', { name: 'Add savings to Emergency Fund' })
    await user.click(addSavingsBtn)

    expect(screen.getByText('Record Savings')).toBeInTheDocument()
    expect(screen.getByText(/Contributing toward/i)).toBeInTheDocument()

    const amountInput = screen.getByLabelText(/Amount \(₹\)/i)
    await user.type(amountInput, '5000')

    const submitContribBtn = screen.getByRole('button', { name: 'Record Contribution' })
    await user.click(submitContribBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('opens contribution history dialog and loads past contributions', async () => {
    const user = userEvent.setup()
    const mockContributions: GoalContribution[] = [
      {
        id: 101,
        goal_id: 1,
        user_id: 1,
        amount: '10000.00',
        contribution_date: '2026-10-05',
        notes: 'Monthly SIP',
        created_at: '2026-10-05T00:00:00Z',
      },
      {
        id: 102,
        goal_id: 1,
        user_id: 1,
        amount: '10000.00',
        contribution_date: '2026-10-15',
        notes: 'Bonus',
        created_at: '2026-10-15T00:00:00Z',
      },
    ]

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/goals/1/contributions') && method === 'GET') {
        return jsonResponse(mockContributions)
      }
      if (url.includes('/goals/')) {
        return jsonResponse(sampleSummary)
      }
      return jsonResponse({}, 404)
    })

    renderGoalsPage()

    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })

    const historyBtn = screen.getByRole('button', { name: 'View contribution history for Emergency Fund' })
    await user.click(historyBtn)

    expect(screen.getByText('Contribution History')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Monthly SIP')).toBeInTheDocument()
      expect(screen.getByText('Bonus')).toBeInTheDocument()
    })

    const closeBtn = screen.getByRole('button', { name: 'Close' })
    await user.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('deletes a goal through the Delete confirmation dialog', async () => {
    const user = userEvent.setup()
    let deleted = false

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.endsWith('/goals/1') && method === 'DELETE') {
        deleted = true
        return new Response(null, { status: 204 })
      }
      if (url.includes('/goals/')) {
        if (deleted) {
          return jsonResponse({
            ...sampleSummary,
            items: [sampleGoal2],
          })
        }
        return jsonResponse(sampleSummary)
      }
      return jsonResponse({}, 404)
    })

    renderGoalsPage()

    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })

    const deleteBtn = screen.getByRole('button', { name: 'Delete Emergency Fund' })
    await user.click(deleteBtn)

    expect(screen.getByText('Delete Savings Goal')).toBeInTheDocument()
    expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument()

    const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete Goal' })
    await user.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.queryByText('Emergency Fund')).not.toBeInTheDocument()
    })
  })
})
