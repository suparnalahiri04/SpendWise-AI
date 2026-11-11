import { describe, expect, it, vi } from 'vitest'
import {
  clearFinancialMutationListeners,
  notifyFinancialMutation,
  subscribeFinancialMutation,
} from './alertEvents'

describe('alertEvents financial mutation invalidation', () => {
  it('calls subscribers when a mutation occurs', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeFinancialMutation(listener)

    notifyFinancialMutation('transaction:created')
    expect(listener).toHaveBeenCalledWith('transaction:created')

    unsubscribe()
  })

  it('stops notifying after unsubscribe is called', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeFinancialMutation(listener)

    notifyFinancialMutation('budget:created')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    notifyFinancialMutation('budget:updated')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('handles errors in listeners gracefully without throwing', () => {
    const throwingListener = vi.fn().mockImplementation(() => {
      throw new Error('Listener failed')
    })
    const normalListener = vi.fn()

    const unsub1 = subscribeFinancialMutation(throwingListener)
    const unsub2 = subscribeFinancialMutation(normalListener)

    expect(() => {
      notifyFinancialMutation('recurring:cancelled')
    }).not.toThrow()

    expect(throwingListener).toHaveBeenCalledTimes(1)
    expect(normalListener).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()
  })

  it('clears all listeners with clearFinancialMutationListeners', () => {
    const l1 = vi.fn()
    const l2 = vi.fn()

    subscribeFinancialMutation(l1)
    subscribeFinancialMutation(l2)

    clearFinancialMutationListeners()
    notifyFinancialMutation('statement:imported')

    expect(l1).not.toHaveBeenCalled()
    expect(l2).not.toHaveBeenCalled()
  })
})

