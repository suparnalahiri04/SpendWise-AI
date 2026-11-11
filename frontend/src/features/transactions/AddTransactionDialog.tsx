import { ArrowDownRight, ArrowUpRight, CheckCircle2, Loader2, Sparkles, TriangleAlert } from 'lucide-react'
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
import { createTransaction } from '@/lib/api/transactions'
import {
  TRANSACTION_CATEGORIES,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
} from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { getTodayDateString, validateTransactionForm } from './validation'

interface AddTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (transaction: Transaction) => void
}

export function AddTransactionDialog({ open, onOpenChange, onSuccess }: AddTransactionDialogProps) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [transactionDate, setTransactionDate] = useState(getTodayDateString())
  const [transactionType, setTransactionType] = useState<TransactionType>('expense')
  const [category, setCategory] = useState<string>('') // empty string = Auto-categorize (ML)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  function resetForm() {
    setDescription('')
    setAmount('')
    setTransactionDate(getTodayDateString())
    setTransactionType('expense')
    setCategory('')
    setError(null)
    setSuccessMessage(null)
    setSubmitting(false)
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen && submitting) return // Prevent closing while request in flight
    if (!newOpen) {
      resetForm()
    }
    onOpenChange(newOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const validationError = validateTransactionForm({
      description,
      amount,
      transactionDate,
    })

    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      const created = await createTransaction({
        description: description.trim(),
        amount: Number(amount),
        transaction_date: transactionDate,
        transaction_type: transactionType,
        category: category.trim() ? category : null,
      })

      notifyFinancialMutation('transaction:created')
      setSubmitting(false)
      onSuccess(created)
      resetForm()
      onOpenChange(false)
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
      } else {
        setError('Failed to record transaction. Please check your connection and try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open && (
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Transaction</DialogTitle>
            <DialogDescription>
              Add an entry to your money journal. Leave category blank to let the ML model suggest one.
            </DialogDescription>
          </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="mt-5 flex flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-terracotta/40 bg-terracotta/10 px-3.5 py-3 text-sm text-[#8a3f29]"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="flex items-center gap-2.5 rounded-xl border border-forest/30 bg-sage/40 px-3.5 py-3 text-sm font-medium text-forest"
            >
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Type Toggle (Segmented control) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Transaction Type
            </span>
            <div
              role="radiogroup"
              aria-label="Transaction Type"
              className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-paper p-1"
            >
              <button
                type="button"
                role="radio"
                aria-checked={transactionType === 'expense'}
                disabled={submitting}
                onClick={() => setTransactionType('expense')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all outline-none',
                  transactionType === 'expense'
                    ? 'bg-card text-ink shadow-sm'
                    : 'text-muted-foreground hover:text-ink',
                )}
              >
                <ArrowDownRight className="size-4 text-[#9a4a33]" aria-hidden="true" />
                <span>Expense</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={transactionType === 'income'}
                disabled={submitting}
                onClick={() => setTransactionType('income')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all outline-none',
                  transactionType === 'income'
                    ? 'bg-card text-forest font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-ink',
                )}
              >
                <ArrowUpRight className="size-4 text-forest" aria-hidden="true" />
                <span>Income</span>
              </button>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tx-description" className="text-sm font-medium text-ink">
              Description <span className="text-terracotta">*</span>
            </label>
            <Input
              id="tx-description"
              name="description"
              placeholder="e.g. Starbucks coffee, Monthly rent, Grocery store"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          {/* Amount & Date Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tx-amount" className="text-sm font-medium text-ink">
                Amount (₹) <span className="text-terracotta">*</span>
              </label>
              <Input
                id="tx-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tx-date" className="text-sm font-medium text-ink">
                Date <span className="text-terracotta">*</span>
              </label>
              <Input
                id="tx-date"
                name="transactionDate"
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
          </div>

          {/* Category selection */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="tx-category" className="text-sm font-medium text-ink">
                Category
              </label>
              {!category && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-forest-soft">
                  <Sparkles className="size-3 text-butter" aria-hidden="true" />
                  ML Auto-categorize enabled
                </span>
              )}
            </div>

            <select
              id="tx-category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={submitting}
              className={cn(
                'h-11 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors',
                'focus-visible:border-forest focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              <option value="">✨ Auto-categorize with AI (Recommended)</option>
              {TRANSACTION_CATEGORIES.map((cat: TransactionCategory) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              {category
                ? 'Manual category selected. Will be saved as reviewed.'
                : 'SpendWise AI will classify the expense and flag low-confidence entries for your review.'}
            </p>
          </div>

          {/* Form Actions */}
          <div className="mt-3 flex items-center justify-end gap-3 pt-2 border-t border-border">
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
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Saving entry…</span>
                </>
              ) : (
                <span>Save Transaction</span>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
      )}
    </Dialog>
  )
}
