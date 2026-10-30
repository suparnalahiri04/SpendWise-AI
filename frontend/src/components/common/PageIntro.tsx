import type { ReactNode } from 'react'
import { Reveal } from '@/components/motion/AnimatedPage'
import { cn } from '@/lib/utils'

interface PageIntroProps {
  eyebrow?: string
  title: string
  description: string
  /** Optional controls aligned to the right on wide screens. */
  actions?: ReactNode
  className?: string
}

/** Editorial page heading block in the "Money Journal" style. */
export function PageIntro({ eyebrow, title, description, actions, className }: PageIntroProps) {
  return (
    <Reveal
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-forest-soft">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{title}</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </Reveal>
  )
}

