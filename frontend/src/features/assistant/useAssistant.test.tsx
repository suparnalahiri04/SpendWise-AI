import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTokenProvider, setUnauthorizedHandler } from '@/lib/api/client'
import type { AssistantQueryResponse, StarterPromptsResponse } from '@/lib/api/types'
import { useAssistant } from './useAssistant'

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
  answer_markdown: 'In **2026-10**, your total recorded expenses are **₹6,500.00**.',
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

describe('useAssistant hook', () => {
  it('loads starter prompts on mount', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { result } = renderHook(() => useAssistant('2026-10'))

    expect(result.current.promptsLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.promptsLoading).toBe(false)
    })

    expect(result.current.starterPrompts).toEqual(mockStarterPrompts.prompts)
    expect(result.current.promptsError).toBeNull()
  })

  it('handles failure when loading starter prompts', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Service temporarily unavailable.' }, 503),
    )

    const { result } = renderHook(() => useAssistant('2026-10'))

    await waitFor(() => {
      expect(result.current.promptsLoading).toBe(false)
    })

    expect(result.current.starterPrompts).toEqual([])
    expect(result.current.promptsError).toMatch(/server ran into a problem/i)
  })

  it('submits a query and updates conversation messages on success', async () => {
    // 1. Initial starter prompts call
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { result } = renderHook(() => useAssistant('2026-10'))

    await waitFor(() => {
      expect(result.current.promptsLoading).toBe(false)
    })

    // 2. Query submission call
    fetchMock.mockResolvedValueOnce(jsonResponse(mockSuccessResponse, 200))

    let queryPromise: Promise<AssistantQueryResponse | null> | undefined
    act(() => {
      queryPromise = result.current.submitQuery('How much did I spend this month?')
    })

    // Immediately shows loading and optimistic user message
    expect(result.current.isSubmitting).toBe(true)
    expect(result.current.status).toBe('loading')
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'How much did I spend this month?',
    })

    await act(async () => {
      await queryPromise
    })

    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.status).toBe('success')
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: mockSuccessResponse.answer_markdown,
      response: mockSuccessResponse,
    })
    expect(result.current.error).toBeNull()
    expect(result.current.lastFailedQuery).toBeNull()

    // Verify that month: '2026-10' was properly forwarded to the query request body
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const queryInit = fetchMock.mock.calls[1][1]
    const queryBody = JSON.parse(queryInit?.body as string)
    expect(queryBody).toEqual({
      query: 'How much did I spend this month?',
      month: '2026-10',
    })
  })

  it('prevents duplicate submissions while a request is in flight', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { result } = renderHook(() => useAssistant('2026-10'))
    await waitFor(() => expect(result.current.promptsLoading).toBe(false))

    // Delayed response
    let resolveFirstQuery: ((res: Response) => void) | undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstQuery = resolve
        }),
    )

    let firstPromise: Promise<AssistantQueryResponse | null> | undefined
    let secondPromise: Promise<AssistantQueryResponse | null> | undefined

    act(() => {
      firstPromise = result.current.submitQuery('First query')
      secondPromise = result.current.submitQuery('Duplicate attempt')
    })

    expect(result.current.isSubmitting).toBe(true)

    // The second submission must return null and not invoke fetch
    const secondResult = await secondPromise
    expect(secondResult).toBeNull()

    // Complete first query
    act(() => {
      resolveFirstQuery?.(jsonResponse(mockSuccessResponse, 200))
    })

    await act(async () => {
      await firstPromise
    })

    // Only 2 network calls were made in total: 1 for prompts, 1 for first query
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Only 1 user message and 1 assistant message in history
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].content).toBe('First query')
  })

  it('handles query failure, preserves user message, and records lastFailedQuery', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { result } = renderHook(() => useAssistant('2026-10'))
    await waitFor(() => expect(result.current.promptsLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Failed to compute financial facts.' }, 500),
    )

    let queryPromise: Promise<AssistantQueryResponse | null> | undefined
    act(() => {
      queryPromise = result.current.submitQuery('How much did I spend?')
    })

    await act(async () => {
      await queryPromise
    })

    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.status).toBe('error')
    expect(result.current.error).toMatch(/server ran into a problem/i)
    expect(result.current.lastFailedQuery).toBe('How much did I spend?')

    // Crucial constraint: user query is preserved in message history
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].content).toBe('How much did I spend?')
  })

  it('allows retrying the last failed query using retryLastQuery', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { result } = renderHook(() => useAssistant('2026-10'))
    await waitFor(() => expect(result.current.promptsLoading).toBe(false))

    // 1. First attempt fails
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Network glitch.' }, 500))

    await act(async () => {
      await result.current.submitQuery('My failed question')
    })

    expect(result.current.status).toBe('error')
    expect(result.current.lastFailedQuery).toBe('My failed question')
    expect(result.current.messages).toHaveLength(1)

    // 2. Retry succeeds
    fetchMock.mockResolvedValueOnce(jsonResponse(mockSuccessResponse, 200))

    await act(async () => {
      await result.current.retryLastQuery()
    })

    expect(result.current.status).toBe('success')
    expect(result.current.error).toBeNull()
    expect(result.current.lastFailedQuery).toBeNull()
    // History has user message + assistant message (not duplicated user messages)
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].content).toBe('My failed question')
    expect(result.current.messages[1].role).toBe('assistant')
  })

  it('triggers unauthorized handler when session token expires (401)', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)

    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { result } = renderHook(() => useAssistant('2026-10'))
    await waitFor(() => expect(result.current.promptsLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Invalid or missing authentication token.' }, 401),
    )

    await act(async () => {
      await result.current.submitQuery('Check my budgets')
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toMatch(/invalid or missing authentication token/i)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('clears messages and resets conversation state with clearMessages', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { result } = renderHook(() => useAssistant('2026-10'))
    await waitFor(() => expect(result.current.promptsLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(jsonResponse(mockSuccessResponse, 200))

    await act(async () => {
      await result.current.submitQuery('Question')
    })

    expect(result.current.messages).toHaveLength(2)

    act(() => {
      result.current.clearMessages()
    })

    expect(result.current.messages).toEqual([])
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.lastFailedQuery).toBeNull()
  })

  it('recovers and loads starter prompts when reloadPrompts is called after failure', async () => {
    // 1. Initial starter prompts request fails with 503
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Service temporarily unavailable.' }, 503),
    )

    const { result } = renderHook(() => useAssistant('2026-10'))

    await waitFor(() => {
      expect(result.current.promptsLoading).toBe(false)
    })

    expect(result.current.starterPrompts).toEqual([])
    expect(result.current.promptsError).toMatch(/server ran into a problem/i)

    // 2. Mock success for reloadPrompts
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    await act(async () => {
      await result.current.reloadPrompts()
    })

    expect(result.current.promptsLoading).toBe(false)
    expect(result.current.starterPrompts).toEqual(mockStarterPrompts.prompts)
    expect(result.current.promptsError).toBeNull()
  })

  it('aborts an in-flight query cleanly when the hook unmounts', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { result, unmount } = renderHook(() => useAssistant('2026-10'))
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

    let queryPromise: Promise<AssistantQueryResponse | null> | undefined
    act(() => {
      queryPromise = result.current.submitQuery('What are my insights?')
    })

    expect(result.current.isSubmitting).toBe(true)
    expect(querySignal?.aborted).toBe(false)

    // Unmount during in-flight query
    unmount()

    expect(querySignal?.aborted).toBe(true)

    // Must resolve cleanly to null without unhandled rejection or invalid state update
    const queryResult = await queryPromise
    expect(queryResult).toBeNull()
  })

  it('aborts an active query when clearMessages is called, preventing old response from appearing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { result } = renderHook(() => useAssistant('2026-10'))
    await waitFor(() => expect(result.current.promptsLoading).toBe(false))

    let resolvePendingQuery: ((res: Response) => void) | undefined
    let querySignal: AbortSignal | undefined
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((resolve) => {
          querySignal = init?.signal as AbortSignal | undefined
          resolvePendingQuery = resolve
        }),
    )

    let queryPromise: Promise<AssistantQueryResponse | null> | undefined
    act(() => {
      queryPromise = result.current.submitQuery('Pending question')
    })

    expect(result.current.isSubmitting).toBe(true)
    expect(result.current.messages).toHaveLength(1)
    expect(querySignal?.aborted).toBe(false)

    // Clear conversation while query is pending
    act(() => {
      result.current.clearMessages()
    })

    expect(querySignal?.aborted).toBe(true)
    expect(result.current.messages).toEqual([])
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.status).toBe('idle')

    // Now resolve the deferred query response
    act(() => {
      resolvePendingQuery?.(jsonResponse(mockSuccessResponse, 200))
    })

    await act(async () => {
      await queryPromise
    })

    // The old response must NOT have been added to the cleared conversation
    expect(result.current.messages).toEqual([])
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('prevents a superseded query A from clearing query B loading state or controller when A finishes after B starts', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { result } = renderHook(() => useAssistant('2026-10'))
    await waitFor(() => expect(result.current.promptsLoading).toBe(false))

    let resolveQueryA: ((res: Response) => void) | undefined
    let resolveQueryB: ((res: Response) => void) | undefined
    let queryASignal: AbortSignal | undefined
    let queryBSignal: AbortSignal | undefined

    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((resolve) => {
          queryASignal = init?.signal as AbortSignal | undefined
          resolveQueryA = resolve
        }),
    )

    // 1. Start query A
    let promiseA: Promise<AssistantQueryResponse | null> | undefined
    act(() => {
      promiseA = result.current.submitQuery('Question A')
    })

    expect(result.current.isSubmitting).toBe(true)
    expect(queryASignal?.aborted).toBe(false)

    // 2. Clear conversation while A is pending
    act(() => {
      result.current.clearMessages()
    })

    expect(queryASignal?.aborted).toBe(true)
    expect(result.current.messages).toEqual([])

    // 3. Immediately start query B
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((resolve) => {
          queryBSignal = init?.signal as AbortSignal | undefined
          resolveQueryB = resolve
        }),
    )

    let promiseB: Promise<AssistantQueryResponse | null> | undefined
    act(() => {
      promiseB = result.current.submitQuery('Question B')
    })

    expect(result.current.isSubmitting).toBe(true)
    expect(result.current.status).toBe('loading')
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].content).toBe('Question B')
    expect(queryBSignal?.aborted).toBe(false)

    // 4. Query A resolves or rejects after Query B has started
    act(() => {
      resolveQueryA?.(
        jsonResponse({
          ...mockSuccessResponse,
          answer_markdown: 'Old Answer A',
        }),
      )
    })

    await act(async () => {
      await promiseA
    })

    // 5. Verify A did NOT clear B's submission/loading state or append old response A
    expect(result.current.isSubmitting).toBe(true) // Still submitting Query B!
    expect(result.current.status).toBe('loading')
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].content).toBe('Question B')
    expect(queryBSignal?.aborted).toBe(false) // B's controller is NOT aborted or cleared!

    // 6. Complete Query B
    act(() => {
      resolveQueryB?.(
        jsonResponse({
          ...mockSuccessResponse,
          answer_markdown: 'Real Answer B',
        }),
      )
    })

    await act(async () => {
      await promiseB
    })

    // Now Query B is completed: isSubmitting is false, only Query B and Answer B are present
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.status).toBe('success')
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].content).toBe('Question B')
    expect(result.current.messages[1].content).toBe('Real Answer B')
  })
})
