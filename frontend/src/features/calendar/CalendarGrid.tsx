import { AlertCircle, Calendar, Target } from 'lucide-react'
import type { CalendarGridDay, DayEvents, WeekStart } from './calendarUtils'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

interface CalendarGridProps {
  gridDays: CalendarGridDay[]
  eventsByDate: Record<string, DayEvents>
  selectedDate: string // YYYY-MM-DD
  onSelectDate: (dateKey: string) => void
  weekStart?: WeekStart
  className?: string
}

const SUNDAY_HEADER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONDAY_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function CalendarGrid({
  gridDays,
  eventsByDate,
  selectedDate,
  onSelectDate,
  weekStart = 'sunday',
  className,
}: CalendarGridProps) {
  const headers = weekStart === 'monday' ? MONDAY_HEADER : SUNDAY_HEADER

  return (
    <div
      role="grid"
      aria-label="Financial Calendar Grid"
      className={cn('flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:p-5 shadow-card', className)}
    >
      {/* Weekday headers */}
      <div role="row" className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
        {headers.map((dayName, idx) => {
          const isWeekend = weekStart === 'sunday' ? idx === 0 || idx === 6 : idx === 5 || idx === 6
          return (
            <div
              key={dayName}
              role="columnheader"
              className={cn(
                'py-1.5 text-xs font-semibold tracking-wider uppercase select-none',
                isWeekend ? 'text-muted-foreground/70' : 'text-ink',
              )}
            >
              {dayName}
            </div>
          )
        })}
      </div>

      {/* Days grid */}
      <div role="rowgroup" className="grid grid-cols-7 gap-1 sm:gap-2">
        {gridDays.map((day) => {
          const isSelected = day.dateKey === selectedDate
          const dayEvents = eventsByDate[day.dateKey]
          const hasTransactions = Boolean(dayEvents && dayEvents.transactions.length > 0)
          const hasRecurring = Boolean(dayEvents && dayEvents.recurringBills.length > 0)
          const hasMilestones = Boolean(dayEvents && dayEvents.goalMilestones.length > 0)

          const hasOverdueBill = Boolean(
            dayEvents && dayEvents.recurringBills.some((b) => b.is_overdue),
          )

          // Build accessible description for screen readers
          const ariaParts: string[] = [`${day.dateKey}`]
          if (day.isToday) ariaParts.push('Today')
          if (isSelected) ariaParts.push('Selected')
          if (hasTransactions) {
            ariaParts.push(
              `${dayEvents.transactions.length} transactions, income: ₹${formatAmount(
                dayEvents.totalIncome,
              )}, expenses: ₹${formatAmount(dayEvents.totalExpenses)}`,
            )
          }
          if (hasRecurring) {
            ariaParts.push(`${dayEvents.recurringBills.length} recurring bills due`)
          }
          if (hasMilestones) {
            ariaParts.push(`${dayEvents.goalMilestones.length} goal milestones`)
          }

          return (
            <button
              key={day.dateKey}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={ariaParts.join(', ')}
              onClick={() => onSelectDate(day.dateKey)}
              className={cn(
                'group relative flex flex-col justify-between rounded-xl border p-1.5 sm:p-2.5 transition-all text-left outline-none min-h-[72px] sm:min-h-[92px]',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                day.isCurrentMonth
                  ? 'bg-card border-border/80 text-ink hover:border-forest/60 hover:bg-muted/40'
                  : 'bg-muted/30 border-border/40 text-muted-foreground/50 hover:bg-muted/60',
                isSelected && 'border-forest ring-2 ring-forest bg-sage/20 shadow-xs z-10',
              )}
            >
              {/* Day header row */}
              <div className="flex items-center justify-between w-full">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    day.isToday
                      ? 'bg-forest text-paper font-bold shadow-xs'
                      : isSelected
                        ? 'text-forest font-bold'
                        : day.isCurrentMonth
                          ? 'text-ink'
                          : 'text-muted-foreground/60',
                  )}
                >
                  {day.dayOfMonth}
                </span>

                {/* Status indicators */}
                <div className="flex items-center gap-1">
                  {hasMilestones && (
                    <span
                      title="Savings Goal Milestone"
                      aria-label="Goal Milestone"
                      className="text-primary flex items-center justify-center"
                    >
                      <Target className="size-3" />
                    </span>
                  )}

                  {hasRecurring && (
                    <span
                      title={hasOverdueBill ? 'Overdue Recurring Bill' : 'Recurring Bill Due'}
                      aria-label={hasOverdueBill ? 'Overdue Recurring Bill' : 'Recurring Bill Due'}
                      className={cn(
                        'flex items-center justify-center',
                        hasOverdueBill ? 'text-destructive' : 'text-[#c98e1f]',
                      )}
                    >
                      {hasOverdueBill ? (
                        <AlertCircle className="size-3" />
                      ) : (
                        <Calendar className="size-3" />
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Event totals badges / pills */}
              <div className="mt-1 flex flex-col gap-0.5 w-full text-[11px] leading-tight overflow-hidden">
                {hasTransactions && (
                  <>
                    {dayEvents.totalExpenses > 0 && (
                      <span
                        className="truncate font-medium text-destructive tabular"
                        title={`Expenses: ₹${formatAmount(dayEvents.totalExpenses)}`}
                      >
                        -₹{formatAmount(dayEvents.totalExpenses)}
                      </span>
                    )}
                    {dayEvents.totalIncome > 0 && (
                      <span
                        className="truncate font-medium text-forest tabular"
                        title={`Income: ₹${formatAmount(dayEvents.totalIncome)}`}
                      >
                        +₹{formatAmount(dayEvents.totalIncome)}
                      </span>
                    )}
                  </>
                )}

                {hasRecurring && (
                  <span
                    className={cn(
                      'hidden sm:inline-block truncate rounded px-1 text-[10px] font-medium leading-normal w-fit',
                      hasOverdueBill
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-butter/60 text-ink',
                    )}
                  >
                    {dayEvents.recurringBills.length}{' '}
                    {dayEvents.recurringBills.length === 1 ? 'bill' : 'bills'}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

