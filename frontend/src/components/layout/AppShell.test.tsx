import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { MotionConfig } from 'motion/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantProvider } from '@/features/assistant/AssistantProvider'
import { PeriodContext, type PeriodContextValue } from '@/features/period/period'
import { AppShell } from './AppShell'

const mockLogout = vi.fn()

// Mock useAuth for Sidebar
vi.mock('@/features/auth/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'alex@spendwise.ai', full_name: 'Alex Mercer' },
    isAuthenticated: true,
    logout: mockLogout,
  }),
}))

// Mock useAlerts for NotificationsMenu
vi.mock('@/features/alerts/useAlerts', () => ({
  useAlerts: () => ({
    alerts: [],
    loading: false,
    reload: vi.fn(),
    dismissAlert: vi.fn(),
  }),
}))

function renderAppShell(
  children: React.ReactNode = <div>Test Page Content</div>,
  initialEntries: string[] = ['/'],
) {
  const periodValue: PeriodContextValue = {
    period: 'this-month',
    periodLabel: 'This month',
    setPeriod: vi.fn(),
  }

  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter initialEntries={initialEntries}>
        <PeriodContext.Provider value={periodValue}>
          <AssistantProvider initialMonth="2026-11">
            <AppShell>{children}</AppShell>
          </AssistantProvider>
        </PeriodContext.Provider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

describe('AppShell Organic Pattern Integration', () => {
  beforeEach(() => {
    mockLogout.mockClear()
  })

  it('renders page children successfully inside main content area', () => {
    renderAppShell(<div data-testid="dashboard-content">Dashboard Content</div>)

    expect(screen.getByTestId('dashboard-content')).toBeInTheDocument()
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
  })

  it('renders the approved ContourPattern background variant exactly once in main canvas', () => {
    const { container } = renderAppShell()

    const main = container.querySelector('main#main-content')
    expect(main).toBeInTheDocument()

    // Query pattern specifically within main
    const patterns = main?.querySelectorAll('[data-slot="contour-pattern"]')
    expect(patterns?.length).toBe(1)

    const pattern = patterns?.[0]
    expect(pattern).toHaveAttribute('data-variant', 'background')
    expect(pattern).toHaveClass('opacity-[0.07]')
    expect(pattern).toHaveClass('pointer-events-none')
    expect(pattern).toHaveClass('absolute')
    expect(pattern).toHaveClass('inset-0')
  })

  it('layers the pattern at z-0 behind the content container at z-10', () => {
    const { container } = renderAppShell(<div>Layering Content</div>)

    const main = container.querySelector('main#main-content')
    const pattern = main?.querySelector('[data-slot="contour-pattern"]')
    expect(pattern).toHaveClass('z-0')

    // Children wrapper container
    const contentWrapper = main?.querySelector('.relative.z-10')
    expect(contentWrapper).toBeInTheDocument()
    expect(contentWrapper).toContainElement(screen.getByText('Layering Content'))
  })

  it('ensures sidebar and header do not contain contour pattern instances', () => {
    const { container } = renderAppShell()

    const sidebar = container.querySelector('aside')
    expect(sidebar).toBeInTheDocument()
    expect(sidebar?.querySelector('[data-slot="contour-pattern"]')).toBeNull()

    const header = container.querySelector('header')
    expect(header).toBeInTheDocument()
    expect(header?.querySelector('[data-slot="contour-pattern"]')).toBeNull()
  })

  it('retains decorative accessibility on the integrated pattern', () => {
    const { container } = renderAppShell()

    const pattern = container.querySelector('[data-slot="contour-pattern"]')
    expect(pattern).toHaveAttribute('aria-hidden', 'true')

    const svg = pattern?.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
  })

  it('renders Penny launcher button at root of AppShell', () => {
    renderAppShell()

    const launcher = screen.getByRole('button', { name: 'Chat with Penny' })
    expect(launcher).toBeInTheDocument()
    expect(launcher).toHaveAttribute('data-slot', 'penny-launcher')
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    expect(launcher).toHaveAttribute('aria-controls', 'penny-chat-panel')
  })

  it('enables vertical scrolling on the fixed desktop sidebar without locking inner height to h-full', () => {
    const { container } = renderAppShell()

    const sidebar = container.querySelector('aside')
    expect(sidebar).toBeInTheDocument()
    expect(sidebar).toHaveClass('fixed', 'inset-y-0', 'left-0', 'w-68', 'overflow-y-auto', 'overflow-x-hidden')
    expect(sidebar).toHaveClass('bg-gradient-to-b', 'from-[#123C30]', 'via-[#174C39]', 'to-[#23694A]')

    const contentWrapper = sidebar?.firstElementChild
    expect(contentWrapper).toHaveClass('min-h-full', 'shrink-0', 'px-4', 'py-6')
    expect(contentWrapper).not.toHaveClass('h-full')

    if (!sidebar) {
      throw new Error('Expected desktop sidebar element')
    }
    const sidebarQueries = within(sidebar)
    expect(sidebarQueries.getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(sidebarQueries.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(sidebarQueries.getByText('Signed in')).toBeInTheDocument()
    expect(sidebarQueries.getByText('alex@spendwise.ai')).toBeInTheDocument()
  })

  it('enables vertical scrolling in the mobile navigation drawer and keeps the close button in a non-scrolling header sibling', () => {
    renderAppShell()

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('fixed', 'inset-y-0', 'left-0', 'flex', 'flex-col', 'overflow-hidden')
    expect(dialog).toHaveClass('bg-gradient-to-b', 'from-[#123C30]', 'via-[#174C39]', 'to-[#23694A]')

    const headerRegion = dialog.querySelector('[data-slot="sheet-header"]')
    const scrollRegion = dialog.querySelector('[data-slot="sheet-scroll"]')
    expect(headerRegion).toBeInTheDocument()
    expect(scrollRegion).toBeInTheDocument()
    expect(headerRegion).toHaveClass('relative', 'z-20', 'shrink-0')
    expect(scrollRegion).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overflow-x-hidden')
    expect(headerRegion?.parentElement).toBe(scrollRegion?.parentElement)
    expect(headerRegion?.nextElementSibling).toBe(scrollRegion)

    const contentWrapper = scrollRegion?.querySelector('div.flex.flex-col.gap-8')
    expect(contentWrapper).toHaveClass('min-h-full', 'shrink-0', 'px-4', 'py-6', 'pt-2')
    expect(contentWrapper).not.toHaveClass('h-full')

    const closeButton = within(dialog).getByRole('button', { name: 'Close navigation' })
    expect(headerRegion).toContainElement(closeButton)
    expect(scrollRegion).not.toContainElement(closeButton)
    expect(closeButton).not.toHaveClass('absolute', 'right-3', 'top-5')
    expect(within(scrollRegion as HTMLElement).getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(within(scrollRegion as HTMLElement).getByText('alex@spendwise.ai')).toBeInTheDocument()
  })

  it('closes the mobile navigation drawer from both top and scrolled positions without navigating away from /statements', async () => {
    const user = userEvent.setup()

    function RouteProbe() {
      const location = useLocation()
      return <div data-testid="current-route">{location.pathname}</div>
    }

    renderAppShell(<RouteProbe />, ['/statements'])
    expect(screen.getByTestId('current-route')).toHaveTextContent('/statements')

    // Attempt 1: close from top (scrollTop = 0)
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    let dialog = screen.getByRole('dialog')
    let headerRegion = dialog.querySelector('[data-slot="sheet-header"]') as HTMLElement
    let scrollRegion = dialog.querySelector('[data-slot="sheet-scroll"]') as HTMLElement
    expect(scrollRegion.scrollTop).toBe(0)

    let closeButton = within(headerRegion).getByRole('button', { name: 'Close navigation' })
    await user.click(closeButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('current-route')).toHaveTextContent('/statements')

    // Attempt 2: reopen, scroll down, and close again
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    dialog = screen.getByRole('dialog')
    headerRegion = dialog.querySelector('[data-slot="sheet-header"]') as HTMLElement
    scrollRegion = dialog.querySelector('[data-slot="sheet-scroll"]') as HTMLElement
    scrollRegion.scrollTop = 320
    fireEvent.scroll(scrollRegion)

    closeButton = within(headerRegion).getByRole('button', { name: 'Close navigation' })
    expect(scrollRegion).not.toContainElement(closeButton)
    await user.click(closeButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('current-route')).toHaveTextContent('/statements')
  })

  it('removes the duplicate top-right Profile menu while preserving PeriodSelector and NotificationsMenu', () => {
    const { container } = renderAppShell()

    const header = container.querySelector('header')
    expect(header).toBeInTheDocument()
    expect(within(header as HTMLElement).queryByRole('button', { name: 'Profile menu' })).not.toBeInTheDocument()
    expect(within(header as HTMLElement).getByRole('button', { name: /reporting period:/i })).toBeInTheDocument()
    expect(within(header as HTMLElement).getByRole('button', { name: /notifications/i })).toBeInTheDocument()
  })

  it('signs out from the desktop sidebar account card and redirects to /login', async () => {
    const user = userEvent.setup()

    function RouteProbe() {
      const location = useLocation()
      return <div data-testid="current-route">{location.pathname}</div>
    }

    const { container } = renderAppShell(<RouteProbe />, ['/statements'])
    const sidebar = container.querySelector('aside') as HTMLElement
    expect(within(sidebar).getByText('Signed in')).toBeInTheDocument()
    expect(within(sidebar).getByText('alex@spendwise.ai')).toBeInTheDocument()

    const signOutButton = within(sidebar).getByRole('button', { name: 'Sign out' })
    expect(signOutButton).toHaveAttribute('title', 'Sign out')
    await user.click(signOutButton)

    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('current-route')).toHaveTextContent('/login')
  })

  it('signs out from the mobile navigation drawer, closes the drawer, and redirects to /login', async () => {
    const user = userEvent.setup()

    function RouteProbe() {
      const location = useLocation()
      return <div data-testid="current-route">{location.pathname}</div>
    }

    renderAppShell(<RouteProbe />, ['/statements'])
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('alex@spendwise.ai')).toBeInTheDocument()

    const signOutButton = within(dialog).getByRole('button', { name: 'Sign out' })
    await user.click(signOutButton)

    expect(mockLogout).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('current-route')).toHaveTextContent('/login')
  })
})

