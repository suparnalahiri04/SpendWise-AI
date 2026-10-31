import { useCallback, useEffect, useState } from 'react'
import { fetchRecurringPayments, fetchRecurringSummary } from '@/lib/api/recurring'
import { ApiError, isAbortError } from '@/lib/api/client'
import type { RecurringPayment, RecurringPaymentSummary } from '@/lib/api/types'

export type RecurringStateStatus = 'loading' | 'error' | 'success'

export interface RecurringPaymentsState {
  status: RecurringStateStatus
  payments: RecurringPayment[]
  summary: RecurringPaymentSummary | null
  error: string | null
}

export function useRecurringPayments() {
  const [statusFilter, setStatusFilter] = useState<'active' | 'cancelled' | 'all'>('active')
  const [prevFilter, setPrevFilter] = useState(statusFilter)
  const [state, setState] = useState<RecurringPaymentsState>({
    status: 'loading',
    payments: [],
    summary: null,
    error: null,
  })
  const [attempt, setAttempt] = useState(0)

  // Reset to loading synchronously during render when filter changes
  if (prevFilter !== statusFilter) {
    setPrevFilter(statusFilter)
    setState((prev) => ({ ...prev, status: 'loading', error: null }))
  }

  useEffect(() => {
    const controller = new AbortController()
    let isSubscribed = true

    Promise.all([
      fetchRecurringPayments({ status: statusFilter === 'all' ? undefined : statusFilter }, controller.signal),
      fetchRecurringSummary(30, controller.signal),
    ])
      .then(([payments, summary]) => {
        if (!isSubscribed || controller.signal.aborted) return
        setState({
          status: 'success',
          payments,
          summary,
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (!isSubscribed || controller.signal.aborted || isAbortError(error, controller.signal)) return
        const message =
          error instanceof ApiError
            ? error.message
            : "We couldn't reach the SpendWise server. Check that the backend is running and try again."
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: message,
        }))
      })

    return () => {
      isSubscribed = false
      controller.abort()
    }
  }, [statusFilter, attempt])

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }))
    setAttempt((n) => n + 1)
  }, [])

  return {
    ...state,
    statusFilter,
    setStatusFilter,
    reload,
  }
}
