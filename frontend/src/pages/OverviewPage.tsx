import {
  ArrowRight,
  ArrowLeftRight,
  FileText,
  Lightbulb,
  PiggyBank,
  Receipt,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router'
import { TrendChart } from '@/components/charts/TrendChart'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { PeriodBadge } from '@/components/common/PeriodBadge'
import { StatCard } from '@/components/common/StatCard'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Your money journal"
        title="A calm view of where your money goes"
        description="Once you import statements, this page will summarise spending, income and budgets for the selected period."
        actions={<PeriodBadge />}
      />

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total spending" icon={Receipt} value={null} hint={NO_DATA_HINT} accent="forest" />
        <StatCard label="Income" icon={Wallet} value={null} hint={NO_DATA_HINT} accent="sage" />
        <StatCard label="Net savings" icon={TrendingUp} value={null} hint={NO_DATA_HINT} accent="butter" />
        <StatCard label="Budget used" icon={Target} value={null} hint="Available once budgets are set" accent="terracotta" />
      </Reveal>

      <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Spending over time</CardTitle>
              <CardDescription>Daily spending for the selected period.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={[]}
              ariaLabel="Spending over time"
              emptyTitle="No spending data yet"
              emptyDescription="Your spending trend will be charted here after transactions are imported."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top categories</CardTitle>
              <CardDescription>Where most of your money went.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <EmptyState
              size="compact"
              icon={Receipt}
              title="No categories yet"
              description="Categories are assigned automatically once transactions exist."
              className="flex-1"
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
                    className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-paper/60 p-4 outline-none transition-colors hover:border-sage-deep hover:bg-sage/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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

