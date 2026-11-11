import { Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { BudgetProgressItem } from '@/lib/api/types'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getBudgetStatus } from './budgetUtils'

interface BudgetCardProps {
  budget: BudgetProgressItem
  onEdit: (budget: BudgetProgressItem) => void
  onDelete: (budget: BudgetProgressItem) => void
}

export function BudgetCard({ budget, onEdit, onDelete }: BudgetCardProps) {
  const percentage = Number(budget.percentage_used) || 0
  const isExceeded = Boolean(budget.is_exceeded || percentage > 100)
  const status = getBudgetStatus(percentage, isExceeded, budget.status)

  const spentNum = typeof budget.spent_amount === 'number'
    ? budget.spent_amount
    : Number(budget.spent_amount) || 0

  const limitNum = typeof budget.limit_amount === 'number'
    ? budget.limit_amount
    : Number(budget.limit_amount) || 0

  const remainingNum = typeof budget.remaining_amount === 'number'
    ? budget.remaining_amount
    : Number(budget.remaining_amount) || 0

  // Progress bar styling based on status:
  // - healthy: emerald & forest gradient with a fresh lime highlight
  // - warning: warm amber warning gradient
  // - exceeded: terracotta alert gradient
  const barColor =
    status.tone === 'terracotta'
      ? 'bg-gradient-to-r from-terracotta to-destructive'
      : status.tone === 'butter'
        ? 'bg-gradient-to-r from-[#c98e1f] to-[#e0a133]'
        : 'bg-gradient-to-r from-forest via-emerald-deep to-lime'

  return (
    <Card className="p-5 gap-3 transition-all duration-200 hover:shadow-card hover:border-border/90 motion-reduce:transition-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold text-ink">{budget.category}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Monthly limit: <span className="font-medium text-ink">₹{formatAmount(limitNum)}</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground hover:text-ink"
            aria-label={`Edit ${budget.category} budget`}
            onClick={() => onEdit(budget)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${budget.category} budget`}
            onClick={() => onDelete(budget)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Progress bar container */}
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-ink">
            ₹{formatAmount(spentNum)}{' '}
            <span className="text-muted-foreground font-normal">spent</span>
          </span>
          <span
            className={cn(
              'font-semibold tabular',
              isExceeded ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {percentage.toFixed(1)}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-label={`${budget.category} budget progress`}
          aria-valuenow={Math.round(percentage)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2.5 w-full overflow-hidden rounded-full bg-paper-deep border border-border/50"
        >
          <div
            className={cn('h-full rounded-full transition-all duration-500 ease-out motion-reduce:transition-none', barColor)}
            style={{ width: `${status.progressPercent}%` }}
          />
        </div>
      </div>

      {/* Footer details: Remaining or Over budget */}
      <div className="mt-1 flex items-center justify-between pt-2 border-t border-border/40 text-xs">
        <span className="text-muted-foreground">Remaining:</span>
        <span
          className={cn(
            'font-semibold tabular',
            isExceeded ? 'text-destructive' : 'text-forest font-medium',
          )}
        >
          {isExceeded
            ? `Over by ₹${formatAmount(Math.abs(remainingNum))}`
            : `₹${formatAmount(remainingNum)} left`}
        </span>
      </div>
    </Card>
  )
}
