import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as budgetsApi from '@/lib/api/budgets'
import { ApiError } from '@/lib/api/client'
import * as recurringApi from '@/lib/api/recurring'
import * as savingsGoalsApi from '@/lib/api/savingsGoals'
import * as transactionsApi from '@/lib/api/transactions'
import type {
  BudgetProgressSummary,
  RecurringPayment,
  SavingsGoalsSummaryResponse,
  Transaction,
} from '@/lib/api/types'
import { useFinancialCalendar } from './useFinancialCalendar'

const mockTransactions: Transaction[] = [
  // Prior month (September)
  {
    id: 1,
    transaction_date: '2026-09-28',
    description: 'Sep Groceries',
    amount: '1500.00',
    transaction_type: 'expense',
    category: 'Groceries',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
  // Selected month (October)
  {
    id: 2,
    transaction_date: '2026-10-01',
    description: 'Salary',
    amount: '60000.00',
    transaction_type: 'income',
    category: 'Income',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
  {
    id: 3,
    transaction_date: '2026-10-15',
    description: 'Phone Bill',
    amount: '999.00',
    transaction_type: 'expense',
    category: 'Bills/Utilities',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
  // Future month (November)
  {
    id: 4,
    transaction_date: '2026-11-05',
    description: 'Nov Dinner',
    amount: '2000.00',
    transaction_type: 'expense',
    category: 'Food/Dining',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
]

const mockRecurring: RecurringPayment[] = [
  {
    id: 10,
    user_id: 1,
    description: 'Broadband',
    amount: '1200.00',
    category: 'Bills/Utilities',
    frequency: 'monthly',
    start_date: '2026-01-15',
    next_due_date: '2026-10-15',
    status: 'active',
    is_active: true,
    is_overdue: false,
    days_until_due: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 11,
    user_id: 1,
    description: 'Cancelled Magazine',
    amount: '300.00',
    category: 'Entertainment',
    frequency: 'monthly',
    start_date: '2026-01-15',
    next_due_date: '2026-10-15',
    status: 'cancelled',
    is_active: false,
    is_overdue: false,
    days_until_due: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

const mockGoalsSummary: SavingsGoalsSummaryResponse = {
  total_target_amount: '50000.00',
  total_saved_amount: '20000.00',
  total_remaining_amount: '30000.00',
  overall_progress_pct: 40.0,
  goals_count: 1,
  completed_goals_count: 0,
  items: [
    {
      id: 20,
      user_id: 1,
      name: 'Emergency Fund Milestone',
      target_amount: '50000.00',
      target_date: '2026-10-15',
      status: 'in_progress',
      total_contributed: '20000.00',
      remaining_amount: '30000.00',
      progress_pct: 40.0,
      is_completed: false,
      is_on_track: true,
      days_remaining: 0,
      recent_contributions: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
}

const mockBudgetProgress: BudgetProgressSummary = {
  month: '2026-10',
  total_budgeted: '25000.00',
  total_spent: '999.00',
  total_remaining: '24001.00',
  items: [],
}

describe('useFinancialCalendar', () => {
  const refDate = new Date(2026, 9, 15) // 2026-10-15

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(transactionsApi, 'fetchTransactions').mockResolvedValue(mockTransactions)
    vi.spyOn(recurringApi, 'fetchRecurringPayments').mockResolvedValue(mockRecurring)
    vi.spyOn(savingsGoalsApi, 'fetchSavingsGoals').mockResolvedValue(mockGoalsSummary)
    vi.spyOn(budgetsApi, 'fetchBudgetProgress').mockResolvedValue(mockBudgetProgress)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads calendar data successfully and populates grid, events, and monthly summary', async () => {
    const { result } = renderHook(() =>
      useFinancialCalendar({
        initialMonth: '2026-10',
        initialDate: '2026-10-15',
        refDate,
      }),
    )

    expect(result.current.status).toBe('loading')

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    // Grid days generated
    expect(result.current.gridDays.length).toBe(35)
    expect(result.current.selectedMonth).toBe('2026-10')
    expect(result.current.selectedDate).toBe('2026-10-15')

    // Selected day events inspection
    const day = result.current.selectedDayEvents
    expect(day.dateKey).toBe('2026-10-15')
    expect(day.transactions).toHaveLength(1)
    expect(day.transactions[0].description).toBe('Phone Bill')
    expect(day.recurringBills).toHaveLength(1)
    expect(day.recurringBills[0].description).toBe('Broadband')
    expect(day.goalMilestones).toHaveLength(1)
    expect(day.goalMilestones[0].name).toBe('Emergency Fund Milestone')
    expect(day.totalExpenses).toBe(999.0)
    expect(day.totalIncome).toBe(0)

    // Month summary strictly limited to October
    expect(result.current.monthSummary.totalIncome).toBe(60000.0) // excludes Sep & Nov
    expect(result.current.monthSummary.totalExpenses).toBe(999.0) // excludes Sep & Nov
    expect(result.current.monthSummary.netSavings).toBe(59001.0)
    expect(result.current.monthSummary.transactionCount).toBe(2)
  })

  it('changes month and refreshes data with updated month scope', async () => {
    const { result } = renderHook(() =>
      useFinancialCalendar({
        initialMonth: '2026-10',
        refDate,
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    // Switch to November
    act(() => {
      result.current.goToNextMonth()
    })

    expect(result.current.selectedMonth).toBe('2026-11')
    expect(result.current.selectedDate).toBe('2026-11-01')

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    // In November, only Nov transaction is in month summary
    expect(result.current.monthSummary.totalExpenses).toBe(2000.0)
    expect(result.current.monthSummary.totalIncome).toBe(0)
    expect(result.current.monthSummary.transactionCount).toBe(1)
  })

  it('navigates previous month and back to today', async () => {
    const { result } = renderHook(() =>
      useFinancialCalendar({
        initialMonth: '2026-10',
        refDate,
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    act(() => {
      result.current.goToPreviousMonth()
    })
    expect(result.current.selectedMonth).toBe('2026-09')
    expect(result.current.selectedDate).toBe('2026-09-01')

    act(() => {
      result.current.goToToday()
    })
    expect(result.current.selectedMonth).toBe('2026-10')
    expect(result.current.selectedDate).toBe('2026-10-15')
  })

  it('allows user to select any date and inspects its events', async () => {
    const { result } = renderHook(() =>
      useFinancialCalendar({
        initialMonth: '2026-10',
        refDate,
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    // Select Oct 1
    act(() => {
      result.current.setSelectedDate('2026-10-01')
    })

    expect(result.current.selectedDate).toBe('2026-10-01')
    expect(result.current.selectedDayEvents.transactions).toHaveLength(1)
    expect(result.current.selectedDayEvents.transactions[0].description).toBe('Salary')
    expect(result.current.selectedDayEvents.totalIncome).toBe(60000.0)

    // Select an empty date (Oct 10)
    act(() => {
      result.current.setSelectedDate('2026-10-10')
    })

    expect(result.current.selectedDate).toBe('2026-10-10')
    expect(result.current.selectedDayEvents.transactions).toHaveLength(0)
    expect(result.current.selectedDayEvents.hasEvents).toBe(false)
    expect(result.current.selectedDayEvents.totalIncome).toBe(0)
    expect(result.current.selectedDayEvents.totalExpenses).toBe(0)
  })

  it('handles API error and supports reload recovery', async () => {
    vi.spyOn(transactionsApi, 'fetchTransactions')
      .mockRejectedValueOnce(new ApiError('network', 'Failed to reach database'))
      .mockResolvedValueOnce(mockTransactions)

    const { result } = renderHook(() =>
      useFinancialCalendar({
        initialMonth: '2026-10',
        refDate,
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })

    expect(result.current.error).toBe('Failed to reach database')

    // Reload
    act(() => {
      result.current.reload()
    })

    expect(result.current.status).toBe('loading')

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    expect(result.current.error).toBeNull()
  })

  it('aborts active fetch requests on unmount safely without updating state', () => {
    let capturedSignal: AbortSignal | undefined
    vi.spyOn(transactionsApi, 'fetchTransactions').mockImplementation((signal) => {
      capturedSignal = signal
      return new Promise(() => {}) // never resolves
    })

    const { unmount } = renderHook(() =>
      useFinancialCalendar({
        initialMonth: '2026-10',
        refDate,
      }),
    )

    expect(capturedSignal?.aborted).toBe(false)

    unmount()

    expect(capturedSignal?.aborted).toBe(true)
  })
})

