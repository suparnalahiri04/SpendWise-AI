import { UserRound } from 'lucide-react'
import { LayoutGroup } from 'motion/react'
import { PRIMARY_NAV, SETTINGS_NAV } from '@/config/navigation'
import { cn } from '@/lib/utils'
import { BrandMark } from './BrandMark'
import { SidebarNavLink } from './SidebarNavLink'

interface SidebarContentProps {
  /** Unique id so the animated active indicator is scoped to this sidebar instance. */
  layoutId: string
  /** Called after any navigation (used to close the mobile drawer). */
  onNavigate?: () => void
  className?: string
}

/** Sidebar body shared by the desktop sidebar and the mobile drawer. */
export function SidebarContent({ layoutId, onNavigate, className }: SidebarContentProps) {
  return (
    <LayoutGroup id={layoutId}>
      <div className={cn('flex h-full flex-col gap-8 px-4 py-6', className)}>
        <BrandMark onNavigate={onNavigate} className="px-2" />

        <nav aria-label="Main" className="flex-1">
          <p className="mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Journal
          </p>
          <ul className="flex flex-col gap-1">
            {PRIMARY_NAV.map((item) => (
              <li key={item.path}>
                <SidebarNavLink item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <nav aria-label="Account">
            <SidebarNavLink item={SETTINGS_NAV} onNavigate={onNavigate} />
          </nav>
          <div className="flex items-center gap-3 rounded-xl bg-sage/60 px-3 py-3">
            <span
              className="flex size-9 items-center justify-center rounded-full bg-card text-forest"
              aria-hidden="true"
            >
              <UserRound className="size-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-ink">Guest</p>
              <p className="truncate text-xs text-muted-foreground">Not signed in</p>
            </div>
          </div>
        </div>
      </div>
    </LayoutGroup>
  )
}

/** Fixed desktop sidebar (hidden below the lg breakpoint). */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 border-r border-border bg-paper lg:block">
      <SidebarContent layoutId="desktop-sidebar" />
    </aside>
  )
}

