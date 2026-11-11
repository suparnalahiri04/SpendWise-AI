import { ArrowDownRight, ArrowUpRight, Loader2, Sparkles, TriangleAlert } from 'lucide-react'
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
import { updateTransaction } from '@/lib/api/transactions'
import { formatConfidenceLabel } from '@/lib/format'
import {
  TRANSACTION_CATEGORIES,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
} from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { validateTransactionForm } from './validation'

interface EditTransactionDialogProps {
  transaction: Transaction | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (transaction: Transaction) => void
}

interface EditTransactionFormProps {
  transaction: Transaction
  onCancel: () => void
  onSuccess: (transaction: Transaction) => void
}

function EditTransactionForm({ transaction, onCancel, onSuccess }: EditTransactionFormProps) {
  const [description, setDescription] = useState(transaction.description)
  const [amount, setAmount] = useState(transaction.amount)
  const [transactionDate, setTransactionDate] = useState(transaction.transaction_date)
  const [transactionType, setTransactionType] = useState<TransactionType>(
    transaction.transaction_type === 'income' ? 'income' : 'expense',
  )
  const [category, setCategory] = useState<string>(transaction.category || '')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    if (!category.trim()) {
      setError('Please select a category.')
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      const updated = await updateTransaction(transaction.id, {
        description: description.trim(),
        amount: Number(amount),
        transaction_date: transactionDate,
        transaction_type: transactionType,
        category: category.trim(),
      })

      notifyFinancialMutation('transaction:updated')
      setSubmitting(false)
      onSuccess(updated)
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
      } else {
        setError('Failed to update transaction. Please check your connection and try again.')
      }
      setSubmitting(false)
    }
  }

  return (
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

      {/* AI Context Banner if predicted/unreviewed */}
      {transaction.predicted_category && (() => {
        const confidenceLabel = formatConfidenceLabel(transaction.prediction_confidence)
        return (
          <div className="flex items-center gap-2 rounded-xl border border-butter/60 bg-butter/20 px-3.5 py-2.5 text-xs text-ink/80">
            <Sparkles className="size-4 shrink-0 text-butter" aria-hidden="true" />
            <span>
              Originally classified by AI as{' '}
              <strong className="font-semibold text-ink">{transaction.predicted_category}</strong>
              {confidenceLabel && ` (${confidenceLabel} confidence)`}
              . Saving your edit will mark it as reviewed.
            </span>
          </div>
        )
      })()}

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
        <label htmlFor="edit-tx-description" className="text-sm font-medium text-ink">
          Description <span className="text-terracotta">*</span>
        </label>
        <Input
          id="edit-tx-description"
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
          <label htmlFor="edit-tx-amount" className="text-sm font-medium text-ink">
            Amount (₹) <span className="text-terracotta">*</span>
          </label>
          <Input
            id="edit-tx-amount"
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
          <label htmlFor="edit-tx-date" className="text-sm font-medium text-ink">
            Date <span className="text-terracotta">*</span>
          </label>
          <Input
            id="edit-tx-date"
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
        <label htmlFor="edit-tx-category" className="text-sm font-medium text-ink">
          Category <span className="text-terracotta">*</span>
        </label>

        <select
          id="edit-tx-category"
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={submitting}
          required
          className={cn(
            'h-11 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors',
            'focus-visible:border-forest focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <option value="" disabled>Select category</option>
          {TRANSACTION_CATEGORIES.map((cat: TransactionCategory) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
          {/* Fallback if transaction already has an atypical category not in the main list */}
          {category &&
            !TRANSACTION_CATEGORIES.includes(category as TransactionCategory) && (
              <option value={category}>{category}</option>
            )}
        </select>
        <p className="text-[11px] text-muted-foreground">
          Saving will assign this category and mark the transaction as reviewed.
        </p>
      </div>

      {/* Form Actions */}
      <div className="mt-3 flex items-center justify-end gap-3 pt-2 border-t border-border">
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
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Saving changes…</span>
            </>
          ) : (
            <span>Save Changes</span>
          )}
        </Button>
      </div>
    </form>
  )
}

export function EditTransactionDialog({
  transaction,
  open,
  onOpenChange,
  onSuccess,
}: EditTransactionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && transaction && (
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Update this entry in your money journal or correct its category.
            </DialogDescription>
          </DialogHeader>

          <EditTransactionForm
            key={transaction.id}
            transaction={transaction}
            onCancel={() => onOpenChange(false)}
            onSuccess={(updated) => {
              onSuccess(updated)
              onOpenChange(false)
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}
