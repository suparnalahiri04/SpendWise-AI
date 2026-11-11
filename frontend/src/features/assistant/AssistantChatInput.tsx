import { Loader2, SendHorizontal } from 'lucide-react'
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { Button } from '@/components/ui/button'

export interface AssistantChatInputProps {
  onSendMessage: (queryText: string) => void
  disabled?: boolean
  placeholder?: string
  inputId?: string
  inputRef?: Ref<HTMLTextAreaElement>
  label?: string
}

export function AssistantChatInput({
  onSendMessage,
  disabled = false,
  placeholder = 'Ask a question about your expenses, budgets, or recurring bills…',
  inputId = 'assistant-input',
  inputRef,
  label = 'Ask SpendWise AI a question',
}: AssistantChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const setMergedTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node
      if (typeof inputRef === 'function') {
        inputRef(node)
      } else if (inputRef && typeof inputRef === 'object') {
        ;(inputRef as { current: HTMLTextAreaElement | null }).current = node
      }
    },
    [inputRef],
  )

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return

    onSendMessage(trimmed)
    setValue('')

    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
  }, [value, disabled, onSendMessage])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Return early if composing text with an Input Method Editor (IME)
    if (e.nativeEvent?.isComposing || (e as unknown as { isComposing?: boolean }).isComposing || e.keyCode === 229) {
      return
    }

    // Send on Enter (unless Shift is held)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)

    // Adjust height up to maximum
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card p-2 shadow-subtle focus-within:border-forest/50 focus-within:ring-2 focus-within:ring-forest/20">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <textarea
        id={inputId}
        ref={setMergedTextareaRef}
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        maxLength={1000}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        style={{ minHeight: '44px', maxHeight: '160px' }}
      />

      <div className="flex items-center justify-between border-t border-border/40 px-3 pt-2 pb-1 text-xs text-muted-foreground">
        <span className="hidden sm:inline text-[0.6875rem]">
          Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[0.625rem]">Enter</kbd> to
          send, <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[0.625rem]">Shift+Enter</kbd> for new line
        </span>
        <span className="sm:hidden" />

        <Button
          type="button"
          size="sm"
          disabled={!value.trim() || disabled}
          onClick={handleSend}
          aria-label="Send message"
          className="h-8 gap-1.5 px-3 text-xs"
        >
          {disabled ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              <span>Calculating…</span>
            </>
          ) : (
            <>
              <span>Send</span>
              <SendHorizontal className="size-3.5" aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

