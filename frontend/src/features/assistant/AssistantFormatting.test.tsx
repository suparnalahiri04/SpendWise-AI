import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AssistantQueryResponse } from '@/lib/api/types'
import { AssistantFactBreakdown } from './AssistantFactBreakdown'
import { SafeMarkdown } from './SafeMarkdown'

describe('Assistant formatting regression tests', () => {
  it('renders section headings with clean separation and distinct badges', () => {
    const mockResponse: AssistantQueryResponse = {
      query: 'What are my biggest spending categories?',
      intent: 'top_categories',
      answer_markdown: 'Top spending categories:\n1. Shopping: ₹1,000.00',
      facts: [
        {
          metric_key: 'cat_spend_shopping',
          label: 'Spent on Shopping',
          value_formatted: '₹1,000.00',
          raw_amount: '1000.00',
          kind: 'fact',
          category: 'Shopping',
          source: 'transactions',
          notes: '55.6% of expenses (1 txs)',
        },
      ],
      estimates: [
        {
          metric_key: 'projected_month_end',
          label: 'Projected Month-End Outflow',
          value_formatted: '₹54,000.00',
          raw_amount: '54000.00',
          kind: 'estimate',
          category: null,
          source: 'projections',
          notes: 'Run-rate extrapolation',
        },
      ],
      recommendations: [
        {
          metric_key: 'rec_budget',
          label: 'Budget Recommendation',
          value_formatted: 'Track limit',
          raw_amount: null,
          kind: 'recommendation',
          category: 'Shopping',
          source: 'budgets',
          notes: 'Review Shopping budget limits',
        },
      ],
      data_limitations: ['No transactions found for previous month.'],
      suggested_followups: ['How much did I spend this month?'],
      engine: 'deterministic',
    }

    const { container } = render(
      <AssistantFactBreakdown response={mockResponse} onSelectPrompt={() => {}} />,
    )

    // Heading and badge must have whitespace separation, not "Verified FactsGround Truth"
    const verifiedSection = screen.getByRole('region', { name: /verified facts/i })
    expect(verifiedSection.textContent).not.toContain('Verified FactsGround Truth')
    expect(verifiedSection.textContent).toMatch(/Verified Facts\s+Ground Truth/)

    // Fact label and notes must have whitespace separation, not "Spent on Shopping55.6% of expenses (1 txs)"
    expect(verifiedSection.textContent).not.toContain('Spent on Shopping55.6%')
    expect(verifiedSection.textContent).toMatch(/Spent on Shopping\s+55\.6% of expenses \(1 txs\)/)
    expect(verifiedSection.textContent).toContain('₹1,000.00')

    // Estimates section must not merge label and badge
    const estimatesSection = screen.getByRole('region', { name: /estimates and projections/i })
    expect(estimatesSection.textContent).not.toContain('Estimates & ProjectionsEstimated')
    expect(estimatesSection.textContent).toMatch(/Estimates & Projections\s+Estimated/)
    expect(estimatesSection.textContent).toMatch(/Projected Month-End Outflow\s+Run-rate extrapolation/)
    expect(estimatesSection.textContent).toContain('₹54,000.00')

    // Semantic headings must be present
    const headings = container.querySelectorAll('h4')
    const headingTexts = Array.from(headings).map((h) => h.textContent?.trim())
    expect(headingTexts).toContain('Verified Facts')
    expect(headingTexts).toContain('Estimates & Projections')
    expect(headingTexts).toContain('Recommendations')
    expect(headingTexts).toContain('Data Notes')
    expect(headingTexts).toContain('Suggested Follow-ups')
  })

  it('renders markdown headings and separated multi-line text in SafeMarkdown', () => {
    const md = `### Financial Summary for **2026-11**

In **2026-11**, your total recorded expenses are **₹1,800.00**.
First line of details
Second line of details

* **Shopping**: ₹1,000.00 (55.6%)
* **Food/Dining**: ₹500.00 (27.8%)`

    const { container } = render(<SafeMarkdown content={md} />)

    // Check h3 heading is rendered
    const h3 = container.querySelector('h3')
    expect(h3).not.toBeNull()
    expect(h3?.textContent).toContain('Financial Summary for 2026-11')

    // Check multi-line paragraph words are separated, not merged as "detailsSecond"
    const p = container.querySelector('p')
    expect(p?.textContent).not.toContain('detailsSecond')
    expect(p?.textContent).toMatch(/details\s+Second/)

    // Check list items and formatted currency
    const listItems = container.querySelectorAll('li')
    expect(listItems.length).toBe(2)
    expect(listItems[0]?.textContent).toContain('Shopping: ₹1,000.00 (55.6%)')
    expect(listItems[1]?.textContent).toContain('Food/Dining: ₹500.00 (27.8%)')
  })
})
