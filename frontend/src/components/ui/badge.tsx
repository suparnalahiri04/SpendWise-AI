import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3.5',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        sage: 'bg-secondary text-secondary-foreground',
        butter: 'bg-butter/70 text-ink',
        terracotta: 'bg-terracotta/15 text-[#9a4a33]',
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />
}

