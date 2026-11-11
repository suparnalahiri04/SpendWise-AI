import { Loader2, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteSavingsGoal } from '@/lib/api/savingsGoals'
import { ApiError } from '@/lib/api/client'
import type { SavingsGoal } from '@/lib/api/types'

interface DeleteGoalDialogProps {
  goal: SavingsGoal | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function DeleteGoalDialog({
  goal,
  open,
  onOpenChange,
  onSuccess,
}: DeleteGoalDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen && submitting) return
    if (!newOpen) {
      setError(null)
      setSubmitting(false)
    }
    onOpenChange(newOpen)
  }

  async function handleDelete() {
    if (!goal || submitting) return
    setError(null)
    setSubmitting(true)

    try {
      await deleteSavingsGoal(goal.id)
      handleOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("We couldn't delete this goal. Please check your connection and try again.")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-5" />
            <DialogTitle className="text-lg font-semibold text-ink">Delete Savings Goal</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {goal ? (
              <>
                Are you sure you want to delete <span className="font-semibold text-ink">{goal.name}</span>?
                This will permanently remove the goal and all recorded contributions toward it.
              </>
            ) : (
              'Are you sure you want to delete this goal?'
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <TriangleAlert className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            className="bg-[#b4532f] hover:bg-[#9a4a33] text-white"
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete Goal'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

