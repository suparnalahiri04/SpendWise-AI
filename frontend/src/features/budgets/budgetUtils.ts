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

export type BudgetStatusSemantic =
  | 'on_track'
  | 'approaching_limit'
  | 'limit_reached'
  | 'over_budget'

/** Classifies budget utilization according to standardized domain rules:
 * - Below 80%: 'on_track'
 * - 80% to below 100%: 'approaching_limit'
 * - Exactly 100%: 'limit_reached'
 * - Above 100%: 'over_budget'
 *
 * Uses unrounded numerical comparisons: comparing spent directly against limit and limit * 0.8.
 */
export function classifyBudgetStatus(
  spent: number,
  limit: number,
): BudgetStatusSemantic {
  if (limit <= 0) return 'on_track'
  if (spent > limit) return 'over_budget'
  if (spent === limit) return 'limit_reached'
  if (spent >= limit * 0.8) return 'approaching_limit'
  return 'on_track'
}

export interface BudgetStatusInfo {
  tone: 'sage' | 'butter' | 'terracotta'
  label: string
  /** Clamped percentage between 0 and 100 for drawing the progress bar track width. */
  progressPercent: number
  statusSemantic: BudgetStatusSemantic
}

/** Determines visual alert tone, badge text, and clamped bar width.
 * Standardized domain rules:
 * - Below 80%: normal/healthy status ("On track" or "0% used")
 * - 80% to below 100%: "Approaching limit" (warning / butter tone)
 * - Exactly 100%: "Limit reached" (terracotta tone, distinct from "Over budget")
 * - Above 100%: "Over budget" (terracotta tone)
 *
 * Uses authoritative backend status when provided, falling back to unrounded
 * comparisons when only percentageUsed and isExceeded are available.
 */
export function getBudgetStatus(
  percentageUsed: number,
  isExceeded: boolean,
  authoritativeStatus?: BudgetStatusSemantic | string | null,
): BudgetStatusInfo {
  // 1. Authoritative backend status takes precedence when provided
  if (authoritativeStatus) {
    if (authoritativeStatus === 'over_budget') {
      return {
        tone: 'terracotta',
        label: 'Over budget',
        progressPercent: 100,
        statusSemantic: 'over_budget',
      }
    }
    if (authoritativeStatus === 'limit_reached') {
      return {
        tone: 'terracotta',
        label: 'Limit reached',
        progressPercent: 100,
        statusSemantic: 'limit_reached',
      }
    }
    if (authoritativeStatus === 'approaching_limit') {
      return {
        tone: 'butter',
        label: 'Approaching limit',
        progressPercent: Math.min(100, Math.max(0, percentageUsed)),
        statusSemantic: 'approaching_limit',
      }
    }
    if (authoritativeStatus === 'on_track') {
      return {
        tone: 'sage',
        label: percentageUsed === 0 ? '0% used' : 'On track',
        progressPercent: Math.min(100, Math.max(0, percentageUsed)),
        statusSemantic: 'on_track',
      }
    }
  }

  // 2. Fallback using unrounded numerical comparisons
  if (isExceeded || percentageUsed > 100) {
    return {
      tone: 'terracotta',
      label: 'Over budget',
      progressPercent: 100,
      statusSemantic: 'over_budget',
    }
  }

  if (percentageUsed === 100) {
    return {
      tone: 'terracotta',
      label: 'Limit reached',
      progressPercent: 100,
      statusSemantic: 'limit_reached',
    }
  }

  if (percentageUsed >= 80) {
    return {
      tone: 'butter',
      label: 'Approaching limit',
      progressPercent: Math.min(100, Math.max(0, percentageUsed)),
      statusSemantic: 'approaching_limit',
    }
  }

  return {
    tone: 'sage',
    label: percentageUsed === 0 ? '0% used' : 'On track',
    progressPercent: Math.min(100, Math.max(0, percentageUsed)),
    statusSemantic: 'on_track',
  }
}

