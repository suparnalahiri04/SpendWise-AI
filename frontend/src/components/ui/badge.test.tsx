import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './badge'

describe('Badge UI component', () => {
  it('renders with default neutral tone', () => {
    render(<Badge>Default Badge</Badge>)
    const badge = screen.getByText('Default Badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute('data-slot', 'badge')
    expect(badge.className).toContain('bg-muted')
    expect(badge.className).toContain('text-muted-foreground')
  })

  it('renders all existing tones accurately for backward compatibility', () => {
    const { rerender } = render(<Badge tone="sage">Sage Badge</Badge>)
    let badge = screen.getByText('Sage Badge')
    expect(badge.className).toContain('bg-secondary')

    rerender(<Badge tone="butter">Butter Badge</Badge>)
    badge = screen.getByText('Butter Badge')
    expect(badge.className).toContain('bg-butter/70')

    rerender(<Badge tone="terracotta">Terracotta Badge</Badge>)
    badge = screen.getByText('Terracotta Badge')
    expect(badge.className).toContain('bg-terracotta/15')

    rerender(<Badge tone="outline">Outline Badge</Badge>)
    badge = screen.getByText('Outline Badge')
    expect(badge.className).toContain('border-border')
  })

  it('renders the new accessible lime tone', () => {
    render(<Badge tone="lime">Savings Positive</Badge>)
    const badge = screen.getByText('Savings Positive')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-lime/15')
    expect(badge.className).toContain('text-lime-deep')
    expect(badge.className).toContain('border-lime/30')
  })
})

