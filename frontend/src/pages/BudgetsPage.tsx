import { PiggyBank, Target, Wallet } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { PeriodBadge } from '@/components/common/PeriodBadge'
import { StatCard } from '@/components/common/StatCard'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const NO_BUDGET_HINT = 'No budgets have been set'

export function BudgetsPage() {
  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Budgets"
        title="Spend with intention"
        description="Set monthly limits per category and track your progress against them. Budget creation will be added in a later stage."
        actions={<PeriodBadge />}
      />

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total budgeted" icon={Wallet} value={null} hint={NO_BUDGET_HINT} accent="forest" />
        <StatCard label="Spent so far" icon={Target} value={null} hint={NO_BUDGET_HINT} accent="butter" />
        <StatCard label="Remaining" icon={PiggyBank} value={null} hint={NO_BUDGET_HINT} accent="sage" />
      </Reveal>

      <Reveal>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Category budgets</CardTitle>
              <CardDescription>Progress for each category you choose to budget.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={PiggyBank}
              title="No budgets yet"
              description="Once budgets can be created, each category will show its limit, amount spent and what is left."
            />
          </CardContent>
        </Card>
      </Reveal>
    </AnimatedPage>
  )
}

