import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as alertsApi from '@/lib/api/alerts'
import type { AlertItem, AlertListResponse } from '@/lib/api/types'
import { notifyFinancialMutation } from './alertEvents'
import { useAlerts } from './useAlerts'

describe('useAlerts hook', () => {
  const mockAlerts: AlertItem[] = [
    {
      id: 'budget:1:2026-11:critical',
      alert_type: 'budget_exceeded',
      severity: 'critical',
      title: 'Budget Exceeded: Dining',
      message: 'You have spent ₹5,250.00 of your ₹5,000.00 budget.',
      created_at: '2026-11-02T00:00:00Z',
      link_to: '/budgets',
      metadata: { budget_id: 1, tier: 'critical' },
    },
    {
      id: 'recurring_upcoming:2:2026-11-03',
      alert_type: 'recurring_upcoming',
      severity: 'info',
      title: 'Upcoming Payment: Gym',
      message: 'Scheduled payment of ₹1,500.00 is due tomorrow.',
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
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetching alerts', () => {
    it('fetches alerts on mount and updates state correctly', async () => {
      const fetchSpy = vi
        .spyOn(alertsApi, 'fetchAlerts')
        .mockResolvedValueOnce(mockListResponse)

      const { result } = renderHook(() => useAlerts())

      expect(result.current.isLoading).toBe(true)
      expect(result.current.alerts).toEqual([])
      expect(result.current.alertCount).toBe(0)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.alerts).toEqual(mockAlerts)
      expect(result.current.alertCount).toBe(2)
      expect(result.current.activeCount).toBe(2)
      expect(result.current.error).toBeNull()
      expect(fetchSpy).toHaveBeenCalledWith(undefined, expect.any(AbortSignal))
    })

    it('passes custom refDate to fetchAlerts when supplied in options', async () => {
      const fetchSpy = vi
        .spyOn(alertsApi, 'fetchAlerts')
        .mockResolvedValueOnce(mockListResponse)

      const { result } = renderHook(() => useAlerts({ refDate: '2026-11-10' }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(fetchSpy).toHaveBeenCalledWith('2026-11-10', expect.any(AbortSignal))
    })

    it('handles empty alert lists with zero counts', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValueOnce({
        alert_count: 0,
        active_count: 0,
        alerts: [],
      })

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.alerts).toEqual([])
      expect(result.current.alertCount).toBe(0)
      expect(result.current.activeCount).toBe(0)
      expect(result.current.error).toBeNull()
    })

    it('handles fetch failure and sets error message', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts').mockRejectedValueOnce(
        new Error('Network error: server unreachable'),
      )

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.error).toBe('Network error: server unreachable')
      expect(result.current.alerts).toEqual([])
      expect(result.current.alertCount).toBe(0)
    })

    it('skips initial fetch if autoFetch is false', async () => {
      const fetchSpy = vi.spyOn(alertsApi, 'fetchAlerts')

      const { result } = renderHook(() => useAlerts({ autoFetch: false }))

      expect(result.current.isLoading).toBe(false)
      expect(result.current.alerts).toEqual([])
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('reloads alerts when reload is invoked', async () => {
      const fetchSpy = vi
        .spyOn(alertsApi, 'fetchAlerts')
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({
          alert_count: 1,
          active_count: 1,
          alerts: [mockAlerts[0]],
        })

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alertCount).toBe(2)
      })

      await act(async () => {
        await result.current.reload()
      })

      await waitFor(() => {
        expect(result.current.alertCount).toBe(1)
      })

      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('dismissing individual alerts', () => {
    it('successfully dismisses single alert and updates alerts and count', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValueOnce(mockListResponse)
      const dismissSpy = vi.spyOn(alertsApi, 'dismissAlert').mockResolvedValueOnce({
        success: true,
        alert_key: 'budget:1:2026-11:critical',
        message: 'Alert dismissed.',
      })

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alerts.length).toBe(2)
      })

      let success: boolean = false
      await act(async () => {
        success = await result.current.dismissAlert('budget:1:2026-11:critical')
      })

      expect(success).toBe(true)
      expect(dismissSpy).toHaveBeenCalledWith('budget:1:2026-11:critical')
      expect(result.current.alerts.length).toBe(1)
      expect(result.current.alertCount).toBe(1)
      expect(result.current.alerts[0].id).toBe('recurring_upcoming:2:2026-11-03')
      expect(result.current.dismissingKeys).toEqual([])
      expect(result.current.isDismissing).toBe(false)
      expect(result.current.dismissError).toBeNull()
    })

    it('preserves alerts when single dismissal fails', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValueOnce(mockListResponse)
      vi.spyOn(alertsApi, 'dismissAlert').mockRejectedValueOnce(
        new Error('Failed to reach server to dismiss.'),
      )

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alerts.length).toBe(2)
      })

      let success: boolean = true
      await act(async () => {
        success = await result.current.dismissAlert('budget:1:2026-11:critical')
      })

      expect(success).toBe(false)
      expect(result.current.alerts.length).toBe(2)
      expect(result.current.alertCount).toBe(2)
      expect(result.current.dismissError).toBe('Failed to reach server to dismiss.')
      expect(result.current.dismissingKeys).toEqual([])
      expect(result.current.isDismissing).toBe(false)
    })

    it('ignores invalid or empty alert keys without making API request', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValueOnce(mockListResponse)
      const dismissSpy = vi.spyOn(alertsApi, 'dismissAlert')

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alerts.length).toBe(2)
      })

      let success: boolean = true
      await act(async () => {
        success = await result.current.dismissAlert('   ')
      })

      expect(success).toBe(false)
      expect(dismissSpy).not.toHaveBeenCalled()
    })

    it('prevents simultaneous duplicate dismissals for the same alert key', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValueOnce(mockListResponse)

      let resolveDismiss: (value: { success: boolean; alert_key: string; message: string }) => void
      const dismissPromise = new Promise<{ success: boolean; alert_key: string; message: string }>(
        (resolve) => {
          resolveDismiss = resolve
        },
      )
      const dismissSpy = vi.spyOn(alertsApi, 'dismissAlert').mockReturnValue(dismissPromise)

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alerts.length).toBe(2)
      })

      let firstCall: Promise<boolean>
      let secondCall: Promise<boolean>

      act(() => {
        firstCall = result.current.dismissAlert('budget:1:2026-11:critical')
        secondCall = result.current.dismissAlert('budget:1:2026-11:critical')
      })

      // Second simultaneous call should be rejected immediately
      const secondResult = await secondCall!
      expect(secondResult).toBe(false)
      expect(dismissSpy).toHaveBeenCalledTimes(1)

      // Resolve the first call
      await act(async () => {
        resolveDismiss!({
          success: true,
          alert_key: 'budget:1:2026-11:critical',
          message: 'Dismissed',
        })
      })

      const firstResult = await firstCall!
      expect(firstResult).toBe(true)
      expect(result.current.alerts.length).toBe(1)
    })
  })

  describe('dismissing all alerts', () => {
    it('successfully dismisses all alerts and clears list and count', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValueOnce(mockListResponse)
      const dismissAllSpy = vi.spyOn(alertsApi, 'dismissAllAlerts').mockResolvedValueOnce({
        success: true,
        dismissed_count: 2,
        message: 'Dismissed 2 alerts.',
      })

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alerts.length).toBe(2)
      })

      let success: boolean = false
      await act(async () => {
        success = await result.current.dismissAll()
      })

      expect(success).toBe(true)
      expect(dismissAllSpy).toHaveBeenCalledWith(undefined)
      expect(result.current.alerts).toEqual([])
      expect(result.current.alertCount).toBe(0)
      expect(result.current.activeCount).toBe(0)
      expect(result.current.isDismissing).toBe(false)
    })

    it('returns true immediately without network call if alert list is already empty', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValueOnce({
        alert_count: 0,
        active_count: 0,
        alerts: [],
      })
      const dismissAllSpy = vi.spyOn(alertsApi, 'dismissAllAlerts')

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let success: boolean = false
      await act(async () => {
        success = await result.current.dismissAll()
      })

      expect(success).toBe(true)
      expect(dismissAllSpy).not.toHaveBeenCalled()
    })

    it('preserves alerts when dismiss-all request fails', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValueOnce(mockListResponse)
      vi.spyOn(alertsApi, 'dismissAllAlerts').mockRejectedValueOnce(
        new Error('Failed to dismiss all alerts.'),
      )

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alerts.length).toBe(2)
      })

      let success: boolean = true
      await act(async () => {
        success = await result.current.dismissAll()
      })

      expect(success).toBe(false)
      expect(result.current.alerts.length).toBe(2)
      expect(result.current.alertCount).toBe(2)
      expect(result.current.dismissError).toBe('Failed to dismiss all alerts.')
      expect(result.current.isDismissing).toBe(false)
    })

    it('prevents concurrent dismissAll and single-alert dismissals', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts').mockResolvedValueOnce(mockListResponse)

      let resolveDismissAll: (value: { success: boolean; dismissed_count: number; message: string }) => void
      const dismissAllPromise = new Promise<{ success: boolean; dismissed_count: number; message: string }>(
        (resolve) => {
          resolveDismissAll = resolve
        },
      )
      vi.spyOn(alertsApi, 'dismissAllAlerts').mockReturnValue(dismissAllPromise)
      const singleDismissSpy = vi.spyOn(alertsApi, 'dismissAlert')

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alerts.length).toBe(2)
      })

      let dismissAllResult: Promise<boolean>
      let singleDismissResult: Promise<boolean>

      act(() => {
        dismissAllResult = result.current.dismissAll()
        // Concurrent attempt to dismiss an individual alert during dismissAll
        singleDismissResult = result.current.dismissAlert('budget:1:2026-11:critical')
      })

      const singleCallSuccess = await singleDismissResult!
      expect(singleCallSuccess).toBe(false)
      expect(singleDismissSpy).not.toHaveBeenCalled()

      await act(async () => {
        resolveDismissAll!({
          success: true,
          dismissed_count: 2,
          message: 'Dismissed 2',
        })
      })

      const allSuccess = await dismissAllResult!
      expect(allSuccess).toBe(true)
      expect(result.current.alerts).toEqual([])
    })
  })

  describe('race conditions and stale request safety', () => {
    it('prevents a stale in-flight fetch from restoring an alert that was dismissed in the meantime', async () => {
      let resolveInitialFetch: (value: AlertListResponse) => void
      const initialFetchPromise = new Promise<AlertListResponse>((resolve) => {
        resolveInitialFetch = resolve
      })

      // Fetch is in flight
      vi.spyOn(alertsApi, 'fetchAlerts').mockReturnValue(initialFetchPromise)
      const dismissSpy = vi.spyOn(alertsApi, 'dismissAlert').mockResolvedValueOnce({
        success: true,
        alert_key: 'budget:1:2026-11:critical',
        message: 'Dismissed',
      })

      const { result } = renderHook(() => useAlerts())
      expect(result.current.isLoading).toBe(true)

      // User dismisses an alert while the initial fetch is still unresolved
      await act(async () => {
        await result.current.dismissAlert('budget:1:2026-11:critical')
      })
      expect(dismissSpy).toHaveBeenCalledWith('budget:1:2026-11:critical')

      // Now the delayed initial fetch finally resolves with the old list (containing the dismissed alert)
      await act(async () => {
        resolveInitialFetch!(mockListResponse)
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // The dismissed alert must NOT be resurrected by the stale fetch response
      expect(result.current.alerts.find((a) => a.id === 'budget:1:2026-11:critical')).toBeUndefined()
      expect(result.current.alerts.length).toBe(1)
      expect(result.current.alertCount).toBe(1)
      expect(result.current.activeCount).toBe(1)
      expect(result.current.alerts[0].id).toBe('recurring_upcoming:2:2026-11-03')
    })

    it('prevents a stale in-flight fetch from restoring alerts after dismissAll', async () => {
      let resolveInitialFetch: (value: AlertListResponse) => void
      const initialFetchPromise = new Promise<AlertListResponse>((resolve) => {
        resolveInitialFetch = resolve
      })

      vi.spyOn(alertsApi, 'fetchAlerts').mockReturnValue(initialFetchPromise)
      vi.spyOn(alertsApi, 'dismissAllAlerts').mockResolvedValueOnce({
        success: true,
        dismissed_count: 2,
        message: 'Dismissed all',
      })

      const { result } = renderHook(() => useAlerts())

      // Execute dismissAll while fetch is in flight
      await act(async () => {
        await result.current.dismissAll()
      })

      // Resolve stale fetch afterwards
      await act(async () => {
        resolveInitialFetch!(mockListResponse)
      })

      expect(result.current.alerts).toEqual([])
      expect(result.current.alertCount).toBe(0)
      expect(result.current.activeCount).toBe(0)
    })
  })

  describe('financial mutation invalidation & silent refresh', () => {
    it('refreshes alerts when a financial mutation event is dispatched', async () => {
      const fetchSpy = vi
        .spyOn(alertsApi, 'fetchAlerts')
        .mockResolvedValueOnce({
          alert_count: 1,
          active_count: 1,
          alerts: [mockAlerts[0]],
        })
        .mockResolvedValueOnce({
          alert_count: 2,
          active_count: 2,
          alerts: mockAlerts,
        })

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alertCount).toBe(1)
      })

      // Dispatch a mutation event
      act(() => {
        notifyFinancialMutation('transaction:created')
      })

      await waitFor(() => {
        expect(result.current.alertCount).toBe(2)
      })

      expect(result.current.alerts).toEqual(mockAlerts)
      expect(result.current.activeCount).toBe(2)
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('does not refresh alerts on financial mutation when autoFetch is false', async () => {
      const fetchSpy = vi.spyOn(alertsApi, 'fetchAlerts')

      renderHook(() => useAlerts({ autoFetch: false }))

      act(() => {
        notifyFinancialMutation('budget:created')
      })

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('preserves dismissed alerts across financial mutation refresh', async () => {
      vi.spyOn(alertsApi, 'fetchAlerts')
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce(mockListResponse) // API still returns both alerts
      vi.spyOn(alertsApi, 'dismissAlert').mockResolvedValueOnce({
        alert_key: mockAlerts[0].id,
        message: 'Dismissed',
        success: true,
      })

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alertCount).toBe(2)
      })

      // Dismiss first alert
      await act(async () => {
        await result.current.dismissAlert(mockAlerts[0].id)
      })

      expect(result.current.alertCount).toBe(1)
      expect(result.current.alerts).toEqual([mockAlerts[1]])

      // Background mutation event fires
      act(() => {
        notifyFinancialMutation('budget:updated')
      })

      await waitFor(() => {
        // First alert must NOT be resurrected
        expect(result.current.alerts).toEqual([mockAlerts[1]])
        expect(result.current.alertCount).toBe(1)
      })
    })

    it('handles multiple rapid mutations by aborting obsolete in-flight requests', async () => {
      let resolveFirst: (val: AlertListResponse) => void
      const firstPromise = new Promise<AlertListResponse>((resolve) => {
        resolveFirst = resolve
      })

      vi.spyOn(alertsApi, 'fetchAlerts')
        .mockResolvedValueOnce(mockListResponse) // mount
        .mockReturnValueOnce(firstPromise) // mutation 1
        .mockResolvedValueOnce({
          alert_count: 0,
          active_count: 0,
          alerts: [],
        }) // mutation 2

      const { result } = renderHook(() => useAlerts())

      await waitFor(() => {
        expect(result.current.alertCount).toBe(2)
      })

      // Fire two rapid mutations
      act(() => {
        notifyFinancialMutation('transaction:created')
      })
      act(() => {
        notifyFinancialMutation('statement:imported')
      })

      // Resolve the obsolete first mutation
      await act(async () => {
        resolveFirst!({
          alert_count: 99,
          active_count: 99,
          alerts: [],
        })
      })

      await waitFor(() => {
        expect(result.current.alertCount).toBe(0)
      })
    })
  })

  describe('unmount safety', () => {
    it('does not update state when component unmounts while request is in flight', async () => {
      let resolveFetch: (value: AlertListResponse) => void
      const fetchPromise = new Promise<AlertListResponse>((resolve) => {
        resolveFetch = resolve
      })
      vi.spyOn(alertsApi, 'fetchAlerts').mockReturnValue(fetchPromise)

      const { unmount } = renderHook(() => useAlerts())

      unmount()

      // Resolve the fetch after unmounting
      await act(async () => {
        resolveFetch!(mockListResponse)
      })

      // If state was updated after unmount, React would emit warning or throw in strict mode
    })
  })
})

