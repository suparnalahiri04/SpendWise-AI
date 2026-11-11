import { ArrowDownLeft, ArrowRight, ArrowUpRight, ReceiptText } from 'lucide-react'
import { Link } from 'react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Transaction } from '@/lib/api/types'
import { formatAmount, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

interface RecentTransactionsCardProps {
  transactions: readonly Transaction[]
  periodLabel: string
  className?: string
}

export function RecentTransactionsCard({
  transactions,
  periodLabel,
  className,
}: RecentTransactionsCardProps) {
  return (
    <Card className={cn('lg:col-span-2 flex flex-col justify-between', className)}>
      <CardHeader>
        <div>
          <CardTitle>Recent transactions</CardTitle>
          <CardDescription>Latest entries from your financial journal.</CardDescription>
        </div>
        <Link
          to="/transactions"
          className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:text-forest-soft transition-colors"
        >
          View all
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center">
        {transactions.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-paper text-muted-foreground mb-3">
              <ReceiptText className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-ink">No transactions in this period</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              No entries were recorded for {periodLabel.toLowerCase()}. Check other periods or view all transactions.
            </p>
            <Link
              to="/transactions"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-forest hover:text-forest-soft"
            >
              View all transactions
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {transactions.map((t) => {
              const isIncome = t.transaction_type === 'income'
              const formattedDate = formatDate(t.transaction_date)
              const formattedAmt = formatAmount(t.amount)
              const displaySign = isIncome ? '+' : '−'

              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold',
                        isIncome
                          ? 'bg-sage/70 text-forest'
                          : 'bg-paper text-ink border border-border/80',
                      )}
                      aria-hidden="true"
                    >
                      {isIncome ? (
                        <ArrowUpRight className="size-4 text-forest" />
                      ) : (
                        <ArrowDownLeft className="size-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink" title={t.description}>
                        {t.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span className="rounded bg-paper px-1.5 py-0.5 font-medium text-forest-soft border border-border/50">
                          {t.category}
                        </span>
                        <span>•</span>
                        <span>{formattedDate}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        'tabular text-sm font-semibold',
                        isIncome ? 'text-forest' : 'text-ink',
                      )}
                    >
                      {displaySign}₹{formattedAmt}
                    </p>
                    <p className="text-[11px] capitalize text-muted-foreground">
                      {t.transaction_type}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

