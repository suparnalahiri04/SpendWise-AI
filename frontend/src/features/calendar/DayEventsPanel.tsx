import {
  Calendar,
  Clock,
  Coins,
  Repeat,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DayEvents } from './calendarUtils'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

interface DayEventsPanelProps {
  dayEvents: DayEvents
  selectedDate: string // YYYY-MM-DD
  className?: string
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
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

function formatFriendlyDate(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return dateKey

  const year = Number(match[1])
  const monthIdx = Number(match[2]) - 1
  const day = Number(match[3])

  const dateObj = new Date(year, monthIdx, day)
  const weekday = WEEKDAY_NAMES[dateObj.getDay()] ?? ''
  const monthName = MONTH_NAMES[monthIdx] ?? ''

  return `${weekday}, ${day} ${monthName} ${year}`
}

export function DayEventsPanel({
  dayEvents,
  selectedDate,
  className,
}: DayEventsPanelProps) {
  const { transactions, recurringBills, goalMilestones, totalIncome, totalExpenses, netFlow } =
    dayEvents

  const hasEvents = dayEvents.hasEvents

  return (
    <Card className={cn('flex flex-col gap-4 p-4 sm:p-5 shadow-card min-w-0 w-full', className)}>
      <CardHeader className="flex flex-col items-stretch justify-start gap-3 p-0 pb-3.5 border-b border-border/60 w-full min-w-0">
        <div className="flex flex-col gap-1 w-full min-w-0">
          <div className="flex items-center gap-2 text-forest">
            <Calendar className="size-4 shrink-0 text-forest" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider text-forest-soft">
              Daily Inspection
            </span>
          </div>
          <CardTitle className="text-base sm:text-lg font-bold text-ink leading-snug break-words">
            {formatFriendlyDate(selectedDate)}
          </CardTitle>
        </div>

        {/* Daily Financial Flow Summary Items (Responsive grid: stacks on narrow widths, 3 cols on spacious widths) */}
        <div
          data-testid="daily-summary-grid"
          className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2 w-full min-w-0"
        >
          <div
            data-testid="daily-income-summary"
            className="rounded-lg bg-muted/50 p-2.5 text-left border border-border/40 min-w-0 flex-1"
          >
            <span className="text-muted-foreground block text-[11px] font-medium">Income</span>
            <span
              className="font-semibold text-forest text-sm tabular block truncate"
              title={`₹${formatAmount(totalIncome)}`}
            >
              ₹{formatAmount(totalIncome)}
            </span>
          </div>
          <div
            data-testid="daily-expense-summary"
            className="rounded-lg bg-muted/50 p-2.5 text-left border border-border/40 min-w-0 flex-1"
          >
            <span className="text-muted-foreground block text-[11px] font-medium">Expenses</span>
            <span
              className="font-semibold text-destructive text-sm tabular block truncate"
              title={`₹${formatAmount(totalExpenses)}`}
            >
              ₹{formatAmount(totalExpenses)}
            </span>
          </div>
          <div
            data-testid="daily-net-summary"
            className="rounded-lg bg-muted/50 p-2.5 text-left border border-border/40 min-w-0 flex-1"
          >
            <span className="text-muted-foreground block text-[11px] font-medium">Net Flow</span>
            <span
              className={cn(
                'font-semibold text-sm tabular block truncate',
                netFlow > 0
                  ? 'text-forest'
                  : netFlow < 0
                    ? 'text-destructive'
                    : 'text-muted-foreground',
              )}
              title={`${netFlow < 0 ? '-' : netFlow > 0 ? '+' : ''}₹${formatAmount(Math.abs(netFlow))}`}
            >
              {netFlow < 0 ? '-' : netFlow > 0 ? '+' : ''}₹{formatAmount(Math.abs(netFlow))}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 space-y-4 min-w-0 w-full">
        {/* Empty Date State */}
        {!hasEvents && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Clock className="size-8 mx-auto mb-2 opacity-40 text-forest" />
            <p className="text-sm font-medium text-ink">No financial events recorded</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              No transactions, scheduled recurring bills, or goal milestones fall on this date.
            </p>
          </div>
        )}

        {/* 1. Scheduled Recurring Commitments */}
        {recurringBills.length > 0 && (
          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between text-xs font-semibold text-ink">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Repeat className="size-3.5 text-forest" />
                Scheduled Commitments ({recurringBills.length})
              </span>
            </div>
            <div className="space-y-1.5 min-w-0">
              {recurringBills.map((bill) => {
                const isOverdue = bill.is_overdue
                return (
                  <div
                    key={bill.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-card p-2.5 text-xs transition-colors hover:bg-muted/40 min-w-0 w-full"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="font-semibold text-ink truncate min-w-0 flex-1"
                          title={bill.description}
                        >
                          {bill.description}
                        </span>
                        <Badge
                          tone={isOverdue ? 'terracotta' : 'butter'}
                          className="shrink-0"
                        >
                          {isOverdue ? 'Overdue' : 'Scheduled Due'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 min-w-0 truncate">
                        {bill.category} • {bill.frequency}
                        {isOverdue && (
                          <span className="text-destructive font-medium ml-1">
                            (Overdue by {Math.abs(bill.days_until_due)}d)
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="font-semibold text-ink text-sm tabular shrink-0 text-right ml-2">
                      ₹{formatAmount(bill.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 2. Recorded Actual Transactions */}
        {transactions.length > 0 && (
          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between text-xs font-semibold text-ink">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Coins className="size-3.5 text-forest" />
                Recorded Transactions ({transactions.length})
              </span>
            </div>
            <div className="space-y-1.5 min-w-0">
              {transactions.map((tx) => {
                const isIncome = tx.transaction_type === 'income'
                return (
                  <div
                    key={tx.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-card p-2.5 text-xs transition-colors hover:bg-muted/40 min-w-0 w-full"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="font-semibold text-ink truncate min-w-0 flex-1"
                          title={tx.description}
                        >
                          {tx.description}
                        </span>
                        <Badge tone="neutral" className="shrink-0">
                          {tx.category}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 min-w-0 truncate">
                        {isIncome ? (
                          <TrendingUp className="size-3 text-forest shrink-0" />
                        ) : (
                          <TrendingDown className="size-3 text-destructive shrink-0" />
                        )}
                        <span className="truncate">
                          {isIncome ? 'Income record' : 'Expense record'}
                        </span>
                        {tx.is_reviewed && (
                          <span className="text-[10px] text-forest flex items-center gap-0.5 shrink-0">
                            • Reviewed
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'font-semibold text-sm tabular shrink-0 text-right ml-2',
                        isIncome ? 'text-forest' : 'text-destructive',
                      )}
                    >
                      {isIncome ? '+' : '-'}₹{formatAmount(tx.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 3. Savings Goal Milestones */}
        {goalMilestones.length > 0 && (
          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between text-xs font-semibold text-ink">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Target className="size-3.5 text-primary" />
                Goal Target Milestones ({goalMilestones.length})
              </span>
            </div>
            <div className="space-y-1.5 min-w-0">
              {goalMilestones.map((goal) => (
                <div
                  key={goal.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs min-w-0 w-full"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="font-semibold text-ink truncate min-w-0 flex-1"
                        title={goal.name}
                      >
                        {goal.name}
                      </span>
                      <Badge
                        tone={goal.is_completed ? 'lime' : 'sage'}
                        className="shrink-0"
                      >
                        {goal.is_completed ? 'Target Reached' : 'Target Deadline'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 min-w-0 truncate">
                      Target: ₹{formatAmount(goal.target_amount)} • Progress: {goal.progress_pct}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
