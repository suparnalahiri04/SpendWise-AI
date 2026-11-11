export interface DateGroupableTransaction {
  id: number
  transaction_date?: string | null
}

export interface TransactionDateGroup<T extends DateGroupableTransaction> {
  dateKey: string
  label: string
  isFallback: boolean
  transactions: T[]
}

export const FALLBACK_DATE_KEY = '__unknown__'
export const FALLBACK_DATE_LABEL = 'Other dates'

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

interface ParsedCalendarDate {
  dateKey: string
  localDate: Date
  year: number
  month: number
  day: number
}

/**
 * Formats a local Date as YYYY-MM-DD using local calendar components.
 */
function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parses an ISO date (YYYY-MM-DD) or ISO datetime string into validated local
 * calendar components without invoking `new Date(dateString)`, avoiding UTC shifts
 * and rejecting impossible calendar dates (such as 2026-02-30).
 */
export function parseCalendarDate(rawDate: string | null | undefined): ParsedCalendarDate | null {
  if (!rawDate || typeof rawDate !== 'string') return null

  const trimmed = rawDate.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(trimmed)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  const localDate = new Date(year, month - 1, day)
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return null
  }

  return {
    dateKey: `${match[1]}-${match[2]}-${match[3]}`,
    localDate,
    year,
    month,
    day,
  }
}

/**
 * Formats a validated calendar date into a human-friendly group header label:
 * - "Today · DD Mon YYYY"
 * - "Yesterday · DD Mon YYYY"
 * - "Weekday, DD Mon YYYY" for older (or future) dates
 */
export function formatDateGroupLabel(
  parsed: ParsedCalendarDate,
  refDate: Date = new Date(),
): string {
  const todayKey = toLocalDateKey(refDate)
  const yesterday = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() - 1)
  const yesterdayKey = toLocalDateKey(yesterday)

  const dayStr = String(parsed.day).padStart(2, '0')
  const monthStr = SHORT_MONTHS[parsed.month - 1]
  const shortDate = `${dayStr} ${monthStr} ${parsed.year}`

  if (parsed.dateKey === todayKey) {
    return `Today · ${shortDate}`
  }
  if (parsed.dateKey === yesterdayKey) {
    return `Yesterday · ${shortDate}`
  }

  const weekday = WEEKDAY_NAMES[parsed.localDate.getDay()]
  return `${weekday}, ${shortDate}`
}

/**
 * Groups transactions by calendar date (YYYY-MM-DD), sorted newest first,
 * preserving descending transaction order (`id DESC`) within each group.
 * Invalid or missing dates are placed in a final fallback group.
 */
export function groupTransactionsByDate<T extends DateGroupableTransaction>(
  transactions: readonly T[],
  refDate: Date = new Date(),
): TransactionDateGroup<T>[] {
  if (transactions.length === 0) return []

  const datedMap = new Map<string, { parsed: ParsedCalendarDate; items: T[] }>()
  const fallbackItems: T[] = []

  for (const tx of transactions) {
    const parsed = parseCalendarDate(tx.transaction_date)
    if (!parsed) {
      fallbackItems.push(tx)
      continue
    }

    const existing = datedMap.get(parsed.dateKey)
    if (existing) {
      existing.items.push(tx)
    } else {
      datedMap.set(parsed.dateKey, { parsed, items: [tx] })
    }
  }

  const groups: TransactionDateGroup<T>[] = Array.from(datedMap.values())
    .sort((a, b) => b.parsed.dateKey.localeCompare(a.parsed.dateKey))
    .map(({ parsed, items }) => ({
      dateKey: parsed.dateKey,
      label: formatDateGroupLabel(parsed, refDate),
      isFallback: false,
      transactions: [...items].sort((a, b) => b.id - a.id),
    }))

  if (fallbackItems.length > 0) {
    groups.push({
      dateKey: FALLBACK_DATE_KEY,
      label: FALLBACK_DATE_LABEL,
      isFallback: true,
      transactions: [...fallbackItems].sort((a, b) => b.id - a.id),
    })
  }

  return groups
}
