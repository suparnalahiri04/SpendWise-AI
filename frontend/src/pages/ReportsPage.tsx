import {
  AlertCircle,
  CheckCircle2,
  Coins,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useState } from 'react'
import { PageIntro } from '@/components/common/PageIntro'
import { StatCard } from '@/components/common/StatCard'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useReports } from '@/features/reports/useReports'
import { formatAmount } from '@/lib/format'
import type { ReportPeriod } from '@/lib/api/types'
import { cn } from '@/lib/utils'

const PERIOD_TABS: readonly { id: ReportPeriod; label: string }[] = [
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'last-3-months', label: 'Last 3 Months' },
  { id: 'year-to-date', label: 'Year to Date' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Custom Range' },
] as const

interface ReportsPageProps {
  initialPeriod?: ReportPeriod
  initialStartDate?: string
  initialEndDate?: string
}

export function ReportsPage({
  initialPeriod,
  initialStartDate,
  initialEndDate,
}: ReportsPageProps = {}) {
  const {
    period,
    setPeriod,
    startDate,
    endDate,
    setCustomDateRange,
    status,
    summary,
    error,
    reload,
    isDownloadingCsv,
    isDownloadingPdf,
    downloadCsv,
    downloadPdf,
    downloadError,
    lastDownloadedFile,
  } = useReports({
    initialPeriod,
    initialStartDate,
    initialEndDate,
  })

  // Local state for custom date inputs before applying
  const [customStart, setCustomStart] = useState(startDate || '')
  const [customEnd, setCustomEnd] = useState(endDate || '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleApplyCustom = () => {
    if (!customStart || !customEnd) {
      setValidationError('Please select both start and end dates.')
      return
    }
    if (customStart > customEnd) {
      setValidationError('Start date cannot be after end date.')
      return
    }
    setValidationError(null)
    setCustomDateRange(customStart, customEnd)
  }

  // Calculate StatCard metrics
  let incomeVal: string | null = null
  let expenseVal: string | null = null
  let netVal: string | null = null
  let savingsRateVal: string | null = null

  let incomeHint = 'Loading income…'
  let expenseHint = 'Loading expenses…'
  let netHint = 'Loading net flow…'
  let savingsRateHint = 'Loading rate…'

  if (status === 'error') {
    incomeHint = 'Unable to load'
    expenseHint = 'Unable to load'
    netHint = 'Unable to load'
    savingsRateHint = 'Unable to load'
  } else if (status === 'idle') {
    incomeHint = 'Select date range'
    expenseHint = 'Select date range'
    netHint = 'Select date range'
    savingsRateHint = 'Select date range'
  } else if (status === 'success' && summary) {
    incomeVal = `₹${formatAmount(summary.total_income)}`
    expenseVal = `₹${formatAmount(summary.total_expenses)}`

    const netNum =
      typeof summary.net_savings === 'number'
        ? summary.net_savings
        : Number(summary.net_savings) || 0
    netVal = `${netNum < 0 ? '−' : ''}₹${formatAmount(Math.abs(netNum))}`

    savingsRateVal =
      summary.savings_rate_pct !== null ? `${summary.savings_rate_pct.toFixed(1)}%` : 'N/A'

    incomeHint = `${summary.income_transaction_count} income records`
    expenseHint = `${summary.expense_transaction_count} expense records`
    netHint = netNum >= 0 ? 'Net positive savings' : 'Expenses exceed income'
    savingsRateHint =
      summary.savings_rate_pct !== null ? 'Percentage of income saved' : 'No income recorded'
  }

  const isActionDisabled =
    isDownloadingCsv ||
    isDownloadingPdf ||
    status === 'loading' ||
    (status === 'idle' && !summary)

  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Export & Analysis"
        title="Financial Reports"
        description="Generate executive PDF financial summaries and download comprehensive CSV transaction ledgers for any reporting period."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 h-9 text-xs"
              onClick={() => void downloadCsv()}
              disabled={isActionDisabled}
              aria-label="Export CSV"
            >
              {isDownloadingCsv ? (
                <Loader2 className="size-3.5 animate-spin text-forest" />
              ) : (
                <FileSpreadsheet className="size-3.5 text-forest" />
              )}
              <span>{isDownloadingCsv ? 'Generating CSV…' : 'Export CSV'}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              className="gap-1.5 h-9 text-xs"
              onClick={() => void downloadPdf()}
              disabled={isActionDisabled}
              aria-label="Download PDF"
            >
              {isDownloadingPdf ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileText className="size-3.5" />
              )}
              <span>{isDownloadingPdf ? 'Generating PDF…' : 'Download PDF'}</span>
            </Button>
          </div>
        }
      />

      {/* Download Status & Error Feedback Banners */}
      {lastDownloadedFile && (
        <Reveal className="mt-2">
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs text-forest font-medium"
          >
            <CheckCircle2 className="size-4 shrink-0" />
            <span>Downloaded {lastDownloadedFile} successfully.</span>
          </div>
        </Reveal>
      )}

      {downloadError && (
        <Reveal className="mt-2">
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{downloadError}</span>
          </div>
        </Reveal>
      )}

      {/* Period Selection Tabs */}
      <Reveal className="mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div
            className="flex flex-wrap gap-1"
            role="tablist"
            aria-label="Select reporting period"
          >
            {PERIOD_TABS.map((tab) => (
              <Button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={period === tab.id}
                variant={period === tab.id ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'rounded-lg text-xs font-medium',
                  period === tab.id && 'shadow-xs font-semibold',
                )}
                onClick={() => {
                  setValidationError(null)
                  setPeriod(tab.id)
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {/* Period Range Tag */}
          {summary && summary.start_date && summary.end_date && (
            <span className="text-xs text-muted-foreground tabular font-medium">
              {summary.start_date} to {summary.end_date}
            </span>
          )}
        </div>
      </Reveal>

      {/* Custom Date Range Controls */}
      {period === 'custom' && (
        <Reveal className="mt-3">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label
                htmlFor="custom-start-date"
                className="text-xs font-semibold text-muted-foreground"
              >
                Start Date
              </label>
              <Input
                id="custom-start-date"
                type="date"
                value={customStart}
                onChange={(e) => {
                  setCustomStart(e.target.value)
                  setValidationError(null)
                }}
                className="h-8 text-xs"
                aria-label="Start date"
              />
            </div>

            <div className="flex flex-col gap-1 min-w-[140px]">
              <label
                htmlFor="custom-end-date"
                className="text-xs font-semibold text-muted-foreground"
              >
                End Date
              </label>
              <Input
                id="custom-end-date"
                type="date"
                value={customEnd}
                onChange={(e) => {
                  setCustomEnd(e.target.value)
                  setValidationError(null)
                }}
                className="h-8 text-xs"
                aria-label="End date"
              />
            </div>

            <Button
              type="button"
              size="sm"
              className="h-8 text-xs px-3"
              onClick={handleApplyCustom}
              aria-label="Apply date range"
            >
              Apply Range
            </Button>
          </div>

          {(validationError || error) && (
            <p className="mt-1.5 text-xs font-medium text-destructive">
              {validationError || error}
            </p>
          )}
        </Reveal>
      )}

      {/* Summary KPI Metrics */}
      <Reveal className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total income"
          icon={TrendingUp}
          value={incomeVal}
          hint={incomeHint}
          accent="forest"
        />
        <StatCard
          label="Total expenses"
          icon={TrendingDown}
          value={expenseVal}
          hint={expenseHint}
          accent="butter"
        />
        <StatCard
          label="Net savings"
          icon={Coins}
          value={netVal}
          hint={netHint}
          accent="emerald"
        />
        <StatCard
          label="Savings rate"
          icon={Coins}
          value={savingsRateVal}
          hint={savingsRateHint}
          accent="sage"
        />
      </Reveal>

      {/* Loading State */}
      {status === 'loading' && (
        <Reveal className="mt-8 flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary mb-3" />
          <p className="text-sm font-medium text-ink">Generating report metrics…</p>
          <p className="text-xs text-muted-foreground mt-1">
            Aggregating income, expenses, and category allocations for the selected period
          </p>
        </Reveal>
      )}

      {/* Error State */}
      {status === 'error' && period !== 'custom' && (
        <Reveal className="mt-6">
          <Card className="border-destructive/30 bg-destructive/10">
            <CardContent className="flex flex-col items-center justify-center p-6 text-center">
              <AlertCircle className="size-8 text-destructive mb-2" />
              <p className="text-sm font-medium text-destructive">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={reload}
              >
                <RefreshCw className="size-3.5" />
                Try again
              </Button>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {/* Idle Prompt for Custom Date Range */}
      {status === 'idle' && period === 'custom' && (
        <Reveal className="mt-6">
          <Card className="border-dashed border-border/80 bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <FileSpreadsheet className="size-8 text-forest/40 mb-2" />
              <p className="text-sm font-semibold text-ink">Custom Date Range Selected</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Choose both start and end dates above and click &quot;Apply Range&quot; to inspect financial metrics and export reports.
              </p>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {/* Main Report Content */}
      {status === 'success' && summary && (
        <Reveal className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Export Action Cards (1 col) */}
          <div className="lg:col-span-1 space-y-4 min-w-0">
            {/* CSV Ledger Card */}
            <Card className="shadow-card">
              <CardHeader className="flex-col items-start gap-2 pb-3">
                <div className="flex items-center gap-2 text-forest">
                  <FileSpreadsheet className="size-4 shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-forest-soft">
                    Spreadsheet
                  </span>
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-ink">
                    Transaction Ledger (CSV)
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs text-muted-foreground">
                    Complete tabular export with date, description, category, type, and amount.
                    Sanitized against formula injection.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 text-xs h-9 justify-center"
                  onClick={() => void downloadCsv()}
                  disabled={isDownloadingCsv || isDownloadingPdf}
                >
                  {isDownloadingCsv ? (
                    <Loader2 className="size-3.5 animate-spin text-forest" />
                  ) : (
                    <FileSpreadsheet className="size-3.5 text-forest" />
                  )}
                  <span>{isDownloadingCsv ? 'Generating CSV…' : 'Download Ledger CSV'}</span>
                </Button>
              </CardContent>
            </Card>

            {/* PDF Summary Card */}
            <Card className="shadow-card">
              <CardHeader className="flex-col items-start gap-2 pb-3">
                <div className="flex items-center gap-2 text-forest">
                  <FileText className="size-4 shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-forest-soft">
                    Executive Document
                  </span>
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-ink">
                    Financial Summary (PDF)
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs text-muted-foreground">
                    Official PDF report styled in SpendWise branding featuring executive KPIs, savings
                    rate, and category breakdown.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  type="button"
                  className="w-full gap-2 text-xs h-9 justify-center"
                  onClick={() => void downloadPdf()}
                  disabled={isDownloadingPdf || isDownloadingCsv}
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileText className="size-3.5" />
                  )}
                  <span>{isDownloadingPdf ? 'Generating PDF…' : 'Download Summary PDF'}</span>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Category-Wise Spending Breakdown (2 cols) */}
          <div className="lg:col-span-2 min-w-0">
            <Card className="shadow-card">
              <CardHeader className="flex-col items-start gap-1.5 pb-3 border-b border-border/60">
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2 text-forest">
                    <Coins className="size-4 shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-forest-soft">
                      Breakdown
                    </span>
                  </div>
                  <Badge tone="neutral" className="text-[11px]">
                    {summary.categories.length}{' '}
                    {summary.categories.length === 1 ? 'Category' : 'Categories'}
                  </Badge>
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-ink">
                    Category-Wise Spending
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs text-muted-foreground">
                    Spending allocations across categories sorted by total amount.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-5">
                {summary.categories.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <p className="text-sm font-medium text-ink">No category spending recorded</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      No expense transactions were recorded for the selected period.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {summary.categories.map((cat) => (
                      <div
                        key={cat.category}
                        className="rounded-lg border border-border/60 bg-card p-3 text-xs transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-ink truncate" title={cat.category}>
                              {cat.category}
                            </span>
                            <Badge tone="neutral" className="text-[10px] shrink-0">
                              {cat.transaction_count} txs
                            </Badge>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-semibold text-ink text-sm tabular">
                              ₹{formatAmount(cat.amount)}
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar & Percentage */}
                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-1.5 flex-1 rounded-full bg-paper-deep overflow-hidden">
                            <div
                              className="h-full rounded-full bg-forest transition-all duration-300"
                              style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                              role="progressbar"
                              aria-valuenow={cat.percentage}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${cat.category} percentage of expenses`}
                            />
                          </div>
                          <span className="text-[11px] font-medium text-muted-foreground tabular w-10 text-right">
                            {cat.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </Reveal>
      )}
    </AnimatedPage>
  )
}

