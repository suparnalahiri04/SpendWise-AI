import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as budgetsApi from '@/lib/api/budgets'
import { ApiError } from '@/lib/api/client'
import type { BudgetProgressItem } from '@/lib/api/types'
import { DeleteBudgetDialog } from './DeleteBudgetDialog'

describe('DeleteBudgetDialog', () => {
  const sampleBudget: BudgetProgressItem = {
    id: 10,
    category: 'Food/Dining',
    month: '2026-11',
    limit_amount: '15000.00',
    spent_amount: '5000.00',
    remaining_amount: '10000.00',
    percentage_used: 33.3,
    is_exceeded: false,
    status: 'good',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders budget details when open', () => {
    render(
      <DeleteBudgetDialog
        budget={sampleBudget}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: /delete budget/i })).toBeInTheDocument()
    expect(screen.getByText('Food/Dining')).toBeInTheDocument()
  })

  it('displays API error message upon failure', async () => {
    const user = userEvent.setup()
    vi.spyOn(budgetsApi, 'deleteBudget').mockRejectedValueOnce(
      new ApiError('validation', 'Backend database constraint failure', 400),
    )

    render(
      <DeleteBudgetDialog
        budget={sampleBudget}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /delete budget/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Backend database constraint failure',
    )
  })

  it('clears error state when closed via Cancel button and reopens clean', async () => {
    const user = userEvent.setup()
    vi.spyOn(budgetsApi, 'deleteBudget').mockRejectedValueOnce(
      new ApiError('server', 'Deletion failed on network error', 500),
    )

    let isOpen = true
    const onOpenChange = vi.fn((val: boolean) => {
      isOpen = val
    })

    const { rerender } = render(
      <DeleteBudgetDialog
        budget={sampleBudget}
        open={isOpen}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    // Trigger failure
    await user.click(screen.getByRole('button', { name: /delete budget/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Deletion failed on network error')

    // Click Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)

    // Reopen dialog
    rerender(
      <DeleteBudgetDialog
        budget={sampleBudget}
        open={false}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    rerender(
      <DeleteBudgetDialog
        budget={sampleBudget}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears error state when closed via external open prop change', async () => {
    const user = userEvent.setup()
    vi.spyOn(budgetsApi, 'deleteBudget').mockRejectedValueOnce(
      new ApiError('server', 'External prop failure test', 500),
    )

    const { rerender } = render(
      <DeleteBudgetDialog
        budget={sampleBudget}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /delete budget/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('External prop failure test')

    // Parent closes dialog by setting open to false directly
    rerender(
      <DeleteBudgetDialog
        budget={sampleBudget}
        open={false}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    // Parent reopens
    rerender(
      <DeleteBudgetDialog
        budget={sampleBudget}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('prevents duplicate submissions while deleting is in progress', async () => {
    const user = userEvent.setup()
    let resolveDelete: (value: void | PromiseLike<void>) => void
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve
    })
    const deleteSpy = vi.spyOn(budgetsApi, 'deleteBudget').mockReturnValueOnce(deletePromise)

    render(
      <DeleteBudgetDialog
        budget={sampleBudget}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    const deleteBtn = screen.getByRole('button', { name: /delete budget/i })
    await user.click(deleteBtn)

    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    expect(deleteSpy).toHaveBeenCalledTimes(1)

    // Subsequent click should not re-trigger
    await user.click(deleteBtn)
    expect(deleteSpy).toHaveBeenCalledTimes(1)

    resolveDelete!()
  })
})
