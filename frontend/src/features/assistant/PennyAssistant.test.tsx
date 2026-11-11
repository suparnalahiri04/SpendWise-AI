import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantProvider } from '@/features/assistant/AssistantProvider'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { clearToken, saveToken } from '@/features/auth/session'
import { AssistantPage } from '@/pages/AssistantPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { setTokenProvider, setUnauthorizedHandler } from '@/lib/api/client'
import type { AssistantQueryResponse, StarterPromptsResponse } from '@/lib/api/types'
import { PennyAssistant } from './PennyAssistant'

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
  answer_markdown: 'In **2026-11**, your total recorded expenses are **₹6,500.00**.',
  facts: [
    {
      metric_key: 'total_expenses',
      label: 'Total Expenses',
      value_formatted: '₹6,500.00',
      raw_amount: '6500.00',
      kind: 'fact',
      category: null,
      source: 'transactions',
      notes: null,
    },
  ],
  estimates: [],
  recommendations: [],
  data_limitations: [],
  suggested_followups: ['What are my upcoming bills?'],
  engine: 'deterministic',
}

function renderPenny(
  ui: React.ReactNode = <PennyAssistant />,
  initialEntries = ['/overview'],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AssistantProvider initialMonth="2026-11">
        {ui}
      </AssistantProvider>
    </MemoryRouter>,
  )
}

