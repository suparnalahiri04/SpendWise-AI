import { Clock, History, Loader2, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteGoalContribution, fetchGoalContributions } from '@/lib/api/savingsGoals'
import { ApiError } from '@/lib/api/client'
import type { GoalContribution, SavingsGoal } from '@/lib/api/types'
import { formatAmount } from '@/lib/format'

interface ContributionHistoryDialogProps {
  goal: SavingsGoal | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface ContributionHistoryContentProps {
  goal: SavingsGoal
  onClose: () => void
  onSuccess: () => void
}

function ContributionHistoryContent({ goal, onClose, onSuccess }: ContributionHistoryContentProps) {
  const [contributions, setContributions] = useState<GoalContribution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    let ignore = false
    fetchGoalContributions(goal.id)
      .then((data) => {
        if (!ignore) {
          setContributions(data)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof ApiError ? err.message : 'Failed to load contributions. Please try again.')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [goal.id])

  async function handleDelete(contribId: number) {
    if (deletingId !== null) return
    setDeletingId(contribId)
    try {
      await deleteGoalContribution(goal.id, contribId)
      setContributions((prev) => prev.filter((c) => c.id !== contribId))
      onSuccess()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to delete contribution.')
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <TriangleAlert className="size-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-6 animate-spin mb-2" />
            <p className="text-xs">Loading contribution history…</p>
          </div>
        ) : contributions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="size-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-ink">No savings recorded yet</p>
            <p className="text-xs mt-1">Record contributions using the &quot;Add Savings&quot; button.</p>
          </div>
        ) : (
          contributions.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3 text-xs transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-forest text-sm">
                    +₹{formatAmount(c.amount)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {c.contribution_date}
                  </span>
                </div>
                {c.notes && (
                  <p className="mt-0.5 text-muted-foreground truncate" title={c.notes}>
                    {c.notes}
                  </p>
                )}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                disabled={deletingId === c.id}
                onClick={() => handleDelete(c.id)}
                aria-label={`Delete contribution of ₹${formatAmount(c.amount)} on ${c.contribution_date}`}
              >
                {deletingId === c.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  )
}

export function ContributionHistoryDialog({
  goal,
  open,
  onOpenChange,
  onSuccess,
}: ContributionHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <History className="size-5" />
            <DialogTitle className="text-lg font-semibold text-ink">Contribution History</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {goal ? (
              <>
                Savings entries recorded for <span className="font-medium text-ink">{goal.name}</span>
              </>
            ) : (
              'All recorded contributions toward this goal.'
            )}
          </DialogDescription>
        </DialogHeader>

        {goal && (
          <ContributionHistoryContent
            key={goal.id}
            goal={goal}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
