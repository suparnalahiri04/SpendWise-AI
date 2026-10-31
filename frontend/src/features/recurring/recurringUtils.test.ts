import { describe, expect, it } from 'vitest'
import type { RecurringPayment } from '@/lib/api/types'
import {
  formatFrequency,
  getDueStatus,
  getTodayDateString,
  validateRecurringForm,
} from './recurringUtils'

describe('recurringUtils', () => {
  it('formats frequencies cleanly', () => {
    expect(formatFrequency('weekly')).toBe('Weekly')
    expect(formatFrequency('monthly')).toBe('Monthly')
    expect(formatFrequency('quarterly')).toBe('Quarterly')
    expect(formatFrequency('yearly')).toBe('Yearly')
  })

  it('determines due status for overdue, due soon, and cancelled items', () => {
    const base: RecurringPayment = {
      id: 1,
      user_id: 1,
      description: 'Test',
      amount: 100,
      category: 'Bills/Utilities',
      frequency: 'monthly',
      start_date: '2026-10-01',
      next_due_date: '2026-10-31',
      status: 'active',
      is_active: true,
      is_overdue: false,
      days_until_due: 0,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    }

    // Due today
    expect(getDueStatus({ ...base, days_until_due: 0 })).toEqual({
      label: 'Due today',
      tone: 'butter',
      isOverdue: false,
    })

    // Due tomorrow
    expect(getDueStatus({ ...base, days_until_due: 1 })).toEqual({
      label: 'Due tomorrow',
      tone: 'butter',
      isOverdue: false,
    })

    // Due in 5 days
    expect(getDueStatus({ ...base, days_until_due: 5 })).toEqual({
      label: 'Due in 5 days',
      tone: 'butter',
      isOverdue: false,
    })

    // Due in 15 days (safe)
    expect(getDueStatus({ ...base, days_until_due: 15 })).toEqual({
      label: 'Due in 15 days',
      tone: 'sage',
      isOverdue: false,
    })

    // Overdue by 1 day
    expect(getDueStatus({ ...base, is_overdue: true, days_until_due: -1 })).toEqual({
      label: 'Overdue by 1 day',
      tone: 'terracotta',
      isOverdue: true,
    })

    // Overdue by 4 days
    expect(getDueStatus({ ...base, is_overdue: true, days_until_due: -4 })).toEqual({
      label: 'Overdue by 4 days',
      tone: 'terracotta',
      isOverdue: true,
    })

    // Cancelled item
    expect(getDueStatus({ ...base, status: 'cancelled', is_active: false, days_until_due: -5 })).toEqual({
      label: 'Cancelled',
      tone: 'neutral',
      isOverdue: false,
    })
  })

  it('validates form values properly', () => {
    expect(
      validateRecurringForm({
        description: 'Netflix',
        amount: '649.00',
        category: 'Entertainment',
        frequency: 'monthly',
        startDate: '2026-10-01',
        nextDueDate: '2026-11-01',
      }),
    ).toBeNull()

    // Missing description
    expect(
      validateRecurringForm({
        description: '   ',
        amount: '649.00',
        category: 'Entertainment',
        frequency: 'monthly',
      }),
    ).toBe('Please enter a description for the payment.')

    // Zero amount
    expect(
      validateRecurringForm({
        description: 'Netflix',
        amount: '0',
        category: 'Entertainment',
        frequency: 'monthly',
      }),
    ).toBe('Amount must be greater than zero.')

    // Negative amount
    expect(
      validateRecurringForm({
        description: 'Netflix',
        amount: '-50',
        category: 'Entertainment',
        frequency: 'monthly',
      }),
    ).toBe('Amount must be greater than zero.')

    // Invalid frequency
    expect(
      validateRecurringForm({
        description: 'Netflix',
        amount: '100',
        category: 'Entertainment',
        frequency: 'daily',
      }),
    ).toBe('Please choose a valid payment frequency.')

    // Invalid date pattern
    expect(
      validateRecurringForm({
        description: 'Netflix',
        amount: '100',
        category: 'Entertainment',
        frequency: 'monthly',
        nextDueDate: '2026-13-45',
      }),
    ).toBe('Next due date must be in YYYY-MM-DD format.')
  })

  it('returns valid today date string YYYY-MM-DD', () => {
    const fixed = new Date(2026, 9, 31) // Month index 9 is October
    expect(getTodayDateString(fixed)).toBe('2026-10-31')
  })
})

