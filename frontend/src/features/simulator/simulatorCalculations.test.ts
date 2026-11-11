import { describe, expect, it } from 'vitest'
import type { ForecastSummaryResponse, SavingsGoal, Transaction } from '@/lib/api/types'
import {
  calculateRecurringMonthlyEquivalent,
  clampPercentage,
  deriveHistoricalMonthlyIncome,
  round2,
  runWhatIfSimulation,
  sanitizeNonNegativeCurrency,
  sanitizeOptionalCurrency,
  type WhatIfScenarioInputs,
} from './simulatorCalculations'

const MOCK_FORECAST: ForecastSummaryResponse = {
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
      predicted_amount: '8000.00',
      lower_bound: '6900.00',
      upper_bound: '9100.00',
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
      lower_bound: '6800.00',
      upper_bound: '9200.00',
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
      predicted_amount: '2500.00',
      percentage: 31.25,
      fixed_amount: '0.00',
      variable_amount: '2500.00',
    },
    {
      category: 'Groceries',
      predicted_amount: '1500.00',
      percentage: 18.75,
      fixed_amount: '0.00',
      variable_amount: '1500.00',
    },
    {
      category: 'Bills/Utilities',
      predicted_amount: '1000.00',
      percentage: 12.5,
      fixed_amount: '400.00',
      variable_amount: '600.00',
    },
  ],
  methodology_notes: [],
  limitations: [],
}

