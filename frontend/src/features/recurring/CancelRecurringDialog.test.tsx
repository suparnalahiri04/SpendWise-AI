import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as recurringApi from '@/lib/api/recurring'
import { ApiError } from '@/lib/api/client'
import type { RecurringPayment } from '@/lib/api/types'
import { CancelRecurringDialog } from './CancelRecurringDialog'

describe('CancelRecurringDialog', () => {
  const samplePayment: RecurringPayment = {
    id: 42,
    user_id: 1,
    description: 'Netflix Premium',
    amount: '649.00',
    category: 'Entertainment',
    frequency: 'monthly',
    start_date: '2026-01-01',
    next_due_date: '2026-12-01',
    status: 'active',
    is_active: true,
    is_overdue: false,
    days_until_due: 26,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders payment description when open', () => {
    render(
      <CancelRecurringDialog
        payment={samplePayment}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: /cancel recurring payment/i })).toBeInTheDocument()
    expect(screen.getByText('Netflix Premium')).toBeInTheDocument()
  })

  it('displays API error message upon failure', async () => {
    const user = userEvent.setup()
    vi.spyOn(recurringApi, 'cancelRecurringPayment').mockRejectedValueOnce(
      new ApiError('validation', 'Cancellation rejected by server', 400),
    )

    render(
      <CancelRecurringDialog
        payment={samplePayment}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel schedule/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cancellation rejected by server',
    )
  })

  it('clears error state when closed via Keep schedule button and reopens clean', async () => {
    const user = userEvent.setup()
    vi.spyOn(recurringApi, 'cancelRecurringPayment').mockRejectedValueOnce(
      new ApiError('server', 'Payment cancellation timeout', 504),
    )

    let isOpen = true
    const onOpenChange = vi.fn((val: boolean) => {
      isOpen = val
    })

    const { rerender } = render(
      <CancelRecurringDialog
        payment={samplePayment}
        open={isOpen}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel schedule/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Payment cancellation timeout')

    // Click Keep schedule
    await user.click(screen.getByRole('button', { name: /keep schedule/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)

    // Reopen dialog
    rerender(
      <CancelRecurringDialog
        payment={samplePayment}
        open={false}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    rerender(
      <CancelRecurringDialog
        payment={samplePayment}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears error state when closed via external open prop change', async () => {
    const user = userEvent.setup()
    vi.spyOn(recurringApi, 'cancelRecurringPayment').mockRejectedValueOnce(
      new ApiError('server', 'External cancel error', 500),
    )

    const { rerender } = render(
      <CancelRecurringDialog
        payment={samplePayment}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel schedule/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('External cancel error')

    rerender(
      <CancelRecurringDialog
        payment={samplePayment}
        open={false}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    rerender(
      <CancelRecurringDialog
        payment={samplePayment}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('prevents duplicate submissions while cancellation is in progress', async () => {
    const user = userEvent.setup()
    let resolveCancel: (value: RecurringPayment | PromiseLike<RecurringPayment>) => void
    const cancelPromise = new Promise<RecurringPayment>((resolve) => {
      resolveCancel = resolve
    })
    const cancelSpy = vi.spyOn(recurringApi, 'cancelRecurringPayment').mockReturnValueOnce(cancelPromise)

    render(
      <CancelRecurringDialog
        payment={samplePayment}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    const cancelBtn = screen.getByRole('button', { name: /cancel schedule/i })
    await user.click(cancelBtn)

    expect(screen.getByRole('button', { name: /cancelling/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /keep schedule/i })).toBeDisabled()
    expect(cancelSpy).toHaveBeenCalledTimes(1)

    // Subsequent click does not re-trigger
    await user.click(cancelBtn)
    expect(cancelSpy).toHaveBeenCalledTimes(1)

    resolveCancel!(samplePayment)
  })
})
