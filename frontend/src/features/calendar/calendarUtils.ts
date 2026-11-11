import type { RecurringPayment, SavingsGoal, Transaction } from '@/lib/api/types'

export type WeekStart = 'sunday' | 'monday'

export interface CalendarGridDay {
  dateKey: string // YYYY-MM-DD
  dayOfMonth: number // 1..31
  monthString: string // YYYY-MM
  isCurrentMonth: boolean
  isToday: boolean
  isWeekend: boolean
  dayOfWeek: number // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
}

export interface DayEvents {
  dateKey: string // YYYY-MM-DD
  transactions: Transaction[]
  recurringBills: RecurringPayment[]
  goalMilestones: SavingsGoal[]
  totalIncome: number
  totalExpenses: number
  netFlow: number
  hasEvents: boolean
}

export interface CalendarMonthSummary {
  monthString: string // YYYY-MM
  totalIncome: number
  totalExpenses: number
  netSavings: number
  transactionCount: number
  activeBillsDueCount: number
  activeBillsDueTotal: number
  overdueBillsCount: number
  overdueBillsTotal: number
}

export interface AggregateEventsOptions {
  transactions?: readonly Transaction[]
  recurringPayments?: readonly RecurringPayment[]
  goals?: readonly SavingsGoal[]
}

export interface CalculateMonthSummaryOptions {
  monthString: string // YYYY-MM
  transactions?: readonly Transaction[]
  recurringPayments?: readonly RecurringPayment[]
  refDate?: string // YYYY-MM-DD for overdue reference
}

/** Parses numeric amount safely to 2 decimal places. */
export function parseAmount(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined) return 0
  const parsed = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/,/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** Rounds a numeric value to 2 decimal places without precision drift. */
export function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100
}

/**
 * Extracts a calendar date key (YYYY-MM-DD) from a string, ISO timestamp, or Date object.
 *
 * CRITICAL TIMEZONE RULE:
 * Backend dates are stored as UTC or ISO strings (e.g. "2026-10-15T00:00:00Z" or "2026-10-15").
 * Parsing with `new Date(str).getDate()` causes negative local offsets (e.g. UTC-5) to shift
 * midnight UTC backwards by one day to "2026-10-14".
 *
 * This function extracts the ISO date portion directly via regex/substring to guarantee
 * consistent calendar dates regardless of client browser timezone.
 */
export function extractDateKey(rawDate: string | Date | null | undefined): string | null {
  if (!rawDate) return null

  if (rawDate instanceof Date) {
    if (isNaN(rawDate.getTime())) return null
    const year = rawDate.getFullYear()
    const month = String(rawDate.getMonth() + 1).padStart(2, '0')
    const day = String(rawDate.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const str = String(rawDate).trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str)
  if (match) {
    const [, year, month, day] = match
    return `${year}-${month}-${day}`
  }

  return null
}

/** Returns the number of days in a given year and month (1-indexed month, 1..12). */
export function getDaysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of the target month
  return new Date(year, month, 0).getDate()
}

/** Checks whether a year is a leap year. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Generates an accessible, complete monthly calendar grid of 35 or 42 days.
 * Includes leading padding days from the previous month and trailing padding days from the next month.
 */
export function generateCalendarGrid(
  monthStr: string,
  weekStart: WeekStart = 'sunday',
  refDate?: Date,
): CalendarGridDay[] {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthStr)
  if (!match) {
    throw new Error(`Invalid month string: "${monthStr}". Expected format YYYY-MM.`)
  }

  const year = Number(match[1])
  const monthNum = Number(match[2]) // 1-12
  const monthIndex = monthNum - 1 // 0-11

  const todayKey = extractDateKey(refDate ?? new Date())

  const daysInCurrentMonth = getDaysInMonth(year, monthNum)

  // Determine weekday of day 1 (0 = Sun, 1 = Mon, ..., 6 = Sat)
  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay()

  // Calculate leading days needed
  let leadingCount: number
  if (weekStart === 'monday') {
    // 0 (Sun) becomes 6, 1 (Mon) becomes 0, etc.
    leadingCount = (firstDayOfWeek + 6) % 7
  } else {
    leadingCount = firstDayOfWeek
  }

  const grid: CalendarGridDay[] = []

  // 1. Previous month padding days
  if (leadingCount > 0) {
    const prevYear = monthNum === 1 ? year - 1 : year
    const prevMonthNum = monthNum === 1 ? 12 : monthNum - 1
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonthNum)
    const prevMonthStr = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`

    for (let i = leadingCount - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i
      const dateKey = `${prevMonthStr}-${String(day).padStart(2, '0')}`
      const dayOfWeek = new Date(prevYear, prevMonthNum - 1, day).getDay()
      grid.push({
        dateKey,
        dayOfMonth: day,
        monthString: prevMonthStr,
        isCurrentMonth: false,
        isToday: dateKey === todayKey,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        dayOfWeek,
      })
    }
  }

  // 2. Current month days
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const dateKey = `${monthStr}-${String(day).padStart(2, '0')}`
    const dayOfWeek = new Date(year, monthIndex, day).getDay()
    grid.push({
      dateKey,
      dayOfMonth: day,
      monthString: monthStr,
      isCurrentMonth: true,
      isToday: dateKey === todayKey,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      dayOfWeek,
    })
  }

  // 3. Next month padding days to complete 7-day rows (min 35 cells, up to 42 cells)
  const totalCells = grid.length <= 35 ? 35 : 42
  const trailingCount = totalCells - grid.length
  if (trailingCount > 0) {
    const nextYear = monthNum === 12 ? year + 1 : year
    const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1
    const nextMonthStr = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}`

    for (let day = 1; day <= trailingCount; day++) {
      const dateKey = `${nextMonthStr}-${String(day).padStart(2, '0')}`
      const dayOfWeek = new Date(nextYear, nextMonthNum - 1, day).getDay()
      grid.push({
        dateKey,
        dayOfMonth: day,
        monthString: nextMonthStr,
        isCurrentMonth: false,
        isToday: dateKey === todayKey,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        dayOfWeek,
      })
    }
  }

  return grid
}

