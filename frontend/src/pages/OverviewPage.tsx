import {
  ArrowLeftRight,
  ArrowRight,
  CloudOff,
  FileText,
  Lightbulb,
  PiggyBank,
  Receipt,
  RefreshCw,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router'
import { TrendChart } from '@/components/charts/TrendChart'
import { PageIntro } from '@/components/common/PageIntro'
import { PeriodBadge } from '@/components/common/PeriodBadge'
import { StatCard } from '@/components/common/StatCard'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { calculateOverviewSummary } from '@/features/overview/overviewCalculations'
import { TopCategoriesBreakdown } from '@/features/overview/TopCategoriesBreakdown'
import { usePeriod } from '@/features/period/period'
import { filterTransactionsByPeriod } from '@/features/period/periodUtils'
import { useTransactions } from '@/features/transactions/useTransactions'
import { formatAmount } from '@/lib/format'

const NO_DATA_HINT = 'Available after your first statement import'

const GETTING_STARTED = [
  {
    step: 1,
    title: 'Import a statement',
    description: 'Bring in a bank or card statement as the starting point for your journal.',
    to: '/statements',
    icon: FileText,
  },
  {
    step: 2,
    title: 'Review transactions',
    description: 'Check how each entry has been categorised and correct anything that looks off.',
    to: '/transactions',
    icon: ArrowLeftRight,
  },
  {
    step: 3,
    title: 'Set your budgets',
    description: 'Choose monthly limits for the categories that matter most to you.',
    to: '/budgets',
    icon: PiggyBank,
  },
] as const

export function OverviewPage() {
  const txState = useTransactions()
  const { period, periodLabel } = usePeriod()

  const allTransactions = txState.status === 'success' ? txState.transactions : []
  const periodTransactions = filterTransactionsByPeriod(allTransactions, period)
  const summary = calculateOverviewSummary(periodTransactions)

  const hasAnyTransactions = allTransactions.length > 0
  const hasPeriodTransactions = periodTransactions.length > 0

  // Determine summary card display values
  let spendingValue: string | null = null
  let spendingHint = NO_DATA_HINT

  let incomeValue: string | null = null
  let incomeHint = NO_DATA_HINT

  let savingsValue: string | null = null
  let savingsHint = NO_DATA_HINT

  if (txState.status === 'loading') {
    spendingHint = 'Loading your journal…'
    incomeHint = 'Loading your journal…'
    savingsHint = 'Loading your journal…'
  } else if (txState.status === 'error') {
    spendingHint = 'Unable to load spending'
    incomeHint = 'Unable to load income'
    savingsHint = 'Unable to load savings'
  } else if (hasAnyTransactions) {
    if (hasPeriodTransactions) {
      spendingValue = `₹${formatAmount(summary.totalExpenses.toFixed(2))}`
      spendingHint = `Total outflows in ${periodLabel.toLowerCase()}`

      incomeValue = `₹${formatAmount(summary.totalIncome.toFixed(2))}`
      incomeHint = `Total inflows in ${periodLabel.toLowerCase()}`

      savingsValue = `${summary.netSavings >= 0 ? '+' : '−'}₹${formatAmount(
        Math.abs(summary.netSavings).toFixed(2),
      )}`
      savingsHint =
        summary.netSavings >= 0 ? 'Surplus retained this period' : 'Outflows exceeded income'
    } else {
      // User has transactions overall, but none in this specific selected period
      spendingValue = '₹0.00'
      spendingHint = `No spending in ${periodLabel.toLowerCase()}`

      incomeValue = '₹0.00'
      incomeHint = `No income in ${periodLabel.toLowerCase()}`

      savingsValue = '₹0.00'
      savingsHint = `No activity in ${periodLabel.toLowerCase()}`
    }
  }

  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Your money journal"
        title="A calm view of where your money goes"
        description="A clear summary of your spending, income, and category breakdowns for the selected reporting period."
        actions={<PeriodBadge />}
      />

      {txState.status === 'error' && (
        <Reveal>
          <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-terracotta/40 bg-terracotta/10 p-4 text-sm text-[#8a3f29]"
          >
            <div className="flex items-center gap-2.5">
              <CloudOff className="size-5 shrink-0 text-terracotta" aria-hidden="true" />
              <span>{txState.message}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={txState.reload}
              className="gap-1.5 self-start sm:self-auto border-terracotta/40 bg-card hover:bg-paper"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              <span>Try again</span>
            </Button>
          </div>
        </Reveal>
      )}

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total spending"
          icon={Receipt}
          value={spendingValue}
          hint={spendingHint}
          variant="hero"
        />
        <StatCard
          label="Income"
          icon={Wallet}
          value={incomeValue}
          hint={incomeHint}
          accent="sage"
        />
        <StatCard
          label="Net savings"
          icon={TrendingUp}
          value={savingsValue}
          hint={savingsHint}
          accent="butter"
        />
        <StatCard
          label="Budget used"
          icon={Target}
          value={null}
          hint="Available once budgets are set"
          accent="terracotta"
        />
      </Reveal>

      <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Spending over time</CardTitle>
              <CardDescription>Daily spending for {periodLabel.toLowerCase()}.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={summary.spendingTrend}
              ariaLabel={`Spending over time for ${periodLabel}`}
              emptyTitle={hasAnyTransactions ? 'No spending in this period' : 'No spending data yet'}
              emptyDescription={
                hasAnyTransactions
                  ? `No expenses were recorded for ${periodLabel.toLowerCase()}.`
                  : 'Your spending trend will be charted here after transactions are imported.'
              }
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <div>
              <CardTitle>Top categories</CardTitle>
              <CardDescription>Where most of your money went.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <TopCategoriesBreakdown
              categories={summary.topCategories}
              periodLabel={periodLabel}
            />
          </CardContent>
        </Card>
      </Reveal>

      <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Getting started</CardTitle>
              <CardDescription>Three steps to fill your journal.</CardDescription>
            </div>
            <Badge tone="butter">Setup</Badge>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 sm:grid-cols-3">
              {GETTING_STARTED.map(({ step, title, description, to, icon: Icon }) => (
                <li key={step}>
                  <Link
                    to={to}
                    className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-paper/60 p-4 outline-none transition-all duration-150 hover:border-sage-deep hover:bg-sage/40 hover:shadow-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-card text-forest shadow-card">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">Step {step}</span>
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{title}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {description}
                      </span>
                    </span>
                    <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-forest">
                      Open
                      <ArrowRight
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card className="bg-forest text-paper">
          <CardHeader>
            <div>
              <CardTitle className="text-paper">AI insights</CardTitle>
              <CardDescription className="text-paper/70">
                Personalised observations about your habits.
              </CardDescription>
            </div>
            <Lightbulb className="size-5 text-butter" aria-hidden="true" />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <p className="font-display text-xl leading-snug text-paper">
              Insights will appear here once there is enough transaction history to learn from.
            </p>
            <Button asChild variant="accent" className="self-start">
              <Link to="/insights">
                About insights
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </Reveal>
    </AnimatedPage>
  )
}
