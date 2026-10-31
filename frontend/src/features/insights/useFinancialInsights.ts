import { useCallback, useEffect, useState } from 'react'
import { fetchFinancialInsights } from '@/lib/api/insights'
import { ApiError, isAbortError } from '@/lib/api/client'
import type { FinancialInsightsResponse } from '@/lib/api/types'

export type FinancialInsightsState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'error'; data: null; error: string }
  | { status: 'success'; data: FinancialInsightsResponse; error: null }

/**
 * Fetches financial insights and summary for the given month from GET /insights/.
 * Safely handles React StrictMode double mounts and request cancellation.
 */
export function useFinancialInsights(
  month: string,
): FinancialInsightsState & { reload: () => void } {
  const [state, setState] = useState<FinancialInsightsState>({
    status: 'loading',
    data: null,
    error: null,
  })
  const [prevMonth, setPrevMonth] = useState(month)
  const [attempt, setAttempt] = useState(0)

  // Reset to loading synchronously during render when the requested month changes
  if (prevMonth !== month) {
    setPrevMonth(month)
    setState({ status: 'loading', data: null, error: null })
  }

  useEffect(() => {
    const controller = new AbortController()
    let isSubscribed = true

    fetchFinancialInsights({ month }, controller.signal)
      .then((data) => {
        if (!isSubscribed || controller.signal.aborted) return
        setState({ status: 'success', data, error: null })
      })
      .catch((error: unknown) => {
        if (!isSubscribed || controller.signal.aborted || isAbortError(error, controller.signal)) return
        const message =
          error instanceof ApiError
            ? error.message
            : "We couldn't reach the SpendWise server. Check that the backend is running and try again."
        setState({ status: 'error', data: null, error: message })
      })

    return () => {
      isSubscribed = false
      controller.abort()
    }
  }, [month, attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading', data: null, error: null })
    setAttempt((n) => n + 1)
  }, [])

  return { ...state, reload }
}

