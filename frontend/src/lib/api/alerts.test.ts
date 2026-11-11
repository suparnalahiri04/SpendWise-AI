import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, setTokenProvider } from './client'
import { dismissAlert, dismissAllAlerts, fetchAlerts } from './alerts'
import type { AlertItem, AlertListResponse } from './types'

describe('alerts API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  const mockAlerts: AlertItem[] = [
    {
      id: 'budget:1:2026-11:critical',
      alert_type: 'budget_exceeded',
      severity: 'critical',
      title: 'Budget Exceeded: Dining',
      message: 'You have spent ₹5,250.00 of your ₹5,000.00 budget for Dining (105.0% used).',
      created_at: '2026-11-02T00:00:00Z',
      link_to: '/budgets',
      metadata: { budget_id: 1, percentage_used: 105.0 },
    },
    {
      id: 'recurring_upcoming:2:2026-11-03',
      alert_type: 'recurring_upcoming',
      severity: 'info',
      title: 'Upcoming Payment: Gym',
      message: 'Scheduled monthly payment of ₹1,500.00 for Gym is due tomorrow on 2026-11-03.',
      created_at: '2026-11-03T00:00:00Z',
      link_to: '/recurring',
      metadata: { recurring_payment_id: 2, days_until_due: 1 },
    },
  ]

  const mockListResponse: AlertListResponse = {
    alert_count: 2,
    active_count: 2,
    alerts: mockAlerts,
  }

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setTokenProvider(() => 'test-bearer-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setTokenProvider(() => null)
  })

  describe('fetchAlerts', () => {
    it('fetches active alerts without query params when refDate is omitted', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(mockListResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const result = await fetchAlerts()
      expect(result).toEqual(mockListResponse)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toContain('/alerts/')
      expect(url).not.toContain('ref_date')
      expect(init.headers.Authorization).toBe('Bearer test-bearer-token')
    })

    it('encodes and appends refDate query parameter when provided', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(mockListResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      await fetchAlerts('2026-11-05')
      const [url] = fetchMock.mock.calls[0]
      expect(url).toContain('/alerts/?ref_date=2026-11-05')
    })

    it('returns empty alert lists correctly', async () => {
      const emptyResponse: AlertListResponse = {
        alert_count: 0,
        active_count: 0,
        alerts: [],
      }
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(emptyResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const result = await fetchAlerts()
      expect(result.alert_count).toBe(0)
      expect(result.active_count).toBe(0)
      expect(result.alerts).toEqual([])
    })

    it('throws ApiError on server error', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Internal server error.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      await expect(fetchAlerts()).rejects.toThrow(ApiError)
    })
  })

  describe('dismissAlert', () => {
    it('rejects empty or whitespace-only alert keys with validation error', async () => {
      await expect(dismissAlert('')).rejects.toThrow('Alert key is required.')
      await expect(dismissAlert('   ')).rejects.toThrow('Alert key is required.')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('safely encodes alert keys in path and sends POST request', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            alert_key: 'budget:1:2026-11:critical',
            message: 'Alert dismissed successfully.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const res = await dismissAlert('budget:1:2026-11:critical')
      expect(res.success).toBe(true)
      expect(res.alert_key).toBe('budget:1:2026-11:critical')

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toContain('/alerts/budget%3A1%3A2026-11%3Acritical/dismiss')
      expect(init.method).toBe('POST')
      expect(init.headers.Authorization).toBe('Bearer test-bearer-token')
    })

    it('propagates ApiError on dismissal rejection', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Invalid alert key.' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      await expect(dismissAlert('invalid-key')).rejects.toThrow(ApiError)
    })
  })

  describe('dismissAllAlerts', () => {
    it('sends POST to /alerts/dismiss-all without query params when refDate is omitted', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            dismissed_count: 2,
            message: 'Dismissed 2 alerts.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const res = await dismissAllAlerts()
      expect(res.success).toBe(true)
      expect(res.dismissed_count).toBe(2)

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toContain('/alerts/dismiss-all')
      expect(url).not.toContain('ref_date')
      expect(init.method).toBe('POST')
    })

    it('encodes and appends refDate query parameter to dismiss-all when provided', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            dismissed_count: 0,
            message: 'Dismissed 0 alerts.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      await dismissAllAlerts('2026-11-10')
      const [url] = fetchMock.mock.calls[0]
      expect(url).toContain('/alerts/dismiss-all?ref_date=2026-11-10')
    })
  })
})

