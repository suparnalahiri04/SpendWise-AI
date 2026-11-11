import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CalendarGrid } from './CalendarGrid'
import { generateCalendarGrid, type DayEvents } from './calendarUtils'

describe('CalendarGrid', () => {
  const refDate = new Date(2026, 9, 15) // 2026-10-15
  const gridDays = generateCalendarGrid('2026-10', 'sunday', refDate)

  const mockEventsByDate: Record<string, DayEvents> = {
    '2026-10-05': {
      dateKey: '2026-10-05',
      transactions: [
        {
          id: 1,
          transaction_date: '2026-10-05',
          description: 'Salary',
          amount: '50000.00',
          transaction_type: 'income',
          category: 'Income',
          predicted_category: null,
          prediction_confidence: null,
          is_reviewed: true,
        },
        {
          id: 2,
          transaction_date: '2026-10-05',
          description: 'Electric bill',
          amount: '2200.00',
          transaction_type: 'expense',
          category: 'Bills/Utilities',
          predicted_category: null,
          prediction_confidence: null,
          is_reviewed: true,
        },
      ],
      recurringBills: [
        {
          id: 10,
          user_id: 1,
          description: 'Broadband',
          amount: '1200.00',
          category: 'Bills/Utilities',
          frequency: 'monthly',
          start_date: '2026-01-05',
          next_due_date: '2026-10-05',
          status: 'active',
          is_active: true,
          is_overdue: false,
          days_until_due: 0,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      goalMilestones: [
        {
          id: 20,
          user_id: 1,
          name: 'Emergency Fund Milestone',
          target_amount: '50000.00',
          target_date: '2026-10-05',
          status: 'in_progress',
          total_contributed: '25000.00',
          remaining_amount: '25000.00',
          progress_pct: 50.0,
          is_completed: false,
          is_on_track: true,
          days_remaining: 0,
          recent_contributions: [],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      totalIncome: 50000.0,
      totalExpenses: 2200.0,
      netFlow: 47800.0,
      hasEvents: true,
    },
    '2026-10-10': {
      dateKey: '2026-10-10',
      transactions: [],
      recurringBills: [
        {
          id: 11,
          user_id: 1,
          description: 'Overdue Subscription',
          amount: '499.00',
          category: 'Entertainment',
          frequency: 'monthly',
          start_date: '2026-01-10',
          next_due_date: '2026-10-10',
          status: 'active',
          is_active: true,
          is_overdue: true,
          days_until_due: -5,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      goalMilestones: [],
      totalIncome: 0,
      totalExpenses: 0,
      netFlow: 0,
      hasEvents: true,
    },
  }

  it('renders the complete 35-day grid with weekday column headers', () => {
    render(
      <CalendarGrid
        gridDays={gridDays}
        eventsByDate={mockEventsByDate}
        selectedDate="2026-10-15"
        onSelectDate={vi.fn()}
      />,
    )

    expect(screen.getByRole('grid', { name: 'Financial Calendar Grid' })).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Thu')).toBeInTheDocument()

    // 35 gridcells
    const cells = screen.getAllByRole('gridcell')
    expect(cells).toHaveLength(35)
  })

  it('visually distinguishes the selected date with aria-selected="true"', () => {
    render(
      <CalendarGrid
        gridDays={gridDays}
        eventsByDate={mockEventsByDate}
        selectedDate="2026-10-15"
        onSelectDate={vi.fn()}
      />,
    )

    const selectedCell = screen.getByRole('gridcell', { name: /2026-10-15/ })
    expect(selectedCell).toHaveAttribute('aria-selected', 'true')

    const unselectedCell = screen.getByRole('gridcell', { name: /2026-10-01/ })
    expect(unselectedCell).toHaveAttribute('aria-selected', 'false')
  })

  it('displays restrained indicators for income, expense, recurring bills, and goal milestones', () => {
    render(
      <CalendarGrid
        gridDays={gridDays}
        eventsByDate={mockEventsByDate}
        selectedDate="2026-10-15"
        onSelectDate={vi.fn()}
      />,
    )

    const day5Cell = screen.getByRole('gridcell', { name: /2026-10-05/ })

    // Income and expense badges
    expect(day5Cell).toHaveTextContent('+₹50,000.00')
    expect(day5Cell).toHaveTextContent('-₹2,200.00')

    // Recurring bill pill
    expect(day5Cell).toHaveTextContent('1 bill')

    // Goal milestone icon aria label
    expect(screen.getByLabelText('Goal Milestone')).toBeInTheDocument()
  })

  it('displays overdue alert indicator on overdue recurring bills', () => {
    render(
      <CalendarGrid
        gridDays={gridDays}
        eventsByDate={mockEventsByDate}
        selectedDate="2026-10-15"
        onSelectDate={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Overdue Recurring Bill')).toBeInTheDocument()
  })

  it('calls onSelectDate when a grid cell is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <CalendarGrid
        gridDays={gridDays}
        eventsByDate={mockEventsByDate}
        selectedDate="2026-10-15"
        onSelectDate={onSelect}
      />,
    )

    const targetCell = screen.getByRole('gridcell', { name: /2026-10-05/ })
    await user.click(targetCell)

    expect(onSelect).toHaveBeenCalledWith('2026-10-05')
  })

  it('supports Monday-first header rendering', () => {
    const mondayDays = generateCalendarGrid('2026-10', 'monday', refDate)

    render(
      <CalendarGrid
        gridDays={mondayDays}
        eventsByDate={mockEventsByDate}
        selectedDate="2026-10-15"
        onSelectDate={vi.fn()}
        weekStart="monday"
      />,
    )

    const headers = screen.getAllByRole('columnheader')
    expect(headers[0]).toHaveTextContent('Mon')
    expect(headers[6]).toHaveTextContent('Sun')
  })
})

