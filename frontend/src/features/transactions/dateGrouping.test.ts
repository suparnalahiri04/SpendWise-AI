import { describe, expect, it } from 'vitest'
import {
  FALLBACK_DATE_KEY,
  FALLBACK_DATE_LABEL,
  groupTransactionsByDate,
  parseCalendarDate,
  type DateGroupableTransaction,
} from './dateGrouping'

interface TestTx extends DateGroupableTransaction {
  description: string
}

function makeTx(
  id: number,
  transaction_date: string | null | undefined,
  description = `Tx ${id}`,
): TestTx {
  return { id, transaction_date, description }
}

describe('parseCalendarDate', () => {
  it('parses valid YYYY-MM-DD and ISO datetime strings without UTC shifts', () => {
    const plain = parseCalendarDate('2026-11-02')
    expect(plain?.dateKey).toBe('2026-11-02')
    expect(plain?.year).toBe(2026)
    expect(plain?.month).toBe(11)
    expect(plain?.day).toBe(2)

    const utcMidnight = parseCalendarDate('2026-11-02T00:00:00Z')
    expect(utcMidnight?.dateKey).toBe('2026-11-02')

    const offsetTimestamp = parseCalendarDate('2026-11-02T23:59:59-05:00')
    expect(offsetTimestamp?.dateKey).toBe('2026-11-02')

    const leapDay = parseCalendarDate('2024-02-29')
    expect(leapDay?.dateKey).toBe('2024-02-29')
  })

  it('rejects impossible calendar dates and malformed strings', () => {
    expect(parseCalendarDate('2026-02-29')).toBeNull() // 2026 is not a leap year
    expect(parseCalendarDate('2026-02-30')).toBeNull()
    expect(parseCalendarDate('2026-04-31')).toBeNull()
    expect(parseCalendarDate('2026-13-01')).toBeNull()
    expect(parseCalendarDate('2026-00-10')).toBeNull()
    expect(parseCalendarDate('2026-11-00')).toBeNull()
    expect(parseCalendarDate('2026-11-02-99')).toBeNull()
    expect(parseCalendarDate('not-a-date')).toBeNull()
    expect(parseCalendarDate('')).toBeNull()
    expect(parseCalendarDate(null)).toBeNull()
    expect(parseCalendarDate(undefined)).toBeNull()
  })
})

describe('groupTransactionsByDate', () => {
  const refDate = new Date(2026, 10, 11, 20, 30, 0) // Local: 11 Nov 2026

  it('returns an empty array for empty input', () => {
    expect(groupTransactionsByDate([], refDate)).toEqual([])
  })

  it('groups multiple transactions on the same date and preserves id DESC ordering', () => {
    const items = [
      makeTx(116, '2026-11-02', 'Paid to Person 30'),
      makeTx(119, '2026-11-02', 'Paid to DMRC 150'),
      makeTx(117, '2026-11-02', 'Received from Meesho'),
      makeTx(118, '2026-11-02', 'Paid to Person 140'),
    ]

    const groups = groupTransactionsByDate(items, refDate)

    expect(groups).toHaveLength(1)
    expect(groups[0].dateKey).toBe('2026-11-02')
    expect(groups[0].label).toBe('Monday, 02 Nov 2026')
    expect(groups[0].isFallback).toBe(false)
    expect(groups[0].transactions.map((t) => t.id)).toEqual([119, 118, 117, 116])
  })

  it('sorts groups newest first across months and years', () => {
    const items = [
      makeTx(1, '2025-12-31', 'New Year Eve'),
      makeTx(2, '2026-10-30', 'October Coffee'),
      makeTx(3, '2026-11-11', 'Today Lunch'),
      makeTx(4, '2026-11-02', 'November Metro'),
      makeTx(5, '2026-11-10', 'Yesterday Dinner'),
    ]

    const groups = groupTransactionsByDate(items, refDate)

    expect(groups.map((g) => g.dateKey)).toEqual([
      '2026-11-11',
      '2026-11-10',
      '2026-11-02',
      '2026-10-30',
      '2025-12-31',
    ])
    expect(groups.map((g) => g.label)).toEqual([
      'Today · 11 Nov 2026',
      'Yesterday · 10 Nov 2026',
      'Monday, 02 Nov 2026',
      'Friday, 30 Oct 2026',
      'Wednesday, 31 Dec 2025',
    ])
  })

  it('computes Today and Yesterday accurately across month and year boundaries', () => {
    const janFirstRef = new Date(2026, 0, 1, 9, 0, 0) // 01 Jan 2026
    const groups = groupTransactionsByDate(
      [
        makeTx(1, '2025-12-31', 'Year end'),
        makeTx(2, '2026-01-01', 'New year'),
      ],
      janFirstRef,
    )

    expect(groups.map((g) => g.label)).toEqual([
      'Today · 01 Jan 2026',
      'Yesterday · 31 Dec 2025',
    ])
  })

  it('groups UTC-timestamped dates strictly by calendar date without timezone shift', () => {
    const groups = groupTransactionsByDate(
      [
        makeTx(10, '2026-11-02T00:00:00Z'),
        makeTx(11, '2026-11-02T23:59:59Z'),
        makeTx(12, '2026-11-02'),
      ],
      refDate,
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].dateKey).toBe('2026-11-02')
    expect(groups[0].transactions.map((t) => t.id)).toEqual([12, 11, 10])
  })

  it('places invalid, impossible, and missing dates in a final fallback group sorted by id DESC', () => {
    const items = [
      makeTx(1, '2026-02-30', 'Impossible Feb 30'),
      makeTx(2, null, 'Missing null'),
      makeTx(3, '2026-11-11', 'Valid today'),
      makeTx(4, 'bad-date', 'Malformed string'),
      makeTx(5, undefined, 'Missing undefined'),
      makeTx(6, '2026-02-29', 'Non-leap Feb 29'),
    ]

    const groups = groupTransactionsByDate(items, refDate)

    expect(groups).toHaveLength(2)
    expect(groups[0].dateKey).toBe('2026-11-11')
    expect(groups[0].isFallback).toBe(false)

    expect(groups[1].dateKey).toBe(FALLBACK_DATE_KEY)
    expect(groups[1].label).toBe(FALLBACK_DATE_LABEL)
    expect(groups[1].isFallback).toBe(true)
    expect(groups[1].transactions.map((t) => t.id)).toEqual([6, 5, 4, 2, 1])
  })
})
