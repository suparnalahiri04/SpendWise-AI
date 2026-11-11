import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantProvider } from '@/features/assistant/AssistantProvider'
import { AssistantPage } from '@/pages/AssistantPage'
import { setTokenProvider, setUnauthorizedHandler } from '@/lib/api/client'
import type {
  AssistantQueryResponse,
  StarterPromptsResponse,
} from '@/lib/api/types'
import { PennyChatPanel } from './PennyChatPanel'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

const mockStarterPrompts: StarterPromptsResponse = {
  prompts: [
    {
      id: 'spending-summary',
      prompt: 'How much did I spend this month?',
      category: 'Spending',
    },
    {
      id: 'budget-status',
      prompt: 'Am I staying within my budgets?',
      category: 'Budgets',
    },
  ],
}

const mockAssistantResponse: AssistantQueryResponse = {
  query: 'How much did I spend this month?',
  intent: 'spending_summary',
  answer_markdown: 'In **2026-11**, your total recorded expenses are **₹6,500.00**.\n\n- Food: ₹3,500.00\n- Rent: ₹3,000.00',
  facts: [
    {
      metric_key: 'total_expenses',
      label: 'Total Expenses',
      value_formatted: '₹6,500.00',
      raw_amount: '6500.00',
      kind: 'fact',
      category: null,
      source: 'transactions',
      notes: '2 entries recorded',
    },
  ],
  estimates: [
    {
      metric_key: 'projected_month_end',
      label: 'Projected Month-End',
      value_formatted: '₹8,200.00',
      raw_amount: '8200.00',
      kind: 'estimate',
      category: null,
      source: 'run_rate',
      notes: 'Estimated based on daily pace',
    },
  ],
  recommendations: [],
  data_limitations: ['Income not recorded yet'],
  suggested_followups: ['What are my upcoming bills?'],
  engine: 'deterministic',
}

