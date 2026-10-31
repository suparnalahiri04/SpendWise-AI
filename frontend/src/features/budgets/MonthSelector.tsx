import { Calendar, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  formatMonthLabel,
  getCurrentMonthString,
  getNextMonthString,
  getPreviousMonthString,
} from './budgetUtils'

interface MonthSelectorProps {
  month: string
  onChange: (month: string) => void
}

export function MonthSelector({ month, onChange }: MonthSelectorProps) {
  const currentMonth = getCurrentMonthString()
  const isCurrentMonth = month === currentMonth

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center rounded-xl border border-border bg-card p-1 shadow-card">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          className="size-8 rounded-lg"
          onClick={() => onChange(getPreviousMonthString(month))}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="flex items-center gap-2 px-3">
          <Calendar className="size-4 text-forest" aria-hidden="true" />
          <span className="text-sm font-semibold text-ink min-w-[110px] text-center">
            {formatMonthLabel(month)}
          </span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Next month"
          className="size-8 rounded-lg"
          onClick={() => onChange(getNextMonthString(month))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {!isCurrentMonth && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 text-xs"
          onClick={() => onChange(currentMonth)}
        >
          <RotateCcw className="size-3.5 mr-1" />
          Current month
        </Button>
      )}
    </div>
  )
}

