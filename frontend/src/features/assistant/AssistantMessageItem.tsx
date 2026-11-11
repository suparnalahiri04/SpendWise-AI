import { BotMessageSquare } from 'lucide-react'
import type { AssistantChatMessage } from '@/features/assistant/useAssistant'
import { AssistantFactBreakdown } from './AssistantFactBreakdown'
import { SafeMarkdown } from './SafeMarkdown'

interface AssistantMessageItemProps {
  message: AssistantChatMessage
  onSelectPrompt?: (prompt: string) => void
  compact?: boolean
}

/** Format an ISO timestamp string into human-readable 12-hour time. */
function formatMessageTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * Renders an individual chat message in the conversation stream.
 */
export function AssistantMessageItem({
  message,
  onSelectPrompt,
  compact = false,
}: AssistantMessageItemProps) {
  const isUser = message.role === 'user'
  const timeFormatted = formatMessageTime(message.timestamp)

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end sm:max-w-[75%]">
          <div className="flex items-center gap-1.5 pb-1 text-[0.6875rem] text-muted-foreground">
            <span>You</span>
            {timeFormatted && <span>• {timeFormatted}</span>}
          </div>
          <div className="rounded-2xl rounded-tr-sm bg-forest px-4 py-3 text-sm text-paper shadow-subtle">
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[95%] gap-3 sm:max-w-[85%]">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-forest text-paper shadow-subtle"
          aria-hidden="true"
        >
          <BotMessageSquare className="size-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 pb-1 text-[0.6875rem] text-muted-foreground">
            <span className="font-semibold text-ink">SpendWise AI</span>
            {timeFormatted && <span>• {timeFormatted}</span>}
          </div>

          <div className="rounded-2xl rounded-tl-sm border border-border bg-card p-4 sm:p-5 shadow-card">
            {/* Answer Content */}
            <SafeMarkdown content={message.content} />

            {/* Fact and Estimate Breakdown */}
            {message.response && (
              <AssistantFactBreakdown
                response={message.response}
                onSelectPrompt={onSelectPrompt}
                compact={compact}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
