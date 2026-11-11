import { describe, expect, it } from 'vitest'
import type { RecurringPayment, SavingsGoal, Transaction } from '@/lib/api/types'
import {
  aggregateEventsByDate,
  calculateMonthSummary,
  extractDateKey,
  generateCalendarGrid,
  getDaysInMonth,
  isLeapYear,
  parseAmount,
  round2,
} from './calendarUtils'

describe('calendarUtils', () => {
  // ---------------------------------------------------------------------------
  // 1. Date-key handling & Timezone Safety
  // ---------------------------------------------------------------------------
  describe('extractDateKey', () => {
    it('extracts date key from UTC ISO string without timezone date shifting', () => {
      // Even if local timezone is UTC-5 (where midnight UTC corresponds to 7pm the prior day),
      // extractDateKey extracts the calendar date "2026-10-15".
      expect(extractDateKey('2026-10-15T00:00:00Z')).toBe('2026-10-15')
      expect(extractDateKey('2026-10-15T00:00:00.000Z')).toBe('2026-10-15')
      expect(extractDateKey('2026-10-15T23:59:59Z')).toBe('2026-10-15')
    })

    it('extracts date key from ISO string with timezone offset', () => {
      expect(extractDateKey('2026-10-15T09:30:00+05:30')).toBe('2026-10-15')
      expect(extractDateKey('2026-10-15T18:00:00-04:00')).toBe('2026-10-15')
    })

    it('extracts date key from plain YYYY-MM-DD string', () => {
      expect(extractDateKey('2026-10-15')).toBe('2026-10-15')
      expect(extractDateKey('2026-02-28')).toBe('2026-02-28')
    })

    it('formats a Date object to YYYY-MM-DD', () => {
      const d = new Date(2026, 9, 15) // October 15, 2026 in local time
      expect(extractDateKey(d)).toBe('2026-10-15')
    })

    it('handles null, undefined, empty, or invalid dates gracefully', () => {
      expect(extractDateKey(null)).toBeNull()
      expect(extractDateKey(undefined)).toBeNull()
      expect(extractDateKey('')).toBeNull()
      expect(extractDateKey('not-a-date')).toBeNull()
      expect(extractDateKey(new Date('invalid'))).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Month Boundaries & Leap Years
  // ---------------------------------------------------------------------------
  describe('getDaysInMonth & isLeapYear', () => {
    it('identifies leap years accurately', () => {
      expect(isLeapYear(2024)).toBe(true)
      expect(isLeapYear(2028)).toBe(true)
      expect(isLeapYear(2000)).toBe(true) // 400 year rule
      expect(isLeapYear(1900)).toBe(false) // 100 year rule
      expect(isLeapYear(2025)).toBe(false)
      expect(isLeapYear(2026)).toBe(false)
    })

    it('returns 29 days for February in a leap year and 28 in a non-leap year', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29)
      expect(getDaysInMonth(2025, 2)).toBe(28)
      expect(getDaysInMonth(2026, 2)).toBe(28)
    })

    it('returns correct day counts for all standard months', () => {
      expect(getDaysInMonth(2026, 1)).toBe(31) // January
      expect(getDaysInMonth(2026, 4)).toBe(30) // April
      expect(getDaysInMonth(2026, 7)).toBe(31) // July
      expect(getDaysInMonth(2026, 9)).toBe(30) // September
      expect(getDaysInMonth(2026, 12)).toBe(31) // December
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Month Grid Generation
  // ---------------------------------------------------------------------------
  describe('generateCalendarGrid', () => {
    it('generates a Sunday-first grid for October 2026 (starting on Thursday)', () => {
      // 2026-10-01 is a Thursday (day 4).
      // Sunday-first grid should have 4 leading days from September:
      // Sep 27 (Sun), Sep 28 (Mon), Sep 29 (Tue), Sep 30 (Wed).
      const grid = generateCalendarGrid('2026-10', 'sunday', new Date(2026, 9, 15))

      expect(grid.length).toBe(35) // 4 leading + 31 current = 35 cells

      // First cell is Sep 27
      expect(grid[0]).toEqual({
        dateKey: '2026-09-27',
        dayOfMonth: 27,
        monthString: '2026-09',
        isCurrentMonth: false,
        isToday: false,
        isWeekend: true,
        dayOfWeek: 0,
      })

      // Day 1 of October is at index 4 (Thursday)
      expect(grid[4]).toEqual({
        dateKey: '2026-10-01',
        dayOfMonth: 1,
        monthString: '2026-10',
        isCurrentMonth: true,
        isToday: false,
        isWeekend: false,
        dayOfWeek: 4,
      })

      // October 15 is marked as today
      const todayCell = grid.find((c) => c.dateKey === '2026-10-15')
      expect(todayCell?.isToday).toBe(true)

      // Last cell of October is index 34 (Oct 31, Saturday)
      expect(grid[34]).toEqual({
        dateKey: '2026-10-31',
        dayOfMonth: 31,
        monthString: '2026-10',
        isCurrentMonth: true,
        isToday: false,
        isWeekend: true,
        dayOfWeek: 6,
      })
    })

    it('generates a Monday-first grid for October 2026', () => {
      // 2026-10-01 is Thursday. In Monday-first, Thursday has offset 3 (Mon=0, Tue=1, Wed=2, Thu=3).
      // Leading days: Sep 28 (Mon), Sep 29 (Tue), Sep 30 (Wed).
      const grid = generateCalendarGrid('2026-10', 'monday', new Date(2026, 9, 15))

      expect(grid.length).toBe(35)
      expect(grid[0].dateKey).toBe('2026-09-28')
      expect(grid[0].dayOfWeek).toBe(1) // Monday
      expect(grid[3].dateKey).toBe('2026-10-01')
      expect(grid[3].dayOfWeek).toBe(4) // Thursday
      expect(grid[33].dateKey).toBe('2026-10-31')
      expect(grid[34].dateKey).toBe('2026-11-01')
      expect(grid[34].isCurrentMonth).toBe(false)
    })

    it('handles a 6-week month (42 cells)', () => {
      // August 2026: starts on Saturday (Aug 1).
      // Sunday-start: 6 leading days + 31 days = 37 -> requires 42 cells.
      const grid = generateCalendarGrid('2026-08', 'sunday')
      expect(grid.length).toBe(42)
      expect(grid[0].dateKey).toBe('2026-07-26')
      expect(grid[6].dateKey).toBe('2026-08-01')
      expect(grid[36].dateKey).toBe('2026-08-31')
      expect(grid[41].dateKey).toBe('2026-09-05')
    })

    it('handles year transitions in padding (December -> January and January -> December)', () => {
      // January 2027 has leading days from December 2026
      const janGrid = generateCalendarGrid('2027-01', 'sunday')
      expect(janGrid[0].monthString).toBe('2026-12')
      expect(janGrid[0].dateKey).toMatch(/^2026-12-/)

      // December 2026 has trailing days in January 2027
      const decGrid = generateCalendarGrid('2026-12', 'sunday')
      const trailing = decGrid.filter((c) => !c.isCurrentMonth && c.dateKey.startsWith('2027-'))
      expect(trailing.length).toBeGreaterThan(0)
      expect(trailing[0].monthString).toBe('2027-01')
    })

    it('throws error for invalid month format', () => {
      expect(() => generateCalendarGrid('invalid')).toThrow(/Expected format YYYY-MM/)
      expect(() => generateCalendarGrid('2026-13')).toThrow(/Expected format YYYY-MM/)
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Daily Events & Totals Aggregation
  // ---------------------------------------------------------------------------
  describe('aggregateEventsByDate', () => {
    const mockTx1: Transaction = {
      id: 1,
      transaction_date: '2026-10-05T00:00:00Z',
      description: 'Salary Deposit',
      amount: '50000.00',
      transaction_type: 'income',
      category: 'Income',
      predicted_category: null,
      prediction_confidence: null,
      is_reviewed: true,
    }

    const mockTx2: Transaction = {
      id: 2,
      transaction_date: '2026-10-05T12:00:00Z',
      description: 'Grocery Shopping',
      amount: '3500.50',
      transaction_type: 'expense',
      category: 'Groceries',
      predicted_category: null,
      prediction_confidence: null,
      is_reviewed: true,
    }

    const mockTx3: Transaction = {
      id: 3,
      transaction_date: '2026-10-05T18:00:00Z',
      description: 'Dinner with Friends',
      amount: '1200.00',
      transaction_type: 'expense',
      category: 'Food/Dining',
      predicted_category: null,
      prediction_confidence: null,
      is_reviewed: true,
    }

    const mockRecurringActive: RecurringPayment = {
      id: 10,
      user_id: 1,
      description: 'Internet Fiber',
      amount: '1500.00',
      category: 'Bills/Utilities',
      frequency: 'monthly',
      start_date: '2026-01-05',
      next_due_date: '2026-10-05',
      status: 'active',
      is_active: true,
      is_overdue: false,
      days_until_due: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    const mockRecurringCancelled: RecurringPayment = {
      id: 11,
      user_id: 1,
      description: 'Old Gym Membership',
      amount: '2000.00',
      category: 'Healthcare',
      frequency: 'monthly',
      start_date: '2026-01-05',
      next_due_date: '2026-10-05',
      status: 'cancelled',
      is_active: false,
      is_overdue: false,
      days_until_due: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    const mockGoal: SavingsGoal = {
      id: 20,
      user_id: 1,
      name: 'Emergency Fund Milestone',
      target_amount: '50000.00',
      target_date: '2026-10-05',
      status: 'in_progress',
      total_contributed: '25000.00',
      remaining_amount: '25000.00',
      progress_pct: 50.0,
      is_completed: false,
      is_on_track: true,
      days_remaining: 0,
      recent_contributions: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    it('aggregates multiple income and expense transactions on the same date with correct netFlow', () => {
      const eventsMap = aggregateEventsByDate({
        transactions: [mockTx1, mockTx2, mockTx3],
      })

      const day = eventsMap['2026-10-05']
      expect(day).toBeDefined()
      expect(day.transactions).toHaveLength(3)
      expect(day.totalIncome).toBe(50000.0)
      expect(day.totalExpenses).toBe(4700.5) // 3500.50 + 1200.00
      expect(day.netFlow).toBe(45299.5) // 50000.00 - 4700.50
      expect(day.hasEvents).toBe(true)
    })

    it('includes active recurring commitments on their next_due_date but excludes cancelled commitments', () => {
      const eventsMap = aggregateEventsByDate({
        recurringPayments: [mockRecurringActive, mockRecurringCancelled],
      })

      const day = eventsMap['2026-10-05']
      expect(day).toBeDefined()
      expect(day.recurringBills).toHaveLength(1)
      expect(day.recurringBills[0].id).toBe(10)
      expect(day.recurringBills[0].description).toBe('Internet Fiber')
    })

    it('maps savings goal target dates as milestones without treating them as transactions', () => {
      const eventsMap = aggregateEventsByDate({
        goals: [mockGoal],
      })

      const day = eventsMap['2026-10-05']
      expect(day).toBeDefined()
      expect(day.goalMilestones).toHaveLength(1)
      expect(day.goalMilestones[0].name).toBe('Emergency Fund Milestone')
      // Goal milestones must not alter transaction income or expenses
      expect(day.totalIncome).toBe(0)
      expect(day.totalExpenses).toBe(0)
      expect(day.netFlow).toBe(0)
    })

    it('returns empty date object when no events exist for a date', () => {
      const eventsMap = aggregateEventsByDate({})
      expect(eventsMap['2026-10-12']).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Month Summary Calculation
  // ---------------------------------------------------------------------------
  describe('calculateMonthSummary', () => {
    const transactions: Transaction[] = [
      // September transactions (must be excluded from October summary)
      {
        id: 1,
        transaction_date: '2026-09-30T10:00:00Z',
        description: 'Prior Month Coffee',
        amount: '250.00',
        transaction_type: 'expense',
        category: 'Food/Dining',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      },
      // October transactions
      {
        id: 2,
        transaction_date: '2026-10-01T10:00:00Z',
        description: 'Oct Salary',
        amount: '60000.00',
        transaction_type: 'income',
        category: 'Income',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      },
      {
        id: 3,
        transaction_date: '2026-10-10T12:00:00Z',
        description: 'Oct Rent',
        amount: '18000.00',
        transaction_type: 'expense',
        category: 'Bills/Utilities',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      },
      {
        id: 4,
        transaction_date: '2026-10-20T15:00:00Z',
        description: 'Oct Groceries',
        amount: '4500.00',
        transaction_type: 'expense',
        category: 'Groceries',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      },
      // November transactions (must be excluded from October summary)
      {
        id: 5,
        transaction_date: '2026-11-01T10:00:00Z',
        description: 'Next Month Income',
        amount: '60000.00',
        transaction_type: 'income',
        category: 'Income',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      },
    ]

    const recurringPayments: RecurringPayment[] = [
      // Active bill due in October
      {
        id: 10,
        user_id: 1,
        description: 'Electricity Bill',
        amount: '2200.00',
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
      // Active overdue bill (due Oct 5 when refDate is Oct 15)
      {
        id: 11,
        user_id: 1,
        description: 'Water Utility',
        amount: '600.00',
        category: 'Bills/Utilities',
        frequency: 'monthly',
        start_date: '2026-01-05',
        next_due_date: '2026-10-05',
        status: 'active',
        is_active: true,
        is_overdue: true,
        days_until_due: -10,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      // Cancelled bill (must not be counted in active totals)
      {
        id: 12,
        user_id: 1,
        description: 'Cancelled Subscription',
        amount: '999.00',
        category: 'Entertainment',
        frequency: 'monthly',
        start_date: '2026-01-12',
        next_due_date: '2026-10-12',
        status: 'cancelled',
        is_active: false,
        is_overdue: false,
        days_until_due: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      // Active bill due in November
      {
        id: 13,
        user_id: 1,
        description: 'Next Month Gym',
        amount: '1500.00',
        category: 'Healthcare',
        frequency: 'monthly',
        start_date: '2026-01-05',
        next_due_date: '2026-11-05',
        status: 'active',
        is_active: true,
        is_overdue: false,
        days_until_due: 20,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]

    it('calculates totals strictly for transactions and active bills in the specified month', () => {
      const summary = calculateMonthSummary({
        monthString: '2026-10',
        transactions,
        recurringPayments,
        refDate: '2026-10-15',
      })

      expect(summary.monthString).toBe('2026-10')
      expect(summary.totalIncome).toBe(60000.0) // Only Oct salary
      expect(summary.totalExpenses).toBe(22500.0) // 18000 + 4500 (excludes Sep coffee)
      expect(summary.netSavings).toBe(37500.0) // 60000 - 22500
      expect(summary.transactionCount).toBe(3) // 3 Oct transactions

      // Active bills due in October: id 10 (2200) + id 11 (600) = 2800 (excludes cancelled and Nov bill)
      expect(summary.activeBillsDueCount).toBe(2)
      expect(summary.activeBillsDueTotal).toBe(2800.0)

      // Overdue bill: id 11 (600)
      expect(summary.overdueBillsCount).toBe(1)
      expect(summary.overdueBillsTotal).toBe(600.0)
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Utility Functions
  // ---------------------------------------------------------------------------
  describe('parseAmount & round2', () => {
    it('parses numeric and string amounts safely', () => {
      expect(parseAmount('1250.50')).toBe(1250.5)
      expect(parseAmount(1250.5)).toBe(1250.5)
      expect(parseAmount('1,250.50')).toBe(1250.5)
      expect(parseAmount(null)).toBe(0)
      expect(parseAmount(undefined)).toBe(0)
      expect(parseAmount(-100)).toBe(0) // non-negative
      expect(parseAmount('invalid')).toBe(0)
    })

    it('rounds to 2 decimal places reliably', () => {
      expect(round2(10.005)).toBe(10.01)
      expect(round2(10.004)).toBe(10.0)
      expect(round2(0)).toBe(0)
    })
  })
})

