import { useCallback, useEffect, useState } from 'react'
import { fetchBudgetProgress } from '@/lib/api/budgets'
import { ApiError, isAbortError } from '@/lib/api/client'
import type { BudgetProgressSummary } from '@/lib/api/types'

export type BudgetProgressState =
  | { status: 'loading'; summary: null; error: null }
  | { status: 'error'; summary: null; error: string }
  | { status: 'success'; summary: BudgetProgressSummary; error: null }

/**
 * Fetches spending progress for the given month from GET /budgets/progress.
 * Safely handles React StrictMode double mounts and request cancellation.
 */
export function useBudgetProgress(month: string): BudgetProgressState & { reload: () => void } {
  const [state, setState] = useState<BudgetProgressState>({
    status: 'loading',
    summary: null,
    error: null,
  })
  const [prevMonth, setPrevMonth] = useState(month)
  const [attempt, setAttempt] = useState(0)

  // Reset to loading synchronously during render when the requested month changes
  if (prevMonth !== month) {
    setPrevMonth(month)
    setState({ status: 'loading', summary: null, error: null })
  }

  useEffect(() => {
    const controller = new AbortController()
    let isSubscribed = true

    fetchBudgetProgress(month, controller.signal)
      .then((summary) => {
        if (!isSubscribed || controller.signal.aborted) return
        setState({ status: 'success', summary, error: null })
      })
      .catch((error: unknown) => {
        if (!isSubscribed || controller.signal.aborted || isAbortError(error, controller.signal)) return
        const message =
          error instanceof ApiError
            ? error.message
            : "We couldn't reach the SpendWise server. Check that the backend is running and try again."
        setState({ status: 'error', summary: null, error: message })
      })

    return () => {
      isSubscribed = false
      controller.abort()
    }
  }, [month, attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading', summary: null, error: null })
    setAttempt((n) => n + 1)
  }, [])

  return { ...state, reload }
}
