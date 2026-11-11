import { apiRequest } from './client'
import type {
  AssistantQueryPayload,
  AssistantQueryResponse,
  StarterPromptsResponse,
} from './types'

/**
 * POST /assistant/query — submit a financial question to the AI Money Assistant.
 */
export async function submitAssistantQuery(
  payload: AssistantQueryPayload,
  signal?: AbortSignal,
): Promise<AssistantQueryResponse> {
  return apiRequest<AssistantQueryResponse>('/assistant/query', {
    method: 'POST',
    body: payload,
    signal,
  })
}

/**
 * GET /assistant/starter-prompts — fetch recommended conversation starter prompts.
 */
export async function fetchStarterPrompts(
  signal?: AbortSignal,
): Promise<StarterPromptsResponse> {
  return apiRequest<StarterPromptsResponse>('/assistant/starter-prompts', {
    method: 'GET',
    signal,
  })
}

