import { Loader2, Pencil, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { updateSavingsGoal } from '@/lib/api/savingsGoals'
import { ApiError } from '@/lib/api/client'
import type { GoalStatus, SavingsGoal } from '@/lib/api/types'

interface EditGoalDialogProps {
  goal: SavingsGoal | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface EditGoalFormProps {
  goal: SavingsGoal
  onCancel: () => void
  onSuccess: () => void
}

function EditGoalForm({ goal, onCancel, onSuccess }: EditGoalFormProps) {
  const [name, setName] = useState(goal.name)
  const [targetAmount, setTargetAmount] = useState(String(goal.target_amount))
  const [targetDate, setTargetDate] = useState(goal.target_date || '')
  const [status, setStatus] = useState<GoalStatus>(goal.status)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Please provide a goal name.')
      return
    }

    const amountNum = Number(targetAmount)
    if (!targetAmount || isNaN(amountNum) || amountNum <= 0) {
      setError('Target amount must be greater than zero.')
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      await updateSavingsGoal(goal.id, {
        name: trimmedName,
        target_amount: amountNum,
        target_date: targetDate ? targetDate : null,
        status,
      })

      onSuccess()
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("We couldn't update this goal. Please check your connection and try again.")
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <TriangleAlert className="size-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="edit-goal-name" className="text-xs font-medium text-ink">
          Goal Name <span className="text-destructive">*</span>
        </label>
        <Input
          id="edit-goal-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          maxLength={100}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="edit-goal-amount" className="text-xs font-medium text-ink">
          Target Amount (₹) <span className="text-destructive">*</span>
        </label>
        <Input
          id="edit-goal-amount"
          type="number"
          step="0.01"
          min="0.01"
          value={targetAmount}
          onChange={(e) => setTargetAmount(e.target.value)}
          disabled={submitting}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="edit-goal-date" className="text-xs font-medium text-ink">
          Target Date <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Input
          id="edit-goal-date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="edit-goal-status" className="text-xs font-medium text-ink">
          Goal Status
        </label>
        <select
          id="edit-goal-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as GoalStatus)}
          disabled={submitting}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </form>
  )
}

export function EditGoalDialog({
  goal,
  open,
  onOpenChange,
  onSuccess,
}: EditGoalDialogProps) {
  function handleSuccess() {
    onOpenChange(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Pencil className="size-5" />
            <DialogTitle className="text-lg font-semibold text-ink">Edit Goal</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Update your target amount, completion timeline, or archive the goal.
          </DialogDescription>
        </DialogHeader>

        {goal && (
          <EditGoalForm
            key={goal.id}
            goal={goal}
            onCancel={() => onOpenChange(false)}
            onSuccess={handleSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
