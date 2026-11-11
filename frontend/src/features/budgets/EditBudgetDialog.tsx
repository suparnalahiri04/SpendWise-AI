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
import { updateBudget } from '@/lib/api/budgets'
import { ApiError } from '@/lib/api/client'
import { BUDGET_EXPENSE_CATEGORIES, type BudgetProgressItem } from '@/lib/api/types'
import { formatMonthLabel, validateBudgetForm } from './budgetUtils'

interface EditBudgetDialogProps {
  budget: BudgetProgressItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface EditBudgetFormProps {
  budget: BudgetProgressItem
  onCancel: () => void
  onSuccess: () => void
}

function EditBudgetForm({ budget, onCancel, onSuccess }: EditBudgetFormProps) {
  const [category, setCategory] = useState(budget.category)
  const [limitAmount, setLimitAmount] = useState(String(budget.limit_amount))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const validationError = validateBudgetForm({
      category,
      limit_amount: limitAmount,
      month: budget.month,
    })

    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      await updateBudget(budget.id, {
        category: category.trim(),
        month: budget.month,
        limit_amount: Number(limitAmount),
      })

      notifyFinancialMutation('budget:updated')
      setSubmitting(false)
      onSuccess()
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to update budget. Please try again.')
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
        <label htmlFor="edit-budget-category" className="text-xs font-semibold text-ink">
          Category
        </label>
        <select
          id="edit-budget-category"
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

      <div className="space-y-1.5">
        <label htmlFor="edit-budget-amount" className="text-xs font-semibold text-ink">
          Monthly limit (₹) <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
            ₹
          </span>
          <Input
            id="edit-budget-amount"
            type="number"
            step="0.01"
            min="0.01"
            value={limitAmount}
            onChange={(e) => setLimitAmount(e.target.value)}
            className="pl-8"
            required
          />
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

export function EditBudgetDialog({
  budget,
  open,
  onOpenChange,
  onSuccess,
}: EditBudgetDialogProps) {
  if (!budget) return null

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
            <DialogTitle>Edit budget</DialogTitle>
          </div>
          <DialogDescription>
            Update monthly limit for <strong className="text-ink">{budget.category}</strong> in{' '}
            {formatMonthLabel(budget.month)}.
          </DialogDescription>
        </DialogHeader>

        <EditBudgetForm
          key={budget.id}
          budget={budget}
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
