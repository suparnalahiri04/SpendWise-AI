import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export type PennyMascotSize = 'sm' | 'md' | 'lg' | 'xl'

export interface PennyMascotProps extends Omit<ComponentProps<'svg'>, 'children'> {
  /**
   * Predefined size token for consistent scaling across launcher, header, and message avatars:
   * - 'sm': 24 × 24px (size-6)
   * - 'md': 32 × 32px (size-8, default)
   * - 'lg': 40 × 40px (size-10, launcher default)
   * - 'xl': 56 × 56px (size-14, welcome empty state)
   */
  size?: PennyMascotSize
  /**
   * When true (default), hides the SVG from the accessibility tree (`aria-hidden="true"`)
   * because the parent button or heading supplies the accessible name.
   * When false, exposes `role="img"` with `label`.
   */
  decorative?: boolean
  /** Accessible label used when `decorative` is false. */
  label?: string
}

const SIZE_CLASSES: Record<PennyMascotSize, string> = {
  sm: 'size-6',
  md: 'size-8',
  lg: 'size-10',
  xl: 'size-14',
}

/**
 * Penny — Your Personal Money Companion.
 *
 * Original vector mascot designed for SpendWise AI's "Modern Money Journal" aesthetic:
 * - Warm ivory/cream visage (#FFFDF8 / #F7F4EC) framed by deep forest green (#204B3B)
 *   and restrained emerald (#0C513F / #2D6350).
 * - Minted warm butter-gold (#F0D99A) medallion rim nodding to a classic penny coin.
 * - Organic two-leaf botanical crown sprout in soft sage (#DCE4D3) and emerald (#2D6350).
 * - Crisp, friendly eyes and calm smile engineered to remain legible down to 24 × 24px.
 */
export function PennyMascot({
  size = 'md',
  decorative = true,
  label = 'Penny — Your Personal Money Companion',
  className,
  ...props
}: PennyMascotProps) {
  return (
    <svg
      data-slot="penny-mascot"
      data-size={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
      aria-hidden={decorative ? 'true' : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      className={cn('shrink-0 select-none', SIZE_CLASSES[size], className)}
      {...props}
    >
      {/* Botanical sprout leaves at crown */}
      <path
        d="M32 13C32 7.5 25.5 4 20.5 6C19.5 10.5 24.5 14 32 13Z"
        fill="#DCE4D3"
        stroke="#204B3B"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 13C32 6.8 39 3.5 44.5 6C45 11 39.5 14.2 32 13Z"
        fill="#2D6350"
        stroke="#FFFDF8"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Central sprout stem & warm butter-gold minted bud */}
      <path
        d="M32 15.5V10.5"
        stroke="#F0D99A"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="32" cy="8.5" r="2" fill="#F0D99A" />

      {/* Outer companion medallion body (deep emerald-forest with organic ear/shoulder curves) */}
      <path
        d="M12 28C12 18.5 20.5 13 32 13C43.5 13 52 18.5 52 28C53.5 31.5 54 36 52.5 41.5C50 50.5 42 56 32 56C22 56 14 50.5 11.5 41.5C10 36 10.5 31.5 12 28Z"
        fill="#0C513F"
        stroke="#204B3B"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />

      {/* Subtle minted coin inner ring in warm butter-gold */}
      <circle
        cx="32"
        cy="35"
        r="18.5"
        stroke="#F0D99A"
        strokeWidth="1.2"
        strokeDasharray="3 2.5"
        strokeOpacity="0.7"
      />

      {/* Friendly organic face shield in warm ivory/cream */}
      <path
        d="M16.5 31.5C16.5 24.5 22 20.5 28.5 22C30.2 22.4 31.2 23.2 32 24C32.8 23.2 33.8 22.4 35.5 22C42 20.5 47.5 24.5 47.5 31.5C47.5 41.5 41 48.5 32 48.5C23 48.5 16.5 41.5 16.5 31.5Z"
        fill="#FFFDF8"
        stroke="#DCE4D3"
        strokeWidth="1.25"
      />

      {/* Soft sage brow contour for depth */}
      <path
        d="M21 26.5C24 24.8 27.5 25.2 29.5 26.8M43 26.5C40 24.8 36.5 25.2 34.5 26.8"
        stroke="#2D6350"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeOpacity="0.65"
      />

      {/* Warm butter-gold cheek accents */}
      <ellipse cx="21.5" cy="37" rx="2.8" ry="1.7" fill="#F0D99A" fillOpacity="0.75" />
      <ellipse cx="42.5" cy="37" rx="2.8" ry="1.7" fill="#F0D99A" fillOpacity="0.75" />

      {/* Left eye with warm ivory catchlight */}
      <circle cx="25.2" cy="32.5" r="3.1" fill="#202922" />
      <circle cx="26.2" cy="31.4" r="1.15" fill="#FFFDF8" />
      <circle cx="24.3" cy="33.6" r="0.55" fill="#FFFDF8" fillOpacity="0.8" />

      {/* Right eye with warm ivory catchlight */}
      <circle cx="38.8" cy="32.5" r="3.1" fill="#202922" />
      <circle cx="39.8" cy="31.4" r="1.15" fill="#FFFDF8" />
      <circle cx="37.9" cy="33.6" r="0.55" fill="#FFFDF8" fillOpacity="0.8" />

      {/* Friendly, calm companion smile */}
      <path
        d="M28.2 38.2C29.5 40.3 34.5 40.3 35.8 38.2"
        stroke="#204B3B"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Small minted penny emblem at lower collar */}
      <circle
        cx="32"
        cy="51.5"
        r="2.4"
        fill="#F0D99A"
        stroke="#204B3B"
        strokeWidth="1"
      />
    </svg>
  )
}

