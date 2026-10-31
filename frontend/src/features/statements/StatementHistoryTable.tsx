import { CloudOff, FileSpreadsheet, FileText, Loader2, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { StatementHistoryState } from './useStatementHistory'

interface StatementHistoryTableProps {
  historyState: StatementHistoryState
  onReload: () => void
}

function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (Number.isNaN(d.getTime())) return isoString
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

export function StatementHistoryTable({ historyState, onReload }: StatementHistoryTableProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Imported statements</CardTitle>
          <CardDescription>A history of every file you have imported.</CardDescription>
        </div>
        {historyState.status === 'success' && historyState.items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReload}
            aria-label="Refresh statement history"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-ink"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {historyState.status === 'loading' && (
          <div
            role="status"
            className="flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground"
          >
            <Loader2 className="size-5 animate-spin text-forest" aria-hidden="true" />
            Loading statement history…
          </div>
        )}

        {historyState.status === 'error' && (
          <EmptyState
            icon={CloudOff}
            title="We couldn't load your statement history"
            description={historyState.message}
            action={
              <Button variant="secondary" onClick={onReload}>
                Try again
              </Button>
            }
          />
        )}

        {historyState.status === 'success' && historyState.items.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No statements imported"
            description="Imported statements will be listed here with their date, row count, and status."
          />
        )}

        {historyState.status === 'success' && historyState.items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">Past statement imports</caption>
              <thead className="border-b border-border bg-paper/60">
                <tr>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    File Name
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Imported At
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
                    Total
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
                    Imported
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
                    Skipped
                  </th>
                  <th scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {historyState.items.map((item) => (
                  <tr key={item.id} className="hover:bg-paper/40 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-ink">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="size-4 shrink-0 text-forest-soft" aria-hidden="true" />
                        <span className="truncate max-w-xs" title={item.filename}>
                          {item.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs text-muted-foreground">
                      {formatTimestamp(item.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-center text-xs font-medium text-ink">
                      {item.rows_total}
                    </td>
                    <td className="px-5 py-3.5 text-center text-xs font-semibold text-forest">
                      {item.rows_imported}
                    </td>
                    <td className="px-5 py-3.5 text-center text-xs font-medium text-[#8a3f29]">
                      {item.rows_rejected}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {item.status === 'completed' && (
                        <Badge tone="sage">Completed</Badge>
                      )}
                      {item.status === 'completed_with_errors' && (
                        <Badge tone="butter">With skipped</Badge>
                      )}
                      {item.status === 'processing' && (
                        <Badge tone="butter">Processing</Badge>
                      )}
                      {item.status !== 'completed' &&
                        item.status !== 'completed_with_errors' &&
                        item.status !== 'processing' && (
                          <Badge tone="terracotta">{item.status}</Badge>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

