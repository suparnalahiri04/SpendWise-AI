import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { saveToken } from '@/features/auth/session'
import { PeriodProvider } from '@/features/period/PeriodProvider'
import { PeriodContext, type PeriodContextValue, usePeriod } from '@/features/period/period'
import type { Transaction } from '@/lib/api/types'
import { formatConfidenceLabel, isHighConfidencePrediction } from '@/lib/format'
import { TransactionsPage } from './TransactionsPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn<typeof fetch>()

/** Six records shaped exactly like the backend's TransactionResponse (Decimals as strings). */
function sixTransactions(): Transaction[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    transaction_date: '2026-03-14',
    description: `Transaction ${index + 1}`,
    amount: '125.50',
    transaction_type: index % 2 === 0 ? 'expense' : 'income',
    category: 'Other',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  }))
}

function renderPage(periodContextOverride?: Partial<PeriodContextValue>) {
  if (periodContextOverride) {
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
              <TransactionsPage />
            </PeriodContext.Provider>
          </AuthProvider>
        </MemoryRouter>
      </MotionConfig>,
    )
  }

  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthProvider>
          <PeriodProvider>
            <TransactionsPage />
          </PeriodProvider>
        </AuthProvider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

/** Calls to the transactions endpoint (AuthProvider may also call /auth/me). */
function transactionCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/transactions/'))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-03-20T12:00:00Z'))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  saveToken('test-token-value')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  fetchMock.mockReset()
})

