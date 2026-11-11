import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SavingsGoal } from '@/lib/api/types'
import { GoalCard } from './GoalCard'

const mockGoalOnTrack: SavingsGoal = {
  id: 1,
  user_id: 1,
  name: 'Emergency Fund',
  target_amount: '50000.00',
  target_date: '2026-12-31',
  status: 'in_progress',
  total_contributed: '25000.00',
  remaining_amount: '25000.00',
  progress_pct: 50.0,
  is_completed: false,
  is_on_track: true,
  days_remaining: 60,
  recent_contributions: [],
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

const mockGoalCompleted: SavingsGoal = {
  id: 2,
  user_id: 1,
  name: 'Laptop',
  target_amount: '60000.00',
  target_date: '2026-11-15',
  status: 'completed',
  total_contributed: '60000.00',
  remaining_amount: '0.00',
  progress_pct: 100.0,
  is_completed: true,
  is_on_track: true,
  days_remaining: 14,
  recent_contributions: [],
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-15T00:00:00Z',
}

const mockGoalOverdue: SavingsGoal = {
  id: 3,
  user_id: 1,
  name: 'Festival Trip',
  target_amount: '20000.00',
  target_date: '2026-10-10',
  status: 'in_progress',
  total_contributed: '5000.00',
  remaining_amount: '15000.00',
  progress_pct: 25.0,
  is_completed: false,
  is_on_track: false,
  days_remaining: -5,
  recent_contributions: [],
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

const mockGoalArchived: SavingsGoal = {
  id: 4,
  user_id: 1,
  name: 'Old Project',
  target_amount: '10000.00',
  target_date: null,
  status: 'archived',
  total_contributed: '3000.00',
  remaining_amount: '7000.00',
  progress_pct: 30.0,
  is_completed: false,
  is_on_track: null,
  days_remaining: null,
  recent_contributions: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
}

describe('GoalCard', () => {
  it('renders an in-progress goal on track with progress bar and details', () => {
    const onAdd = vi.fn()
    const onHistory = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(
      <GoalCard
        goal={mockGoalOnTrack}
        onAddContribution={onAdd}
        onViewHistory={onHistory}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    expect(screen.getByText('₹50,000.00')).toBeInTheDocument()
    expect(screen.getByText('On Track')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('₹25,000.00', { selector: '.text-forest' })).toBeInTheDocument()

    const progressBar = screen.getByRole('progressbar', { name: 'Emergency Fund savings progress' })
    expect(progressBar).toBeInTheDocument()
    expect(progressBar).toHaveAttribute('aria-valuenow', '50')
  })

  it('renders a completed goal with lime badge and 100% progress', () => {
    render(
      <GoalCard
        goal={mockGoalCompleted}
        onAddContribution={vi.fn()}
        onViewHistory={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('Laptop')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('₹0.00')).toBeInTheDocument()
  })

  it('renders an overdue goal with overdue badge and days note', () => {
    render(
      <GoalCard
        goal={mockGoalOverdue}
        onAddContribution={vi.fn()}
        onViewHistory={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('Festival Trip')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('(5d overdue)')).toBeInTheDocument()
  })

  it('calls action callbacks when action buttons are clicked', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onHistory = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(
      <GoalCard
        goal={mockGoalOnTrack}
        onAddContribution={onAdd}
        onViewHistory={onHistory}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Add savings to Emergency Fund' }))
    expect(onAdd).toHaveBeenCalledWith(mockGoalOnTrack)

    await user.click(screen.getByRole('button', { name: 'View contribution history for Emergency Fund' }))
    expect(onHistory).toHaveBeenCalledWith(mockGoalOnTrack)

    await user.click(screen.getByRole('button', { name: 'Edit Emergency Fund' }))
    expect(onEdit).toHaveBeenCalledWith(mockGoalOnTrack)

    await user.click(screen.getByRole('button', { name: 'Delete Emergency Fund' }))
    expect(onDelete).toHaveBeenCalledWith(mockGoalOnTrack)
  })

  it('does not show Add Savings button for archived goals', () => {
    render(
      <GoalCard
        goal={mockGoalArchived}
        onAddContribution={vi.fn()}
        onViewHistory={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('Archived')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add savings/i })).not.toBeInTheDocument()
  })
})

