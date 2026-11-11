import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as savingsGoalsApi from '@/lib/api/savingsGoals'
import type { SavingsGoal } from '@/lib/api/types'
import { AddContributionDialog, getTodayDateString } from './AddContributionDialog'

declare const process: {
  env: Record<string, string | undefined>
}

describe('getTodayDateString', () => {
  it('formats dates as YYYY-MM-DD using local calendar components', () => {
    // Arbitrary date in local time
    const fixed = new Date(2026, 4, 9, 14, 30, 0) // May 9, 2026
    expect(getTodayDateString(fixed)).toBe('2026-05-09')
  })

  it('pads single-digit months and days with leading zeros', () => {
    const fixed = new Date(2026, 0, 5, 10, 0, 0) // Jan 5, 2026
    expect(getTodayDateString(fixed)).toBe('2026-01-05')
  })

  it('correctly uses Asia/Kolkata local date when local date and UTC date diverge across midnight', () => {
    const originalTZ = process.env.TZ
    try {
      process.env.TZ = 'Asia/Kolkata'

      // Case 1: Nov 5, 2026 at 02:00 IST is Nov 4, 2026 at 20:30 UTC
      const earlyMorningIST = new Date('2026-11-04T20:30:00.000Z')
      // Demonstrates that UTC date is Nov 4, while getTodayDateString produces local Nov 5
      expect(earlyMorningIST.toISOString().split('T')[0]).toBe('2026-11-04')
      expect(getTodayDateString(earlyMorningIST)).toBe('2026-11-05')

      // Case 2: Nov 4, 2026 at 23:30 IST is Nov 4, 2026 at 18:00 UTC
      const lateNightIST = new Date('2026-11-04T18:00:00.000Z')
      expect(lateNightIST.toISOString().split('T')[0]).toBe('2026-11-04')
      expect(getTodayDateString(lateNightIST)).toBe('2026-11-04')
    } finally {
      process.env.TZ = originalTZ
    }
  })

  it('correctly handles month-end and year-end boundaries', () => {
    const yearEnd = new Date(2026, 11, 31, 23, 59, 59) // Dec 31, 2026
    expect(getTodayDateString(yearEnd)).toBe('2026-12-31')

    const newYear = new Date(2027, 0, 1, 0, 0, 1) // Jan 1, 2027
    expect(getTodayDateString(newYear)).toBe('2027-01-01')
  })

  it('defaults to current local date when refDate is omitted', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`
    expect(getTodayDateString()).toBe(expected)
  })
})

describe('AddContributionDialog component', () => {
  const sampleGoal: SavingsGoal = {
    id: 1,
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

  it('initializes date input with local calendar date', () => {
    render(
      <AddContributionDialog
        goal={sampleGoal}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement
    expect(dateInput.value).toBe(getTodayDateString())
  })

  it('initializes date input with local calendar date in Asia/Kolkata even when UTC is yesterday', () => {
    const originalTZ = process.env.TZ
    try {
      process.env.TZ = 'Asia/Kolkata'
      vi.useFakeTimers()
      // Nov 5, 2026 at 02:00 IST (UTC: Nov 4, 2026 20:30)
      vi.setSystemTime(new Date('2026-11-04T20:30:00.000Z'))

      render(
        <AddContributionDialog
          goal={sampleGoal}
          open={true}
          onOpenChange={vi.fn()}
          onSuccess={vi.fn()}
        />,
      )

      const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement
      // Must be local Nov 5, NOT UTC Nov 4
      expect(dateInput.value).toBe('2026-11-05')
    } finally {
      vi.useRealTimers()
      process.env.TZ = originalTZ
    }
  })

  it('submits with default local date when user does not change date', async () => {
    const user = userEvent.setup()
    const addContribSpy = vi
      .spyOn(savingsGoalsApi, 'addGoalContribution')
      .mockResolvedValueOnce(sampleGoal)

    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <AddContributionDialog
        goal={sampleGoal}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    )

    const amountInput = screen.getByLabelText(/amount/i)
    await user.type(amountInput, '2500')

    const submitBtn = screen.getByRole('button', { name: /record contribution/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(addContribSpy).toHaveBeenCalledWith(1, {
        amount: 2500,
        contribution_date: getTodayDateString(),
        notes: undefined,
      })
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('preserves user manual date selection when customized', async () => {
    const user = userEvent.setup()
    const addContribSpy = vi
      .spyOn(savingsGoalsApi, 'addGoalContribution')
      .mockResolvedValueOnce(sampleGoal)

    const onSuccess = vi.fn()

    render(
      <AddContributionDialog
        goal={sampleGoal}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    const amountInput = screen.getByLabelText(/amount/i)
    await user.type(amountInput, '1000')

    const dateInput = screen.getByLabelText(/date/i)
    await user.clear(dateInput)
    await user.type(dateInput, '2026-08-15')

    const submitBtn = screen.getByRole('button', { name: /record contribution/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(addContribSpy).toHaveBeenCalledWith(1, {
        amount: 1000,
        contribution_date: '2026-08-15',
        notes: undefined,
      })
    })
  })

  it('rejects invalid or zero amount without submitting', async () => {
    const user = userEvent.setup()
    const addContribSpy = vi.spyOn(savingsGoalsApi, 'addGoalContribution')

    render(
      <AddContributionDialog
        goal={sampleGoal}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    const amountInput = screen.getByLabelText(/amount/i)
    await user.type(amountInput, '0')

    const form = screen.getByRole('button', { name: /record contribution/i }).closest('form')!
    fireEvent.submit(form)

    expect(
      await screen.findByText('Contribution amount must be greater than zero.'),
    ).toBeInTheDocument()
    expect(addContribSpy).not.toHaveBeenCalled()
  })

  it('closes dialog on cancel click without submitting', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const addContribSpy = vi.spyOn(savingsGoalsApi, 'addGoalContribution')

    render(
      <AddContributionDialog
        goal={sampleGoal}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelBtn)

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(addContribSpy).not.toHaveBeenCalled()
  })
})
