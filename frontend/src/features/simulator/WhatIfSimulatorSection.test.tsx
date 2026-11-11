import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { UseForecastReturn } from '@/features/forecast/useForecast'
import type { ForecastSummaryResponse, SavingsGoal, Transaction } from '@/lib/api/types'
import { WhatIfSimulatorSection } from './WhatIfSimulatorSection'

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj)
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const val = (obj as Record<string, unknown>)[key]
      if (val && typeof val === 'object' && !Object.isFrozen(val)) {
        deepFreeze(val)
      }
    }
  }
  return obj
}

const mockForecast: ForecastSummaryResponse = {
  horizon_months: 3,
  reference_date: '2026-11-15',
  confidence_level: 'high',
  confidence_score: 0.88,
  history_months_count: 3,
  current_month_forecast: {
    month: '2026-11',
    month_label: 'November 2026',
    is_current_month: true,
    is_historical: false,
    actual_amount: '1800.00',
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
      actual_amount: '1800.00',
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
      predicted_amount: '8000.00',
      lower_bound: '7000.00',
      upper_bound: '9000.00',
      fixed_commitments: '3000.00',
      variable_estimate: '5000.00',
    },
    {
      month: '2027-02',
      month_label: 'February 2027',
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
      category: 'Food/Dining',
      predicted_amount: '3000.00',
      percentage: 37.5,
      fixed_amount: '0.00',
      variable_amount: '3000.00',
    },
    {
      category: 'Shopping',
      predicted_amount: '2000.00',
      percentage: 25.0,
      fixed_amount: '0.00',
      variable_amount: '2000.00',
    },
  ],
  methodology_notes: ['Weighted 3-month baseline.'],
  limitations: ['Forecast is an estimate.'],
}

