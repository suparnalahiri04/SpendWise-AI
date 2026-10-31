import { Ban, Calendar, Pencil, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { RecurringPayment } from '@/lib/api/types'
import { formatAmount, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatFrequency, getDueStatus } from './recurringUtils'

interface RecurringPaymentCardProps {
  payment: RecurringPayment
  onEdit: (payment: RecurringPayment) => void
  onCancel: (payment: RecurringPayment) => void
}

export function RecurringPaymentCard({ payment, onEdit, onCancel }: RecurringPaymentCardProps) {
  const dueStatus = getDueStatus(payment)
  const isCancelled = payment.status === 'cancelled' || !payment.is_active

  return (
    <Card
      className={cn(
        'p-5 gap-3 transition-shadow hover:shadow-card',
        dueStatus.isOverdue && 'border-terracotta/40 bg-terracotta/[0.02]',
        isCancelled && 'opacity-70 bg-paper/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-ink">{payment.description}</h4>
            <Badge tone={dueStatus.tone}>{dueStatus.label}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-ink">
              <Tag className="size-3 text-muted-foreground" aria-hidden="true" />
              {payment.category}
            </span>
            <span>•</span>
            <span>{formatFrequency(payment.frequency)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground hover:text-ink"
            aria-label={`Edit ${payment.description} schedule`}
            onClick={() => onEdit(payment)}
          >
            <Pencil className="size-3.5" />
          </Button>

          {!isCancelled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
              aria-label={`Cancel ${payment.description} schedule`}
              onClick={() => onCancel(payment)}
            >
              <Ban className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-baseline justify-between pt-2 border-t border-border/40">
        <div>
          <span className="text-xs text-muted-foreground">Next due date:</span>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Calendar className="size-3.5 text-forest" aria-hidden="true" />
            {formatDate(payment.next_due_date)}
          </p>
        </div>

        <div className="text-right">
          <span className="text-xs text-muted-foreground">Amount</span>
          <p className="text-lg font-bold text-ink tabular">
            ₹{formatAmount(payment.amount)}
            <span className="text-xs font-normal text-muted-foreground ml-1">
              /{payment.frequency === 'weekly' ? 'wk' : payment.frequency === 'monthly' ? 'mo' : payment.frequency === 'quarterly' ? 'qtr' : 'yr'}
            </span>
          </p>
        </div>
      </div>
    </Card>
  )
}

