import {
  ArrowLeftRight,
  FileText,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  /** Label shown in navigation and as the header page title. */
  label: string
  path: string
  icon: LucideIcon
  /** One-line description shown beneath the header title. */
  description: string
}

export const PRIMARY_NAV: readonly NavItem[] = [
  {
    label: 'Overview',
    path: '/overview',
    icon: LayoutDashboard,
    description: 'Your financial picture at a glance',
  },
  {
    label: 'Transactions',
    path: '/transactions',
    icon: ArrowLeftRight,
    description: 'Every expense and income entry in one ledger',
  },
  {
    label: 'Statements',
    path: '/statements',
    icon: FileText,
    description: 'Bank and card statements you import',
  },
  {
    label: 'Budgets',
    path: '/budgets',
    icon: PiggyBank,
    description: 'Monthly spending limits by category',
  },
  {
    label: 'Insights',
    path: '/insights',
    icon: Sparkles,
    description: 'Patterns, anomalies and forecasts',
  },
]

export const SETTINGS_NAV: NavItem = {
  label: 'Settings',
  path: '/settings',
  icon: Settings,
  description: 'Profile and app preferences',
}

const ALL_NAV: readonly NavItem[] = [...PRIMARY_NAV, SETTINGS_NAV]

/** Find navigation metadata for the current URL path. */
export function getNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
}

