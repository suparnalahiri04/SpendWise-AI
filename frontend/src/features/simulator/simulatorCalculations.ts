import type {
  CategoryForecastItem,
  ForecastSummaryResponse,
  MonthlyForecastPoint,
  RecurringFrequency,
  SavingsGoal,
  Transaction,
} from '@/lib/api/types'

/**
 * Currency & numeric sanitization helpers.
 * All monetary arithmetic uses two-decimal rounding to avoid IEEE-754 drift.
 */

export const MAX_SAFE_CURRENCY = 10_000_000

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export function round2(val: number): number {
  if (!Number.isFinite(val)) return 0
  return Math.round((val + Number.EPSILON) * 100) / 100
}

export function sanitizeNonNegativeCurrency(
  val: string | number | null | undefined,
  maxCap: number = MAX_SAFE_CURRENCY,
): number {
  if (val === null || val === undefined || val === '') return 0
  const cleaned = typeof val === 'string' ? val.replace(/,/g, '').trim() : val
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return round2(Math.min(maxCap, parsed))
}

export function sanitizeOptionalCurrency(
  val: string | number | null | undefined,
  maxCap: number = MAX_SAFE_CURRENCY,
): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'string' && val.trim() === '') return null
  const cleaned = typeof val === 'string' ? val.replace(/,/g, '').trim() : val
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return round2(Math.min(maxCap, Math.max(0, parsed)))
}

export function clampPercentage(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === '') return 0
  const parsed = typeof val === 'number' ? val : Number(String(val).trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return round2(Math.min(100, Math.max(0, parsed)))
}

/**
 * Formats a YYYY-MM string into a short label such as "Oct 2026".
 */
export function formatShortYearMonth(yearMonth: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(yearMonth.trim())
  if (!match) return yearMonth
  const year = match[1]
  const monthIdx = Number(match[2]) - 1
  return `${SHORT_MONTH_NAMES[monthIdx] ?? match[2]} ${year}`
}

/**
 * Normalizes a recurring payment amount and frequency to a monthly equivalent.
 * Matches backend `calculate_monthly_equivalent` in `backend/app/recurring_payments.py`:
 * - weekly: round(amount * 52 / 12, 2)
 * - monthly: amount
 * - quarterly: round(amount / 3, 2)
 * - yearly: round(amount / 12, 2)
 */
export function calculateRecurringMonthlyEquivalent(
  amount: string | number | null | undefined,
  frequency: RecurringFrequency | string = 'monthly',
): number {
  const cleanAmount = sanitizeNonNegativeCurrency(amount)
  if (cleanAmount <= 0) return 0

  switch (frequency) {
    case 'weekly':
      return round2((cleanAmount * 52) / 12)
    case 'monthly':
      return cleanAmount
    case 'quarterly':
      return round2(cleanAmount / 3)
    case 'yearly':
      return round2(cleanAmount / 12)
    default:
      return cleanAmount
  }
}

/**
 * Helper to compute YYYY-MM string offset from a base year and 1-based month.
 */
