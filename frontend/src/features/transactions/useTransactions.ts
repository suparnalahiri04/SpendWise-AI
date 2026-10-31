import { useCallback, useEffect, useState } from 'react'
import { ApiError, isAbortError } from '@/lib/api/client'
import { fetchTransactions } from '@/lib/api/transactions'
import type { Transaction } from '@/lib/api/types'

export type TransactionsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; transactions: Transaction[] }

/** Loads the signed-in user's transactions from GET /transactions/. */
export function useTransactions(): TransactionsState & {
  reload: () => void
  addTransactionLocally: (transaction: Transaction) => void
  updateTransactionLocally: (transaction: Transaction) => void
} {
  const [state, setState] = useState<TransactionsState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let isSubscribed = true

    fetchTransactions(controller.signal)
      .then((transactions) => {
        if (!isSubscribed || controller.signal.aborted) return
        setState({ status: 'success', transactions })
      })
      .catch((error: unknown) => {
        if (!isSubscribed || controller.signal.aborted || isAbortError(error, controller.signal)) return
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Something went wrong while loading transactions.',
        })
      })

    return () => {
      isSubscribed = false
      controller.abort()
    }
  }, [attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const addTransactionLocally = useCallback((transaction: Transaction) => {
    setState((prev) => {
      if (prev.status === 'success') {
        return {
          status: 'success',
          transactions: [transaction, ...prev.transactions.filter((t) => t.id !== transaction.id)],
        }
      }
      return { status: 'success', transactions: [transaction] }
    })
  }, [])

  const updateTransactionLocally = useCallback((transaction: Transaction) => {
    setState((prev) => {
      if (prev.status === 'success') {
        return {
          status: 'success',
          transactions: prev.transactions.map((t) => (t.id === transaction.id ? transaction : t)),
        }
      }
      return prev
    })
  }, [])

  return { ...state, reload, addTransactionLocally, updateTransactionLocally }
}
