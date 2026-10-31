import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type StatCardAccent = 'forest' | 'sage' | 'butter' | 'terracotta' | 'hero' | 'emerald'
export type StatCardVariant = 'default' | 'hero' | 'emerald'

const accentClasses: Record<'forest' | 'sage' | 'butter' | 'terracotta', string> = {
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
  accent?: StatCardAccent
  variant?: StatCardVariant
  className?: string
}

export function StatCard({
  label,
  icon: Icon,
  value,
  hint,
  accent = 'sage',
  variant = 'default',
  className,
}: StatCardProps) {
  const hasValue = value !== null
  const isHero = variant === 'hero' || variant === 'emerald' || accent === 'hero' || accent === 'emerald'

  if (isHero) {
    return (
      <Card
        className={cn(
          'gap-4 p-5 bg-gradient-hero border-emerald-950/20 text-paper shadow-hero transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-sage/95">{label}</p>
          <span
            className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-lime-accent border border-white/15 backdrop-blur-xs"
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </span>
        </div>
        <div>
          <p
            className={cn(
              'tabular text-3xl font-semibold tracking-tight',
              hasValue ? 'text-paper' : 'text-paper/60',
            )}
          >
            {hasValue ? value : '—'}
            {!hasValue && <span className="sr-only">No data yet</span>}
          </p>
          <p className="mt-1 text-xs text-sage/80">{hint}</p>
        </div>
      </Card>
    )
  }

  // Standard card variant: accent is narrowed to 'forest' | 'sage' | 'butter' | 'terracotta'
  return (
    <Card
      className={cn(
        'gap-4 p-5 transition-all duration-150 hover:shadow-card hover:border-border/90 motion-reduce:transition-none',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-xl',
            accentClasses[accent],
          )}
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