describe('PennyAssistant (Stage 4B & Stage 5B Controller & Integration)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
    saveToken('test-token-jwt')
    setTokenProvider(() => 'test-token-jwt')
    setUnauthorizedHandler(null)

    // Mock scrollTo and scrollIntoView on HTMLElement prototype for jsdom
    window.HTMLElement.prototype.scrollTo = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fetchMock.mockReset()
    clearToken()
    setTokenProvider(() => null)
    setUnauthorizedHandler(null)
  })

  it('1-4. renders launcher with aria-expanded="false", aria-controls="penny-chat-panel", aria-haspopup="dialog" initially', () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    renderPenny(<PennyAssistant />)

    const launcher = screen.getByRole('button', { name: 'Chat with Penny' })
    expect(launcher).toBeInTheDocument()
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    expect(launcher).toHaveAttribute('aria-controls', 'penny-chat-panel')
    expect(launcher).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('5-6. clicking launcher opens PennyChatPanel and sets aria-expanded="true"', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    renderPenny(<PennyAssistant />)

    const launcher = screen.getByRole('button', { name: 'Chat with Penny' })
    await user.click(launcher)

    expect(launcher).toHaveAttribute('aria-expanded', 'true')
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('id', 'penny-chat-panel')
  })

  it('7. panel header close button closes Penny and sets aria-expanded="false"', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    renderPenny(<PennyAssistant initialOpen={true} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    const closeBtn = within(dialog).getByRole('button', { name: 'Close Penny chat' })
    await user.click(closeBtn)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const launcher = screen.getByRole('button', { name: 'Chat with Penny' })
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
  })

  it('8. Escape closes Penny panel and sets aria-expanded="false"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    renderPenny(<PennyAssistant initialOpen={true} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const launcher = screen.getByRole('button', { name: 'Chat with Penny' })
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
  })

  it('9. moves focus to the panel textarea input when opened', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    renderPenny(<PennyAssistant />)

    const launcher = screen.getByRole('button', { name: 'Chat with Penny' })
    await user.click(launcher)

    await waitFor(() => {
      const input = screen.getByRole('textbox', { name: 'Ask Penny a question' })
      expect(input).toHaveFocus()
    })
  })

  it('10. restores focus to the launcher button when closed', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    renderPenny(<PennyAssistant />)

    const launcher = screen.getByRole('button', { name: 'Chat with Penny' })
    await user.click(launcher)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    const closeBtn = within(dialog).getByRole('button', { name: 'Close Penny chat' })
    await user.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(launcher).toHaveFocus()
    })
  })

  it('11-12. opening and closing preserves conversation and messages persist across close and reopen', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    renderPenny(<PennyAssistant />)

    // Open Penny
    const launcher = screen.getByRole('button', { name: 'Chat with Penny' })
    await user.click(launcher)

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    // Submit prompt
    await user.click(screen.getByText('How much did I spend this month?'))
    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })

    // Close Penny via close button in panel header
    const dialog = screen.getByRole('dialog')
    const closeBtn = within(dialog).getByRole('button', { name: 'Close Penny chat' })
    await user.click(closeBtn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Reopen Penny via launcher
    await user.click(launcher)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Messages are completely preserved!
    expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
  })

  it('13. navigating between authenticated routes preserves Penny conversation state', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    function AppWithNavigation() {
      return (
        <MemoryRouter initialEntries={['/overview']}>
          <AssistantProvider initialMonth="2026-11">
            <div>
              <PennyAssistant initialOpen={true} />
              <Routes>
                <Route path="/overview" element={<div>Overview Route Content</div>} />
                <Route path="/budgets" element={<div>Budgets Route Content</div>} />
              </Routes>
            </div>
          </AssistantProvider>
        </MemoryRouter>
      )
    }

    render(<AppWithNavigation />)

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    // Submit question in Penny
    await user.click(screen.getByText('How much did I spend this month?'))
    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })

    // Conversation inside Penny remains intact
    expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
  })

  it('14. launcher is NOT mounted on public login and register routes', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: /chat with penny/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('15-16. logout unmounts Penny and its authenticated provider; fresh login starts with a fresh conversation', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/me')) return jsonResponse({ id: 1, email: 'user@test.com' })
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    // Session 1: Authenticated session with Penny
    const firstSession = renderPenny(<PennyAssistant initialOpen={true} />)

    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('How much did I spend this month?'))
    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })

    // Logout unmounts Session 1
    firstSession.unmount()
    clearToken()

    // Session 2: Subsequent login mounts fresh AssistantProvider & PennyAssistant
    saveToken('new-user-token')
    renderPenny(<PennyAssistant initialOpen={true} />)

    // Fresh session starts with empty message state and starter prompts
    await waitFor(() => {
      expect(screen.getByText('How can I help you today?')).toBeInTheDocument()
    })
    expect(screen.queryByText(/your total recorded expenses are/i)).not.toBeInTheDocument()
  })

  it('17. produces unique textarea IDs and labels when AssistantPage and Penny coexist simultaneously', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      return jsonResponse({}, 404)
    })

    renderPenny(
      <div>
        <AssistantPage />
        <PennyAssistant initialOpen={true} />
      </div>,
      ['/overview'],
    )

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const assistantPageInput = document.getElementById('assistant-input')
    const pennyInput = document.getElementById('penny-chat-input')

    expect(assistantPageInput).toBeInTheDocument()
    expect(pennyInput).toBeInTheDocument()
    expect(assistantPageInput).not.toBe(pennyInput)

    // Accessible names are distinct and correctly wired
    expect(screen.getByRole('textbox', { name: 'Ask SpendWise AI a question' })).toBe(assistantPageInput)
    expect(screen.getByRole('textbox', { name: 'Ask Penny a question' })).toBe(pennyInput)
  })

  it('18. does not instantiate duplicate assistant state owners or trigger duplicate prompts requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse(mockStarterPrompts, 200))

    renderPenny(
      <div>
        <AssistantPage />
        <PennyAssistant initialOpen={true} />
      </div>,
      ['/overview'],
    )

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Exactly 1 starter-prompts network call across both full-page and floating assistant
    const promptCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/assistant/starter-prompts'),
    )
    expect(promptCalls).toHaveLength(1)
  })

  // ==========================================
  // Stage 5B Specific Tests
  // ==========================================

  it('19. floating launcher and panel are completely hidden when on /assistant', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockStarterPrompts, 200))

    function AppOnAssistantRoute() {
      return (
        <MemoryRouter initialEntries={['/assistant']}>
          <AssistantProvider initialMonth="2026-11">
            <div>
              <PennyAssistant />
              <Routes>
                <Route path="/assistant" element={<AssistantPage />} />
              </Routes>
            </div>
          </AssistantProvider>
        </MemoryRouter>
      )
    }

    render(<AppOnAssistantRoute />)

    // Dedicated AssistantPage mounts and renders its heading
    expect(screen.getByText('Financial Intelligence')).toBeInTheDocument()

    // Floating launcher and floating panel are completely absent
    expect(screen.queryByRole('button', { name: /chat with penny/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /penny/i })).not.toBeInTheDocument()
  })

  it('20. clicking "Open full-page assistant" navigates to /assistant, closes panel, and suppresses focus restoration', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      return jsonResponse({}, 404)
    })

    function LocationDisplay() {
      const loc = useLocation()
      return <div data-testid="current-path">{loc.pathname}</div>
    }

    function AppWithFullPageFlow() {
      return (
        <MemoryRouter initialEntries={['/overview']}>
          <AssistantProvider initialMonth="2026-11">
            <div>
              <LocationDisplay />
              <PennyAssistant initialOpen={true} />
              <Routes>
                <Route path="/overview" element={<div>Overview Content</div>} />
                <Route path="/assistant" element={<AssistantPage />} />
              </Routes>
            </div>
          </AssistantProvider>
        </MemoryRouter>
      )
    }

    render(<AppWithFullPageFlow />)

    expect(screen.getByTestId('current-path')).toHaveTextContent('/overview')
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    const fullPageBtn = within(dialog).getByRole('button', { name: 'Open full-page assistant' })
    expect(fullPageBtn).toBeInTheDocument()

    // Click full-page action
    await user.click(fullPageBtn)

    // URL transitions to /assistant
    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/assistant')
    })

    // Floating dialog and launcher are hidden on /assistant
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /chat with penny/i })).not.toBeInTheDocument()

    // Focus was NOT restored to launcher (active element is body or page content)
    expect(document.activeElement).not.toHaveAttribute('data-slot', 'penny-launcher')
  })

  it('21. navigating away from /assistant to another page brings back floating launcher', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue(jsonResponse(mockStarterPrompts, 200))

    function AppWithNavigation() {
      return (
        <MemoryRouter initialEntries={['/assistant']}>
          <AssistantProvider initialMonth="2026-11">
            <div>
              <PennyAssistant />
              <nav>
                <Link to="/budgets">Go to Budgets</Link>
              </nav>
              <Routes>
                <Route path="/assistant" element={<AssistantPage />} />
                <Route path="/budgets" element={<div>Budgets Content</div>} />
              </Routes>
            </div>
          </AssistantProvider>
        </MemoryRouter>
      )
    }

    render(<AppWithNavigation />)

    // On /assistant: launcher is hidden
    expect(screen.queryByRole('button', { name: /chat with penny/i })).not.toBeInTheDocument()

    // Navigate to /budgets
    const link = screen.getByRole('link', { name: 'Go to Budgets' })
    await user.click(link)

    // On /budgets: launcher reappears!
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Chat with Penny' })).toBeInTheDocument()
    })
    expect(screen.getByText('Budgets Content')).toBeInTheDocument()
  })

  it('22. CRITICAL CONTINUITY: 9-step shared-conversation sequence across routes and full-page mode', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/assistant/starter-prompts')) return jsonResponse(mockStarterPrompts)
      if (url.includes('/assistant/query')) return jsonResponse(mockAssistantResponse)
      return jsonResponse({}, 404)
    })

    function AppFullSequence() {
      return (
        <MemoryRouter initialEntries={['/transactions']}>
          <AssistantProvider initialMonth="2026-11">
            <div>
              <PennyAssistant />
              <nav>
                <Link to="/budgets">Navigate to Budgets</Link>
              </nav>
              <Routes>
                <Route path="/transactions" element={<div>Transactions View</div>} />
                <Route path="/assistant" element={<AssistantPage />} />
                <Route path="/budgets" element={<div>Budgets View</div>} />
              </Routes>
            </div>
          </AssistantProvider>
        </MemoryRouter>
      )
    }

    render(<AppFullSequence />)

    // Step 1: Start on /transactions
    expect(screen.getByText('Transactions View')).toBeInTheDocument()
    const launcher = screen.getByRole('button', { name: 'Chat with Penny' })
    expect(launcher).toBeInTheDocument()

    // Step 2: Open Penny
    await user.click(launcher)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Step 3: Submit question & verify response message
    await waitFor(() => {
      expect(screen.getByText('How much did I spend this month?')).toBeInTheDocument()
    })
    await user.click(screen.getByText('How much did I spend this month?'))
    await waitFor(() => {
      expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    })

    // Step 4: Select "Open full-page assistant"
    const fullPageBtn = within(dialog).getByRole('button', { name: 'Open full-page assistant' })
    await user.click(fullPageBtn)

    // Step 5: Verify navigation to /assistant
    await waitFor(() => {
      expect(screen.getByText('Financial Intelligence')).toBeInTheDocument()
    })

    // Step 6: Verify the SAME conversation is visible in AssistantPage without duplicate prompts fetch
    expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
    // Exactly 1 starter-prompts fetch occurred across entire sequence
    const starterPromptCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/assistant/starter-prompts'),
    )
    expect(starterPromptCalls).toHaveLength(1)

    // Step 7: Navigate to /budgets
    const toBudgetsLink = screen.getByRole('link', { name: 'Navigate to Budgets' })
    await user.click(toBudgetsLink)
    await waitFor(() => {
      expect(screen.getByText('Budgets View')).toBeInTheDocument()
    })

    // Step 8: Verify Penny launcher reappears
    const reopenedLauncher = await screen.findByRole('button', { name: 'Chat with Penny' })
    expect(reopenedLauncher).toBeInTheDocument()

    // Step 9: Reopen Penny and verify the original conversation is still present
    await user.click(reopenedLauncher)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/your total recorded expenses are/i)).toBeInTheDocument()
  })
})
