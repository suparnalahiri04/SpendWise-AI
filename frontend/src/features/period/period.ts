import { createContext, useContext } from 'react'

/**
 * Reporting periods available in the header selector.
 * At this stage the selection is UI state only; data filtering will use it
 * once real transactions exist.
 */
export const PERIODS = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-3-months', label: 'Last 3 months' },
  { id: 'year-to-date', label: 'Year to date' },
  { id: 'all', label: 'All time' },
] as const

export type PeriodId = (typeof PERIODS)[number]['id']

export interface PeriodContextValue {
  period: PeriodId
  periodLabel: string
  setPeriod: (period: PeriodId) => void
}

export const PeriodContext = createContext<PeriodContextValue | null>(null)

export function isPeriodId(value: string): value is PeriodId {
  return PERIODS.some((p) => p.id === value)
}

export function usePeriod(): PeriodContextValue {
  const value = useContext(PeriodContext)
  if (!value) {
    throw new Error('usePeriod must be used inside <PeriodProvider>')
  }
  return value
}

