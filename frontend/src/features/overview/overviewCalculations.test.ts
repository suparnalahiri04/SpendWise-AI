import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/lib/api/types'
import {
  calculateNetSavings,
  calculateOverviewSummary,
  calculateSpendingTrend,
  calculateTopCategories,
  calculateTotalExpenses,
  calculateTotalIncome,
  formatTrendLabel,
  parseAmount,
} from './overviewCalculations'

function makeTx(partial: Partial<Transaction>): Transaction {
  return {
    id: 1,
    transaction_date: '2026-03-15',
    description: 'Test',
    amount: '100.00',
    transaction_type: 'expense',
    category: 'Other',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
    ...partial,
  }
}

describe('parseAmount', () => {
  it('parses valid numeric strings and numbers', () => {
    expect(parseAmount('450.50')).toBe(450.5)
    expect(parseAmount('1,250.00')).toBe(1250)
    expect(parseAmount(99.95)).toBe(99.95)
  })

  it('handles null, undefined, negative numbers, or invalid inputs safely', () => {
    expect(parseAmount(null)).toBe(0)
    expect(parseAmount(undefined)).toBe(0)
    expect(parseAmount('-50')).toBe(0)
    expect(parseAmount('invalid')).toBe(0)
  })
})

describe('formatTrendLabel', () => {
  it('formats YYYY-MM-DD into DD MMM', () => {
    expect(formatTrendLabel('2026-03-14')).toBe('14 Mar')
    expect(formatTrendLabel('2026-01-01')).toBe('01 Jan')
  })
})

describe('Financial calculations', () => {
  const transactions: Transaction[] = [
    makeTx({ id: 1, transaction_date: '2026-03-10', amount: '1200.50', transaction_type: 'expense', category: 'Groceries' }),
    makeTx({ id: 2, transaction_date: '2026-03-12', amount: '450.25', transaction_type: 'expense', category: 'Food/Dining' }),
    makeTx({ id: 3, transaction_date: '2026-03-01', amount: '50000.00', transaction_type: 'income', category: 'Income' }),
    makeTx({ id: 4, transaction_date: '2026-03-12', amount: '350.00', transaction_type: 'expense', category: 'Food/Dining' }),
    makeTx({ id: 5, transaction_date: '2026-03-15', amount: '2500.00', transaction_type: 'income', category: 'Other' }),
  ]

  it('calculates total expenses correctly with decimal precision', () => {
    // 1200.50 + 450.25 + 350.00 = 2000.75
    expect(calculateTotalExpenses(transactions)).toBe(2000.75)
  })

  it('calculates total income correctly', () => {
    // 50000.00 + 2500.00 = 52500.00
    expect(calculateTotalIncome(transactions)).toBe(52500)
  })

  it('calculates net savings as income minus expenses', () => {
    // 52500 - 2000.75 = 50499.25
    expect(calculateNetSavings(52500, 2000.75)).toBe(50499.25)
  })

  it('calculates negative net savings when expenses exceed income', () => {
    expect(calculateNetSavings(1000, 3500.5)).toBe(-2500.5)
  })

  it('handles empty transaction list cleanly', () => {
    expect(calculateTotalExpenses([])).toBe(0)
    expect(calculateTotalIncome([])).toBe(0)
    expect(calculateNetSavings(0, 0)).toBe(0)
  })
})

describe('calculateSpendingTrend', () => {
  it('groups multiple expenses on the same date and sorts chronologically', () => {
    const transactions: Transaction[] = [
      makeTx({ id: 1, transaction_date: '2026-03-15', amount: '100.00', transaction_type: 'expense' }),
      makeTx({ id: 2, transaction_date: '2026-03-02', amount: '50.00', transaction_type: 'expense' }),
      makeTx({ id: 3, transaction_date: '2026-03-15', amount: '75.50', transaction_type: 'expense' }),
      makeTx({ id: 4, transaction_date: '2026-03-05', amount: '20.00', transaction_type: 'income' }), // income ignored
    ]

    const trend = calculateSpendingTrend(transactions)
    expect(trend).toEqual([
      { label: '02 Mar', value: 50 },
      { label: '15 Mar', value: 175.5 },
    ])
  })

  it('returns empty array when there are no expenses', () => {
    const transactions: Transaction[] = [
      makeTx({ id: 1, transaction_date: '2026-03-01', amount: '5000.00', transaction_type: 'income' }),
    ]
    expect(calculateSpendingTrend(transactions)).toEqual([])
  })
})

describe('calculateTopCategories', () => {
  it('calculates category breakdown sorted descending with percentages', () => {
    const transactions: Transaction[] = [
      makeTx({ id: 1, amount: '600.00', transaction_type: 'expense', category: 'Food/Dining' }),
      makeTx({ id: 2, amount: '300.00', transaction_type: 'expense', category: 'Groceries' }),
      makeTx({ id: 3, amount: '100.00', transaction_type: 'expense', category: 'Transport' }),
      makeTx({ id: 4, amount: '10000.00', transaction_type: 'income', category: 'Income' }), // ignored
    ]

    // Total expenses = 1000.00
    // Food/Dining = 600 (60%)
    // Groceries = 300 (30%)
    // Transport = 100 (10%)
    const top = calculateTopCategories(transactions)
    expect(top).toEqual([
      { category: 'Food/Dining', amount: 600, percentage: 60 },
      { category: 'Groceries', amount: 300, percentage: 30 },
      { category: 'Transport', amount: 100, percentage: 10 },
    ])
  })

  it('respects limit parameter', () => {
    const transactions: Transaction[] = [
      makeTx({ id: 1, amount: '50', transaction_type: 'expense', category: 'A' }),
      makeTx({ id: 2, amount: '40', transaction_type: 'expense', category: 'B' }),
      makeTx({ id: 3, amount: '30', transaction_type: 'expense', category: 'C' }),
    ]
    expect(calculateTopCategories(transactions, 2)).toHaveLength(2)
  })

  it('returns empty array when there are no expenses', () => {
    expect(calculateTopCategories([])).toEqual([])
  })
})

describe('calculateOverviewSummary', () => {
  it('computes composite summary correctly', () => {
    const transactions: Transaction[] = [
      makeTx({ id: 1, amount: '500.00', transaction_type: 'expense', category: 'Shopping' }),
      makeTx({ id: 2, amount: '2000.00', transaction_type: 'income', category: 'Salary' }),
    ]

    const summary = calculateOverviewSummary(transactions)
    expect(summary.totalExpenses).toBe(500)
    expect(summary.totalIncome).toBe(2000)
    expect(summary.netSavings).toBe(1500)
    expect(summary.hasTransactions).toBe(true)
    expect(summary.hasExpenses).toBe(true)
    expect(summary.hasIncome).toBe(true)
    expect(summary.topCategories).toHaveLength(1)
    expect(summary.spendingTrend).toHaveLength(1)
  })
})

