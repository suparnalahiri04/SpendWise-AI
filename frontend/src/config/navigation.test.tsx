import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import {
  ASSISTANT_NAV,
  PRIMARY_NAV,
  getNavItem,
} from './navigation'

const mockLogout = vi.fn()

// Mock useAuth for Sidebar
vi.mock('@/features/auth/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'alex@spendwise.ai' },
    isAuthenticated: true,
    logout: mockLogout,
  }),
}))

describe('Navigation Consolidation (Stage 5B)', () => {
  beforeEach(() => {
    mockLogout.mockClear()
  })
  it('ensures Assistant is absent from PRIMARY_NAV', () => {
    const paths = PRIMARY_NAV.map((item) => item.path)
    expect(paths).not.toContain('/assistant')

    const labels = PRIMARY_NAV.map((item) => item.label)
    expect(labels).not.toContain('Assistant')
  })

  it('preserves all other primary navigation entries in exact order', () => {
    const expectedPaths = [
      '/overview',
      '/transactions',
      '/statements',
      '/budgets',
      '/goals',
      '/recurring',
      '/calendar',
      '/reports',
      '/insights',
    ]
    expect(PRIMARY_NAV.map((i) => i.path)).toEqual(expectedPaths)
    expect(PRIMARY_NAV).toHaveLength(9)
  })

  it('keeps ASSISTANT_NAV metadata available with correct properties', () => {
    expect(ASSISTANT_NAV).toBeDefined()
    expect(ASSISTANT_NAV.path).toBe('/assistant')
    expect(ASSISTANT_NAV.label).toBe('Assistant')
    expect(ASSISTANT_NAV.description).toBe('Ask questions about your finances and budgets')
    expect(ASSISTANT_NAV.icon).toBeDefined()
  })

  it('resolves Assistant metadata via getNavItem for Header title and description', () => {
    const item = getNavItem('/assistant')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Assistant')
    expect(item?.description).toBe('Ask questions about your finances and budgets')

    // Also verify subpath matching if any
    const subItem = getNavItem('/assistant/conversation/1')
    expect(subItem?.label).toBe('Assistant')
  })

  it('resolves other navigation items and settings correctly via getNavItem', () => {
    expect(getNavItem('/overview')?.label).toBe('Overview')
    expect(getNavItem('/transactions')?.label).toBe('Transactions')
    expect(getNavItem('/settings')?.label).toBe('Settings')
    expect(getNavItem('/unknown-page')).toBeUndefined()
  })

  it('ensures Assistant is absent from desktop sidebar navigation', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <Sidebar />
      </MemoryRouter>,
    )

    const mainNav = screen.getByRole('navigation', { name: 'Main' })

    // Sidebar should not contain Assistant link
    expect(within(mainNav).queryByRole('link', { name: /assistant/i })).not.toBeInTheDocument()

    // Other links should exist
    expect(within(mainNav).getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(within(mainNav).getByRole('link', { name: 'Transactions' })).toBeInTheDocument()
    expect(within(mainNav).getByRole('link', { name: 'Budgets' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('ensures Assistant is absent from mobile navigation drawer', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MobileNav open={true} onOpenChange={vi.fn()} />
      </MemoryRouter>,
    )

    const mainNav = screen.getByRole('navigation', { name: 'Main' })

    // Mobile drawer should not contain Assistant link
    expect(within(mainNav).queryByRole('link', { name: /assistant/i })).not.toBeInTheDocument()

    // Other links should exist
    expect(within(mainNav).getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(within(mainNav).getByRole('link', { name: 'Transactions' })).toBeInTheDocument()
    expect(within(mainNav).getByRole('link', { name: 'Budgets' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('triggers logout and redirects to /login from the desktop sidebar account card', async () => {
    const user = userEvent.setup()

    function RouteProbe() {
      const location = useLocation()
      return <div data-testid="nav-route">{location.pathname}</div>
    }

    render(
      <MemoryRouter initialEntries={['/overview']}>
        <Sidebar />
        <RouteProbe />
      </MemoryRouter>,
    )

    expect(screen.getByText('alex@spendwise.ai')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('nav-route')).toHaveTextContent('/login')
  })

  it('closes the mobile drawer, triggers logout, and redirects to /login when signing out from MobileNav', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    function RouteProbe() {
      const location = useLocation()
      return <div data-testid="nav-route">{location.pathname}</div>
    }

    render(
      <MemoryRouter initialEntries={['/statements']}>
        <MobileNav open={true} onOpenChange={onOpenChange} />
        <RouteProbe />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('nav-route')).toHaveTextContent('/login')
  })
})
