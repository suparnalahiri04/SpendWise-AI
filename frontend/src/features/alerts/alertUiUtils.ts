import {
  AlertCircle,
  AlertTriangle,
  Info,
  type LucideIcon,
} from 'lucide-react'
import type { AlertItem } from '@/lib/api/types'

/**
 * Validate that an alert's link_to target is a safe relative internal route.
 * Rejects external URLs, protocol-relative paths, javascript: schemes, and non-slash paths.
 */
export function sanitizeInternalLink(link: string | null | undefined): string | null {
  if (!link || typeof link !== 'string') return null
  const trimmed = link.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null
  if (/\s/.test(trimmed) || /javascript:/i.test(trimmed) || trimmed.includes('\\')) return null
  return trimmed
}

/**
 * Format an ISO timestamp (e.g. 2026-11-03T12:00:00Z) to a readable day-month string.
 */
export function formatAlertDate(dateString: string): string {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return ''
  }
}

export interface AlertVisuals {
  icon: LucideIcon
  iconClass: string
  badgeTone: 'neutral' | 'sage' | 'butter' | 'terracotta' | 'outline'
  badgeLabel: string
}

export function getAlertVisuals(alert: AlertItem): AlertVisuals {
  switch (alert.severity) {
    case 'critical':
      return {
        icon: AlertCircle,
        iconClass: 'bg-terracotta/20 text-[#9a4a33]',
        badgeTone: 'terracotta',
        badgeLabel: 'Critical',
      }
    case 'warning':
      return {
        icon: AlertTriangle,
        iconClass: 'bg-butter text-ink',
        badgeTone: 'butter',
        badgeLabel: 'Warning',
      }
    case 'info':
    default:
      return {
        icon: Info,
        iconClass: 'bg-sage text-forest',
        badgeTone: 'sage',
        badgeLabel: 'Notice',
      }
  }
}

