import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbortError } from '@/lib/api/client'
import {
  dismissAlert as dismissAlertApi,
  dismissAllAlerts as dismissAllAlertsApi,
  fetchAlerts,
} from '@/lib/api/alerts'
import type { AlertItem } from '@/lib/api/types'
import { subscribeFinancialMutation } from './alertEvents'

export interface ReloadOptions {
  silent?: boolean
}

export interface UseAlertsOptions {
  refDate?: string
  autoFetch?: boolean
}

export interface UseAlertsReturn {
  alerts: AlertItem[]
  alertCount: number
  activeCount: number
  isLoading: boolean
  isDismissing: boolean
  dismissingKeys: string[]
  error: string | null
  dismissError: string | null
  dismissAlert: (alertKey: string) => Promise<boolean>
  dismissAll: () => Promise<boolean>
  reload: (options?: ReloadOptions) => Promise<void>
}

export function useAlerts(options: UseAlertsOptions = {}): UseAlertsReturn {
  const { refDate, autoFetch = true } = options

  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [alertCount, setAlertCount] = useState<number>(0)
  const [activeCount, setActiveCount] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch)
  const [error, setError] = useState<string | null>(null)

  const [dismissingKeys, setDismissingKeys] = useState<string[]>([])
  const [isDismissingAll, setIsDismissingAll] = useState<boolean>(false)
  const [dismissError, setDismissError] = useState<string | null>(null)

  const [reloadToken, setReloadToken] = useState<number>(0)

  // Tracking refs to prevent duplicate simultaneous requests, handle in-flight cancellation, and avoid resurrection
  const activeRequestIdRef = useRef<number>(0)
  const inFlightControllerRef = useRef<AbortController | null>(null)
  const persistedDismissedKeysRef = useRef<Set<string>>(new Set())
  const dismissAllCompletedRef = useRef<boolean>(false)
  const dismissingKeysRef = useRef<Set<string>>(new Set())
  const isDismissingAllRef = useRef<boolean>(false)
  const isMountedRef = useRef<boolean>(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      inFlightControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!autoFetch) {
      return
    }

    const controller = new AbortController()
    inFlightControllerRef.current = controller
    const requestId = ++activeRequestIdRef.current

    fetchAlerts(refDate, controller.signal)
      .then((data) => {
        if (!isMountedRef.current || activeRequestIdRef.current !== requestId) return
        if (dismissAllCompletedRef.current) {
          setAlerts([])
          setAlertCount(0)
          setActiveCount(0)
          setError(null)
          setIsLoading(false)
          return
        }

        // Filter out any alerts that were dismissed while this fetch was in flight
        const freshAlerts = (data.alerts ?? []).filter(
          (item) => !persistedDismissedKeysRef.current.has(item.id),
        )
        setAlerts(freshAlerts)
        setAlertCount(freshAlerts.length)
        setActiveCount(freshAlerts.length)
        setError(null)
        setIsLoading(false)
      })
      .catch((err) => {
        if (isAbortError(err, controller.signal)) return
        if (!isMountedRef.current || activeRequestIdRef.current !== requestId) return
        const msg = err instanceof Error ? err.message : 'Failed to load financial alerts.'
        setError(msg)
        setIsLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [refDate, autoFetch, reloadToken])

  const reload = useCallback(async (options?: ReloadOptions): Promise<void> => {
    if (!options?.silent) {
      setIsLoading(true)
    }
    setError(null)
    dismissAllCompletedRef.current = false
    setReloadToken((t) => t + 1)
  }, [])

  useEffect(() => {
    if (!autoFetch) return

    const unsubscribe = subscribeFinancialMutation(() => {
      if (isMountedRef.current) {
        void reload({ silent: true })
      }
    })

    return unsubscribe
  }, [autoFetch, reload])

  const dismissAlert = useCallback(
    async (alertKey: string): Promise<boolean> => {
      const trimmedKey = alertKey?.trim()
      if (!trimmedKey) return false

      // Prevent duplicate simultaneous dismissals for the same key or during dismissAll
      if (
        dismissingKeysRef.current.has(trimmedKey) ||
        isDismissingAllRef.current
      ) {
        return false
      }

      dismissingKeysRef.current.add(trimmedKey)
      setDismissingKeys(Array.from(dismissingKeysRef.current))
      setDismissError(null)

      try {
        const response = await dismissAlertApi(trimmedKey)
        if (response.success && isMountedRef.current) {
          // Record key to prevent any in-flight fetch from resurrecting it
          persistedDismissedKeysRef.current.add(trimmedKey)
          setAlerts((prev) => {
            const next = prev.filter((item) => item.id !== trimmedKey)
            setAlertCount(next.length)
            setActiveCount(next.length)
            return next
          })
        }
        return response.success
      } catch (err) {
        if (isMountedRef.current) {
          const msg =
            err instanceof Error ? err.message : 'Failed to dismiss alert.'
          setDismissError(msg)
        }
        return false
      } finally {
        dismissingKeysRef.current.delete(trimmedKey)
        if (isMountedRef.current) {
          setDismissingKeys(Array.from(dismissingKeysRef.current))
        }
      }
    },
    [],
  )

  const dismissAll = useCallback(async (): Promise<boolean> => {
    // Prevent duplicate simultaneous dismiss-all requests or while other dismissals are pending
    if (isDismissingAllRef.current || dismissingKeysRef.current.size > 0) {
      return false
    }

    if (alerts.length === 0 && !isLoading) {
      return true
    }

    isDismissingAllRef.current = true
    setIsDismissingAll(true)
    setDismissError(null)

    try {
      const response = await dismissAllAlertsApi(refDate)
      if (response.success && isMountedRef.current) {
        // Abort any in-flight fetch and invalidate its sequence
        inFlightControllerRef.current?.abort()
        activeRequestIdRef.current++
        dismissAllCompletedRef.current = true
        // Record all current alerts as dismissed so stale responses cannot resurrect them
        alerts.forEach((item) => persistedDismissedKeysRef.current.add(item.id))
        setAlerts([])
        setAlertCount(0)
        setActiveCount(0)
      }
      return response.success
    } catch (err) {
      if (isMountedRef.current) {
        const msg =
          err instanceof Error ? err.message : 'Failed to dismiss all alerts.'
        setDismissError(msg)
      }
      return false
    } finally {
      isDismissingAllRef.current = false
      if (isMountedRef.current) {
        setIsDismissingAll(false)
      }
    }
  }, [alerts, isLoading, refDate])

  const isDismissing = isDismissingAll || dismissingKeys.length > 0

  return {
    alerts,
    alertCount,
    activeCount,
    isLoading,
    isDismissing,
    dismissingKeys,
    error,
    dismissError,
    dismissAlert,
    dismissAll,
    reload,
  }
}
