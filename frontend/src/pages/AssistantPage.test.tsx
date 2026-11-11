import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantProvider } from '@/features/assistant/AssistantProvider'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { clearToken, saveToken } from '@/features/auth/session'
import { setTokenProvider, setUnauthorizedHandler } from '@/lib/api/client'
import type {
  AssistantQueryResponse,
  StarterPromptsResponse,
} from '@/lib/api/types'
import { AssistantPage } from './AssistantPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

const mockStarterPrompts: StarterPromptsResponse = {
  prompts: [
    {
      id: 'spending-summary',
      prompt: 'How much did I spend this month?',
      category: 'Spending',
    },
    {
      id: 'budget-status',
      prompt: 'Am I staying within my budgets?',
      category: 'Budgets',
    },
  ],
}

const mockAssistantResponse: AssistantQueryResponse = {
  query: 'How much did I spend this month?',
  intent: 'spending_summary',
  answer_markdown: 'In **2026-11**, your total recorded expenses are **₹6,500.00**.\n\n- Food: ₹3,500.00\n- Rent: ₹3,000.00',
  facts: [
    {
      metric_key: 'total_expenses',
      label: 'Total Expenses',
      value_formatted: '₹6,500.00',
      raw_amount: '6500.00',
      kind: 'fact',
      category: null,
      source: 'transactions',
      notes: '2 entries recorded',
    },
  ],
  estimates: [
    {
      metric_key: 'projected_month_end',
      label: 'Projected Month-End',
      value_formatted: '₹8,200.00',
      raw_amount: '8200.00',
      kind: 'estimate',
      category: null,
      source: 'run_rate',
      notes: 'Estimated based on daily pace',
    },
  ],
  recommendations: [
    {
      metric_key: 'budget_advice',
      label: 'Budget Alert',
      value_formatted: 'Review Food spending',
      raw_amount: null,
      kind: 'recommendation',
      category: 'Food',
      source: 'budgets',
      notes: 'Dining out accounts for 54% of total expenses.',
    },
  ],
  data_limitations: ['Income has not been recorded yet for this month.'],
  suggested_followups: ['What are my upcoming bills?'],
  engine: 'deterministic',
}

