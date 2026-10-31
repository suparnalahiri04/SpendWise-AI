import { useCallback, useEffect, useState } from 'react'
import { ApiError, isAbortError } from '@/lib/api/client'
import { fetchStatementHistory } from '@/lib/api/statements'
import type { StatementImportHistoryItem } from '@/lib/api/types'

export type StatementHistoryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; items: StatementImportHistoryItem[] }

/** Loads the signed-in user's statement import history from GET /statements/history. */
export function useStatementHistory(): StatementHistoryState & {
  reload: () => void
} {
  const [state, setState] = useState<StatementHistoryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let isSubscribed = true

    fetchStatementHistory(controller.signal)
      .then((items) => {
        if (!isSubscribed || controller.signal.aborted) return
        setState({ status: 'success', items })
      })
      .catch((error: unknown) => {
        if (!isSubscribed || controller.signal.aborted || isAbortError(error, controller.signal)) return
        setState({
          status: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Failed to load statement import history. Please try again.',
        })
      })

    return () => {
      isSubscribed = false
      controller.abort()
    }
  }, [attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return { ...state, reload }
}

