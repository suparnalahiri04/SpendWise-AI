import { Loader2, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteBudget } from '@/lib/api/budgets'
import { ApiError } from '@/lib/api/client'
import type { BudgetProgressItem } from '@/lib/api/types'
import { formatMonthLabel } from './budgetUtils'

interface DeleteBudgetDialogProps {
  budget: BudgetProgressItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function DeleteBudgetDialog({
  budget,
  open,
  onOpenChange,
  onSuccess,
}: DeleteBudgetDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!budget) return null

  async function handleDelete() {
    if (!budget || submitting) return
    setError(null)
    setSubmitting(true)

    try {
      await deleteBudget(budget.id)
      setSubmitting(false)
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to delete budget. Please try again.')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-lg bg-terracotta/20 text-[#9a4a33]"
              aria-hidden="true"
            >
              <Trash2 className="size-4" />
            </span>
            <DialogTitle>Delete budget</DialogTitle>
          </div>
          <DialogDescription>
            Are you sure you want to delete your monthly budget for{' '}
            <strong className="text-ink">{budget.category}</strong> in{' '}
            {formatMonthLabel(budget.month)}?
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive-foreground sm:text-sm"
          >
            <TriangleAlert className="size-4 shrink-0 text-destructive mt-0.5" aria-hidden="true" />
            <span className="text-destructive font-medium">{error}</span>
          </div>
        )}

        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          This will remove the spending target for this category. Your recorded transactions and
          journal history will remain completely untouched.
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            className="bg-[#b4532f] hover:bg-[#9a4a33] text-white"
            disabled={submitting}
            onClick={handleDelete}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete budget'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

