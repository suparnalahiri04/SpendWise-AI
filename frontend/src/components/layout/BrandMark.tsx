import { Link } from 'react-router'
import { cn } from '@/lib/utils'

interface BrandMarkProps {
  onNavigate?: () => void
  className?: string
  /** 'default' for light surfaces; 'sidebar' for forest-green sidebar */
  variant?: 'default' | 'sidebar'
}

/** SpendWise AI wordmark — links home. */
export function BrandMark({ onNavigate, className, variant = 'default' }: BrandMarkProps) {
  const isSidebar = variant === 'sidebar'

  return (
    <Link
      to="/overview"
      onClick={onNavigate}
      className={cn(
        'group flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        isSidebar
          ? 'focus-visible:ring-[#F2EBDD] focus-visible:ring-offset-[#123C30]'
          : 'focus-visible:ring-ring focus-visible:ring-offset-background',
        className,
      )}
      aria-label="SpendWise AI — go to Overview"
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-xl font-display text-xl transition-transform duration-150 group-hover:scale-105',
          isSidebar
            ? 'border border-[#2C6E52] bg-[#1A4D3B] text-[#F8F5EE] shadow-sm'
            : 'bg-forest text-butter shadow-card',
        )}
        aria-hidden="true"
      >
        S
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-display text-[1.375rem] transition-colors',
            isSidebar ? 'text-[#F8F5EE]' : 'text-ink',
          )}
        >
          SpendWise
        </span>
        <span
          className={cn(
            'mt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em]',
            isSidebar ? 'text-[#8EAA90]' : 'text-forest-soft',
          )}
        >
          AI · Money Journal
        </span>
      </span>
    </Link>
  )
}

