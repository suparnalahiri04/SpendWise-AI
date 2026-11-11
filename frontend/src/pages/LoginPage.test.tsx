import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authModule from '@/features/auth/auth'
import { safeRedirect } from '@/features/auth/validation'
import { ApiError } from '@/lib/api/client'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'

describe('safeRedirect', () => {
  it('returns valid internal paths', () => {
    expect(safeRedirect('/budgets')).toBe('/budgets')
    expect(safeRedirect('/transactions?page=2')).toBe('/transactions?page=2')
  })

  it('rejects external URLs, protocol-relative URLs, and auth routes', () => {
    expect(safeRedirect('//malicious.example.com')).toBe('/overview')
    expect(safeRedirect('https://malicious.example.com')).toBe('/overview')
    expect(safeRedirect('/login')).toBe('/overview')
    expect(safeRedirect('/register')).toBe('/overview')
    expect(safeRedirect(null)).toBe('/overview')
    expect(safeRedirect(undefined)).toBe('/overview')
    expect(safeRedirect(123)).toBe('/overview')
  })
})

describe('LoginPage', () => {
  const mockLogin = vi.fn()
  const mockRegister = vi.fn()
  const mockLogout = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    mockLogin.mockReset()
    mockRegister.mockReset()
    mockLogout.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setupUnauthenticated() {
    vi.spyOn(authModule, 'useAuth').mockReturnValue({
      status: 'unauthenticated',
      user: null,
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    })
  }

  it('renders the V2 editorial login experience with 3D illustration and floating AuthForm in login mode', () => {
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/secure access/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /welcome back\./i })).toBeInTheDocument()
    expect(screen.getByText(/sign in to continue to spendwise ai\./i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /make every penny count\./i }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/understand your spending\. build better financial habits\./i).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByRole('img', {
        name: /3d illustration of stacked gold coins inside an emerald glass savings vessel/i,
      }),
    ).toBeInTheDocument()

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
    expect(screen.queryByText(/at least 8 characters/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute(
      'href',
      '/register',
    )
  })

  it('removes all legacy dashboard-style showcase cards and fake financial metrics', () => {
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.queryByText(/monthly cash-flow trajectory/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/42,850/)).not.toBeInTheDocument()
    expect(screen.queryByText(/blue tokai/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/emergency reserve/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/94% confidence/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ml categorised/i)).not.toBeInTheDocument()
  })

  it('submits credentials and redirects to /overview by default on success', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValueOnce(undefined)
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/overview" element={<div>Overview Destination</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), '  member@spendwise.ai ')
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'member@spendwise.ai',
        password: 'secret-pass',
      })
    })
    expect(await screen.findByText('Overview Destination')).toBeInTheDocument()
  })

  it('preserves safeRedirect destination from location state on login', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValueOnce(undefined)
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/goals' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/goals" element={<div>Goals Destination</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'member@spendwise.ai')
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByText('Goals Destination')).toBeInTheDocument()
  })

  it('preserves client-side validation and API error handling', async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValueOnce(new ApiError('unauthorized', 'Unauthorized', 401))
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'invalid-email')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i)
    expect(mockLogin).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'member@spendwise.ai')
    await user.type(screen.getByLabelText('Password'), 'wrong-pass')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  })

  it('preserves loading state and prevents duplicate submissions while in flight', async () => {
    const user = userEvent.setup()
    let resolveLogin: () => void
    mockLogin.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveLogin = resolve
      }),
    )
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/overview" element={<div>Overview Destination</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'member@spendwise.ai')
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    const loadingBtn = screen.getByRole('button', { name: /signing in/i })
    expect(loadingBtn).toBeDisabled()
    expect(mockLogin).toHaveBeenCalledTimes(1)

    resolveLogin!()
    expect(await screen.findByText('Overview Destination')).toBeInTheDocument()
  })

  it('redirects authenticated users immediately to destination', () => {
    vi.spyOn(authModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: { id: 1, email: 'member@spendwise.ai' },
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    })

    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/reports' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reports" element={<div>Reports Page</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Reports Page')).toBeInTheDocument()
  })

  it('leaves RegisterPage visually and functionally unaffected', () => {
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
  })

  it('renders the approved organic contour pattern background in the cream form panel', () => {
    setupUnauthenticated()

    const { container } = render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    const pattern = container.querySelector(
      '[data-slot="contour-pattern"][data-variant="background"]',
    )
    expect(pattern).toBeInTheDocument()
    expect(pattern).toHaveAttribute('aria-hidden', 'true')
    expect(pattern).toHaveClass('pointer-events-none', 'absolute', 'inset-0')
  })
})
