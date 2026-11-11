import { Coins, Info, Loader2, Plus, TriangleAlert } from 'lucide-react'
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
import { addGoalContribution } from '@/lib/api/savingsGoals'
import { ApiError } from '@/lib/api/client'
import type { SavingsGoal } from '@/lib/api/types'
import { formatAmount } from '@/lib/format'

interface AddContributionDialogProps {
  goal: SavingsGoal | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface AddContributionFormProps {
  goal: SavingsGoal
  onCancel: () => void
  onSuccess: () => void
}

/** Returns today's calendar date as YYYY-MM-DD using the local timezone without UTC shift. */
export function getTodayDateString(refDate: Date = new Date()): string {
  const year = refDate.getFullYear()
  const month = String(refDate.getMonth() + 1).padStart(2, '0')
  const day = String(refDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function AddContributionForm({ goal, onCancel, onSuccess }: AddContributionFormProps) {
  const [amount, setAmount] = useState('')
  const [contributionDate, setContributionDate] = useState(() => getTodayDateString())
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const amountNum = Number(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError('Contribution amount must be greater than zero.')
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      await addGoalContribution(goal.id, {
        amount: amountNum,
        contribution_date: contributionDate || undefined,
        notes: notes.trim() || undefined,
      })

      onSuccess()
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("We couldn't record this contribution. Please try again.")
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

      <div className="flex items-start gap-2 rounded-lg bg-muted/60 border border-border/50 p-2.5 text-xs text-muted-foreground">
        <Info className="size-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Contributions are dedicated savings records for tracking this goal and do not alter your bank ledger transactions.
        </span>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contrib-amount-input" className="text-xs font-medium text-ink">
          Amount (₹) <span className="text-destructive">*</span>
        </label>
        <Input
          id="contrib-amount-input"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="e.g. 5000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={submitting}
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contrib-date-input" className="text-xs font-medium text-ink">
          Date <span className="text-destructive">*</span>
        </label>
        <Input
          id="contrib-date-input"
          type="date"
          value={contributionDate}
          onChange={(e) => setContributionDate(e.target.value)}
          disabled={submitting}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contrib-notes-input" className="text-xs font-medium text-ink">
          Notes <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Input
          id="contrib-notes-input"
          type="text"
          placeholder="e.g. Monthly allocation, Bonus deposit"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          maxLength={255}
        />
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
              Recording…
            </>
          ) : (
            <>
              <Plus className="mr-1.5 size-3.5" />
              Record Contribution
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

export function AddContributionDialog({
  goal,
  open,
  onOpenChange,
  onSuccess,
}: AddContributionDialogProps) {
  function handleSuccess() {
    onOpenChange(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Coins className="size-5" />
            <DialogTitle className="text-lg font-semibold text-ink">Record Savings</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {goal ? (
              <>
                Contributing toward <span className="font-medium text-ink">{goal.name}</span> (Remaining: ₹
                {formatAmount(goal.remaining_amount)})
              </>
            ) : (
              'Record a savings contribution toward your goal.'
            )}
          </DialogDescription>
        </DialogHeader>

        {goal && (
          <AddContributionForm
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
