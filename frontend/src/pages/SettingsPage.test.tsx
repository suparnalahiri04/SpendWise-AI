import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '@/features/auth/auth'
import { SettingsPage } from './SettingsPage'

function renderSettingsPage(authOverrides?: Partial<AuthContextValue>) {
  const defaultAuthValue: AuthContextValue = {
    status: 'authenticated',
    user: { id: 1, email: 'alex@spendwise.ai' },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...authOverrides,
  }

  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthContext.Provider value={defaultAuthValue}>
          <SettingsPage />
        </AuthContext.Provider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

describe('SettingsPage (Stage 1 Copy & Auth Alignment)', () => {
  it('renders authenticated user email and "Signed in" session badge without account status claims', () => {
    renderSettingsPage({
      status: 'authenticated',
      user: { id: 42, email: 'finance.lead@spendwise.ai' },
    })

    // Profile information is displayed truthfully
    expect(screen.getByText('Signed In As')).toBeInTheDocument()
    expect(screen.getByText('finance.lead@spendwise.ai')).toBeInTheDocument()
    expect(screen.getByText('Signed in')).toBeInTheDocument()

    // Unmodeled account lifecycle claims must NOT be made
    expect(screen.queryByText(/^Active$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/active and verified/i)).not.toBeInTheDocument()

    // Outdated prototype guest claims must be absent
    expect(screen.queryByText(/browsing as a guest/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/sign-in is not available yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/alongside sign-in in a later stage/i)).not.toBeInTheDocument()
  })

  it('renders graceful signed-in fallback when user object is temporarily null without claiming guest status', () => {
    renderSettingsPage({
      user: null,
      status: 'authenticated',
    })

    expect(screen.getByText('Signed in account')).toBeInTheDocument()
    expect(
      screen.getByText(/Your session is active\. Detailed profile customization will be available in an upcoming update\./i),
    ).toBeInTheDocument()

    // Must never claim browsing as guest or unverified status
    expect(screen.queryByText(/browsing as a guest/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/sign-in is not available yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Active$/)).not.toBeInTheDocument()
  })

  it('renders truthful default preferences description', () => {
    renderSettingsPage()

    expect(screen.getByText('Preferences')).toBeInTheDocument()
    expect(screen.getByText('Default preferences active')).toBeInTheDocument()
    expect(
      screen.getByText(/SpendWise AI is operating with standard INR \(₹\) formatting and default categories\./i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/no preferences yet/i)).not.toBeInTheDocument()
  })

  it('renders updated professional page intro description', () => {
    renderSettingsPage()

    expect(
      screen.getByText('Manage your account profile and application preferences.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/added alongside sign-in in a later stage/i),
    ).not.toBeInTheDocument()
  })
})

