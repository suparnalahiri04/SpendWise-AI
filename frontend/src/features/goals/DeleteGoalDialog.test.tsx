import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as savingsGoalsApi from '@/lib/api/savingsGoals'
import { ApiError } from '@/lib/api/client'
import type { SavingsGoal } from '@/lib/api/types'
import { DeleteGoalDialog } from './DeleteGoalDialog'

describe('DeleteGoalDialog', () => {
  const sampleGoal: SavingsGoal = {
    id: 99,
    user_id: 1,
    name: 'Emergency Fund',
    target_amount: '50000.00',
    target_date: '2026-12-31',
    total_contributed: '20000.00',
    remaining_amount: '30000.00',
    progress_pct: 40.0,
    status: 'in_progress',
    is_completed: false,
    is_on_track: true,
    days_remaining: 60,
    recent_contributions: [],
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders goal name when open', () => {
    render(
      <DeleteGoalDialog
        goal={sampleGoal}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: /delete savings goal/i })).toBeInTheDocument()
    expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
  })

  it('displays API error message upon failure', async () => {
    const user = userEvent.setup()
    vi.spyOn(savingsGoalsApi, 'deleteSavingsGoal').mockRejectedValueOnce(
      new ApiError('validation', 'Goal deletion rejected by server', 400),
    )

    render(
      <DeleteGoalDialog
        goal={sampleGoal}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete Goal' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Goal deletion rejected by server',
    )
  })

  it('clears error state when closed via Cancel button and reopens clean', async () => {
    const user = userEvent.setup()
    vi.spyOn(savingsGoalsApi, 'deleteSavingsGoal').mockRejectedValueOnce(
      new ApiError('server', 'Goal deletion network failure', 500),
    )

    let isOpen = true
    const onOpenChange = vi.fn((val: boolean) => {
      isOpen = val
    })

    const { rerender } = render(
      <DeleteGoalDialog
        goal={sampleGoal}
        open={isOpen}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete Goal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Goal deletion network failure')

    // Click Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)

    // Reopen dialog
    rerender(
      <DeleteGoalDialog
        goal={sampleGoal}
        open={false}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    rerender(
      <DeleteGoalDialog
        goal={sampleGoal}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears error state when closed via external open prop change', async () => {
    const user = userEvent.setup()
    vi.spyOn(savingsGoalsApi, 'deleteSavingsGoal').mockRejectedValueOnce(
      new ApiError('server', 'External prop close error', 500),
    )

    const { rerender } = render(
      <DeleteGoalDialog
        goal={sampleGoal}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete Goal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('External prop close error')

    rerender(
      <DeleteGoalDialog
        goal={sampleGoal}
        open={false}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    rerender(
      <DeleteGoalDialog
        goal={sampleGoal}
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
    const deleteSpy = vi.spyOn(savingsGoalsApi, 'deleteSavingsGoal').mockReturnValueOnce(deletePromise)

    render(
      <DeleteGoalDialog
        goal={sampleGoal}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    const deleteBtn = screen.getByRole('button', { name: 'Delete Goal' })
    await user.click(deleteBtn)

    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    expect(deleteSpy).toHaveBeenCalledTimes(1)

    // Subsequent click does not re-trigger
    await user.click(deleteBtn)
    expect(deleteSpy).toHaveBeenCalledTimes(1)

    resolveDelete!()
  })
})
