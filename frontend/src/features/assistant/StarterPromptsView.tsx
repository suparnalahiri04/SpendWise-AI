import {
  AlertCircle,
  ArrowRight,
  BotMessageSquare,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { StarterPromptItem } from '@/lib/api/types'
import { cn } from '@/lib/utils'

interface StarterPromptsViewProps {
  prompts: StarterPromptItem[]
  loading: boolean
  error: string | null
  onReload: () => void
  onSelectPrompt: (promptText: string) => void
  compact?: boolean
}

/**
 * Welcoming empty state for the AI Money Assistant displaying
 * capabilities, guidelines, and starter suggestions.
 */
export function StarterPromptsView({
  prompts,
  loading,
  error,
  onReload,
  onSelectPrompt,
  compact = false,
}: StarterPromptsViewProps) {
  return (
    <div
      data-compact={compact ? 'true' : undefined}
      className={cn(
        'mx-auto max-w-3xl text-center',
        compact ? 'space-y-4 py-3' : 'space-y-6 py-6 sm:py-10',
      )}
    >
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex items-center justify-center rounded-2xl bg-sage/70 text-forest shadow-subtle',
            compact ? 'size-12' : 'size-14',
          )}
        >
          <BotMessageSquare className={compact ? 'size-6' : 'size-7'} aria-hidden="true" />
        </div>
        <h3
          className={cn(
            'font-display text-ink',
            compact ? 'mt-3 text-xl' : 'mt-4 text-2xl sm:text-3xl',
          )}
        >
          How can I help you today?
        </h3>
        <p
          className={cn(
            'max-w-lg text-muted-foreground leading-relaxed',
            compact ? 'mt-1.5 text-xs' : 'mt-2 text-sm',
          )}
        >
          Ask questions about your real expenses, category spending, monthly budgets, and upcoming
          recurring payments. Every figure is calculated directly from your records.
        </p>
      </div>

      {/* Starter Prompts Section */}
      <div className="pt-2">
        <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="size-3.5 text-forest" aria-hidden="true" />
          <span>Suggested Questions</span>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-forest" aria-hidden="true" />
            <span>Loading suggestions…</span>
          </div>
        )}

        {/* Error state with retry */}
        {!loading && error && (
          <div className="mx-auto max-w-md rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <span>Could not load starter prompts</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReload}
              className="mt-3 gap-1.5"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              <span>Retry loading prompts</span>
            </Button>
          </div>
        )}

        {/* Loaded prompts */}
        {!loading && !error && prompts.length > 0 && (
          <div
            data-slot="starter-prompts-grid"
            className={cn(
              'grid text-left',
              compact ? 'grid-cols-1 gap-2' : 'gap-2.5 sm:grid-cols-2',
            )}
          >
            {prompts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectPrompt(item.prompt)}
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-3.5 text-left shadow-subtle transition-all duration-150 hover:-translate-y-0.5 hover:border-forest/40 hover:bg-paper-deep/70 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
              >
                <div className="flex items-center justify-between pb-2">
                  <Badge tone="sage" className="text-[0.6875rem]">
                    {item.category}
                  </Badge>
                  <ArrowRight
                    className="size-3.5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-forest"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm font-medium text-ink leading-snug">{item.prompt}</p>
              </button>
            ))}
          </div>
        )}

        {/* Empty list fallback */}
        {!loading && !error && prompts.length === 0 && (
          <p className="py-4 text-xs text-muted-foreground">
            Type any question below to begin your conversation.
          </p>
        )}
      </div>
    </div>
  )
}

