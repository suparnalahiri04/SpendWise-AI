import { ApiError, apiRequest } from './client'
import type {
  GoalContribution,
  GoalContributionCreatePayload,
  SavingsGoal,
  SavingsGoalCreatePayload,
  SavingsGoalsSummaryResponse,
  SavingsGoalUpdatePayload,
} from './types'

export interface FetchSavingsGoalsOptions {
  includeArchived?: boolean
  refDate?: string
}

/**
 * GET /goals/ — retrieve all savings goals and summary metrics for the authenticated user.
 */
export async function fetchSavingsGoals(
  options: FetchSavingsGoalsOptions = {},
  signal?: AbortSignal,
): Promise<SavingsGoalsSummaryResponse> {
  const params = new URLSearchParams()
  if (options.includeArchived !== undefined) {
    params.set('include_archived', String(options.includeArchived))
  }
  if (options.refDate) {
    params.set('ref_date', options.refDate)
  }

  const query = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<SavingsGoalsSummaryResponse>(`/goals/${query}`, { signal })
}

/**
 * POST /goals/ — create a new savings goal.
 */
export async function createSavingsGoal(
  payload: SavingsGoalCreatePayload,
  signal?: AbortSignal,
): Promise<SavingsGoal> {
  return apiRequest<SavingsGoal>('/goals/', {
    method: 'POST',
    body: payload,
    signal,
  })
}

/**
 * GET /goals/{id} — fetch a single savings goal with progress.
 */
export async function getSavingsGoal(
  id: number,
  refDate?: string,
  signal?: AbortSignal,
): Promise<SavingsGoal> {
  const query = refDate ? `?ref_date=${encodeURIComponent(refDate)}` : ''
  return apiRequest<SavingsGoal>(`/goals/${id}${query}`, { signal })
}

/**
 * PUT /goals/{id} — update a goal's name, target amount, target date, or status.
 */
export async function updateSavingsGoal(
  id: number,
  payload: SavingsGoalUpdatePayload,
  signal?: AbortSignal,
): Promise<SavingsGoal> {
  return apiRequest<SavingsGoal>(`/goals/${id}`, {
    method: 'PUT',
    body: payload,
    signal,
  })
}

/**
 * DELETE /goals/{id} — delete a savings goal and its contributions.
 */
export async function deleteSavingsGoal(
  id: number,
  signal?: AbortSignal,
): Promise<void> {
  await apiRequest<void>(`/goals/${id}`, {
    method: 'DELETE',
    signal,
  })
}

/**
 * POST /goals/{id}/contributions — record a contribution toward a goal.
 */
export async function addGoalContribution(
  goalId: number,
  payload: GoalContributionCreatePayload,
  signal?: AbortSignal,
): Promise<SavingsGoal> {
  return apiRequest<SavingsGoal>(`/goals/${goalId}/contributions`, {
    method: 'POST',
    body: payload,
    signal,
  })
}

/**
 * GET /goals/{id}/contributions — list all historical contributions for a goal.
 */
export async function fetchGoalContributions(
  goalId: number,
  signal?: AbortSignal,
): Promise<GoalContribution[]> {
  const payload = await apiRequest<unknown>(`/goals/${goalId}/contributions`, { signal })
  if (!Array.isArray(payload)) {
    throw new ApiError('unknown', 'The server sent an unexpected response. Please try again.')
  }
  return payload as GoalContribution[]
}

/**
 * DELETE /goals/{id}/contributions/{contributionId} — delete an individual contribution.
 */
export async function deleteGoalContribution(
  goalId: number,
  contributionId: number,
  signal?: AbortSignal,
): Promise<SavingsGoal> {
  return apiRequest<SavingsGoal>(`/goals/${goalId}/contributions/${contributionId}`, {
    method: 'DELETE',
    signal,
  })
}

