import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { StatementPreviewResponse } from '@/lib/api/types'
import { formatAmount, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

interface StatementPreviewTableProps {
  preview: StatementPreviewResponse
  isImporting: boolean
  importError: string | null
  onConfirmImport: () => void
  onCancel: () => void
}

export function StatementPreviewTable({
  preview,
  isImporting,
  importError,
  onConfirmImport,
  onCancel,
}: StatementPreviewTableProps) {
  const hasValidRows = preview.valid_rows > 0
  const hasErrors = preview.invalid_rows > 0

  return (
    <div className="flex flex-col gap-5">
      {/* File summary & stats */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-forest"
              aria-hidden="true"
            >
              <FileSpreadsheet className="size-5" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-ink text-base" title={preview.filename}>
                {preview.filename}
              </h3>
              <p className="text-xs text-muted-foreground">Statement validation preview</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg bg-paper px-3 py-1.5 text-xs font-medium text-ink">
              Total: <span className="font-semibold">{preview.total_rows}</span>
            </div>
            <div className="rounded-lg bg-sage/50 px-3 py-1.5 text-xs font-semibold text-forest">
              Valid: <span>{preview.valid_rows}</span>
            </div>
            {hasErrors && (
              <div className="rounded-lg bg-terracotta/20 px-3 py-1.5 text-xs font-semibold text-[#8a3f29]">
                Issues: <span>{preview.invalid_rows}</span>
              </div>
            )}
          </div>
        </div>

        {/* Informational banners */}
        {importError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-terracotta/40 bg-terracotta/10 px-3.5 py-3 text-sm text-[#8a3f29]"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-terracotta" aria-hidden="true" />
            <span>{importError}</span>
          </div>
        )}

        {hasErrors && hasValidRows && (
          <div className="flex items-start gap-2 rounded-xl border border-butter/60 bg-butter/20 px-3.5 py-2.5 text-xs text-ink/80">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#a06b1e]" aria-hidden="true" />
            <span>
              <strong>{preview.invalid_rows} row{preview.invalid_rows > 1 ? 's' : ''}</strong> failed validation and will be skipped. Only the <strong>{preview.valid_rows} valid row{preview.valid_rows > 1 ? 's' : ''}</strong> will be imported.
            </span>
          </div>
        )}

        {!hasValidRows && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-terracotta/40 bg-terracotta/10 px-3.5 py-2.5 text-xs text-[#8a3f29]"
          >
            <XCircle className="mt-0.5 size-4 shrink-0 text-terracotta" aria-hidden="true" />
            <span>
              None of the rows in this statement passed validation. Please review the errors below and upload a corrected file.
            </span>
          </div>
        )}
      </div>

      {/* Rows Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <caption className="sr-only">Statement rows preview</caption>
            <thead className="sticky top-0 z-10 border-b border-border bg-paper/95 backdrop-blur-xs">
              <tr>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-14">
                  Row
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Category
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                  Amount
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Validation Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {preview.preview.map((row) => (
                <tr
                  key={row.row_number}
                  className={cn(
                    'transition-colors',
                    row.is_valid ? 'hover:bg-paper/40' : 'bg-terracotta/5 hover:bg-terracotta/10',
                  )}
                >
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                    #{row.row_number}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {row.transaction_date ? formatDate(row.transaction_date) : '—'}
                  </td>
                  <td className="max-w-xs px-4 py-3 font-medium text-ink">
                    <span className="block truncate" title={row.description || undefined}>
                      {row.description || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="sage">{row.category || 'Other'}</Badge>
                  </td>
                  <td
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-right font-semibold',
                      row.transaction_type === 'income' ? 'text-forest' : 'text-ink',
                    )}
                  >
                    {row.amount !== null && row.amount !== undefined ? (
                      <span className="inline-flex items-center gap-0.5 justify-end">
                        {row.transaction_type === 'income' ? (
                          <ArrowUpRight className="size-3.5 text-forest" aria-hidden="true" />
                        ) : (
                          <ArrowDownRight className="size-3.5 text-[#9a4a33]" aria-hidden="true" />
                        )}
                        ₹{formatAmount(String(row.amount))}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.is_valid ? (
                      <Badge tone="sage" className="gap-1">
                        <CheckCircle2 className="size-3 text-forest" aria-hidden="true" />
                        <span>Valid</span>
                      </Badge>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <Badge tone="terracotta" className="gap-1 self-start">
                          <XCircle className="size-3 text-terracotta" aria-hidden="true" />
                          <span>Invalid</span>
                        </Badge>
                        {row.errors.length > 0 && (
                          <span className="text-xs text-[#8a3f29]">
                            {row.errors.join('; ')}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action footer */}
        <div className="flex flex-col-reverse gap-3 border-t border-border bg-paper/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={isImporting}
            onClick={onCancel}
          >
            Upload different file
          </Button>

          <Button
            type="button"
            disabled={!hasValidRows || isImporting}
            onClick={onConfirmImport}
            className="gap-2"
          >
            {isImporting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Importing {preview.valid_rows} transactions…</span>
              </>
            ) : (
              <span>Import {preview.valid_rows} Transaction{preview.valid_rows !== 1 ? 's' : ''}</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

