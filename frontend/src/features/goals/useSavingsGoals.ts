import { useCallback, useEffect, useState } from 'react'
import { fetchSavingsGoals } from '@/lib/api/savingsGoals'
import { ApiError, isAbortError } from '@/lib/api/client'
import type { SavingsGoal, SavingsGoalsSummaryResponse } from '@/lib/api/types'

export type GoalsStateStatus = 'loading' | 'error' | 'success'
export type GoalFilterTab = 'all' | 'in_progress' | 'completed' | 'archived'

export interface SavingsGoalsState {
  status: GoalsStateStatus
  goals: SavingsGoal[]
  summary: SavingsGoalsSummaryResponse | null
  error: string | null
}

export function useSavingsGoals() {
  const [statusFilter, setStatusFilter] = useState<GoalFilterTab>('all')
  const [state, setState] = useState<SavingsGoalsState>({
    status: 'loading',
    goals: [],
    summary: null,
    error: null,
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let isSubscribed = true

    fetchSavingsGoals({ includeArchived: true }, controller.signal)
      .then((summary) => {
        if (!isSubscribed || controller.signal.aborted) return
        setState({
          status: 'success',
          goals: summary.items,
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
  }, [attempt])

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }))
    setAttempt((n) => n + 1)
  }, [])

  const filteredGoals = state.goals.filter((goal) => {
    if (statusFilter === 'all') return true
    return goal.status === statusFilter
  })

  return {
    status: state.status,
    goals: state.goals,
    filteredGoals,
    summary: state.summary,
    error: state.error,
    statusFilter,
    setStatusFilter,
    reload,
  }
}

