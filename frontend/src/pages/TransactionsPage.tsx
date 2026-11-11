import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  CloudOff,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { PeriodBadge } from '@/components/common/PeriodBadge'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { notifyFinancialMutation } from '@/features/alerts/alertEvents'
import { AddTransactionDialog } from '@/features/transactions/AddTransactionDialog'
import { groupTransactionsByDate } from '@/features/transactions/dateGrouping'
import { DeleteTransactionDialog } from '@/features/transactions/DeleteTransactionDialog'
import { EditTransactionDialog } from '@/features/transactions/EditTransactionDialog'
import { useTransactions } from '@/features/transactions/useTransactions'
import { usePeriod } from '@/features/period/period'
import { filterTransactionsByPeriod } from '@/features/period/periodUtils'
import { ApiError } from '@/lib/api/client'
import { updateTransaction } from '@/lib/api/transactions'
import { formatAmount, formatConfidenceLabel, formatDate, isHighConfidencePrediction } from '@/lib/format'
import {
  TRANSACTION_CATEGORIES,
  type Transaction,
  type TransactionType,
} from '@/lib/api/types'
import { cn } from '@/lib/utils'

interface ColumnDef {
  id: string
  label: string
  alignRight?: boolean
  srOnly?: boolean
}

const COLUMNS: readonly ColumnDef[] = [
  { id: 'transaction', label: 'Transaction' },
  { id: 'category', label: 'Category' },
  { id: 'type', label: 'Type' },
  { id: 'amount', label: 'Amount', alignRight: true },
  { id: 'actions', label: 'Actions', alignRight: true, srOnly: true },
]

function MessageRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="block sm:table-row w-full">
      <td colSpan={COLUMNS.length} className="block sm:table-cell p-6 w-full text-center sm:text-left">
        {children}
      </td>
    </tr>
  )
}

