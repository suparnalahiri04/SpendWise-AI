import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getCurrentMonthString } from '@/features/budgets/budgetUtils'
import { useAssistant, type AssistantHookResult } from './useAssistant'

export interface AssistantContextValue extends AssistantHookResult {
  selectedMonth: string
  setSelectedMonth: (month: string) => void
}

export const AssistantContext = createContext<AssistantContextValue | null>(null)

export interface AssistantProviderProps {
  children: ReactNode
  /** Optional initial YYYY-MM month override; defaults to current calendar month. */
  initialMonth?: string
}

/**
 * Single authenticated state owner for the SpendWise AI Money Assistant.
 *
 * Calls `useAssistant(selectedMonth)` exactly once for the authenticated session so
 * the full-page `AssistantPage` and the floating Penny assistant share the same
 * conversation history, selected month, starter prompts, and in-flight lifecycle.
 */
export function AssistantProvider({
  children,
  initialMonth,
}: AssistantProviderProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => initialMonth ?? getCurrentMonthString(),
  )

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
    clearMessages,
    reloadPrompts,
  } = useAssistant(selectedMonth)

  const value = useMemo<AssistantContextValue>(
    () => ({
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
      selectedMonth,
      setSelectedMonth,
    }),
    [
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
      selectedMonth,
    ],
  )

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  )
}

/**
 * Strict consumer hook for the shared assistant context.
 * Never falls back to creating a duplicate `useAssistant()` instance.
 */
export function useAssistantContext(): AssistantContextValue {
  const context = useContext(AssistantContext)
  if (!context) {
    throw new Error('useAssistantContext must be used within an <AssistantProvider>')
  }
  return context
}

