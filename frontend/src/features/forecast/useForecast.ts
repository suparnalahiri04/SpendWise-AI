import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbortError } from '@/lib/api/client'
import { fetchForecast } from '@/lib/api/forecast'
import type {
  ForecastConfidenceLevel,
  ForecastSummaryResponse,
} from '@/lib/api/types'

export interface UseForecastOptions {
  horizonMonths?: number
  refDate?: string
  autoFetch?: boolean
}

export interface UseForecastReturn {
  forecast: ForecastSummaryResponse | null
  isLoading: boolean
  error: string | null
  horizonMonths: number
  setHorizonMonths: (horizon: number) => void
  reload: () => Promise<void>
  confidenceLevel: ForecastConfidenceLevel | null
  confidenceScore: number | null
  hasInsufficientHistory: boolean
  historyMonthsCount: number
}

function clampHorizon(val?: number): number {
  if (val === undefined || val === null || Number.isNaN(Number(val))) {
    return 3
  }
  return Math.min(6, Math.max(1, Math.round(Number(val))))
}

export function useForecast(options: UseForecastOptions = {}): UseForecastReturn {
  const { refDate, autoFetch = true } = options
  const initialHorizon = clampHorizon(options.horizonMonths)

  const [horizonMonths, setHorizonMonthsState] = useState<number>(initialHorizon)
  const [forecast, setForecast] = useState<ForecastSummaryResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState<number>(0)

  // Tracking refs to prevent race conditions, ignore outdated responses, and ensure unmount safety
  const activeRequestIdRef = useRef<number>(0)
  const inFlightControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef<boolean>(true)
  const prevRefDateRef = useRef<string | undefined>(refDate)

  // Sync external horizonMonths if changed by caller
  useEffect(() => {
    if (options.horizonMonths !== undefined && options.horizonMonths !== null) {
      const nextClamped = clampHorizon(options.horizonMonths)
      setHorizonMonthsState((prev) => {
        if (prev !== nextClamped) {
          // Clear stale forecast when horizon changes externally
          setForecast(null)
          setIsLoading(true)
          setError(null)
          return nextClamped
        }
        return prev
      })
    }
  }, [options.horizonMonths])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      inFlightControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    if (!autoFetch) {
      setIsLoading(false)
      return
    }

    // Clear stale forecast if refDate changed
    if (prevRefDateRef.current !== refDate) {
      setForecast(null)
      prevRefDateRef.current = refDate
    }

    const controller = new AbortController()
    inFlightControllerRef.current = controller
    const requestId = ++activeRequestIdRef.current

    setIsLoading(true)
    setError(null)

    fetchForecast(
      {
        horizon_months: horizonMonths,
        ref_date: refDate,
      },
      controller.signal,
    )
      .then((data) => {
        if (!isMountedRef.current || activeRequestIdRef.current !== requestId) return
        setForecast(data)
        setError(null)
        setIsLoading(false)
      })
      .catch((err) => {
        if (isAbortError(err, controller.signal)) return
        if (!isMountedRef.current || activeRequestIdRef.current !== requestId) return
        const msg = err instanceof Error ? err.message : 'Failed to load financial forecast.'
        setError(msg)
        setForecast(null) // Never leave stale forecast data presented as current on error
        setIsLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [horizonMonths, refDate, autoFetch, reloadToken])

  const setHorizonMonths = useCallback((horizon: number) => {
    const clamped = clampHorizon(horizon)
    setHorizonMonthsState((prev) => {
      if (prev === clamped) {
        return prev // Prevent unnecessary duplicate fetch
      }
      // Immediately clear stale forecast data for previous horizon
      setForecast(null)
      setIsLoading(true)
      setError(null)
      return clamped
    })
  }, [])

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    setReloadToken((t) => t + 1)
  }, [])

  const confidenceLevel = forecast?.confidence_level ?? null
  const confidenceScore = forecast?.confidence_score ?? null
  const historyMonthsCount = forecast?.history_months_count ?? 0
  const hasInsufficientHistory = Boolean(
    forecast && (forecast.history_months_count < 2 || forecast.confidence_level === 'low'),
  )

  return {
    forecast,
    isLoading,
    error,
    horizonMonths,
    setHorizonMonths,
    reload,
    confidenceLevel,
    confidenceScore,
    hasInsufficientHistory,
    historyMonthsCount,
  }
}

