import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Accent = 'forest' | 'sage' | 'butter' | 'terracotta'

const accentClasses: Record<Accent, string> = {
  forest: 'bg-forest text-paper',
  sage: 'bg-sage text-forest',
  butter: 'bg-butter text-ink',
  terracotta: 'bg-terracotta/20 text-[#9a4a33]',
}

interface StatCardProps {
  label: string
  icon: LucideIcon
  /** Formatted value. `null` means no data yet and renders an explicit placeholder. */
  value: string | null
  /** Short supporting line under the value. */
  hint: string
  accent?: Accent
  className?: string
}

export function StatCard({
  label,
  icon: Icon,
  value,
  hint,
  accent = 'sage',
  className,
}: StatCardProps) {
  const hasValue = value !== null
  return (
    <Card className={cn('gap-4 p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn('flex size-9 items-center justify-center rounded-xl', accentClasses[accent])}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div>
        <p
          className={cn(
            'tabular text-3xl font-semibold tracking-tight',
            hasValue ? 'text-ink' : 'text-muted-foreground/60',
          )}
        >
          {hasValue ? value : '—'}
          {!hasValue && <span className="sr-only">No data yet</span>}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
    </Card>
  )
}

