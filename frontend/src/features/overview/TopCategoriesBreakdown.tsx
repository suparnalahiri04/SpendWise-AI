import { Receipt } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { formatAmount } from '@/lib/format'
import type { CategoryBreakdownItem } from './overviewCalculations'

interface TopCategoriesBreakdownProps {
  categories: readonly CategoryBreakdownItem[]
  periodLabel: string
}

export function TopCategoriesBreakdown({
  categories,
  periodLabel,
}: TopCategoriesBreakdownProps) {
  if (categories.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={Receipt}
        title="No categories yet"
        description={`No expenses were recorded for ${periodLabel.toLowerCase()}.`}
        className="flex-1"
      />
    )
  }

  return (
    <div
      role="region"
      aria-label={`Top expense categories for ${periodLabel}`}
      className="flex flex-1 flex-col justify-center gap-4 py-1"
    >
      {categories.map((item) => (
        <div key={item.category} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate font-semibold text-ink max-w-[55%]" title={item.category}>
              {item.category}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">
                ₹{formatAmount(item.amount.toFixed(2))}
              </span>
              <span className="rounded bg-sage/60 px-1.5 py-0.5 text-[11px] font-medium text-forest">
                {item.percentage}%
              </span>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper">
            <div
              className="h-full rounded-full bg-forest transition-all duration-300"
              style={{ width: `${Math.min(Math.max(item.percentage, 0), 100)}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      ))}
    </div>
  )
}

