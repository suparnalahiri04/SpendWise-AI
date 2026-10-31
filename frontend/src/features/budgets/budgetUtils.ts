/** Month and budget calculation helpers. */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** Returns the current year and month as `YYYY-MM` (UTC/local safe). */
export function getCurrentMonthString(refDate: Date = new Date()): string {
  const year = refDate.getFullYear()
  const month = String(refDate.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/** Formats a `YYYY-MM` string into human-friendly format (e.g. "October 2026"). */
export function formatMonthLabel(monthStr: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthStr)
  if (!match) return monthStr
  const [, yearStr, monthNumStr] = match
  const monthIndex = Number(monthNumStr) - 1
  const monthName = MONTH_NAMES[monthIndex] ?? monthNumStr
  return `${monthName} ${yearStr}`
}

/** Returns the previous month as `YYYY-MM`. */
export function getPreviousMonthString(monthStr: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthStr)
  if (!match) return monthStr
  let year = Number(match[1])
  let month = Number(match[2]) - 1
  if (month < 1) {
    month = 12
    year -= 1
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Returns the next month as `YYYY-MM`. */
export function getNextMonthString(monthStr: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthStr)
  if (!match) return monthStr
  let year = Number(match[1])
  let month = Number(match[2]) + 1
  if (month > 12) {
    month = 1
    year += 1
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

export interface BudgetFormValues {
  category: string
  limit_amount: string | number
  month: string
}

/** Validates inputs before creating or editing a budget. */
export function validateBudgetForm(values: BudgetFormValues): string | null {
  const category = values.category.trim()
  if (!category) {
    return 'Please select or enter a category.'
  }

  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/
  if (!monthRegex.test(values.month.trim())) {
    return 'Please specify a valid month in YYYY-MM format.'
  }

  const amountNum = typeof values.limit_amount === 'number'
    ? values.limit_amount
    : Number(values.limit_amount)

  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return 'Monthly budget limit must be greater than zero.'
  }

  return null
}

export interface BudgetStatusInfo {
  tone: 'sage' | 'butter' | 'terracotta'
  label: string
  /** Clamped percentage between 0 and 100 for drawing the progress bar track width. */
  progressPercent: number
}

/** Determines visual alert tone, badge text, and clamped bar width. */
export function getBudgetStatus(percentageUsed: number, isExceeded: boolean): BudgetStatusInfo {
  if (isExceeded || percentageUsed > 100) {
    return {
      tone: 'terracotta',
      label: 'Over budget',
      progressPercent: 100,
    }
  }

  if (percentageUsed >= 80) {
    return {
      tone: 'butter',
      label: 'Approaching limit',
      progressPercent: Math.min(100, Math.max(0, percentageUsed)),
    }
  }

  return {
    tone: 'sage',
    label: percentageUsed === 0 ? '0% used' : 'On track',
    progressPercent: Math.min(100, Math.max(0, percentageUsed)),
  }
}

