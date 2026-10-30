import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  /** Compact variant for small cards and menus. */
  size?: 'default' | 'compact'
  className?: string
}

/** Clearly labelled placeholder shown wherever real data has not arrived yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'default',
  className,
}: EmptyStateProps) {
  const compact = size === 'compact'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-sage-deep bg-paper/60 text-center',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-10 sm:py-12',
        className,
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full bg-sage text-forest',
          compact ? 'size-9' : 'size-12',
        )}
        aria-hidden="true"
      >
        <Icon className={compact ? 'size-4' : 'size-5'} />
      </span>
      <div className="max-w-sm">
        <p className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}>
          {title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

