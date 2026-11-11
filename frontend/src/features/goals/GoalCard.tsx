import { History, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { SavingsGoal } from '@/lib/api/types'
import { formatAmount } from '@/lib/format'

interface GoalCardProps {
  goal: SavingsGoal
  onAddContribution: (goal: SavingsGoal) => void
  onViewHistory: (goal: SavingsGoal) => void
  onEdit: (goal: SavingsGoal) => void
  onDelete: (goal: SavingsGoal) => void
}

export function GoalCard({
  goal,
  onAddContribution,
  onViewHistory,
  onEdit,
  onDelete,
}: GoalCardProps) {
  const targetNum = typeof goal.target_amount === 'number'
    ? goal.target_amount
    : Number(goal.target_amount) || 0
  const contributedNum = typeof goal.total_contributed === 'number'
    ? goal.total_contributed
    : Number(goal.total_contributed) || 0
  const remainingNum = typeof goal.remaining_amount === 'number'
    ? goal.remaining_amount
    : Number(goal.remaining_amount) || 0

  const progress = Math.min(100, Math.max(0, goal.progress_pct || 0))

  // Determine badge tone and label
  let badgeTone: 'neutral' | 'sage' | 'butter' | 'terracotta' | 'outline' | 'lime' = 'neutral'
  let badgeLabel = 'In Progress'

  if (goal.status === 'completed' || goal.is_completed) {
    badgeTone = 'lime'
    badgeLabel = 'Completed'
  } else if (goal.status === 'archived') {
    badgeTone = 'neutral'
    badgeLabel = 'Archived'
  } else if (goal.target_date) {
    if (goal.days_remaining !== null && goal.days_remaining < 0) {
      badgeTone = 'terracotta'
      badgeLabel = 'Overdue'
    } else if (goal.is_on_track === true) {
      badgeTone = 'sage'
      badgeLabel = 'On Track'
    } else if (goal.is_on_track === false) {
      badgeTone = 'butter'
      badgeLabel = 'Behind Pace'
    }
  }

  // Bar gradient
  const barColor =
    goal.status === 'completed' || goal.is_completed
      ? 'bg-gradient-to-r from-forest via-emerald-deep to-lime'
      : badgeTone === 'terracotta'
        ? 'bg-gradient-to-r from-terracotta to-destructive'
        : badgeTone === 'butter'
          ? 'bg-gradient-to-r from-[#c98e1f] to-[#e0a133]'
          : 'bg-gradient-to-r from-forest to-emerald-deep'

  return (
    <Card className="p-5 flex flex-col justify-between gap-4 transition-all duration-200 hover:shadow-card hover:border-border/90 motion-reduce:transition-none">
      <div>
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Target className="size-4" />
              </div>
              <h4 className="text-base font-semibold text-ink truncate" title={goal.name}>
                {goal.name}
              </h4>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Target: <span className="font-medium text-ink">₹{formatAmount(targetNum)}</span>
              {goal.target_date && (
                <>
                  {' '}• Due <span className="font-medium text-ink">{goal.target_date}</span>
                  {goal.days_remaining !== null && (
                    <span className="ml-1 text-[11px]">
                      ({goal.days_remaining >= 0 ? `${goal.days_remaining}d left` : `${Math.abs(goal.days_remaining)}d overdue`})
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Badge tone={badgeTone}>{badgeLabel}</Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground hover:text-ink"
              aria-label={`Edit ${goal.name}`}
              onClick={() => onEdit(goal)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${goal.name}`}
              onClick={() => onDelete(goal)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Progress Bar & Percent */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-ink">Progress</span>
            <span className="font-semibold text-ink">{goal.progress_pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all duration-300 rounded-full ${barColor}`}
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${goal.name} savings progress`}
            />
          </div>
        </div>

        {/* Amount Breakdown */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-2.5 text-xs">
          <div>
            <span className="text-muted-foreground">Saved</span>
            <p className="font-semibold text-forest text-sm">₹{formatAmount(contributedNum)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Remaining</span>
            <p className="font-semibold text-ink text-sm">₹{formatAmount(remainingNum)}</p>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs text-muted-foreground hover:text-ink flex items-center gap-1"
          onClick={() => onViewHistory(goal)}
          aria-label={`View contribution history for ${goal.name}`}
        >
          <History className="size-3.5" />
          <span>History</span>
        </Button>

        {goal.status !== 'archived' && (
          <Button
            type="button"
            size="sm"
            className="text-xs flex items-center gap-1"
            onClick={() => onAddContribution(goal)}
            aria-label={`Add savings to ${goal.name}`}
          >
            <Plus className="size-3.5" />
            <span>Add Savings</span>
          </Button>
        )}
      </div>
    </Card>
  )
}

