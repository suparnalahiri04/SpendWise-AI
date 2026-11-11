import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PennyLauncher } from './PennyLauncher'
import { PennyMascot } from './PennyMascot'

const fetchSpy = vi.fn<typeof fetch>()

describe('PennyMascot & PennyLauncher (Stage 1 Visual Identity)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchSpy.mockReset()
  })

  describe('PennyMascot', () => {
    it('renders the original SVG mascot as decorative by default', () => {
      const { container } = render(<PennyMascot />)

      const svg = container.querySelector('svg[data-slot="penny-mascot"]')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute('viewBox', '0 0 64 64')
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).toHaveAttribute('focusable', 'false')
      expect(svg).toHaveAttribute('data-size', 'md')
      expect(svg).toHaveClass('size-8')
    })

    it('exposes accessible img role and label when decorative is false', () => {
      render(<PennyMascot decorative={false} label="Penny companion avatar" />)

      const img = screen.getByRole('img', { name: 'Penny companion avatar' })
      expect(img).toBeInTheDocument()
      expect(img).not.toHaveAttribute('aria-hidden')
    })

    it('supports sm, md, lg, and xl size variations', () => {
      const { rerender, container } = render(<PennyMascot size="sm" />)
      let svg = container.querySelector('svg[data-slot="penny-mascot"]')
      expect(svg).toHaveAttribute('data-size', 'sm')
      expect(svg).toHaveClass('size-6')

      rerender(<PennyMascot size="md" />)
      svg = container.querySelector('svg[data-slot="penny-mascot"]')
      expect(svg).toHaveAttribute('data-size', 'md')
      expect(svg).toHaveClass('size-8')

      rerender(<PennyMascot size="lg" />)
      svg = container.querySelector('svg[data-slot="penny-mascot"]')
      expect(svg).toHaveAttribute('data-size', 'lg')
      expect(svg).toHaveClass('size-10')

      rerender(<PennyMascot size="xl" />)
      svg = container.querySelector('svg[data-slot="penny-mascot"]')
      expect(svg).toHaveAttribute('data-size', 'xl')
      expect(svg).toHaveClass('size-14')
    })
  })

  describe('PennyLauncher', () => {
    it('renders as an icon-only button with accessible name and tooltip "Chat with Penny"', () => {
      render(<PennyLauncher />)

      const button = screen.getByRole('button', { name: 'Chat with Penny' })
      expect(button).toBeInTheDocument()
      expect(button).toHaveAttribute('type', 'button')
      expect(button).toHaveAttribute('aria-label', 'Chat with Penny')
      expect(button).toHaveAttribute('title', 'Chat with Penny')

      // Icon-only: no permanent text label inside the launcher
      expect(button.textContent).toBe('')

      // Contains the decorative Penny mascot SVG
      const mascot = button.querySelector('svg[data-slot="penny-mascot"]')
      expect(mascot).toBeInTheDocument()
      expect(mascot).toHaveAttribute('aria-hidden', 'true')
      expect(mascot).toHaveAttribute('data-size', 'lg')
    })

    it('applies fixed bottom-right positioning, circular 56x56 touch target, and reduced-motion classes', () => {
      render(<PennyLauncher />)

      const button = screen.getByRole('button', { name: 'Chat with Penny' })
      expect(button).toHaveClass('fixed')
      expect(button).toHaveClass('rounded-full')
      expect(button).toHaveClass('size-14')
      expect(button).toHaveClass('bg-forest')
      expect(button).toHaveClass('motion-reduce:transition-none')
      expect(button).toHaveClass('focus-visible:ring-2')
    })

    it('invokes optional onClick callback via mouse click and keyboard activation without calling any APIs', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(<PennyLauncher onClick={handleClick} />)

      const button = screen.getByRole('button', { name: 'Chat with Penny' })
      await user.click(button)
      expect(handleClick).toHaveBeenCalledTimes(1)

      button.focus()
      expect(button).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(handleClick).toHaveBeenCalledTimes(2)

      // Zero network requests triggered on mount or interaction
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('respects disabled state and prevents click callbacks when disabled', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(<PennyLauncher disabled onClick={handleClick} />)

      const button = screen.getByRole('button', { name: 'Chat with Penny' })
      expect(button).toBeDisabled()
      expect(button).toHaveClass('disabled:opacity-50')

      await user.click(button)
      expect(handleClick).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})

