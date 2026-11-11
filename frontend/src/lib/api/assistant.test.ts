import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTokenProvider, setUnauthorizedHandler } from './client'
import { fetchStarterPrompts, submitAssistantQuery } from './assistant'
import type {
  AssistantQueryResponse,
  StarterPromptsResponse,
} from './types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

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

describe('Assistant API Client', () => {
  describe('submitAssistantQuery', () => {
    it('submits a query with Bearer token and returns the parsed response', async () => {
      const mockResponse: AssistantQueryResponse = {
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
            notes: '3 entries recorded',
          },
        ],
        estimates: [],
        recommendations: [],
        data_limitations: [],
        suggested_followups: ['What are my biggest spending categories?'],
        engine: 'deterministic',
      }

      fetchMock.mockResolvedValueOnce(jsonResponse(mockResponse, 200))

      const result = await submitAssistantQuery({
        query: 'How much did I spend this month?',
        month: '2026-10',
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('http://api.test/assistant/query')
      expect(init?.method).toBe('POST')
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer jwt-test-token')

      const body = JSON.parse(init?.body as string)
      expect(body).toEqual({
        query: 'How much did I spend this month?',
        month: '2026-10',
      })

      expect(result).toEqual(mockResponse)
    })

    it('propagates 401 unauthorized errors and triggers handler', async () => {
      const onUnauthorized = vi.fn()
      setUnauthorizedHandler(onUnauthorized)

      fetchMock.mockResolvedValueOnce(
        jsonResponse({ detail: 'Invalid or missing authentication token.' }, 401),
      )

      await expect(
        submitAssistantQuery({ query: 'Hello' }),
      ).rejects.toThrow(/invalid or missing authentication token/i)

      expect(onUnauthorized).toHaveBeenCalledTimes(1)
    })

    it('propagates 422 validation errors with field detail', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            detail: [
              { loc: ['body', 'query'], msg: 'String should have at least 1 character' },
            ],
          },
          422,
        ),
      )

      await expect(
        submitAssistantQuery({ query: '' }),
      ).rejects.toThrow(/query: String should have at least 1 character/i)
    })
  })

  describe('fetchStarterPrompts', () => {
    it('fetches starter prompts from GET /assistant/starter-prompts', async () => {
      const mockPrompts: StarterPromptsResponse = {
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

      fetchMock.mockResolvedValueOnce(jsonResponse(mockPrompts, 200))

      const result = await fetchStarterPrompts()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('http://api.test/assistant/starter-prompts')
      expect(init?.method).toBe('GET')
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer jwt-test-token')
      expect(result.prompts).toHaveLength(2)
      expect(result.prompts[0].id).toBe('spending-summary')
    })
  })
})

