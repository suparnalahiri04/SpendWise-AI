import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as alertEvents from '@/features/alerts/alertEvents'
import * as api from '@/lib/api/transactions'
import type { Transaction } from '@/lib/api/types'
import { DeleteTransactionDialog } from './DeleteTransactionDialog'

const mockTransaction: Transaction = {
  id: 42,
  transaction_date: '2026-10-30',
  description: 'Starbucks coffee',
  amount: '180.00',
  transaction_type: 'expense',
  category: 'Food/Dining',
  predicted_category: null,
  prediction_confidence: null,
  is_reviewed: true,
}

describe('DeleteTransactionDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders transaction details when open', () => {
    render(
      <DeleteTransactionDialog
        transaction={mockTransaction}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: /delete transaction/i })).toBeInTheDocument()
    expect(screen.getByText('Starbucks coffee')).toBeInTheDocument()
    expect(screen.getByText(/−₹180\.00/)).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete transaction' })).toBeInTheDocument()
  })

  it('does not call delete API when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(api, 'deleteTransaction').mockResolvedValue(undefined)
    const onOpenChange = vi.fn()

    render(
      <DeleteTransactionDialog
        transaction={mockTransaction}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(deleteSpy).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls deleteTransaction with correct ID and triggers mutation on confirm', async () => {
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(api, 'deleteTransaction').mockResolvedValue(undefined)
    const notifySpy = vi.spyOn(alertEvents, 'notifyFinancialMutation')
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <DeleteTransactionDialog
        transaction={mockTransaction}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete transaction' }))

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(42)
      expect(notifySpy).toHaveBeenCalledWith('transaction:deleted')
      expect(onSuccess).toHaveBeenCalledWith(42)
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('handles API errors, displays error message, and does not notify mutation', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'deleteTransaction').mockRejectedValue(new Error('Network failure'))
    const notifySpy = vi.spyOn(alertEvents, 'notifyFinancialMutation')
    const onSuccess = vi.fn()

    render(
      <DeleteTransactionDialog
        transaction={mockTransaction}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete transaction' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/failed to delete transaction/i)).toBeInTheDocument()
    expect(notifySpy).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('prevents double submission while request is in flight', async () => {
    const user = userEvent.setup()
    let resolveDelete!: () => void
    const pendingPromise = new Promise<void>((res) => {
      resolveDelete = res
    })
    const deleteSpy = vi.spyOn(api, 'deleteTransaction').mockReturnValue(pendingPromise)

    render(
      <DeleteTransactionDialog
        transaction={mockTransaction}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    const deleteBtn = screen.getByRole('button', { name: 'Delete transaction' })
    await user.click(deleteBtn)

    expect(deleteBtn).toBeDisabled()
    expect(screen.getByText(/deleting…/i)).toBeInTheDocument()
    expect(deleteSpy).toHaveBeenCalledTimes(1)

    // Attempt second click while disabled
    await user.click(deleteBtn)
    expect(deleteSpy).toHaveBeenCalledTimes(1)

    resolveDelete()
  })
})

