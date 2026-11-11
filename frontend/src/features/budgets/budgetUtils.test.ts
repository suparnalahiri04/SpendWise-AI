import { describe, expect, it } from 'vitest'
import {
  classifyBudgetStatus,
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

  it('determines budget visual status correctly across standardized unrounded boundaries', () => {
    // 1. Below 80% (0%, 45%, 79.9%, 79.99%) -> normal/healthy status
    const zero = getBudgetStatus(0, false)
    expect(zero.tone).toBe('sage')
    expect(zero.label).toBe('0% used')
    expect(zero.progressPercent).toBe(0)
    expect(zero.statusSemantic).toBe('on_track')

    const safe = getBudgetStatus(45, false)
    expect(safe.tone).toBe('sage')
    expect(safe.label).toBe('On track')
    expect(safe.progressPercent).toBe(45)
    expect(safe.statusSemantic).toBe('on_track')

    const justBelow80 = getBudgetStatus(79.99, false)
    expect(justBelow80.tone).toBe('sage')
    expect(justBelow80.label).toBe('On track')
    expect(justBelow80.progressPercent).toBe(79.99)
    expect(justBelow80.statusSemantic).toBe('on_track')

    // 2. Exactly 80.00% -> approaching limit (warning/butter)
    const exactly80 = getBudgetStatus(80.0, false)
    expect(exactly80.tone).toBe('butter')
    expect(exactly80.label).toBe('Approaching limit')
    expect(exactly80.progressPercent).toBe(80)
    expect(exactly80.statusSemantic).toBe('approaching_limit')

    // 3. Immediately below 100% (99.99%) -> approaching limit
    const justBelow100 = getBudgetStatus(99.99, false)
    expect(justBelow100.tone).toBe('butter')
    expect(justBelow100.label).toBe('Approaching limit')
    expect(justBelow100.progressPercent).toBe(99.99)
    expect(justBelow100.statusSemantic).toBe('approaching_limit')

    // 4. Exactly 100.00% -> limit reached (terracotta, NOT over budget)
    const atLimit = getBudgetStatus(100.0, false)
    expect(atLimit.tone).toBe('terracotta')
    expect(atLimit.label).toBe('Limit reached')
    expect(atLimit.progressPercent).toBe(100)
    expect(atLimit.statusSemantic).toBe('limit_reached')

    // 5. Above 100% (100.01%, 125%) -> over budget (terracotta)
    const justAbove100 = getBudgetStatus(100.01, true)
    expect(justAbove100.tone).toBe('terracotta')
    expect(justAbove100.label).toBe('Over budget')
    expect(justAbove100.progressPercent).toBe(100)
    expect(justAbove100.statusSemantic).toBe('over_budget')

    const exceeded = getBudgetStatus(125, true)
    expect(exceeded.tone).toBe('terracotta')
    expect(exceeded.label).toBe('Over budget')
    expect(exceeded.progressPercent).toBe(100) // progress bar clamped to 100%
    expect(exceeded.statusSemantic).toBe('over_budget')

    // Exceeded flag only
    const flagOnly = getBudgetStatus(99, true)
    expect(flagOnly.tone).toBe('terracotta')
    expect(flagOnly.label).toBe('Over budget')
    expect(flagOnly.statusSemantic).toBe('over_budget')
  })

  it('respects authoritative backend status to prevent rounded percentage_used artifacts', () => {
    // When rounded percentage_used is 100.00 but backend classified it as approaching_limit (< 100% actual)
    const nearLimit = getBudgetStatus(100.0, false, 'approaching_limit')
    expect(nearLimit.tone).toBe('butter')
    expect(nearLimit.label).toBe('Approaching limit')
    expect(nearLimit.statusSemantic).toBe('approaching_limit')
    expect(nearLimit.label).not.toBe('Limit reached')

    // Backend confirms limit_reached
    const limitReached = getBudgetStatus(100.0, false, 'limit_reached')
    expect(limitReached.tone).toBe('terracotta')
    expect(limitReached.label).toBe('Limit reached')
    expect(limitReached.statusSemantic).toBe('limit_reached')

    // Backend confirms over_budget
    const over = getBudgetStatus(105.0, true, 'over_budget')
    expect(over.tone).toBe('terracotta')
    expect(over.label).toBe('Over budget')
    expect(over.statusSemantic).toBe('over_budget')
  })

  it('classifies budget status semantics consistently using unrounded values', () => {
    // 1. Below 80% (including 79.99%)
    expect(classifyBudgetStatus(0, 1000)).toBe('on_track')
    expect(classifyBudgetStatus(500, 1000)).toBe('on_track')
    expect(classifyBudgetStatus(799.9, 1000)).toBe('on_track')
    expect(classifyBudgetStatus(79.99, 100)).toBe('on_track')

    // 2. Exactly 80.00%
    expect(classifyBudgetStatus(800, 1000)).toBe('approaching_limit')
    expect(classifyBudgetStatus(80.0, 100)).toBe('approaching_limit')

    // 3. Immediately below 100% (including 99.99%)
    expect(classifyBudgetStatus(999.9, 1000)).toBe('approaching_limit')
    expect(classifyBudgetStatus(99.99, 100)).toBe('approaching_limit')

    // 4. Exactly 100.00% -> limit reached
    expect(classifyBudgetStatus(1000, 1000)).toBe('limit_reached')
    expect(classifyBudgetStatus(100.0, 100)).toBe('limit_reached')

    // 5. Above 100% (including 100.01%) -> over budget
    expect(classifyBudgetStatus(1000.1, 1000)).toBe('over_budget')
    expect(classifyBudgetStatus(100.01, 100)).toBe('over_budget')
    expect(classifyBudgetStatus(1500, 1000)).toBe('over_budget')

    // Edge case: zero/negative limit
    expect(classifyBudgetStatus(50, 0)).toBe('on_track')
  })
})

