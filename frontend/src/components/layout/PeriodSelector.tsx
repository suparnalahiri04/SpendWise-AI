import { CalendarDays, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PERIODS, isPeriodId, usePeriod } from '@/features/period/period'

export function PeriodSelector() {
  const { period, periodLabel, setPeriod } = usePeriod()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={`Reporting period: ${periodLabel}`} className="px-3">
          <CalendarDays className="text-forest-soft" aria-hidden="true" />
          <span className="hidden sm:inline">{periodLabel}</span>
          <ChevronDown className="size-3.5! text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Reporting period</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={period}
          onValueChange={(value) => {
            if (isPeriodId(value)) setPeriod(value)
          }}
        >
          {PERIODS.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id}>
              {p.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

