import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchStarterPrompts, submitAssistantQuery } from '@/lib/api/assistant'
import { ApiError, isAbortError } from '@/lib/api/client'
import type {
  AssistantQueryResponse,
  StarterPromptItem,
} from '@/lib/api/types'

export type AssistantStatus = 'idle' | 'loading' | 'success' | 'error'

export interface AssistantChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  response?: AssistantQueryResponse
}

export interface AssistantHookResult {
  messages: AssistantChatMessage[]
  starterPrompts: StarterPromptItem[]
  promptsLoading: boolean
  promptsError: string | null
  status: AssistantStatus
  isSubmitting: boolean
  error: string | null
  lastFailedQuery: string | null
  submitQuery: (queryText: string, overrideMonth?: string | null) => Promise<AssistantQueryResponse | null>
  retryLastQuery: () => Promise<AssistantQueryResponse | null>
  clearMessages: () => void
  reloadPrompts: () => Promise<void>
}

/**
 * Manages conversational state with the SpendWise AI Money Assistant.
 *
 * Enforces per-user authentication via client.ts, prevents concurrent duplicate
 * submissions, and preserves query/message context upon network or API failures.
 */
export function useAssistant(initialMonth?: string): AssistantHookResult {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([])
  const [starterPrompts, setStarterPrompts] = useState<StarterPromptItem[]>([])
  const [promptsLoading, setPromptsLoading] = useState(true)
  const [promptsError, setPromptsError] = useState<string | null>(null)
  const [status, setStatus] = useState<AssistantStatus>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null)
  const [lastFailedMonth, setLastFailedMonth] = useState<string | null | undefined>(null)

  // Mutex guard preventing duplicate in-flight submissions
  const isSubmittingRef = useRef(false)
  const activeControllerRef = useRef<AbortController | null>(null)
  const promptsControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    promptsControllerRef.current = controller

    fetchStarterPrompts(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setStarterPrompts(data.prompts)
        setPromptsLoading(false)
      })
      .catch((err: unknown) => {
        if (isAbortError(err, controller.signal) || controller.signal.aborted) return
        const message =
          err instanceof ApiError
            ? err.message
            : 'Failed to load conversation starter prompts.'
        setPromptsError(message)
        setPromptsLoading(false)
      })
      .finally(() => {
        if (promptsControllerRef.current === controller) {
          promptsControllerRef.current = null
        }
      })

    return () => {
      controller.abort()
    }
  }, [])

  // Public prompt reload callback (cancellation-safe against rapid reloads and unmount)
  const reloadPrompts = useCallback(async () => {
    if (promptsControllerRef.current) {
      promptsControllerRef.current.abort()
    }
    const controller = new AbortController()
    promptsControllerRef.current = controller

    setPromptsLoading(true)
    setPromptsError(null)

    try {
      const data = await fetchStarterPrompts(controller.signal)
      if (controller.signal.aborted) return
      setStarterPrompts(data.prompts)
      setPromptsLoading(false)
    } catch (err: unknown) {
      if (isAbortError(err, controller.signal) || controller.signal.aborted) return
      const message =
        err instanceof ApiError
          ? err.message
          : 'Failed to load conversation starter prompts.'
      setPromptsError(message)
      setPromptsLoading(false)
    } finally {
      if (promptsControllerRef.current === controller) {
        promptsControllerRef.current = null
      }
    }
  }, [])

  // Clean up any ongoing query or prompt fetch on unmount
  useEffect(() => {
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort()
      }
      if (promptsControllerRef.current) {
        promptsControllerRef.current.abort()
      }
    }
  }, [])

  // Submit a user question
  const submitQuery = useCallback(
    async (
      queryText: string,
      overrideMonth?: string | null,
    ): Promise<AssistantQueryResponse | null> => {
      const trimmed = queryText.trim()
      if (!trimmed) {
        return null
      }

      // Guard: block duplicate submission while a request is already in-flight
      if (isSubmittingRef.current) {
        return null
      }

      isSubmittingRef.current = true
      setIsSubmitting(true)
      setStatus('loading')
      setError(null)

      const targetMonth = overrideMonth !== undefined ? overrideMonth : initialMonth

      // Preserve query in conversation message history
      const userMessageId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      const userMessage: AssistantChatMessage = {
        id: userMessageId,
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMessage])

      const controller = new AbortController()
      activeControllerRef.current = controller

      try {
        const response = await submitAssistantQuery(
          { query: trimmed, month: targetMonth },
          controller.signal,
        )

        // Guard against updating state if the query was aborted or superseded while awaiting
        if (controller.signal.aborted || activeControllerRef.current !== controller) {
          return null
        }

        const assistantMessage: AssistantChatMessage = {
          id: `asst-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          role: 'assistant',
          content: response.answer_markdown,
          timestamp: new Date().toISOString(),
          response,
        }

        setMessages((prev) => [...prev, assistantMessage])
        setStatus('success')
        setError(null)
        setLastFailedQuery(null)
        setLastFailedMonth(null)
        return response
      } catch (err: unknown) {
        if (isAbortError(err, controller.signal) || activeControllerRef.current !== controller) {
          return null
        }

        // On failure, preserve the query so the user does not lose input
        setLastFailedQuery(trimmed)
        setLastFailedMonth(targetMonth)

        const message =
          err instanceof ApiError
            ? err.message
            : "We couldn't reach the SpendWise server. Check that the backend is running and try again."

        setError(message)
        setStatus('error')
        return null
      } finally {
        if (activeControllerRef.current === controller) {
          isSubmittingRef.current = false
          setIsSubmitting(false)
          activeControllerRef.current = null
        }
      }
    },
    [initialMonth],
  )

  // Retry the last failed query
  const retryLastQuery = useCallback(async (): Promise<AssistantQueryResponse | null> => {
    if (!lastFailedQuery || isSubmittingRef.current) {
      return null
    }

    const queryToRetry = lastFailedQuery
    const monthToRetry = lastFailedMonth

    // Remove the previous unfulfilled user message before re-submitting so it is not duplicated
    setMessages((prev) => {
      if (
        prev.length > 0 &&
        prev[prev.length - 1].role === 'user' &&
        prev[prev.length - 1].content === queryToRetry
      ) {
        return prev.slice(0, -1)
      }
      return prev
    })

    return submitQuery(queryToRetry, monthToRetry)
  }, [lastFailedQuery, lastFailedMonth, submitQuery])

  // Clear conversation state
  const clearMessages = useCallback(() => {
    // Abort any active query so its response cannot land in the cleared conversation
    if (activeControllerRef.current) {
      activeControllerRef.current.abort()
      activeControllerRef.current = null
    }
    isSubmittingRef.current = false
    setIsSubmitting(false)
    setMessages([])
    setError(null)
    setStatus('idle')
    setLastFailedQuery(null)
    setLastFailedMonth(null)
  }, [])

  return {
    messages,
    starterPrompts,
    promptsLoading,
    promptsError,
    status,
    isSubmitting,
    error,
    lastFailedQuery,
    submitQuery,
    retryLastQuery,
    clearMessages,
    reloadPrompts,
  }
}

