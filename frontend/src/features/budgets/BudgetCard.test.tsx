import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BudgetProgressItem } from '@/lib/api/types'
import { BudgetCard } from './BudgetCard'

const mockHealthyBudget: BudgetProgressItem = {
  id: 1,
  category: 'Groceries',
  month: '2026-10',
  limit_amount: '10000.00',
  spent_amount: '4500.00',
  remaining_amount: '5500.00',
  percentage_used: 45.0,
  is_exceeded: false,
}

const mockWarningBudget: BudgetProgressItem = {
  id: 2,
  category: 'Dining Out',
  month: '2026-10',
  limit_amount: '5000.00',
  spent_amount: '4200.00',
  remaining_amount: '800.00',
  percentage_used: 84.0,
  is_exceeded: false,
}

const mockExceededBudget: BudgetProgressItem = {
  id: 3,
  category: 'Electronics',
  month: '2026-10',
  limit_amount: '8000.00',
  spent_amount: '9500.00',
  remaining_amount: '-1500.00',
  percentage_used: 118.75,
  is_exceeded: true,
}

describe('BudgetCard', () => {
  it('renders healthy budget with emerald/lime progress treatment and on track badge', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    const { container } = render(
      <BudgetCard budget={mockHealthyBudget} onEdit={onEdit} onDelete={onDelete} />,
    )

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('₹10,000.00')).toBeInTheDocument()
    expect(screen.getByText('On track')).toBeInTheDocument()
    expect(screen.getByText('₹5,500.00 left')).toBeInTheDocument()

    // Progress bar accessible semantics
    const progressBar = screen.getByRole('progressbar', { name: 'Groceries budget progress' })
    expect(progressBar).toBeInTheDocument()
    expect(progressBar).toHaveAttribute('aria-valuenow', '45')
    expect(progressBar).toHaveAttribute('aria-valuemin', '0')
    expect(progressBar).toHaveAttribute('aria-valuemax', '100')

    // Emerald/lime treatment
    const bar = container.querySelector('.from-forest.via-emerald-deep.to-lime')
    expect(bar).toBeInTheDocument()
  })

  it('renders approaching-limit budget with warning amber progress bar', () => {
    const { container } = render(
      <BudgetCard budget={mockWarningBudget} onEdit={vi.fn()} onDelete={vi.fn()} />,
    )

    expect(screen.getByText('Dining Out')).toBeInTheDocument()
    expect(screen.getByText('Approaching limit')).toBeInTheDocument()
    expect(screen.getByText('84.0%')).toBeInTheDocument()

    const bar = container.querySelector('.from-\\[\\#c98e1f\\]')
    expect(bar).toBeInTheDocument()
  })

  it('renders exceeded budget with over-budget badge and terracotta bar', () => {
    const { container } = render(
      <BudgetCard budget={mockExceededBudget} onEdit={vi.fn()} onDelete={vi.fn()} />,
    )

    expect(screen.getByText('Electronics')).toBeInTheDocument()
    expect(screen.getByText('Over budget')).toBeInTheDocument()
    expect(screen.getByText('Over by ₹1,500.00')).toBeInTheDocument()

    const bar = container.querySelector('.from-terracotta')
    expect(bar).toBeInTheDocument()
  })

  it('invokes onEdit and onDelete callbacks when buttons are clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(<BudgetCard budget={mockHealthyBudget} onEdit={onEdit} onDelete={onDelete} />)

    const editBtn = screen.getByRole('button', { name: 'Edit Groceries budget' })
    await user.click(editBtn)
    expect(onEdit).toHaveBeenCalledWith(mockHealthyBudget)

    const deleteBtn = screen.getByRole('button', { name: 'Delete Groceries budget' })
    await user.click(deleteBtn)
    expect(onDelete).toHaveBeenCalledWith(mockHealthyBudget)
  })
})

