import { useMemo, useState, type ReactNode } from 'react'
import { PERIODS, PeriodContext, type PeriodId, type PeriodContextValue } from './period'

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<PeriodId>('this-month')

  const value = useMemo<PeriodContextValue>(
    () => ({
      period,
      periodLabel: PERIODS.find((p) => p.id === period)?.label ?? '',
      setPeriod,
    }),
    [period],
  )

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
}

