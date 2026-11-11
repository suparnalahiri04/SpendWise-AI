import { Loader2, Plus, Sparkles, TriangleAlert } from 'lucide-react'
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
import { createBudget } from '@/lib/api/budgets'
import { ApiError } from '@/lib/api/client'
import { BUDGET_EXPENSE_CATEGORIES } from '@/lib/api/types'
import { formatMonthLabel, validateBudgetForm } from './budgetUtils'

interface SetBudgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: string
  existingCategories?: string[]
  onSuccess: () => void
}

export function SetBudgetDialog({
  open,
  onOpenChange,
  month,
  existingCategories = [],
  onSuccess,
}: SetBudgetDialogProps) {
  const [category, setCategory] = useState<string>('')
  const [limitAmount, setLimitAmount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setCategory('')
    setLimitAmount('')
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

    const validationError = validateBudgetForm({
      category,
      limit_amount: limitAmount,
      month,
    })

    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      await createBudget({
        category: category.trim(),
        month,
        limit_amount: Number(limitAmount),
      })

      notifyFinancialMutation('budget:created')
      resetForm()
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to create budget. Please try again.')
      }
    }
  }

  const normalizedExisting = existingCategories.map((c) => c.trim().toLowerCase())

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-lg bg-sage text-forest"
              aria-hidden="true"
            >
              <Sparkles className="size-4" />
            </span>
            <DialogTitle>Set monthly budget</DialogTitle>
          </div>
          <DialogDescription>
            Choose a spending category and monthly limit for{' '}
            <strong className="text-ink">{formatMonthLabel(month)}</strong>.
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
            <label htmlFor="budget-category" className="text-xs font-semibold text-ink">
              Category <span className="text-destructive">*</span>
            </label>
            <select
              id="budget-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            >
              <option value="" disabled>
                Select an expense category
              </option>
              {BUDGET_EXPENSE_CATEGORIES.map((cat) => {
                const alreadyExists = normalizedExisting.includes(cat.toLowerCase())
                return (
                  <option key={cat} value={cat}>
                    {cat} {alreadyExists ? '(Already budgeted)' : ''}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="budget-amount" className="text-xs font-semibold text-ink">
              Monthly limit (₹) <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                ₹
              </span>
              <Input
                id="budget-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={limitAmount}
                onChange={(e) => setLimitAmount(e.target.value)}
                className="pl-8"
                required
              />
            </div>
            <p className="text-[0.75rem] text-muted-foreground">
              Maximum total expense planned for this category during the month.
            </p>
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
                  Set budget
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

