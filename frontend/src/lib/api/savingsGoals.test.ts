import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTokenProvider, setUnauthorizedHandler } from './client'
import {
  addGoalContribution,
  createSavingsGoal,
  deleteGoalContribution,
  deleteSavingsGoal,
  fetchGoalContributions,
  fetchSavingsGoals,
  getSavingsGoal,
  updateSavingsGoal,
} from './savingsGoals'
import type {
  GoalContribution,
  SavingsGoal,
  SavingsGoalsSummaryResponse,
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
  setTokenProvider(() => 'test-jwt')
  setUnauthorizedHandler(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  fetchMock.mockReset()
  setTokenProvider(() => null)
  setUnauthorizedHandler(null)
})

describe('Savings Goals API Client', () => {
  const sampleGoal: SavingsGoal = {
    id: 1,
    user_id: 1,
    name: 'Emergency Fund',
    target_amount: '50000.00',
    target_date: '2026-12-31',
    status: 'in_progress',
    total_contributed: '15000.00',
    remaining_amount: '35000.00',
    progress_pct: 30.0,
    is_completed: false,
    is_on_track: true,
    days_remaining: 60,
    recent_contributions: [],
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  }

  const sampleSummary: SavingsGoalsSummaryResponse = {
    total_target_amount: '50000.00',
    total_saved_amount: '15000.00',
    total_remaining_amount: '35000.00',
    overall_progress_pct: 30.0,
    goals_count: 1,
    completed_goals_count: 0,
    items: [sampleGoal],
  }

  it('fetchSavingsGoals calls GET /goals/ with proper query parameters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleSummary))

    const result = await fetchSavingsGoals({ includeArchived: false, refDate: '2026-10-15' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/goals/?include_archived=false&ref_date=2026-10-15')
    expect(init?.method).toBe('GET')
    expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer test-jwt')
    expect(result).toEqual(sampleSummary)
  })

  it('createSavingsGoal calls POST /goals/ with JSON body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleGoal, 201))

    const payload = { name: 'Emergency Fund', target_amount: 50000, target_date: '2026-12-31' }
    const result = await createSavingsGoal(payload)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/goals/')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual(payload)
    expect(result).toEqual(sampleGoal)
  })

  it('getSavingsGoal calls GET /goals/{id}', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleGoal))

    const result = await getSavingsGoal(1, '2026-10-15')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/goals/1?ref_date=2026-10-15')
    expect(result).toEqual(sampleGoal)
  })

  it('updateSavingsGoal calls PUT /goals/{id}', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...sampleGoal, name: 'Updated Fund' }))

    const result = await updateSavingsGoal(1, { name: 'Updated Fund' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/goals/1')
    expect(init?.method).toBe('PUT')
    expect(result.name).toBe('Updated Fund')
  })

  it('deleteSavingsGoal calls DELETE /goals/{id}', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await deleteSavingsGoal(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/goals/1')
    expect(init?.method).toBe('DELETE')
  })

  it('addGoalContribution calls POST /goals/{id}/contributions', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleGoal, 201))

    const payload = { amount: 5000, notes: 'Bonus deposit' }
    const result = await addGoalContribution(1, payload)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/goals/1/contributions')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual(payload)
    expect(result).toEqual(sampleGoal)
  })

  it('fetchGoalContributions calls GET /goals/{id}/contributions and validates list', async () => {
    const sampleContrib: GoalContribution = {
      id: 10,
      goal_id: 1,
      user_id: 1,
      amount: '5000.00',
      contribution_date: '2026-10-15',
      notes: 'Initial',
      created_at: '2026-10-15T10:00:00Z',
    }
    fetchMock.mockResolvedValueOnce(jsonResponse([sampleContrib]))

    const result = await fetchGoalContributions(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/goals/1/contributions')
    expect(result).toEqual([sampleContrib])
  })

  it('deleteGoalContribution calls DELETE /goals/{id}/contributions/{contributionId}', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleGoal))

    const result = await deleteGoalContribution(1, 10)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/goals/1/contributions/10')
    expect(init?.method).toBe('DELETE')
    expect(result).toEqual(sampleGoal)
  })
})