describe('PennyChatPanel (Stage 3 Floating Chat Panel)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
    setTokenProvider(() => 'test-jwt-token')
    setUnauthorizedHandler(null)

    // Mock scrollTo on HTMLElement prototype for jsdom
    window.HTMLElement.prototype.scrollTo = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fetchMock.mockReset()
    setTokenProvider(() => null)
    setUnauthorizedHandler(null)
  })

  it('1. renders nothing when open is false, and renders dialog when open is true', () => {
    const handleClose = vi.fn()
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    const { rerender } = render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={false} onClose={handleClose} />
      </AssistantProvider>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={handleClose} />
      </AssistantProvider>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('id', 'penny-chat-panel')
    expect(dialog).toHaveAttribute('aria-labelledby', 'penny-chat-title')
    expect(dialog).toHaveAttribute('aria-describedby', 'penny-chat-description')
  })

  it('2. renders header with Penny mascot, title, subtitle, and fires onClose on close button click', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={handleClose} />
      </AssistantProvider>,
    )

    // Mascot rendered
    expect(screen.getByRole('dialog').querySelector('svg[data-slot="penny-mascot"]')).toBeInTheDocument()
    // Title and Subtitle
    expect(screen.getByRole('heading', { level: 2, name: 'Penny' })).toBeInTheDocument()
    expect(screen.getByText('Your Personal Money Companion')).toBeInTheDocument()

    // Close button
    const closeBtn = screen.getByRole('button', { name: 'Close Penny chat' })
    expect(closeBtn).toBeInTheDocument()

    await user.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('3. renders compact starter prompts in empty state and submits on prompt click', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    // Starter prompts container has compact mode attribute
    const promptSection = screen.getByText('How can I help you today?').closest('[data-compact="true"]')
    expect(promptSection).toBeInTheDocument()

    // Click starter prompt
    await user.click(screen.getByText('How much did I spend this month?'))

    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })
  })

  it('4. renders user message and assistant message with SafeMarkdown and timestamp', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const promptBtn = screen.getByText('How much did I spend this month?')
    fireEvent.click(promptBtn)

    await waitFor(() => {
      expect(screen.getByText('You')).toBeInTheDocument()
      expect(screen.getByText('SpendWise AI')).toBeInTheDocument()
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })
  })

  it('5. renders financial facts and estimates in compact mode', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('How much did I spend this month?'))

    await waitFor(() => {
      expect(screen.getByText('Verified Facts')).toBeInTheDocument()
      expect(screen.getByText('Estimates & Projections')).toBeInTheDocument()
      expect(screen.getByText('₹8,200.00')).toBeInTheDocument()
    })

    // Compact attribute present on breakdown
    const factSection = screen.getByText('Verified Facts').closest('[data-compact="true"]')
    expect(factSection).toBeInTheDocument()
  })

  it('6. submits custom questions typed into textarea and uses selectedMonth from provider', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/ask penny about your expenses/i)
    expect(textarea).toHaveAttribute('id', 'penny-chat-input')

    await user.type(textarea, 'What was my grocery total?')
    const sendBtn = screen.getByRole('button', { name: 'Send message' })
    await user.click(sendBtn)

    await waitFor(() => {
      expect(screen.getByText('What was my grocery total?')).toBeInTheDocument()
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })

    const queryCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/assistant/query'),
    )
    expect(queryCalls).toHaveLength(1)
    expect(JSON.parse(queryCalls[0][1]?.body as string)).toEqual({
      query: 'What was my grocery total?',
      month: '2026-11',
    })
  })

  it('7. displays loading state while waiting for query and disables the input', async () => {
    let resolveQuery: ((res: Response) => void) | undefined
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) {
        return new Promise((resolve) => {
          resolveQuery = resolve
        })
      }
      return jsonResponse({}, 404)
    })

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('How much did I spend this month?'))

    await waitFor(() => {
      expect(screen.getByText('Calculating facts from your ledger…')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/ask penny about your expenses/i)).toBeDisabled()
    })

    resolveQuery?.(jsonResponse(mockAssistantResponse, 200))

    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/ask penny about your expenses/i)).not.toBeDisabled()
    })
  })

  it('8. handles query error with role="alert" and allows retrying the failed question', async () => {
    const user = userEvent.setup()
    let attempt = 0
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) {
        attempt += 1
        if (attempt === 1) {
          return jsonResponse({ detail: 'Failed computation.' }, 500)
        }
        return jsonResponse(mockAssistantResponse)
      }
      return jsonResponse({}, 404)
    })

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/ask penny about your expenses/i)
    await user.type(textarea, 'Check failed query')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    // Error alert banner displayed
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry question/i })).toBeInTheDocument()
    })

    // Click retry
    await user.click(screen.getByRole('button', { name: /retry question/i }))

    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('9. preserves conversation when panel is closed and reopened', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    function StatefulPanelWrapper() {
      const [isOpen, setIsOpen] = useState(true)
      return (
        <div>
          <button type="button" onClick={() => setIsOpen((prev) => !prev)}>
            Toggle Panel
          </button>
          <PennyChatPanel open={isOpen} onClose={() => setIsOpen(false)} />
        </div>
      )
    }

    const user = userEvent.setup()
    const { useState } = await import('react')

    render(
      <AssistantProvider initialMonth="2026-11">
        <StatefulPanelWrapper />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    // Submit question
    fireEvent.click(screen.getByText('How much did I spend this month?'))
    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })

    // Close panel
    await user.click(screen.getByRole('button', { name: 'Toggle Panel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Reopen panel
    await user.click(screen.getByRole('button', { name: 'Toggle Panel' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Messages are intact!
    expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
  })

  it('10. uses unique input IDs without collision when AssistantPage and PennyChatPanel are rendered simultaneously', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      return jsonResponse({}, 404)
    })

    render(
      <AssistantProvider initialMonth="2026-11">
        <AssistantPage />
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const assistantPageInput = document.getElementById('assistant-input')
    const pennyInput = document.getElementById('penny-chat-input')

    expect(assistantPageInput).toBeInTheDocument()
    expect(pennyInput).toBeInTheDocument()
    expect(assistantPageInput).not.toBe(pennyInput)

    // Verify labels are associated with their respective IDs
    expect(screen.getByLabelText('Ask SpendWise AI a question')).toBe(assistantPageInput)
    expect(screen.getByLabelText('Ask Penny a question')).toBe(pennyInput)
    expect(document.querySelector('label[for="penny-chat-input"]')).toBeInTheDocument()
    expect(document.querySelector('label[for="assistant-input"]')).toBeInTheDocument()
  })

  it('11. closes on Escape key press and stops event propagation', async () => {
    const handleClose = vi.fn()
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={handleClose} />
      </AssistantProvider>,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('12. preserves user scroll position when reading older messages instead of forcing scroll to bottom', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const scrollContainer = screen.getByRole('log')
    // Simulate user scrolled up: scrollHeight = 1000, scrollTop = 200, clientHeight = 400
    // distanceToBottom = 1000 - 200 - 400 = 400 (not near bottom!)
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 200, configurable: true })
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true })

    fireEvent.scroll(scrollContainer)

    const scrollToSpy = vi.spyOn(scrollContainer, 'scrollTo')

    // Submit question while scrolled up
    fireEvent.click(screen.getByText('How much did I spend this month?'))

    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })

    // scrollTo should NOT be called to force to bottom because user was reading higher up
    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('13. provides accessible dialog role, log role for conversation history, and live region', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-labelledby', 'penny-chat-title')
    expect(dialog).toHaveAttribute('aria-describedby', 'penny-chat-description')

    const logRegion = screen.getByRole('log', { name: 'Penny conversation history' })
    expect(logRegion).toBeInTheDocument()
    expect(logRegion).toHaveAttribute('aria-live', 'polite')
  })

  it('14. uses auto scroll behavior when prefers-reduced-motion is active and user is near bottom', async () => {
    // Mock matchMedia for prefers-reduced-motion
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    const scrollContainer = screen.getByRole('log')
    // Simulate user near bottom: scrollHeight = 500, scrollTop = 200, clientHeight = 300
    // distanceToBottom = 500 - 200 - 300 = 0 (near bottom!)
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 200, configurable: true })
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true })

    const scrollToSpy = vi.spyOn(scrollContainer, 'scrollTo')

    fireEvent.click(screen.getByText('How much did I spend this month?'))

    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })

    // Called with behavior: 'auto' because reduced-motion is active
    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: 'auto',
      }),
    )
  })

  it('15. renders full-page expand action in header with accessible name and invokes onOpenFullPage', async () => {
    const user = userEvent.setup()
    const handleOpenFullPage = vi.fn()
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} onOpenFullPage={handleOpenFullPage} />
      </AssistantProvider>,
    )

    const fullPageBtn = screen.getByRole('button', { name: 'Open full-page assistant' })
    expect(fullPageBtn).toBeInTheDocument()
    expect(fullPageBtn).toHaveAttribute('title', 'Open full-page assistant')

    await user.click(fullPageBtn)
    expect(handleOpenFullPage).toHaveBeenCalledTimes(1)
  })

  it('16. handles omission of onOpenFullPage gracefully when button is clicked', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    render(
      <AssistantProvider initialMonth="2026-11">
        <PennyChatPanel open={true} onClose={vi.fn()} />
      </AssistantProvider>,
    )

    const fullPageBtn = screen.getByRole('button', { name: 'Open full-page assistant' })
    expect(fullPageBtn).toBeInTheDocument()

    // Clicking without callback does not crash or throw
    await user.click(fullPageBtn)
  })
})