const mockTransactionsWithIncome: Transaction[] = [
  {
    id: 101,
    amount: '50000.00',
    category: 'Salary',
    description: 'Monthly Salary Oct',
    transaction_date: '2026-10-01',
    transaction_type: 'income',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
  {
    id: 102,
    amount: '50000.00',
    category: 'Salary',
    description: 'Monthly Salary Sep',
    transaction_date: '2026-09-01',
    transaction_type: 'income',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
  {
    id: 103,
    amount: '50000.00',
    category: 'Salary',
    description: 'Monthly Salary Aug',
    transaction_date: '2026-08-01',
    transaction_type: 'income',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  },
]

const mockGoals: SavingsGoal[] = [
  {
    id: 1,
    user_id: 1,
    name: 'Emergency Fund',
    target_amount: '30000.00',
    total_contributed: '6000.00',
    remaining_amount: '24000.00',
    progress_pct: 20,
    target_date: '2027-06-01',
    status: 'in_progress',
    is_completed: false,
    is_on_track: true,
    days_remaining: 200,
    recent_contributions: [],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
]

function buildForecastState(
  forecast: ForecastSummaryResponse | null = mockForecast,
  horizonMonths = 3,
): UseForecastReturn {
  return {
    forecast,
    isLoading: false,
    error: null,
    horizonMonths,
    setHorizonMonths: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
    confidenceLevel: forecast?.confidence_level ?? null,
    confidenceScore: forecast?.confidence_score ?? null,
    hasInsufficientHistory: false,
    historyMonthsCount: forecast?.history_months_count ?? 3,
  }
}

describe('WhatIfSimulatorSection', () => {
  it('1. updates scenario results dynamically as inputs change (recurring expense, extra savings, manual income)', async () => {
    const user = userEvent.setup()
    render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState()}
        transactions={mockTransactionsWithIncome}
        goals={mockGoals}
      />,
    )

    // Baseline outflow is ₹8,000.00, baseline surplus is ₹50,000 - ₹8,000 = ₹42,000.00
    const outflowCard = screen.getByTestId('simulator-card-outflow')
    expect(within(outflowCard).getByText('₹8,000.00')).toBeInTheDocument()

    const surplusCard = screen.getByTestId('simulator-card-surplus')
    expect(within(surplusCard).getByText('₹42,000.00')).toBeInTheDocument()

    // Expand all controls and add a hypothetical recurring monthly expense of ₹1,500
    await user.click(screen.getByRole('button', { name: /Expand All Controls/i }))

    const recurringInput = screen.getByLabelText('Hypothetical Recurring Expense Amount (₹)')
    await user.type(recurringInput, '1500')

    // Simulated outflow increases to ₹9,500.00, adding ₹4,500.00 over 3 months
    expect(within(outflowCard).getByText('₹9,500.00')).toBeInTheDocument()
    expect(within(outflowCard).getByText(/Adds ₹4,500\.00 over 3 months/i)).toBeInTheDocument()
    // Simulated surplus drops to ₹40,500.00
    expect(within(surplusCard).getByText('₹40,500.00')).toBeInTheDocument()

    // Add ₹2,500/mo in additional monthly savings (Lever B) -> committed savings increases, outflow stays ₹9,500.00
    const extraSavingsInput = screen.getByLabelText('Additional Monthly Savings (₹)')
    await user.type(extraSavingsInput, '2500')

    const allocationCard = screen.getByTestId('simulator-card-allocation')
    expect(within(allocationCard).getByText('₹2,500.00/mo')).toBeInTheDocument()
    // Unallocated surplus is ₹40,500 - ₹2,500 = ₹38,000.00/mo
    expect(within(allocationCard).getByText('₹38,000.00/mo')).toBeInTheDocument()
    // Outflow remains ₹9,500.00 (extra savings is NOT an expense)
    expect(within(outflowCard).getByText('₹9,500.00')).toBeInTheDocument()
  })

  it('2. supports percentage and fixed-amount spending reduction controls and displays variable cap', async () => {
    const user = userEvent.setup()
    render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState()}
        transactions={mockTransactionsWithIncome}
        goals={mockGoals}
      />,
    )

    // Variable cap is ₹5,000.00/mo
    expect(screen.getByText(/Max applicable: ₹5,000\.00\/mo/i)).toBeInTheDocument()

    // Verify preset and toggle accessible groups and aria-pressed attributes
    expect(screen.getByRole('group', { name: /Quick scenario presets/i })).toBeInTheDocument()
    const pctModeBtn = screen.getByRole('button', { name: /Percentage \(%\)/i })
    const fixedModeBtn = screen.getByRole('button', { name: /Fixed Amount \(₹\)/i })
    expect(pctModeBtn).toHaveAttribute('aria-pressed', 'true')
    expect(fixedModeBtn).toHaveAttribute('aria-pressed', 'false')

    // Enter 20% reduction -> 20% of ₹5,000 variable = ₹1,000/mo reduction -> simulated outflow ₹7,000.00
    const reductionInput = screen.getByLabelText('Spending Reduction Value')
    await user.type(reductionInput, '20')

    const pct20Chip = screen.getByRole('button', { name: /20 percent reduction/i })
    expect(pct20Chip).toHaveAttribute('aria-pressed', 'true')

    const outflowCard = screen.getByTestId('simulator-card-outflow')
    expect(within(outflowCard).getByText('₹7,000.00')).toBeInTheDocument()
    expect(within(outflowCard).getByText(/Saves ₹3,000\.00 over 3 months/i)).toBeInTheDocument()

    // Switch to Fixed Amount (₹) mode and enter ₹6,500 (exceeds ₹5,000 variable cap)
    await user.click(fixedModeBtn)
    expect(fixedModeBtn).toHaveAttribute('aria-pressed', 'true')
    expect(pctModeBtn).toHaveAttribute('aria-pressed', 'false')
    await user.clear(reductionInput)
    await user.type(reductionInput, '6500')

    // Capped at ₹5,000 variable spending -> simulated outflow cannot drop below ₹3,000 fixed commitments
    expect(within(outflowCard).getByText('₹3,000.00')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Spending reduction was capped at total projected variable spending so fixed commitments remain intact/i,
      ),
    ).toBeInTheDocument()
  })

  it('3. enforces category-specific variable spending ceiling when a category is selected', async () => {
    const user = userEvent.setup()
    render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState()}
        transactions={mockTransactionsWithIncome}
        goals={mockGoals}
      />,
    )

    // Select 'Shopping' category (variable_amount: ₹2,000.00)
    const categorySelect = screen.getByLabelText('Spending Reduction Category')
    await user.selectOptions(categorySelect, 'Shopping')

    // Max applicable ceiling updates to ₹2,000.00/mo
    expect(screen.getByText(/Max applicable: ₹2,000\.00\/mo/i)).toBeInTheDocument()

    // Switch to Fixed Amount and attempt to cut ₹3,500 from Shopping
    await user.click(screen.getByRole('button', { name: /Fixed Amount \(₹\)/i }))
    const reductionInput = screen.getByLabelText('Spending Reduction Value')
    await user.type(reductionInput, '3500')

    // Capped at Shopping's ₹2,000.00 variable ceiling -> simulated outflow is ₹8,000 - ₹2,000 = ₹6,000.00
    const outflowCard = screen.getByTestId('simulator-card-outflow')
    expect(within(outflowCard).getByText('₹6,000.00')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Spending reduction in Shopping was capped at its projected variable spending \(₹2000\.00\/mo\)/i,
      ),
    ).toBeInTheDocument()
  })

  it('4. respects explicit goal allocation toggles without double counting extra savings or spending cuts', async () => {
    const user = userEvent.setup()
    render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState()}
        transactions={mockTransactionsWithIncome}
        goals={mockGoals}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Expand All Controls/i }))

    // Configure 20% spending reduction (₹1,000/mo) and ₹2,000/mo extra savings
    await user.type(screen.getByLabelText('Spending Reduction Value'), '20')
    await user.type(screen.getByLabelText('Additional Monthly Savings (₹)'), '2000')

    // Select Emergency Fund (₹24,000 remaining) and set ₹3,000/mo baseline goal contribution
    await user.selectOptions(screen.getByLabelText('Target Savings Goal'), '1')
    await user.type(screen.getByLabelText('Baseline Monthly Goal Contribution (₹)'), '3000')

    const goalPanel = screen.getByTestId('simulator-goal-impact-panel')
    const allocationCard = screen.getByTestId('simulator-card-allocation')

    // By default, BOTH toggles are unchecked:
    // Simulated goal contribution = ₹3,000/mo (8 mo to goal), while total committed savings = ₹3,000 (goal) + ₹2,000 (extra) = ₹5,000/mo
    expect(within(goalPanel).getByTestId('goal-simulated-monthly-total')).toHaveTextContent(
      '₹3,000.00',
    )
    expect(within(allocationCard).getByText('₹5,000.00/mo')).toBeInTheDocument()

    // Toggle ON "Include extra monthly savings in this goal":
    // Goal contribution increases to ₹3,000 + ₹2,000 = ₹5,000/mo, AND total committed savings stays ₹5,000/mo (no double counting!)
    const includeExtraCheckbox = screen.getByLabelText(
      'Include extra monthly savings in this goal',
    )
    await user.click(includeExtraCheckbox)
    expect(within(goalPanel).getByTestId('goal-simulated-monthly-total')).toHaveTextContent(
      '₹5,000.00',
    )
    expect(within(allocationCard).getByText('₹5,000.00/mo')).toBeInTheDocument()

    // Toggle ON "Redirect monthly spending reductions to this goal":
    // Goal contribution becomes ₹5,000 + ₹1,000 = ₹6,000/mo (4 mo to goal vs 8 mo baseline -> saves 4 months)
    const redirectCutsCheckbox = screen.getByLabelText(
      'Redirect monthly spending reductions to this goal',
    )
    await user.click(redirectCutsCheckbox)
    expect(within(goalPanel).getByTestId('goal-simulated-monthly-total')).toHaveTextContent(
      '₹6,000.00',
    )
    expect(within(goalPanel).getByText(/Accelerates goal completion by 4 months/i)).toBeInTheDocument()
    expect(within(allocationCard).getByText('₹6,000.00/mo')).toBeInTheDocument()
  })

  it('5. distinguishes forecast-backed goal projection from contribution-only illustration when forecast has no future points', async () => {
    const user = userEvent.setup()

    // Render with full future forecast first
    const { unmount } = render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState(mockForecast)}
        transactions={mockTransactionsWithIncome}
        goals={mockGoals}
      />,
    )

    await user.click(screen.getByRole('button', { name: /E\. Savings Goal Allocation/i }))
    await user.selectOptions(screen.getByLabelText('Target Savings Goal'), '1')
    await user.type(screen.getByLabelText('Baseline Monthly Goal Contribution (₹)'), '4000')

    expect(screen.getByTestId('goal-projection-basis-badge')).toHaveTextContent(
      'Forecast-Backed Goal Projection',
    )
    expect(screen.getByText(/Forecast-Backed Balance After 3 Months/i)).toBeInTheDocument()

    unmount()

    // Now render with anchor-only forecast (no future points)
    const anchorOnlyForecast: ForecastSummaryResponse = {
      ...mockForecast,
      monthly_forecasts: [mockForecast.current_month_forecast],
    }

    render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState(anchorOnlyForecast)}
        transactions={mockTransactionsWithIncome}
        goals={mockGoals}
      />,
    )

    await user.click(screen.getByRole('button', { name: /E\. Savings Goal Allocation/i }))
    await user.selectOptions(screen.getByLabelText('Target Savings Goal'), '1')
    await user.type(screen.getByLabelText('Baseline Monthly Goal Contribution (₹)'), '4000')

    expect(screen.getByTestId('goal-projection-basis-badge')).toHaveTextContent(
      'Contribution-Only Illustration (No Future Forecast)',
    )
    expect(
      screen.getByText(/Contribution-Only Illustration \(3 Months\)/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Future forecast data is unavailable; showing contribution-only math/i),
    ).toBeInTheDocument()
  })

  it('6. handles empty future forecast gracefully without fabricating ₹0.00 outflows or surpluses', () => {
    const emptyFutureForecast: ForecastSummaryResponse = {
      ...mockForecast,
      monthly_forecasts: [],
    }

    render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState(emptyFutureForecast)}
        transactions={mockTransactionsWithIncome}
        goals={mockGoals}
      />,
    )

    expect(screen.getByTestId('simulator-feasibility-badge')).toHaveTextContent(
      'Forecast Data Unavailable',
    )
    expect(
      within(screen.getByTestId('simulator-card-outflow')).getByText('Forecast unavailable'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('simulator-card-surplus')).getByText('Forecast unavailable'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('simulator-empty-forecast-chart')).toBeInTheDocument()
  })

  it('7. displays explicit unavailable income state (never ₹0.00 surplus) and unlocks surplus when manual income is entered', async () => {
    const user = userEvent.setup()
    render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState()}
        transactions={[]}
        goals={mockGoals}
      />,
    )

    // Surplus card must say "Requires monthly income", never "₹0.00"
    const surplusCard = screen.getByTestId('simulator-card-surplus')
    expect(within(surplusCard).getByText('Requires monthly income')).toBeInTheDocument()
    expect(within(surplusCard).queryByText('₹0.00')).not.toBeInTheDocument()

    // Enter manual monthly income of ₹40,000
    const incomeInput = screen.getByLabelText('Monthly Income Override (₹)')
    await user.type(incomeInput, '40000')

    // Surplus is now ₹40,000 - ₹8,000 = ₹32,000.00
    expect(within(surplusCard).getByText('₹32,000.00')).toBeInTheDocument()
    expect(screen.getByText('User-entered assumption')).toBeInTheDocument()
  })

  it('8. reports cash-flow impact only when starting balance is omitted and evaluates balance coverage only when provided', async () => {
    const user = userEvent.setup()
    render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState()}
        transactions={mockTransactionsWithIncome}
        goals={mockGoals}
      />,
    )

    await user.click(screen.getByRole('button', { name: /D\. One-Time Purchase/i }))
    await user.type(screen.getByLabelText('One-Time Purchase Amount (₹)'), '15000')

    const horizonCard = screen.getByTestId('simulator-card-horizon')
    expect(within(horizonCard).getByText('₹15,000.00')).toBeInTheDocument()
    // Without starting balance, must state "Cash-flow impact only" and NOT show "Projected Ending Balance"
    expect(within(horizonCard).getByText(/Cash-flow impact only/i)).toBeInTheDocument()
    expect(
      within(horizonCard).queryByText(/Projected Ending Balance/i),
    ).not.toBeInTheDocument()

    // Provide a starting balance of ₹20,000
    const balanceInput = screen.getByLabelText('Starting Available Balance (₹)')
    await user.type(balanceInput, '20000')

    // Ending balance = ₹20,000 + (3 * ₹42,000 - ₹15,000) = ₹131,000.00
    expect(within(horizonCard).getByText(/Projected Ending Balance/i)).toBeInTheDocument()
    expect(within(horizonCard).getByText('₹1,31,000.00')).toBeInTheDocument()
    expect(
      within(horizonCard).getByText(/Covered by starting balance \+ cumulative horizon cash flow/i),
    ).toBeInTheDocument()
  })

  it('9. resets all scenario modifications back to baseline when Reset Scenario is clicked', async () => {
    const user = userEvent.setup()
    render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState()}
        transactions={mockTransactionsWithIncome}
        goals={mockGoals}
      />,
    )

    // Click quick preset "Trim Variable 15%" -> 15% of ₹5,000 = ₹750/mo -> ₹7,250.00 outflow
    await user.click(screen.getByRole('button', { name: /Trim Variable 15%/i }))
    const outflowCard = screen.getByTestId('simulator-card-outflow')
    expect(within(outflowCard).getByText('₹7,250.00')).toBeInTheDocument()

    // Click Reset Scenario
    const resetBtn = screen.getByRole('button', { name: /Reset Scenario/i })
    await user.click(resetBtn)

    // Back to ₹8,000.00 baseline outflow, and Reset Scenario button disappears
    expect(within(outflowCard).getByText('₹8,000.00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reset Scenario/i })).not.toBeInTheDocument()
  })

  it('10. never mutates forecast, transactions, or savings goals data objects', async () => {
    const user = userEvent.setup()
    const frozenForecast = deepFreeze(structuredClone(mockForecast))
    const frozenTransactions = deepFreeze(structuredClone(mockTransactionsWithIncome))
    const frozenGoals = deepFreeze(structuredClone(mockGoals))

    render(
      <WhatIfSimulatorSection
        forecastState={buildForecastState(frozenForecast)}
        transactions={frozenTransactions}
        goals={frozenGoals}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Expand All Controls/i }))
    await user.type(screen.getByLabelText('Spending Reduction Value'), '25')
    await user.type(screen.getByLabelText('Additional Monthly Savings (₹)'), '3000')
    await user.type(screen.getByLabelText('Hypothetical Recurring Expense Amount (₹)'), '999')
    await user.type(screen.getByLabelText('One-Time Purchase Amount (₹)'), '12000')
    await user.selectOptions(screen.getByLabelText('Target Savings Goal'), '1')
    await user.click(screen.getByLabelText('Include extra monthly savings in this goal'))
    await user.click(screen.getByLabelText('Redirect monthly spending reductions to this goal'))

    expect(frozenForecast).toEqual(mockForecast)
    expect(frozenTransactions).toEqual(mockTransactionsWithIncome)
    expect(frozenGoals).toEqual(mockGoals)
  })
})