export function getOffsetYearMonth(
  baseYear: number,
  baseMonth: number,
  offsetMonths: number,
): string {
  const totalMonths = baseYear * 12 + (baseMonth - 1) + offsetMonths
  const y = Math.floor(totalMonths / 12)
  const m = (((totalMonths % 12) + 12) % 12) + 1
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`
}

export type IncomeBaselineSource =
  | 'derived_history'
  | 'derived_current_month'
  | 'manual_override'
  | 'unavailable'

export interface DerivedIncomeBaseline {
  /** Recency-weighted monthly income derived from recorded transactions, or null if unavailable. */
  derivedMonthlyIncome: number | null
  /** Source classification of the derived income. */
  source: 'derived_history' | 'derived_current_month' | 'unavailable'
  /** True when the derived income is based on partial current-month records (`m_0`). */
  isPartialMonth: boolean
  /** Calendar months (YYYY-MM) included in the evaluation window, ordered most-recent first. */
  evaluatedMonths: string[]
  /** Human-readable period description suitable for UI attribution. */
  sourcePeriodLabel: string
  /** Number of active prior closed months (0..3) evaluated based on transaction history span. */
  activeHistoryMonthsCount: number
  /** Number of prior closed months (out of 3) that contained positive recorded income (> ₹0). */
  historyMonthsWithIncome: number
  /** Monthly income totals for the prior 3 closed calendar months [m-1, m-2, m-3]. */
  priorMonthlyIncomes: number[]
}

/**
 * Choice E1: Inspects recorded transactions to derive a reliable historical monthly income
 * baseline without modifying the backend forecast API.
 *
 * Rules:
 * 1. Only genuine income transactions (`transaction_type === 'income'` and `amount > 0`) count as income.
 * 2. Determines the user's active historical span from the earliest recorded transaction date
 *    (across both income and expense transactions) up to `m-1`.
 * 3. Months before the user's earliest recorded transaction are NOT treated as zero-income months.
 * 4. Any closed month within the user's active history span (`k >= earliestTransactionMonth`)
 *    that has no income transactions remains a genuine ₹0 income month in its exact calendar slot
 *    so older months never receive shifted recency weights:
 *    - 3 active closed months [m-1, m-2, m-3]: 50% * I(m-1) + 33% * I(m-2) + 17% * I(m-3)
 *    - 2 active closed months [m-1, m-2]: 65% * I(m-1) + 35% * I(m-2)
 *    - 1 active closed month [m-1]: 100% * I(m-1)
 * 5. If no prior closed months have positive income, falls back to current month (`m_0`) if > 0
 *    and explicitly marks `isPartialMonth: true`.
 */
export function deriveHistoricalMonthlyIncome(
  transactions: readonly Transaction[] | null | undefined,
  referenceDateStr?: string | null,
): DerivedIncomeBaseline {
  if (!transactions || transactions.length === 0) {
    return {
      derivedMonthlyIncome: null,
      source: 'unavailable',
      isPartialMonth: false,
      evaluatedMonths: [],
      sourcePeriodLabel: 'No recorded income history',
      activeHistoryMonthsCount: 0,
      historyMonthsWithIncome: 0,
      priorMonthlyIncomes: [0, 0, 0],
    }
  }

  let refYear: number
  let refMonth: number

  const match = referenceDateStr ? /^(\d{4})-(\d{2})/.exec(referenceDateStr.trim()) : null
  if (match) {
    refYear = Number(match[1])
    refMonth = Number(match[2])
  } else {
    const now = new Date()
    refYear = now.getFullYear()
    refMonth = now.getMonth() + 1
  }

  const currentMonthKey = getOffsetYearMonth(refYear, refMonth, 0)
  // Ordered most recent closed month first: [m-1, m-2, m-3]
  const priorMonthKeys = [
    getOffsetYearMonth(refYear, refMonth, -1),
    getOffsetYearMonth(refYear, refMonth, -2),
    getOffsetYearMonth(refYear, refMonth, -3),
  ]

  const incomeByMonth = new Map<string, number>()
  let earliestTransactionMonth: string | null = null

  for (const tx of transactions) {
    if (!tx.transaction_date) continue
    const monthMatch = /^(\d{4}-\d{2})/.exec(tx.transaction_date.trim())
    if (!monthMatch) continue
    const monthKey = monthMatch[1]

    const amt = sanitizeNonNegativeCurrency(tx.amount)
    if (amt <= 0) continue

    // Track earliest recorded activity across all valid transactions (income or expense)
    if (
      tx.transaction_type === 'income' ||
      tx.transaction_type === 'expense'
    ) {
      if (earliestTransactionMonth === null || monthKey < earliestTransactionMonth) {
        earliestTransactionMonth = monthKey
      }
    }

    // Only genuine income transactions contribute to income totals
    if (tx.transaction_type === 'income') {
      incomeByMonth.set(monthKey, round2((incomeByMonth.get(monthKey) ?? 0) + amt))
    }
  }

  const priorMonthlyIncomes = priorMonthKeys.map((k) => incomeByMonth.get(k) ?? 0)
  const historyMonthsWithIncome = priorMonthlyIncomes.filter((val) => val > 0).length

  // Determine which of [m-1, m-2, m-3] fall on or after the user's earliest recorded transaction
  const activeClosedMonthKeys =
    earliestTransactionMonth !== null
      ? priorMonthKeys.filter((k) => k >= earliestTransactionMonth!)
      : []
  const activeHistoryMonthsCount = activeClosedMonthKeys.length

  // Check if there is any positive income across the active closed months
  const hasPositivePriorIncome = activeClosedMonthKeys.some(
    (k) => (incomeByMonth.get(k) ?? 0) > 0,
  )

  if (hasPositivePriorIncome) {
    if (activeHistoryMonthsCount === 3) {
      // [m-1, m-2, m-3] all within active history span — preserve exact slots including ₹0 months
      const weighted = round2(
        priorMonthlyIncomes[0] * 0.5 +
          priorMonthlyIncomes[1] * 0.33 +
          priorMonthlyIncomes[2] * 0.17,
      )
      const periodLabel = `${formatShortYearMonth(priorMonthKeys[2])} – ${formatShortYearMonth(priorMonthKeys[0])} (3 closed months)`
      return {
        derivedMonthlyIncome: weighted,
        source: 'derived_history',
        isPartialMonth: false,
        evaluatedMonths: [...priorMonthKeys],
        sourcePeriodLabel: periodLabel,
        activeHistoryMonthsCount: 3,
        historyMonthsWithIncome,
        priorMonthlyIncomes,
      }
    }

    if (activeHistoryMonthsCount === 2) {
      // User history started at m-2; m-3 is before earliest transaction and excluded.
      // m-1 and m-2 preserve their exact 65% / 35% slots even if one of them is ₹0.
      const weighted = round2(
        priorMonthlyIncomes[0] * 0.65 + priorMonthlyIncomes[1] * 0.35,
      )
      const evaluated = [priorMonthKeys[0], priorMonthKeys[1]]
      const periodLabel = `${formatShortYearMonth(priorMonthKeys[1])} – ${formatShortYearMonth(priorMonthKeys[0])} (2 closed months)`
      return {
        derivedMonthlyIncome: weighted,
        source: 'derived_history',
        isPartialMonth: false,
        evaluatedMonths: evaluated,
        sourcePeriodLabel: periodLabel,
        activeHistoryMonthsCount: 2,
        historyMonthsWithIncome,
        priorMonthlyIncomes,
      }
    }

    // activeHistoryMonthsCount === 1 (user history started at m-1)
    const evaluated = [priorMonthKeys[0]]
    const periodLabel = `${formatShortYearMonth(priorMonthKeys[0])} (1 closed month)`
    return {
      derivedMonthlyIncome: round2(priorMonthlyIncomes[0]),
      source: 'derived_history',
      isPartialMonth: false,
      evaluatedMonths: evaluated,
      sourcePeriodLabel: periodLabel,
      activeHistoryMonthsCount: 1,
      historyMonthsWithIncome,
      priorMonthlyIncomes,
    }
  }

  // Fallback to current month (m_0) if positive income is recorded in the current month
  const currentMonthIncome = incomeByMonth.get(currentMonthKey) ?? 0
  if (currentMonthIncome > 0) {
    const periodLabel = `${formatShortYearMonth(currentMonthKey)} (partial current month-to-date)`
    return {
      derivedMonthlyIncome: round2(currentMonthIncome),
      source: 'derived_current_month',
      isPartialMonth: true,
      evaluatedMonths: [currentMonthKey],
      sourcePeriodLabel: periodLabel,
      activeHistoryMonthsCount,
      historyMonthsWithIncome: 0,
      priorMonthlyIncomes,
    }
  }

  return {
    derivedMonthlyIncome: null,
    source: 'unavailable',
    isPartialMonth: false,
    evaluatedMonths: [...activeClosedMonthKeys],
    sourcePeriodLabel: 'No recorded income history',
    activeHistoryMonthsCount,
    historyMonthsWithIncome: 0,
    priorMonthlyIncomes,
  }
}

export type SpendingReductionMode = 'percentage' | 'fixed_amount'

export interface HypotheticalSpendingReduction {
  mode: SpendingReductionMode
  /** Percentage (0-100) when mode === 'percentage', or ₹ amount when mode === 'fixed_amount'. */
  value: number | string
  /**
   * 'all' (or null/undefined) to apply across total variable spending,
   * or a specific category name from `category_forecasts`.
   */
  category?: string | null
}

export interface HypotheticalRecurringExpense {
  description?: string
  amount: number | string
  frequency: RecurringFrequency
}

export interface HypotheticalPlannedPurchase {
  description?: string
  amount: number | string
  /**
   * 1-based future horizon month index (1..H) or YYYY-MM string.
   * Defaults to 1 (next complete calendar month) if not specified.
   */
  targetHorizonIndex?: number
  targetMonth?: string | null
}

export interface HypotheticalGoalAllocation {
  /** Target SavingsGoal to evaluate, if any. */
  goal?: Pick<
    SavingsGoal,
    'id' | 'name' | 'target_amount' | 'total_contributed' | 'remaining_amount' | 'status'
  > | null
  /**
   * Existing baseline monthly contribution the user already makes toward this goal (default 0).
   * Never automatically assumed to equal total monthly surplus.
   */
  baselineMonthlyContribution?: number | string | null
  /**
   * Whether the user explicitly chooses to direct `extraMonthlySavings` to this goal.
   * Defaults to `false` so extra monthly savings are never automatically added to a goal.
   */
  includeExtraMonthlySavings?: boolean
  /**
   * Whether the user explicitly chooses to redirect monthly variable spending reductions into this goal.
   * Defaults to `false`.
   */
  redirectSpendingReductionsToGoal?: boolean
  /**
   * Optional explicit monthly contribution override/addition toward the goal.
   */
  explicitAdditionalContribution?: number | string | null
}

export interface WhatIfScenarioInputs {
  /**
   * Optional manual monthly income override entered by the user.
   * Distinguished from automatically derived income.
   */
  monthlyIncomeOverride?: number | string | null
  /**
   * Optional starting available balance (liquid savings/checking buffer).
   * When omitted/null, outputs are strictly reported as cumulative cash-flow impact.
   */
  startingBalance?: number | string | null
  /**
   * Optional override for number of forward months (1..6) to evaluate from `monthly_forecasts`.
   */
  horizonMonthsOverride?: number | null
  /**
   * Hypothetical reduction to variable (discretionary) spending.
   */
  spendingReduction?: HypotheticalSpendingReduction | null
  /**
   * Hypothetical extra monthly savings allocation (an allocation of surplus, NOT an expense).
   */
  extraMonthlySavings?: number | string | null
  /**
   * Hypothetical new recurring commitment.
   */
  recurringExpense?: HypotheticalRecurringExpense | null
  /**
   * Hypothetical one-time large purchase in a future horizon month.
   */
  plannedPurchase?: HypotheticalPlannedPurchase | null
  /**
   * Optional savings-goal acceleration parameters.
   */
  goalAllocation?: HypotheticalGoalAllocation | null
}

export interface SimulatedMonthPoint {
  month: string // YYYY-MM
  monthLabel: string
  /** True only for the current-month anchor (`monthly_forecasts[0]`). */
  isAnchorMonth: boolean
  /** 0 for the current-month anchor; 1..H for future horizon months. */
  horizonIndex: number
  /** Month-to-date actual spending for the anchor month, or null for future months. */
  actualAmount: number | null

  // Baseline expense components
  baselineFixed: number
  baselineVariable: number
  baselineOutflow: number

  // Simulated expense adjustments
  variableReductionAmount: number
  addedRecurringMonthlyEquivalent: number
  plannedPurchaseAmount: number

  // Simulated expense components
  simulatedFixed: number
  simulatedVariable: number
  simulatedOutflow: number

  /**
   * Expense-side monthly savings delta: `baselineOutflow - simulatedOutflow`.
   * Positive when simulated outflow is lower than baseline; negative when higher.
   */
  monthlyOutflowSaving: number

  // Surplus & allocation metrics (populated when effectiveMonthlyIncome !== null)
  baselineNetSurplus: number | null
  simulatedNetSurplus: number | null
  /** General extra monthly savings allocation configured by user. */
  extraSavingsAllocation: number
  /**
   * Total monthly savings committed out of `simulatedNetSurplus` (combining general extra savings,
   * baseline goal contribution, redirected variable spending cuts, and explicit goal additions
   * without double counting).
   */
  committedSavingsAllocation: number
  /**
   * Remaining unallocated monthly surplus after setting aside `committedSavingsAllocation`:
   * `simulatedNetSurplus - committedSavingsAllocation`.
   */
  unallocatedSurplus: number | null

  // Cumulative horizon trajectories (accumulated over future horizon months 1..h; 0 at anchor month)
  cumulativeBaselineCashFlow: number | null
  cumulativeSimulatedCashFlow: number | null
  /**
   * Cumulative cash-flow impact relative to baseline expenses over future months 1..h:
   * `Sum_{k=1..h} (baselineOutflow(k) - simulatedOutflow(k))`.
   * Always available even when monthly income is unknown.
   */
  cumulativeOutflowDeltaVsBaseline: number
  /**
   * Projected available balance at the end of month h:
   * `startingBalance + cumulativeSimulatedCashFlow(h)`.
   * Strictly `null` unless both `startingBalance` and `effectiveMonthlyIncome` are provided/known.
   */
  projectedAvailableBalance: number | null
}

export type GoalProjectionBasis = 'forecast_backed' | 'contribution_only_illustration'

export interface SimulatedGoalImpact {
  goalId: number
  goalName: string
  targetAmount: number
  currentlySaved: number
  remainingAmount: number
  /**
   * Explicitly distinguishes a forecast-backed goal projection (computed over available future
   * forecast months) from a contribution-only illustration (when future forecast points are unavailable).
   */
  projectionBasis: GoalProjectionBasis
  /** True only when future forecast points exist (`hasFutureForecastPoints === true`). */
  isForecastBacked: boolean
  baselineMonthlyContribution: number
  /** Portion of `extraMonthlySavings` explicitly included in this goal (0 unless `includeExtraMonthlySavings === true`). */
  includedExtraMonthlySavings: number
  /** Portion of monthly variable spending reductions explicitly redirected to this goal. */
  redirectedSpendingReduction: number
  /** Explicit additional monthly goal contribution configured on `goalAllocation`. */
  explicitAdditionalContribution: number
  additionalMonthlyContribution: number
  simulatedMonthlyContribution: number
  baselineMonthsToGoal: number | null
  simulatedMonthsToGoal: number | null
  monthsSaved: number | null
  /**
   * Forecast-backed horizon projections.
   * Strictly `null` when `hasFutureForecastPoints === false` so an unavailable forecast can never
   * be mistaken for a forecast-backed goal projection.
   */
  projectionHorizonMonths: number | null
  projectedContributionOverHorizon: number | null
  projectedSavedAtHorizonEnd: number | null
  projectedProgressPctAtHorizonEnd: number | null
  /**
   * Clearly named contribution-only illustration fields over `requestedHorizon`.
   * Preserves user-configured monthly contribution math when future forecast data is unavailable.
   */
  illustrativeHorizonMonths: number
  illustrativeContributionOverHorizon: number
  illustrativeSavedAtHorizonEnd: number
  illustrativeProgressPctAtHorizonEnd: number
  /** True if `simulatedMonthlyContribution` or `totalCommittedMonthlySavings` exceeds ongoing `simulatedNetSurplus`. */
  exceedsProjectedMonthlySurplus: boolean
}

export type ScenarioFeasibilityStatus =
  | 'sustainable'
  | 'tight_margin'
  | 'cash_flow_drawdown'
  | 'deficit_warning'
  | 'income_unavailable'
  | 'forecast_unavailable'

export interface WhatIfSimulationResult {
  /** Count of evaluated future forecast months (0 when `monthly_forecasts` has no future points). */
  horizonMonths: number
  /** True when at least 1 future forecast point (`is_current_month === false`) is available. */
  hasFutureForecastPoints: boolean
  referenceDate: string

  // Income metadata
  effectiveMonthlyIncome: number | null
  incomeSource: IncomeBaselineSource
  isPartialMonthIncome: boolean
  incomeSourcePeriodLabel: string
  derivedIncomeBaseline: DerivedIncomeBaseline

  // Starting balance metadata
  hasStartingBalance: boolean
  startingBalance: number | null

  // Trajectory points
  /** Preserved read-only current-month anchor (`is_current_month === true`), if present in forecast. */
  anchorMonthPoint: SimulatedMonthPoint | null
  /** Future complete horizon months (1..H) where hypothetical adjustments are applied. */
  futureHorizonPoints: SimulatedMonthPoint[]
  /** Combined array `[anchorMonthPoint, ...futureHorizonPoints]` for unified chart rendering. */
  allTrajectoryPoints: SimulatedMonthPoint[]

  // Horizon summary metrics (computed strictly over future horizon months 1..H)
  averageBaselineMonthlyOutflow: number
  averageSimulatedMonthlyOutflow: number
  averageMonthlyVariableReduction: number
  addedRecurringMonthlyEquivalent: number
  extraMonthlySavingsAllocation: number
  /**
   * Combined monthly savings allocation deducted from `simulatedNetSurplus`
   * (counts `extraMonthlySavings`, `baselineMonthlyContribution`, redirected spending cuts,
   * and `explicitAdditionalContribution` without double counting).
   */
  totalCommittedMonthlySavings: number
  plannedPurchaseTotal: number
  plannedPurchaseMonth: string | null
  plannedPurchaseMonthLabel: string | null

  totalHorizonBaselineOutflow: number
  totalHorizonSimulatedOutflow: number
  /** Total expense delta over H months (`totalHorizonBaselineOutflow - totalHorizonSimulatedOutflow`). */
  totalHorizonOutflowSaving: number

  averageBaselineMonthlySurplus: number | null
  averageSimulatedMonthlySurplus: number | null
  averageUnallocatedMonthlySurplus: number | null

  /** Cumulative net cash flow (`Sum(Income - Outflow)`) over the H future months. */
  cumulativeBaselineCashFlow: number | null
  cumulativeSimulatedCashFlow: number | null
  /**
   * Projected ending balance at month H (`startingBalance + cumulativeSimulatedCashFlow`).
   * Null when `startingBalance`, `effectiveMonthlyIncome`, or future forecast points are unavailable.
   */
  projectedEndingBalance: number | null

  // Goal impact
  goalImpact: SimulatedGoalImpact | null

  // Safeguard flags & status
  isCappedAtVariableFloor: boolean
  isCappedAtCategoryVariableCeiling: boolean
  selectedCategoryVariableCeiling: number | null
  wasPurchaseMonthClamped: boolean
  isSavingsAllocationExceedingSurplus: boolean
  isPurchaseCoveredByStartingBalance: boolean | null
  feasibilityStatus: ScenarioFeasibilityStatus
  warnings: string[]
}

/**
 * Pure, deterministic What-If Financial Simulation engine.
 */
export function runWhatIfSimulation(
  forecast: ForecastSummaryResponse,
  inputs: WhatIfScenarioInputs = {},
  transactions?: readonly Transaction[] | null,
): WhatIfSimulationResult {
  const warnings: string[] = []

  // 1. Income resolution (Choice E1: derived from transactions vs manual override vs unavailable)
  const derivedIncomeBaseline = deriveHistoricalMonthlyIncome(
    transactions,
    forecast.reference_date,
  )
  const manualIncome = sanitizeOptionalCurrency(inputs.monthlyIncomeOverride)

  let effectiveMonthlyIncome: number | null = null
  let incomeSource: IncomeBaselineSource = 'unavailable'
  let isPartialMonthIncome = false
  let incomeSourcePeriodLabel = derivedIncomeBaseline.sourcePeriodLabel

  if (manualIncome !== null) {
    effectiveMonthlyIncome = manualIncome
    incomeSource = 'manual_override'
    isPartialMonthIncome = false
    incomeSourcePeriodLabel = 'User-entered monthly income assumption'
  } else if (
    derivedIncomeBaseline.derivedMonthlyIncome !== null &&
    derivedIncomeBaseline.derivedMonthlyIncome > 0
  ) {
    effectiveMonthlyIncome = derivedIncomeBaseline.derivedMonthlyIncome
    incomeSource = derivedIncomeBaseline.source
    isPartialMonthIncome = derivedIncomeBaseline.isPartialMonth
    incomeSourcePeriodLabel = derivedIncomeBaseline.sourcePeriodLabel

    if (isPartialMonthIncome) {
      warnings.push(
        `Monthly income baseline is derived from partial current-month records (${derivedIncomeBaseline.sourcePeriodLabel}) and may not reflect a full calendar month.`,
      )
    }
  }

  // 2. Starting available balance resolution
  const parsedStartingBalance = sanitizeOptionalCurrency(inputs.startingBalance)
  const hasStartingBalance = parsedStartingBalance !== null
  const startingBalance = parsedStartingBalance

  // 3. Separate current-month anchor from future horizon months
  const rawMonthly = forecast.monthly_forecasts ?? []
  const rawAnchor =
    rawMonthly.find((pt) => pt.is_current_month) ?? forecast.current_month_forecast ?? null
  const rawFutureAll = rawMonthly.filter((pt) => !pt.is_current_month && !pt.is_historical)

  const requestedHorizon =
    inputs.horizonMonthsOverride !== undefined && inputs.horizonMonthsOverride !== null
      ? Math.min(6, Math.max(1, Math.round(Number(inputs.horizonMonthsOverride))))
      : Math.min(6, Math.max(1, forecast.horizon_months || rawFutureAll.length || 3))

  const futurePointsRaw: MonthlyForecastPoint[] = rawFutureAll.slice(0, requestedHorizon)
  const effectiveHorizonCount = futurePointsRaw.length
  const hasFutureForecastPoints = effectiveHorizonCount > 0

  if (!hasFutureForecastPoints) {
    warnings.push(
      'No future monthly forecast points are available; horizon cash-flow projections require at least one future forecast month.',
    )
  }

  // 4. Category variable ceiling lookup (if spending reduction targets a specific category)
  const reductionConfig = inputs.spendingReduction
  const rawCatFilter = reductionConfig?.category?.trim()
  const isCategorySpecific = Boolean(
    rawCatFilter && rawCatFilter.toLowerCase() !== 'all',
  )

  let selectedCategoryVariableCeiling: number | null = null
  let matchedCategoryItem: CategoryForecastItem | undefined

  if (isCategorySpecific && rawCatFilter) {
    matchedCategoryItem = (forecast.category_forecasts ?? []).find(
      (c) => c.category.trim().toLowerCase() === rawCatFilter.toLowerCase(),
    )
    selectedCategoryVariableCeiling = matchedCategoryItem
      ? sanitizeNonNegativeCurrency(matchedCategoryItem.variable_amount)
      : 0
  }

  // 5. Hypothetical recurring commitment monthly equivalent
  const addedRecurringMonthlyEquivalent = inputs.recurringExpense
    ? calculateRecurringMonthlyEquivalent(
        inputs.recurringExpense.amount,
        inputs.recurringExpense.frequency,
      )
    : 0

  // 6. Extra monthly savings allocation (allocation of surplus, NOT an expense)
  const extraMonthlySavingsAllocation = sanitizeNonNegativeCurrency(inputs.extraMonthlySavings)

  // 7. Planned one-time purchase resolution & horizon clamping
  const rawPurchaseAmount = inputs.plannedPurchase
    ? sanitizeNonNegativeCurrency(inputs.plannedPurchase.amount)
    : 0

  let targetPurchaseHorizonIdx: number | null = null
  let wasPurchaseMonthClamped = false

  if (rawPurchaseAmount > 0 && hasFutureForecastPoints) {
    const targetMonthStr = inputs.plannedPurchase?.targetMonth?.trim()
    if (targetMonthStr) {
      const foundIdx = futurePointsRaw.findIndex((pt) => pt.month === targetMonthStr)
      if (foundIdx >= 0) {
        targetPurchaseHorizonIdx = foundIdx + 1
      } else {
        targetPurchaseHorizonIdx = effectiveHorizonCount
        wasPurchaseMonthClamped = true
      }
    } else if (
      inputs.plannedPurchase?.targetHorizonIndex !== undefined &&
      inputs.plannedPurchase?.targetHorizonIndex !== null
    ) {
      const rawIdx = Math.round(Number(inputs.plannedPurchase.targetHorizonIndex))
      if (!Number.isFinite(rawIdx) || rawIdx < 1) {
        targetPurchaseHorizonIdx = 1
        wasPurchaseMonthClamped = true
      } else if (rawIdx > effectiveHorizonCount) {
        targetPurchaseHorizonIdx = effectiveHorizonCount
        wasPurchaseMonthClamped = true
      } else {
        targetPurchaseHorizonIdx = rawIdx
      }
    } else {
      targetPurchaseHorizonIdx = 1
    }
  }

  if (wasPurchaseMonthClamped) {
    warnings.push(
      'Planned purchase month was adjusted to fit within the selected forecast horizon.',
    )
  }

  // 8. Build read-only Current-Month Anchor point (not treated as a complete future month)
  let anchorMonthPoint: SimulatedMonthPoint | null = null
  if (rawAnchor) {
    const anchorFixed = sanitizeNonNegativeCurrency(rawAnchor.fixed_commitments)
    const anchorVariable = sanitizeNonNegativeCurrency(rawAnchor.variable_estimate)
    const anchorPredicted = sanitizeNonNegativeCurrency(rawAnchor.predicted_amount)
    const anchorActual =
      rawAnchor.actual_amount !== null && rawAnchor.actual_amount !== undefined
        ? sanitizeNonNegativeCurrency(rawAnchor.actual_amount)
        : null

    const anchorSurplus =
      effectiveMonthlyIncome !== null ? round2(effectiveMonthlyIncome - anchorPredicted) : null

    anchorMonthPoint = {
      month: rawAnchor.month,
      monthLabel: rawAnchor.month_label,
      isAnchorMonth: true,
      horizonIndex: 0,
      actualAmount: anchorActual,
      baselineFixed: anchorFixed,
      baselineVariable: anchorVariable,
      baselineOutflow: anchorPredicted,
      variableReductionAmount: 0,
      addedRecurringMonthlyEquivalent: 0,
      plannedPurchaseAmount: 0,
      simulatedFixed: anchorFixed,
      simulatedVariable: anchorVariable,
      simulatedOutflow: anchorPredicted,
      monthlyOutflowSaving: 0,
      baselineNetSurplus: anchorSurplus,
      simulatedNetSurplus: anchorSurplus,
      extraSavingsAllocation: 0,
      committedSavingsAllocation: 0,
      unallocatedSurplus: anchorSurplus,
      cumulativeBaselineCashFlow: 0,
      cumulativeSimulatedCashFlow: 0,
      cumulativeOutflowDeltaVsBaseline: 0,
      projectedAvailableBalance: startingBalance,
    }
  }

  // 9. First pass over future horizon months (1..H) to compute variable reductions & outflows
  const futureHorizonPoints: SimulatedMonthPoint[] = []
  let isCappedAtVariableFloor = false
  let isCappedAtCategoryVariableCeiling = false

  let runningBaselineCashFlow = 0
  let runningSimulatedCashFlow = 0
  let runningOutflowDelta = 0

  let plannedPurchaseMonth: string | null = null
  let plannedPurchaseMonthLabel: string | null = null

  for (let i = 0; i < futurePointsRaw.length; i++) {
    const pt = futurePointsRaw[i]
    const horizonIndex = i + 1

    const baseFixed = sanitizeNonNegativeCurrency(pt.fixed_commitments)
    const baseVar = sanitizeNonNegativeCurrency(pt.variable_estimate)
    const baseOutflow = round2(baseFixed + baseVar)

    let reducibleCeiling = baseVar
    if (isCategorySpecific && selectedCategoryVariableCeiling !== null) {
      reducibleCeiling = Math.min(baseVar, selectedCategoryVariableCeiling)
    }

    let variableReductionAmount = 0
    if (reductionConfig && reductionConfig.value !== undefined && reductionConfig.value !== null) {
      if (reductionConfig.mode === 'percentage') {
        const pct = clampPercentage(reductionConfig.value)
        variableReductionAmount = round2(reducibleCeiling * (pct / 100))
      } else {
        const requestedCut = sanitizeNonNegativeCurrency(reductionConfig.value)
        if (isCategorySpecific && selectedCategoryVariableCeiling !== null) {
          if (requestedCut > selectedCategoryVariableCeiling) {
            isCappedAtCategoryVariableCeiling = true
          }
        }
        if (requestedCut > baseVar) {
          isCappedAtVariableFloor = true
        }
        variableReductionAmount = round2(Math.min(reducibleCeiling, requestedCut))
      }
    }

    const simVar = round2(Math.max(0, baseVar - variableReductionAmount))
    const simFixed = round2(baseFixed + addedRecurringMonthlyEquivalent)
    const purchaseThisMonth =
      targetPurchaseHorizonIdx === horizonIndex ? rawPurchaseAmount : 0

    if (purchaseThisMonth > 0) {
      plannedPurchaseMonth = pt.month
      plannedPurchaseMonthLabel = pt.month_label
    }

    const simOutflow = round2(simFixed + simVar + purchaseThisMonth)
    const monthlyOutflowSaving = round2(baseOutflow - simOutflow)

    runningOutflowDelta = round2(runningOutflowDelta + monthlyOutflowSaving)

    let baseSurplus: number | null = null
    let simSurplus: number | null = null
    let cumBaseCF: number | null = null
    let cumSimCF: number | null = null
    let projectedAvailableBalance: number | null = null

    if (effectiveMonthlyIncome !== null) {
      baseSurplus = round2(effectiveMonthlyIncome - baseOutflow)
      simSurplus = round2(effectiveMonthlyIncome - simOutflow)

      runningBaselineCashFlow = round2(runningBaselineCashFlow + baseSurplus)
      runningSimulatedCashFlow = round2(runningSimulatedCashFlow + simSurplus)

      cumBaseCF = runningBaselineCashFlow
      cumSimCF = runningSimulatedCashFlow

      if (startingBalance !== null) {
        projectedAvailableBalance = round2(startingBalance + runningSimulatedCashFlow)
      }
    }

    futureHorizonPoints.push({
      month: pt.month,
      monthLabel: pt.month_label,
      isAnchorMonth: false,
      horizonIndex,
      actualAmount: null,
      baselineFixed: baseFixed,
      baselineVariable: baseVar,
      baselineOutflow: baseOutflow,
      variableReductionAmount,
      addedRecurringMonthlyEquivalent,
      plannedPurchaseAmount: purchaseThisMonth,
      simulatedFixed: simFixed,
      simulatedVariable: simVar,
      simulatedOutflow: simOutflow,
      monthlyOutflowSaving,
      baselineNetSurplus: baseSurplus,
      simulatedNetSurplus: simSurplus,
      extraSavingsAllocation: extraMonthlySavingsAllocation,
      committedSavingsAllocation: extraMonthlySavingsAllocation, // finalized below once goal allocation is resolved
      unallocatedSurplus: null, // finalized below once goal allocation is resolved
      cumulativeBaselineCashFlow: cumBaseCF,
      cumulativeSimulatedCashFlow: cumSimCF,
      cumulativeOutflowDeltaVsBaseline: runningOutflowDelta,
      projectedAvailableBalance,
    })
  }

  if (isCappedAtCategoryVariableCeiling && rawCatFilter) {
    warnings.push(
      `Spending reduction in ${rawCatFilter} was capped at its projected variable spending (₹${(selectedCategoryVariableCeiling ?? 0).toFixed(2)}/mo). Fixed commitments cannot be reduced.`,
    )
  } else if (isCappedAtVariableFloor) {
    warnings.push(
      'Spending reduction was capped at total projected variable spending so fixed commitments remain intact.',
    )
  }

  // 10. Aggregate horizon expense & reduction averages across future months (1..H)
  const hCount = futureHorizonPoints.length
  const totalHorizonBaselineOutflow = round2(
    futureHorizonPoints.reduce((acc, p) => acc + p.baselineOutflow, 0),
  )
  const totalHorizonSimulatedOutflow = round2(
    futureHorizonPoints.reduce((acc, p) => acc + p.simulatedOutflow, 0),
  )
  const totalHorizonOutflowSaving = round2(
    totalHorizonBaselineOutflow - totalHorizonSimulatedOutflow,
  )

  const averageBaselineMonthlyOutflow =
    hCount > 0 ? round2(totalHorizonBaselineOutflow / hCount) : 0
  const averageSimulatedMonthlyOutflow =
    hCount > 0 ? round2(totalHorizonSimulatedOutflow / hCount) : 0
  const averageMonthlyVariableReduction =
    hCount > 0
      ? round2(
          futureHorizonPoints.reduce((acc, p) => acc + p.variableReductionAmount, 0) / hCount,
        )
      : 0

  const plannedPurchaseTotal =
    targetPurchaseHorizonIdx !== null && hCount > 0 ? rawPurchaseAmount : 0

  // Ongoing monthly outflow & surplus (excluding the one-time purchase spike)
  const ongoingSimulatedMonthlyOutflow =
    hCount > 0
      ? round2((totalHorizonSimulatedOutflow - plannedPurchaseTotal) / hCount)
      : null
  const ongoingSimulatedMonthlySurplus =
    effectiveMonthlyIncome !== null && ongoingSimulatedMonthlyOutflow !== null
      ? round2(effectiveMonthlyIncome - ongoingSimulatedMonthlyOutflow)
      : null

  // 11. Unified Savings-Goal & Total Committed Savings Allocation Accounting
  // Extra monthly savings is ONLY included in a goal when `includeExtraMonthlySavings: true` is explicitly passed.
  const goalConfig = inputs.goalAllocation
  const baselineGoalContribution = goalConfig?.goal
    ? sanitizeNonNegativeCurrency(goalConfig.baselineMonthlyContribution)
    : 0
  const includeExtraInGoal = Boolean(
    goalConfig?.goal && goalConfig.includeExtraMonthlySavings === true,
  )
  const redirectCutsToGoal = Boolean(
    goalConfig?.goal && goalConfig.redirectSpendingReductionsToGoal === true,
  )
  const explicitGoalAddition = goalConfig?.goal
    ? sanitizeNonNegativeCurrency(goalConfig.explicitAdditionalContribution)
    : 0

  const redirectedCutContribution = redirectCutsToGoal ? averageMonthlyVariableReduction : 0
  const includedExtraInGoalAmount = includeExtraInGoal ? extraMonthlySavingsAllocation : 0

  // Total monthly savings committed out of `simulatedNetSurplus`:
  // Counts `extraMonthlySavingsAllocation` ONCE (whether kept as general savings or directed into the goal),
  // plus any goal-specific contributions (`baselineGoalContribution`, `redirectedCutContribution`, `explicitGoalAddition`).
  const totalCommittedMonthlySavings = round2(
    extraMonthlySavingsAllocation +
      baselineGoalContribution +
      redirectedCutContribution +
      explicitGoalAddition,
  )

  // Finalize per-month committedSavingsAllocation and unallocatedSurplus
  for (const pt of futureHorizonPoints) {
    const monthRedirectedCut = redirectCutsToGoal ? pt.variableReductionAmount : 0
    const monthCommittedSavings = round2(
      extraMonthlySavingsAllocation +
        baselineGoalContribution +
        monthRedirectedCut +
        explicitGoalAddition,
    )
    pt.committedSavingsAllocation = monthCommittedSavings
    if (pt.simulatedNetSurplus !== null) {
      pt.unallocatedSurplus = round2(pt.simulatedNetSurplus - monthCommittedSavings)
    }
  }

  let averageBaselineMonthlySurplus: number | null = null
  let averageSimulatedMonthlySurplus: number | null = null
  let averageUnallocatedMonthlySurplus: number | null = null
  let cumulativeBaselineCashFlow: number | null = null
  let cumulativeSimulatedCashFlow: number | null = null
  let projectedEndingBalance: number | null = null

  if (effectiveMonthlyIncome !== null && hCount > 0) {
    cumulativeBaselineCashFlow = runningBaselineCashFlow
    cumulativeSimulatedCashFlow = runningSimulatedCashFlow
    averageBaselineMonthlySurplus = round2(runningBaselineCashFlow / hCount)
    averageSimulatedMonthlySurplus = round2(runningSimulatedCashFlow / hCount)
    averageUnallocatedMonthlySurplus = round2(
      averageSimulatedMonthlySurplus - totalCommittedMonthlySavings,
    )
    if (startingBalance !== null) {
      projectedEndingBalance = round2(startingBalance + runningSimulatedCashFlow)
    }
  }

  const isSavingsAllocationExceedingSurplus = Boolean(
    ongoingSimulatedMonthlySurplus !== null &&
      totalCommittedMonthlySavings > Math.max(0, ongoingSimulatedMonthlySurplus),
  )

  if (isSavingsAllocationExceedingSurplus) {
    warnings.push(
      'Committed monthly savings allocations exceed projected ongoing monthly surplus.',
    )
  }

  // 12. Evaluate explicit Savings Goal Acceleration
  let goalImpact: SimulatedGoalImpact | null = null
  if (goalConfig?.goal) {
    const g = goalConfig.goal
    const targetAmount = sanitizeNonNegativeCurrency(g.target_amount)
    const currentlySaved = sanitizeNonNegativeCurrency(g.total_contributed)
    const remainingAmount = sanitizeNonNegativeCurrency(g.remaining_amount)

    const additionalMonthlyContribution = round2(
      includedExtraInGoalAmount + redirectedCutContribution + explicitGoalAddition,
    )
    const simulatedMonthlyContribution = round2(
      baselineGoalContribution + additionalMonthlyContribution,
    )

    const baselineMonthsToGoal =
      remainingAmount <= 0
        ? 0
        : baselineGoalContribution > 0
          ? Math.ceil(remainingAmount / baselineGoalContribution)
          : null

    const simulatedMonthsToGoal =
      remainingAmount <= 0
        ? 0
        : simulatedMonthlyContribution > 0
          ? Math.ceil(remainingAmount / simulatedMonthlyContribution)
          : null

    const monthsSaved =
      baselineMonthsToGoal !== null && simulatedMonthsToGoal !== null
        ? Math.max(0, baselineMonthsToGoal - simulatedMonthsToGoal)
        : null

    const isForecastBacked = hasFutureForecastPoints
    const projectionBasis: GoalProjectionBasis = isForecastBacked
      ? 'forecast_backed'
      : 'contribution_only_illustration'

    // Contribution-only illustration over requestedHorizon (always preserves user-configured contribution math)
    const illustrativeHorizonMonths = requestedHorizon
    const illustrativeContributionOverHorizon = round2(
      simulatedMonthlyContribution * illustrativeHorizonMonths,
    )
    const illustrativeSavedAtHorizonEnd = round2(
      Math.min(targetAmount, currentlySaved + illustrativeContributionOverHorizon),
    )
    const illustrativeProgressPctAtHorizonEnd =
      targetAmount > 0
        ? round2(Math.min(100, (illustrativeSavedAtHorizonEnd / targetAmount) * 100))
        : 100

    // Forecast-backed horizon projections are populated ONLY when future forecast points exist (hCount > 0)
    let projectionHorizonMonths: number | null = null
    let projectedContributionOverHorizon: number | null = null
    let projectedSavedAtHorizonEnd: number | null = null
    let projectedProgressPctAtHorizonEnd: number | null = null

    if (isForecastBacked) {
      projectionHorizonMonths = hCount
      projectedContributionOverHorizon = round2(simulatedMonthlyContribution * hCount)
      projectedSavedAtHorizonEnd = round2(
        Math.min(targetAmount, currentlySaved + projectedContributionOverHorizon),
      )
      projectedProgressPctAtHorizonEnd =
        targetAmount > 0
          ? round2(Math.min(100, (projectedSavedAtHorizonEnd / targetAmount) * 100))
          : 100
    } else {
      warnings.push(
        `Goal projection for "${g.name}" is a contribution-only illustration based on your manual inputs because future forecast data is unavailable.`,
      )
    }

    const exceedsProjectedMonthlySurplus = Boolean(
      ongoingSimulatedMonthlySurplus !== null &&
        (simulatedMonthlyContribution > Math.max(0, ongoingSimulatedMonthlySurplus) ||
          totalCommittedMonthlySavings > Math.max(0, ongoingSimulatedMonthlySurplus)),
    )

    if (
      exceedsProjectedMonthlySurplus &&
      !warnings.some((w) => w.includes('Committed monthly savings allocations exceed'))
    ) {
      warnings.push(
        `Hypothetical contribution toward "${g.name}" (₹${simulatedMonthlyContribution.toFixed(2)}/mo) exceeds projected monthly surplus.`,
      )
    }

    goalImpact = {
      goalId: g.id,
      goalName: g.name,
      targetAmount,
      currentlySaved,
      remainingAmount,
      projectionBasis,
      isForecastBacked,
      baselineMonthlyContribution: baselineGoalContribution,
      includedExtraMonthlySavings: includedExtraInGoalAmount,
      redirectedSpendingReduction: redirectedCutContribution,
      explicitAdditionalContribution: explicitGoalAddition,
      additionalMonthlyContribution,
      simulatedMonthlyContribution,
      baselineMonthsToGoal,
      simulatedMonthsToGoal,
      monthsSaved,
      projectionHorizonMonths,
      projectedContributionOverHorizon,
      projectedSavedAtHorizonEnd,
      projectedProgressPctAtHorizonEnd,
      illustrativeHorizonMonths,
      illustrativeContributionOverHorizon,
      illustrativeSavedAtHorizonEnd,
      illustrativeProgressPctAtHorizonEnd,
      exceedsProjectedMonthlySurplus,
    }
  }

  // 13. Evaluate planned purchase coverage against startingBalance + cumulative cash flow
  let isPurchaseCoveredByStartingBalance: boolean | null = null
  if (plannedPurchaseTotal > 0 && targetPurchaseHorizonIdx !== null) {
    const purchasePt = futureHorizonPoints[targetPurchaseHorizonIdx - 1]
    if (purchasePt) {
      if (purchasePt.projectedAvailableBalance !== null) {
        isPurchaseCoveredByStartingBalance = purchasePt.projectedAvailableBalance >= 0
      } else if (purchasePt.cumulativeSimulatedCashFlow !== null) {
        isPurchaseCoveredByStartingBalance = purchasePt.cumulativeSimulatedCashFlow >= 0
      }
    }
  }

  // 14. Determine overall Scenario Feasibility Status
  let feasibilityStatus: ScenarioFeasibilityStatus = 'sustainable'

  if (!hasFutureForecastPoints) {
    feasibilityStatus = 'forecast_unavailable'
  } else if (effectiveMonthlyIncome === null) {
    feasibilityStatus = 'income_unavailable'
  } else {
    const ongoingUnallocated = round2(
      (ongoingSimulatedMonthlySurplus ?? 0) - totalCommittedMonthlySavings,
    )

    const hasEndingBalanceDeficit =
      projectedEndingBalance !== null && projectedEndingBalance < 0

    const hasOngoingMonthlyDeficit =
      (ongoingSimulatedMonthlySurplus !== null && ongoingSimulatedMonthlySurplus < 0) ||
      ongoingUnallocated < 0

    if (hasOngoingMonthlyDeficit || hasEndingBalanceDeficit) {
      feasibilityStatus = 'deficit_warning'
    } else if (
      plannedPurchaseTotal > 0 &&
      cumulativeSimulatedCashFlow !== null &&
      cumulativeSimulatedCashFlow < 0
    ) {
      feasibilityStatus = 'cash_flow_drawdown'
    } else if (
      effectiveMonthlyIncome > 0 &&
      ongoingUnallocated / effectiveMonthlyIncome < 0.1
    ) {
      feasibilityStatus = 'tight_margin'
    } else {
      feasibilityStatus = 'sustainable'
    }
  }

  const allTrajectoryPoints: SimulatedMonthPoint[] = anchorMonthPoint
    ? [anchorMonthPoint, ...futureHorizonPoints]
    : [...futureHorizonPoints]

  return {
    horizonMonths: effectiveHorizonCount,
    hasFutureForecastPoints,
    referenceDate: forecast.reference_date,
    effectiveMonthlyIncome,
    incomeSource,
    isPartialMonthIncome,
    incomeSourcePeriodLabel,
    derivedIncomeBaseline,
    hasStartingBalance,
    startingBalance,
    anchorMonthPoint,
    futureHorizonPoints,
    allTrajectoryPoints,
    averageBaselineMonthlyOutflow,
    averageSimulatedMonthlyOutflow,
    averageMonthlyVariableReduction,
    addedRecurringMonthlyEquivalent,
    extraMonthlySavingsAllocation,
    totalCommittedMonthlySavings,
    plannedPurchaseTotal,
    plannedPurchaseMonth,
    plannedPurchaseMonthLabel,
    totalHorizonBaselineOutflow,
    totalHorizonSimulatedOutflow,
    totalHorizonOutflowSaving,
    averageBaselineMonthlySurplus,
    averageSimulatedMonthlySurplus,
    averageUnallocatedMonthlySurplus,
    cumulativeBaselineCashFlow,
    cumulativeSimulatedCashFlow,
    projectedEndingBalance,
    goalImpact,
    isCappedAtVariableFloor,
    isCappedAtCategoryVariableCeiling,
    selectedCategoryVariableCeiling,
    wasPurchaseMonthClamped,
    isSavingsAllocationExceedingSurplus,
    isPurchaseCoveredByStartingBalance,
    feasibilityStatus,
    warnings,
  }
}
