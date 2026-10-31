/**
 * Shared animation conventions for SpendWise AI.
 *
 * - Keep motion subtle: short distances (4–12px), short durations (150–400ms).
 * - Reduced motion is respected globally via <MotionConfig reducedMotion="user">
 *   in App.tsx: transform animations are skipped and only opacity fades remain.
 * - Continuous/ambient animations are intentionally not defined yet.
 */
import type { Transition, Variants } from 'motion/react'

type CubicBezier = [number, number, number, number]

/** Calm "settle" curve used across the app. */
export const EASE_OUT: CubicBezier = [0.22, 1, 0.36, 1]

export const transitions = {
  quick: { duration: 0.16, ease: EASE_OUT },
  page: { duration: 0.28, ease: EASE_OUT },
  gentle: { duration: 0.4, ease: EASE_OUT },
  drawer: { type: 'spring', stiffness: 420, damping: 40 },
  indicator: { type: 'spring', stiffness: 500, damping: 38 },
} satisfies Record<string, Transition>

/** Page-level transition. Children using `revealVariants` are staggered in. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { ...transitions.page, staggerChildren: 0.06, delayChildren: 0.04 },
  },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14, ease: EASE_OUT } },
}

/** Gentle entrance for major content sections (inherits timing from a parent). */
export const revealVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: transitions.gentle },
}

/** Dropdown / popover entrance and exit. */
export const popoverMotion = {
  initial: { opacity: 0, y: -4, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98 },
  transition: transitions.quick,
} as const

