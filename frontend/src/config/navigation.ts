import {
  ArrowLeftRight,
  BotMessageSquare,
  Calendar,
  CalendarClock,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Sparkles,
  Target,
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
    label: 'Goals',
    path: '/goals',
    icon: Target,
    description: 'Track targets, milestones and savings progress',
  },
  {
    label: 'Recurring',
    path: '/recurring',
    icon: CalendarClock,
    description: 'Scheduled bills, subscriptions and routines',
  },
  {
    label: 'Calendar',
    path: '/calendar',
    icon: Calendar,
    description: 'Monthly timeline of bills, income and expenses',
  },
  {
    label: 'Reports',
    path: '/reports',
    icon: FileSpreadsheet,
    description: 'Downloadable financial summaries and transaction ledgers',
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

export const ASSISTANT_NAV: NavItem = {
  label: 'Assistant',
  path: '/assistant',
  icon: BotMessageSquare,
  description: 'Ask questions about your finances and budgets',
}

const ALL_NAV: readonly NavItem[] = [...PRIMARY_NAV, SETTINGS_NAV, ASSISTANT_NAV]

/** Find navigation metadata for the current URL path. */
export function getNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
}

