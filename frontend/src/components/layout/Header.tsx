import { Menu } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { getNavItem } from '@/config/navigation'
import { transitions } from '@/lib/motion'
import { NotificationsMenu } from './NotificationsMenu'
import { PeriodSelector } from './PeriodSelector'
import { ProfileMenu } from './ProfileMenu'

interface HeaderProps {
  onOpenMobileNav: () => void
}

export function Header({ onOpenMobileNav }: HeaderProps) {
  const { pathname } = useLocation()
  const navItem = getNavItem(pathname)
  const title = navItem?.label ?? 'Page not found'
  const description = navItem?.description ?? 'This page does not exist'

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-18 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 lg:hidden"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>

        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={transitions.quick}
            >
              <h1 className="truncate font-display text-2xl leading-tight text-ink">{title}</h1>
              <p className="hidden truncate text-xs text-muted-foreground md:block">
                {description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <PeriodSelector />
          <NotificationsMenu />
          <ProfileMenu />
        </div>
      </div>
    </header>
  )
}