const MOCK_COLD_START_FORECAST: ForecastSummaryResponse = {
  horizon_months: 3,
  reference_date: '2026-11-15',
  confidence_level: 'low',
  confidence_score: 0.3,
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
  monthly_forecasts: [
    {
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
    {
      month: '2026-12',
      month_label: 'December 2026',
      is_current_month: false,
      is_historical: false,
      actual_amount: null,
      predicted_amount: '0.00',
      lower_bound: '0.00',
      upper_bound: '0.00',
      fixed_commitments: '0.00',
      variable_estimate: '0.00',
    },
    {
      month: '2027-01',
      month_label: 'January 2027',
      is_current_month: false,
      is_historical: false,
      actual_amount: null,
      predicted_amount: '0.00',
      lower_bound: '0.00',
      upper_bound: '0.00',
      fixed_commitments: '0.00',
      variable_estimate: '0.00',
    },
    {
      month: '2027-02',
      month_label: 'February 2027',
      is_current_month: false,
      is_historical: false,
      actual_amount: null,
      predicted_amount: '0.00',
      lower_bound: '0.00',
      upper_bound: '0.00',
      fixed_commitments: '0.00',
      variable_estimate: '0.00',
    },
  ],
  category_forecasts: [],
  methodology_notes: [],
  limitations: [],
}

function makeIncomeTx(id: number, dateStr: string, amount: string): Transaction {
  return {
    id,
    transaction_date: dateStr,
    description: 'Monthly Salary',
    amount,
    transaction_type: 'income',
    category: 'Income',
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  }
}

function makeExpenseTx(
  id: number,
  dateStr: string,
  amount: string,
  category = 'Food/Dining',
): Transaction {
  return {
    id,
    transaction_date: dateStr,
    description: 'Merchant Purchase',
    amount,
    transaction_type: 'expense',
    category,
    predicted_category: null,
    prediction_confidence: null,
    is_reviewed: true,
  }
}

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

const MOCK_GOAL: SavingsGoal = {
  id: 10,
  user_id: 1,
  name: 'Emergency Fund',
  target_amount: '30000.00',
  target_date: '2027-06-01',
  status: 'in_progress',
  total_contributed: '10000.00',
  remaining_amount: '20000.00',
  progress_pct: 33.33,
  is_completed: false,
  is_on_track: true,
  days_remaining: 200,
  recent_contributions: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
}

describe('simulatorCalculations — Stage 1 Pure Simulation Engine', () => {
  describe('1. Baseline Identity & Current-Month Anchor Preservation', () => {
    it('returns exact baseline values when no hypothetical adjustments are provided', () => {
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 12000,
      })

      expect(result.horizonMonths).toBe(3)
      expect(result.hasFutureForecastPoints).toBe(true)
      expect(result.effectiveMonthlyIncome).toBe(12000)
      expect(result.incomeSource).toBe('manual_override')
      expect(result.isPartialMonthIncome).toBe(false)
      expect(result.hasStartingBalance).toBe(false)
      expect(result.startingBalance).toBeNull()
      expect(result.projectedEndingBalance).toBeNull()

      // Future horizon metrics
      expect(result.averageBaselineMonthlyOutflow).toBe(8000)
      expect(result.averageSimulatedMonthlyOutflow).toBe(8000)
      expect(result.totalHorizonBaselineOutflow).toBe(24000)
      expect(result.totalHorizonSimulatedOutflow).toBe(24000)
      expect(result.totalHorizonOutflowSaving).toBe(0)

      // Surplus & cumulative cash-flow metrics
      expect(result.averageBaselineMonthlySurplus).toBe(4000)
      expect(result.averageSimulatedMonthlySurplus).toBe(4000)
      expect(result.averageUnallocatedMonthlySurplus).toBe(4000)
      expect(result.cumulativeBaselineCashFlow).toBe(12000)
      expect(result.cumulativeSimulatedCashFlow).toBe(12000)
      expect(result.feasibilityStatus).toBe('sustainable')
    })

    it('preserves the current-month anchor untouched and excludes it from future-month averages', () => {
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 15000,
        spendingReduction: { mode: 'percentage', value: 40, category: 'all' },
        recurringExpense: { amount: 1000, frequency: 'monthly' },
        extraMonthlySavings: 2000,
        plannedPurchase: { amount: 5000, targetHorizonIndex: 1 },
      })

      // Current-month anchor (2026-11) has predicted_amount = 7500, actual = 3500
      expect(result.anchorMonthPoint).not.toBeNull()
      expect(result.anchorMonthPoint?.month).toBe('2026-11')
      expect(result.anchorMonthPoint?.isAnchorMonth).toBe(true)
      expect(result.anchorMonthPoint?.horizonIndex).toBe(0)
      expect(result.anchorMonthPoint?.actualAmount).toBe(3500)
      expect(result.anchorMonthPoint?.baselineOutflow).toBe(7500)
      expect(result.anchorMonthPoint?.simulatedOutflow).toBe(7500)
      expect(result.anchorMonthPoint?.variableReductionAmount).toBe(0)
      expect(result.anchorMonthPoint?.addedRecurringMonthlyEquivalent).toBe(0)
      expect(result.anchorMonthPoint?.plannedPurchaseAmount).toBe(0)
      expect(result.anchorMonthPoint?.monthlyOutflowSaving).toBe(0)

      // Future horizon points are strictly the 3 future months (Dec 2026, Jan 2027, Feb 2027)
      expect(result.futureHorizonPoints).toHaveLength(3)
      expect(result.allTrajectoryPoints).toHaveLength(4)
      expect(result.futureHorizonPoints.every((pt) => !pt.isAnchorMonth)).toBe(true)

      // Baseline average across the 3 future months is 8000 (not skewed by 7500 from Nov)
      expect(result.averageBaselineMonthlyOutflow).toBe(8000)
    })
  })

  describe('2. Percentage & Fixed-Amount Variable Spending Reductions', () => {
    it('applies percentage reduction strictly to variable spending, leaving fixed commitments untouched', () => {
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 12000,
        spendingReduction: { mode: 'percentage', value: 20, category: 'all' },
      })

      // Future months have fixed = 3000, variable = 5000. 20% of 5000 = 1000 reduction.
      expect(result.averageMonthlyVariableReduction).toBe(1000)
      expect(result.averageSimulatedMonthlyOutflow).toBe(7000)
      expect(result.totalHorizonOutflowSaving).toBe(3000)

      for (const pt of result.futureHorizonPoints) {
        expect(pt.simulatedFixed).toBe(3000)
        expect(pt.simulatedVariable).toBe(4000)
        expect(pt.simulatedOutflow).toBe(7000)
        expect(pt.monthlyOutflowSaving).toBe(1000)
      }
    })

    it('clamps fixed-amount spending reduction at the variable spending floor and protects fixed commitments', () => {
      // Request ₹6,500/mo cut when variable_estimate is only ₹5,000/mo and fixed is ₹3,000/mo
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 12000,
        spendingReduction: { mode: 'fixed_amount', value: 6500, category: 'all' },
      })

      expect(result.isCappedAtVariableFloor).toBe(true)
      expect(result.averageMonthlyVariableReduction).toBe(5000)
      expect(result.averageSimulatedMonthlyOutflow).toBe(3000) // Never drops below 3000 fixed!

      for (const pt of result.futureHorizonPoints) {
        expect(pt.simulatedFixed).toBe(3000)
        expect(pt.simulatedVariable).toBe(0)
        expect(pt.simulatedOutflow).toBe(3000)
      }
      expect(result.warnings.some((w) => w.includes('capped at total projected variable'))).toBe(
        true,
      )
    })
  })

  describe('3. Category-Scoped Spending Reduction Caps', () => {
    it('caps percentage and fixed-amount reductions at the selected category variable estimate', () => {
      // Food/Dining has variable_amount = 2500
      const pctResult = runWhatIfSimulation(MOCK_FORECAST, {
        spendingReduction: { mode: 'percentage', value: 50, category: 'Food/Dining' },
      })
      expect(pctResult.selectedCategoryVariableCeiling).toBe(2500)
      expect(pctResult.averageMonthlyVariableReduction).toBe(1250)
      expect(pctResult.averageSimulatedMonthlyOutflow).toBe(6750)
      expect(pctResult.isCappedAtCategoryVariableCeiling).toBe(false)

      // Request ₹4,000 reduction in Food/Dining (exceeds ₹2,500 category variable ceiling)
      const cappedResult = runWhatIfSimulation(MOCK_FORECAST, {
        spendingReduction: { mode: 'fixed_amount', value: 4000, category: 'Food/Dining' },
      })
      expect(cappedResult.isCappedAtCategoryVariableCeiling).toBe(true)
      expect(cappedResult.averageMonthlyVariableReduction).toBe(2500)
      expect(cappedResult.averageSimulatedMonthlyOutflow).toBe(5500)
    })

    it('prevents reducing a purely fixed-commitment category such as Housing', () => {
      // Housing has predicted = 3000, fixed_amount = 3000, variable_amount = 0
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        spendingReduction: { mode: 'fixed_amount', value: 1000, category: 'Housing' },
      })

      expect(result.selectedCategoryVariableCeiling).toBe(0)
      expect(result.isCappedAtCategoryVariableCeiling).toBe(true)
      expect(result.averageMonthlyVariableReduction).toBe(0)
      expect(result.averageSimulatedMonthlyOutflow).toBe(8000)
    })

    it('caps mixed fixed/variable categories (Bills/Utilities) strictly at the variable portion', () => {
      // Bills/Utilities has fixed_amount = 400, variable_amount = 600
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        spendingReduction: { mode: 'fixed_amount', value: 900, category: 'Bills/Utilities' },
      })

      expect(result.selectedCategoryVariableCeiling).toBe(600)
      expect(result.isCappedAtCategoryVariableCeiling).toBe(true)
      expect(result.averageMonthlyVariableReduction).toBe(600)
      expect(result.averageSimulatedMonthlyOutflow).toBe(7400)
    })
  })

  describe('4. Hypothetical Recurring Expense Frequency Conversion', () => {
    it('converts weekly, monthly, quarterly, and yearly frequencies to accurate monthly equivalents', () => {
      expect(calculateRecurringMonthlyEquivalent(600, 'weekly')).toBe(2600.0) // 600 * 52 / 12
      expect(calculateRecurringMonthlyEquivalent(500, 'weekly')).toBe(2166.67) // round(500 * 52 / 12, 2)
      expect(calculateRecurringMonthlyEquivalent(1200, 'monthly')).toBe(1200.0)
      expect(calculateRecurringMonthlyEquivalent(3000, 'quarterly')).toBe(1000.0)
      expect(calculateRecurringMonthlyEquivalent(1000, 'quarterly')).toBe(333.33)
      expect(calculateRecurringMonthlyEquivalent(12000, 'yearly')).toBe(1000.0)

      const simWeekly = runWhatIfSimulation(MOCK_FORECAST, {
        recurringExpense: { amount: 600, frequency: 'weekly', description: 'Trainer' },
      })

      expect(simWeekly.addedRecurringMonthlyEquivalent).toBe(2600)
      expect(simWeekly.averageSimulatedMonthlyOutflow).toBe(10600)
      for (const pt of simWeekly.futureHorizonPoints) {
        expect(pt.simulatedFixed).toBe(5600)
        expect(pt.simulatedVariable).toBe(5000)
      }
    })
  })

  describe('5. Surplus Allocation vs. Expenses', () => {
    it('treats extraMonthlySavings as an allocation of surplus, NOT an expense', () => {
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 12000,
        extraMonthlySavings: 2500,
      })

      // Outflow remains 8000 (not 10500!)
      expect(result.averageSimulatedMonthlyOutflow).toBe(8000)
      // Net surplus remains 12000 - 8000 = 4000
      expect(result.averageSimulatedMonthlySurplus).toBe(4000)
      // Unallocated surplus is 4000 - 2500 = 1500
      expect(result.extraMonthlySavingsAllocation).toBe(2500)
      expect(result.totalCommittedMonthlySavings).toBe(2500)
      expect(result.averageUnallocatedMonthlySurplus).toBe(1500)
      expect(result.isSavingsAllocationExceedingSurplus).toBe(false)
      expect(result.feasibilityStatus).toBe('sustainable')
    })

    it('flags when extraMonthlySavings exceeds projected monthly surplus', () => {
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 10000, // Surplus is 10000 - 8000 = 2000
        extraMonthlySavings: 3000, // Exceeds 2000 surplus by 1000
      })

      expect(result.averageSimulatedMonthlySurplus).toBe(2000)
      expect(result.averageUnallocatedMonthlySurplus).toBe(-1000)
      expect(result.isSavingsAllocationExceedingSurplus).toBe(true)
      expect(result.feasibilityStatus).toBe('deficit_warning')
    })
  })

  describe('6. Planned Purchase Timing, Horizon Clamping & Starting Balance Assumption', () => {
    it('applies planned purchase only in the targeted future month and never labels negative cash-flow delta as a deficit when ongoing cash flow is positive', () => {
      // Monthly income = 10,000, baseline outflow = 8,000 -> +2,000/mo ongoing surplus (+6,000 over 3M).
      // Planned purchase of 10,000 in Month 2 -> 3M cumulative cash flow = +6,000 - 10,000 = -4,000.
      const resultWithoutBalance = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 10000,
        plannedPurchase: { amount: 10000, targetHorizonIndex: 2 },
      })

      expect(resultWithoutBalance.plannedPurchaseMonth).toBe('2027-01')
      expect(resultWithoutBalance.futureHorizonPoints[0].simulatedOutflow).toBe(8000)
      expect(resultWithoutBalance.futureHorizonPoints[1].simulatedOutflow).toBe(18000)
      expect(resultWithoutBalance.futureHorizonPoints[2].simulatedOutflow).toBe(8000)

      expect(resultWithoutBalance.cumulativeSimulatedCashFlow).toBe(-4000)
      expect(resultWithoutBalance.projectedEndingBalance).toBeNull()
      // Must NOT be 'deficit_warning' solely because cumulative cash-flow change is negative
      expect(resultWithoutBalance.feasibilityStatus).toBe('cash_flow_drawdown')
    })

    it('computes projectedAvailableBalance when startingBalance is provided and verifies purchase coverage', () => {
      // With startingBalance = 15,000 and cumulative cash flow = -4,000, ending balance is +11,000
      const coveredResult = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 10000,
        startingBalance: 15000,
        plannedPurchase: { amount: 10000, targetHorizonIndex: 2 },
      })

      expect(coveredResult.hasStartingBalance).toBe(true)
      expect(coveredResult.startingBalance).toBe(15000)
      expect(coveredResult.futureHorizonPoints[0].projectedAvailableBalance).toBe(17000) // 15000 + 2000
      expect(coveredResult.futureHorizonPoints[1].projectedAvailableBalance).toBe(9000) // 17000 - 8000
      expect(coveredResult.futureHorizonPoints[2].projectedAvailableBalance).toBe(11000) // 9000 + 2000
      expect(coveredResult.projectedEndingBalance).toBe(11000)
      expect(coveredResult.isPurchaseCoveredByStartingBalance).toBe(true)
      expect(coveredResult.feasibilityStatus).toBe('cash_flow_drawdown')

      // When startingBalance is only 2,000, ending balance drops to -2,000 -> deficit_warning
      const uncoveredResult = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 10000,
        startingBalance: 2000,
        plannedPurchase: { amount: 10000, targetHorizonIndex: 2 },
      })

      expect(uncoveredResult.projectedEndingBalance).toBe(-2000)
      expect(uncoveredResult.isPurchaseCoveredByStartingBalance).toBe(false)
      expect(uncoveredResult.feasibilityStatus).toBe('deficit_warning')
    })

    it('clamps targetHorizonIndex when horizonMonthsOverride is smaller than the target purchase month', () => {
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        horizonMonthsOverride: 2,
        plannedPurchase: { amount: 5000, targetHorizonIndex: 5 },
      })

      expect(result.horizonMonths).toBe(2)
      expect(result.wasPurchaseMonthClamped).toBe(true)
      expect(result.plannedPurchaseMonth).toBe('2027-01') // Month 2 (last month in 2M horizon)
      expect(result.futureHorizonPoints[1].plannedPurchaseAmount).toBe(5000)
    })
  })

  describe('7. Savings Goal Allocation, Non-Double-Counting & Surplus Consistency', () => {
    it('does NOT assume monthly surplus or extraMonthlySavings is automatically swept into a goal by default', () => {
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 20000, // ₹12,000/mo surplus
        extraMonthlySavings: 2000, // Not directed to goal because includeExtraMonthlySavings defaults to false
        goalAllocation: {
          goal: MOCK_GOAL,
          baselineMonthlyContribution: 0,
        },
      })

      expect(result.goalImpact).not.toBeNull()
      expect(result.goalImpact?.includedExtraMonthlySavings).toBe(0)
      expect(result.goalImpact?.simulatedMonthlyContribution).toBe(0)
      expect(result.goalImpact?.baselineMonthsToGoal).toBeNull()
      expect(result.goalImpact?.simulatedMonthsToGoal).toBeNull()
      expect(result.goalImpact?.monthsSaved).toBeNull()
      expect(result.goalImpact?.projectedSavedAtHorizonEnd).toBe(10000)
      // Extra monthly savings (2000) still reduces unallocated surplus from 12000 to 10000
      expect(result.totalCommittedMonthlySavings).toBe(2000)
      expect(result.averageUnallocatedMonthlySurplus).toBe(10000)
    })

    it('redirects ₹2,000 in spending reductions to a goal as ₹2,000 (not ₹4,000) and excludes unrelated extraMonthlySavings', () => {
      // Future variable spend is ₹5,000. Fixed ₹2,000 spending reduction -> simulatedOutflow = ₹6,000.
      // Income = ₹12,000 -> baselineNetSurplus = ₹4,000, simulatedNetSurplus = ₹6,000.
      // User also sets extraMonthlySavings = ₹2,000 (kept as general savings, includeExtraMonthlySavings omitted/false).
      // Redirecting the ₹2,000 spending reduction to the goal must contribute exactly ₹2,000 to the goal (not ₹4,000!).
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 12000,
        spendingReduction: { mode: 'fixed_amount', value: 2000, category: 'all' },
        extraMonthlySavings: 2000,
        goalAllocation: {
          goal: MOCK_GOAL,
          redirectSpendingReductionsToGoal: true,
        },
      })

      expect(result.goalImpact).not.toBeNull()
      expect(result.goalImpact?.redirectedSpendingReduction).toBe(2000)
      expect(result.goalImpact?.includedExtraMonthlySavings).toBe(0)
      expect(result.goalImpact?.additionalMonthlyContribution).toBe(2000)
      expect(result.goalImpact?.simulatedMonthlyContribution).toBe(2000)
      expect(result.goalImpact?.simulatedMonthsToGoal).toBe(10) // 20,000 / 2,000

      // Surplus check: simulatedNetSurplus is ₹6,000.
      // ₹2,000 is committed to general extraMonthlySavings + ₹2,000 is committed to the goal from redirected cuts = ₹4,000 total committed.
      // Remaining unallocated surplus is ₹6,000 - ₹4,000 = ₹2,000 (the same rupee is never in both the goal and unallocated surplus).
      expect(result.averageSimulatedMonthlySurplus).toBe(6000)
      expect(result.totalCommittedMonthlySavings).toBe(4000)
      expect(result.averageUnallocatedMonthlySurplus).toBe(2000)
    })

    it('calculates goal acceleration and unallocated surplus when both extra savings and redirected reductions are explicitly enabled', () => {
      // Goal has ₹20,000 remaining.
      // Income = ₹15,000, baseline outflow = ₹8,000 -> baseline surplus = ₹7,000.
      // 20% variable cut = ₹1,000/mo -> simulated outflow = ₹7,000 -> simulatedNetSurplus = ₹8,000.
      // Baseline goal contribution = ₹2,000/mo (10 months to goal).
      // Extra monthly savings = ₹1,000/mo (includeExtraMonthlySavings: true) + redirected cut (₹1,000/mo) -> ₹4,000/mo total to goal (5 months to goal).
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 15000,
        spendingReduction: { mode: 'percentage', value: 20, category: 'all' },
        extraMonthlySavings: 1000,
        goalAllocation: {
          goal: MOCK_GOAL,
          baselineMonthlyContribution: 2000,
          includeExtraMonthlySavings: true,
          redirectSpendingReductionsToGoal: true,
        },
      })

      expect(result.goalImpact).not.toBeNull()
      expect(result.goalImpact?.projectionBasis).toBe('forecast_backed')
      expect(result.goalImpact?.isForecastBacked).toBe(true)
      expect(result.goalImpact?.baselineMonthlyContribution).toBe(2000)
      expect(result.goalImpact?.includedExtraMonthlySavings).toBe(1000)
      expect(result.goalImpact?.redirectedSpendingReduction).toBe(1000)
      expect(result.goalImpact?.additionalMonthlyContribution).toBe(2000)
      expect(result.goalImpact?.simulatedMonthlyContribution).toBe(4000)
      expect(result.goalImpact?.baselineMonthsToGoal).toBe(10)
      expect(result.goalImpact?.simulatedMonthsToGoal).toBe(5)
      expect(result.goalImpact?.monthsSaved).toBe(5)
      expect(result.goalImpact?.projectionHorizonMonths).toBe(3)
      expect(result.goalImpact?.projectedContributionOverHorizon).toBe(12000)
      expect(result.goalImpact?.projectedSavedAtHorizonEnd).toBe(22000)
      expect(result.goalImpact?.projectedProgressPctAtHorizonEnd).toBe(73.33)
      expect(result.goalImpact?.exceedsProjectedMonthlySurplus).toBe(false)

      // Total committed monthly savings is ₹4,000 (extra ₹1,000 is NOT double-counted as ₹5,000).
      // Unallocated surplus is ₹8,000 - ₹4,000 = ₹4,000.
      expect(result.totalCommittedMonthlySavings).toBe(4000)
      expect(result.averageUnallocatedMonthlySurplus).toBe(4000)
    })

    it('detects when combined general extra savings and goal allocations exceed projected monthly surplus', () => {
      // Income = ₹10,000, baseline outflow = ₹8,000, spending cut = ₹2,000 -> simulatedNetSurplus = ₹4,000.
      // General extraMonthlySavings = ₹3,000 (includeExtraMonthlySavings: false).
      // Redirected spending reduction to goal = ₹2,000 (redirectSpendingReductionsToGoal: true).
      // Combined committed allocation = ₹3,000 + ₹2,000 = ₹5,000 > ₹4,000 surplus!
      const result = runWhatIfSimulation(MOCK_FORECAST, {
        monthlyIncomeOverride: 10000,
        spendingReduction: { mode: 'fixed_amount', value: 2000, category: 'all' },
        extraMonthlySavings: 3000,
        goalAllocation: {
          goal: MOCK_GOAL,
          includeExtraMonthlySavings: false,
          redirectSpendingReductionsToGoal: true,
        },
      })

      expect(result.averageSimulatedMonthlySurplus).toBe(4000)
      expect(result.totalCommittedMonthlySavings).toBe(5000)
      expect(result.averageUnallocatedMonthlySurplus).toBe(-1000)
      expect(result.isSavingsAllocationExceedingSurplus).toBe(true)
      expect(result.goalImpact?.exceedsProjectedMonthlySurplus).toBe(true)
      expect(result.feasibilityStatus).toBe('deficit_warning')
    })
  })

  describe('8. Historical Income Derivation (Choice E1), Zero-Income Months & Partial-Month Fallback', () => {
    it('derives recency-weighted monthly income across 3, 2, and 1 historical months', () => {
      // Reference date is 2026-11-15 -> prior months are 2026-10 (m-1), 2026-09 (m-2), 2026-08 (m-3)
      const txs3Months: Transaction[] = [
        makeIncomeTx(1, '2026-10-01', '10000.00'),
        makeIncomeTx(2, '2026-09-01', '20000.00'),
        makeIncomeTx(3, '2026-08-01', '30000.00'),
      ]
      // 10000 * 0.50 + 20000 * 0.33 + 30000 * 0.17 = 5000 + 6600 + 5100 = 16700
      const derived3 = deriveHistoricalMonthlyIncome(txs3Months, '2026-11-15')
      expect(derived3.source).toBe('derived_history')
      expect(derived3.isPartialMonth).toBe(false)
      expect(derived3.activeHistoryMonthsCount).toBe(3)
      expect(derived3.historyMonthsWithIncome).toBe(3)
      expect(derived3.evaluatedMonths).toEqual(['2026-10', '2026-09', '2026-08'])
      expect(derived3.sourcePeriodLabel).toBe('Aug 2026 – Oct 2026 (3 closed months)')
      expect(derived3.derivedMonthlyIncome).toBe(16700)

      // 2 prior months (earliest tx in 2026-09; 2026-08 is before user's history):
      // 10000 * 0.65 + 20000 * 0.35 = 6500 + 7000 = 13500
      const derived2 = deriveHistoricalMonthlyIncome(txs3Months.slice(0, 2), '2026-11-15')
      expect(derived2.source).toBe('derived_history')
      expect(derived2.activeHistoryMonthsCount).toBe(2)
      expect(derived2.historyMonthsWithIncome).toBe(2)
      expect(derived2.evaluatedMonths).toEqual(['2026-10', '2026-09'])
      expect(derived2.sourcePeriodLabel).toBe('Sep 2026 – Oct 2026 (2 closed months)')
      expect(derived2.derivedMonthlyIncome).toBe(13500)

      // 1 prior month (earliest tx in 2026-10)
      const derived1 = deriveHistoricalMonthlyIncome(txs3Months.slice(0, 1), '2026-11-15')
      expect(derived1.source).toBe('derived_history')
      expect(derived1.activeHistoryMonthsCount).toBe(1)
      expect(derived1.historyMonthsWithIncome).toBe(1)
      expect(derived1.evaluatedMonths).toEqual(['2026-10'])
      expect(derived1.sourcePeriodLabel).toBe('Oct 2026 (1 closed month)')
      expect(derived1.derivedMonthlyIncome).toBe(10000)
    })

    it('keeps a closed month with recorded expenses but ₹0 income in its exact weighted slot without shifting weights', () => {
      // User has activity across all 3 months:
      // 2026-10 (m-1): ₹10,000 income + ₹4,000 expense
      // 2026-09 (m-2): ₹0 income + ₹5,500 expense (genuine zero-income closed month)
      // 2026-08 (m-3): ₹20,000 income + ₹3,000 expense
      const mixedTxs: Transaction[] = [
        makeIncomeTx(1, '2026-10-05', '10000.00'),
        makeExpenseTx(2, '2026-10-12', '4000.00'),
        makeExpenseTx(3, '2026-09-15', '5500.00'),
        makeIncomeTx(4, '2026-08-03', '20000.00'),
        makeExpenseTx(5, '2026-08-20', '3000.00'),
      ]

      const derived = deriveHistoricalMonthlyIncome(mixedTxs, '2026-11-15')
      expect(derived.source).toBe('derived_history')
      expect(derived.activeHistoryMonthsCount).toBe(3)
      expect(derived.historyMonthsWithIncome).toBe(2)
      expect(derived.priorMonthlyIncomes).toEqual([10000, 0, 20000])
      // Exact 3-month weights: 10000 * 0.50 + 0 * 0.33 + 20000 * 0.17 = 5000 + 0 + 3400 = 8400 (NOT 13500!)
      expect(derived.derivedMonthlyIncome).toBe(8400)
    })

    it('handles two consecutive zero-income closed months without inflating weight on 3-months-ago income', () => {
      // User earned ₹30,000 in 2026-08 (m-3), then ₹0 in 2026-09 (m-2) and ₹0 in 2026-10 (m-1)
      const txs: Transaction[] = [
        makeIncomeTx(1, '2026-08-01', '30000.00'),
        makeExpenseTx(2, '2026-09-10', '4000.00'),
        makeExpenseTx(3, '2026-10-10', '4500.00'),
      ]

      const derived = deriveHistoricalMonthlyIncome(txs, '2026-11-15')
      expect(derived.activeHistoryMonthsCount).toBe(3)
      expect(derived.historyMonthsWithIncome).toBe(1)
      expect(derived.priorMonthlyIncomes).toEqual([0, 0, 30000])
      // 0 * 0.50 + 0 * 0.33 + 30000 * 0.17 = 5100 (NOT 30000!)
      expect(derived.derivedMonthlyIncome).toBe(5100)
    })

    it('does not treat months before the earliest recorded transaction as zero-income months, even when a later month has ₹0 income', () => {
      // Earliest transaction is in 2026-09 (m-2) with ₹20,000 income; 2026-08 (m-3) is before user joined.
      // 2026-10 (m-1) has only expenses (₹0 income).
      // Active closed months are [2026-10, 2026-09] (2 months: 0 * 0.65 + 20000 * 0.35 = 7000).
      const txs: Transaction[] = [
        makeIncomeTx(1, '2026-09-05', '20000.00'),
        makeExpenseTx(2, '2026-10-12', '3000.00'),
      ]

      const derived = deriveHistoricalMonthlyIncome(txs, '2026-11-15')
      expect(derived.activeHistoryMonthsCount).toBe(2)
      expect(derived.evaluatedMonths).toEqual(['2026-10', '2026-09'])
      expect(derived.derivedMonthlyIncome).toBe(7000)
    })

    it('marks current-month fallback income as partial and emits a simulation warning', () => {
      const txsCurrentOnly: Transaction[] = [
        makeExpenseTx(1, '2026-10-10', '3000.00'), // Expense in Oct, zero prior income
        makeIncomeTx(2, '2026-11-05', '14500.00'), // Partial current-month income in Nov
      ]
      const derivedCurr = deriveHistoricalMonthlyIncome(txsCurrentOnly, '2026-11-15')
      expect(derivedCurr.source).toBe('derived_current_month')
      expect(derivedCurr.isPartialMonth).toBe(true)
      expect(derivedCurr.evaluatedMonths).toEqual(['2026-11'])
      expect(derivedCurr.sourcePeriodLabel).toBe('Nov 2026 (partial current month-to-date)')
      expect(derivedCurr.derivedMonthlyIncome).toBe(14500)

      const simResult = runWhatIfSimulation(MOCK_FORECAST, {}, txsCurrentOnly)
      expect(simResult.incomeSource).toBe('derived_current_month')
      expect(simResult.isPartialMonthIncome).toBe(true)
      expect(simResult.effectiveMonthlyIncome).toBe(14500)
      expect(
        simResult.warnings.some((w) =>
          w.includes('derived from partial current-month records'),
        ),
      ).toBe(true)
    })

    it('handles unavailable income cleanly without NaN/Infinity while still computing expense-side deltas', () => {
      const result = runWhatIfSimulation(
        MOCK_FORECAST,
        {
          spendingReduction: { mode: 'percentage', value: 20, category: 'all' },
        },
        [],
      )

      expect(result.effectiveMonthlyIncome).toBeNull()
      expect(result.incomeSource).toBe('unavailable')
      expect(result.feasibilityStatus).toBe('income_unavailable')
      expect(result.averageSimulatedMonthlySurplus).toBeNull()
      expect(result.cumulativeSimulatedCashFlow).toBeNull()
      expect(result.projectedEndingBalance).toBeNull()

      // Expense-side simulation still works deterministically
      expect(result.averageSimulatedMonthlyOutflow).toBe(7000)
      expect(result.totalHorizonOutflowSaving).toBe(3000)
      expect(result.futureHorizonPoints[2].cumulativeOutflowDeltaVsBaseline).toBe(3000)
    })

    it('handles cold-start zero-history forecast and invalid inputs without NaN or negative numbers', () => {
      expect(sanitizeNonNegativeCurrency(-500)).toBe(0)
      expect(sanitizeNonNegativeCurrency('invalid')).toBe(0)
      expect(sanitizeNonNegativeCurrency(NaN)).toBe(0)
      expect(sanitizeOptionalCurrency('')).toBeNull()
      expect(clampPercentage(150)).toBe(100)
      expect(clampPercentage(-25)).toBe(0)
      expect(round2(0.1 + 0.2)).toBe(0.3)

      const coldResult = runWhatIfSimulation(MOCK_COLD_START_FORECAST, {
        spendingReduction: { mode: 'percentage', value: 50, category: 'all' },
        recurringExpense: { amount: 1500, frequency: 'monthly' },
        plannedPurchase: { amount: 4000, targetHorizonIndex: 1 },
      })

      expect(coldResult.averageBaselineMonthlyOutflow).toBe(0)
      expect(coldResult.averageMonthlyVariableReduction).toBe(0)
      expect(coldResult.addedRecurringMonthlyEquivalent).toBe(1500)
      expect(coldResult.totalHorizonSimulatedOutflow).toBe(1500 * 3 + 4000)
      expect(Number.isFinite(coldResult.averageSimulatedMonthlyOutflow)).toBe(true)
    })
  })

  describe('9. Empty Future Forecast Handling & Deep Immutability', () => {
    it('returns null for forecast-dependent goal fields and explicitly marks contribution-only illustration when future forecast points are missing', () => {
      const emptyFutureForecast: ForecastSummaryResponse = {
        ...MOCK_COLD_START_FORECAST,
        horizon_months: 3,
        monthly_forecasts: [],
      }

      const result = runWhatIfSimulation(emptyFutureForecast, {
        monthlyIncomeOverride: 15000,
        startingBalance: 25000,
        extraMonthlySavings: 2000,
        goalAllocation: {
          goal: MOCK_GOAL,
          baselineMonthlyContribution: 1000,
          includeExtraMonthlySavings: true,
        },
      })

      expect(result.hasFutureForecastPoints).toBe(false)
      expect(result.horizonMonths).toBe(0)
      expect(result.futureHorizonPoints).toEqual([])
      expect(result.feasibilityStatus).toBe('forecast_unavailable')

      // Must NOT fabricate surplus or ending balance when future forecast points are missing
      expect(result.averageBaselineMonthlySurplus).toBeNull()
      expect(result.averageSimulatedMonthlySurplus).toBeNull()
      expect(result.averageUnallocatedMonthlySurplus).toBeNull()
      expect(result.cumulativeSimulatedCashFlow).toBeNull()
      expect(result.projectedEndingBalance).toBeNull()

      // Goal impact must explicitly mark contribution-only illustration and set forecast-backed horizon fields to null
      expect(result.goalImpact).not.toBeNull()
      expect(result.goalImpact?.projectionBasis).toBe('contribution_only_illustration')
      expect(result.goalImpact?.isForecastBacked).toBe(false)
      expect(result.goalImpact?.simulatedMonthlyContribution).toBe(3000)
      expect(result.goalImpact?.baselineMonthsToGoal).toBe(20)
      expect(result.goalImpact?.simulatedMonthsToGoal).toBe(7)
      expect(result.goalImpact?.monthsSaved).toBe(13)

      // Forecast-dependent horizon fields are strictly null so UI cannot mistake this for a forecast-backed projection
      expect(result.goalImpact?.projectionHorizonMonths).toBeNull()
      expect(result.goalImpact?.projectedContributionOverHorizon).toBeNull()
      expect(result.goalImpact?.projectedSavedAtHorizonEnd).toBeNull()
      expect(result.goalImpact?.projectedProgressPctAtHorizonEnd).toBeNull()

      // Separate contribution-only illustration fields preserve user's manual contribution math over requestedHorizon
      expect(result.goalImpact?.illustrativeHorizonMonths).toBe(3)
      expect(result.goalImpact?.illustrativeContributionOverHorizon).toBe(9000)
      expect(result.goalImpact?.illustrativeSavedAtHorizonEnd).toBe(19000)
      expect(result.goalImpact?.illustrativeProgressPctAtHorizonEnd).toBe(63.33)

      expect(
        result.warnings.some((w) => w.includes('No future monthly forecast points are available')),
      ).toBe(true)
      expect(
        result.warnings.some((w) => w.includes('contribution-only illustration')),
      ).toBe(true)
    })

    it('never mutates deeply frozen forecast, scenario inputs, savings goal, or transaction records', () => {
      const frozenForecast = deepFreeze(structuredClone(MOCK_FORECAST))
      const frozenGoal = deepFreeze(structuredClone(MOCK_GOAL))
      const frozenTransactions = deepFreeze([
        makeIncomeTx(1, '2026-10-01', '15000.00'),
        makeExpenseTx(2, '2026-10-05', '2500.00'),
      ])
      const frozenInputs = deepFreeze<WhatIfScenarioInputs>({
        startingBalance: 10000,
        spendingReduction: { mode: 'percentage', value: 25, category: 'Food/Dining' },
        extraMonthlySavings: 1500,
        recurringExpense: { amount: 500, frequency: 'weekly', description: 'Class' },
        plannedPurchase: { amount: 8000, targetHorizonIndex: 2, description: 'Laptop' },
        goalAllocation: {
          goal: frozenGoal,
          baselineMonthlyContribution: 1000,
          includeExtraMonthlySavings: true,
          redirectSpendingReductionsToGoal: true,
        },
      })

      expect(() =>
        runWhatIfSimulation(frozenForecast, frozenInputs, frozenTransactions),
      ).not.toThrow()
    })
  })
})
