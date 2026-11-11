import {
  AlertCircle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Coins,
  Loader2,
  RefreshCw,
  Repeat,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { PageIntro } from '@/components/common/PageIntro'
import { StatCard } from '@/components/common/StatCard'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatMonthLabel } from '@/features/budgets/budgetUtils'
import { CalendarGrid } from '@/features/calendar/CalendarGrid'
import { DayEventsPanel } from '@/features/calendar/DayEventsPanel'
import { useFinancialCalendar } from '@/features/calendar/useFinancialCalendar'
import { formatAmount } from '@/lib/format'

interface CalendarPageProps {
  initialMonth?: string
  initialDate?: string
  refDate?: Date
}

export function CalendarPage({ initialMonth, initialDate, refDate }: CalendarPageProps = {}) {
  const {
    status,
    selectedMonth,
    selectedDate,
    setSelectedDate,
    goToPreviousMonth,
    goToNextMonth,
    goToToday,
    reload,
    gridDays,
    eventsByDate,
    selectedDayEvents,
    monthSummary,
    error,
  } = useFinancialCalendar({ initialMonth, initialDate, refDate })

  // Format StatCard values
  let incomeVal: string | null = null
  let expenseVal: string | null = null
  let netVal: string | null = null
  let billsVal: string | null = null

  let incomeHint = 'Loading income…'
  let expenseHint = 'Loading expenses…'
  let netHint = 'Loading net flow…'
  let billsHint = 'Loading commitments…'

  if (status === 'error') {
    incomeHint = 'Unable to load'
    expenseHint = 'Unable to load'
    netHint = 'Unable to load'
    billsHint = 'Unable to load'
  } else if (status === 'success') {
    incomeVal = `₹${formatAmount(monthSummary.totalIncome)}`
    expenseVal = `₹${formatAmount(monthSummary.totalExpenses)}`

    const isNegative = monthSummary.netSavings < 0
    netVal = `${isNegative ? '−' : ''}₹${formatAmount(Math.abs(monthSummary.netSavings))}`
    billsVal = `₹${formatAmount(monthSummary.activeBillsDueTotal)}`

    incomeHint = 'Recorded month income'
    expenseHint = 'Recorded month spending'
    netHint = isNegative ? 'Expenses exceed income' : 'Net positive month flow'
    billsHint =
      monthSummary.activeBillsDueCount > 0
        ? `${monthSummary.activeBillsDueCount} active ${
            monthSummary.activeBillsDueCount === 1 ? 'bill' : 'bills'
          } scheduled`
        : 'No bills due this month'
  }

  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Timeline"
        title="Financial Calendar"
        description="Inspect daily income, expenses, scheduled recurring commitments, and milestones on an interactive timeline."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl border border-border bg-card p-1 shadow-card">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Previous month"
                className="size-8 rounded-lg"
                onClick={goToPreviousMonth}
              >
                <ChevronLeft className="size-4" />
              </Button>

              <div className="flex items-center gap-2 px-3">
                <CalendarIcon className="size-4 text-forest" aria-hidden="true" />
                <span className="text-sm font-semibold text-ink min-w-[120px] text-center">
                  {formatMonthLabel(selectedMonth)}
                </span>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Next month"
                className="size-8 rounded-lg"
                onClick={goToNextMonth}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 text-xs"
              onClick={goToToday}
              aria-label="Go to today"
            >
              Today
            </Button>
          </div>
        }
      />

      {/* Monthly Summary StatCards */}
      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Month income"
          icon={TrendingUp}
          value={incomeVal}
          hint={incomeHint}
          accent="forest"
        />
        <StatCard
          label="Month expenses"
          icon={TrendingDown}
          value={expenseVal}
          hint={expenseHint}
          accent="butter"
        />
        <StatCard
          label="Net savings"
          icon={Coins}
          value={netVal}
          hint={netHint}
          accent="emerald"
        />
        <StatCard
          label="Bills due this month"
          icon={Repeat}
          value={billsVal}
          hint={billsHint}
          accent="sage"
        />
      </Reveal>

      {/* Overdue alert banner if overdue commitments exist */}
      {status === 'success' && monthSummary.overdueBillsCount > 0 && (
        <Reveal className="mt-2">
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span className="font-medium">
                You have {monthSummary.overdueBillsCount}{' '}
                {monthSummary.overdueBillsCount === 1 ? 'bill' : 'bills'} overdue totaling ₹
                {formatAmount(monthSummary.overdueBillsTotal)}.
              </span>
            </div>
          </div>
        </Reveal>
      )}

      {/* Error State */}
      {status === 'error' && (
        <Reveal className="mt-6">
          <Card className="border-destructive/30 bg-destructive/10">
            <CardContent className="flex flex-col items-center justify-center p-6 text-center">
              <AlertCircle className="size-8 text-destructive mb-2" />
              <p className="text-sm font-medium text-destructive">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={reload}
              >
                <RefreshCw className="size-3.5" />
                Try again
              </Button>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {/* Loading State */}
      {status === 'loading' && (
        <Reveal className="mt-8 flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary mb-3" />
          <p className="text-sm font-medium text-ink">Loading financial calendar…</p>
          <p className="text-xs text-muted-foreground mt-1">
            Aggregating transactions, recurring commitments, and milestones
          </p>
        </Reveal>
      )}

      {/* Main Calendar & Day Inspection Layout */}
      {status === 'success' && (
        <Reveal className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 min-w-0">
              <CalendarGrid
                gridDays={gridDays}
                eventsByDate={eventsByDate}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </div>
            <div className="lg:col-span-1 min-w-0 w-full">
              <DayEventsPanel dayEvents={selectedDayEvents} selectedDate={selectedDate} />
            </div>
          </div>
        </Reveal>
      )}
    </AnimatedPage>
  )
}
