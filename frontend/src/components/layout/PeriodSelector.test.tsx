import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { describe, expect, it } from 'vitest'
import { PeriodProvider } from '@/features/period/PeriodProvider'
import { usePeriod } from '@/features/period/period'
import { PeriodSelector } from './PeriodSelector'

function PeriodHarness() {
  const { period, periodLabel } = usePeriod()
  return (
    <div>
      <PeriodSelector />
      <div data-testid="active-period-id">{period}</div>
      <div data-testid="active-period-label">{periodLabel}</div>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <MotionConfig reducedMotion="always">
      <PeriodProvider>
        <PeriodHarness />
      </PeriodProvider>
    </MotionConfig>,
  )
}

describe('PeriodSelector', () => {
  it('renders initial period selector with default This month', () => {
    renderWithProvider()
    const trigger = screen.getByRole('button', { name: /reporting period: this month/i })
    expect(trigger).toBeInTheDocument()
    expect(screen.getByTestId('active-period-id')).toHaveTextContent('this-month')
    expect(screen.getByTestId('active-period-label')).toHaveTextContent('This month')
  })

  it('opens dropdown and displays all 5 options including All time', async () => {
    const user = userEvent.setup()
    renderWithProvider()

    const trigger = screen.getByRole('button', { name: /reporting period: this month/i })
    await user.click(trigger)

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Reporting period')).toBeInTheDocument()

    expect(screen.getByRole('menuitemradio', { name: 'This month' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Last month' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Last 3 months' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Year to date' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'All time' })).toBeInTheDocument()
  })

  it('selects "All time" and updates the period context and button label', async () => {
    const user = userEvent.setup()
    renderWithProvider()

    const trigger = screen.getByRole('button', { name: /reporting period: this month/i })
    await user.click(trigger)

    const allTimeItem = await screen.findByRole('menuitemradio', { name: 'All time' })
    await user.click(allTimeItem)

    expect(screen.getByRole('button', { name: /reporting period: all time/i })).toBeInTheDocument()
    expect(screen.getByTestId('active-period-id')).toHaveTextContent('all')
    expect(screen.getByTestId('active-period-label')).toHaveTextContent('All time')
  })

  it('can switch between multiple periods sequentially', async () => {
    const user = userEvent.setup()
    renderWithProvider()

    // 1. Switch to Last month
    await user.click(screen.getByRole('button', { name: /reporting period: this month/i }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Last month' }))
    expect(screen.getByTestId('active-period-id')).toHaveTextContent('last-month')

    // 2. Switch to All time
    await user.click(screen.getByRole('button', { name: /reporting period: last month/i }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'All time' }))
    expect(screen.getByTestId('active-period-id')).toHaveTextContent('all')

    // 3. Switch back to This month
    await user.click(screen.getByRole('button', { name: /reporting period: all time/i }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'This month' }))
    expect(screen.getByTestId('active-period-id')).toHaveTextContent('this-month')
  })
})

