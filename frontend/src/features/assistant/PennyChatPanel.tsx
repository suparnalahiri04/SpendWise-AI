import { AlertCircle, Loader2, Maximize2, RefreshCw, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  type ComponentProps,
} from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AssistantChatInput } from './AssistantChatInput'
import { AssistantMessageItem } from './AssistantMessageItem'
import { useAssistantContext } from './AssistantProvider'
import { PennyMascot } from './PennyMascot'
import { StarterPromptsView } from './StarterPromptsView'

export interface PennyChatPanelProps extends ComponentProps<'div'> {
  /** Controls open/closed visibility of the floating panel. */
  open: boolean
  /** Callback fired when user closes the panel via button or Escape key. */
  onClose: () => void
  /** Optional callback fired when user activates the full-page assistant action. */
  onOpenFullPage?: () => void
}

/**
 * Floating chat panel for Penny — Your Personal Money Companion.
 *
 * Stage 3 implementation:
 * - Consumes shared assistant state via `useAssistantContext()`.
 * - Reuses existing assistant message rendering, Markdown parsing, and fact breakdowns.
 * - Supports starter prompts in compact empty state.
 * - Manages smart auto-scrolling (preserves user's scroll position when reading older messages).
 * - Implements unique textarea input ID (`penny-chat-input`) to avoid DOM ID collisions.
 * - Fully accessible with dialog semantics, close button, focus handling, and Escape-to-close.
 * - Responsive: docked compact panel on desktop/tablet, near-full-screen on mobile viewports.
 */
export function PennyChatPanel({
  open,
  onClose,
  onOpenFullPage,
  className,
  ...props
}: PennyChatPanelProps) {
  const {
    messages,
    starterPrompts,
    promptsLoading,
    promptsError,
    status,
    isSubmitting,
    error,
    lastFailedQuery,
    submitQuery,
    retryLastQuery,
    reloadPrompts,
    selectedMonth,
  } = useAssistantContext()

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const isNearBottomRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Track whether user is near the bottom of scroll history
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distanceToBottom <= 80
  }, [])

  // Smart auto-scroll: only scroll to bottom if user is already near the bottom
  useEffect(() => {
    if (!open || (messages.length === 0 && !isSubmitting)) return
    const el = scrollContainerRef.current
    if (!el) return

    if (isNearBottomRef.current) {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

      el.scrollTo({
        top: el.scrollHeight,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
    }
  }, [messages.length, isSubmitting, open])

  // Initial focus on open: autofocus input if available and enabled
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [open])

  // Escape key handler: close panel and prevent propagation
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const handleSendMessage = useCallback(
    (text: string) => {
      submitQuery(text, selectedMonth)
    },
    [submitQuery, selectedMonth],
  )

  const handleSelectPrompt = useCallback(
    (promptText: string) => {
      submitQuery(promptText, selectedMonth)
    },
    [submitQuery, selectedMonth],
  )

  if (!open) {
    return null
  }

  return (
    <div
      role="dialog"
      id="penny-chat-panel"
      aria-labelledby="penny-chat-title"
      aria-describedby="penny-chat-description"
      className={cn(
        'fixed z-40 flex flex-col bg-card border border-border shadow-popover overflow-hidden',
        // Mobile layout (<640px): full screen with safe-area padding
        'inset-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]',
        // Tablet layout (640px - 1023px): anchored floating panel
        'sm:inset-auto sm:right-6 sm:bottom-24 sm:w-[380px] sm:h-[min(580px,calc(100dvh-7.5rem))] sm:rounded-2xl',
        // Desktop layout (>=1024px): 400px wide panel above launcher
        'lg:right-8 lg:bottom-26 lg:w-[400px] lg:h-[min(600px,calc(100dvh-8.5rem))]',
        className,
      )}
      {...props}
    >
      {/* Header: Mascot, Title, Subtitle, Close Button */}
      <header className="flex items-center justify-between gap-3 border-b border-border/80 bg-forest px-4 py-3 text-paper shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-paper/10 border border-paper/20">
            <PennyMascot size="sm" decorative />
          </div>
          <div className="min-w-0">
            <h2
              id="penny-chat-title"
              className="truncate font-display text-base font-semibold text-paper leading-tight"
            >
              Penny
            </h2>
            <p
              id="penny-chat-description"
              className="truncate text-[0.6875rem] text-paper/80 leading-normal"
            >
              Your Personal Money Companion
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenFullPage}
            aria-label="Open full-page assistant"
            title="Open full-page assistant"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-paper/80 transition-colors hover:bg-forest-soft hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
          >
            <Maximize2 className="size-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Penny chat"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-paper/80 transition-colors hover:bg-forest-soft hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Conversation Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Penny conversation history"
        aria-live="polite"
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <StarterPromptsView
              compact
              prompts={starterPrompts}
              loading={promptsLoading}
              error={promptsError}
              onReload={reloadPrompts}
              onSelectPrompt={handleSelectPrompt}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <AssistantMessageItem
                key={msg.id}
                message={msg}
                compact
                onSelectPrompt={handleSelectPrompt}
              />
            ))}

            {/* In-flight loading indicator */}
            {isSubmitting && (
              <div className="flex justify-start">
                <div className="flex max-w-[95%] gap-2.5">
                  <div
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-forest text-paper shadow-subtle"
                    aria-hidden="true"
                  >
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 shadow-card">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-block size-1.5 rounded-full bg-forest animate-pulse" />
                      <span>Calculating facts from your ledger…</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error banner with retry action */}
        {status === 'error' && error && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
            {lastFailedQuery && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={retryLastQuery}
                disabled={isSubmitting}
                className="self-start h-7 border-destructive/30 text-destructive hover:bg-destructive/10 gap-1 px-2.5 text-xs"
              >
                <RefreshCw className="size-3" aria-hidden="true" />
                <span>Retry Question</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <footer className="border-t border-border/70 bg-card p-3 shrink-0">
        <AssistantChatInput
          inputId="penny-chat-input"
          label="Ask Penny a question"
          inputRef={inputRef}
          onSendMessage={handleSendMessage}
          disabled={isSubmitting}
          placeholder="Ask Penny about your expenses or budgets…"
        />
      </footer>
    </div>
  )
}
