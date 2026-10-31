import {
  ArrowLeftRight,
  CloudOff,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { PeriodBadge } from '@/components/common/PeriodBadge'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AddTransactionDialog } from '@/features/transactions/AddTransactionDialog'
import { EditTransactionDialog } from '@/features/transactions/EditTransactionDialog'
import { useTransactions } from '@/features/transactions/useTransactions'
import { formatAmount, formatDate } from '@/lib/format'
import type { Transaction } from '@/lib/api/types'
import { cn } from '@/lib/utils'

const COLUMNS = ['Date', 'Description', 'Category', 'Status', 'Amount', 'Actions'] as const

function MessageRow({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={COLUMNS.length} className="p-4 sm:p-6">
        {children}
      </td>
    </tr>
  )
}

export function TransactionsPage() {
  const state = useTransactions()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)

  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Ledger"
        title="Every entry, neatly recorded"
        description="Your transactions, newest first, with their categories. Entries marked “To review” have an automatic category you haven't confirmed yet."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setIsAddOpen(true)}
              className="gap-1.5"
              aria-label="Add transaction"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>Add Transaction</span>
            </Button>
            <PeriodBadge />
          </div>
        }
      />

      <Reveal>
        <Card className="overflow-hidden">
          {/* Search and filters toolbar */}
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="relative w-full sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                disabled
                placeholder="Search transactions"
                aria-label="Search transactions (coming soon)"
                className="h-10 w-full rounded-xl border border-input bg-paper/60 pl-9 pr-3 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled title="Coming soon">
                <SlidersHorizontal aria-hidden="true" />
                Filters
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsAddOpen(true)}
                className="sm:hidden"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto" aria-busy={state.status === 'loading'}>
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Transactions</caption>
              <thead>
                <tr className="border-b border-border bg-paper/60">
                  {COLUMNS.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className={cn(
                        'px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                        (col === 'Amount' || col === 'Actions') && 'text-right',
                      )}
                    >
                      {col === 'Actions' ? <span className="sr-only">Actions</span> : col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.status === 'loading' && (
                  <MessageRow>
                    <div
                      role="status"
                      className="flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground"
                    >
                      <Loader2 className="size-5 animate-spin text-forest" aria-hidden="true" />
                      Loading your transactions…
                    </div>
                  </MessageRow>
                )}

                {state.status === 'error' && (
                  <MessageRow>
                    <EmptyState
                      icon={CloudOff}
                      title="We couldn't load your transactions"
                      description={state.message}
                      action={
                        <Button variant="secondary" onClick={state.reload}>
                          Try again
                        </Button>
                      }
                    />
                  </MessageRow>
                )}

                {state.status === 'success' && state.transactions.length === 0 && (
                  <MessageRow>
                    <EmptyState
                      icon={ArrowLeftRight}
                      title="No transactions yet"
                      description="Transactions you add or import will appear here."
                      action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Button onClick={() => setIsAddOpen(true)}>
                            <Plus className="size-4" aria-hidden="true" />
                            Add Transaction
                          </Button>
                          <Button asChild variant="secondary">
                            <Link to="/statements">Go to Statements</Link>
                          </Button>
                        </div>
                      }
                    />
                  </MessageRow>
                )}

                {state.status === 'success' &&
                  state.transactions.map((t) => (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-paper/50">
                      <td className="tabular whitespace-nowrap px-5 py-3.5 text-muted-foreground">
                        {formatDate(t.transaction_date)}
                      </td>
                      <td className="max-w-xs px-5 py-3.5 font-medium text-ink">
                        <span className="block truncate" title={t.description}>
                          {t.description}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone="sage">{t.category}</Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        {t.is_reviewed ? (
                          <span className="text-xs text-muted-foreground">Reviewed</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <Badge tone="butter">To review</Badge>
                            {t.predicted_category && (
                              <span
                                className="text-[11px] text-muted-foreground whitespace-nowrap"
                                title={
                                  t.prediction_confidence
                                    ? `Suggested by ML: ${t.predicted_category} (${(Number(t.prediction_confidence) * 100).toFixed(0)}% confidence)`
                                    : undefined
                                }
                              >
                                AI: {t.predicted_category}
                                {t.prediction_confidence &&
                                  ` (${(Number(t.prediction_confidence) * 100).toFixed(0)}%)`}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td
                        className={cn(
                          'tabular whitespace-nowrap px-5 py-3.5 text-right font-semibold',
                          t.transaction_type === 'income' ? 'text-forest' : 'text-ink',
                        )}
                      >
                        {t.transaction_type === 'income' ? '+' : '−'}
                        {formatAmount(t.amount)}
                        <span className="sr-only"> ({t.transaction_type})</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingTransaction(t)}
                          aria-label={`Edit ${t.description}`}
                          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:bg-paper hover:text-ink"
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          <span>Edit</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Reveal>

      <AddTransactionDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onSuccess={(created) => {
          state.addTransactionLocally(created)
          state.reload()
        }}
      />

      <EditTransactionDialog
        open={Boolean(editingTransaction)}
        transaction={editingTransaction}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(null)
        }}
        onSuccess={(updated) => {
          state.updateTransactionLocally(updated)
          state.reload()
        }}
      />
    </AnimatedPage>
  )
}
