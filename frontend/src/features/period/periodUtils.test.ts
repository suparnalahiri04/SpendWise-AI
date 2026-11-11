import { describe, expect, it } from 'vitest'
import {
  filterTransactionsByPeriod,
  getPeriodDateRange,
  isDateInPeriod,
  toISODateString,
} from './periodUtils'

describe('toISODateString', () => {
  it('formats dates as YYYY-MM-DD padded with zeroes', () => {
    expect(toISODateString(new Date(2026, 2, 5))).toBe('2026-03-05')
    expect(toISODateString(new Date(2026, 11, 25))).toBe('2026-12-25')
  })
})

describe('getPeriodDateRange', () => {
  it('calculates this-month from 1st of month through today', () => {
    const ref = new Date(2026, 2, 15) // March 15, 2026
    const range = getPeriodDateRange('this-month', ref)
    expect(range).toEqual({
      startDate: '2026-03-01',
      endDate: '2026-03-15',
    })
  })

  it('calculates last-month for the full preceding month', () => {
    const ref = new Date(2026, 2, 15) // March 15, 2026
    const range = getPeriodDateRange('last-month', ref)
    expect(range).toEqual({
      startDate: '2026-02-01',
      endDate: '2026-02-28', // 2026 is not a leap year
    })
  })

  it('calculates last-month correctly across leap years (e.g. Feb 2024)', () => {
    const ref = new Date(2024, 2, 10) // March 10, 2024 (leap year)
    const range = getPeriodDateRange('last-month', ref)
    expect(range).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29', // Leap year 29 days
    })
  })

  it('calculates last-month correctly across year boundary (e.g. Jan 15 -> Dec previous year)', () => {
    const ref = new Date(2026, 0, 15) // January 15, 2026
    const range = getPeriodDateRange('last-month', ref)
    expect(range).toEqual({
      startDate: '2025-12-01',
      endDate: '2025-12-31',
    })
  })

  it('calculates last-3-months from 2 months prior through today', () => {
    const ref = new Date(2026, 2, 20) // March 20, 2026
    const range = getPeriodDateRange('last-3-months', ref)
    expect(range).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-03-20',
    })
  })

  it('calculates last-3-months across year boundary (e.g. Feb 2026 -> Dec 2025)', () => {
    const ref = new Date(2026, 1, 10) // Feb 10, 2026
    const range = getPeriodDateRange('last-3-months', ref)
    expect(range).toEqual({
      startDate: '2025-12-01',
      endDate: '2026-02-10',
    })
  })

  it('calculates year-to-date from Jan 1 through today', () => {
    const ref = new Date(2026, 5, 25) // June 25, 2026
    const range = getPeriodDateRange('year-to-date', ref)
    expect(range).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-06-25',
    })
  })

  it('calculates all for an unbounded all-time date range', () => {
    const ref = new Date(2026, 2, 20)
    const range = getPeriodDateRange('all', ref)
    expect(range).toEqual({
      startDate: '1970-01-01',
      endDate: '9999-12-31',
    })
  })
})

describe('isDateInPeriod and filterTransactionsByPeriod', () => {
  const ref = new Date(2026, 2, 20) // March 20, 2026

  const transactions = [
    { id: 1, transaction_date: '2026-03-25', description: 'Future in month' }, // after March 20
    { id: 2, transaction_date: '2026-03-15', description: 'In current month' },
    { id: 3, transaction_date: '2026-03-01', description: 'First day of month' },
    { id: 4, transaction_date: '2026-02-14', description: 'Last month' },
    { id: 5, transaction_date: '2026-01-10', description: 'Two months ago' },
    { id: 6, transaction_date: '2025-12-15', description: 'Last year' },
  ]

  it('filters this-month correctly', () => {
    const filtered = filterTransactionsByPeriod(transactions, 'this-month', ref)
    expect(filtered.map((t) => t.id)).toEqual([2, 3])
  })

  it('filters last-month correctly', () => {
    const filtered = filterTransactionsByPeriod(transactions, 'last-month', ref)
    expect(filtered.map((t) => t.id)).toEqual([4])
  })

  it('filters last-3-months correctly', () => {
    const filtered = filterTransactionsByPeriod(transactions, 'last-3-months', ref)
    expect(filtered.map((t) => t.id)).toEqual([2, 3, 4, 5])
  })

  it('filters year-to-date correctly', () => {
    const filtered = filterTransactionsByPeriod(transactions, 'year-to-date', ref)
    expect(filtered.map((t) => t.id)).toEqual([2, 3, 4, 5])
  })

  it('filters all correctly, returning all transactions without date boundaries', () => {
    const filtered = filterTransactionsByPeriod(transactions, 'all', ref)
    expect(filtered.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('handles all with empty transaction list', () => {
    const filtered = filterTransactionsByPeriod([], 'all', ref)
    expect(filtered).toEqual([])
  })

  it('validates dates in all period correctly', () => {
    expect(isDateInPeriod('2026-03-15', 'all', ref)).toBe(true)
    expect(isDateInPeriod('1999-01-01', 'all', ref)).toBe(true)
    expect(isDateInPeriod('2099-12-31', 'all', ref)).toBe(true)
    expect(isDateInPeriod('', 'all', ref)).toBe(false)
    expect(isDateInPeriod('invalid-date', 'all', ref)).toBe(false)
  })

  it('handles invalid or empty transaction date safely', () => {
    expect(isDateInPeriod('', 'this-month', ref)).toBe(false)
    expect(isDateInPeriod('invalid-date', 'this-month', ref)).toBe(false)

    const withInvalid = [
      { id: 99, transaction_date: '', description: 'Empty' },
      { id: 2, transaction_date: '2026-03-15', description: 'Valid' },
    ]
    expect(filterTransactionsByPeriod(withInvalid, 'this-month', ref).map((t) => t.id)).toEqual([2])
  })
})

