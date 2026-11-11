import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as forecastApi from '@/lib/api/forecast'
import type { ForecastSummaryResponse } from '@/lib/api/types'
import { FinancialForecastSection } from './FinancialForecastSection'

describe('FinancialForecastSection', () => {
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
      {
        month: '2027-01',
        month_label: 'January 2027',
        is_current_month: false,
        is_historical: false,
        actual_amount: null,
        predicted_amount: '8200.00',
        lower_bound: '6900.00',
        upper_bound: '9500.00',
        fixed_commitments: '3000.00',
        variable_estimate: '5200.00',
      },
    ],
    category_forecasts: [
      {
        category: 'Housing',
        predicted_amount: '3000.00',
        percentage: 36.6,
        fixed_amount: '3000.00',
        variable_amount: '0.00',
      },
      {
        category: 'Dining',
        predicted_amount: '2500.00',
        percentage: 30.5,
        fixed_amount: '0.00',
        variable_amount: '2500.00',
      },
      {
        category: 'Groceries',
        predicted_amount: '2000.00',
        percentage: 24.4,
        fixed_amount: '0.00',
        variable_amount: '2000.00',
      },
    ],
    methodology_notes: [
      'Baseline variable spend modeled using 3-month recency-weighted moving average (weights: 50%, 33%, 17%).',
      'Incorporated ₹3,000.00 in fixed monthly commitments.',
    ],
    limitations: [
      'Projections are statistical estimates based on historical patterns, not guaranteed financial outcomes.',
      'Unplanned one-off expenditures are not anticipated by the model.',
    ],
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

  it('renders loading state initially while request is in flight', () => {
    vi.spyOn(forecastApi, 'fetchForecast').mockReturnValue(new Promise(() => {}))

    render(<FinancialForecastSection />)

    expect(
      screen.getByText(/Computing statistical financial projections…/i),
    ).toBeInTheDocument()
  })

  it('renders forecast data, chart container, KPI cards, and breakdowns upon success', async () => {
    vi.spyOn(forecastApi, 'fetchForecast').mockResolvedValueOnce(mockForecastResponse)

    render(<FinancialForecastSection />)

    await waitFor(() => {
      expect(screen.getByText('Spending Forecast & Projections')).toBeInTheDocument()
    })

    // Headline metric cards
    expect(screen.getByText('November 2026 Projected Outflow')).toBeInTheDocument()
    expect(screen.getAllByText('₹7,500.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('₹3,500.00')).toBeInTheDocument() // Actual spent MTD
    expect(screen.getAllByText(/₹6,800.00 – ₹8,200.00/).length).toBeGreaterThanOrEqual(1) // Estimate range
    expect(screen.getByText('High Confidence')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()

    // Chart accessible container
    expect(
      screen.getByRole('img', { name: /Spending forecast trajectory chart for 3 months/i }),
    ).toBeInTheDocument()

    // Monthly breakdown list
    expect(screen.getByText('December 2026')).toBeInTheDocument()
    expect(screen.getByText('January 2027')).toBeInTheDocument()
    expect(screen.getByText('₹8,000.00')).toBeInTheDocument()
    expect(screen.getByText('₹8,200.00')).toBeInTheDocument()

    // Category allocation
    expect(screen.getByText('Projected Category Allocation (Next Month)')).toBeInTheDocument()
    expect(screen.getByText('Housing')).toBeInTheDocument()
    expect(screen.getByText('36.6%')).toBeInTheDocument()
    expect(screen.getByText('Dining')).toBeInTheDocument()
    expect(screen.getByText('30.5%')).toBeInTheDocument()
  })

  it('displays cold-start banner when history is sparse or confidence is low', async () => {
    vi.spyOn(forecastApi, 'fetchForecast').mockResolvedValueOnce(mockColdStartResponse)

    render(<FinancialForecastSection />)

    await waitFor(() => {
      expect(screen.getByText('Spending Forecast & Projections')).toBeInTheDocument()
    })

    expect(screen.getByText(/Limited transaction history \(0 months recorded\)/i)).toBeInTheDocument()
    expect(screen.getByText('Low Confidence')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
  })

  it('switches forecast horizon when clicking horizon buttons', async () => {
    const fetchSpy = vi
      .spyOn(forecastApi, 'fetchForecast')
      .mockResolvedValue(mockForecastResponse)

    const user = userEvent.setup()
    render(<FinancialForecastSection />)

    await waitFor(() => {
      expect(screen.getByText('Spending Forecast & Projections')).toBeInTheDocument()
    })

    // Click 6M button
    const btn6M = screen.getByRole('button', { name: '6M' })
    await user.click(btn6M)

    await waitFor(() => {
      expect(btn6M).toHaveAttribute('aria-pressed', 'true')
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      { horizon_months: 6, ref_date: undefined },
      expect.any(AbortSignal),
    )
  })

  it('renders error state and recovers when retry button is clicked', async () => {
    const fetchSpy = vi
      .spyOn(forecastApi, 'fetchForecast')
      .mockRejectedValueOnce(new Error('Backend forecasting service temporarily unavailable'))
      .mockResolvedValueOnce(mockForecastResponse)

    const user = userEvent.setup()
    render(<FinancialForecastSection />)

    await waitFor(() => {
      expect(screen.getByText('Unable to generate financial forecast')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Backend forecasting service temporarily unavailable'),
    ).toBeInTheDocument()

    const retryBtn = screen.getByRole('button', { name: /Retry forecast/i })
    await user.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Spending Forecast & Projections')).toBeInTheDocument()
    })
    expect(screen.getAllByText('₹7,500.00').length).toBeGreaterThanOrEqual(1)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('expands methodology notes and limitations accordion when clicked', async () => {
    vi.spyOn(forecastApi, 'fetchForecast').mockResolvedValueOnce(mockForecastResponse)

    const user = userEvent.setup()
    render(<FinancialForecastSection />)

    await waitFor(() => {
      expect(screen.getByText('Spending Forecast & Projections')).toBeInTheDocument()
    })

    const accordionBtn = screen.getByRole('button', {
      name: /Model Methodology & Limitations/i,
    })
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'false')

    // Click to expand
    await user.click(accordionBtn)

    expect(accordionBtn).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText(/Baseline variable spend modeled using 3-month recency-weighted/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Projections are statistical estimates based on historical patterns/i),
    ).toBeInTheDocument()
  })
})
