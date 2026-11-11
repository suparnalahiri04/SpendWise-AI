import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContourPattern } from './ContourPattern'

describe('ContourPattern', () => {
  it('renders the background variant by default with correct viewBox and slot attributes', () => {
    const { container } = render(<ContourPattern />)
    const pattern = container.querySelector('[data-slot="contour-pattern"]')

    expect(pattern).toBeInTheDocument()
    expect(pattern).toHaveAttribute('data-variant', 'background')

    const svg = pattern?.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('viewBox', '0 0 1440 900')
  })

  it('renders the featured variant when explicitly requested', () => {
    const { container } = render(<ContourPattern variant="featured" />)
    const pattern = container.querySelector('[data-slot="contour-pattern"]')

    expect(pattern).toBeInTheDocument()
    expect(pattern).toHaveAttribute('data-variant', 'featured')

    const svg = pattern?.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('viewBox', '0 0 800 400')
  })

  it('renders the approved very-dense path count for the background variant (19–21 paths)', () => {
    const { container } = render(<ContourPattern variant="background" />)
    const svg = container.querySelector('svg')
    const paths = Array.from(svg?.querySelectorAll('path') ?? [])

    expect(paths.length).toBeGreaterThanOrEqual(19)
    expect(paths.length).toBeLessThanOrEqual(21)
    expect(paths.length).toBe(21)
  })

  it('preserves the original featured variant path count (7 paths)', () => {
    const { container } = render(<ContourPattern variant="featured" />)
    const svg = container.querySelector('svg')
    const paths = Array.from(svg?.querySelectorAll('path') ?? [])

    expect(paths.length).toBe(7)
  })

  it('restricts featured variant contours to the upper-right region without spanning the entire canvas', () => {
    const { container } = render(<ContourPattern variant="featured" />)
    const svg = container.querySelector('svg')
    const paths = Array.from(svg?.querySelectorAll('path') ?? [])

    expect(paths.length).toBeGreaterThan(0)

    // All path start coordinates in featured variant should start on right side (x >= 480 on 800-wide viewBox)
    for (const path of paths) {
      const d = path.getAttribute('d') ?? ''
      const match = d.match(/^M\s*([\d.-]+)/)
      if (match) {
        const startX = parseFloat(match[1])
        expect(startX).toBeGreaterThanOrEqual(480)
      }
    }
  })

  it('enforces approved opacity bounds for both variants (background = 7%, featured = 6%)', () => {
    const { container: bgContainer } = render(<ContourPattern variant="background" />)
    const bgPattern = bgContainer.querySelector('[data-slot="contour-pattern"]')

    // Background variant target: exactly 7% opacity
    expect(bgPattern).toHaveClass('opacity-[0.07]')
    expect(bgPattern).not.toHaveClass('opacity-[0.04]')
    expect(bgPattern).not.toHaveClass('opacity-[0.06]')
    expect(bgPattern).toHaveClass('text-forest')

    const { container: featuredContainer } = render(<ContourPattern variant="featured" />)
    const featuredPattern = featuredContainer.querySelector('[data-slot="contour-pattern"]')

    // Featured variant target: 6% opacity
    expect(featuredPattern).toHaveClass('opacity-[0.06]')
    expect(featuredPattern).not.toHaveClass('opacity-[0.07]')
    expect(featuredPattern).toHaveClass('text-forest')
  })

  it('guarantees decorative accessibility attributes and screen reader invisibility', () => {
    const { container } = render(<ContourPattern />)
    const pattern = container.querySelector('[data-slot="contour-pattern"]')
    const svg = pattern?.querySelector('svg')

    // Both wrapper and SVG must be explicitly hidden from assistive tech
    expect(pattern).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')

    // Must not contain any readable text, title or desc tags
    expect(pattern?.textContent).toBe('')
    expect(svg?.querySelector('title')).toBeNull()
    expect(svg?.querySelector('desc')).toBeNull()
  })

  it('enforces pointer-event safety to prevent click or touch interception', () => {
    const { container } = render(<ContourPattern />)
    const pattern = container.querySelector('[data-slot="contour-pattern"]')

    expect(pattern).toHaveClass('pointer-events-none')
    expect(pattern).toHaveClass('select-none')
    expect(pattern).toHaveClass('overflow-hidden')
  })

  it('contains zero interactive, focusable, or form elements', () => {
    const { container } = render(<ContourPattern variant="featured" />)

    const interactiveElements = container.querySelectorAll(
      'button, a, input, select, textarea, [tabindex], [role="button"]',
    )
    expect(interactiveElements.length).toBe(0)
  })

  it('supports custom className merging while preserving core decorative safety classes', () => {
    const { container } = render(
      <ContourPattern variant="featured" className="custom-test-class top-0 right-0" />,
    )
    const pattern = container.querySelector('[data-slot="contour-pattern"]')

    expect(pattern).toHaveClass('custom-test-class')
    expect(pattern).toHaveClass('top-0')
    expect(pattern).toHaveClass('right-0')
    expect(pattern).toHaveClass('pointer-events-none')
    expect(pattern).toHaveClass('select-none')
  })
})
