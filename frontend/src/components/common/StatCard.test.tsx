import { render, screen } from '@testing-library/react'
import { TrendingUp, Wallet } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('renders standard variant with label, value, hint, and default styling', () => {
    render(
      <StatCard
        label="Total Spending"
        icon={Wallet}
        value="₹12,450.00"
        hint="Within typical range"
      />,
    )

    expect(screen.getByText('Total Spending')).toBeInTheDocument()
    expect(screen.getByText('₹12,450.00')).toBeInTheDocument()
    expect(screen.getByText('Within typical range')).toBeInTheDocument()
  })

  it('renders placeholder dash and accessible screen-reader note when value is null', () => {
    render(
      <StatCard
        label="Budget Remaining"
        icon={Wallet}
        value={null}
        hint="Available once budgets are set"
      />,
    )

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('No data yet')).toHaveClass('sr-only')
  })

  it('supports existing accent tones accurately', () => {
    const { rerender, container } = render(
      <StatCard
        label="Income"
        icon={Wallet}
        value="₹50,000.00"
        hint="Monthly inflow"
        accent="forest"
      />,
    )

    expect(container.querySelector('.bg-forest')).toBeInTheDocument()

    rerender(
      <StatCard
        label="Savings"
        icon={TrendingUp}
        value="₹15,000.00"
        hint="Saved this month"
        accent="butter"
      />,
    )
    expect(container.querySelector('.bg-butter')).toBeInTheDocument()
  })

  it('renders hero variant with bg-gradient-hero and accessible styling when variant="hero"', () => {
    const { container } = render(
      <StatCard
        label="Net Savings"
        icon={TrendingUp}
        value="₹24,800.00"
        hint="+18% vs last month"
        variant="hero"
      />,
    )

    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('bg-gradient-hero')
    expect(card.className).toContain('shadow-hero')
    expect(screen.getByText('Net Savings')).toHaveClass('text-sage/95')
    expect(screen.getByText('₹24,800.00')).toHaveClass('text-paper')
    expect(container.querySelector('.text-lime-accent')).toBeInTheDocument()
  })

  it('renders hero styling when accent="hero" or accent="emerald"', () => {
    const { container } = render(
      <StatCard
        label="Total Balance"
        icon={Wallet}
        value="₹1,20,000.00"
        hint="Across all accounts"
        accent="hero"
      />,
    )

    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('bg-gradient-hero')
  })
})

