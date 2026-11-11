import { describe, expect, it } from 'vitest'
import type { AlertItem } from '@/lib/api/types'
import {
  formatAlertDate,
  getAlertVisuals,
  sanitizeInternalLink,
} from './alertUiUtils'

describe('alertUiUtils', () => {
  describe('sanitizeInternalLink', () => {
    it('accepts valid relative internal paths', () => {
      expect(sanitizeInternalLink('/budgets')).toBe('/budgets')
      expect(sanitizeInternalLink('/recurring-payments')).toBe('/recurring-payments')
      expect(sanitizeInternalLink('/transactions?type=expense')).toBe('/transactions?type=expense')
      expect(sanitizeInternalLink('/overview#summary')).toBe('/overview#summary')
    })

    it('rejects external URLs and schemes', () => {
      expect(sanitizeInternalLink('https://evil.com')).toBeNull()
      expect(sanitizeInternalLink('http://example.com/budgets')).toBeNull()
      expect(sanitizeInternalLink('ftp://files.example.com')).toBeNull()
      expect(sanitizeInternalLink('javascript:alert(1)')).toBeNull()
    })

    it('rejects protocol-relative URLs', () => {
      expect(sanitizeInternalLink('//evil.com')).toBeNull()
      expect(sanitizeInternalLink('//budgets')).toBeNull()
    })

    it('rejects strings without leading slash or with spaces / control chars', () => {
      expect(sanitizeInternalLink('budgets')).toBeNull()
      expect(sanitizeInternalLink('')).toBeNull()
      expect(sanitizeInternalLink('   ')).toBeNull()
      expect(sanitizeInternalLink('/budgets with spaces')).toBeNull()
      expect(sanitizeInternalLink('/budgets\\malicious')).toBeNull()
      expect(sanitizeInternalLink(null)).toBeNull()
      expect(sanitizeInternalLink(undefined)).toBeNull()
    })
  })

  describe('formatAlertDate', () => {
    it('formats valid ISO dates into concise day-month string', () => {
      const result = formatAlertDate('2026-11-03T10:30:00Z')
      expect(result).toMatch(/3 Nov/i)
    })

    it('returns empty string for invalid or missing dates', () => {
      expect(formatAlertDate('')).toBe('')
      expect(formatAlertDate('not-a-date')).toBe('')
    })
  })

  describe('getAlertVisuals', () => {
    const baseAlert: AlertItem = {
      id: 'test:1',
      alert_type: 'budget_exceeded',
      severity: 'critical',
      title: 'Budget Exceeded',
      message: 'Limit exceeded',
      created_at: '2026-11-03T00:00:00Z',
      link_to: '/budgets',
      metadata: {},
    }

    it('returns critical visuals for critical severity', () => {
      const visuals = getAlertVisuals({ ...baseAlert, severity: 'critical' })
      expect(visuals.badgeTone).toBe('terracotta')
      expect(visuals.badgeLabel).toBe('Critical')
      expect(visuals.iconClass).toContain('text-[#9a4a33]')
    })

    it('returns warning visuals for warning severity', () => {
      const visuals = getAlertVisuals({ ...baseAlert, severity: 'warning' })
      expect(visuals.badgeTone).toBe('butter')
      expect(visuals.badgeLabel).toBe('Warning')
      expect(visuals.iconClass).toContain('bg-butter')
    })

    it('returns notice visuals for info or unrecognized severity', () => {
      const visualsInfo = getAlertVisuals({ ...baseAlert, severity: 'info' })
      expect(visualsInfo.badgeTone).toBe('sage')
      expect(visualsInfo.badgeLabel).toBe('Notice')

      const visualsUnknown = getAlertVisuals({ ...baseAlert, severity: 'other' })
      expect(visualsUnknown.badgeTone).toBe('sage')
      expect(visualsUnknown.badgeLabel).toBe('Notice')
    })
  })
})