function renderAssistantPage() {
  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthProvider>
          <AssistantProvider>
            <AssistantPage />
          </AssistantProvider>
        </AuthProvider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

describe('AssistantPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
    saveToken('test-token-value')
    setTokenProvider(() => 'test-token-value')
    setUnauthorizedHandler(null)

    // Mock scrollIntoView in jsdom
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fetchMock.mockReset()
    clearToken()
    setTokenProvider(() => null)
    setUnauthorizedHandler(null)
  })

  it('renders welcoming empty state with starter prompts and submits via prompt click', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    renderAssistantPage()

    // Header & page intro
    expect(screen.getByRole('heading', { name: /financial intelligence/i })).toBeInTheDocument()
    expect(screen.getByText(/how can i help you today\?/i)).toBeInTheDocument()

    // Starter prompts appear
    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
      expect(screen.getByText('Am I staying within my budgets?')).toBeInTheDocument()
    })

    const promptBtn = screen.getByText('How much did I spend this month?')
    await user.click(promptBtn)

    // Conversation displays user question and assistant answer
    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })

    // Verified Facts & Estimates are rendered in distinct sections
    expect(screen.getByText('Verified Facts')).toBeInTheDocument()
    expect(screen.getByText('Estimates & Projections')).toBeInTheDocument()
    expect(screen.getByText('₹8,200.00')).toBeInTheDocument()
    expect(screen.getByText(/income has not been recorded yet/i)).toBeInTheDocument()
    expect(screen.getByText('What are my upcoming bills?')).toBeInTheDocument()
  })

  it('submits a user question typed in the textarea and displays the response', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    renderAssistantPage()

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/ask a question about your expenses/i)
    await user.type(input, 'What did I spend?')

    const sendBtn = screen.getByRole('button', { name: /send message/i })
    expect(sendBtn).toBeEnabled()
    await user.click(sendBtn)

    await waitFor(() => {
      expect(screen.getByText('What did I spend?')).toBeInTheDocument()
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })
  })

  it('displays loading state while waiting for query response and handles errors with retry', async () => {
    const user = userEvent.setup()
    let queryAttempt = 0

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) {
        queryAttempt += 1
        if (queryAttempt === 1) {
          return jsonResponse({ detail: 'Failed computation.' }, 500)
        }
        return jsonResponse(mockAssistantResponse)
      }
      return jsonResponse({}, 404)
    })

    renderAssistantPage()

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/ask a question about your expenses/i)
    await user.type(input, 'Check budgets')
    await user.click(screen.getByRole('button', { name: /send message/i }))

    // Error banner appears with Retry button
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry question/i })).toBeInTheDocument()
    })

    // User message was preserved
    expect(screen.getByText('Check budgets')).toBeInTheDocument()

    // Retry succeeds
    await user.click(screen.getByRole('button', { name: /retry question/i }))

    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('starts a new conversation when New Conversation is clicked', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    renderAssistantPage()

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    await user.click(screen.getByText('How much did I spend this month?'))

    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })

    // New Conversation action is available in header actions
    const newConvBtn = screen.getByRole('button', { name: /start new conversation/i })
    await user.click(newConvBtn)

    // Resets back to empty state with starter prompts
    await waitFor(() => {
      expect(screen.getByText(/how can i help you today\?/i)).toBeInTheDocument()
      expect(screen.queryByText(/your total recorded expenses are/i)).not.toBeInTheDocument()
    })
  })

  it('supports Enter key to submit and Shift+Enter for new line in input', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    renderAssistantPage()

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/ask a question about your expenses/i)
    await user.type(input, 'Line 1')

    // Shift+Enter should NOT submit
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    const queryCallsBefore = fetchMock.mock.calls.filter(([callUrl]) =>
      String(callUrl).includes('/assistant/query'),
    )
    expect(queryCallsBefore).toHaveLength(0)

    // Enter without Shift triggers submit
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      const queryCallsAfter = fetchMock.mock.calls.filter(([callUrl]) =>
        String(callUrl).includes('/assistant/query'),
      )
      expect(queryCallsAfter).toHaveLength(1)
      expect(screen.getByText(/line 1/i)).toBeInTheDocument()
    })
  })

  it('enforces maxLength of 1000 on the textarea input', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      return jsonResponse({}, 404)
    })

    renderAssistantPage()

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/ask a question about your expenses/i)
    expect(input).toHaveAttribute('maxLength', '1000')
  })

  it('does not submit query when Enter is pressed during IME composition', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    renderAssistantPage()

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/ask a question about your expenses/i)
    await user.type(input, 'Composing text')

    // Simulate IME Enter keydown with isComposing = true
    fireEvent.keyDown(input, {
      key: 'Enter',
      shiftKey: false,
      isComposing: true,
    })

    const queryCalls = fetchMock.mock.calls.filter(([callUrl]) =>
      String(callUrl).includes('/assistant/query'),
    )
    expect(queryCalls).toHaveLength(0)
  })

  it('renders consecutive bullet items as a semantic list even when preceded by single newline', async () => {
    const singleNewlineMarkdownResponse: AssistantQueryResponse = {
      ...mockAssistantResponse,
      answer_markdown: 'Summary:\n- Item 1\n- Item 2',
    }

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(singleNewlineMarkdownResponse)
      return jsonResponse({}, 404)
    })

    renderAssistantPage()

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const promptBtn = screen.getByText('How much did I spend this month?')
    fireEvent.click(promptBtn)

    await waitFor(() => {
      expect(screen.getByText('Summary:')).toBeInTheDocument()
      const item1 = screen.getByText('Item 1')
      const item2 = screen.getByText('Item 2')
      expect(item1).toBeInTheDocument()
      expect(item2).toBeInTheDocument()
      expect(item1.closest('li')).toBeInTheDocument()
      expect(item2.closest('li')).toBeInTheDocument()
      expect(item1.closest('ul')).toBeInTheDocument()
    })
  })

  it('disables New Conversation button while a query is in-flight', async () => {
    let resolveQuery: ((res: Response) => void) | undefined

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) {
        return new Promise((resolve) => {
          resolveQuery = resolve
        })
      }
      return jsonResponse({}, 404)
    })

    renderAssistantPage()

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const promptBtn = screen.getByText('How much did I spend this month?')
    fireEvent.click(promptBtn)

    // While in-flight, New Conversation button is rendered and disabled
    await waitFor(() => {
      const newConvBtn = screen.getByRole('button', { name: /start new conversation/i })
      expect(newConvBtn).toBeDisabled()
    })

    // Complete the query
    resolveQuery?.(jsonResponse(mockAssistantResponse, 200))

    await waitFor(() => {
      const newConvBtn = screen.getByRole('button', { name: /start new conversation/i })
      expect(newConvBtn).toBeEnabled()
    })
  })
})
