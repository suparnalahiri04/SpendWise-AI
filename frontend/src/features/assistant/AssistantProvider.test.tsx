import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentMonthString } from '@/features/budgets/budgetUtils'
import { setTokenProvider, setUnauthorizedHandler } from '@/lib/api/client'
import type { AssistantQueryResponse, StarterPromptsResponse } from '@/lib/api/types'
import { AssistantProvider, useAssistantContext } from './AssistantProvider'

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

const mockSuccessResponse: AssistantQueryResponse = {
  query: 'How much did I spend this month?',
  intent: 'spending_summary',
  answer_markdown: 'In **2026-11**, your total recorded expenses are **₹6,500.00**.',
  facts: [
    {
      metric_key: 'total_expenses',
      label: 'Total Expenses',
      value_formatted: '₹6,500.00',
      raw_amount: '6500.00',
      kind: 'fact',
      category: null,
      source: 'transactions',
      notes: null,
    },
  ],
  estimates: [],
  recommendations: [],
  data_limitations: [],
  suggested_followups: ['What are my biggest spending categories?'],
  engine: 'deterministic',
}

describe('AssistantProvider & useAssistantContext (Stage 2 Shared State)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
    setTokenProvider(() => 'jwt-test-token')
    setUnauthorizedHandler(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fetchMock.mockReset()
    setTokenProvider(() => null)
    setUnauthorizedHandler(null)
  })

  it('1. exposes the complete underlying assistant state, actions, and default YYYY-MM selectedMonth', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AssistantProvider>{children}</AssistantProvider>
    )

    const { result } = renderHook(() => useAssistantContext(), { wrapper })

    expect(result.current.selectedMonth).toBe(getCurrentMonthString())
    expect(result.current.selectedMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/)
    expect(result.current.messages).toEqual([])
    expect(result.current.status).toBe('idle')
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.lastFailedQuery).toBeNull()
    expect(typeof result.current.submitQuery).toBe('function')
    expect(typeof result.current.retryLastQuery).toBe('function')
    expect(typeof result.current.clearMessages).toBe('function')
    expect(typeof result.current.reloadPrompts).toBe('function')
    expect(typeof result.current.setSelectedMonth).toBe('function')

    await waitFor(() => {
      expect(result.current.promptsLoading).toBe(false)
    })

    expect(result.current.starterPrompts).toEqual(mockStarterPrompts.prompts)
  })

  it('2. instantiates useAssistant exactly once per provider even with multiple consumers', async () => {
    fetchMock.mockResolvedValue(jsonResponse(mockStarterPrompts, 200))

    function ConsumerOne() {
      const { promptsLoading, starterPrompts } = useAssistantContext()
      return <div data-testid="c1">{promptsLoading ? 'loading' : starterPrompts.length}</div>
    }

    function ConsumerTwo() {
      const { promptsLoading, starterPrompts } = useAssistantContext()
      return <div data-testid="c2">{promptsLoading ? 'loading' : starterPrompts.length}</div>
    }

    render(
      <AssistantProvider initialMonth="2026-11">
        <ConsumerOne />
        <ConsumerTwo />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('c1')).toHaveTextContent('2')
      expect(screen.getByTestId('c2')).toHaveTextContent('2')
    })

    // Only 1 starter-prompts request fired across both consumers
    const promptCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/assistant/starter-prompts'),
    )
    expect(promptCalls).toHaveLength(1)
  })

  it('3. shares identical conversation state across multiple consumers in real time', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockSuccessResponse)
      return jsonResponse({}, 404)
    })

    function PageConsumer() {
      const { messages, submitQuery } = useAssistantContext()
      return (
        <div>
          <button
            type="button"
            onClick={() => submitQuery('How much did I spend this month?')}
          >
            Submit From Page
          </button>
          <span data-testid="page-msg-count">{messages.length}</span>
          {messages.map((m) => (
            <p key={`page-${m.id}`} data-testid={`page-msg-${m.role}`}>
              {m.content}
            </p>
          ))}
        </div>
      )
    }

    function FloatingConsumer() {
      const { messages } = useAssistantContext()
      return (
        <div>
          <span data-testid="floating-msg-count">{messages.length}</span>
          {messages.map((m) => (
            <p key={`float-${m.id}`} data-testid={`float-msg-${m.role}`}>
              {m.content}
            </p>
          ))}
        </div>
      )
    }

    render(
      <AssistantProvider initialMonth="2026-11">
        <PageConsumer />
        <FloatingConsumer />
      </AssistantProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Submit From Page' }))

    await waitFor(() => {
      expect(screen.getByTestId('page-msg-count')).toHaveTextContent('2')
      expect(screen.getByTestId('floating-msg-count')).toHaveTextContent('2')
    })

    expect(screen.getByTestId('float-msg-user')).toHaveTextContent(
      'How much did I spend this month?',
    )
    expect(screen.getByTestId('float-msg-assistant')).toHaveTextContent(
      mockSuccessResponse.answer_markdown,
    )
  })

  it('4. reflects selectedMonth updates across all consumers and uses the updated month for subsequent queries', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockSuccessResponse)
      return jsonResponse({}, 404)
    })

    function MonthUpdaterConsumer() {
      const { selectedMonth, setSelectedMonth, submitQuery } = useAssistantContext()
      return (
        <div>
          <span data-testid="consumer-a-month">{selectedMonth}</span>
          <button type="button" onClick={() => setSelectedMonth('2026-09')}>
            Switch To September
          </button>
          <button type="button" onClick={() => submitQuery('Question in September')}>
            Ask Question In September
          </button>
        </div>
      )
    }

    function ObserverConsumer() {
      const { selectedMonth } = useAssistantContext()
      return <span data-testid="consumer-b-month">{selectedMonth}</span>
    }

    render(
      <AssistantProvider initialMonth="2026-11">
        <MonthUpdaterConsumer />
        <ObserverConsumer />
      </AssistantProvider>,
    )

    expect(screen.getByTestId('consumer-a-month')).toHaveTextContent('2026-11')
    expect(screen.getByTestId('consumer-b-month')).toHaveTextContent('2026-11')

    await user.click(screen.getByRole('button', { name: 'Switch To September' }))

    expect(screen.getByTestId('consumer-a-month')).toHaveTextContent('2026-09')
    expect(screen.getByTestId('consumer-b-month')).toHaveTextContent('2026-09')

    await user.click(screen.getByRole('button', { name: 'Ask Question In September' }))

    await waitFor(() => {
      const queryCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/assistant/query'),
      )
      expect(queryCalls).toHaveLength(1)
      expect(JSON.parse(queryCalls[0][1]?.body as string)).toEqual({
        query: 'Question in September',
        month: '2026-09',
      })
    })
  })

  it('5. retains existing conversation messages when selectedMonth changes', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockSuccessResponse)
      return jsonResponse({}, 404)
    })

    function ConversationAndMonthConsumer() {
      const { selectedMonth, setSelectedMonth, messages, submitQuery } = useAssistantContext()
      return (
        <div>
          <span data-testid="active-month">{selectedMonth}</span>
          <span data-testid="msg-count">{messages.length}</span>
          <button type="button" onClick={() => submitQuery('Question before month change')}>
            Send Initial Question
          </button>
          <button type="button" onClick={() => setSelectedMonth('2026-10')}>
            Change Month To October
          </button>
        </div>
      )
    }

    render(
      <AssistantProvider initialMonth="2026-11">
        <ConversationAndMonthConsumer />
      </AssistantProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Send Initial Question' }))
    await waitFor(() => {
      expect(screen.getByTestId('msg-count')).toHaveTextContent('2')
    })

    // Changing the month must NOT clear or reset existing messages
    await user.click(screen.getByRole('button', { name: 'Change Month To October' }))
    expect(screen.getByTestId('active-month')).toHaveTextContent('2026-10')
    expect(screen.getByTestId('msg-count')).toHaveTextContent('2')
  })

  it('6. throws a descriptive error when useAssistantContext() is called outside <AssistantProvider>', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useAssistantContext())).toThrow(
      'useAssistantContext must be used within an <AssistantProvider>',
    )

    consoleErrorSpy.mockRestore()
  })

  it('7. aborts in-flight requests cleanly when the provider unmounts (e.g. on logout)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AssistantProvider initialMonth="2026-11">{children}</AssistantProvider>
    )

    const { result, unmount } = renderHook(() => useAssistantContext(), { wrapper })
    await waitFor(() => expect(result.current.promptsLoading).toBe(false))

    let querySignal: AbortSignal | undefined
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          querySignal = init?.signal as AbortSignal | undefined
          querySignal?.addEventListener('abort', () => {
            reject(new DOMException('The user aborted a request.', 'AbortError'))
          })
        }),
    )

    let pendingPromise: Promise<AssistantQueryResponse | null> | undefined
    act(() => {
      pendingPromise = result.current.submitQuery('In-flight question before logout')
    })

    expect(result.current.isSubmitting).toBe(true)
    expect(querySignal?.aborted).toBe(false)

    // Unmount provider (simulating logout unmounting AuthenticatedApp)
    unmount()

    expect(querySignal?.aborted).toBe(true)
    const outcome = await pendingPromise
    expect(outcome).toBeNull()
  })

  it('8. starts a fresh conversation state when a new provider instance mounts', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockSuccessResponse)
      return jsonResponse({}, 404)
    })

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AssistantProvider initialMonth="2026-11">{children}</AssistantProvider>
    )

    // Session 1: populate messages and change month
    const firstSession = renderHook(() => useAssistantContext(), { wrapper })
    await waitFor(() => expect(firstSession.result.current.promptsLoading).toBe(false))

    await act(async () => {
      firstSession.result.current.setSelectedMonth('2026-08')
      await firstSession.result.current.submitQuery('First session question')
    })

    expect(firstSession.result.current.messages).toHaveLength(2)
    expect(firstSession.result.current.selectedMonth).toBe('2026-08')

    // Unmount Session 1 (logout)
    firstSession.unmount()

    // Session 2: mount fresh provider (subsequent login)
    const secondSession = renderHook(() => useAssistantContext(), { wrapper })
    expect(secondSession.result.current.messages).toEqual([])
    expect(secondSession.result.current.status).toBe('idle')
    expect(secondSession.result.current.selectedMonth).toBe('2026-11')
    expect(secondSession.result.current.error).toBeNull()
    expect(secondSession.result.current.lastFailedQuery).toBeNull()
  })
})
