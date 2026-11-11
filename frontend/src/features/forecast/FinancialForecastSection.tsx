import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  LineChart as LineChartIcon,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { useState } from 'react'
import {
  Area,
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
import { useForecast, type UseForecastReturn } from '@/features/forecast/useForecast'
import type { CategoryForecastItem, MonthlyForecastPoint } from '@/lib/api/types'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

interface FinancialForecastSectionProps {
  refDate?: string
  className?: string
  forecastState?: UseForecastReturn
}

function safeNumber(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0
  const parsed = typeof val === 'number' ? val : Number(val)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCompactINR(val: number): string {
  if (val >= 10000000) {
    return `₹${(val / 10000000).toFixed(val % 10000000 === 0 ? 0 : 1)}Cr`
  }
  if (val >= 100000) {
    return `₹${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`
  }
  if (val >= 1000) {
    return `₹${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`
  }
  return `₹${val}`
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number | [number, number]
    color?: string
    payload: {
      rawPoint: MonthlyForecastPoint
    }
  }>
}

function ForecastTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  const point = payload[0]?.payload?.rawPoint
  if (!point) return null

  const predicted = safeNumber(point.predicted_amount)
  const actual = point.actual_amount !== null ? safeNumber(point.actual_amount) : null
  const lower = safeNumber(point.lower_bound)
  const upper = safeNumber(point.upper_bound)
  const fixed = safeNumber(point.fixed_commitments)
  const variable = safeNumber(point.variable_estimate)

  return (
    <div className="rounded-xl border border-border bg-popover p-3.5 shadow-popover text-xs">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
        <span className="font-semibold text-ink">{point.month_label}</span>
        {point.is_current_month && (
          <span className="rounded-sm bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">
            Current Month
          </span>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full bg-forest shrink-0 inline-block" />
            Predicted Outflow:
          </span>
          <span className="font-semibold text-ink">₹{formatAmount(predicted)}</span>
        </div>

        {actual !== null && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-xs bg-forest-soft shrink-0 inline-block" />
              Actual Spent (MTD):
            </span>
            <span className="font-semibold text-forest">₹{formatAmount(actual)}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2.5 h-1.5 rounded-xs bg-sage/60 border border-sage-deep/50 shrink-0 inline-block" />
            Estimate Range:
          </span>
          <span className="text-muted-foreground">
            ₹{formatAmount(lower)} – ₹{formatAmount(upper)}
          </span>
        </div>

        <div className="pt-1.5 border-t border-border/40 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/80">
              Fixed
            </span>
            <span className="font-medium text-ink">₹{formatAmount(fixed)}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/80">
              Variable
            </span>
            <span className="font-medium text-ink">₹{formatAmount(variable)}</span>
          </div>
        </div>

        <p className="pt-1 text-[10px] text-muted-foreground/75 italic">
          * Range reflects past volatility, not guaranteed bounds.
        </p>
      </div>
    </div>
  )
}

export function FinancialForecastSection({
  refDate,
  className,
  forecastState,
}: FinancialForecastSectionProps) {
  const internalForecastState = useForecast({ refDate, autoFetch: !forecastState })
  const {
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
  } = forecastState ?? internalForecastState

  const [showTransparencyDetails, setShowTransparencyDetails] = useState<boolean>(false)

  const HORIZON_OPTIONS = [1, 2, 3, 4, 5, 6]

  const currMonth = forecast?.current_month_forecast
  const monthlyPoints = forecast?.monthly_forecasts ?? []
  const categoryForecasts = forecast?.category_forecasts ?? []

  // Prepare chart data directly from backend forecast without recalculating
  const chartData = monthlyPoints.map((pt) => {
    const pred = safeNumber(pt.predicted_amount)
    const low = safeNumber(pt.lower_bound)
    const up = safeNumber(pt.upper_bound)
    const act = pt.actual_amount !== null ? safeNumber(pt.actual_amount) : undefined

    return {
      monthKey: pt.month,
      label: pt.month_label.split(' ')[0], // e.g. "Nov", "Dec"
      fullLabel: pt.month_label,
      predicted: pred,
      actual: act,
      lower: low,
      upper: up,
      range: [low, up] as [number, number],
      rawPoint: pt,
    }
  })

  // Confidence badge tone
  const confidenceBadgeTone =
    confidenceLevel === 'high' ? 'sage' : confidenceLevel === 'moderate' ? 'butter' : 'terracotta'

  const confidenceBadgeLabel =
    confidenceLevel === 'high'
      ? 'High Confidence'
      : confidenceLevel === 'moderate'
        ? 'Moderate Confidence'
        : 'Low Confidence'

  return (
    <Card className={cn('min-w-0 border-border bg-card shadow-card', className)}>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-forest/10 text-forest">
              <LineChartIcon className="size-4" />
            </span>
            <CardTitle className="font-display text-xl font-bold text-ink">
              Spending Forecast & Projections
            </CardTitle>
          </div>
          <CardDescription className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Forward-looking projections combining deterministic recurring commitments with
            recency-weighted variable trends. Estimates are for planning, not guaranteed outcomes.
          </CardDescription>
        </div>

        {/* Horizon Selector and Reload Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div
            className="flex items-center rounded-xl border border-border bg-paper-deep/60 p-1"
            role="group"
            aria-label="Forecast horizon in months"
          >
            {HORIZON_OPTIONS.map((months) => (
              <button
                key={months}
                type="button"
                onClick={() => setHorizonMonths(months)}
                aria-pressed={horizonMonths === months}
                className={cn(
                  'min-h-[36px] sm:min-h-[28px] min-w-[34px] inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 sm:py-1 text-xs font-medium transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 select-none',
                  horizonMonths === months
                    ? 'bg-card text-forest shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-ink',
                )}
              >
                {months}M
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={reload}
            disabled={isLoading}
            aria-label="Reload financial forecast"
            className="size-8 rounded-xl border-border text-muted-foreground hover:text-ink"
          >
            <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 min-w-0">
        {/* Loading State */}
        {isLoading && !forecast && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Loader2 className="size-8 animate-spin text-forest" />
            <p className="text-sm font-medium text-muted-foreground">
              Computing statistical financial projections…
            </p>
          </div>
        )}

        {/* Error State */}
        {error && !forecast && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <AlertCircle className="size-5" />
            </span>
            <div className="max-w-md">
              <p className="font-semibold text-ink">Unable to generate financial forecast</p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reload}
              className="gap-2 rounded-xl"
            >
              <RefreshCw className="size-3.5" />
              Retry forecast
            </Button>
          </div>
        )}

        {/* Cold Start / Insufficient History Banner */}
        {forecast && hasInsufficientHistory && (
          <div className="flex items-start gap-3 rounded-xl border border-terracotta/30 bg-terracotta/10 p-3.5 text-xs text-ink">
            <ShieldAlert className="size-4 shrink-0 text-terracotta mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-ink">
                Limited transaction history ({historyMonthsCount} month
                {historyMonthsCount === 1 ? '' : 's'} recorded)
              </p>
              <p className="text-muted-foreground">
                Projections are anchored primarily on active recurring commitments and current-month
                pacing. Accuracy and confidence will improve as additional monthly transactions are
                logged.
              </p>
            </div>
          </div>
        )}

        {forecast && (
          <>
            {/* Explanatory Callout: Clarifying the Two Month-End Estimates */}
            <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-paper p-3 text-xs text-muted-foreground">
              <Info className="size-4 shrink-0 text-forest mt-0.5" />
              <div className="space-y-0.5 leading-relaxed">
                <span className="font-semibold text-ink">Two Distinct Month-End Estimates:</span>{' '}
                <span>
                  The top <strong>Run Rate</strong> KPI projects month-end spending assuming current daily pacing continues linearly. The <strong>Statistical Forecast</strong> below models verified recurring commitments plus recency-weighted variable trends and volatility envelopes. Neither estimate represents a guaranteed financial outcome.
                </span>
              </div>
            </div>

            {/* Top Summary KPI Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
              {/* Current Month Projected Outflows */}
              {currMonth && (
                <div className="rounded-2xl border border-border bg-paper p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {currMonth.month_label} Projected Outflow
                    </span>
                    <Badge tone="lime" className="text-[10px]">
                      Anchor Month
                    </Badge>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-ink">
                    ₹{formatAmount(currMonth.predicted_amount)}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                    {currMonth.actual_amount !== null && (
                      <div>
                        Actual spent so far:{' '}
                        <span className="font-medium text-ink">
                          ₹{formatAmount(currMonth.actual_amount)}
                        </span>
                      </div>
                    )}
                    <div>
                      Estimate range:{' '}
                      <span className="font-medium text-ink">
                        ₹{formatAmount(currMonth.lower_bound)} – ₹
                        {formatAmount(currMonth.upper_bound)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Monthly Fixed Commitments */}
              <div className="rounded-2xl border border-border bg-paper p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Fixed Recurring Commitments
                  </span>
                  <Clock className="size-3.5 text-forest" />
                </div>
                <div className="mt-2 text-2xl font-bold text-ink">
                  ₹{formatAmount(currMonth?.fixed_commitments ?? 0)}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Scheduled monthly recurring bills and subscriptions (deterministic non-discretionary).
                </p>
              </div>

              {/* Model Confidence & History Depth */}
              <div className="rounded-2xl border border-border bg-paper p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Model Confidence
                  </span>
                  <Badge tone={confidenceBadgeTone}>{confidenceBadgeLabel}</Badge>
                </div>
                <div className="mt-2 text-2xl font-bold text-ink">
                  {confidenceScore !== null ? `${(confidenceScore * 100).toFixed(0)}%` : 'N/A'}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Based on {historyMonthsCount} month{historyMonthsCount === 1 ? '' : 's'} of
                  historical spending patterns.
                </p>
              </div>
            </div>

            {/* Monthly Forecast Chart */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-ink">
                    Monthly Trajectory ({horizonMonths} Month Horizon)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Central projected spending alongside past volatility range envelopes.
                  </p>
                </div>
              </div>

              <div
                role="img"
                aria-label={`Spending forecast trajectory chart for ${horizonMonths} months`}
                className="rounded-2xl border border-border bg-card p-4 min-w-0"
              >
                <div style={{ height: 260, minHeight: 260, width: '100%' }}>
                  <ResponsiveContainer
                    width="100%"
                    height={260}
                    minHeight={260}
                    initialDimension={{ width: 500, height: 260 }}
                  >
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 12, right: 12, bottom: 0, left: -4 }}
                    >
                      <CartesianGrid
                        stroke="var(--color-border)"
                        strokeDasharray="3 4"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={68}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        tickFormatter={formatCompactINR}
                      />
                      <Tooltip content={<ForecastTooltip />} />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
                      />

                      {/* Volatility Estimate Range Envelope */}
                      <Area
                        type="monotone"
                        dataKey="range"
                        fill="var(--color-sage)"
                        fillOpacity={0.4}
                        stroke="var(--color-sage-deep)"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        name="Estimate Range (Past Variance)"
                      />

                      {/* Central Projected Spend */}
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        stroke="var(--color-forest)"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: 'var(--color-forest)' }}
                        activeDot={{ r: 6 }}
                        name="Predicted Spend (INR)"
                      />

                      {/* Actual Spend Month-to-Date (Current Month only) */}
                      <Bar
                        dataKey="actual"
                        fill="var(--color-forest-soft)"
                        barSize={20}
                        radius={[4, 4, 0, 0]}
                        name="Actual Spent MTD"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Monthly Forecast Cards / Data Table */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-ink">Monthly Breakdown Details</h4>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {monthlyPoints.map((pt) => (
                  <div
                    key={pt.month}
                    className={cn(
                      'rounded-xl border p-3 text-xs space-y-1.5 transition-all motion-reduce:transition-none',
                      pt.is_current_month
                        ? 'border-forest/40 bg-paper'
                        : 'border-border bg-card hover:bg-paper-deep/30',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">{pt.month_label}</span>
                      {pt.is_current_month ? (
                        <Badge tone="lime" className="text-[10px] py-0 px-1.5">
                          Current
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {pt.month}
                        </span>
                      )}
                    </div>

                    <div className="text-base font-bold text-ink">
                      ₹{formatAmount(pt.predicted_amount)}
                    </div>

                    <div className="text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-1">
                      <span>Range:</span>
                      <span className="font-medium text-ink">
                        ₹{formatAmount(pt.lower_bound)} – ₹{formatAmount(pt.upper_bound)}
                      </span>
                    </div>

                    <div className="pt-1 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Fixed: ₹{formatAmount(pt.fixed_commitments)}</span>
                      <span>Variable: ₹{formatAmount(pt.variable_estimate)}</span>
                    </div>

                    {pt.actual_amount !== null && (
                      <div className="text-[10px] font-medium text-forest">
                        Actual MTD: ₹{formatAmount(pt.actual_amount)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Category Forecast Breakdown */}
            {categoryForecasts.length > 0 && (
              <div className="space-y-3 pt-2">
                <div>
                  <h4 className="text-sm font-semibold text-ink">
                    Projected Category Allocation (Next Month)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Forecasted distribution across expense categories, incorporating both recurring bills
                    and historical discretionary pacing.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryForecasts.map((cat: CategoryForecastItem) => (
                    <div
                      key={cat.category}
                      className="rounded-xl border border-border bg-paper p-3 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">{cat.category}</span>
                        <span className="rounded-full bg-forest/10 px-2 py-0.5 font-medium text-forest text-[11px]">
                          {cat.percentage.toFixed(1)}%
                        </span>
                      </div>

                      <div className="text-sm font-bold text-ink">
                        ₹{formatAmount(cat.predicted_amount)}
                      </div>

                      {/* Percentage Visual Bar */}
                      <div className="h-1.5 w-full rounded-full bg-border/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-forest transition-all duration-300 motion-reduce:transition-none"
                          style={{ width: `${Math.min(100, Math.max(0, cat.percentage))}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Fixed: ₹{formatAmount(cat.fixed_amount)}</span>
                        <span>Variable: ₹{formatAmount(cat.variable_amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Methodology & Limitations Transparency Accordion */}
            <div className="rounded-2xl border border-border bg-paper-deep/40 p-4 text-xs">
              <button
                type="button"
                onClick={() => setShowTransparencyDetails((prev) => !prev)}
                className="flex w-full items-center justify-between text-left font-medium text-ink hover:text-forest transition-colors"
                aria-expanded={showTransparencyDetails}
              >
                <div className="flex items-center gap-2">
                  <Info className="size-4 text-forest" />
                  <span className="font-semibold">Model Methodology & Limitations</span>
                </div>
                {showTransparencyDetails ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </button>

              {showTransparencyDetails && (
                <div className="mt-3 space-y-3 pt-3 border-t border-border/60 text-muted-foreground">
                  {/* Methodology Notes */}
                  {forecast.methodology_notes.length > 0 && (
                    <div>
                      <p className="font-semibold text-ink mb-1.5 flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-forest" />
                        Forecasting Engine Architecture:
                      </p>
                      <ul className="list-disc pl-5 space-y-1">
                        {forecast.methodology_notes.map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Explicit Limitations */}
                  {forecast.limitations.length > 0 && (
                    <div>
                      <p className="font-semibold text-ink mb-1.5 flex items-center gap-1.5 text-terracotta">
                        <AlertCircle className="size-3.5 text-terracotta" />
                        Important Disclaimers:
                      </p>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        {forecast.limitations.map((lim, idx) => (
                          <li key={idx}>{lim}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
