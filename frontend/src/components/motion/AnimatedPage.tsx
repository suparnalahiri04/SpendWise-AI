import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { pageVariants, revealVariants } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface MotionWrapperProps {
  children: ReactNode
  className?: string
}

/** Wraps a whole page: subtle fade/slide on route change and staggers its <Reveal> children. */
export function AnimatedPage({ children, className }: MotionWrapperProps) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn('flex flex-col gap-6', className)}
    >
      {children}
    </motion.div>
  )
}

/** Gentle entrance for a major content section. Must be inside <AnimatedPage>. */
export function Reveal({ children, className }: MotionWrapperProps) {
  return (
    <motion.div variants={revealVariants} className={className}>
      {children}
    </motion.div>
  )
}

