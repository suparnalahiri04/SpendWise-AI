import {
  AlertCircle,
  Coins,
  Loader2,
  PiggyBank,
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { StatCard } from '@/components/common/StatCard'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AddContributionDialog } from '@/features/goals/AddContributionDialog'
import { AddGoalDialog } from '@/features/goals/AddGoalDialog'
import { ContributionHistoryDialog } from '@/features/goals/ContributionHistoryDialog'
import { DeleteGoalDialog } from '@/features/goals/DeleteGoalDialog'
import { EditGoalDialog } from '@/features/goals/EditGoalDialog'
import { GoalCard } from '@/features/goals/GoalCard'
import { useSavingsGoals, type GoalFilterTab } from '@/features/goals/useSavingsGoals'
import type { SavingsGoal } from '@/lib/api/types'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

export function GoalsPage() {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)
  const [contributingGoal, setContributingGoal] = useState<SavingsGoal | null>(null)
  const [historyGoal, setHistoryGoal] = useState<SavingsGoal | null>(null)
  const [deletingGoal, setDeletingGoal] = useState<SavingsGoal | null>(null)

  const {
    status,
    goals,
    filteredGoals,
    summary,
    error,
    statusFilter,
    setStatusFilter,
    reload,
  } = useSavingsGoals()

  // Calculate StatCard metrics
  let targetValue: string | null = null
  let savedValue: string | null = null
  let remainingValue: string | null = null
  let progressValue: string | null = null

  let targetHint = 'Planned targets'
  let savedHint = 'Accumulated contributions'
  let remainingHint = 'To reach targets'
  let progressHint = 'Active goals'

  if (status === 'loading') {
    targetHint = 'Loading targets…'
    savedHint = 'Loading savings…'
    remainingHint = 'Loading remainder…'
    progressHint = 'Calculating…'
  } else if (status === 'error') {
    targetHint = 'Unable to load targets'
    savedHint = 'Unable to load savings'
    remainingHint = 'Unable to load remainder'
    progressHint = 'Unable to calculate'
  } else if (status === 'success' && summary) {
    targetValue = `₹${formatAmount(summary.total_target_amount)}`
    savedValue = `₹${formatAmount(summary.total_saved_amount)}`
    remainingValue = `₹${formatAmount(summary.total_remaining_amount)}`
    progressValue = `${summary.overall_progress_pct}%`

    targetHint = `${summary.goals_count} active ${summary.goals_count === 1 ? 'goal' : 'goals'}`
    savedHint = `${summary.completed_goals_count} completed`
    remainingHint = 'Remaining across active goals'
    progressHint = 'Overall completion rate'
  }

  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Savings"
        title="Goals & Milestones"
        description="Set targets, track contributions, and watch your savings grow over time."
        actions={
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => setIsAddOpen(true)}
            aria-label="Create new savings goal"
          >
            <Plus className="size-4" />
            New Goal
          </Button>
        }
      />

      {/* Summary Stat Cards */}
      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total target"
          icon={Target}
          value={targetValue}
          hint={targetHint}
          accent="forest"
        />
        <StatCard
          label="Total saved"
          icon={PiggyBank}
          value={savedValue}
          hint={savedHint}
          accent="emerald"
        />
        <StatCard
          label="Remaining"
          icon={Coins}
          value={remainingValue}
          hint={remainingHint}
          accent="butter"
        />
        <StatCard
          label="Overall progress"
          icon={TrendingUp}
          value={progressValue}
          hint={progressHint}
          accent="sage"
        />
      </Reveal>

      {/* Filter Tabs */}
      <Reveal className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter goals by status">
            {(
              [
                { id: 'all', label: 'All Goals' },
                { id: 'in_progress', label: 'In Progress' },
                { id: 'completed', label: 'Completed' },
                { id: 'archived', label: 'Archived' },
              ] as const
            ).map((tab) => (
              <Button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.id}
                variant={statusFilter === tab.id ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'rounded-lg text-xs font-medium',
                  statusFilter === tab.id && 'shadow-xs',
                )}
                onClick={() => setStatusFilter(tab.id as GoalFilterTab)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
      </Reveal>

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
          <p className="text-sm font-medium text-ink">Loading savings goals…</p>
          <p className="text-xs text-muted-foreground mt-1">Retrieving your targets and progress</p>
        </Reveal>
      )}

      {/* Empty State */}
      {status === 'success' && filteredGoals.length === 0 && (
        <Reveal className="mt-6">
          {goals.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No savings goals yet"
              description="Set a target for an emergency fund, travel, or a major purchase to start tracking your progress."
              action={
                <Button
                  type="button"
                  onClick={() => setIsAddOpen(true)}
                  aria-label="Create your first goal"
                >
                  Create your first goal
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Target}
              title="No matching goals"
              description="There are no savings goals matching the selected filter."
            />
          )}
        </Reveal>
      )}

      {/* Goals Grid */}
      {status === 'success' && filteredGoals.length > 0 && (
        <Reveal className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onAddContribution={setContributingGoal}
                onViewHistory={setHistoryGoal}
                onEdit={setEditingGoal}
                onDelete={setDeletingGoal}
              />
            ))}
          </div>
        </Reveal>
      )}

      {/* Dialogs */}
      <AddGoalDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onSuccess={reload}
      />

      <EditGoalDialog
        goal={editingGoal}
        open={Boolean(editingGoal)}
        onOpenChange={(open) => !open && setEditingGoal(null)}
        onSuccess={reload}
      />

      <AddContributionDialog
        goal={contributingGoal}
        open={Boolean(contributingGoal)}
        onOpenChange={(open) => !open && setContributingGoal(null)}
        onSuccess={reload}
      />

      <ContributionHistoryDialog
        goal={historyGoal}
        open={Boolean(historyGoal)}
        onOpenChange={(open) => !open && setHistoryGoal(null)}
        onSuccess={reload}
      />

      <DeleteGoalDialog
        goal={deletingGoal}
        open={Boolean(deletingGoal)}
        onOpenChange={(open) => !open && setDeletingGoal(null)}
        onSuccess={reload}
      />
    </AnimatedPage>
  )
}