describe('TransactionsPage', () => {
  it('shows a loading state, then the real records returned by the API', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me')
        ? jsonResponse({ id: 1, email: 'jane@example.com' })
        : jsonResponse([
            {
              id: 7,
              transaction_date: '2026-03-14',
              description: 'Swiggy dinner order',
              amount: '450.50',
              transaction_type: 'expense',
              category: 'Food',
              predicted_category: 'Food',
              prediction_confidence: '0.91',
              is_reviewed: false,
            },
            {
              id: 6,
              transaction_date: '2026-03-01',
              description: 'Monthly salary',
              amount: '50000.00',
              transaction_type: 'income',
              category: 'Salary',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
          ]),
    )

    renderPage()
    expect(screen.getByText(/loading your transactions/i)).toBeInTheDocument()

    expect(await screen.findByText('Swiggy dinner order')).toBeInTheDocument()
    expect(screen.getByText('Monthly salary')).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('To review')).toBeInTheDocument()
    expect(screen.getByText(/450\.50/)).toBeInTheDocument()
    expect(screen.getByText(/50,000\.00/)).toBeInTheDocument()
    expect(screen.queryByText(/loading your transactions/i)).not.toBeInTheDocument()

    // The request carried the Bearer token
    const headers = transactionCalls()[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-token-value')
  })

  it('shows an empty state when the user has no transactions', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me') ? jsonResponse({ id: 1, email: 'jane@example.com' }) : jsonResponse([]),
    )

    renderPage()

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
  })

  it('shows an error state with retry when the request fails, and recovers', async () => {
    let transactionRequests = 0
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'jane@example.com' })
      transactionRequests += 1
      return transactionRequests === 1 ? jsonResponse({ detail: 'boom' }, 500) : jsonResponse([])
    })

    renderPage()

    expect(await screen.findByText("We couldn't load your transactions")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    await waitFor(() => expect(transactionCalls()).toHaveLength(2))
  })

  it('shows a network error message when the backend is unreachable', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'jane@example.com' })
      throw new TypeError('Failed to fetch')
    })

    renderPage()

    expect(await screen.findByText(/couldn't reach the spendwise server/i)).toBeInTheDocument()
  })

  it('opens Add Transaction dialog and adds newly created transaction immediately', async () => {
    let currentTransactions: Transaction[] = sixTransactions()

    fetchMock.mockImplementation(async (url, init) => {
      const u = String(url)
      if (u.endsWith('/auth/me')) {
        return jsonResponse({ id: 1, email: 'jane@example.com' })
      }
      if (u.endsWith('/transactions/') && init?.method === 'POST') {
        const payload = JSON.parse(init?.body as string)
        const newRecord = {
          id: 999,
          transaction_date: payload.transaction_date,
          description: payload.description,
          amount: String(payload.amount),
          transaction_type: payload.transaction_type,
          category: payload.category || 'Food/Dining',
          predicted_category: payload.category ? null : 'Food/Dining',
          prediction_confidence: payload.category ? null : '0.92',
          is_reviewed: Boolean(payload.category),
        }
        currentTransactions = [newRecord, ...currentTransactions]
        return jsonResponse(newRecord, 201)
      }
      return jsonResponse(currentTransactions)
    })

    renderPage()
    await screen.findByText('Transaction 1')

    // Click Add Transaction button in header actions
    const addButtons = screen.getAllByRole('button', { name: /add transaction/i })
    await userEvent.click(addButtons[0])

    // Dialog appears
    expect(await screen.findByRole('heading', { name: /record transaction/i })).toBeInTheDocument()

    // Fill form
    await userEvent.type(screen.getByLabelText(/description/i), 'Swiggy Biryani')
    await userEvent.type(screen.getByLabelText(/amount/i), '450')

    // Submit
    const saveBtn = screen.getByRole('button', { name: /save transaction/i })
    await userEvent.click(saveBtn)

    // Check fetch calls
    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls.length).toBe(1)

    // Wait for dialog content to fully unmount and body scroll lock to release
    await waitFor(() => {
      expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
    })

    // Now verify new transaction is rendered in the table
    await waitFor(() => {
      expect(screen.getByText('Swiggy Biryani')).toBeInTheDocument()
    })
  })

  it('shows an error, not the empty state, when the response is not an array', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me')
        ? jsonResponse({ id: 1, email: 'jane@example.com' })
        : jsonResponse({ items: [] }),
    )

    renderPage()

    expect(await screen.findByText("We couldn't load your transactions")).toBeInTheDocument()
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument()
  })

  it('never shows the empty state while loading or when records exist', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me')
        ? jsonResponse({ id: 1, email: 'jane@example.com' })
        : jsonResponse(sixTransactions()),
    )

    renderPage()
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument()

    await screen.findByText('Transaction 1')
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument()
  })

  it('renders all six returned records under React StrictMode (effects run, abort and re-run)', async () => {
    // Abort-aware fetch, like the browser: rejects with AbortError once the signal is aborted.
    fetchMock.mockImplementation(
      (url, init) =>
        new Promise<Response>((resolve, reject) => {
          const signal = init?.signal
          const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
          if (signal?.aborted) return onAbort()
          signal?.addEventListener('abort', onAbort)
          setTimeout(() => {
            if (signal?.aborted) return
            resolve(
              String(url).endsWith('/auth/me')
                ? jsonResponse({ id: 4, email: 'jane@example.com' })
                : jsonResponse(sixTransactions()),
            )
          }, 10)
        }),
    )

    render(
      <StrictMode>
        <MemoryRouter>
          <AuthProvider>
            <PeriodProvider>
              <TransactionsPage />
            </PeriodProvider>
          </AuthProvider>
        </MemoryRouter>
      </StrictMode>,
    )

    for (let i = 1; i <= 6; i += 1) {
      expect(await screen.findByText(`Transaction ${i}`)).toBeInTheDocument()
    }
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument()
    expect(screen.queryByText("We couldn't load your transactions")).not.toBeInTheDocument()
  })

  it('opens Edit Transaction dialog from row action and updates the transaction', async () => {
    const user = userEvent.setup()
    let currentTransactions: Transaction[] = [
      {
        id: 10,
        transaction_date: '2026-03-20',
        description: 'Swiggy Biryani',
        amount: '450.00',
        transaction_type: 'expense',
        category: 'Other',
        predicted_category: 'Other',
        prediction_confidence: '0.40',
        is_reviewed: false,
      },
    ]

    fetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) {
        return jsonResponse({ id: 1, email: 'jane@example.com' })
      }
      if (urlStr.endsWith('/transactions/10') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body))
        const updated: Transaction = {
          ...currentTransactions[0],
          ...body,
          amount: String(body.amount) + '.00',
          is_reviewed: true,
        }
        currentTransactions = [updated]
        return jsonResponse(updated)
      }
      if (urlStr.endsWith('/transactions/')) {
        return jsonResponse(currentTransactions)
      }
      return jsonResponse({}, 404)
    })

    renderPage()

    expect(await screen.findByText('Swiggy Biryani')).toBeInTheDocument()
    expect(screen.getByText('To review')).toBeInTheDocument()

    // Click row edit button
    const editBtn = screen.getByRole('button', { name: /edit swiggy biryani/i })
    await user.click(editBtn)

    // Edit dialog appears
    const dialog = await screen.findByRole('dialog', { name: /edit transaction/i })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/description/i)).toHaveValue('Swiggy Biryani')

    // Change category to Food/Dining
    const categorySelect = within(dialog).getByLabelText(/category/i)
    await user.selectOptions(categorySelect, 'Food/Dining')

    // Submit
    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    await user.click(saveBtn)

    // Modal closes and table displays updated reviewed status and Food/Dining category
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /edit transaction/i })).not.toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    expect(within(table).getByText('Food/Dining')).toBeInTheDocument()
    expect(within(table).getByText('Reviewed')).toBeInTheDocument()
  })

  it('displays in-period transactions and hides out-of-period transactions', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me')
        ? jsonResponse({ id: 1, email: 'jane@example.com' })
        : jsonResponse([
            {
              id: 1,
              transaction_date: '2026-03-10',
              description: 'In-period Swiggy lunch',
              amount: '350.00',
              transaction_type: 'expense',
              category: 'Food',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
            {
              id: 2,
              transaction_date: '2026-02-15',
              description: 'Out-of-period February rent',
              amount: '15000.00',
              transaction_type: 'expense',
              category: 'Housing',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
          ]),
    )

    renderPage()

    expect(await screen.findByText('In-period Swiggy lunch')).toBeInTheDocument()
    expect(screen.queryByText('Out-of-period February rent')).not.toBeInTheDocument()
  })

  it('updates visible rows when the selected period changes', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me')
        ? jsonResponse({ id: 1, email: 'jane@example.com' })
        : jsonResponse([
            {
              id: 1,
              transaction_date: '2026-03-10',
              description: 'March Electricity Bill',
              amount: '1200.00',
              transaction_type: 'expense',
              category: 'Utilities',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
            {
              id: 2,
              transaction_date: '2026-02-15',
              description: 'February Internet Bill',
              amount: '999.00',
              transaction_type: 'expense',
              category: 'Utilities',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
          ]),
    )

    function SwitchPeriodHarness() {
      const { setPeriod } = usePeriod()
      return (
        <div>
          <button type="button" onClick={() => setPeriod('last-month')}>
            Switch to Last Month
          </button>
          <TransactionsPage />
        </div>
      )
    }

    render(
      <MotionConfig reducedMotion="always">
        <MemoryRouter>
          <AuthProvider>
            <PeriodProvider>
              <SwitchPeriodHarness />
            </PeriodProvider>
          </AuthProvider>
        </MemoryRouter>
      </MotionConfig>,
    )

    // Initially in "this-month" (March): March bill is visible, February bill is hidden
    expect(await screen.findByText('March Electricity Bill')).toBeInTheDocument()
    expect(screen.queryByText('February Internet Bill')).not.toBeInTheDocument()

    // Switch period to "last-month" (February)
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Last Month' }))

    // Now February bill is visible, March bill is hidden
    expect(await screen.findByText('February Internet Bill')).toBeInTheDocument()
    expect(screen.queryByText('March Electricity Bill')).not.toBeInTheDocument()
  })

  it('displays all transactions across time and updates PeriodBadge when switching to All time', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me')
        ? jsonResponse({ id: 1, email: 'jane@example.com' })
        : jsonResponse([
            {
              id: 1,
              transaction_date: '2026-03-10',
              description: 'March Electricity Bill',
              amount: '1200.00',
              transaction_type: 'expense',
              category: 'Bills',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
            {
              id: 2,
              transaction_date: '2026-02-15',
              description: 'February Internet Bill',
              amount: '800.00',
              transaction_type: 'expense',
              category: 'Bills',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
            {
              id: 3,
              transaction_date: '2025-11-20',
              description: 'Prior Year Equipment',
              amount: '5000.00',
              transaction_type: 'expense',
              category: 'Shopping',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
          ]),
    )

    function SwitchToAllHarness() {
      const { setPeriod } = usePeriod()
      return (
        <div>
          <button type="button" onClick={() => setPeriod('all')}>
            Switch to All Time
          </button>
          <button type="button" onClick={() => setPeriod('this-month')}>
            Switch to This Month
          </button>
          <TransactionsPage />
        </div>
      )
    }

    render(
      <MotionConfig reducedMotion="always">
        <MemoryRouter>
          <AuthProvider>
            <PeriodProvider>
              <SwitchToAllHarness />
            </PeriodProvider>
          </AuthProvider>
        </MemoryRouter>
      </MotionConfig>,
    )

    // Initially in "this-month" (March): only March bill is visible
    expect(await screen.findByText('March Electricity Bill')).toBeInTheDocument()
    expect(screen.queryByText('February Internet Bill')).not.toBeInTheDocument()
    expect(screen.queryByText('Prior Year Equipment')).not.toBeInTheDocument()
    expect(screen.getByText('Period: This month')).toBeInTheDocument()

    // Switch period to "all" (All time)
    await userEvent.click(screen.getByRole('button', { name: 'Switch to All Time' }))

    // All three transactions across March 2026, February 2026, and November 2025 are visible
    expect(await screen.findByText('March Electricity Bill')).toBeInTheDocument()
    expect(screen.getByText('February Internet Bill')).toBeInTheDocument()
    expect(screen.getByText('Prior Year Equipment')).toBeInTheDocument()
    // PeriodBadge reflects All time
    expect(screen.getByText('Period: All time')).toBeInTheDocument()

    // Switch back to "this-month"
    await userEvent.click(screen.getByRole('button', { name: 'Switch to This Month' }))
    expect(await screen.findByText('March Electricity Bill')).toBeInTheDocument()
    expect(screen.queryByText('February Internet Bill')).not.toBeInTheDocument()
    expect(screen.queryByText('Prior Year Equipment')).not.toBeInTheDocument()
    expect(screen.getByText('Period: This month')).toBeInTheDocument()
  })

  it('displays period-specific empty state when transactions exist but none match selected period', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me')
        ? jsonResponse({ id: 1, email: 'jane@example.com' })
        : jsonResponse([
            {
              id: 1,
              transaction_date: '2026-02-10',
              description: 'February Grocery',
              amount: '2000.00',
              transaction_type: 'expense',
              category: 'Food',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
          ]),
    )

    renderPage()

    // Current period is "this-month" (March 2026)
    expect(await screen.findByText('No transactions in this period')).toBeInTheDocument()
    expect(screen.getByText(/no transactions were recorded for this month\./i)).toBeInTheDocument()

    // Does NOT display the onboarding "No transactions yet" empty state
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /go to statements/i })).not.toBeInTheDocument()
  })

  it('filters visible transactions by search query and restores on clear', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me')
        ? jsonResponse({ id: 1, email: 'jane@example.com' })
        : jsonResponse([
            {
              id: 1,
              transaction_date: '2026-03-10',
              description: 'Fresh Fruits from Nature Basket',
              amount: '650.00',
              transaction_type: 'expense',
              category: 'Groceries',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
            {
              id: 2,
              transaction_date: '2026-03-12',
              description: 'Uber ride to airport',
              amount: '820.00',
              transaction_type: 'expense',
              category: 'Transport',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
          ]),
    )

    renderPage()

    expect(await screen.findByText('Fresh Fruits from Nature Basket')).toBeInTheDocument()
    expect(screen.getByText('Uber ride to airport')).toBeInTheDocument()

    // Type search query
    const searchInput = screen.getByRole('searchbox', { name: /search transactions/i })
    await user.type(searchInput, 'Uber')

    // Only matching transaction visible
    expect(screen.getByText('Uber ride to airport')).toBeInTheDocument()
    expect(screen.queryByText('Fresh Fruits from Nature Basket')).not.toBeInTheDocument()
    expect(screen.getByText(/showing 1 of 2 entries in this month/i)).toBeInTheDocument()

    // Clear search using clear button
    const clearBtn = screen.getByRole('button', { name: /clear search/i })
    await user.click(clearBtn)

    expect(screen.getByText('Fresh Fruits from Nature Basket')).toBeInTheDocument()
    expect(screen.getByText('Uber ride to airport')).toBeInTheDocument()
  })

  it('filters transactions by transaction type (Income vs Expense)', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me')
        ? jsonResponse({ id: 1, email: 'jane@example.com' })
        : jsonResponse([
            {
              id: 1,
              transaction_date: '2026-03-05',
              description: 'Freelance Design Payment',
              amount: '25000.00',
              transaction_type: 'income',
              category: 'Income',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
            {
              id: 2,
              transaction_date: '2026-03-08',
              description: 'Bookstore Purchase',
              amount: '1200.00',
              transaction_type: 'expense',
              category: 'Shopping',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
          ]),
    )

    renderPage()

    expect(await screen.findByText('Freelance Design Payment')).toBeInTheDocument()
    expect(screen.getByText('Bookstore Purchase')).toBeInTheDocument()

    // Click Expenses filter pill
    await user.click(screen.getByRole('button', { name: 'Expenses' }))
    expect(screen.getByText('Bookstore Purchase')).toBeInTheDocument()
    expect(screen.queryByText('Freelance Design Payment')).not.toBeInTheDocument()

    // Click Income filter pill
    await user.click(screen.getByRole('button', { name: 'Income' }))
    expect(screen.getByText('Freelance Design Payment')).toBeInTheDocument()
    expect(screen.queryByText('Bookstore Purchase')).not.toBeInTheDocument()

    // Click All Types filter pill
    await user.click(screen.getByRole('button', { name: 'All Types' }))
    expect(screen.getByText('Freelance Design Payment')).toBeInTheDocument()
    expect(screen.getByText('Bookstore Purchase')).toBeInTheDocument()
  })

  it('displays search/filter empty state when no records match filter, and allows clearing filters', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith('/auth/me')
        ? jsonResponse({ id: 1, email: 'jane@example.com' })
        : jsonResponse([
            {
              id: 1,
              transaction_date: '2026-03-05',
              description: 'Electricity bill',
              amount: '1500.00',
              transaction_type: 'expense',
              category: 'Utilities',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
          ]),
    )

    renderPage()

    expect(await screen.findByText('Electricity bill')).toBeInTheDocument()

    // Search for non-existent transaction
    const searchInput = screen.getByRole('searchbox', { name: /search transactions/i })
    await user.type(searchInput, 'NonExistentZebra')

    expect(await screen.findByText('No matching transactions')).toBeInTheDocument()
    expect(screen.queryByText('Electricity bill')).not.toBeInTheDocument()

    // Click Clear filters button in empty state
    await user.click(screen.getByRole('button', { name: /clear filters/i }))

    expect(await screen.findByText('Electricity bill')).toBeInTheDocument()
  })

  describe('Stage 4A — isHighConfidencePrediction helper', () => {
    it('returns true only for values >= 60%', () => {
      // String decimals (from backend Numeric(5,4))
      expect(isHighConfidencePrediction('0.6000')).toBe(true)
      expect(isHighConfidencePrediction('0.8500')).toBe(true)
      expect(isHighConfidencePrediction('0.5990')).toBe(false)
      expect(isHighConfidencePrediction('0.2002')).toBe(false)

      // Numbers
      expect(isHighConfidencePrediction(0.6)).toBe(true)
      expect(isHighConfidencePrediction(0.85)).toBe(true)
      expect(isHighConfidencePrediction(0.59)).toBe(false)
      expect(isHighConfidencePrediction(60)).toBe(true)
      expect(isHighConfidencePrediction(85)).toBe(true)
      expect(isHighConfidencePrediction(59)).toBe(false)

      // Invalid / edge cases
      expect(isHighConfidencePrediction(null)).toBe(false)
      expect(isHighConfidencePrediction(undefined)).toBe(false)
      expect(isHighConfidencePrediction('')).toBe(false)
      expect(isHighConfidencePrediction('invalid')).toBe(false)
      expect(isHighConfidencePrediction(0)).toBe(false)
      expect(isHighConfidencePrediction(-1)).toBe(false)
    })
  })

  describe('Stage 4A — Category filter', () => {
    it('filters transactions by category and allows resetting filters', async () => {
      const user = userEvent.setup()
      fetchMock.mockImplementation(async (url) =>
        String(url).endsWith('/auth/me')
          ? jsonResponse({ id: 1, email: 'jane@example.com' })
          : jsonResponse([
              {
                id: 1,
                transaction_date: '2026-03-10',
                description: 'Starbucks Coffee',
                amount: '180.00',
                transaction_type: 'expense',
                category: 'Food/Dining',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
              {
                id: 2,
                transaction_date: '2026-03-11',
                description: 'Metro card recharge',
                amount: '500.00',
                transaction_type: 'expense',
                category: 'Transport',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
              {
                id: 3,
                transaction_date: '2026-03-12',
                description: 'Supermarket grocery',
                amount: '1200.00',
                transaction_type: 'expense',
                category: 'Groceries',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
            ]),
      )

      renderPage()

      expect(await screen.findByText('Starbucks Coffee')).toBeInTheDocument()
      expect(screen.getByText('Metro card recharge')).toBeInTheDocument()
      expect(screen.getByText('Supermarket grocery')).toBeInTheDocument()

      // Select 'Food/Dining' in category filter
      const categorySelect = screen.getByRole('combobox', { name: /filter by category/i })
      await user.selectOptions(categorySelect, 'Food/Dining')

      // Only Starbucks should remain visible
      expect(screen.getByText('Starbucks Coffee')).toBeInTheDocument()
      expect(screen.queryByText('Metro card recharge')).not.toBeInTheDocument()
      expect(screen.queryByText('Supermarket grocery')).not.toBeInTheDocument()
      expect(screen.getByText(/showing 1 of 3 entries in this month/i)).toBeInTheDocument()

      // Click Reset filters
      await user.click(screen.getByRole('button', { name: /reset filters/i }))

      // All 3 restored
      expect(screen.getByText('Starbucks Coffee')).toBeInTheDocument()
      expect(screen.getByText('Metro card recharge')).toBeInTheDocument()
      expect(screen.getByText('Supermarket grocery')).toBeInTheDocument()
    })
  })

  describe('Stage 4A — Delete transaction flow', () => {
    it('opens DeleteTransactionDialog, cancels without deletion, and confirms deletion with API call', async () => {
      const user = userEvent.setup()
      let currentTransactions = [
        {
          id: 42,
          transaction_date: '2026-03-10',
          description: 'Accidental duplicate charge',
          amount: '180.00',
          transaction_type: 'expense',
          category: 'Other',
          predicted_category: null,
          prediction_confidence: null,
          is_reviewed: true,
        },
      ]

      fetchMock.mockImplementation(async (url, init) => {
        const urlStr = String(url)
        if (urlStr.endsWith('/auth/me')) {
          return jsonResponse({ id: 1, email: 'jane@example.com' })
        }
        if (urlStr.endsWith('/transactions/42') && init?.method === 'DELETE') {
          currentTransactions = []
          return new Response(null, { status: 204 })
        }
        if (urlStr.endsWith('/transactions/')) {
          return jsonResponse(currentTransactions)
        }
        return jsonResponse({}, 404)
      })

      renderPage()

      expect(await screen.findByText('Accidental duplicate charge')).toBeInTheDocument()

      // Click delete button on row
      const deleteBtn = screen.getByRole('button', { name: /delete accidental duplicate charge/i })
      await user.click(deleteBtn)

      // Dialog opens
      const dialog = await screen.findByRole('dialog', { name: /delete transaction/i })
      expect(dialog).toBeInTheDocument()
      expect(within(dialog).getByText('Accidental duplicate charge')).toBeInTheDocument()

      // Test cancel: closes dialog without deleting
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /delete transaction/i })).not.toBeInTheDocument()
      })
      expect(screen.getByText('Accidental duplicate charge')).toBeInTheDocument()

      // Open dialog again and confirm deletion
      await user.click(screen.getByRole('button', { name: /delete accidental duplicate charge/i }))
      const confirmDialog = await screen.findByRole('dialog', { name: /delete transaction/i })
      await user.click(within(confirmDialog).getByRole('button', { name: /delete transaction/i }))

      // Row removed immediately from the page
      await waitFor(() => {
        expect(screen.queryByText('Accidental duplicate charge')).not.toBeInTheDocument()
      })
    })
  })

  describe('Stage 4A — One-click AI suggestion confirmation', () => {
    it('shows Confirm button for confidence >= 60%, updates on click, and does NOT show Confirm button for confidence < 60%', async () => {
      const user = userEvent.setup()
      let transactions: Transaction[] = [
        {
          id: 101,
          transaction_date: '2026-03-10',
          description: 'Uber ride downtown',
          amount: '250.00',
          transaction_type: 'expense',
          category: 'Other',
          predicted_category: 'Transport',
          prediction_confidence: '0.8500', // 85% >= 60%
          is_reviewed: false,
        },
        {
          id: 102,
          transaction_date: '2026-03-10',
          description: 'Starbucks low confidence',
          amount: '180.00',
          transaction_type: 'expense',
          category: 'Other',
          predicted_category: 'Food/Dining',
          prediction_confidence: '0.2002', // 20.02% < 60%
          is_reviewed: false,
        },
      ]

      fetchMock.mockImplementation(async (url, init) => {
        const urlStr = String(url)
        if (urlStr.endsWith('/auth/me')) {
          return jsonResponse({ id: 1, email: 'jane@example.com' })
        }
        if (urlStr.endsWith('/transactions/101') && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body))
          const updated: Transaction = {
            ...transactions[0],
            category: body.category,
            is_reviewed: true,
          }
          transactions[0] = updated
          return jsonResponse(updated)
        }
        if (urlStr.endsWith('/transactions/')) {
          return jsonResponse(transactions)
        }
        return jsonResponse({}, 404)
      })

      renderPage()

      expect(await screen.findByText('Uber ride downtown')).toBeInTheDocument()
      expect(screen.getByText('Starbucks low confidence')).toBeInTheDocument()

      // High confidence (85%): Confirm button is rendered
      const confirmBtn = screen.getByRole('button', {
        name: /confirm ai category transport for uber ride downtown/i,
      })
      expect(confirmBtn).toBeInTheDocument()

      // Low confidence (20.02%): Confirm button is NOT rendered
      expect(
        screen.queryByRole('button', {
          name: /confirm ai category food\/dining for starbucks low confidence/i,
        }),
      ).not.toBeInTheDocument()

      // Low confidence still has "To review" and AI suggestion display
      expect(screen.getByText(/ai: food\/dining \(20%\)/i)).toBeInTheDocument()

      // Click Confirm on high confidence entry
      await user.click(confirmBtn)

      // On success, row updates: category is Transport, reviewed status is displayed, confirm button is gone
      await waitFor(() => {
        expect(
          screen.queryByRole('button', {
            name: /confirm ai category transport for uber ride downtown/i,
          }),
        ).not.toBeInTheDocument()
      })
      const table = screen.getByRole('table')
      expect(within(table).getByText('Transport')).toBeInTheDocument()
      expect(within(table).getByText('Reviewed')).toBeInTheDocument()
    })

    it('shows an error banner when AI confirmation fails and preserves unconfirmed state for retry', async () => {
      const user = userEvent.setup()
      fetchMock.mockImplementation(async (url, init) => {
        const urlStr = String(url)
        if (urlStr.endsWith('/auth/me')) {
          return jsonResponse({ id: 1, email: 'jane@example.com' })
        }
        if (urlStr.endsWith('/transactions/103') && init?.method === 'PUT') {
          return jsonResponse({ detail: 'Internal server error' }, 500)
        }
        if (urlStr.endsWith('/transactions/')) {
          return jsonResponse([
            {
              id: 103,
              transaction_date: '2026-03-10',
              description: 'Zomato lunch order',
              amount: '320.00',
              transaction_type: 'expense',
              category: 'Other',
              predicted_category: 'Food/Dining',
              prediction_confidence: '0.9000',
              is_reviewed: false,
            },
          ])
        }
        return jsonResponse({}, 404)
      })

      renderPage()

      expect(await screen.findByText('Zomato lunch order')).toBeInTheDocument()

      const confirmBtn = screen.getByRole('button', {
        name: /confirm ai category food\/dining for zomato lunch order/i,
      })
      await user.click(confirmBtn)

      // Alert banner appears
      const alert = await screen.findByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent(/The server ran into a problem|failed to confirm category/i)

      // Transaction remains unconfirmed and button remains available for retry
      expect(
        screen.getByRole('button', {
          name: /confirm ai category food\/dining for zomato lunch order/i,
        }),
      ).toBeInTheDocument()
    })
  })

  describe('Stage 4B — Date grouping', () => {
    it('renders multiple date groups newest-first and clusters same-date transactions under one header', async () => {
      fetchMock.mockImplementation(async (url) =>
        String(url).endsWith('/auth/me')
          ? jsonResponse({ id: 1, email: 'jane@example.com' })
          : jsonResponse([
              {
                id: 1,
                transaction_date: '2026-03-14',
                description: 'Saturday Coffee',
                amount: '180.00',
                transaction_type: 'expense',
                category: 'Food/Dining',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
              {
                id: 2,
                transaction_date: '2026-03-20',
                description: 'Today Metro',
                amount: '60.00',
                transaction_type: 'expense',
                category: 'Transport',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
              {
                id: 3,
                transaction_date: '2026-03-20',
                description: 'Today Lunch',
                amount: '250.00',
                transaction_type: 'expense',
                category: 'Food/Dining',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
              {
                id: 4,
                transaction_date: '2026-03-19',
                description: 'Yesterday Groceries',
                amount: '920.00',
                transaction_type: 'expense',
                category: 'Groceries',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
            ]),
      )

      renderPage()

      expect(await screen.findByText('Today Lunch')).toBeInTheDocument()

      const table = screen.getByRole('table')
      const groupHeaders = within(table).getAllByRole('rowheader')
      expect(groupHeaders).toHaveLength(3)
      expect(groupHeaders[0]).toHaveTextContent('Today · 20 Mar 2026')
      expect(groupHeaders[0]).toHaveTextContent('2 transactions')
      expect(groupHeaders[1]).toHaveTextContent('Yesterday · 19 Mar 2026')
      expect(groupHeaders[1]).toHaveTextContent('1 transaction')
      expect(groupHeaders[2]).toHaveTextContent('Saturday, 14 Mar 2026')
      expect(groupHeaders[2]).toHaveTextContent('1 transaction')

      // Same-date transactions sit in the same tbody as their group header
      const todayTbody = groupHeaders[0].closest('tbody')!
      expect(within(todayTbody).getByText('Today Lunch')).toBeInTheDocument()
      expect(within(todayTbody).getByText('Today Metro')).toBeInTheDocument()
      expect(within(todayTbody).queryByText('Yesterday Groceries')).not.toBeInTheDocument()
    })

    it('removes empty date groups when search, category, type, or review filters narrow rows', async () => {
      const user = userEvent.setup()
      fetchMock.mockImplementation(async (url) =>
        String(url).endsWith('/auth/me')
          ? jsonResponse({ id: 1, email: 'jane@example.com' })
          : jsonResponse([
              {
                id: 1,
                transaction_date: '2026-03-20',
                description: 'Client Invoice',
                amount: '15000.00',
                transaction_type: 'income',
                category: 'Income',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
              {
                id: 2,
                transaction_date: '2026-03-19',
                description: 'Swiggy Dinner',
                amount: '420.00',
                transaction_type: 'expense',
                category: 'Food/Dining',
                predicted_category: 'Food/Dining',
                prediction_confidence: '0.80',
                is_reviewed: false,
              },
              {
                id: 3,
                transaction_date: '2026-03-14',
                description: 'Metro Recharge',
                amount: '300.00',
                transaction_type: 'expense',
                category: 'Transport',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
            ]),
      )

      renderPage()
      expect(await screen.findByText('Client Invoice')).toBeInTheDocument()

      // Search hides Today and Saturday groups
      const searchInput = screen.getByRole('searchbox', { name: /search transactions/i })
      await user.type(searchInput, 'Swiggy')
      expect(screen.queryByText('Today · 20 Mar 2026')).not.toBeInTheDocument()
      expect(screen.getByText('Yesterday · 19 Mar 2026')).toBeInTheDocument()
      expect(screen.queryByText('Saturday, 14 Mar 2026')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /clear search/i }))
      expect(screen.getByText('Today · 20 Mar 2026')).toBeInTheDocument()

      // Type filter (Income) keeps only Today group
      await user.click(screen.getByRole('button', { name: 'Income' }))
      expect(screen.getByText('Today · 20 Mar 2026')).toBeInTheDocument()
      expect(screen.queryByText('Yesterday · 19 Mar 2026')).not.toBeInTheDocument()
      expect(screen.queryByText('Saturday, 14 Mar 2026')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'All Types' }))

      // Category filter (Transport) keeps only Saturday group
      await user.selectOptions(screen.getByRole('combobox', { name: /filter by category/i }), 'Transport')
      expect(screen.queryByText('Today · 20 Mar 2026')).not.toBeInTheDocument()
      expect(screen.queryByText('Yesterday · 19 Mar 2026')).not.toBeInTheDocument()
      expect(screen.getByText('Saturday, 14 Mar 2026')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /reset filters/i }))

      // Review-status filter keeps only Yesterday group
      await user.click(screen.getByRole('button', { name: /needs review/i }))
      expect(screen.queryByText('Today · 20 Mar 2026')).not.toBeInTheDocument()
      expect(screen.getByText('Yesterday · 19 Mar 2026')).toBeInTheDocument()
      expect(screen.queryByText('Saturday, 14 Mar 2026')).not.toBeInTheDocument()
    })

    it('removes a date group when its only transaction is deleted', async () => {
      const user = userEvent.setup()
      let currentTransactions: Transaction[] = [
        {
          id: 10,
          transaction_date: '2026-03-20',
          description: 'Solo Today Item',
          amount: '150.00',
          transaction_type: 'expense',
          category: 'Other',
          predicted_category: null,
          prediction_confidence: null,
          is_reviewed: true,
        },
        {
          id: 11,
          transaction_date: '2026-03-19',
          description: 'Yesterday Item',
          amount: '200.00',
          transaction_type: 'expense',
          category: 'Other',
          predicted_category: null,
          prediction_confidence: null,
          is_reviewed: true,
        },
      ]

      fetchMock.mockImplementation(async (url, init) => {
        const urlStr = String(url)
        if (urlStr.endsWith('/auth/me')) {
          return jsonResponse({ id: 1, email: 'jane@example.com' })
        }
        if (urlStr.endsWith('/transactions/10') && init?.method === 'DELETE') {
          currentTransactions = currentTransactions.filter((t) => t.id !== 10)
          return new Response(null, { status: 204 })
        }
        return jsonResponse(currentTransactions)
      })

      renderPage()
      expect(await screen.findByText('Today · 20 Mar 2026')).toBeInTheDocument()
      expect(screen.getByText('Yesterday · 19 Mar 2026')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /delete solo today item/i }))
      const dialog = await screen.findByRole('dialog', { name: /delete transaction/i })
      await user.click(within(dialog).getByRole('button', { name: /delete transaction/i }))

      await waitFor(() => {
        expect(screen.queryByText('Today · 20 Mar 2026')).not.toBeInTheDocument()
      })
      expect(screen.getByText('Yesterday · 19 Mar 2026')).toBeInTheDocument()
    })

    it('moves a transaction into the new date group when its date is edited', async () => {
      const user = userEvent.setup()
      let currentTransactions: Transaction[] = [
        {
          id: 21,
          transaction_date: '2026-03-14',
          description: 'Movable Coffee',
          amount: '180.00',
          transaction_type: 'expense',
          category: 'Food/Dining',
          predicted_category: null,
          prediction_confidence: null,
          is_reviewed: true,
        },
      ]

      fetchMock.mockImplementation(async (url, init) => {
        const urlStr = String(url)
        if (urlStr.endsWith('/auth/me')) {
          return jsonResponse({ id: 1, email: 'jane@example.com' })
        }
        if (urlStr.endsWith('/transactions/21') && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body))
          const updated: Transaction = {
            ...currentTransactions[0],
            ...body,
            amount: String(body.amount) + '.00',
            is_reviewed: true,
          }
          currentTransactions = [updated]
          return jsonResponse(updated)
        }
        return jsonResponse(currentTransactions)
      })

      renderPage()
      expect(await screen.findByText('Saturday, 14 Mar 2026')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /edit movable coffee/i }))
      const dialog = await screen.findByRole('dialog', { name: /edit transaction/i })
      const dateInput = within(dialog).getByLabelText(/date/i)
      await user.clear(dateInput)
      await user.type(dateInput, '2026-03-20')
      await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /edit transaction/i })).not.toBeInTheDocument()
      })

      expect(screen.queryByText('Saturday, 14 Mar 2026')).not.toBeInTheDocument()
      expect(screen.getByText('Today · 20 Mar 2026')).toBeInTheDocument()
      expect(screen.getByText('Movable Coffee')).toBeInTheDocument()
    })

    it('recalculates visible date groups when the global Period Selector changes', async () => {
      const user = userEvent.setup()
      fetchMock.mockImplementation(async (url) =>
        String(url).endsWith('/auth/me')
          ? jsonResponse({ id: 1, email: 'jane@example.com' })
          : jsonResponse([
              {
                id: 1,
                transaction_date: '2026-03-20',
                description: 'March Entry',
                amount: '100.00',
                transaction_type: 'expense',
                category: 'Other',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
              {
                id: 2,
                transaction_date: '2026-02-15',
                description: 'February Entry',
                amount: '200.00',
                transaction_type: 'expense',
                category: 'Other',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
              {
                id: 3,
                transaction_date: '2025-11-20',
                description: 'Prior Year Entry',
                amount: '300.00',
                transaction_type: 'expense',
                category: 'Other',
                predicted_category: null,
                prediction_confidence: null,
                is_reviewed: true,
              },
            ]),
      )

      function PeriodGroupHarness() {
        const { setPeriod } = usePeriod()
        return (
          <div>
            <button type="button" onClick={() => setPeriod('all')}>
              Select All Time
            </button>
            <button type="button" onClick={() => setPeriod('last-month')}>
              Select Last Month
            </button>
            <TransactionsPage />
          </div>
        )
      }

      render(
        <MotionConfig reducedMotion="always">
          <MemoryRouter>
            <AuthProvider>
              <PeriodProvider>
                <PeriodGroupHarness />
              </PeriodProvider>
            </AuthProvider>
          </MemoryRouter>
        </MotionConfig>,
      )

      // Initially "This month" (March 2026)
      expect(await screen.findByText('Today · 20 Mar 2026')).toBeInTheDocument()
      expect(screen.queryByText('Sunday, 15 Feb 2026')).not.toBeInTheDocument()
      expect(screen.queryByText('Thursday, 20 Nov 2025')).not.toBeInTheDocument()

      // Switch to All time
      await user.click(screen.getByRole('button', { name: 'Select All Time' }))
      expect(await screen.findByText('Today · 20 Mar 2026')).toBeInTheDocument()
      expect(screen.getByText('Sunday, 15 Feb 2026')).toBeInTheDocument()
      expect(screen.getByText('Thursday, 20 Nov 2025')).toBeInTheDocument()

      // Switch to Last month (Feb 2026)
      await user.click(screen.getByRole('button', { name: 'Select Last Month' }))
      expect(await screen.findByText('Sunday, 15 Feb 2026')).toBeInTheDocument()
      expect(screen.queryByText('Today · 20 Mar 2026')).not.toBeInTheDocument()
      expect(screen.queryByText('Thursday, 20 Nov 2025')).not.toBeInTheDocument()
    })
  })

  describe('Stage 4B Workstream B — Transaction List Presentation & Consistency', () => {
    it('A. formats expense and income amounts with ₹ while preserving sign semantics and colors', async () => {
      saveToken('valid-token')
      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.endsWith('/auth/me')) {
          return Promise.resolve(jsonResponse({ id: 1, email: 'test@spendwise.ai', full_name: 'Test User' }))
        }
        return Promise.resolve(
          jsonResponse([
            {
              id: 1,
              transaction_date: '2026-03-14',
              description: 'Salary Credit',
              amount: '50000.00',
              transaction_type: 'income',
              category: 'Income/Salary',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
            {
              id: 2,
              transaction_date: '2026-03-14',
              description: 'Grocery Run',
              amount: '450.50',
              transaction_type: 'expense',
              category: 'Groceries',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
          ]),
        )
      })

      renderPage({ period: 'all', periodLabel: 'All time' })

      const incomeCell = (await screen.findByText(/\+₹50,000\.00/)).closest('td')
      const expenseCell = screen.getByText(/−₹450\.50/).closest('td')

      expect(incomeCell).toHaveClass('text-forest')
      expect(within(incomeCell as HTMLElement).getByText('(income)')).toBeInTheDocument()
      expect(expenseCell).toHaveClass('text-ink')
      expect(within(expenseCell as HTMLElement).getByText('(expense)')).toBeInTheDocument()
    })

    it('B. normalizes decimal and percentage confidence scores and rejects invalid or non-finite values', () => {
      expect(formatConfidenceLabel('0.2002')).toBe('20%')
      expect(formatConfidenceLabel('0.60')).toBe('60%')
      expect(formatConfidenceLabel(60)).toBe('60%')
      expect(formatConfidenceLabel('85')).toBe('85%')
      expect(formatConfidenceLabel(0.599)).toBe('59.9%')
      expect(formatConfidenceLabel(59.9)).toBe('59.9%')
      expect(formatConfidenceLabel(0.5999)).toBe('59.9%')

      expect(isHighConfidencePrediction('0.599')).toBe(false)
      expect(isHighConfidencePrediction(59.9)).toBe(false)
      expect(isHighConfidencePrediction('0.60')).toBe(true)
      expect(isHighConfidencePrediction(60)).toBe(true)
      expect(isHighConfidencePrediction(Infinity)).toBe(false)
      expect(isHighConfidencePrediction(-Infinity)).toBe(false)
      expect(isHighConfidencePrediction(NaN)).toBe(false)
      expect(isHighConfidencePrediction('abc')).toBe(false)
      expect(isHighConfidencePrediction(105)).toBe(false)

      expect(formatConfidenceLabel(null)).toBeNull()
      expect(formatConfidenceLabel(undefined)).toBeNull()
      expect(formatConfidenceLabel('')).toBeNull()
      expect(formatConfidenceLabel('   ')).toBeNull()
      expect(formatConfidenceLabel('0')).toBeNull()
      expect(formatConfidenceLabel('-0.5')).toBeNull()
      expect(formatConfidenceLabel('abc')).toBeNull()
      expect(formatConfidenceLabel(NaN)).toBeNull()
      expect(formatConfidenceLabel(Infinity)).toBeNull()
      expect(formatConfidenceLabel(-Infinity)).toBeNull()
      expect(formatConfidenceLabel(150)).toBeNull()
    })

    it('B. renders percentage-scale confidence, prevents 59.9% rounding to 60%, and hides invalid percentages', async () => {
      saveToken('valid-token')
      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.endsWith('/auth/me')) {
          return Promise.resolve(jsonResponse({ id: 1, email: 'test@spendwise.ai', full_name: 'Test User' }))
        }
        return Promise.resolve(
          jsonResponse([
            {
              id: 1,
              transaction_date: '2026-03-14',
              description: 'Threshold Boundary Item',
              amount: '100.00',
              transaction_type: 'expense',
              category: 'Other',
              predicted_category: 'Dining',
              prediction_confidence: '0.599',
              is_reviewed: false,
            },
            {
              id: 2,
              transaction_date: '2026-03-14',
              description: 'Percentage Scale Item',
              amount: '200.00',
              transaction_type: 'expense',
              category: 'Other',
              predicted_category: 'Travel',
              prediction_confidence: '85',
              is_reviewed: false,
            },
            {
              id: 3,
              transaction_date: '2026-03-14',
              description: 'Corrupted Confidence Item',
              amount: '300.00',
              transaction_type: 'expense',
              category: 'Other',
              predicted_category: 'Utilities',
              prediction_confidence: 'not-a-number',
              is_reviewed: false,
            },
          ]),
        )
      })

      renderPage({ period: 'all', periodLabel: 'All time' })

      expect(await screen.findByText('AI: Dining (59.9%)')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Confirm AI category Dining for Threshold Boundary Item/i }),
      ).not.toBeInTheDocument()

      expect(screen.getByText('AI: Travel (85%)')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Confirm AI category Travel for Percentage Scale Item/i }),
      ).toBeInTheDocument()

      expect(screen.getByText('AI: Utilities')).toBeInTheDocument()
      expect(screen.queryByText(/NaN%/i)).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Confirm AI category Utilities for Corrupted Confidence Item/i }),
      ).not.toBeInTheDocument()
    })

    it('C. keeps Needs review toggle interactive when unreviewed count drops to 0 while active', async () => {
      const user = userEvent.setup()
      saveToken('valid-token')
      let reviewedOnServer = false

      fetchMock.mockImplementation((input, init) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.endsWith('/auth/me')) {
          return Promise.resolve(jsonResponse({ id: 1, email: 'test@spendwise.ai', full_name: 'Test User' }))
        }
        if (url.endsWith('/transactions/1') && init?.method === 'PUT') {
          reviewedOnServer = true
          return Promise.resolve(
            jsonResponse({
              id: 1,
              transaction_date: '2026-03-14',
              description: 'Pending Coffee',
              amount: '180.00',
              transaction_type: 'expense',
              category: 'Food/Dining',
              predicted_category: 'Food/Dining',
              prediction_confidence: '0.92',
              is_reviewed: true,
            }),
          )
        }
        return Promise.resolve(
          jsonResponse([
            {
              id: 1,
              transaction_date: '2026-03-14',
              description: 'Pending Coffee',
              amount: '180.00',
              transaction_type: 'expense',
              category: 'Other',
              predicted_category: 'Food/Dining',
              prediction_confidence: '0.92',
              is_reviewed: reviewedOnServer,
            },
            {
              id: 2,
              transaction_date: '2026-03-14',
              description: 'Already Reviewed Lunch',
              amount: '350.00',
              transaction_type: 'expense',
              category: 'Food/Dining',
              predicted_category: null,
              prediction_confidence: null,
              is_reviewed: true,
            },
          ]),
        )
      })

      renderPage({ period: 'all', periodLabel: 'All time' })

      const reviewToggle = await screen.findByRole('button', { name: /needs review/i })
      await user.click(reviewToggle)
      expect(screen.queryByText('Already Reviewed Lunch')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Confirm AI category Food\/Dining for Pending Coffee/i }))

      await waitFor(() => {
        expect(screen.getByText('No matching transactions')).toBeInTheDocument()
      })

      const activeToggleWithZero = screen.getByRole('button', { name: /needs review/i })
      expect(activeToggleWithZero).toBeInTheDocument()
      expect(within(activeToggleWithZero).getByText('0')).toBeInTheDocument()

      await user.click(activeToggleWithZero)
      expect(await screen.findByText('Pending Coffee')).toBeInTheDocument()
      expect(screen.getByText('Already Reviewed Lunch')).toBeInTheDocument()
    })

    it('D, E, F. aligns toolbar heights, avoids duplicate mobile tbody dividers, and removes redundant row dates cleanly', async () => {
      saveToken('valid-token')
      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.endsWith('/auth/me')) {
          return Promise.resolve(jsonResponse({ id: 1, email: 'test@spendwise.ai', full_name: 'Test User' }))
        }
        return Promise.resolve(
          jsonResponse([
            {
              id: 1,
              transaction_date: '2026-03-20',
              description: 'Morning Espresso',
              amount: '150.00',
              transaction_type: 'expense',
              category: 'Food/Dining',
              predicted_category: 'Food/Dining',
              prediction_confidence: '0.40',
              is_reviewed: false,
            },
          ]),
        )
      })

      const { container } = renderPage({ period: 'all', periodLabel: 'All time' })
      expect(await screen.findByText('Morning Espresso')).toBeInTheDocument()

      // E. Toolbar height alignment
      const searchInput = screen.getByLabelText('Search transactions')
      const categorySelect = screen.getByLabelText('Filter by category')
      const needsReviewButton = screen.getByRole('button', { name: /needs review/i })
      const typeFilterContainer = screen.getByRole('button', { name: 'All Types' }).parentElement
      expect(searchInput).toHaveClass('h-9')
      expect(categorySelect).toHaveClass('h-9')
      expect(needsReviewButton).toHaveClass('h-9')
      expect(typeFilterContainer).toHaveClass('sm:h-9')

      // D. No duplicate divide-y class on tbody while rows keep border-b
      const tbodies = container.querySelectorAll('tbody')
      expect(tbodies.length).toBeGreaterThan(0)
      for (const tbody of tbodies) {
        expect(tbody.className).not.toContain('divide-y')
      }

      // F. No Date column header or redundant visible row date; date group header and sr-only date remain
      const columnHeaders = screen.getAllByRole('columnheader').map((el) => el.textContent?.trim())
      expect(columnHeaders).toEqual(['Transaction', 'Category', 'Type', 'Amount', 'Actions'])
      expect(screen.getByText(/20 Mar 2026/, { selector: 'th span' })).toBeInTheDocument()
      const dataRow = screen.getByText('Morning Espresso').closest('tr') as HTMLElement
      expect(within(dataRow).getByText('Recorded 20 Mar 2026')).toHaveClass('sr-only')
      expect(dataRow.querySelectorAll('td')).toHaveLength(5)
    })
  })
})
