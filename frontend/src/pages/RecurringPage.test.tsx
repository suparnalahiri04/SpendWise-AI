import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { saveToken } from '@/features/auth/session'
import type { RecurringPayment, RecurringPaymentSummary } from '@/lib/api/types'
import { RecurringPage } from './RecurringPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

function renderRecurringPage() {
  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthProvider>
          <RecurringPage />
        </AuthProvider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

function samplePayments(): RecurringPayment[] {
  return [
    {
      id: 1,
      user_id: 1,
      description: 'Netflix',
      amount: '649.00',
      category: 'Entertainment',
      frequency: 'monthly',
      start_date: '2026-10-01',
      next_due_date: '2026-11-05',
      status: 'active',
      is_active: true,
      is_overdue: false,
      days_until_due: 5,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 2,
      user_id: 1,
      description: 'Electricity Bill',
      amount: '1200.00',
      category: 'Bills/Utilities',
      frequency: 'monthly',
      start_date: '2026-09-25',
      next_due_date: '2026-10-25',
      status: 'active',
      is_active: true,
      is_overdue: true,
      days_until_due: -6,
      created_at: '2026-09-25T00:00:00Z',
      updated_at: '2026-09-25T00:00:00Z',
    },
    {
      id: 3,
      user_id: 1,
      description: 'Gym Membership',
      amount: '1500.00',
      category: 'Healthcare',
      frequency: 'monthly',
      start_date: '2026-08-01',
      next_due_date: '2026-09-01',
      status: 'cancelled',
      is_active: false,
      is_overdue: false,
      days_until_due: -60,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
  ]
}

function sampleSummary(): RecurringPaymentSummary {
  const payments = samplePayments()
  return {
    total_active_count: 2,
    total_monthly_commitment: '1849.00',
    upcoming_count: 1,
    upcoming_total: '649.00',
    overdue_count: 1,
    overdue_total: '1200.00',
    upcoming_items: [payments[0]],
    overdue_items: [payments[1]],
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

describe('RecurringPage', () => {
  it('shows loading state, then renders recurring payments and summary metrics', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/recurring-payments/summary')) {
        return jsonResponse(sampleSummary())
      }
      if (url.includes('/recurring-payments/')) {
        return jsonResponse([samplePayments()[0], samplePayments()[1]])
      }
      return jsonResponse({}, 404)
    })

    renderRecurringPage()

    expect(screen.getByRole('status')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    expect(screen.getByText('Electricity Bill')).toBeInTheDocument()

    // Summary metrics
    expect(screen.getByText('1,849.00', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Due in 5 days')).toBeInTheDocument()
    expect(screen.getByText('Overdue by 6 days')).toBeInTheDocument()
  })

  it('displays empty state when user has no recurring schedules', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/recurring-payments/summary')) {
        return jsonResponse({
          total_active_count: 0,
          total_monthly_commitment: '0.00',
          upcoming_count: 0,
          upcoming_total: '0.00',
          overdue_count: 0,
          overdue_total: '0.00',
          upcoming_items: [],
          overdue_items: [],
        })
      }
      if (url.includes('/recurring-payments/')) {
        return jsonResponse([])
      }
      return jsonResponse({}, 404)
    })

    renderRecurringPage()

    await waitFor(() => {
      expect(screen.getByText(/No recurring payments yet/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Add your first schedule/i })).toBeInTheDocument()
  })

  it('handles API error and recovers with retry button', async () => {
    let attempts = 0
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/recurring-payments/summary')) {
        return jsonResponse(sampleSummary())
      }
      if (url.includes('/recurring-payments/')) {
        attempts++
        if (attempts === 1) {
          return new Response(JSON.stringify({ detail: 'Server error' }), { status: 500 })
        }
        return jsonResponse([samplePayments()[0]])
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderRecurringPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    const retryButton = screen.getByRole('button', { name: /Try again/i })
    await user.click(retryButton)

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })
  })

  it('filters schedules using tab buttons (Active, Upcoming, Overdue, Cancelled)', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/recurring-payments/summary')) {
        return jsonResponse(sampleSummary())
      }
      if (url.includes('/recurring-payments/')) {
        if (url.includes('status=cancelled')) {
          return jsonResponse([samplePayments()[2]])
        }
        return jsonResponse([samplePayments()[0], samplePayments()[1]])
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderRecurringPage()

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })
    expect(screen.getByText('Electricity Bill')).toBeInTheDocument()

    const filterGroup = screen.getByRole('group', { name: /filter recurring schedules by status/i })
    expect(filterGroup).toBeInTheDocument()

    const activeTab = screen.getByRole('button', { name: /^Active$/i })
    expect(activeTab).toHaveAttribute('aria-pressed', 'true')

    // Switch to Overdue tab
    const overdueTab = screen.getByRole('button', { name: /^Overdue$/i })
    expect(overdueTab).toHaveAttribute('aria-pressed', 'false')
    await user.click(overdueTab)

    expect(overdueTab).toHaveAttribute('aria-pressed', 'true')
    expect(activeTab).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Electricity Bill')).toBeInTheDocument()
    expect(screen.queryByText('Netflix')).not.toBeInTheDocument()

    // Switch to Upcoming tab
    const upcomingTab = screen.getByRole('button', { name: /^Upcoming$/i })
    await user.click(upcomingTab)

    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.queryByText('Electricity Bill')).not.toBeInTheDocument()

    // Switch to Cancelled tab
    const cancelledTab = screen.getByRole('button', { name: /^Cancelled$/i })
    await user.click(cancelledTab)

    await waitFor(() => {
      expect(screen.getByText('Gym Membership')).toBeInTheDocument()
    })
  })

  it('opens Add Recurring dialog and submits a new schedule', async () => {
    let createdPayload: unknown = null
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.endsWith('/recurring-payments/') && init?.method === 'POST') {
        createdPayload = JSON.parse(String(init.body))
        return jsonResponse(
          {
            id: 10,
            user_id: 1,
            description: 'Spotify Premium',
            amount: '119.00',
            category: 'Entertainment',
            frequency: 'monthly',
            start_date: '2026-10-31',
            next_due_date: '2026-11-30',
            status: 'active',
            is_active: true,
            is_overdue: false,
            days_until_due: 30,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          201,
        )
      }
      if (url.includes('/recurring-payments/summary')) {
        return jsonResponse(sampleSummary())
      }
      if (url.includes('/recurring-payments/')) {
        return jsonResponse([samplePayments()[0]])
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderRecurringPage()

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    const addButtons = screen.getAllByRole('button', { name: /Add schedule/i })
    await user.click(addButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Add recurring payment/i })).toBeInTheDocument()
    })

    // Fill form
    const descInput = screen.getByLabelText(/Description/i)
    await user.type(descInput, 'Spotify Premium')

    const amountInput = screen.getByLabelText(/Amount/i)
    await user.type(amountInput, '119.00')

    const catSelect = screen.getByLabelText(/Category/i)
    await user.selectOptions(catSelect, 'Entertainment')

    const submitBtn = screen.getByRole('button', { name: /Schedule payment/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(createdPayload).toEqual({
        description: 'Spotify Premium',
        amount: 119,
        category: 'Entertainment',
        frequency: 'monthly',
        start_date: expect.any(String),
        next_due_date: expect.any(String),
      })
    })
  })

  it('opens Edit dialog and updates payment details', async () => {
    let updatedPayload: unknown = null
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/recurring-payments/1') && init?.method === 'PUT') {
        updatedPayload = JSON.parse(String(init.body))
        return jsonResponse({
          ...samplePayments()[0],
          amount: '749.00',
        })
      }
      if (url.includes('/recurring-payments/summary')) {
        return jsonResponse(sampleSummary())
      }
      if (url.includes('/recurring-payments/')) {
        return jsonResponse([samplePayments()[0]])
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderRecurringPage()

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    const editBtn = screen.getByRole('button', { name: /Edit Netflix schedule/i })
    await user.click(editBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Edit recurring payment/i })).toBeInTheDocument()
    })

    const amountInput = screen.getByLabelText(/Amount/i)
    await user.clear(amountInput)
    await user.type(amountInput, '749.00')

    const saveBtn = screen.getByRole('button', { name: /Save changes/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(updatedPayload).toEqual({
        description: 'Netflix',
        amount: 749,
        category: 'Entertainment',
        frequency: 'monthly',
        next_due_date: '2026-11-05',
        status: 'active',
      })
    })
  })

  it('opens Cancel dialog and confirms cancellation', async () => {
    let cancelledId: string | null = null
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'user@example.com' })
      }
      if (url.includes('/recurring-payments/1/cancel') && init?.method === 'PATCH') {
        cancelledId = '1'
        return jsonResponse({
          ...samplePayments()[0],
          status: 'cancelled',
          is_active: false,
        })
      }
      if (url.includes('/recurring-payments/summary')) {
        return jsonResponse(sampleSummary())
      }
      if (url.includes('/recurring-payments/')) {
        return jsonResponse([samplePayments()[0]])
      }
      return jsonResponse({}, 404)
    })

    const user = userEvent.setup()
    renderRecurringPage()

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    const cancelBtn = screen.getByRole('button', { name: /Cancel Netflix schedule/i })
    await user.click(cancelBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Cancel recurring payment/i })).toBeInTheDocument()
    })

    const confirmBtn = screen.getByRole('button', { name: /^Cancel schedule$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(cancelledId).toBe('1')
    })
  })
})

