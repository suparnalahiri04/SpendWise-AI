/**
 * Side sheet (drawer) built on Radix Dialog with Motion transitions.
 * Used for mobile navigation. Radix handles focus trapping, Escape to close
 * and returning focus to the trigger.
 */
import { AnimatePresence, motion } from 'motion/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { transitions } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  header?: ReactNode
  children: ReactNode
  className?: string
}

export function Sheet({ open, onOpenChange, header, children, className }: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay forceMount asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transitions.quick}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content forceMount asChild>
              <motion.div
                className={cn(
                  'fixed inset-y-0 left-0 z-50 flex w-[min(19rem,86vw)] flex-col overflow-hidden border-r border-border bg-background shadow-popover outline-none',
                  className,
                )}
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={transitions.drawer}
              >
                {header ? (
                  <div data-slot="sheet-header" className="relative z-20 shrink-0">
                    {header}
                  </div>
                ) : null}
                <div
                  data-slot="sheet-scroll"
                  className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
                >
                  {children}
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('sr-only', className)} {...props} />
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('sr-only', className)} {...props} />
}

export function SheetClose({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close className={cn('z-20', className)} {...props} />
}