export function TransactionsPage() {
  const state = useTransactions()
  const { period, periodLabel } = usePeriod()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null)

  // Integrated filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showUnreviewedOnly, setShowUnreviewedOnly] = useState(false)

  // One-click AI suggestion confirmation state
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [confirmError, setConfirmError] = useState<{ id: number; message: string } | null>(null)

  const allTransactions = state.status === 'success' ? state.transactions : []
  const visibleTransactions = filterTransactionsByPeriod(allTransactions, period)

  // Filter transactions by search query, type, review status, and category
  const filteredTransactions = visibleTransactions.filter((t) => {
    if (typeFilter !== 'all' && t.transaction_type !== typeFilter) {
      return false
    }
    if (showUnreviewedOnly && t.is_reviewed) {
      return false
    }
    if (categoryFilter !== 'all' && t.category !== categoryFilter) {
      return false
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const descMatch = t.description.toLowerCase().includes(q)
      const catMatch = t.category.toLowerCase().includes(q)
      if (!descMatch && !catMatch) {
        return false
      }
    }
    return true
  })

  const groupedTransactions =
    state.status === 'success' ? groupTransactionsByDate(filteredTransactions) : []

  const unreviewedCount = visibleTransactions.filter((t) => !t.is_reviewed).length

  async function handleConfirmSuggestion(t: Transaction) {
    if (confirmingId !== null || !t.predicted_category) return
    setConfirmingId(t.id)
    setConfirmError(null)

    try {
      const updated = await updateTransaction(t.id, {
        description: t.description.trim(),
        amount: Number(t.amount),
        transaction_date: t.transaction_date,
        transaction_type: t.transaction_type as TransactionType,
        category: t.predicted_category,
      })
      notifyFinancialMutation('transaction:updated')
      state.updateTransactionLocally(updated)
    } catch (caught) {
      if (caught instanceof ApiError) {
        setConfirmError({ id: t.id, message: caught.message })
      } else {
        setConfirmError({
          id: t.id,
          message: 'Failed to confirm category. Please check your connection and try again.',
        })
      }
    } finally {
      setConfirmingId(null)
    }
  }

  function handleResetFilters() {
    setSearchQuery('')
    setTypeFilter('all')
    setCategoryFilter('all')
    setShowUnreviewedOnly(false)
  }

  return (
    <AnimatedPage className="space-y-6 w-full min-w-0 max-w-full">
      {/* Editorial Page Introduction with Organic Contour Detail */}
      <Reveal className="w-full min-w-0 max-w-full">
        <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 sm:p-6 shadow-card w-full min-w-0 max-w-full">
          {/* Subtle organic contour details */}
          <svg
            className="pointer-events-none absolute right-0 top-0 h-full w-96 opacity-[0.07] text-forest select-none overflow-hidden"
            viewBox="0 0 400 200"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M 0,30 C 80,70 160,10 240,50 C 320,90 360,30 400,40" />
            <path d="M 0,70 C 100,120 180,40 260,90 C 340,140 370,80 400,100" />
            <path d="M 0,110 C 90,160 200,80 290,130 C 360,170 380,120 400,140" />
            <path d="M 0,150 C 110,200 220,120 310,170 C 370,200 385,160 400,180" />
          </svg>

          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6 min-w-0">
            <div className="max-w-2xl min-w-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-forest-soft">
                Financial Ledger
              </p>
              <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
                Every transaction, accounted for.
              </h1>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                Your complete ledger of inflows and outflows. Review AI-suggested categories, confirm auto-tagged entries, and record new financial activity.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <Button
                onClick={() => setIsAddOpen(true)}
                className="gap-2 bg-gradient-hero text-paper shadow-hero hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border border-emerald-950/20"
                aria-label="Add transaction"
              >
                <Plus className="size-4 text-lime-accent" aria-hidden="true" />
                <span>Add Transaction</span>
              </Button>
              <PeriodBadge />
            </div>
          </div>
        </div>
      </Reveal>

      {/* Ledger Container */}
      <Reveal className="w-full min-w-0 max-w-full">
        <Card className="w-full max-w-full min-w-0 overflow-hidden border border-border/80 shadow-card">
          {/* Integrated Search and Filter Toolbar */}
          <div className="flex flex-col gap-3.5 border-b border-border bg-card/60 p-4 sm:p-5 w-full min-w-0 max-w-full">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
              {/* Search Input */}
              <div className="relative w-full sm:max-w-sm min-w-0">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-forest-soft"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transactions"
                  aria-label="Search transactions"
                  className="h-9 w-full min-w-0 rounded-xl border border-input bg-paper/60 pl-9 pr-9 text-sm text-ink placeholder:text-muted-foreground focus:border-forest-soft focus:bg-card focus:outline-none focus:ring-1 focus:ring-forest-soft transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-ink rounded-lg"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Type Filter Pills, Category Filter & Review Toggle */}
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <div className="inline-flex min-h-9 sm:h-9 max-w-full flex-wrap items-center rounded-xl border border-border bg-paper/60 p-1">
                  {(['all', 'expense', 'income'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTypeFilter(type)}
                      className={cn(
                        'inline-flex h-7 items-center rounded-lg px-2.5 sm:px-3 text-xs font-medium transition-all duration-150 capitalize',
                        typeFilter === type
                          ? 'bg-forest text-paper shadow-xs font-semibold'
                          : 'text-muted-foreground hover:text-ink',
                      )}
                    >
                      {type === 'all' ? 'All Types' : type === 'expense' ? 'Expenses' : 'Income'}
                    </button>
                  ))}
                </div>

                {/* Category Filter Select */}
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Filter by category"
                  className="h-9 rounded-xl border border-border bg-paper/60 px-3 py-1 text-xs font-medium text-ink focus:border-forest-soft focus:bg-card focus:outline-none focus:ring-1 focus:ring-forest-soft transition-colors"
                >
                  <option value="all">All Categories</option>
                  {TRANSACTION_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                {(unreviewedCount > 0 || showUnreviewedOnly) && (
                  <button
                    type="button"
                    onClick={() => setShowUnreviewedOnly(!showUnreviewedOnly)}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 text-xs font-medium transition-all duration-150',
                      showUnreviewedOnly
                        ? 'border-butter bg-butter/30 text-ink font-semibold'
                        : 'border-border bg-paper/60 text-muted-foreground hover:text-ink',
                    )}
                  >
                    <Sparkles className="size-3 text-forest-soft" aria-hidden="true" />
                    <span>Needs review</span>
                    <span className="rounded-full bg-butter/80 px-1.5 py-0.2 text-[10px] font-semibold text-ink">
                      {unreviewedCount}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Active Filters Summary if filtering */}
            {(searchQuery || typeFilter !== 'all' || showUnreviewedOnly || categoryFilter !== 'all') && (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                <span>
                  Showing {filteredTransactions.length} of {visibleTransactions.length} entries in {periodLabel.toLowerCase()}
                </span>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="font-medium text-forest hover:text-forest-soft underline"
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>

          {/* Inline Error Banner for Category Confirmation Failures */}
          {confirmError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 border-b border-terracotta/30 bg-terracotta/10 px-4 py-2.5 text-xs text-[#8a3f29]"
            >
              <span>{confirmError.message}</span>
              <button
                type="button"
                onClick={() => setConfirmError(null)}
                className="font-medium underline hover:text-ink"
                aria-label="Dismiss error"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Desktop and Mobile Responsive Ledger */}
          <div className="w-full max-w-full min-w-0 overflow-x-auto sm:overflow-x-visible" aria-busy={state.status === 'loading'}>
            <table className="block sm:table w-full max-w-full min-w-0 text-left text-sm">
              <caption className="sr-only">Transactions</caption>
              <thead className="hidden sm:table-header-group border-b border-border bg-paper/60">
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.id}
                      scope="col"
                      className={cn(
                        'px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                        col.alignRight && 'text-right',
                      )}
                    >
                      {col.srOnly ? <span className="sr-only">{col.label}</span> : col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              {(state.status !== 'success' || filteredTransactions.length === 0) && (
                <tbody className="block sm:table-row-group w-full min-w-0">
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

                  {state.status === 'success' && allTransactions.length === 0 && (
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
                    allTransactions.length > 0 &&
                    visibleTransactions.length === 0 && (
                      <MessageRow>
                        <EmptyState
                          icon={ArrowLeftRight}
                          title="No transactions in this period"
                          description={`No transactions were recorded for ${periodLabel.toLowerCase()}.`}
                        />
                      </MessageRow>
                    )}

                  {state.status === 'success' &&
                    visibleTransactions.length > 0 &&
                    filteredTransactions.length === 0 && (
                      <MessageRow>
                        <EmptyState
                          icon={Search}
                          title="No matching transactions"
                          description={`No entries match your search or filter criteria in ${periodLabel.toLowerCase()}.`}
                          action={
                            <Button variant="outline" onClick={handleResetFilters}>
                              Clear filters
                            </Button>
                          }
                        />
                      </MessageRow>
                    )}
                </tbody>
              )}

              {state.status === 'success' &&
                groupedTransactions.map((group, groupIndex) => (
                  <tbody
                    key={group.dateKey}
                    className="block sm:table-row-group w-full min-w-0"
                  >
                    <tr
                      className={cn(
                        'block sm:table-row bg-paper/70 border-b border-border/80',
                        groupIndex > 0 && 'border-t border-border/80',
                      )}
                    >
                      <th
                        colSpan={COLUMNS.length}
                        scope="rowgroup"
                        className="block sm:table-cell px-3.5 sm:px-5 py-2 text-left font-normal"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold tracking-wide text-forest">
                            {group.label}
                          </span>
                          <span className="text-[11px] font-medium text-muted-foreground tabular">
                            {group.transactions.length}{' '}
                            {group.transactions.length === 1 ? 'transaction' : 'transactions'}
                          </span>
                        </div>
                      </th>
                    </tr>

                    {group.transactions.map((t) => {
                      const confidenceLabel = formatConfidenceLabel(t.prediction_confidence)
                      return (
                      <tr
                        key={t.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 p-3.5 sm:p-0 sm:table-row sm:gap-0 sm:border-b sm:border-border border-b border-border/70 last:border-0 hover:bg-paper/40 transition-colors w-full min-w-0"
                      >
                        {/* Cell 1: Transaction Description & Review Status */}
                        <td className="col-start-1 row-start-1 sm:table-cell px-0 sm:px-5 py-0 sm:py-3.5 min-w-0">
                          <div className="flex flex-col gap-1 min-w-0">
                            <span className="truncate font-medium text-ink block text-sm" title={t.description}>
                              {t.description}
                            </span>
                            <span className="sr-only">Recorded {formatDate(t.transaction_date)}</span>
                            <div className="flex items-center gap-2">
                              {!t.is_reviewed ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge tone="butter">To review</Badge>
                                  {t.predicted_category && (
                                    <span
                                      className="text-[11px] text-muted-foreground whitespace-nowrap"
                                      title={
                                        confidenceLabel
                                          ? `Suggested by ML: ${t.predicted_category} (${confidenceLabel} confidence)`
                                          : undefined
                                      }
                                    >
                                      AI: {t.predicted_category}
                                      {confidenceLabel && ` (${confidenceLabel})`}
                                    </span>
                                  )}
                                  {t.predicted_category && isHighConfidencePrediction(t.prediction_confidence) && (
                                    <button
                                      type="button"
                                      disabled={confirmingId === t.id}
                                      onClick={() => handleConfirmSuggestion(t)}
                                      aria-label={`Confirm AI category ${t.predicted_category} for ${t.description}`}
                                      className={cn(
                                        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-all',
                                        'bg-forest/10 text-forest hover:bg-forest/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
                                      )}
                                    >
                                      {confirmingId === t.id ? (
                                        <>
                                          <Loader2 className="size-3 animate-spin text-forest" aria-hidden="true" />
                                          <span>Confirming…</span>
                                        </>
                                      ) : (
                                        <>
                                          <Check className="size-3 text-forest" aria-hidden="true" />
                                          <span>Confirm</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Reviewed</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Cell 2: Category */}
                        <td className="col-start-1 row-start-2 sm:table-cell px-0 sm:px-5 py-0 sm:py-3.5 min-w-0">
                          <Badge tone="sage">{t.category}</Badge>
                        </td>

                        {/* Cell 3: Type (hidden on mobile, shown on desktop) */}
                        <td className="hidden sm:table-cell px-5 py-3.5">
                          {t.transaction_type === 'income' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-forest">
                              <ArrowUpRight className="size-3" aria-hidden="true" />
                              Income
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                              <ArrowDownRight className="size-3" aria-hidden="true" />
                              Expense
                            </span>
                          )}
                        </td>

                        {/* Cell 4: Amount */}
                        <td
                          className={cn(
                            'col-start-2 row-start-1 sm:table-cell px-0 sm:px-5 py-0 sm:py-3.5 text-right font-semibold tabular whitespace-nowrap text-sm sm:text-sm shrink-0',
                            t.transaction_type === 'income' ? 'text-forest' : 'text-ink',
                          )}
                        >
                          {t.transaction_type === 'income' ? '+₹' : '−₹'}
                          {formatAmount(t.amount)}
                          <span className="sr-only"> ({t.transaction_type})</span>
                        </td>

                        {/* Cell 5: Actions */}
                        <td className="col-start-2 row-start-2 sm:table-cell px-0 sm:px-5 py-0 sm:py-3.5 text-right flex items-center justify-end sm:table-cell shrink-0">
                          <div className="flex items-center justify-end gap-1">
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingTransaction(t)}
                              aria-label={`Delete ${t.description}`}
                              className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:bg-terracotta/10 hover:text-terracotta"
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                              <span className="sr-only sm:not-sr-only">Delete</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                ))}
            </table>
          </div>
        </Card>
      </Reveal>

      {/* Modal Dialogs */}
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

      <DeleteTransactionDialog
        open={Boolean(deletingTransaction)}
        transaction={deletingTransaction}
        onOpenChange={(open) => {
          if (!open) setDeletingTransaction(null)
        }}
        onSuccess={(deletedId) => {
          state.deleteTransactionLocally(deletedId)
        }}
      />
    </AnimatedPage>
  )
}
