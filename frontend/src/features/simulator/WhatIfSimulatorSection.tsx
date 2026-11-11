import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  PiggyBank,
  RefreshCw,
  RotateCcw,
  Scissors,
  ShieldCheck,
  ShoppingBag,
  Sliders,
  Sparkles,
  Target,
  TrendingDown,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useForecast, type UseForecastReturn } from '@/features/forecast/useForecast'
import { useSavingsGoals } from '@/features/goals/useSavingsGoals'
import {
  calculateRecurringMonthlyEquivalent,
  runWhatIfSimulation,
  type ScenarioFeasibilityStatus,
  type SimulatedMonthPoint,
  type SpendingReductionMode,
  type WhatIfScenarioInputs,
} from '@/features/simulator/simulatorCalculations'
import { useTransactions } from '@/features/transactions/useTransactions'
import type { RecurringFrequency, SavingsGoal, Transaction } from '@/lib/api/types'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface WhatIfSimulatorSectionProps {
  refDate?: string
  className?: string
  forecastState?: UseForecastReturn
  transactions?: readonly Transaction[] | null
  goals?: readonly SavingsGoal[] | null
}

type LeverId = 'spending' | 'savings' | 'recurring' | 'purchase' | 'goal'

function formatCompactINR(val: number): string {
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 10000000) {
    return `${sign}₹${(abs / 10000000).toFixed(abs % 10000000 === 0 ? 0 : 1)}Cr`
  }
  if (abs >= 100000) {
    return `${sign}₹${(abs / 100000).toFixed(abs % 100000 === 0 ? 0 : 1)}L`
  }
  if (abs >= 1000) {
    return `${sign}₹${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k`
  }
  return `${sign}₹${abs}`
}

function getFeasibilityBadgeConfig(status: ScenarioFeasibilityStatus): {
  label: string
  tone: 'sage' | 'butter' | 'terracotta' | 'neutral'
  description: string
} {
  switch (status) {
    case 'sustainable':
      return {
        label: 'Sustainable Scenario',
        tone: 'sage',
        description:
          'Simulated outflows and committed savings fit comfortably within your monthly income assumption.',
      }
    case 'tight_margin':
      return {
        label: 'Tight Unallocated Margin',
        tone: 'butter',
        description:
          'Less than 5% of monthly income remains unallocated after simulated expenses and committed savings.',
      }
    case 'cash_flow_drawdown':
      return {
        label: 'Horizon Cash-Flow Drawdown',
        tone: 'butter',
        description:
          'Ongoing monthly expenses fit within income, but the planned one-time purchase creates a net cash-flow drawdown over the horizon.',
      }
    case 'deficit_warning':
      return {
        label: 'Deficit / Over-Allocation Warning',
        tone: 'terracotta',
        description:
          'Simulated monthly outflows or committed savings exceed your projected monthly surplus.',
      }
    case 'income_unavailable':
      return {
        label: 'Income Assumption Needed',
        tone: 'butter',
        description:
          'Outflow deltas are calculated from your forecast, but monthly surplus requires an income baseline.',
      }
    case 'forecast_unavailable':
      return {
        label: 'Forecast Data Unavailable',
        tone: 'terracotta',
        description:
          'No future forecast months are available to compute horizon cash-flow projections.',
      }
  }
}

interface SimulatorChartTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: {
      rawPoint: SimulatedMonthPoint
      effectiveIncome: number | null
    }
  }>
}

