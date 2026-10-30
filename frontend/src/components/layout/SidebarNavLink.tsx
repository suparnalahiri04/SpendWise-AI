import { motion } from 'motion/react'
import { NavLink } from 'react-router'
import type { NavItem } from '@/config/navigation'
import { transitions } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface SidebarNavLinkProps {
  item: NavItem
  onNavigate?: () => void
}

/**
 * A sidebar navigation entry. The active background is a shared-layout
 * element, so it glides between entries when the route changes. Wrap groups of
 * links in a <LayoutGroup id="..."> so multiple sidebars never share it.
 */
export function SidebarNavLink({ item, onNavigate }: SidebarNavLinkProps) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-colors duration-150',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isActive ? 'text-paper' : 'text-ink/75 hover:bg-paper-deep hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-xl bg-forest shadow-card"
              transition={transitions.indicator}
              aria-hidden="true"
            />
          )}
          <Icon
            className={cn('relative size-[1.125rem]', isActive ? 'text-butter' : 'text-forest-soft')}
            aria-hidden="true"
          />
          <span className="relative">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

