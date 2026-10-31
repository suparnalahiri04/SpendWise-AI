import {
  AlertCircle,
  Loader2,
  PiggyBank,
  Plus,
  RefreshCw,
  Target,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { StatCard } from '@/components/common/StatCard'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BudgetCard } from '@/features/budgets/BudgetCard'
import {
  formatMonthLabel,
  getCurrentMonthString,
} from '@/features/budgets/budgetUtils'
import { DeleteBudgetDialog } from '@/features/budgets/DeleteBudgetDialog'
import { EditBudgetDialog } from '@/features/budgets/EditBudgetDialog'
import { MonthSelector } from '@/features/budgets/MonthSelector'
import { SetBudgetDialog } from '@/features/budgets/SetBudgetDialog'
import { useBudgetProgress } from '@/features/budgets/useBudgetProgress'
import type { BudgetProgressItem } from '@/lib/api/types'
import { formatAmount } from '@/lib/format'

export function BudgetsPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthString())
  const [isSetDialogOpen, setIsSetDialogOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<BudgetProgressItem | null>(null)
  const [deletingBudget, setDeletingBudget] = useState<BudgetProgressItem | null>(null)

  const { status, summary, error, reload } = useBudgetProgress(selectedMonth)
  const monthLabel = formatMonthLabel(selectedMonth)

  const hasBudgets = status === 'success' && summary.items.length > 0
  const existingCategories = summary ? summary.items.map((i) => i.category) : []

  // Values for summary cards
  let budgetedValue: string | null = null
  let spentValue: string | null = null
  let remainingValue: string | null = null

  let budgetedHint = `Planned for ${monthLabel}`
  let spentHint = 'Actual category expenses'
  let remainingHint = 'Unspent allowance'

  if (status === 'loading') {
    budgetedHint = 'Loading budget…'
    spentHint = 'Loading spending…'
    remainingHint = 'Loading balance…'
  } else if (status === 'error') {
    budgetedHint = 'Unable to load budget'
    spentHint = 'Unable to load spending'
    remainingHint = 'Unable to load balance'
  } else if (status === 'success') {
    if (summary.items.length === 0) {
      budgetedHint = `No budgets set for ${monthLabel}`
      spentHint = 'No category targets'
      remainingHint = 'Set a budget to track allowance'
    } else {
      budgetedValue = `₹${formatAmount(summary.total_budgeted)}`
      spentValue = `₹${formatAmount(summary.total_spent)}`

      const remainingNum = typeof summary.total_remaining === 'number'
        ? summary.total_remaining
        : Number(summary.total_remaining) || 0

      remainingValue = `${remainingNum < 0 ? '−' : ''}₹${formatAmount(Math.abs(remainingNum))}`
      remainingHint = remainingNum >= 0 ? 'Remaining across all budgets' : 'Total spending exceeds planned budget'
    }
  }

  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Budgets"
        title="Spend with intention"
        description="Set monthly spending limits by category and track your actual progress against them."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MonthSelector month={selectedMonth} onChange={setSelectedMonth} />
            <Button
              type="button"
              className="gap-1.5"
              onClick={() => setIsSetDialogOpen(true)}
            >
              <Plus className="size-4" />
              Set budget
            </Button>
          </div>
        }
      />

      <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total budgeted"
          icon={Wallet}
          value={budgetedValue}
          hint={budgetedHint}
          accent="forest"
        />
        <StatCard
          label="Spent so far"
          icon={Target}
          value={spentValue}
          hint={spentHint}
          accent="butter"
        />
        <StatCard
          label="Remaining"
          icon={PiggyBank}
          value={remainingValue}
          hint={remainingHint}
          accent={
            status === 'success' && summary && Number(summary.total_remaining) < 0
              ? 'terracotta'
              : 'sage'
          }
        />
      </Reveal>

      <Reveal>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Category budgets</CardTitle>
              <CardDescription>
                Spending targets and real-time expense progress for {monthLabel}.
              </CardDescription>
            </div>
            {hasBudgets && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSetDialogOpen(true)}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                Add category
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {status === 'loading' && (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-col items-center justify-center gap-3 py-16 text-center"
              >
                <Loader2 className="size-6 animate-spin text-forest" />
                <p className="text-sm font-medium text-ink">Loading budgets for {monthLabel}…</p>
                <p className="text-xs text-muted-foreground">Fetching your monthly spending limits</p>
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
                  We were unable to load budget progress from the server.
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

            {status === 'success' && summary.items.length === 0 && (
              <EmptyState
                icon={PiggyBank}
                title={`No budgets for ${monthLabel}`}
                description="Set monthly limits for categories like Food/Dining, Shopping, or Groceries to keep your spending intentional."
                action={
                  <Button
                    type="button"
                    onClick={() => setIsSetDialogOpen(true)}
                    className="gap-1.5"
                  >
                    <Plus className="size-4" />
                    Set your first budget
                  </Button>
                }
              />
            )}

            {status === 'success' && summary.items.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {summary.items.map((item) => (
                  <BudgetCard
                    key={item.id}
                    budget={item}
                    onEdit={setEditingBudget}
                    onDelete={setDeletingBudget}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Reveal>

      {/* Dialogs */}
      <SetBudgetDialog
        open={isSetDialogOpen}
        onOpenChange={setIsSetDialogOpen}
        month={selectedMonth}
        existingCategories={existingCategories}
        onSuccess={reload}
      />

      <EditBudgetDialog
        budget={editingBudget}
        open={editingBudget !== null}
        onOpenChange={(open) => !open && setEditingBudget(null)}
        onSuccess={reload}
      />

      <DeleteBudgetDialog
        budget={deletingBudget}
        open={deletingBudget !== null}
        onOpenChange={(open) => !open && setDeletingBudget(null)}
        onSuccess={reload}
      />
    </AnimatedPage>
  )
}
