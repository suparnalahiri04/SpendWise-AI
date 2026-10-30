import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-forest-soft',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-sage-deep',
        accent: 'bg-accent text-accent-foreground hover:bg-butter/80',
        outline:
          'border border-input bg-card text-foreground hover:bg-paper-deep hover:border-sage-deep',
        ghost: 'text-foreground hover:bg-paper-deep',
      },
      size: {
        sm: 'h-9 px-3',
        default: 'h-10 px-4',
        lg: 'h-11 px-6 text-[0.9375rem]',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. a router Link) while keeping button styles. */
  asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

