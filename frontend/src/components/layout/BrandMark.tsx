import { Link } from 'react-router'
import { cn } from '@/lib/utils'

interface BrandMarkProps {
  onNavigate?: () => void
  className?: string
}

/** SpendWise AI wordmark — links home. */
export function BrandMark({ onNavigate, className }: BrandMarkProps) {
  return (
    <Link
      to="/overview"
      onClick={onNavigate}
      className={cn('group flex items-center gap-3 rounded-xl outline-none', className)}
      aria-label="SpendWise AI — go to Overview"
    >
      <span
        className="flex size-10 items-center justify-center rounded-xl bg-forest font-display text-xl text-butter shadow-card"
        aria-hidden="true"
      >
        S
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.375rem] text-ink">SpendWise</span>
        <span className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-forest-soft">
          AI · Money Journal
        </span>
      </span>
    </Link>
  )
}

