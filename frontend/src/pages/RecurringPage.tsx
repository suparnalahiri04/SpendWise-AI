import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { StatCard } from '@/components/common/StatCard'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AddRecurringDialog } from '@/features/recurring/AddRecurringDialog'
import { CancelRecurringDialog } from '@/features/recurring/CancelRecurringDialog'
import { EditRecurringDialog } from '@/features/recurring/EditRecurringDialog'
import { RecurringPaymentCard } from '@/features/recurring/RecurringPaymentCard'
import { useRecurringPayments } from '@/features/recurring/useRecurringPayments'
import type { RecurringPayment } from '@/lib/api/types'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

type FilterTab = 'active' | 'upcoming' | 'overdue' | 'cancelled' | 'all'

export function RecurringPage() {
  const [filterTab, setFilterTab] = useState<FilterTab>('active')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null)
  const [cancellingPayment, setCancellingPayment] = useState<RecurringPayment | null>(null)

  const { status, payments, summary, error, setStatusFilter, reload } = useRecurringPayments()

  function handleFilterChange(tab: FilterTab) {
    setFilterTab(tab)
    if (tab === 'cancelled') {
      setStatusFilter('cancelled')
    } else if (tab === 'all') {
      setStatusFilter('all')
    } else {
      setStatusFilter('active')
    }
  }

  // Filter payments locally if upcoming or overdue tab selected
  const displayedPayments = payments.filter((p) => {
    if (filterTab === 'upcoming') {
      return p.status === 'active' && !p.is_overdue && p.days_until_due <= 30
    }
    if (filterTab === 'overdue') {
      return p.status === 'active' && (p.is_overdue || p.days_until_due < 0)
    }
    return true
  })

  // Summary card metrics
  let activeCount: string | null = null
  let monthlyCommitment: string | null = null
  let upcomingValue: string | null = null
  let overdueValue: string | null = null

  let activeHint = 'Regular scheduled expenses'
  let monthlyHint = 'Estimated 30-day baseline'
  let upcomingHint = 'Due in next 30 days'
  let overdueHint = 'Requires attention'

  if (status === 'loading') {
    activeHint = 'Loading schedules…'
    monthlyHint = 'Loading baseline…'
    upcomingHint = 'Checking due dates…'
    overdueHint = 'Checking due dates…'
  } else if (status === 'error') {
    activeHint = 'Unable to load schedules'
    monthlyHint = 'Unable to calculate'
    upcomingHint = 'Unable to check'
    overdueHint = 'Unable to check'
  } else if (status === 'success' && summary) {
    activeCount = String(summary.total_active_count)
    monthlyCommitment = `₹${formatAmount(summary.total_monthly_commitment)}`
    upcomingValue = String(summary.upcoming_count)
    overdueValue = String(summary.overdue_count)

    activeHint = `${summary.total_active_count} active commitments`
    monthlyHint = 'Normalized monthly baseline'
    upcomingHint = `₹${formatAmount(summary.upcoming_total)} total due soon`
    overdueHint =
      summary.overdue_count > 0
        ? `₹${formatAmount(summary.overdue_total)} overdue`
        : 'All payments on track'
  }

  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Commitments"
        title="Recurring Payments"
        description="Schedule regular bills, subscriptions, and routines to keep your upcoming commitments predictable."
        actions={
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => setIsAddOpen(true)}
          >
            <Plus className="size-4" />
            Add schedule
          </Button>
        }
      />

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active schedules"
          icon={CalendarClock}
          value={activeCount}
          hint={activeHint}
          accent="forest"
        />
        <StatCard
          label="Monthly baseline"
          icon={Wallet}
          value={monthlyCommitment}
          hint={monthlyHint}
          accent="butter"
        />
        <StatCard
          label="Due in 30 days"
          icon={Clock}
          value={upcomingValue}
          hint={upcomingHint}
          accent="sage"
        />
        <StatCard
          label="Overdue bills"
          icon={AlertTriangle}
          value={overdueValue}
          hint={overdueHint}
          accent={summary && summary.overdue_count > 0 ? 'terracotta' : 'sage'}
        />
      </Reveal>

      <Reveal>
        <Card>
          <CardHeader className="flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Schedules</CardTitle>
              <CardDescription>
                Track upcoming due dates and manage recurring payment commitments.
              </CardDescription>
            </div>

            {/* Filter Tabs */}
            <div
              className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-paper-deep/60 p-1"
              role="group"
              aria-label="Filter recurring schedules by status"
            >
              <button
                type="button"
                aria-pressed={filterTab === 'active'}
                className={cn(
                  'min-h-[36px] sm:min-h-[32px] inline-flex items-center justify-center rounded-lg px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none',
                  filterTab === 'active'
                    ? 'bg-card text-forest shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => handleFilterChange('active')}
              >
                Active
              </button>
              <button
                type="button"
                aria-pressed={filterTab === 'upcoming'}
                className={cn(
                  'min-h-[36px] sm:min-h-[32px] inline-flex items-center justify-center rounded-lg px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none',
                  filterTab === 'upcoming'
                    ? 'bg-card text-forest shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => handleFilterChange('upcoming')}
              >
                Upcoming
              </button>
              <button
                type="button"
                aria-pressed={filterTab === 'overdue'}
                className={cn(
                  'min-h-[36px] sm:min-h-[32px] inline-flex items-center justify-center rounded-lg px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none',
                  filterTab === 'overdue'
                    ? 'bg-card text-destructive shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => handleFilterChange('overdue')}
              >
                Overdue
              </button>
              <button
                type="button"
                aria-pressed={filterTab === 'cancelled'}
                className={cn(
                  'min-h-[36px] sm:min-h-[32px] inline-flex items-center justify-center rounded-lg px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none',
                  filterTab === 'cancelled'
                    ? 'bg-card text-forest shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => handleFilterChange('cancelled')}
              >
                Cancelled
              </button>
              <button
                type="button"
                aria-pressed={filterTab === 'all'}
                className={cn(
                  'min-h-[36px] sm:min-h-[32px] inline-flex items-center justify-center rounded-lg px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none',
                  filterTab === 'all'
                    ? 'bg-card text-forest shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => handleFilterChange('all')}
              >
                All
              </button>
            </div>
          </CardHeader>

          <CardContent>
            {status === 'loading' && (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-col items-center justify-center gap-3 py-16 text-center"
              >
                <Loader2 className="size-6 animate-spin text-forest" />
                <p className="text-sm font-medium text-ink">Loading recurring schedules…</p>
                <p className="text-xs text-muted-foreground">Checking due dates and payment baselines</p>
              </div>
            )}

            {status === 'error' && (
              <div
                role="alert"
                className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 py-12 px-6 text-center"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertCircle className="size-5" />
                </span>
                <p className="text-sm font-semibold text-ink">{error}</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  We were unable to load recurring payments from the server.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={reload}
                  className="gap-1.5 mt-2"
                >
                  <RefreshCw className="size-3.5" />
                  Try again
                </Button>
              </div>
            )}

            {status === 'success' && displayedPayments.length === 0 && (
              <EmptyState
                icon={CalendarClock}
                title={
                  filterTab === 'cancelled'
                    ? 'No cancelled schedules'
                    : filterTab === 'overdue'
                      ? 'No overdue payments'
                      : filterTab === 'upcoming'
                        ? 'No payments due in the next 30 days'
                        : 'No recurring payments yet'
                }
                description={
                  filterTab === 'overdue'
                    ? 'All your scheduled payments are on track!'
                    : filterTab === 'cancelled'
                      ? 'Schedules you cancel in the future will be kept here for reference.'
                      : 'Set up subscriptions, rent, insurance, or regular bills to stay ahead of upcoming expenses.'
                }
                action={
                  filterTab === 'active' || filterTab === 'all' ? (
                    <Button
                      type="button"
                      onClick={() => setIsAddOpen(true)}
                      className="gap-1.5"
                    >
                      <Plus className="size-4" />
                      Add your first schedule
                    </Button>
                  ) : undefined
                }
              />
            )}

            {status === 'success' && displayedPayments.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {displayedPayments.map((payment) => (
                  <RecurringPaymentCard
                    key={payment.id}
                    payment={payment}
                    onEdit={setEditingPayment}
                    onCancel={setCancellingPayment}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Reveal>

      {/* Dialogs */}
      <AddRecurringDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onSuccess={reload}
      />

      <EditRecurringDialog
        payment={editingPayment}
        open={editingPayment !== null}
        onOpenChange={(open) => !open && setEditingPayment(null)}
        onSuccess={reload}
      />

      <CancelRecurringDialog
        payment={cancellingPayment}
        open={cancellingPayment !== null}
        onOpenChange={(open) => !open && setCancellingPayment(null)}
        onSuccess={reload}
      />
    </AnimatedPage>
  )
}

