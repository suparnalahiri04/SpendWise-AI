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
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      className="border-r border-[#1B4D3B]/80 bg-gradient-to-b from-[#123C30] via-[#174C39] to-[#23694A] text-[#F8F5EE]"
      header={
        <>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Move between SpendWise AI sections.</SheetDescription>
          <div className="flex items-center justify-end px-3 pt-3 pb-1">
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-[#8EAA90] hover:bg-white/[0.08] hover:text-[#F8F5EE]"
                aria-label="Close navigation"
              >
                <X className="size-5" />
              </Button>
            </SheetClose>
          </div>
        </>
      }
    >
      <SidebarContent
        layoutId="mobile-sidebar"
        onNavigate={() => onOpenChange(false)}
        className="pt-2"
      />
    </Sheet>
  )
}

