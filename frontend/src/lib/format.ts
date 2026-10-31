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

