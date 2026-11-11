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
import { notifyFinancialMutation } from '@/features/alerts/alertEvents'
import { ApiError } from '@/lib/api/client'
import { updateRecurringPayment } from '@/lib/api/recurring'
import {
  BUDGET_EXPENSE_CATEGORIES,
  RECURRING_FREQUENCIES,
  type RecurringFrequency,
  type RecurringPayment,
  type RecurringStatus,
} from '@/lib/api/types'
import { formatFrequency, validateRecurringForm } from './recurringUtils'

interface EditRecurringDialogProps {
  payment: RecurringPayment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface EditRecurringFormProps {
  payment: RecurringPayment
  onCancel: () => void
  onSuccess: () => void
}

function EditRecurringForm({ payment, onCancel, onSuccess }: EditRecurringFormProps) {
  const [description, setDescription] = useState(payment.description)
  const [amount, setAmount] = useState(String(payment.amount))
  const [category, setCategory] = useState(payment.category)
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    payment.frequency as RecurringFrequency,
  )
  const [nextDueDate, setNextDueDate] = useState(payment.next_due_date)
  const [status, setStatus] = useState<RecurringStatus>(payment.status as RecurringStatus)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const validationError = validateRecurringForm({
      description,
      amount,
      category,
      frequency,
      nextDueDate,
    })

    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      await updateRecurringPayment(payment.id, {
        description: description.trim(),
        amount: Number(amount),
        category: category.trim(),
        frequency,
        next_due_date: nextDueDate,
        status,
      })

      notifyFinancialMutation('recurring:updated')
      setSubmitting(false)
      onSuccess()
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to update recurring payment. Please try again.')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive-foreground sm:text-sm"
        >
          <TriangleAlert className="size-4 shrink-0 text-destructive mt-0.5" aria-hidden="true" />
          <span className="text-destructive font-medium">{error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="edit-recurring-description" className="text-xs font-semibold text-ink">
          Description <span className="text-destructive">*</span>
        </label>
        <Input
          id="edit-recurring-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="edit-recurring-amount" className="text-xs font-semibold text-ink">
            Amount (₹) <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
              ₹
            </span>
            <Input
              id="edit-recurring-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-8"
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-recurring-frequency" className="text-xs font-semibold text-ink">
            Frequency <span className="text-destructive">*</span>
          </label>
          <select
            id="edit-recurring-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            required
          >
            {RECURRING_FREQUENCIES.map((freq) => (
              <option key={freq} value={freq}>
                {formatFrequency(freq)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="edit-recurring-category" className="text-xs font-semibold text-ink">
          Category <span className="text-destructive">*</span>
        </label>
        <select
          id="edit-recurring-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          required
        >
          {BUDGET_EXPENSE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="edit-recurring-due-date" className="text-xs font-semibold text-ink">
            Next due date <span className="text-destructive">*</span>
          </label>
          <Input
            id="edit-recurring-due-date"
            type="date"
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-recurring-status" className="text-xs font-semibold text-ink">
            Status
          </label>
          <select
            id="edit-recurring-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as RecurringStatus)}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            required
          >
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </form>
  )
}

export function EditRecurringDialog({
  payment,
  open,
  onOpenChange,
  onSuccess,
}: EditRecurringDialogProps) {
  if (!payment) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-lg bg-butter/60 text-ink"
              aria-hidden="true"
            >
              <Pencil className="size-4" />
            </span>
            <DialogTitle>Edit recurring payment</DialogTitle>
          </div>
          <DialogDescription>
            Update schedule details for <strong className="text-ink">{payment.description}</strong>.
          </DialogDescription>
        </DialogHeader>

        <EditRecurringForm
          key={payment.id}
          payment={payment}
          onCancel={() => onOpenChange(false)}
          onSuccess={() => {
            onOpenChange(false)
            onSuccess()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

