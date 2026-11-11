export type FinancialMutationType =
  | 'transaction:created'
  | 'transaction:updated'
  | 'transaction:deleted'
  | 'statement:imported'
  | 'budget:created'
  | 'budget:updated'
  | 'budget:deleted'
  | 'recurring:created'
  | 'recurring:updated'
  | 'recurring:cancelled'
  | 'recurring:deleted'

export type FinancialMutationListener = (type: FinancialMutationType) => void

const listeners = new Set<FinancialMutationListener>()

/**
 * Subscribes a listener to financial mutation events.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeFinancialMutation(
  listener: FinancialMutationListener,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Dispatches a financial mutation event to all active listeners.
 * Safe against listener exceptions to avoid interrupting mutation handlers.
 */
export function notifyFinancialMutation(type: FinancialMutationType): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener(type)
    } catch {
      // Ignore listener errors so caller flows remain unaffected
    }
  }
}

/**
 * Clears all active listeners. Intended primarily for testing teardown.
 */
export function clearFinancialMutationListeners(): void {
  listeners.clear()
}

