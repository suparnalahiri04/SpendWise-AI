import { CalendarClock, Loader2, Plus, TriangleAlert } from 'lucide-react'
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
import { ApiError } from '@/lib/api/client'
import { createRecurringPayment } from '@/lib/api/recurring'
import {
  BUDGET_EXPENSE_CATEGORIES,
  RECURRING_FREQUENCIES,
  type RecurringFrequency,
} from '@/lib/api/types'
import { formatFrequency, getTodayDateString, validateRecurringForm } from './recurringUtils'

interface AddRecurringDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AddRecurringDialog({ open, onOpenChange, onSuccess }: AddRecurringDialogProps) {
  const today = getTodayDateString()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Bills/Utilities')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [startDate, setStartDate] = useState(today)
  const [nextDueDate, setNextDueDate] = useState(today)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setDescription('')
    setAmount('')
    setCategory('Bills/Utilities')
    setFrequency('monthly')
    setStartDate(today)
    setNextDueDate(today)
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

    const validationError = validateRecurringForm({
      description,
      amount,
      category,
      frequency,
      startDate,
      nextDueDate,
    })

    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      await createRecurringPayment({
        description: description.trim(),
        amount: Number(amount),
        category: category.trim(),
        frequency,
        start_date: startDate || today,
        next_due_date: nextDueDate || startDate || today,
      })

      resetForm()
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to create recurring payment schedule. Please try again.')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-lg bg-sage text-forest"
              aria-hidden="true"
            >
              <CalendarClock className="size-4" />
            </span>
            <DialogTitle>Add recurring payment</DialogTitle>
          </div>
          <DialogDescription>
            Schedule a recurring bill, subscription, or routine expense.
          </DialogDescription>
        </DialogHeader>

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
            <label htmlFor="recurring-description" className="text-xs font-semibold text-ink">
              Description <span className="text-destructive">*</span>
            </label>
            <Input
              id="recurring-description"
              placeholder="e.g. Netflix, Rent, Broadband"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="recurring-amount" className="text-xs font-semibold text-ink">
                Amount (₹) <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                  ₹
                </span>
                <Input
                  id="recurring-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-8"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="recurring-frequency" className="text-xs font-semibold text-ink">
                Frequency <span className="text-destructive">*</span>
              </label>
              <select
                id="recurring-frequency"
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
            <label htmlFor="recurring-category" className="text-xs font-semibold text-ink">
              Category <span className="text-destructive">*</span>
            </label>
            <select
              id="recurring-category"
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
              <label htmlFor="recurring-start-date" className="text-xs font-semibold text-ink">
                Start date
              </label>
              <Input
                id="recurring-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="recurring-due-date" className="text-xs font-semibold text-ink">
                Next due date <span className="text-destructive">*</span>
              </label>
              <Input
                id="recurring-due-date"
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
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
                <>
                  <Plus className="size-4" />
                  Schedule payment
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

