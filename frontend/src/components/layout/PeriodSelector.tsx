import { CalendarDays, ChevronDown } from 'lucide-react'
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
        <button
          type="button"
          aria-label={`Reporting period: ${periodLabel}`}
          className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 border border-input bg-card text-foreground hover:bg-paper-deep hover:border-sage-deep h-10 px-3 cursor-pointer"
        >
          <CalendarDays className="size-4 text-forest-soft shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{periodLabel}</span>
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        </button>
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

