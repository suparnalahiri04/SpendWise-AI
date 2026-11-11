import { Loader2, Plus, Target, TriangleAlert } from 'lucide-react'
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
import { createSavingsGoal } from '@/lib/api/savingsGoals'
import { ApiError } from '@/lib/api/client'

interface AddGoalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AddGoalDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddGoalDialogProps) {
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setTargetAmount('')
    setTargetDate('')
    setError(null)
    setSubmitting(false)
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen && submitting) return
    if (!newOpen) {
      resetForm()
    }
    onOpenChange(newOpen)
  }

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
      await createSavingsGoal({
        name: trimmedName,
        target_amount: amountNum,
        target_date: targetDate ? targetDate : null,
      })

      resetForm()
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("We couldn't save this goal. Please check your connection and try again.")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Target className="size-5" />
            <DialogTitle className="text-lg font-semibold text-ink">New Savings Goal</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Set a target amount and optional target date to stay motivated and track your savings.
          </DialogDescription>
        </DialogHeader>

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
            <label htmlFor="goal-name-input" className="text-xs font-medium text-ink">
              Goal Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="goal-name-input"
              type="text"
              placeholder="e.g. Emergency Fund, New Laptop, Vacation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="goal-amount-input" className="text-xs font-medium text-ink">
              Target Amount (₹) <span className="text-destructive">*</span>
            </label>
            <Input
              id="goal-amount-input"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="50000"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="goal-date-input" className="text-xs font-medium text-ink">
              Target Date <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              id="goal-date-input"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
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
                <>
                  <Plus className="mr-1.5 size-3.5" />
                  Create Goal
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

