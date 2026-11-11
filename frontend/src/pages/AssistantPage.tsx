import {
  AlertCircle,
  Loader2,
  PlusCircle,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { PageIntro } from '@/components/common/PageIntro'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Button } from '@/components/ui/button'
import { AssistantChatInput } from '@/features/assistant/AssistantChatInput'
import { AssistantMessageItem } from '@/features/assistant/AssistantMessageItem'
import { useAssistantContext } from '@/features/assistant/AssistantProvider'
import { StarterPromptsView } from '@/features/assistant/StarterPromptsView'
import { MonthSelector } from '@/features/budgets/MonthSelector'

export function AssistantPage() {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    selectedMonth,
    setSelectedMonth,
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
    clearMessages,
    reloadPrompts,
  } = useAssistantContext()

  // Auto-scroll to bottom when messages or loading state changes
  useEffect(() => {
    if (messages.length > 0 || isSubmitting) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, isSubmitting])

  const handleSendMessage = (text: string) => {
    submitQuery(text, selectedMonth)
  }

  const handleSelectPrompt = (promptText: string) => {
    submitQuery(promptText, selectedMonth)
  }

  return (
    <AnimatedPage className="space-y-6">
      {/* Editorial page heading with reporting month selector and New Conversation action */}
      <PageIntro
        eyebrow="AI Money Assistant"
        title="Financial Intelligence"
        description="Ask questions about your income, spending, category limits, and scheduled bills. All facts are calculated directly from your ledger."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MonthSelector
              month={selectedMonth}
              onChange={setSelectedMonth}
            />
            {messages.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearMessages}
                disabled={isSubmitting}
                className="gap-1.5"
                aria-label="Start new conversation"
              >
                <PlusCircle className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">New Conversation</span>
                <span className="sm:hidden">Reset</span>
              </Button>
            )}
          </div>
        }
      />

      <Reveal className="space-y-4">
        {/* Main Conversation Stream or Welcoming Empty State */}
        <div className="flex flex-col rounded-2xl border border-border bg-card/60 p-4 sm:p-6 shadow-subtle min-h-[460px]">
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <StarterPromptsView
                prompts={starterPrompts}
                loading={promptsLoading}
                error={promptsError}
                onReload={reloadPrompts}
                onSelectPrompt={handleSelectPrompt}
              />
            </div>
          ) : (
            <div
              className="flex-1 space-y-4 overflow-y-auto pb-4"
              role="log"
              aria-label="Assistant conversation history"
              aria-live="polite"
            >
              {messages.map((msg) => (
                <AssistantMessageItem
                  key={msg.id}
                  message={msg}
                  onSelectPrompt={handleSelectPrompt}
                />
              ))}

              {/* In-flight response indicator */}
              {isSubmitting && (
                <div className="flex justify-start">
                  <div className="flex max-w-[95%] gap-3 sm:max-w-[85%]">
                    <div
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-forest text-paper shadow-subtle"
                      aria-hidden="true"
                    >
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 shadow-card">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-block size-2 rounded-full bg-forest animate-pulse" />
                        <span>Calculating facts from your ledger…</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} aria-hidden="true" />
            </div>
          )}

          {/* Failure feedback with retry action */}
          {status === 'error' && error && (
            <div
              className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive"
              role="alert"
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
                  className="h-7 border-destructive/30 text-destructive hover:bg-destructive/10 gap-1 px-2.5 text-xs"
                >
                  <RefreshCw className="size-3" aria-hidden="true" />
                  <span>Retry Question</span>
                </Button>
              )}
            </div>
          )}

          {/* Chat Message Input */}
          <div className="mt-4 pt-3 border-t border-border/60">
            <AssistantChatInput
              onSendMessage={handleSendMessage}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </Reveal>
    </AnimatedPage>
  )
}
