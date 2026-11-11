/** Display helpers. Amounts arrive from the API as decimal strings (e.g. "1250.50"). */

const amountFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Format a decimal string or number for display; returns the raw value if it is not numeric. */
export function formatAmount(value: string | number): string {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? amountFormatter.format(parsed) : String(value)
}

/** Format an ISO date (YYYY-MM-DD) without timezone shifting. */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Normalizes a prediction confidence score (decimal 0–1 or percentage 0–100)
 * into a percentage on [0, 100], or null for missing, invalid, or non-finite inputs.
 */
function normalizeConfidencePercent(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'string' && val.trim() === '') return null
  const num = typeof val === 'number' ? val : Number(val)
  if (!Number.isFinite(num) || num < 0 || num > 100) return null
  return num <= 1 ? num * 100 : num
}

/**
 * Formats a validated confidence score for display (e.g. "20%", "59.9%", "60%").
 * Prevents values strictly below 60% from rounding up to "60%", and returns null
 * for missing, invalid, non-positive, or non-finite values.
 */
export function formatConfidenceLabel(val: string | number | null | undefined): string | null {
  const pct = normalizeConfidencePercent(val)
  if (pct === null || pct <= 0) return null
  if (pct < 60 && Math.round(pct) >= 60) {
    const flooredTenth = Math.floor(pct * 10) / 10
    return `${flooredTenth.toFixed(1)}%`
  }
  return `${Math.round(pct)}%`
}

/**
 * Strict confidence check for one-click AI suggestion confirmation.
 * Enforces minimum 60% confidence threshold (0.60 decimal or 60 percentage).
 */
export function isHighConfidencePrediction(val: string | number | null | undefined): boolean {
  const pct = normalizeConfidencePercent(val)
  return pct !== null && pct >= 60
}

