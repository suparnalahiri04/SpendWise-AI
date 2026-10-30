import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { SidebarContent } from './Sidebar'

interface MobileNavProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Slide-in navigation drawer for small screens. */
export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTitle>Navigation</SheetTitle>
      <SheetDescription>Move between SpendWise AI sections.</SheetDescription>
      <SheetClose asChild>
        <Button variant="ghost" size="icon" className="absolute right-3 top-5" aria-label="Close navigation">
          <X />
        </Button>
      </SheetClose>
      <SidebarContent layoutId="mobile-sidebar" onNavigate={() => onOpenChange(false)} />
    </Sheet>
  )
}

