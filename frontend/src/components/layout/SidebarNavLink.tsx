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
 * element, so it glides between entries when the route changes.
 */
export function SidebarNavLink({ item, onNavigate }: SidebarNavLinkProps) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-colors duration-150',
          'focus-visible:ring-2 focus-visible:ring-[#F2EBDD] focus-visible:ring-offset-2 focus-visible:ring-offset-[#123C30]',
          isActive
            ? 'text-[#123C30]'
            : 'text-[#F8F5EE]/90 hover:bg-white/[0.08] hover:text-[#FFFFFF]',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-xl bg-[#F2EBDD] shadow-sm"
              transition={transitions.indicator}
              aria-hidden="true"
            />
          )}
          <Icon
            className={cn(
              'relative size-[1.125rem] shrink-0 transition-colors duration-150',
              isActive
                ? 'text-[#123C30]'
                : 'text-[#8EAA90] group-hover:text-[#A8C6AB]',
            )}
            aria-hidden="true"
          />
          <span className={cn('relative truncate', isActive && 'font-semibold text-[#123C30]')}>
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  )
}