function SimulatorChartTooltip({ active, payload }: SimulatorChartTooltipProps) {
  if (!active || !payload || !payload.length) return null
  const item = payload[0]?.payload
  if (!item?.rawPoint) return null

  const pt = item.rawPoint
  const delta = pt.monthlyOutflowSaving

  return (
    <div className="rounded-xl border border-border bg-popover p-3.5 shadow-popover text-xs">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
        <span className="font-semibold text-ink">{pt.monthLabel}</span>
        {pt.isAnchorMonth ? (
          <span className="rounded-sm bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">
            Current Month (Anchor)
          </span>
        ) : (
          <span className="rounded-sm bg-sage/20 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
            Month +{pt.horizonIndex}
          </span>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Baseline Outflow:</span>
          <span className="font-semibold text-ink">₹{formatAmount(pt.baselineOutflow)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Simulated Outflow:</span>
          <span className="font-semibold text-forest">₹{formatAmount(pt.simulatedOutflow)}</span>
        </div>
        {!pt.isAnchorMonth && (
          <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-1.5">
            <span className="text-muted-foreground">Monthly Outflow Delta:</span>
            <span
              className={cn(
                'font-semibold',
                delta > 0 ? 'text-forest' : delta < 0 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {delta > 0
                ? `-₹${formatAmount(delta)} saved`
                : delta < 0
                  ? `+₹${formatAmount(Math.abs(delta))} added`
                  : 'No change'}
            </span>
          </div>
        )}
        {pt.simulatedNetSurplus !== null && !pt.isAnchorMonth && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Simulated Net Surplus:</span>
            <span
              className={cn(
                'font-semibold',
                pt.simulatedNetSurplus >= 0 ? 'text-ink' : 'text-destructive',
              )}
            >
              {pt.simulatedNetSurplus < 0 ? '-' : ''}₹
              {formatAmount(Math.abs(pt.simulatedNetSurplus))}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function WhatIfSimulatorSection({
  refDate,
  className,
  forecastState,
  transactions: transactionsProp,
  goals: goalsProp,
}: WhatIfSimulatorSectionProps) {
  const internalForecastState = useForecast({ refDate, autoFetch: !forecastState })
  const { forecast, isLoading, error, horizonMonths, reload } =
    forecastState ?? internalForecastState

  const internalTransactionsState = useTransactions()
  const internalGoalsState = useSavingsGoals()

  const transactions = useMemo(
    () =>
      transactionsProp ??
      (internalTransactionsState.status === 'success'
        ? internalTransactionsState.transactions
        : []),
    [transactionsProp, internalTransactionsState],
  )

  const activeGoals = useMemo(() => {
    const rawGoals = goalsProp ?? internalGoalsState.goals ?? []
    return rawGoals.filter((g) => g.status === 'in_progress')
  }, [goalsProp, internalGoalsState.goals])

  // Progressive disclosure state: 'spending' expanded by default for a beginner-friendly entry point
  const [openLevers, setOpenLevers] = useState<Record<LeverId, boolean>>({
    spending: true,
    savings: false,
    recurring: false,
    purchase: false,
    goal: false,
  })

  // Baseline assumptions state
  const [monthlyIncomeOverride, setMonthlyIncomeOverride] = useState<string>('')
  const [startingBalance, setStartingBalance] = useState<string>('')

  // Lever A: Spending reduction
  const [reductionMode, setReductionMode] = useState<SpendingReductionMode>('percentage')
  const [reductionValue, setReductionValue] = useState<string>('')
  const [reductionCategory, setReductionCategory] = useState<string>('all')

  // Lever B: Additional monthly savings
  const [extraMonthlySavings, setExtraMonthlySavings] = useState<string>('')

  // Lever C: Hypothetical recurring expense
  const [recurringAmount, setRecurringAmount] = useState<string>('')
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>('monthly')
  const [recurringDescription, setRecurringDescription] = useState<string>('')

  // Lever D: One-time planned purchase
  const [purchaseAmount, setPurchaseAmount] = useState<string>('')
  const [purchaseHorizonIndex, setPurchaseHorizonIndex] = useState<number>(1)
  const [purchaseDescription, setPurchaseDescription] = useState<string>('')

  // Lever E: Savings goal allocation
  const [selectedGoalId, setSelectedGoalId] = useState<string>('')
  const [baselineGoalContribution, setBaselineGoalContribution] = useState<string>('')
  const [includeExtraMonthlySavings, setIncludeExtraMonthlySavings] = useState<boolean>(false)
  const [redirectSpendingReductionsToGoal, setRedirectSpendingReductionsToGoal] =
    useState<boolean>(false)
  const [explicitAdditionalGoalContribution, setExplicitAdditionalGoalContribution] =
    useState<string>('')

  const toggleLever = (id: LeverId) => {
    setOpenLevers((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const expandAllLevers = () => {
    setOpenLevers({
      spending: true,
      savings: true,
      recurring: true,
      purchase: true,
      goal: true,
    })
  }

  const selectedGoal = useMemo(() => {
    if (!selectedGoalId) return null
    const idNum = Number(selectedGoalId)
    return activeGoals.find((g) => g.id === idNum) ?? null
  }, [activeGoals, selectedGoalId])

  const scenarioInputs: WhatIfScenarioInputs = useMemo(
    () => ({
      monthlyIncomeOverride: monthlyIncomeOverride.trim() !== '' ? monthlyIncomeOverride : null,
      startingBalance: startingBalance.trim() !== '' ? startingBalance : null,
      horizonMonthsOverride: horizonMonths,
      spendingReduction:
        reductionValue.trim() !== '' && Number(reductionValue) > 0
          ? {
              mode: reductionMode,
              value: reductionValue,
              category: reductionCategory,
            }
          : {
              mode: reductionMode,
              value: 0,
              category: reductionCategory,
            },
      extraMonthlySavings: extraMonthlySavings.trim() !== '' ? extraMonthlySavings : null,
      recurringExpense:
        recurringAmount.trim() !== '' && Number(recurringAmount) > 0
          ? {
              description: recurringDescription.trim() || undefined,
              amount: recurringAmount,
              frequency: recurringFrequency,
            }
          : null,
      plannedPurchase:
        purchaseAmount.trim() !== '' && Number(purchaseAmount) > 0
          ? {
              description: purchaseDescription.trim() || undefined,
              amount: purchaseAmount,
              targetHorizonIndex: purchaseHorizonIndex,
            }
          : null,
      goalAllocation: selectedGoal
        ? {
            goal: selectedGoal,
            baselineMonthlyContribution:
              baselineGoalContribution.trim() !== '' ? baselineGoalContribution : 0,
            includeExtraMonthlySavings,
            redirectSpendingReductionsToGoal,
            explicitAdditionalContribution:
              explicitAdditionalGoalContribution.trim() !== ''
                ? explicitAdditionalGoalContribution
                : 0,
          }
        : null,
    }),
    [
      monthlyIncomeOverride,
      startingBalance,
      horizonMonths,
      reductionMode,
      reductionValue,
      reductionCategory,
      extraMonthlySavings,
      recurringAmount,
      recurringDescription,
      recurringFrequency,
      purchaseAmount,
      purchaseDescription,
      purchaseHorizonIndex,
      selectedGoal,
      baselineGoalContribution,
      includeExtraMonthlySavings,
      redirectSpendingReductionsToGoal,
      explicitAdditionalGoalContribution,
    ],
  )

  const simulationResult = useMemo(() => {
    if (!forecast) return null
    return runWhatIfSimulation(forecast, scenarioInputs, transactions)
  }, [forecast, scenarioInputs, transactions])

  const hasAnyScenarioModification = useMemo(() => {
    return (
      monthlyIncomeOverride.trim() !== '' ||
      startingBalance.trim() !== '' ||
      (reductionValue.trim() !== '' && Number(reductionValue) > 0) ||
      reductionCategory !== 'all' ||
      (extraMonthlySavings.trim() !== '' && Number(extraMonthlySavings) > 0) ||
      (recurringAmount.trim() !== '' && Number(recurringAmount) > 0) ||
      (purchaseAmount.trim() !== '' && Number(purchaseAmount) > 0) ||
      selectedGoalId !== ''
    )
  }, [
    monthlyIncomeOverride,
    startingBalance,
    reductionValue,
    reductionCategory,
    extraMonthlySavings,
    recurringAmount,
    purchaseAmount,
    selectedGoalId,
  ])

  const handleResetScenario = () => {
    setMonthlyIncomeOverride('')
    setStartingBalance('')
    setReductionMode('percentage')
    setReductionValue('')
    setReductionCategory('all')
    setExtraMonthlySavings('')
    setRecurringAmount('')
    setRecurringFrequency('monthly')
    setRecurringDescription('')
    setPurchaseAmount('')
    setPurchaseHorizonIndex(1)
    setPurchaseDescription('')
    setSelectedGoalId('')
    setBaselineGoalContribution('')
    setIncludeExtraMonthlySavings(false)
    setRedirectSpendingReductionsToGoal(false)
    setExplicitAdditionalGoalContribution('')
  }

  const applyPresetTrimSpending = () => {
    setReductionMode('percentage')
    setReductionCategory('all')
    setReductionValue('15')
    setOpenLevers((prev) => ({ ...prev, spending: true }))
  }

  const applyPresetExtraSavings = () => {
    setExtraMonthlySavings('2000')
    setOpenLevers((prev) => ({ ...prev, savings: true }))
  }

  const applyPresetPlannedPurchase = () => {
    setPurchaseAmount('15000')
    setPurchaseHorizonIndex(1)
    setOpenLevers((prev) => ({ ...prev, purchase: true }))
  }

  // Compute average variable spending cap across future horizon points for transparent UI display
  const averageTotalVariableCeiling = useMemo(() => {
    if (!simulationResult || !simulationResult.hasFutureForecastPoints) return 0
    const pts = simulationResult.futureHorizonPoints
    const sum = pts.reduce((acc, pt) => acc + pt.baselineVariable, 0)
    return Math.round((sum / pts.length) * 100) / 100
  }, [simulationResult])

  const effectiveReductionCeiling = useMemo(() => {
    if (!simulationResult) return 0
    if (
      reductionCategory !== 'all' &&
      simulationResult.selectedCategoryVariableCeiling !== null
    ) {
      return simulationResult.selectedCategoryVariableCeiling
    }
    return averageTotalVariableCeiling
  }, [simulationResult, reductionCategory, averageTotalVariableCeiling])

  const previewRecurringMonthly = useMemo(
    () => calculateRecurringMonthlyEquivalent(recurringAmount, recurringFrequency),
    [recurringAmount, recurringFrequency],
  )

  const chartData = useMemo(() => {
    if (!simulationResult || !simulationResult.hasFutureForecastPoints) return []
    return simulationResult.allTrajectoryPoints.map((pt) => ({
      monthKey: pt.month,
      label: pt.isAnchorMonth
        ? `${pt.monthLabel.split(' ')[0]} (Now)`
        : pt.monthLabel.split(' ')[0],
      baselineOutflow: pt.baselineOutflow,
      simulatedOutflow: pt.simulatedOutflow,
      effectiveIncome: simulationResult.effectiveMonthlyIncome,
      rawPoint: pt,
    }))
  }, [simulationResult])

  return (
    <Card
      className={cn('min-w-0 border-border bg-card shadow-card', className)}
      data-testid="what-if-simulator-section"
    >
      <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-start lg:justify-between min-w-0">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-forest">
              <Calculator className="size-3.5" />
              Interactive Scenario Planner
            </span>
            <Badge tone="sage" className="text-[11px]">
              <ShieldCheck className="size-3 mr-1" />
              Read-Only Sandbox
            </Badge>
          </div>

          <CardTitle className="font-display text-xl sm:text-2xl font-bold text-ink">
            What-If Financial Simulator
          </CardTitle>
          <CardDescription className="max-w-2xl text-xs sm:text-sm">
            Test hypothetical spending cuts, extra monthly savings, new recurring bills, one-time
            purchases, and savings-goal allocations against your forecast. Nothing here modifies
            your actual records.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={expandAllLevers}
            className="h-8 text-xs gap-1.5"
          >
            <Sliders className="size-3.5" />
            Expand All Controls
          </Button>
          {hasAnyScenarioModification && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetScenario}
              className="h-8 text-xs gap-1.5 border-forest/30 text-forest hover:bg-forest/10"
            >
              <RotateCcw className="size-3.5" />
              Reset Scenario
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6 min-w-0">
        {/* Loading State */}
        {isLoading && !forecast && (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <Loader2 className="size-8 animate-spin text-forest" />
            <p className="text-sm font-medium text-muted-foreground">
              Preparing What-If Financial Simulator…
            </p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && !forecast && (
          <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <AlertTriangle className="size-5" />
            </span>
            <div className="max-w-md">
              <p className="font-semibold text-ink">Simulator requires forecast baseline</p>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{error}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={reload} className="gap-2">
              <RefreshCw className="size-3.5" />
              Retry Forecast Load
            </Button>
          </div>
        )}

        {/* Main Simulator Interface */}
        {forecast && simulationResult && (
          <>
            {/* Baseline Assumptions & Quick Presets Bar */}
            <div className="rounded-2xl border border-border/80 bg-paper-deep/40 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3.5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">
                    Baseline Financial Assumptions
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Used to evaluate monthly net surplus and optional balance coverage over the{' '}
                    {simulationResult.hasFutureForecastPoints
                      ? `${simulationResult.horizonMonths}-month forecast horizon`
                      : 'selected horizon'}
                    .
                  </p>
                </div>

                {/* Quick Presets */}
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Quick scenario presets"
                >
                  <span className="text-[11px] font-medium text-muted-foreground mr-1">
                    Quick presets:
                  </span>
                  <button
                    type="button"
                    onClick={applyPresetTrimSpending}
                    className="min-h-[36px] sm:min-h-[30px] inline-flex items-center justify-center rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-ink hover:border-forest/40 hover:text-forest transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none"
                  >
                    Trim Variable 15%
                  </button>
                  <button
                    type="button"
                    onClick={applyPresetExtraSavings}
                    className="min-h-[36px] sm:min-h-[30px] inline-flex items-center justify-center rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-ink hover:border-forest/40 hover:text-forest transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none"
                  >
                    Save +₹2,000/mo
                  </button>
                  <button
                    type="button"
                    onClick={applyPresetPlannedPurchase}
                    className="min-h-[36px] sm:min-h-[30px] inline-flex items-center justify-center rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-ink hover:border-forest/40 hover:text-forest transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none"
                  >
                    Plan ₹15,000 Purchase
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Monthly Income Assumption */}
                <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="simulator-income-override"
                      className="text-xs font-semibold text-ink"
                    >
                      Monthly Income Assumption (₹/mo)
                    </label>
                    {simulationResult.incomeSource === 'derived_history' && (
                      <Badge tone="sage" className="text-[10px]">
                        Derived from history
                      </Badge>
                    )}
                    {simulationResult.incomeSource === 'derived_current_month' && (
                      <Badge tone="butter" className="text-[10px]">
                        Partial month-to-date income
                      </Badge>
                    )}
                    {simulationResult.incomeSource === 'manual_override' && (
                      <Badge tone="lime" className="text-[10px]">
                        User-entered assumption
                      </Badge>
                    )}
                    {simulationResult.incomeSource === 'unavailable' && (
                      <Badge tone="terracotta" className="text-[10px]">
                        Income unavailable
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      id="simulator-income-override"
                      aria-label="Monthly Income Override (₹)"
                      type="number"
                      min="0"
                      step="500"
                      value={monthlyIncomeOverride}
                      onChange={(e) => setMonthlyIncomeOverride(e.target.value)}
                      placeholder={
                        simulationResult.derivedIncomeBaseline.derivedMonthlyIncome !== null
                          ? `Auto: ₹${formatAmount(simulationResult.derivedIncomeBaseline.derivedMonthlyIncome)}/mo`
                          : 'Enter monthly income (e.g. 50000)'
                      }
                      className="h-9 text-xs"
                    />
                    {monthlyIncomeOverride.trim() !== '' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMonthlyIncomeOverride('')}
                        className="h-9 px-2.5 text-xs text-muted-foreground hover:text-ink shrink-0"
                      >
                        Use Auto
                      </Button>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {simulationResult.incomeSource === 'manual_override' && (
                      <>
                        Using manual assumption:{' '}
                        <strong className="text-ink">
                          ₹{formatAmount(simulationResult.effectiveMonthlyIncome ?? 0)}/mo
                        </strong>
                        {simulationResult.derivedIncomeBaseline.derivedMonthlyIncome !== null && (
                          <>
                            {' '}
                            (Derived baseline was ₹
                            {formatAmount(
                              simulationResult.derivedIncomeBaseline.derivedMonthlyIncome,
                            )}
                            /mo from {simulationResult.derivedIncomeBaseline.sourcePeriodLabel}).
                          </>
                        )}
                      </>
                    )}
                    {simulationResult.incomeSource === 'derived_history' && (
                      <>
                        Active baseline:{' '}
                        <strong className="text-ink">
                          ₹{formatAmount(simulationResult.effectiveMonthlyIncome ?? 0)}/mo
                        </strong>{' '}
                        ({simulationResult.incomeSourcePeriodLabel}). Enter a value above to
                        override.
                      </>
                    )}
                    {simulationResult.incomeSource === 'derived_current_month' && (
                      <>
                        Active baseline:{' '}
                        <strong className="text-ink">
                          ₹{formatAmount(simulationResult.effectiveMonthlyIncome ?? 0)}/mo
                        </strong>{' '}
                        from {simulationResult.incomeSourcePeriodLabel}. Consider entering a full
                        monthly income override.
                      </>
                    )}
                    {simulationResult.incomeSource === 'unavailable' && (
                      <span className="text-amber-900 font-medium">
                        No recorded income transactions found. Enter a monthly income assumption to
                        unlock net surplus and savings feasibility metrics.
                      </span>
                    )}
                  </p>
                </div>

                {/* Optional Starting Available Balance */}
                <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="simulator-starting-balance"
                      className="text-xs font-semibold text-ink"
                    >
                      Starting Available Balance (₹, Optional)
                    </label>
                    <Badge
                      tone={simulationResult.hasStartingBalance ? 'sage' : 'neutral'}
                      className="text-[10px]"
                    >
                      {simulationResult.hasStartingBalance
                        ? 'Balance Buffer Active'
                        : 'Cash-Flow Impact Only'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      id="simulator-starting-balance"
                      aria-label="Starting Available Balance (₹)"
                      type="number"
                      min="0"
                      step="1000"
                      value={startingBalance}
                      onChange={(e) => setStartingBalance(e.target.value)}
                      placeholder="Optional — leave blank for cash-flow impact only"
                      className="h-9 text-xs"
                    />
                    {startingBalance.trim() !== '' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setStartingBalance('')}
                        className="h-9 px-2.5 text-xs text-muted-foreground hover:text-ink shrink-0"
                      >
                        Clear
                      </Button>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {simulationResult.hasStartingBalance ? (
                      <>
                        Evaluating projected ending balance starting from{' '}
                        <strong className="text-ink">
                          ₹{formatAmount(simulationResult.startingBalance ?? 0)}
                        </strong>
                        .
                      </>
                    ) : (
                      <>
                        No starting bank balance assumed. The simulator reports{' '}
                        <strong className="text-ink">cash-flow impact only</strong> and will not
                        claim a purchase is covered without a balance buffer.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Two-Column Workspace: Left = Progressive Scenario Controls, Right = Live Results */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 min-w-0">
              {/* Left Column: 5 Progressive Scenario Levers */}
              <div className="xl:col-span-5 space-y-3 min-w-0">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Scenario Levers (Click to Configure)
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Future months only (Anchor preserved)
                  </span>
                </div>

                {/* LEVER A: Spending Reduction */}
                <div className="rounded-xl border border-border bg-paper/70 overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={openLevers.spending}
                    onClick={() => toggleLever('spending')}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-paper-deep/50 transition-colors motion-reduce:transition-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-forest/10 text-forest">
                        <Scissors className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink">A. Spending Reduction</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Reduce variable spending by % or ₹ across all or one category
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {simulationResult.averageMonthlyVariableReduction > 0 && (
                        <Badge tone="sage" className="text-[10px]">
                          -₹{formatAmount(simulationResult.averageMonthlyVariableReduction)}/mo
                        </Badge>
                      )}
                      {openLevers.spending ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {openLevers.spending && (
                    <div className="border-t border-border/60 bg-card p-4 space-y-3.5">
                      {/* Mode Toggle */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-ink">Reduction Type</span>
                        <div
                          className="inline-flex rounded-lg border border-border bg-paper-deep/60 p-0.5"
                          role="group"
                          aria-label="Reduction calculation type"
                        >
                          <button
                            type="button"
                            aria-pressed={reductionMode === 'percentage'}
                            onClick={() => setReductionMode('percentage')}
                            className={cn(
                              'min-h-[36px] sm:min-h-[30px] inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none',
                              reductionMode === 'percentage'
                                ? 'bg-forest text-primary-foreground shadow-2xs'
                                : 'text-muted-foreground hover:text-ink',
                            )}
                          >
                            Percentage (%)
                          </button>
                          <button
                            type="button"
                            aria-pressed={reductionMode === 'fixed_amount'}
                            onClick={() => setReductionMode('fixed_amount')}
                            className={cn(
                              'min-h-[36px] sm:min-h-[30px] inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none',
                              reductionMode === 'fixed_amount'
                                ? 'bg-forest text-primary-foreground shadow-2xs'
                                : 'text-muted-foreground hover:text-ink',
                            )}
                          >
                            Fixed Amount (₹)
                          </button>
                        </div>
                      </div>

                      {/* Target Scope / Category */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor="simulator-reduction-category"
                          className="text-xs font-medium text-ink block"
                        >
                          Target Variable Scope
                        </label>
                        <select
                          id="simulator-reduction-category"
                          aria-label="Spending Reduction Category"
                          value={reductionCategory}
                          onChange={(e) => setReductionCategory(e.target.value)}
                          className="flex h-9 w-full rounded-xl border border-input bg-card px-3 py-1 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="all">
                            All Variable Spending (Max cap: ₹
                            {formatAmount(averageTotalVariableCeiling)}/mo)
                          </option>
                          {(forecast.category_forecasts ?? []).map((cat) => {
                            const catVar = Number(cat.variable_amount ?? 0)
                            return (
                              <option key={cat.category} value={cat.category}>
                                {cat.category} (Variable cap: ₹{formatAmount(catVar)}/mo)
                              </option>
                            )
                          })}
                        </select>
                      </div>

                      {/* Reduction Input */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="simulator-reduction-value"
                            className="text-xs font-medium text-ink"
                          >
                            {reductionMode === 'percentage'
                              ? 'Monthly Variable Reduction (%)'
                              : 'Monthly Variable Reduction (₹)'}
                          </label>
                          <span className="text-[11px] font-medium text-forest">
                            Max applicable: ₹{formatAmount(effectiveReductionCeiling)}/mo
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            id="simulator-reduction-value"
                            aria-label="Spending Reduction Value"
                            type="number"
                            min="0"
                            max={reductionMode === 'percentage' ? 100 : undefined}
                            step={reductionMode === 'percentage' ? 5 : 250}
                            value={reductionValue}
                            onChange={(e) => setReductionValue(e.target.value)}
                            placeholder={
                              reductionMode === 'percentage'
                                ? 'e.g. 15 (0–100%)'
                                : 'e.g. 1500 (₹/mo)'
                            }
                            className="h-9 text-xs"
                          />
                          {reductionMode === 'percentage' && (
                            <div
                              className="flex items-center gap-1 shrink-0"
                              role="group"
                              aria-label="Preset reduction percentage"
                            >
                              {[10, 20, 30].map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  aria-pressed={reductionValue === String(pct)}
                                  aria-label={`${pct} percent reduction`}
                                  onClick={() => setReductionValue(String(pct))}
                                  className={cn(
                                    'min-h-[36px] sm:min-h-[30px] min-w-[36px] sm:min-w-[32px] inline-flex items-center justify-center rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none',
                                    reductionValue === String(pct)
                                      ? 'border-forest/60 bg-forest/10 font-semibold text-forest'
                                      : 'border-border bg-paper text-ink hover:border-forest/40',
                                  )}
                                >
                                  {pct}%
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg bg-paper-deep/60 px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                        <span>
                          Fixed commitments are protected; only variable spending is reduced.
                        </span>
                        <span className="font-semibold text-forest shrink-0">
                          Applied: -₹{formatAmount(simulationResult.averageMonthlyVariableReduction)}
                          /mo
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* LEVER B: Additional Monthly Savings */}
                <div className="rounded-xl border border-border bg-paper/70 overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={openLevers.savings}
                    onClick={() => toggleLever('savings')}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-paper-deep/50 transition-colors motion-reduce:transition-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sage/25 text-forest">
                        <PiggyBank className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink">
                          B. Additional Monthly Savings
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Set aside extra monthly surplus into savings
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {simulationResult.extraMonthlySavingsAllocation > 0 && (
                        <Badge tone="sage" className="text-[10px]">
                          ₹{formatAmount(simulationResult.extraMonthlySavingsAllocation)}/mo
                        </Badge>
                      )}
                      {openLevers.savings ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {openLevers.savings && (
                    <div className="border-t border-border/60 bg-card p-4 space-y-3">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="simulator-extra-savings"
                          className="text-xs font-medium text-ink block"
                        >
                          Extra Monthly Savings Allocation (₹/mo)
                        </label>
                        <Input
                          id="simulator-extra-savings"
                          aria-label="Additional Monthly Savings (₹)"
                          type="number"
                          min="0"
                          step="500"
                          value={extraMonthlySavings}
                          onChange={(e) => setExtraMonthlySavings(e.target.value)}
                          placeholder="e.g. 2000"
                          className="h-9 text-xs"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Extra monthly savings is an{' '}
                        <strong className="text-ink">allocation of available surplus</strong>, not
                        an expense. It is kept separate from savings goals unless you explicitly
                        enable <em>“Include extra monthly savings in this goal”</em> below.
                      </p>
                    </div>
                  )}
                </div>

                {/* LEVER C: Hypothetical Recurring Expense */}
                <div className="rounded-xl border border-border bg-paper/70 overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={openLevers.recurring}
                    onClick={() => toggleLever('recurring')}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-paper-deep/50 transition-colors motion-reduce:transition-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-butter/25 text-amber-900">
                        <CalendarPlus className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink">
                          C. Hypothetical Recurring Expense
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Test a new subscription, membership, or fixed bill
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {simulationResult.addedRecurringMonthlyEquivalent > 0 && (
                        <Badge tone="butter" className="text-[10px]">
                          +₹{formatAmount(simulationResult.addedRecurringMonthlyEquivalent)}/mo
                        </Badge>
                      )}
                      {openLevers.recurring ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {openLevers.recurring && (
                    <div className="border-t border-border/60 bg-card p-4 space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="simulator-recurring-amount"
                            className="text-xs font-medium text-ink block"
                          >
                            Recurring Amount (₹)
                          </label>
                          <Input
                            id="simulator-recurring-amount"
                            aria-label="Hypothetical Recurring Expense Amount (₹)"
                            type="number"
                            min="0"
                            step="100"
                            value={recurringAmount}
                            onChange={(e) => setRecurringAmount(e.target.value)}
                            placeholder="e.g. 1200"
                            className="h-9 text-xs"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label
                            htmlFor="simulator-recurring-frequency"
                            className="text-xs font-medium text-ink block"
                          >
                            Billing Frequency
                          </label>
                          <select
                            id="simulator-recurring-frequency"
                            aria-label="Hypothetical Recurring Expense Frequency"
                            value={recurringFrequency}
                            onChange={(e) =>
                              setRecurringFrequency(e.target.value as RecurringFrequency)
                            }
                            className="flex h-9 w-full rounded-xl border border-input bg-card px-3 py-1 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="weekly">Weekly (×52 / 12)</option>
                            <option value="monthly">Monthly (×1)</option>
                            <option value="quarterly">Quarterly (÷3)</option>
                            <option value="yearly">Yearly (÷12)</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="simulator-recurring-description"
                          className="text-xs font-medium text-ink block"
                        >
                          Description (Optional)
                        </label>
                        <Input
                          id="simulator-recurring-description"
                          aria-label="Hypothetical Recurring Expense Description"
                          type="text"
                          value={recurringDescription}
                          onChange={(e) => setRecurringDescription(e.target.value)}
                          placeholder="e.g. Gym membership or cloud tools"
                          className="h-9 text-xs"
                        />
                      </div>

                      <div className="rounded-lg bg-paper-deep/60 px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                        <span>Hypothetical only — not saved to Recurring Payments.</span>
                        <span className="font-semibold text-ink shrink-0">
                          Monthly eq: +₹{formatAmount(previewRecurringMonthly)}/mo
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* LEVER D: One-Time Planned Purchase */}
                <div className="rounded-xl border border-border bg-paper/70 overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={openLevers.purchase}
                    onClick={() => toggleLever('purchase')}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-paper-deep/50 transition-colors motion-reduce:transition-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-terracotta/15 text-destructive">
                        <ShoppingBag className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink">D. One-Time Purchase</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Plan a major one-off expense in a future horizon month
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {simulationResult.plannedPurchaseTotal > 0 && (
                        <Badge tone="terracotta" className="text-[10px]">
                          ₹{formatAmount(simulationResult.plannedPurchaseTotal)}
                        </Badge>
                      )}
                      {openLevers.purchase ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {openLevers.purchase && (
                    <div className="border-t border-border/60 bg-card p-4 space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="simulator-purchase-amount"
                            className="text-xs font-medium text-ink block"
                          >
                            Purchase Amount (₹)
                          </label>
                          <Input
                            id="simulator-purchase-amount"
                            aria-label="One-Time Purchase Amount (₹)"
                            type="number"
                            min="0"
                            step="1000"
                            value={purchaseAmount}
                            onChange={(e) => setPurchaseAmount(e.target.value)}
                            placeholder="e.g. 15000"
                            className="h-9 text-xs"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label
                            htmlFor="simulator-purchase-month"
                            className="text-xs font-medium text-ink block"
                          >
                            Target Future Month
                          </label>
                          <select
                            id="simulator-purchase-month"
                            aria-label="One-Time Purchase Month"
                            disabled={!simulationResult.hasFutureForecastPoints}
                            value={purchaseHorizonIndex}
                            onChange={(e) => setPurchaseHorizonIndex(Number(e.target.value))}
                            className="flex h-9 w-full rounded-xl border border-input bg-card px-3 py-1 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          >
                            {simulationResult.hasFutureForecastPoints ? (
                              simulationResult.futureHorizonPoints.map((pt) => (
                                <option key={pt.month} value={pt.horizonIndex}>
                                  Month +{pt.horizonIndex}: {pt.monthLabel}
                                </option>
                              ))
                            ) : (
                              <option value={1}>No future forecast months available</option>
                            )}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="simulator-purchase-description"
                          className="text-xs font-medium text-ink block"
                        >
                          Purchase Item (Optional)
                        </label>
                        <Input
                          id="simulator-purchase-description"
                          aria-label="One-Time Purchase Description"
                          type="text"
                          value={purchaseDescription}
                          onChange={(e) => setPurchaseDescription(e.target.value)}
                          placeholder="e.g. Flight tickets or appliance upgrade"
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* LEVER E: Savings Goal Allocation */}
                <div className="rounded-xl border border-border bg-paper/70 overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={openLevers.goal}
                    onClick={() => toggleLever('goal')}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-paper-deep/50 transition-colors motion-reduce:transition-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-forest/10 text-forest">
                        <Target className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink">
                          E. Savings Goal Allocation
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Estimate timeline acceleration for an active savings goal
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {simulationResult.goalImpact && (
                        <Badge tone="sage" className="text-[10px]">
                          {simulationResult.goalImpact.goalName}
                        </Badge>
                      )}
                      {openLevers.goal ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {openLevers.goal && (
                    <div className="border-t border-border/60 bg-card p-4 space-y-3.5">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="simulator-goal-select"
                          className="text-xs font-medium text-ink block"
                        >
                          Select Active Savings Goal
                        </label>
                        <select
                          id="simulator-goal-select"
                          aria-label="Target Savings Goal"
                          value={selectedGoalId}
                          onChange={(e) => setSelectedGoalId(e.target.value)}
                          className="flex h-9 w-full rounded-xl border border-input bg-card px-3 py-1 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">None selected</option>
                          {activeGoals.map((g) => (
                            <option key={g.id} value={String(g.id)}>
                              {g.name} (₹{formatAmount(g.remaining_amount)} remaining of ₹
                              {formatAmount(g.target_amount)})
                            </option>
                          ))}
                        </select>
                        {activeGoals.length === 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            No active savings goals found. Create an active goal on the Savings
                            Goals page to simulate goal timelines.
                          </p>
                        )}
                      </div>

                      {selectedGoal && (
                        <>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label
                                htmlFor="simulator-goal-baseline"
                                className="text-xs font-medium text-ink block"
                              >
                                Baseline Monthly Contribution (₹)
                              </label>
                              <Input
                                id="simulator-goal-baseline"
                                aria-label="Baseline Monthly Goal Contribution (₹)"
                                type="number"
                                min="0"
                                step="500"
                                value={baselineGoalContribution}
                                onChange={(e) => setBaselineGoalContribution(e.target.value)}
                                placeholder="e.g. 3000"
                                className="h-9 text-xs"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label
                                htmlFor="simulator-goal-explicit-add"
                                className="text-xs font-medium text-ink block"
                              >
                                Additional Goal Contribution (₹)
                              </label>
                              <Input
                                id="simulator-goal-explicit-add"
                                aria-label="Explicit Additional Goal Contribution (₹)"
                                type="number"
                                min="0"
                                step="500"
                                value={explicitAdditionalGoalContribution}
                                onChange={(e) =>
                                  setExplicitAdditionalGoalContribution(e.target.value)
                                }
                                placeholder="Optional direct boost"
                                className="h-9 text-xs"
                              />
                            </div>
                          </div>

                          {/* Explicit Goal Allocation Checkboxes */}
                          <div className="space-y-2 rounded-xl border border-border/70 bg-paper-deep/40 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Explicit Goal Allocation Rules (No Double Counting)
                            </p>

                            <label className="flex items-start gap-2.5 text-xs text-ink cursor-pointer">
                              <input
                                type="checkbox"
                                aria-label="Include extra monthly savings in this goal"
                                checked={includeExtraMonthlySavings}
                                onChange={(e) => setIncludeExtraMonthlySavings(e.target.checked)}
                                className="mt-0.5 rounded border-input text-forest focus:ring-forest"
                              />
                              <span>
                                <strong>Include extra monthly savings in this goal</strong>
                                <span className="block text-[11px] text-muted-foreground">
                                  Directs your ₹
                                  {formatAmount(simulationResult.extraMonthlySavingsAllocation)}/mo
                                  from Lever B into {selectedGoal.name}.
                                </span>
                              </span>
                            </label>

                            <label className="flex items-start gap-2.5 text-xs text-ink cursor-pointer">
                              <input
                                type="checkbox"
                                aria-label="Redirect monthly spending reductions to this goal"
                                checked={redirectSpendingReductionsToGoal}
                                onChange={(e) =>
                                  setRedirectSpendingReductionsToGoal(e.target.checked)
                                }
                                className="mt-0.5 rounded border-input text-forest focus:ring-forest"
                              />
                              <span>
                                <strong>Redirect monthly spending reductions to this goal</strong>
                                <span className="block text-[11px] text-muted-foreground">
                                  Directs your ₹
                                  {formatAmount(simulationResult.averageMonthlyVariableReduction)}
                                  /mo variable spending cut from Lever A into {selectedGoal.name}.
                                </span>
                              </span>
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Live Scenario Comparison & Trajectory */}
              <div className="xl:col-span-7 space-y-5 min-w-0">
                {/* Status & Feasibility Banner */}
                {(() => {
                  const badgeCfg = getFeasibilityBadgeConfig(simulationResult.feasibilityStatus)
                  return (
                    <div className="rounded-xl border border-border/80 bg-paper/80 p-4 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {simulationResult.feasibilityStatus === 'sustainable' ? (
                            <CheckCircle2 className="size-4 text-forest shrink-0" />
                          ) : (
                            <Info className="size-4 text-amber-800 shrink-0" />
                          )}
                          <span className="text-xs font-semibold text-ink">
                            Scenario Assessment
                          </span>
                        </div>
                        <Badge tone={badgeCfg.tone} data-testid="simulator-feasibility-badge">
                          {badgeCfg.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{badgeCfg.description}</p>

                      {simulationResult.warnings.length > 0 && (
                        <ul
                          className="space-y-1.5 border-t border-border/60 pt-2.5 text-xs text-amber-950"
                          aria-label="Scenario Warnings"
                        >
                          {simulationResult.warnings.map((w, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <AlertTriangle className="size-3.5 text-amber-700 shrink-0 mt-0.5" />
                              <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })()}

                {/* 4 Comparison KPI Cards */}
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {/* Card 1: Baseline vs Simulated Monthly Outflow */}
                  <div
                    className="rounded-xl border border-border/80 bg-paper/70 p-4 space-y-1.5"
                    data-testid="simulator-card-outflow"
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">Monthly Outflow (Future Avg)</span>
                      <TrendingDown className="size-3.5 text-forest" />
                    </div>

                    {!simulationResult.hasFutureForecastPoints ? (
                      <>
                        <p className="font-serif text-lg font-bold text-muted-foreground">
                          Forecast unavailable
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Future forecast points are required to compare monthly outflows.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-serif text-xl font-bold text-ink">
                            ₹{formatAmount(simulationResult.averageSimulatedMonthlyOutflow)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            vs ₹{formatAmount(simulationResult.averageBaselineMonthlyOutflow)}{' '}
                            baseline
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {simulationResult.totalHorizonOutflowSaving > 0 ? (
                            <span className="font-semibold text-forest">
                              Saves ₹{formatAmount(simulationResult.totalHorizonOutflowSaving)}{' '}
                              over {simulationResult.horizonMonths} months
                            </span>
                          ) : simulationResult.totalHorizonOutflowSaving < 0 ? (
                            <span className="font-semibold text-destructive">
                              Adds ₹
                              {formatAmount(Math.abs(simulationResult.totalHorizonOutflowSaving))}{' '}
                              over {simulationResult.horizonMonths} months
                            </span>
                          ) : (
                            'Matches baseline forecast outflow'
                          )}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Card 2: Baseline vs Simulated Monthly Surplus */}
                  <div
                    className="rounded-xl border border-border/80 bg-paper/70 p-4 space-y-1.5"
                    data-testid="simulator-card-surplus"
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">Monthly Net Surplus (Income − Outflow)</span>
                      <Wallet className="size-3.5 text-forest" />
                    </div>

                    {!simulationResult.hasFutureForecastPoints ? (
                      <>
                        <p className="font-serif text-lg font-bold text-muted-foreground">
                          Forecast unavailable
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          No future forecast months available to compute monthly surplus.
                        </p>
                      </>
                    ) : simulationResult.averageSimulatedMonthlySurplus === null ||
                      simulationResult.averageBaselineMonthlySurplus === null ? (
                      <>
                        <p className="font-serif text-lg font-bold text-amber-900">
                          Requires monthly income
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Enter a monthly income assumption above to calculate baseline and
                          simulated surplus.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span
                            className={cn(
                              'font-serif text-xl font-bold',
                              simulationResult.averageSimulatedMonthlySurplus >= 0
                                ? 'text-ink'
                                : 'text-destructive',
                            )}
                          >
                            {simulationResult.averageSimulatedMonthlySurplus < 0 ? '-' : ''}₹
                            {formatAmount(
                              Math.abs(simulationResult.averageSimulatedMonthlySurplus),
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            vs {simulationResult.averageBaselineMonthlySurplus < 0 ? '-' : ''}₹
                            {formatAmount(
                              Math.abs(simulationResult.averageBaselineMonthlySurplus),
                            )}{' '}
                            baseline
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Based on ₹{formatAmount(simulationResult.effectiveMonthlyIncome ?? 0)}/mo
                          ({simulationResult.incomeSourcePeriodLabel})
                        </p>
                      </>
                    )}
                  </div>

                  {/* Card 3: Committed Savings & Remaining Unallocated Surplus */}
                  <div
                    className="rounded-xl border border-border/80 bg-paper/70 p-4 space-y-1.5"
                    data-testid="simulator-card-allocation"
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">Committed Savings & Unallocated Surplus</span>
                      <PiggyBank className="size-3.5 text-forest" />
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Committed Savings:</span>
                      <span className="font-serif text-base font-bold text-forest">
                        ₹{formatAmount(simulationResult.totalCommittedMonthlySavings)}/mo
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">Unallocated Surplus:</span>
                      {!simulationResult.hasFutureForecastPoints ? (
                        <span className="text-xs font-semibold text-muted-foreground">
                          Forecast unavailable
                        </span>
                      ) : simulationResult.averageUnallocatedMonthlySurplus === null ? (
                        <span className="text-xs font-semibold text-amber-900">
                          Requires monthly income
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'font-serif text-base font-bold',
                            simulationResult.averageUnallocatedMonthlySurplus >= 0
                              ? 'text-ink'
                              : 'text-destructive',
                          )}
                        >
                          {simulationResult.averageUnallocatedMonthlySurplus < 0 ? '-' : ''}₹
                          {formatAmount(
                            Math.abs(simulationResult.averageUnallocatedMonthlySurplus),
                          )}
                          /mo
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card 4: One-Time Purchase & Horizon Cash-Flow Impact */}
                  <div
                    className="rounded-xl border border-border/80 bg-paper/70 p-4 space-y-1.5"
                    data-testid="simulator-card-horizon"
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">Purchase & Horizon Cash-Flow Impact</span>
                      <ShoppingBag className="size-3.5 text-forest" />
                    </div>

                    {!simulationResult.hasFutureForecastPoints ? (
                      <>
                        <p className="font-serif text-lg font-bold text-muted-foreground">
                          Forecast unavailable
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          No future forecast months available for horizon cash-flow tracking.
                        </p>
                      </>
                    ) : (
                      <>
                        {simulationResult.plannedPurchaseTotal > 0 ? (
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                              Planned in {simulationResult.plannedPurchaseMonthLabel}:
                            </span>
                            <span className="font-serif text-base font-bold text-ink">
                              ₹{formatAmount(simulationResult.plannedPurchaseTotal)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                              Planned Purchase:
                            </span>
                            <span className="text-xs font-medium text-muted-foreground">
                              None configured
                            </span>
                          </div>
                        )}

                        {simulationResult.hasStartingBalance &&
                        simulationResult.projectedEndingBalance !== null ? (
                          <div className="pt-1 border-t border-border/50 space-y-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs text-muted-foreground">
                                Projected Ending Balance ({simulationResult.horizonMonths} mo):
                              </span>
                              <span
                                className={cn(
                                  'font-serif text-base font-bold',
                                  simulationResult.projectedEndingBalance >= 0
                                    ? 'text-forest'
                                    : 'text-destructive',
                                )}
                              >
                                {simulationResult.projectedEndingBalance < 0 ? '-' : ''}₹
                                {formatAmount(Math.abs(simulationResult.projectedEndingBalance))}
                              </span>
                            </div>
                            {simulationResult.plannedPurchaseTotal > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                {simulationResult.isPurchaseCoveredByStartingBalance
                                  ? 'Covered by starting balance + cumulative horizon cash flow.'
                                  : 'Exceeds projected balance buffer over the horizon.'}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="pt-1 border-t border-border/50">
                            <p className="text-[11px] text-muted-foreground">
                              <strong className="text-ink">Cash-flow impact only</strong> — enter a
                              starting balance to evaluate balance buffer coverage.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Savings Goal Impact Panel (when a goal is selected) */}
                {simulationResult.goalImpact && (
                  <div
                    className="rounded-xl border border-forest/25 bg-forest/5 p-4 space-y-3.5"
                    data-testid="simulator-goal-impact-panel"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Target className="size-4 text-forest shrink-0" />
                        <h4 className="text-xs sm:text-sm font-semibold text-ink">
                          Goal Impact: {simulationResult.goalImpact.goalName}
                        </h4>
                      </div>

                      {simulationResult.goalImpact.isForecastBacked ? (
                        <Badge tone="sage" data-testid="goal-projection-basis-badge">
                          Forecast-Backed Goal Projection
                        </Badge>
                      ) : (
                        <Badge tone="butter" data-testid="goal-projection-basis-badge">
                          Contribution-Only Illustration (No Future Forecast)
                        </Badge>
                      )}
                    </div>

                    {/* Contribution Breakdown */}
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs">
                      <div className="rounded-lg bg-card p-2.5 border border-border/60">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                          Baseline Goal/mo
                        </span>
                        <span className="font-semibold text-ink">
                          ₹{formatAmount(simulationResult.goalImpact.baselineMonthlyContribution)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-card p-2.5 border border-border/60">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                          Included Extra
                        </span>
                        <span className="font-semibold text-forest">
                          +₹{formatAmount(simulationResult.goalImpact.includedExtraMonthlySavings)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-card p-2.5 border border-border/60">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                          Redirected Cuts
                        </span>
                        <span className="font-semibold text-forest">
                          +₹{formatAmount(simulationResult.goalImpact.redirectedSpendingReduction)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-card p-2.5 border border-border/60">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                          Simulated Total/mo
                        </span>
                        <span
                          className="font-serif font-bold text-forest"
                          data-testid="goal-simulated-monthly-total"
                        >
                          ₹{formatAmount(simulationResult.goalImpact.simulatedMonthlyContribution)}
                        </span>
                      </div>
                    </div>

                    {/* Timeline & Horizon Projection (Forecast-Backed vs Contribution-Only Illustration) */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs pt-1">
                      <div className="rounded-lg bg-card p-3 border border-border/60 space-y-1">
                        <span className="text-[11px] font-medium text-muted-foreground block">
                          Estimated Time to Reach ₹
                          {formatAmount(simulationResult.goalImpact.targetAmount)}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-muted-foreground">
                            Baseline:{' '}
                            <strong className="text-ink">
                              {simulationResult.goalImpact.baselineMonthsToGoal !== null
                                ? `${simulationResult.goalImpact.baselineMonthsToGoal} mo`
                                : 'Not set'}
                            </strong>
                          </span>
                          <ArrowRight className="size-3.5 text-muted-foreground" />
                          <span className="text-forest font-semibold">
                            Simulated:{' '}
                            {simulationResult.goalImpact.simulatedMonthsToGoal !== null
                              ? `${simulationResult.goalImpact.simulatedMonthsToGoal} mo`
                              : 'Not set'}
                          </span>
                        </div>
                        {simulationResult.goalImpact.monthsSaved !== null &&
                          simulationResult.goalImpact.monthsSaved > 0 && (
                            <p className="text-[11px] font-semibold text-forest">
                              Accelerates goal completion by{' '}
                              {simulationResult.goalImpact.monthsSaved}{' '}
                              {simulationResult.goalImpact.monthsSaved === 1 ? 'month' : 'months'}!
                            </p>
                          )}
                      </div>

                      <div className="rounded-lg bg-card p-3 border border-border/60 space-y-1">
                        {simulationResult.goalImpact.isForecastBacked &&
                        simulationResult.goalImpact.projectedSavedAtHorizonEnd !== null &&
                        simulationResult.goalImpact.projectedProgressPctAtHorizonEnd !== null ? (
                          <>
                            <span className="text-[11px] font-medium text-muted-foreground block">
                              Forecast-Backed Balance After{' '}
                              {simulationResult.goalImpact.projectionHorizonMonths} Months
                            </span>
                            <p className="font-serif text-base font-bold text-ink">
                              ₹
                              {formatAmount(simulationResult.goalImpact.projectedSavedAtHorizonEnd)}{' '}
                              <span className="text-xs font-sans font-semibold text-forest">
                                ({simulationResult.goalImpact.projectedProgressPctAtHorizonEnd}% of
                                goal)
                              </span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Includes +₹
                              {formatAmount(
                                simulationResult.goalImpact.projectedContributionOverHorizon ?? 0,
                              )}{' '}
                              projected over {simulationResult.goalImpact.projectionHorizonMonths}{' '}
                              forecast months.
                            </p>
                          </>
                        ) : (
                          <>
                            <span className="text-[11px] font-medium text-amber-900 block">
                              Contribution-Only Illustration (
                              {simulationResult.goalImpact.illustrativeHorizonMonths} Months)
                            </span>
                            <p className="font-serif text-base font-bold text-ink">
                              ₹
                              {formatAmount(
                                simulationResult.goalImpact.illustrativeSavedAtHorizonEnd,
                              )}{' '}
                              <span className="text-xs font-sans font-semibold text-amber-900">
                                ({simulationResult.goalImpact.illustrativeProgressPctAtHorizonEnd}%
                                illustrative)
                              </span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Future forecast data is unavailable; showing contribution-only math (+₹
                              {formatAmount(
                                simulationResult.goalImpact.illustrativeContributionOverHorizon,
                              )}
                              ) without forecast verification.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Recharts Comparison Trajectory Chart */}
                <div className="rounded-2xl border border-border/80 bg-paper/50 p-4 sm:p-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-semibold text-ink">
                        Baseline vs. Simulated Outflow Trajectory
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Current month anchor is preserved read-only; scenario adjustments apply to
                        future forecast months.
                      </p>
                    </div>
                    {simulationResult.hasFutureForecastPoints && (
                      <Badge tone="neutral" className="text-[10px] self-start sm:self-auto">
                        {simulationResult.horizonMonths}-Month Future Horizon
                      </Badge>
                    )}
                  </div>

                  {!simulationResult.hasFutureForecastPoints ? (
                    <div
                      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/60 py-10 px-4 text-center"
                      data-testid="simulator-empty-forecast-chart"
                    >
                      <Sparkles className="size-6 text-muted-foreground" />
                      <p className="text-xs sm:text-sm font-semibold text-ink">
                        Future forecast trajectory unavailable
                      </p>
                      <p className="max-w-md text-xs text-muted-foreground">
                        No future forecast months were returned by the forecasting engine. Outflow
                        comparison charts require at least one future forecast month.
                      </p>
                    </div>
                  ) : (
                    <div className="h-[250px] sm:h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={chartData}
                          margin={{ top: 10, right: 16, left: 4, bottom: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--border)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                            axisLine={{ stroke: 'var(--border)' }}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={formatCompactINR}
                            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                            axisLine={false}
                            tickLine={false}
                            width={56}
                          />
                          <Tooltip content={<SimulatorChartTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />

                          <Bar
                            dataKey="baselineOutflow"
                            name="Baseline Outflow"
                            fill="var(--color-sage)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={32}
                          />
                          <Bar
                            dataKey="simulatedOutflow"
                            name="Simulated Outflow"
                            fill="var(--color-forest)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={32}
                          />
                          {simulationResult.effectiveMonthlyIncome !== null && (
                            <Line
                              type="monotone"
                              dataKey="effectiveIncome"
                              name="Monthly Income Assumption"
                              stroke="var(--color-terracotta)"
                              strokeWidth={2}
                              strokeDasharray="5 4"
                              dot={false}
                            />
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
