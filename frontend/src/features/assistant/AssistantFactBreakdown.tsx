import {
  Calculator,
  CheckCircle2,
  ChevronRight,
  Info,
  Lightbulb,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AssistantQueryResponse } from '@/lib/api/types'
import { cn } from '@/lib/utils'

interface AssistantFactBreakdownProps {
  response: AssistantQueryResponse
  onSelectPrompt?: (prompt: string) => void
  compact?: boolean
}

/**
 * Displays structured facts, estimates, recommendations, data limitations,
 * and suggested follow-ups returned by the AI Money Assistant.
 *
 * Strictly distinguishes database-verified facts from projections and recommendations.
 */
export function AssistantFactBreakdown({
  response,
  onSelectPrompt,
  compact = false,
}: AssistantFactBreakdownProps) {
  const { facts, estimates, recommendations, data_limitations, suggested_followups } = response

  const hasStructuredData =
    facts.length > 0 ||
    estimates.length > 0 ||
    recommendations.length > 0 ||
    data_limitations.length > 0 ||
    suggested_followups.length > 0

  if (!hasStructuredData) {
    return null
  }

  return (
    <div
      data-compact={compact ? 'true' : undefined}
      className="mt-4 space-y-4 border-t border-border/70 pt-4 text-xs text-muted-foreground"
    >
      {/* 1. Verified Facts */}
      {facts.length > 0 && (
        <section aria-label="Verified Facts" className="space-y-2">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <CheckCircle2 className="size-3.5 text-forest" aria-hidden="true" />
            <h4 className="text-xs font-semibold text-ink">Verified Facts</h4>
            {' '}
            <Badge tone="sage" className="text-[0.6875rem]">
              Ground Truth
            </Badge>
          </div>
          <div
            data-slot="verified-facts-grid"
            className={cn('grid gap-2', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}
          >
            {facts.map((item, idx) => (
              <div
                key={`fact-${idx}-${item.metric_key}`}
                className="flex items-start justify-between rounded-lg border border-border/60 bg-card/80 p-2.5 gap-2"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="font-medium text-ink leading-snug">{item.label}</div>
                  {' '}
                  {item.notes && (
                    <div className="text-[0.6875rem] text-muted-foreground leading-normal">
                      {item.notes}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-semibold text-forest tabular">
                    {item.value_formatted}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. Estimates & Projections */}
      {estimates.length > 0 && (
        <section aria-label="Estimates and Projections" className="space-y-2">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <Calculator className="size-3.5 text-terracotta" aria-hidden="true" />
            <h4 className="text-xs font-semibold text-ink">Estimates & Projections</h4>
            {' '}
            <Badge tone="butter" className="text-[0.6875rem]">
              Estimated
            </Badge>
          </div>
          <div
            data-slot="estimates-grid"
            className={cn('grid gap-2', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}
          >
            {estimates.map((item, idx) => (
              <div
                key={`est-${idx}-${item.metric_key}`}
                className="flex items-start justify-between rounded-lg border border-butter/30 bg-butter/15 p-2.5 gap-2"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="font-medium text-ink leading-snug">{item.label}</div>
                  {' '}
                  {item.notes && (
                    <div className="text-[0.6875rem] text-muted-foreground leading-normal">
                      {item.notes}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-semibold text-ink tabular">
                    {item.value_formatted}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Recommendations */}
      {recommendations.length > 0 && (
        <section aria-label="Recommendations" className="space-y-2">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <Lightbulb className="size-3.5 text-forest-soft" aria-hidden="true" />
            <h4 className="text-xs font-semibold text-ink">Recommendations</h4>
          </div>
          <div className="space-y-1.5">
            {recommendations.map((item, idx) => (
              <div
                key={`rec-${idx}-${item.metric_key}`}
                className="rounded-lg border border-sage/60 bg-sage/40 p-2.5 leading-relaxed"
              >
                <span className="font-medium text-ink">{item.label}:</span>
                {' '}
                <span className="text-muted-foreground">
                  {item.notes || item.value_formatted}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Data limitations & Caveats */}
      {data_limitations.length > 0 && (
        <section aria-label="Data Limitations" className="space-y-1.5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="size-3.5" aria-hidden="true" />
            <h4 className="text-xs font-semibold text-ink">Data Notes</h4>
          </div>
          <ul className="list-disc space-y-1 pl-4 text-[0.6875rem] text-muted-foreground leading-relaxed">
            {data_limitations.map((lim, idx) => (
              <li key={`lim-${idx}`}>{lim}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 5. Suggested Follow-ups */}
      {suggested_followups.length > 0 && onSelectPrompt && (
        <section aria-label="Suggested Follow-ups" className="space-y-2 pt-1">
          <h4 className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
            Suggested Follow-ups
          </h4>
          <div className="flex flex-wrap gap-2">
            {suggested_followups.map((followup, idx) => (
              <button
                key={`followup-${idx}`}
                type="button"
                onClick={() => onSelectPrompt(followup)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-ink transition-colors hover:border-forest hover:bg-paper-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
              >
                <span>{followup}</span>
                <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
