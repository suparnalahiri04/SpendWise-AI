import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBudgetProgress } from '@/lib/api/budgets'
import { ApiError, isAbortError } from '@/lib/api/client'
import { fetchRecurringPayments } from '@/lib/api/recurring'
import { fetchSavingsGoals } from '@/lib/api/savingsGoals'
import { fetchTransactions } from '@/lib/api/transactions'
import type {
  BudgetProgressSummary,
  RecurringPayment,
  SavingsGoal,
  Transaction,
} from '@/lib/api/types'
import {
  getCurrentMonthString,
  getNextMonthString,
  getPreviousMonthString,
} from '@/features/budgets/budgetUtils'
import {
  aggregateEventsByDate,
  calculateMonthSummary,
  extractDateKey,
  generateCalendarGrid,
  type CalendarGridDay,
  type CalendarMonthSummary,
  type DayEvents,
  type WeekStart,
} from './calendarUtils'

export type CalendarStateStatus = 'loading' | 'error' | 'success'

export interface FinancialCalendarState {
  status: CalendarStateStatus
  transactions: Transaction[]
  recurringPayments: RecurringPayment[]
  goals: SavingsGoal[]
  budgetProgress: BudgetProgressSummary | null
  error: string | null
}

export interface UseFinancialCalendarOptions {
  initialMonth?: string // YYYY-MM
  initialDate?: string // YYYY-MM-DD
  weekStart?: WeekStart
  refDate?: Date
}

export function useFinancialCalendar(options: UseFinancialCalendarOptions = {}) {
  const { initialMonth, initialDate, weekStart = 'sunday', refDate } = options

  const [defaultRefDate] = useState(() => new Date())
  const effectiveRefDate = refDate ?? defaultRefDate
  const todayKey = useMemo(() => extractDateKey(effectiveRefDate) ?? '', [effectiveRefDate])
  const currentMonthKey = useMemo(
    () => getCurrentMonthString(effectiveRefDate),
    [effectiveRefDate],
  )

  const [selectedMonth, setSelectedMonthState] = useState<string>(() => {
    if (initialMonth && /^(\d{4})-(0[1-9]|1[0-2])$/.test(initialMonth)) {
      return initialMonth
    }
    return currentMonthKey
  })

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      return initialDate
    }
    if (todayKey.startsWith(selectedMonth)) {
      return todayKey
    }
    return `${selectedMonth}-01`
  })

  const [state, setState] = useState<FinancialCalendarState>({
    status: 'loading',
    transactions: [],
    recurringPayments: [],
    goals: [],
    budgetProgress: null,
    error: null,
  })

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let isSubscribed = true

    Promise.all([
      fetchTransactions(controller.signal),
      fetchRecurringPayments({ status: 'all' }, controller.signal),
      fetchSavingsGoals({ includeArchived: false }, controller.signal),
      fetchBudgetProgress(selectedMonth, controller.signal).catch(() => null),
    ])
      .then(([transactions, recurringPayments, goalsSummary, budgetProgress]) => {
        if (!isSubscribed || controller.signal.aborted) return

        setState({
          status: 'success',
          transactions,
          recurringPayments,
          goals: goalsSummary ? goalsSummary.items : [],
          budgetProgress,
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (!isSubscribed || controller.signal.aborted || isAbortError(error, controller.signal)) {
          return
        }

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
  }, [selectedMonth, attempt])

  const setMonth = useCallback(
    (monthStr: string) => {
      if (!/^(\d{4})-(0[1-9]|1[0-2])$/.test(monthStr)) return
      setState((prev) => ({ ...prev, status: 'loading', error: null }))
      setSelectedMonthState(monthStr)

      // Update selected date to today if today is in target month; otherwise day 1 of month
      if (todayKey.startsWith(monthStr)) {
        setSelectedDate(todayKey)
      } else {
        setSelectedDate(`${monthStr}-01`)
      }
    },
    [todayKey],
  )

  const goToPreviousMonth = useCallback(() => {
    setMonth(getPreviousMonthString(selectedMonth))
  }, [selectedMonth, setMonth])

  const goToNextMonth = useCallback(() => {
    setMonth(getNextMonthString(selectedMonth))
  }, [selectedMonth, setMonth])

  const goToToday = useCallback(() => {
    setMonth(currentMonthKey)
    setSelectedDate(todayKey)
  }, [currentMonthKey, todayKey, setMonth])

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }))
    setAttempt((n) => n + 1)
  }, [])

  // 1. Grid of calendar days
  const gridDays: CalendarGridDay[] = useMemo(() => {
    try {
      return generateCalendarGrid(selectedMonth, weekStart, effectiveRefDate)
    } catch {
      return []
    }
  }, [selectedMonth, weekStart, effectiveRefDate])

  // 2. Events grouped by date
  const eventsByDate: Record<string, DayEvents> = useMemo(() => {
    return aggregateEventsByDate({
      transactions: state.transactions,
      recurringPayments: state.recurringPayments,
      goals: state.goals,
    })
  }, [state.transactions, state.recurringPayments, state.goals])

  // 3. Selected day events (guaranteed non-null)
  const selectedDayEvents: DayEvents = useMemo(() => {
    if (eventsByDate[selectedDate]) {
      return eventsByDate[selectedDate]
    }
    return {
      dateKey: selectedDate,
      transactions: [],
      recurringBills: [],
      goalMilestones: [],
      totalIncome: 0,
      totalExpenses: 0,
      netFlow: 0,
      hasEvents: false,
    }
  }, [eventsByDate, selectedDate])

  // 4. Monthly totals strictly limited to transactions within the displayed calendar month
  const monthSummary: CalendarMonthSummary = useMemo(() => {
    return calculateMonthSummary({
      monthString: selectedMonth,
      transactions: state.transactions,
      recurringPayments: state.recurringPayments,
      refDate: todayKey,
    })
  }, [selectedMonth, state.transactions, state.recurringPayments, todayKey])

  return {
    status: state.status,
    selectedMonth,
    selectedDate,
    setSelectedDate,
    setMonth,
    goToPreviousMonth,
    goToNextMonth,
    goToToday,
    reload,
    gridDays,
    eventsByDate,
    selectedDayEvents,
    monthSummary,
    budgetProgress: state.budgetProgress,
    error: state.error,
  }
}
