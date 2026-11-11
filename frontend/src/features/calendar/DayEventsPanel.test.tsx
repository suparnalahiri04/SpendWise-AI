import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DayEventsPanel } from './DayEventsPanel'
import type { DayEvents } from './calendarUtils'

describe('DayEventsPanel', () => {
  const mockDayWithAllEvents: DayEvents = {
    dateKey: '2026-10-05',
    transactions: [
      {
        id: 1,
        transaction_date: '2026-10-05',
        description: 'Salary',
        amount: '60000.00',
        transaction_type: 'income',
        category: 'Income',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      },
      {
        id: 2,
        transaction_date: '2026-10-05',
        description: 'Supermarket Groceries',
        amount: '4250.00',
        transaction_type: 'expense',
        category: 'Groceries',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: false,
      },
    ],
    recurringBills: [
      {
        id: 10,
        user_id: 1,
        description: 'High-speed Fiber',
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
      {
        id: 11,
        user_id: 1,
        description: 'Gym Membership',
        amount: '2000.00',
        category: 'Healthcare',
        frequency: 'monthly',
        start_date: '2026-01-05',
        next_due_date: '2026-10-05',
        status: 'active',
        is_active: true,
        is_overdue: true,
        days_until_due: -5,
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
    totalIncome: 60000.0,
    totalExpenses: 4250.0,
    netFlow: 55750.0,
    hasEvents: true,
  }

  const mockEmptyDay: DayEvents = {
    dateKey: '2026-10-18',
    transactions: [],
    recurringBills: [],
    goalMilestones: [],
    totalIncome: 0,
    totalExpenses: 0,
    netFlow: 0,
    hasEvents: false,
  }

  it('renders friendly formatted date header and daily summary flow pills', () => {
    render(<DayEventsPanel dayEvents={mockDayWithAllEvents} selectedDate="2026-10-05" />)

    // Friendly date in CardTitle heading: Monday, 5 October 2026
    const heading = screen.getByRole('heading', { name: 'Monday, 5 October 2026' })
    expect(heading).toBeInTheDocument()
    expect(heading).toHaveClass('break-words')

    // Responsive summary items container
    const summaryGrid = screen.getByTestId('daily-summary-grid')
    expect(summaryGrid).toHaveClass('grid-cols-1')
    expect(summaryGrid).toHaveClass('sm:grid-cols-3')

    // Three distinct summary items
    const incomeCard = screen.getByTestId('daily-income-summary')
    expect(incomeCard).toHaveTextContent('Income')
    expect(incomeCard).toHaveTextContent('₹60,000.00')

    const expenseCard = screen.getByTestId('daily-expense-summary')
    expect(expenseCard).toHaveTextContent('Expenses')
    expect(expenseCard).toHaveTextContent('₹4,250.00')

    const netCard = screen.getByTestId('daily-net-summary')
    expect(netCard).toHaveTextContent('Net Flow')
    expect(netCard).toHaveTextContent('+₹55,750.00')
  })

  it('renders negative net flow and zero net flow with distinct styling', () => {
    const mockNegativeDay: DayEvents = {
      ...mockDayWithAllEvents,
      totalIncome: 1000.0,
      totalExpenses: 5000.0,
      netFlow: -4000.0,
    }

    const { rerender } = render(
      <DayEventsPanel dayEvents={mockNegativeDay} selectedDate="2026-10-05" />,
    )
    const netNegative = screen.getByTestId('daily-net-summary')
    expect(netNegative).toHaveTextContent('-₹4,000.00')
    const netNegativeAmount = netNegative.querySelector('.text-destructive')
    expect(netNegativeAmount).toBeInTheDocument()

    // Zero net flow
    const mockZeroDay: DayEvents = {
      ...mockDayWithAllEvents,
      totalIncome: 3000.0,
      totalExpenses: 3000.0,
      netFlow: 0.0,
    }
    rerender(<DayEventsPanel dayEvents={mockZeroDay} selectedDate="2026-10-05" />)
    const netZero = screen.getByTestId('daily-net-summary')
    expect(netZero).toHaveTextContent('₹0.00')
    const netZeroAmount = netZero.querySelector('.text-muted-foreground')
    expect(netZeroAmount).toBeInTheDocument()
  })

  it('handles long transaction names with truncation while keeping amount fully visible', () => {
    const longDesc =
      'Annual Enterprise Cloud Infrastructure Hosting and Multi-Region Database License Subscription Renewal'
    const mockLongDay: DayEvents = {
      ...mockDayWithAllEvents,
      transactions: [
        {
          id: 99,
          transaction_date: '2026-10-05',
          description: longDesc,
          amount: '125000.50',
          transaction_type: 'expense',
          category: 'Bills/Utilities',
          predicted_category: null,
          prediction_confidence: null,
          is_reviewed: true,
        },
      ],
      recurringBills: [],
      goalMilestones: [],
    }

    render(<DayEventsPanel dayEvents={mockLongDay} selectedDate="2026-10-05" />)

    const txDesc = screen.getByTitle(longDesc)
    expect(txDesc).toBeInTheDocument()
    expect(txDesc).toHaveClass('truncate')
    expect(txDesc).toHaveClass('min-w-0')

    // Amount must have shrink-0 and be visible
    const amountSpan = screen.getByText('-₹1,25,000.50')
    expect(amountSpan).toBeInTheDocument()
    expect(amountSpan).toHaveClass('shrink-0')
  })

  it('renders transactions with literal "string" text from Swagger/API test data without altering values', () => {
    const mockSwaggerDataDay: DayEvents = {
      ...mockDayWithAllEvents,
      transactions: [
        {
          id: 50,
          transaction_date: '2026-10-05',
          description: 'string',
          amount: '100.00',
          transaction_type: 'expense',
          category: 'string',
          predicted_category: null,
          prediction_confidence: null,
          is_reviewed: false,
        },
      ],
      recurringBills: [],
      goalMilestones: [],
    }

    render(<DayEventsPanel dayEvents={mockSwaggerDataDay} selectedDate="2026-10-05" />)

    // The literal text "string" should be rendered as-is (both description and category badge)
    const stringElements = screen.getAllByText('string')
    expect(stringElements.length).toBeGreaterThanOrEqual(1)

    // Amount is faithfully displayed
    expect(screen.getByText('-₹100.00')).toBeInTheDocument()
  })

  it('renders correctly at narrow/mobile container widths', () => {
    const { container } = render(
      <div style={{ width: '300px' }}>
        <DayEventsPanel dayEvents={mockDayWithAllEvents} selectedDate="2026-10-05" />
      </div>,
    )

    // Card has min-w-0 and w-full
    const card = container.querySelector('[data-slot="card"]')
    expect(card).toHaveClass('min-w-0')
    expect(card).toHaveClass('w-full')

    // Header has flex-col, items-stretch, w-full, min-w-0
    const header = container.querySelector('[data-slot="card-header"]')
    expect(header).toHaveClass('flex-col')
    expect(header).toHaveClass('items-stretch')
    expect(header).toHaveClass('w-full')
    expect(header).toHaveClass('min-w-0')

    // Summary items are rendered
    expect(screen.getByTestId('daily-income-summary')).toBeInTheDocument()
    expect(screen.getByTestId('daily-expense-summary')).toBeInTheDocument()
    expect(screen.getByTestId('daily-net-summary')).toBeInTheDocument()
  })

  it('renders scheduled commitments with distinction between scheduled and overdue states', () => {
    render(<DayEventsPanel dayEvents={mockDayWithAllEvents} selectedDate="2026-10-05" />)

    expect(screen.getByText('Scheduled Commitments (2)')).toBeInTheDocument()

    // Active on-time bill
    expect(screen.getByText('High-speed Fiber')).toBeInTheDocument()
    expect(screen.getByText('Scheduled Due')).toBeInTheDocument()
    expect(screen.getByText('₹1,200.00')).toBeInTheDocument()

    // Overdue bill
    expect(screen.getByText('Gym Membership')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('(Overdue by 5d)')).toBeInTheDocument()
    expect(screen.getByText('₹2,000.00')).toBeInTheDocument()
  })

  it('renders recorded actual transactions with category badge and income/expense indicator', () => {
    render(<DayEventsPanel dayEvents={mockDayWithAllEvents} selectedDate="2026-10-05" />)

    expect(screen.getByText('Recorded Transactions (2)')).toBeInTheDocument()

    // Salary (Income)
    expect(screen.getByText('Salary')).toBeInTheDocument()
    expect(screen.getByText('Income record')).toBeInTheDocument()
    expect(screen.getByText('+₹60,000.00', { selector: '.text-forest' })).toBeInTheDocument()

    // Groceries (Expense)
    expect(screen.getByText('Supermarket Groceries')).toBeInTheDocument()
    expect(screen.getByText('Expense record')).toBeInTheDocument()
    expect(screen.getByText('-₹4,250.00')).toBeInTheDocument()
  })

  it('renders savings goal milestones with target amount and progress', () => {
    render(<DayEventsPanel dayEvents={mockDayWithAllEvents} selectedDate="2026-10-05" />)

    expect(screen.getByText('Goal Target Milestones (1)')).toBeInTheDocument()
    expect(screen.getByText('Emergency Fund Milestone')).toBeInTheDocument()
    expect(screen.getByText('Target Deadline')).toBeInTheDocument()
    expect(screen.getByText(/Target: ₹50,000.00 • Progress: 50%/)).toBeInTheDocument()
  })

  it('renders friendly empty state when no financial activity occurs on selected date', () => {
    render(<DayEventsPanel dayEvents={mockEmptyDay} selectedDate="2026-10-18" />)

    expect(screen.getByText('Sunday, 18 October 2026')).toBeInTheDocument()
    expect(screen.getByText('No financial events recorded')).toBeInTheDocument()
    expect(
      screen.getByText(
        'No transactions, scheduled recurring bills, or goal milestones fall on this date.',
      ),
    ).toBeInTheDocument()

    // No empty sections rendered
    expect(screen.queryByText(/Scheduled Commitments/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Recorded Transactions/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Goal Target Milestones/)).not.toBeInTheDocument()
  })
})

