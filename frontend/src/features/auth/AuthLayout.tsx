import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { BrandMark } from '@/components/layout/BrandMark'
import { Card } from '@/components/ui/card'
import { pageVariants } from '@/lib/motion'

interface AuthLayoutProps {
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}

/** Centered, branded frame for the sign-in and registration screens. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <motion.main
        variants={pageVariants}
        initial="initial"
        animate="animate"
        className="flex w-full max-w-md flex-col gap-6"
      >
        <BrandMark className="self-center" />
        <Card className="p-6 sm:p-8">
          <h1 className="font-display text-3xl text-ink">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-6">{children}</div>
        </Card>
        <p className="text-center text-sm text-muted-foreground">{footer}</p>
      </motion.main>
    </div>
  )
}

