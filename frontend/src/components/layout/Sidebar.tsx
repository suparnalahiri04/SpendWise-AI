import { LogOut, UserRound } from 'lucide-react'
import { LayoutGroup } from 'motion/react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { PRIMARY_NAV, SETTINGS_NAV } from '@/config/navigation'
import { useAuth } from '@/features/auth/auth'
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
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = () => {
    onNavigate?.()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <LayoutGroup id={layoutId}>
      <div className={cn('flex min-h-full shrink-0 flex-col gap-8 px-4 py-6', className)}>
        <BrandMark onNavigate={onNavigate} className="px-2" variant="sidebar" />

        <nav aria-label="Main" className="flex-1">
          <p className="mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[#8EAA90]">
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

        <div className="flex flex-col gap-3 border-t border-[#8EAA90]/25 pt-4">
          <nav aria-label="Account">
            <SidebarNavLink item={SETTINGS_NAV} onNavigate={onNavigate} />
          </nav>
          <div className="flex items-center gap-3 rounded-xl border border-[#3C9870]/40 bg-[#2D7D5B]/70 px-3 py-3 backdrop-blur-sm shadow-sm">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F8F5EE] text-[#123C30] shadow-sm"
              aria-hidden="true"
            >
              <UserRound className="size-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-semibold uppercase tracking-wider text-[#A3C4A7]">Signed in</p>
              <p className="truncate text-xs font-medium text-[#F8F5EE]">{user?.email ?? 'Your account'}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="size-9 shrink-0 rounded-lg text-[#D7E6D9] hover:bg-white/[0.12] hover:text-[#F8F5EE] focus-visible:ring-[#F2EBDD] focus-visible:ring-offset-2 focus-visible:ring-offset-[#174C39]"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </LayoutGroup>
  )
}

/** Fixed desktop sidebar (hidden below the lg breakpoint). */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 overflow-y-auto overflow-x-hidden border-r border-[#1B4D3B]/80 bg-gradient-to-b from-[#123C30] via-[#174C39] to-[#23694A] text-[#F8F5EE] shadow-sm lg:block">
      <SidebarContent layoutId="desktop-sidebar" />
    </aside>
  )
}

