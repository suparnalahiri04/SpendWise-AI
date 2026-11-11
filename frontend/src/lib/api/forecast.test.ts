import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, setTokenProvider } from './client'
import { buildForecastQuery, fetchForecast } from './forecast'
import type { ForecastSummaryResponse } from './types'

describe('forecast API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

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

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setTokenProvider(() => 'test-bearer-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setTokenProvider(() => null)
  })

  describe('buildForecastQuery', () => {
    it('returns empty string when no params are provided', () => {
      expect(buildForecastQuery()).toBe('')
      expect(buildForecastQuery({})).toBe('')
    })

    it('formats horizon_months parameter correctly', () => {
      expect(buildForecastQuery({ horizon_months: 3 })).toBe('?horizon_months=3')
      expect(buildForecastQuery({ horizonMonths: 4 })).toBe('?horizon_months=4')
    })

    it('clamps horizon_months within 1 to 6 range', () => {
      expect(buildForecastQuery({ horizon_months: 10 })).toBe('?horizon_months=6')
      expect(buildForecastQuery({ horizon_months: 0 })).toBe('?horizon_months=1')
      expect(buildForecastQuery({ horizon_months: -5 })).toBe('?horizon_months=1')
    })

    it('formats ref_date parameter correctly', () => {
      expect(buildForecastQuery({ ref_date: '2026-11-15' })).toBe('?ref_date=2026-11-15')
      expect(buildForecastQuery({ refDate: '2026-12-01' })).toBe('?ref_date=2026-12-01')
    })

    it('combines horizon_months and ref_date', () => {
      const query = buildForecastQuery({ horizon_months: 2, ref_date: '2026-11-15' })
      expect(query).toContain('horizon_months=2')
      expect(query).toContain('ref_date=2026-11-15')
    })
  })

  describe('fetchForecast', () => {
    it('fetches forecast without query params when omitted', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(mockForecastResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const result = await fetchForecast()
      expect(result).toEqual(mockForecastResponse)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toContain('/forecast/')
      expect(url).not.toContain('?')
      expect(init.headers.Authorization).toBe('Bearer test-bearer-token')
    })

    it('appends query parameters when supplied', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(mockForecastResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      await fetchForecast({ horizon_months: 4, ref_date: '2026-11-15' })
      const [url] = fetchMock.mock.calls[0]
      expect(url).toContain('/forecast/?horizon_months=4&ref_date=2026-11-15')
    })

    it('forwards AbortSignal to fetch', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(mockForecastResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const controller = new AbortController()
      await fetchForecast({ horizon_months: 3 }, controller.signal)
      const [, init] = fetchMock.mock.calls[0]
      expect(init.signal).toBe(controller.signal)
    })

    it('throws ApiError on HTTP 401 unauthorized', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Token has expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      await expect(fetchForecast()).rejects.toMatchObject({
        name: 'ApiError',
        kind: 'unauthorized',
        message: 'Token has expired',
        status: 401,
      })
    })

    it('throws ApiError on HTTP 500 server error', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Internal database error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      await expect(fetchForecast()).rejects.toThrow(ApiError)
    })
  })
})
