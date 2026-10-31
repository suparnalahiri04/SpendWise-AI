import { AlertTriangle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api/client'
import { cancelRecurringPayment } from '@/lib/api/recurring'
import type { RecurringPayment } from '@/lib/api/types'

interface CancelRecurringDialogProps {
  payment: RecurringPayment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CancelRecurringDialog({
  payment,
  open,
  onOpenChange,
  onSuccess,
}: CancelRecurringDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!payment) return null

  async function handleCancel() {
    if (!payment || submitting) return
    setError(null)
    setSubmitting(true)

    try {
      await cancelRecurringPayment(payment.id)
      setSubmitting(false)
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to cancel recurring payment. Please try again.')
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
              <AlertTriangle className="size-4" />
            </span>
            <DialogTitle>Cancel recurring payment</DialogTitle>
          </div>
          <DialogDescription>
            Are you sure you want to cancel the schedule for{' '}
            <strong className="text-ink">{payment.description}</strong>?
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive-foreground sm:text-sm"
          >
            <AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" aria-hidden="true" />
            <span className="text-destructive font-medium">{error}</span>
          </div>
        )}

        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          Cancelling will stop future reminders and remove this payment from your upcoming commitments.
          Its record will be kept under cancelled schedules for your reference.
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Keep schedule
          </Button>
          <Button
            type="button"
            variant="default"
            className="bg-[#b4532f] hover:bg-[#9a4a33] text-white"
            disabled={submitting}
            onClick={handleCancel}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Cancelling…
              </>
            ) : (
              'Cancel schedule'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

