import type { PeriodId } from './period'

/** Converts a local Date object into a YYYY-MM-DD string without timezone skew. */
export function toISODateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export interface PeriodDateRange {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}

/**
 * Calculates the [startDate, endDate] (inclusive) for a given reporting period ID.
 *
 * An optional `refDate` (defaults to `new Date()`) can be injected for deterministic testing.
 *
 * Rules:
 * - `this-month`: 1st day of the current month through today.
 * - `last-month`: the entire previous calendar month (1st through last day).
 * - `last-3-months`: current month and the preceding two calendar months, through today.
 * - `year-to-date`: January 1 of the current year through today.
 */
export function getPeriodDateRange(
  period: PeriodId,
  refDate: Date = new Date(),
): PeriodDateRange {
  const year = refDate.getFullYear()
  const month = refDate.getMonth() // 0-indexed: 0 = Jan, 11 = Dec
  const todayStr = toISODateString(refDate)

  switch (period) {
    case 'this-month': {
      const start = new Date(year, month, 1)
      return {
        startDate: toISODateString(start),
        endDate: todayStr,
      }
    }

    case 'last-month': {
      // 1st of previous month
      const start = new Date(year, month - 1, 1)
      // Day 0 of current month = last day of previous month
      const end = new Date(year, month, 0)
      return {
        startDate: toISODateString(start),
        endDate: toISODateString(end),
      }
    }

    case 'last-3-months': {
      // 1st day of 2 months prior (so total 3 calendar months including current)
      const start = new Date(year, month - 2, 1)
      return {
        startDate: toISODateString(start),
        endDate: todayStr,
      }
    }

    case 'year-to-date': {
      const start = new Date(year, 0, 1)
      return {
        startDate: toISODateString(start),
        endDate: todayStr,
      }
    }

    case 'all': {
      return {
        startDate: '1970-01-01',
        endDate: '9999-12-31',
      }
    }
  }
}

/**
 * Returns true if a YYYY-MM-DD date string falls inside the given period range.
 */
export function isDateInPeriod(
  dateStr: string,
  period: PeriodId,
  refDate: Date = new Date(),
): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  if (period === 'all') return true
  const { startDate, endDate } = getPeriodDateRange(period, refDate)
  return dateStr >= startDate && dateStr <= endDate
}

/**
 * Filters a list of transactions to only those whose `transaction_date`
 * falls inside the given period range (inclusive).
 */
export function filterTransactionsByPeriod<T extends { transaction_date: string }>(
  transactions: readonly T[],
  period: PeriodId,
  refDate: Date = new Date(),
): T[] {
  if (period === 'all') {
    return [...transactions]
  }
  const { startDate, endDate } = getPeriodDateRange(period, refDate)
  return transactions.filter((tx) => {
    const d = tx.transaction_date
    return d && d >= startDate && d <= endDate
  })
}

