import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { saveToken } from '@/features/auth/session'
import { PeriodProvider } from '@/features/period/PeriodProvider'
import type { Transaction } from '@/lib/api/types'
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

function renderPage() {
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
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  saveToken('test-token-value')
})

afterEach(() => {
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
    expect(await screen.findByRole('dialog', { name: /edit transaction/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toHaveValue('Swiggy Biryani')

    // Change category to Food/Dining
    const categorySelect = screen.getByLabelText(/category/i)
    await user.selectOptions(categorySelect, 'Food/Dining')

    // Submit
    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    await user.click(saveBtn)

    // Modal closes and table displays updated reviewed status and Food/Dining category
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /edit transaction/i })).not.toBeInTheDocument()
    })

    expect(await screen.findByText('Food/Dining')).toBeInTheDocument()
    expect(screen.getByText('Reviewed')).toBeInTheDocument()
  })
})
