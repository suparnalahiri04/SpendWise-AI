import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as forecastApi from '@/lib/api/forecast'
import type { ForecastSummaryResponse } from '@/lib/api/types'
import { useForecast } from './useForecast'

describe('useForecast hook', () => {
  const mockForecastResponse: ForecastSummaryResponse = {
    horizon_months: 3,
    reference_date: '2026-11-15',
    confidence_level: 'high',
    confidence_score: 0.85,
    history_months_count: 3,
    current_month_forecast: {
      month: '2026-11',
      month_label: 'November 2026',
      is_current_month: true,
      is_historical: false,
      actual_amount: '3500.00',
      predicted_amount: '7500.00',
      lower_bound: '6800.00',
      upper_bound: '8200.00',
      fixed_commitments: '3000.00',
      variable_estimate: '4500.00',
    },
    monthly_forecasts: [
      {
        month: '2026-11',
        month_label: 'November 2026',
        is_current_month: true,
        is_historical: false,
        actual_amount: '3500.00',
        predicted_amount: '7500.00',
        lower_bound: '6800.00',
        upper_bound: '8200.00',
        fixed_commitments: '3000.00',
        variable_estimate: '4500.00',
      },
      {
        month: '2026-12',
        month_label: 'December 2026',
        is_current_month: false,
        is_historical: false,
        actual_amount: null,
        predicted_amount: '8000.00',
        lower_bound: '7000.00',
        upper_bound: '9000.00',
        fixed_commitments: '3000.00',
        variable_estimate: '5000.00',
      },
    ],
    category_forecasts: [
      {
        category: 'Housing',
        predicted_amount: '3000.00',
        percentage: 37.5,
        fixed_amount: '3000.00',
        variable_amount: '0.00',
      },
      {
        category: 'Dining',
        predicted_amount: '2500.00',
        percentage: 31.3,
        fixed_amount: '0.00',
        variable_amount: '2500.00',
      },
    ],
    methodology_notes: ['3-month recency-weighted moving average'],
    limitations: ['Projections are statistical estimates'],
  }

  const mockColdStartResponse: ForecastSummaryResponse = {
    horizon_months: 3,
    reference_date: '2026-11-15',
    confidence_level: 'low',
    confidence_score: 0.30,
    history_months_count: 0,
    current_month_forecast: {
      month: '2026-11',
      month_label: 'November 2026',
      is_current_month: true,
      is_historical: false,
      actual_amount: '0.00',
      predicted_amount: '0.00',
      lower_bound: '0.00',
      upper_bound: '0.00',
      fixed_commitments: '0.00',
      variable_estimate: '0.00',
    },
    monthly_forecasts: [],
    category_forecasts: [],
    methodology_notes: ['Cold-start: zero historical monthly transactions available.'],
    limitations: ['Limited transaction history available (<2 months)'],
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial fetching and loading state', () => {
    it('fetches forecast on mount and sets state correctly', async () => {
      const fetchSpy = vi
        .spyOn(forecastApi, 'fetchForecast')
        .mockResolvedValueOnce(mockForecastResponse)

      const { result } = renderHook(() => useForecast())

      expect(result.current.isLoading).toBe(true)
      expect(result.current.forecast).toBeNull()
      expect(result.current.error).toBeNull()

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.forecast).toEqual(mockForecastResponse)
      expect(result.current.confidenceLevel).toBe('high')
      expect(result.current.confidenceScore).toBe(0.85)
      expect(result.current.hasInsufficientHistory).toBe(false)
      expect(result.current.historyMonthsCount).toBe(3)
      expect(result.current.error).toBeNull()
      expect(fetchSpy).toHaveBeenCalledWith(
        { horizon_months: 3, ref_date: undefined },
        expect.any(AbortSignal),
      )
    })

    it('passes custom horizonMonths and refDate options', async () => {
      const fetchSpy = vi
        .spyOn(forecastApi, 'fetchForecast')
        .mockResolvedValueOnce(mockForecastResponse)

      const { result } = renderHook(() =>
        useForecast({ horizonMonths: 5, refDate: '2026-11-20' }),
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.horizonMonths).toBe(5)
      expect(fetchSpy).toHaveBeenCalledWith(
        { horizon_months: 5, ref_date: '2026-11-20' },
        expect.any(AbortSignal),
      )
    })

    it('respects autoFetch: false and does not fetch on mount', async () => {
      const fetchSpy = vi.spyOn(forecastApi, 'fetchForecast')

      const { result } = renderHook(() => useForecast({ autoFetch: false }))

      expect(result.current.isLoading).toBe(false)
      expect(result.current.forecast).toBeNull()
      expect(result.current.error).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('insufficient history and cold-start handling', () => {
    it('identifies cold-start and low-confidence responses accurately', async () => {
      vi.spyOn(forecastApi, 'fetchForecast').mockResolvedValueOnce(mockColdStartResponse)

      const { result } = renderHook(() => useForecast())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.forecast).toEqual(mockColdStartResponse)
      expect(result.current.confidenceLevel).toBe('low')
      expect(result.current.confidenceScore).toBe(0.30)
      expect(result.current.historyMonthsCount).toBe(0)
      expect(result.current.hasInsufficientHistory).toBe(true)
    })
  })

  describe('horizon modification and duplicate request prevention', () => {
    it('updates horizon, clears stale forecast while loading, and fetches new data', async () => {
      const updatedResponse: ForecastSummaryResponse = {
        ...mockForecastResponse,
        horizon_months: 6,
      }

      vi.spyOn(forecastApi, 'fetchForecast')
        .mockResolvedValueOnce(mockForecastResponse)
        .mockResolvedValueOnce(updatedResponse)

      const { result } = renderHook(() => useForecast())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
      expect(result.current.forecast?.horizon_months).toBe(3)

      // Change horizon to 6
      act(() => {
        result.current.setHorizonMonths(6)
      })

      // Stale forecast is cleared immediately so previous horizon data is not presented as current
      expect(result.current.forecast).toBeNull()
      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.horizonMonths).toBe(6)
      expect(result.current.forecast?.horizon_months).toBe(6)
    })

    it('clamps requested horizon between 1 and 6', async () => {
      vi.spyOn(forecastApi, 'fetchForecast').mockResolvedValue(mockForecastResponse)

      const { result } = renderHook(() => useForecast())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.setHorizonMonths(12) // exceeds max 6
      })
      expect(result.current.horizonMonths).toBe(6)

      act(() => {
        result.current.setHorizonMonths(-2) // below min 1
      })
      expect(result.current.horizonMonths).toBe(1)
    })

    it('does not re-fetch when setHorizonMonths is called with the current horizon', async () => {
      const fetchSpy = vi
        .spyOn(forecastApi, 'fetchForecast')
        .mockResolvedValue(mockForecastResponse)

      const { result } = renderHook(() => useForecast({ horizonMonths: 3 }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      act(() => {
        result.current.setHorizonMonths(3) // same value
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('reloading', () => {
    it('reloads forecast when reload is called', async () => {
      const fetchSpy = vi
        .spyOn(forecastApi, 'fetchForecast')
        .mockResolvedValue(mockForecastResponse)

      const { result } = renderHook(() => useForecast())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      await act(async () => {
        await result.current.reload()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(result.current.forecast).toEqual(mockForecastResponse)
    })
  })

  describe('error handling and stale data protection', () => {
    it('sets error and clears stale forecast on request failure', async () => {
      vi.spyOn(forecastApi, 'fetchForecast')
        .mockResolvedValueOnce(mockForecastResponse)
        .mockRejectedValueOnce(new Error('Network error: server unreachable'))

      const { result } = renderHook(() => useForecast())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
      expect(result.current.forecast).not.toBeNull()

      // Trigger reload which will fail
      await act(async () => {
        await result.current.reload()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Must NOT leave stale forecast presented as current
      expect(result.current.forecast).toBeNull()
      expect(result.current.error).toBe('Network error: server unreachable')
    })
  })

  describe('race condition / stale request handling', () => {
    it('discards an out-of-order stale response from an earlier request', async () => {
      let resolveFirstRequest: (value: ForecastSummaryResponse) => void
      const firstPromise = new Promise<ForecastSummaryResponse>((resolve) => {
        resolveFirstRequest = resolve
      })

      const secondResponse: ForecastSummaryResponse = {
        ...mockForecastResponse,
        horizon_months: 6,
      }

      vi.spyOn(forecastApi, 'fetchForecast')
        .mockReturnValueOnce(firstPromise)
        .mockResolvedValueOnce(secondResponse)

      const { result } = renderHook(() => useForecast({ horizonMonths: 3 }))

      expect(result.current.isLoading).toBe(true)

      // While request 1 is still in-flight, user switches horizon to 6
      act(() => {
        result.current.setHorizonMonths(6)
      })

      // Wait for second request to resolve and populate state
      await waitFor(() => {
        expect(result.current.forecast?.horizon_months).toBe(6)
      })

      // Now the delayed first request finally resolves
      await act(async () => {
        resolveFirstRequest!(mockForecastResponse)
      })

      // State MUST retain request 2 data (horizon 6), not be overwritten by stale request 1
      expect(result.current.forecast?.horizon_months).toBe(6)
    })

    it('handles rapid horizon changes by only applying the final requested horizon', async () => {
      const resp4: ForecastSummaryResponse = { ...mockForecastResponse, horizon_months: 4 }
      const resp5: ForecastSummaryResponse = { ...mockForecastResponse, horizon_months: 5 }

      vi.spyOn(forecastApi, 'fetchForecast').mockImplementation(async (params) => {
        if (params?.horizon_months === 4) return resp4
        if (params?.horizon_months === 5) return resp5
        return mockForecastResponse
      })

      const { result } = renderHook(() => useForecast({ horizonMonths: 3 }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
      expect(result.current.horizonMonths).toBe(3)

      act(() => {
        result.current.setHorizonMonths(4)
        result.current.setHorizonMonths(5)
      })

      expect(result.current.horizonMonths).toBe(5)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.forecast?.horizon_months).toBe(5)
    })

    it('clears stale forecast and refetches when refDate prop changes', async () => {
      const decResponse: ForecastSummaryResponse = {
        ...mockForecastResponse,
        reference_date: '2026-12-01',
      }

      const fetchSpy = vi
        .spyOn(forecastApi, 'fetchForecast')
        .mockResolvedValueOnce(mockForecastResponse)
        .mockResolvedValueOnce(decResponse)

      let currentProps = { refDate: '2026-11-15' }
      const { result, rerender } = renderHook((props) => useForecast(props), {
        initialProps: currentProps,
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
      expect(result.current.forecast?.reference_date).toBe('2026-11-15')

      // Rerender with new refDate
      currentProps = { refDate: '2026-12-01' }
      rerender(currentProps)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.forecast?.reference_date).toBe('2026-12-01')
      expect(fetchSpy).toHaveBeenCalledWith(
        { horizon_months: 3, ref_date: '2026-12-01' },
        expect.any(AbortSignal),
      )
    })
  })

  describe('unmount safety', () => {
    it('safely handles unmounting while request is in flight', async () => {
      let resolvePromise: (value: ForecastSummaryResponse) => void
      const pendingPromise = new Promise<ForecastSummaryResponse>((resolve) => {
        resolvePromise = resolve
      })

      vi.spyOn(forecastApi, 'fetchForecast').mockReturnValue(pendingPromise)

      const { unmount } = renderHook(() => useForecast())

      unmount()

      // Resolving after unmount should not trigger unhandled state updates
      await act(async () => {
        resolvePromise!(mockForecastResponse)
      })
    })
  })
})

