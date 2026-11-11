import { Loader2, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { notifyFinancialMutation } from '@/features/alerts/alertEvents'
import { ApiError } from '@/lib/api/client'
import { deleteTransaction } from '@/lib/api/transactions'
import type { Transaction } from '@/lib/api/types'
import { formatAmount, formatDate } from '@/lib/format'

interface DeleteTransactionDialogProps {
  transaction: Transaction | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (deletedId: number) => void
}

export function DeleteTransactionDialog({
  transaction,
  open,
  onOpenChange,
  onSuccess,
}: DeleteTransactionDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  if (!transaction) return null

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen && submitting) return
    if (!newOpen) {
      setError(null)
      setSubmitting(false)
    }
    onOpenChange(newOpen)
  }

  async function handleDelete() {
    if (!transaction || submitting) return
    setError(null)
    setSubmitting(true)

    try {
      await deleteTransaction(transaction.id)
      notifyFinancialMutation('transaction:deleted')
      setSubmitting(false)
      const deletedId = transaction.id
      handleOpenChange(false)
      onSuccess(deletedId)
    } catch (err: unknown) {
      setSubmitting(false)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to delete transaction. Please try again.')
      }
    }
  }

  const isIncome = transaction.transaction_type === 'income'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-lg bg-terracotta/20 text-[#9a4a33]"
              aria-hidden="true"
            >
              <Trash2 className="size-4" />
            </span>
            <DialogTitle>Delete transaction</DialogTitle>
          </div>
          <DialogDescription>
            Are you sure you want to delete this transaction from your ledger?
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

        {/* Transaction Summary Card */}
        <div className="mt-3 rounded-xl border border-border/80 bg-paper/60 p-3.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-ink text-sm break-words line-clamp-2">
              {transaction.description}
            </span>
            <span
              className={`font-semibold tabular text-sm whitespace-nowrap ${
                isIncome ? 'text-forest' : 'text-ink'
              }`}
            >
              {isIncome ? '+₹' : '−₹'}
              {formatAmount(transaction.amount)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge tone="sage">{transaction.category}</Badge>
            <span>•</span>
            <span>{formatDate(transaction.transaction_date)}</span>
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          This action cannot be undone. This transaction will be permanently removed from your
          financial records and journal history.
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => handleOpenChange(false)}
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
              'Delete transaction'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