/**
 * Aggregates all transactions, recurring payments, and goals into a date-keyed dictionary.
 * Does not invent future occurrences or duplicate transactions.
 */
export function aggregateEventsByDate(options: AggregateEventsOptions): Record<string, DayEvents> {
  const result: Record<string, DayEvents> = {}

  function getOrCreateDay(dateKey: string): DayEvents {
    if (!result[dateKey]) {
      result[dateKey] = {
        dateKey,
        transactions: [],
        recurringBills: [],
        goalMilestones: [],
        totalIncome: 0,
        totalExpenses: 0,
        netFlow: 0,
        hasEvents: false,
      }
    }
    return result[dateKey]
  }

  // 1. Process actual ledger transactions
  if (options.transactions) {
    for (const tx of options.transactions) {
      const key = extractDateKey(tx.transaction_date)
      if (!key) continue

      const day = getOrCreateDay(key)
      day.transactions.push(tx)
      day.hasEvents = true

      const amt = parseAmount(tx.amount)
      if (tx.transaction_type === 'income') {
        day.totalIncome = round2(day.totalIncome + amt)
      } else if (tx.transaction_type === 'expense') {
        day.totalExpenses = round2(day.totalExpenses + amt)
      }
      day.netFlow = round2(day.totalIncome - day.totalExpenses)
    }
  }

  // 2. Process recurring payments
  // Rule: Treat as scheduled commitments, using next_due_date only for the next occurrence.
  // Cancelled payments are NOT active bills.
  if (options.recurringPayments) {
    for (const rp of options.recurringPayments) {
      // Do not show cancelled recurring payments as active commitments
      if (rp.status === 'cancelled' || !rp.is_active) continue

      const key = extractDateKey(rp.next_due_date)
      if (!key) continue

      const day = getOrCreateDay(key)
      day.recurringBills.push(rp)
      day.hasEvents = true
    }
  }

  // 3. Process savings goal milestones
  // Rule: Show Savings Goal target dates as milestones, not contributions or transactions.
  if (options.goals) {
    for (const g of options.goals) {
      if (!g.target_date) continue

      const key = extractDateKey(g.target_date)
      if (!key) continue

      const day = getOrCreateDay(key)
      day.goalMilestones.push(g)
      day.hasEvents = true
    }
  }

  return result
}

/**
 * Calculates monthly financial summary metrics limited strictly to transactions
 * in the displayed calendar month.
 */
export function calculateMonthSummary(options: CalculateMonthSummaryOptions): CalendarMonthSummary {
  const { monthString, transactions = [], recurringPayments = [], refDate } = options
  const todayKey = refDate ? extractDateKey(refDate) : extractDateKey(new Date())

  let totalIncome = 0
  let totalExpenses = 0
  let transactionCount = 0

  for (const tx of transactions) {
    const key = extractDateKey(tx.transaction_date)
    if (!key || !key.startsWith(monthString)) continue

    const amt = parseAmount(tx.amount)
    if (tx.transaction_type === 'income') {
      totalIncome = round2(totalIncome + amt)
      transactionCount++
    } else if (tx.transaction_type === 'expense') {
      totalExpenses = round2(totalExpenses + amt)
      transactionCount++
    }
  }

  let activeBillsDueCount = 0
  let activeBillsDueTotal = 0
  let overdueBillsCount = 0
  let overdueBillsTotal = 0

  for (const rp of recurringPayments) {
    if (rp.status === 'cancelled' || !rp.is_active) continue

    const key = extractDateKey(rp.next_due_date)
    if (!key) continue

    const amt = parseAmount(rp.amount)

    // Overdue check: active bill where due date < today
    if (rp.is_overdue || (todayKey && key < todayKey)) {
      overdueBillsCount++
      overdueBillsTotal = round2(overdueBillsTotal + amt)
    }

    // Bills due specifically in this calendar month
    if (key.startsWith(monthString)) {
      activeBillsDueCount++
      activeBillsDueTotal = round2(activeBillsDueTotal + amt)
    }
  }

  return {
    monthString,
    totalIncome,
    totalExpenses,
    netSavings: round2(totalIncome - totalExpenses),
    transactionCount,
    activeBillsDueCount,
    activeBillsDueTotal,
    overdueBillsCount,
    overdueBillsTotal,
  }
}

