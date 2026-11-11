import type { ComponentProps, Ref } from 'react'
import { cn } from '@/lib/utils'
import { PennyMascot, type PennyMascotSize } from './PennyMascot'

export interface PennyLauncherProps extends Omit<ComponentProps<'button'>, 'children'> {
  /**
   * Size of the Penny mascot inside the circular launcher.
   * Defaults to 'lg' (40 × 40px inside a 56 × 56px button).
   */
  mascotSize?: PennyMascotSize
  /** Whether the Penny chat panel is currently open. */
  isOpen?: boolean
  /** Forwarded ref for the launcher button element. */
  ref?: Ref<HTMLButtonElement>
}

/**
 * Floating bottom-right launcher button for Penny — Your Personal Money Companion.
 *
 * Stage 1 visual component with Stage 4B controller integration:
 * - Icon-only circular button (56 × 56px touch target) anchored at the bottom-right
 *   with safe-area inset support across mobile, tablet, and desktop viewports.
 * - Uses SpendWise AI's approved warm ivory, deep forest-green, and restrained emerald palette.
 * - Supplies accessible name and native tooltip ("Chat with Penny" while closed, "Close Penny chat" while open).
 * - ARIA attributes: aria-expanded reflecting open state, aria-controls="penny-chat-panel", aria-haspopup="dialog".
 * - Subtle hover elevation and active press feedback, respecting `prefers-reduced-motion`.
 */
export function PennyLauncher({
  mascotSize = 'lg',
  isOpen = false,
  className,
  type = 'button',
  disabled = false,
  ref,
  ...props
}: PennyLauncherProps) {
  const label = props['aria-label'] ?? (isOpen ? 'Close Penny chat' : 'Chat with Penny')
  const title = props.title ?? label

  return (
    <button
      ref={ref}
      data-slot="penny-launcher"
      type={type}
      disabled={disabled}
      aria-label={label}
      title={title}
      aria-expanded={isOpen}
      aria-controls="penny-chat-panel"
      aria-haspopup="dialog"
      className={cn(
        'fixed z-40 right-4 bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] sm:right-6 sm:bottom-6 lg:right-8 lg:bottom-8',
        'inline-flex size-14 items-center justify-center rounded-full',
        'bg-forest text-paper border-2 border-paper ring-1 ring-forest/25 shadow-hero',
        'transition-all duration-200 ease-out',
        'hover:bg-emerald-deep hover:-translate-y-0.5 hover:shadow-popover',
        'active:translate-y-0 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        'motion-reduce:transition-none motion-reduce:hover:transform-none motion-reduce:active:transform-none',
        className,
      )}
      {...props}
    >
      <PennyMascot size={mascotSize} decorative />
    </button>
  )
}

