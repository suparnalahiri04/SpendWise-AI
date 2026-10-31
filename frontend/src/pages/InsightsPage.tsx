import {
  AlertCircle,
  CalendarClock,
  Compass,
  Loader2,
  PiggyBank,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { StatCard } from '@/components/common/StatCard'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMonthLabel, getCurrentMonthString } from '@/features/budgets/budgetUtils'
import { MonthSelector } from '@/features/budgets/MonthSelector'
import { InsightCard } from '@/features/insights/InsightCard'
import { useFinancialInsights } from '@/features/insights/useFinancialInsights'
import type { InsightItem } from '@/lib/api/types'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

type FilterTab = 'all' | 'patterns' | 'anomalies' | 'budgets' | 'recurring'

export function InsightsPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthString())
  const [filterTab, setFilterTab] = useState<FilterTab>('all')

  const { status, data, error, reload } = useFinancialInsights(selectedMonth)
  const monthLabel = formatMonthLabel(selectedMonth)

  const currentMonth = getCurrentMonthString()
  const isCurrentMonth = selectedMonth === currentMonth
  const isPastMonth = selectedMonth < currentMonth

  const summary = data?.summary
  const allInsights: InsightItem[] = data?.insights ?? []

  // Counts for filter tabs
  const patternCount = allInsights.filter(
    (i) => i.type === 'pattern' && !i.id.startsWith('budget-') && !i.id.startsWith('recurring-'),
  ).length
  const anomalyCount = allInsights.filter((i) => i.type === 'anomaly').length
  const budgetCount = allInsights.filter((i) => i.id.startsWith('budget-')).length
  const recurringCount = allInsights.filter((i) => i.id.startsWith('recurring-')).length

  const filteredInsights = allInsights.filter((i) => {
    if (filterTab === 'patterns') {
      return i.type === 'pattern' && !i.id.startsWith('budget-') && !i.id.startsWith('recurring-')
    }
    if (filterTab === 'anomalies') {
      return i.type === 'anomaly'
    }
    if (filterTab === 'budgets') {
      return i.id.startsWith('budget-')
    }
    if (filterTab === 'recurring') {
      return i.id.startsWith('recurring-')
    }
    return true
  })

  // Summary Stat Values & Explanatory Labels
  const totalSpentLabel = isCurrentMonth ? 'Month-to-Date Outflows' : 'Total Outflows'
  const projectedLabel = isCurrentMonth ? 'Projected Month-End' : 'Month-End Total'

  let totalSpentValue: string | null = null
  let projectedValue: string | null = null
  let savingsRateValue: string | null = null
  let fixedCommitmentValue: string | null = null

  let totalSpentHint = isCurrentMonth ? 'Tracking month-to-date spending' : `Outflows in ${monthLabel}`
  let projectedHint = isCurrentMonth ? 'Estimated month-end based on daily run rate' : 'Final closed total'
  let savingsRateHint = 'Requires income recorded in this month'
  let fixedCommitmentHint = 'Requires income to calculate commitment ratio'

  if (status === 'loading') {
    totalSpentHint = 'Loading outflows…'
    projectedHint = 'Calculating projection…'
    savingsRateHint = 'Calculating surplus…'
    fixedCommitmentHint = 'Loading commitments…'
  } else if (status === 'error') {
    totalSpentHint = 'Unable to load outflows'
    projectedHint = 'Unable to project'
    savingsRateHint = 'Unable to calculate'
    fixedCommitmentHint = 'Unable to load'
  } else if (status === 'success' && summary) {
    totalSpentValue = `₹${formatAmount(summary.total_spent_current_month)}`
    projectedValue = `₹${formatAmount(summary.projected_month_end_expense)}`

    const isZeroSpend =
      summary.total_spent_current_month === 0 ||
      summary.total_spent_current_month === '0.00' ||
      summary.total_spent_current_month === '0'

    if (isZeroSpend) {
      totalSpentHint = isCurrentMonth
        ? 'Zero spending recorded so far'
        : isPastMonth
          ? `No expenses recorded in ${monthLabel}`
          : 'Future month (no expenses recorded)'

      projectedHint = isCurrentMonth
        ? 'Paced at ₹0.00 based on month-to-date run rate'
        : `Final total for ${monthLabel}`
    } else {
      if (summary.month_over_month_change_pct !== null) {
        const sign = summary.month_over_month_change_pct > 0 ? '+' : ''
        totalSpentHint = `${sign}${summary.month_over_month_change_pct.toFixed(1)}% vs previous month`
      } else {
        totalSpentHint = isCurrentMonth
          ? `Spent so far in ${monthLabel}`
          : `Outflows in ${monthLabel}`
      }

      projectedHint = isCurrentMonth
        ? 'Estimated month-end based on daily run rate'
        : `Final total for ${monthLabel}`
    }

    if (summary.savings_rate_percentage !== null) {
      savingsRateValue = `${summary.savings_rate_percentage.toFixed(1)}%`
      savingsRateHint =
        summary.savings_rate_percentage >= 0
          ? 'Surplus retained from income'
          : 'Expenses exceed monthly income'
    } else {
      savingsRateHint = 'Requires income recorded in this month'
    }

    if (summary.fixed_commitment_ratio !== null) {
      fixedCommitmentValue = `${summary.fixed_commitment_ratio.toFixed(1)}%`
      fixedCommitmentHint = 'Of monthly income committed'
    } else {
      fixedCommitmentHint = 'Requires income to calculate commitment ratio'
    }
  }

  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Intelligence"
        title="Financial Insights"
        description="Personalized spending patterns, anomaly detection, budget guardrails, and upcoming payment commitments."
        actions={<MonthSelector month={selectedMonth} onChange={setSelectedMonth} />}
      />

      {/* Summary KPI Cards */}
      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 min-w-0">
        <StatCard
          label={totalSpentLabel}
          icon={Wallet}
          value={totalSpentValue}
          hint={totalSpentHint}
          accent="forest"
        />
        <StatCard
          label={projectedLabel}
          icon={TrendingUp}
          value={projectedValue}
          hint={projectedHint}
          accent="butter"
        />
        <StatCard
          label="Savings Rate"
          icon={PiggyBank}
          value={savingsRateValue}
          hint={savingsRateHint}
          accent="sage"
        />
        <StatCard
          label="Fixed Commitments"
          icon={CalendarClock}
          value={fixedCommitmentValue}
          hint={fixedCommitmentHint}
          accent="terracotta"
        />
      </Reveal>

      {/* Main Content Area */}
      <Reveal>
        <Card className="min-w-0">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
            <div className="min-w-0">
              <CardTitle className="font-serif text-xl font-bold text-ink">
                Observations & Findings
              </CardTitle>
              <CardDescription>
                AI-driven analysis and proactive notifications for {monthLabel}.
              </CardDescription>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-paper-deep/60 p-1">
              <button
                type="button"
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  filterTab === 'all'
                    ? 'bg-card text-forest shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => setFilterTab('all')}
              >
                All ({allInsights.length})
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  filterTab === 'patterns'
                    ? 'bg-card text-forest shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => setFilterTab('patterns')}
              >
                Patterns ({patternCount})
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  filterTab === 'anomalies'
                    ? 'bg-card text-destructive shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => setFilterTab('anomalies')}
              >
                Anomalies ({anomalyCount})
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  filterTab === 'budgets'
                    ? 'bg-card text-forest shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => setFilterTab('budgets')}
              >
                Budgets ({budgetCount})
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  filterTab === 'recurring'
                    ? 'bg-card text-forest shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => setFilterTab('recurring')}
              >
                Recurring ({recurringCount})
              </button>
            </div>
          </CardHeader>

          <CardContent className="min-w-0">
            {/* Loading State */}
            {status === 'loading' && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Loader2 className="size-8 animate-spin text-forest" />
                <p className="text-sm font-medium text-muted-foreground">
                  Analyzing financial history for {monthLabel}…
                </p>
              </div>
            )}

            {/* Error State */}
            {status === 'error' && (
              <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                  <AlertCircle className="size-6" />
                </span>
                <div className="max-w-md">
                  <p className="font-semibold text-ink">Failed to load insights</p>
                  <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={reload} className="gap-2">
                  <RefreshCw className="size-3.5" />
                  Try again
                </Button>
              </div>
            )}

            {/* Success State with No Insights Overall */}
            {status === 'success' && allInsights.length === 0 && (
              <EmptyState
                icon={Sparkles}
                title={
                  isCurrentMonth
                    ? 'No notable insights yet for this month'
                    : 'No notable insights for this month'
                }
                description={
                  isCurrentMonth
                    ? `SpendWise AI hasn't detected any spending spikes, budget warnings, or unusual transactions so far in ${monthLabel}. Observations will appear as activity is recorded.`
                    : `No category spikes, budget warnings, or unusual transactions were recorded in ${monthLabel}.`
                }
              />
            )}

            {/* Success State with Filter Empty */}
            {status === 'success' && allInsights.length > 0 && filteredInsights.length === 0 && (
              <EmptyState
                icon={Compass}
                title={`No ${filterTab} insights found`}
                description={`There are no active findings in the "${filterTab}" view for ${monthLabel}. Try selecting "All" to view other categories.`}
                size="compact"
              />
            )}

            {/* Success State with Matching Insights */}
            {status === 'success' && filteredInsights.length > 0 && (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 min-w-0">
                {filteredInsights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Reveal>
    </AnimatedPage>
  )
}
