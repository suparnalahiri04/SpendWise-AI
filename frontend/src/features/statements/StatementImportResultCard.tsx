import { ArrowRight, CheckCircle2, RotateCcw, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { StatementImportResult } from '@/lib/api/types'

interface StatementImportResultCardProps {
  result: StatementImportResult
  onReset: () => void
}

export function StatementImportResultCard({ result, onReset }: StatementImportResultCardProps) {
  const hasSkipped = result.rejected_rows > 0
  const isFullySuccessful = !hasSkipped && result.imported_rows > 0

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-col items-center text-center gap-3">
        <span
          className={
            isFullySuccessful
              ? 'flex size-14 items-center justify-center rounded-2xl bg-sage text-forest'
              : 'flex size-14 items-center justify-center rounded-2xl bg-butter/60 text-[#a06b1e]'
          }
          aria-hidden="true"
        >
          {isFullySuccessful ? (
            <CheckCircle2 className="size-7" />
          ) : (
            <TriangleAlert className="size-7" />
          )}
        </span>

        <div>
          <div className="flex items-center justify-center gap-2">
            <h3 className="font-display text-xl sm:text-2xl text-ink">
              {isFullySuccessful ? 'Statement Imported Successfully' : 'Statement Import Completed'}
            </h3>
            <Badge tone={isFullySuccessful ? 'sage' : 'butter'}>
              {isFullySuccessful ? 'Completed' : 'With skipped rows'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Processed file <strong className="text-ink">{result.filename}</strong> (Import #{result.import_id})
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col items-center justify-center rounded-xl bg-paper p-4 text-center">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Total Rows</span>
          <span className="mt-1 text-2xl font-bold text-ink">{result.total_rows}</span>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl bg-sage/30 p-4 text-center">
          <span className="text-xs uppercase tracking-wider text-forest font-semibold">Imported</span>
          <span className="mt-1 text-2xl font-bold text-forest">{result.imported_rows}</span>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl bg-paper p-4 text-center">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Skipped / Duplicates</span>
          <span className="mt-1 text-2xl font-bold text-[#8a3f29]">{result.rejected_rows}</span>
        </div>
      </div>

      {hasSkipped && (
        <div className="rounded-xl border border-butter/60 bg-butter/15 p-4 text-xs text-ink/80">
          <p className="font-semibold text-ink">Why were some rows skipped?</p>
          <p className="mt-1">
            Rows are skipped if they failed date/amount validation, or if they matched existing transactions already saved in your ledger (duplicate protection).
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          className="w-full sm:w-auto gap-2"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          <span>Import another statement</span>
        </Button>

        <Button asChild className="w-full sm:w-auto gap-2">
          <Link to="/transactions">
            <span>View ledger</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

