import type { TrendPoint } from '@/components/charts/TrendChart'
import type { Transaction } from '@/lib/api/types'

export interface CategoryBreakdownItem {
  category: string
  amount: number
  percentage: number // 0 to 100
}

export interface OverviewSummary {
  totalExpenses: number
  totalIncome: number
  netSavings: number
  spendingTrend: TrendPoint[]
  topCategories: CategoryBreakdownItem[]
  hasTransactions: boolean
  hasExpenses: boolean
  hasIncome: boolean
}

/** Parses a decimal or string amount into a non-negative number. */
export function parseAmount(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined) return 0
  const parsed = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/,/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** Rounds a number to two decimal places. */
function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100
}

/** Formats an ISO date string (YYYY-MM-DD) into a short chart label like "14 Mar". */
export function formatTrendLabel(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

/** Calculates total expenses from a list of transactions. */
export function calculateTotalExpenses(transactions: readonly Transaction[]): number {
  let total = 0
  for (const t of transactions) {
    if (t.transaction_type === 'expense') {
      total += parseAmount(t.amount)
    }
  }
  return round2(total)
}

/** Calculates total income from a list of transactions. */
export function calculateTotalIncome(transactions: readonly Transaction[]): number {
  let total = 0
  for (const t of transactions) {
    if (t.transaction_type === 'income') {
      total += parseAmount(t.amount)
    }
  }
  return round2(total)
}

/** Calculates net savings = income - expenses. */
export function calculateNetSavings(totalIncome: number, totalExpenses: number): number {
  return round2(totalIncome - totalExpenses)
}

/**
 * Calculates daily spending trend points for Recharts TrendChart.
 *
 * Expenses are aggregated by `transaction_date` (YYYY-MM-DD) and sorted chronologically.
 */
export function calculateSpendingTrend(transactions: readonly Transaction[]): TrendPoint[] {
  const dailyTotals = new Map<string, number>()

  for (const t of transactions) {
    if (t.transaction_type === 'expense' && t.transaction_date) {
      const current = dailyTotals.get(t.transaction_date) || 0
      dailyTotals.set(t.transaction_date, current + parseAmount(t.amount))
    }
  }

  if (dailyTotals.size === 0) {
    return []
  }

  // Sort dates chronologically ascending
  const sortedDates = Array.from(dailyTotals.keys()).sort()

  return sortedDates.map((dateStr) => ({
    label: formatTrendLabel(dateStr),
    value: round2(dailyTotals.get(dateStr) || 0),
  }))
}

/**
 * Calculates top expense categories sorted descending by amount,
 * including each category's percentage of total expenses.
 */
export function calculateTopCategories(
  transactions: readonly Transaction[],
  limit = 5,
): CategoryBreakdownItem[] {
  const categoryTotals = new Map<string, number>()
  let totalExpenses = 0

  for (const t of transactions) {
    if (t.transaction_type === 'expense') {
      const amt = parseAmount(t.amount)
      if (amt > 0) {
        const cat = (t.category && t.category.trim()) || 'Other'
        categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + amt)
        totalExpenses += amt
      }
    }
  }

  if (totalExpenses === 0 || categoryTotals.size === 0) {
    return []
  }

  const sorted = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({
      category,
      amount: round2(amount),
      percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  return sorted.slice(0, limit)
}

/**
 * Convenience helper computing all overview metrics from a given transaction set.
 */
export function calculateOverviewSummary(
  transactions: readonly Transaction[],
  categoryLimit = 5,
): OverviewSummary {
  const totalExpenses = calculateTotalExpenses(transactions)
  const totalIncome = calculateTotalIncome(transactions)
  const netSavings = calculateNetSavings(totalIncome, totalExpenses)
  const spendingTrend = calculateSpendingTrend(transactions)
  const topCategories = calculateTopCategories(transactions, categoryLimit)

  return {
    totalExpenses,
    totalIncome,
    netSavings,
    spendingTrend,
    topCategories,
    hasTransactions: transactions.length > 0,
    hasExpenses: totalExpenses > 0,
    hasIncome: totalIncome > 0,
  }
}

