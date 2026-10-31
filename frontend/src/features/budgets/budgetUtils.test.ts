import { describe, expect, it } from 'vitest'
import {
  formatMonthLabel,
  getCurrentMonthString,
  getNextMonthString,
  getPreviousMonthString,
  getBudgetStatus,
  validateBudgetForm,
} from './budgetUtils'

describe('budgetUtils', () => {
  it('formats month string into human readable label', () => {
    expect(formatMonthLabel('2026-10')).toBe('October 2026')
    expect(formatMonthLabel('2026-01')).toBe('January 2026')
    expect(formatMonthLabel('2026-12')).toBe('December 2026')
    expect(formatMonthLabel('invalid')).toBe('invalid')
  })

  it('calculates previous and next month correctly across year boundary', () => {
    expect(getPreviousMonthString('2026-10')).toBe('2026-09')
    expect(getPreviousMonthString('2026-01')).toBe('2025-12')

    expect(getNextMonthString('2026-10')).toBe('2026-11')
    expect(getNextMonthString('2026-12')).toBe('2027-01')
  })

  it('gets current month string', () => {
    const fixed = new Date(2026, 9, 15) // Month 9 is October
    expect(getCurrentMonthString(fixed)).toBe('2026-10')
  })

  it('validates budget form values', () => {
    expect(
      validateBudgetForm({
        category: 'Food/Dining',
        limit_amount: '5000',
        month: '2026-10',
      }),
    ).toBeNull()

    // Empty category
    expect(
      validateBudgetForm({
        category: '   ',
        limit_amount: '5000',
        month: '2026-10',
      }),
    ).toBe('Please select or enter a category.')

    // Invalid month
    expect(
      validateBudgetForm({
        category: 'Food/Dining',
        limit_amount: '5000',
        month: '2026-13',
      }),
    ).toBe('Please specify a valid month in YYYY-MM format.')

    // Zero or negative amount
    expect(
      validateBudgetForm({
        category: 'Food/Dining',
        limit_amount: '0',
        month: '2026-10',
      }),
    ).toBe('Monthly budget limit must be greater than zero.')

    expect(
      validateBudgetForm({
        category: 'Food/Dining',
        limit_amount: '-100',
        month: '2026-10',
      }),
    ).toBe('Monthly budget limit must be greater than zero.')

    expect(
      validateBudgetForm({
        category: 'Food/Dining',
        limit_amount: 'abc',
        month: '2026-10',
      }),
    ).toBe('Monthly budget limit must be greater than zero.')
  })

  it('determines budget visual status correctly', () => {
    // 0% spending
    const zero = getBudgetStatus(0, false)
    expect(zero.tone).toBe('sage')
    expect(zero.label).toBe('0% used')
    expect(zero.progressPercent).toBe(0)

    // 45% spending (safe)
    const safe = getBudgetStatus(45, false)
    expect(safe.tone).toBe('sage')
    expect(safe.label).toBe('On track')
    expect(safe.progressPercent).toBe(45)

    // 85% spending (approaching limit)
    const warn = getBudgetStatus(85, false)
    expect(warn.tone).toBe('butter')
    expect(warn.label).toBe('Approaching limit')
    expect(warn.progressPercent).toBe(85)

    // 100% spending (approaching/at limit)
    const atLimit = getBudgetStatus(100, false)
    expect(atLimit.tone).toBe('butter')
    expect(atLimit.progressPercent).toBe(100)

    // 125% spending (exceeded)
    const exceeded = getBudgetStatus(125, true)
    expect(exceeded.tone).toBe('terracotta')
    expect(exceeded.label).toBe('Over budget')
    expect(exceeded.progressPercent).toBe(100) // progress bar clamped to 100%

    // Exceeded even if percentage calculation was slightly off
    const flagOnly = getBudgetStatus(99, true)
    expect(flagOnly.tone).toBe('terracotta')
    expect(flagOnly.label).toBe('Over budget')
  })
})

