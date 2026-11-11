/**
 * Dropdown menu built on Radix UI primitives (shadcn/ui structure) with
 * Motion-powered enter/exit transitions. Radix provides keyboard navigation,
 * focus management and ARIA semantics.
 */
import { Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react'
import { popoverMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'

const OpenContext = createContext(false)

interface DropdownMenuProps {
  children: ReactNode
  /** Non-modal by default so page scrolling is not locked while open. */
  modal?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DropdownMenu({
  children,
  modal = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: DropdownMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(next)
    }
    controlledOnOpenChange?.(next)
  }

  return (
    <OpenContext.Provider value={open}>
      <DropdownMenuPrimitive.Root open={open} onOpenChange={handleOpenChange} modal={modal}>
        {children}
      </DropdownMenuPrimitive.Root>
    </OpenContext.Provider>
  )
}

export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

type ContentProps = Omit<
  ComponentProps<typeof DropdownMenuPrimitive.Content>,
  'asChild' | 'forceMount'
>

export function DropdownMenuContent({
  className,
  children,
  align = 'end',
  sideOffset = 8,
  ...props
}: ContentProps) {
  const open = useContext(OpenContext)
  return (
    <AnimatePresence>
      {open && (
        <DropdownMenuPrimitive.Portal forceMount>
          <DropdownMenuPrimitive.Content
            forceMount
            asChild
            align={align}
            sideOffset={sideOffset}
            {...props}
          >
            <motion.div
              {...popoverMotion}
              style={{ transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)' }}
              className={cn(
                'z-50 min-w-48 overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-popover outline-none',
                className,
              )}
            >
              {children}
            </motion.div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      )}
    </AnimatePresence>
  )
}

const itemClasses =
  'relative flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-paper-deep data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground'

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return <DropdownMenuPrimitive.Item className={cn(itemClasses, className)} {...props} />
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2.5 py-2 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1.5 my-1.5 h-px bg-border', className)}
      {...props}
    />
  )
}

export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(itemClasses, 'pr-8', className)} {...props}>
      {children}
      <DropdownMenuPrimitive.ItemIndicator className="absolute right-2.5 flex items-center">
        <Check className="text-forest!" aria-hidden="true" />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  )
}

