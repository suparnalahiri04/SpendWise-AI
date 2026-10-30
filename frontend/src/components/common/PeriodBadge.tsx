import { CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { usePeriod } from '@/features/period/period'

/** Shows which reporting period is selected in the header. */
export function PeriodBadge() {
  const { periodLabel } = usePeriod()
  return (
    <Badge tone="outline" className="bg-card py-1">
      <CalendarDays aria-hidden="true" />
      Period: {periodLabel}
    </Badge>
  )
}

