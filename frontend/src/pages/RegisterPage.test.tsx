import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as authModule from '@/features/auth/auth'
import { ApiError } from '@/lib/api/client'
import { RegisterPage } from './RegisterPage'

describe('RegisterPage', () => {
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

  it('renders the V2 editorial registration experience with 3D illustration and floating AuthForm in register mode', () => {
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/secure access/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /create your account\./i })).toBeInTheDocument()
    expect(screen.getByText(/your personal financial journal starts here\./i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /your money\. your goals\. your story\./i }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/start building a more mindful relationship with money\./i).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByRole('img', {
        name: /3d financial-growth sculpture with ascending golden tiers/i,
      }),
    ).toBeInTheDocument()

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^create account$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })

  it('submits registration credentials and redirects to /overview on success', async () => {
    const user = userEvent.setup()
    mockRegister.mockResolvedValueOnce(undefined)
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/overview" element={<div>Overview Destination</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), '  newuser@spendwise.ai ')
    await user.type(screen.getByLabelText('Password'), 'securepassword123')
    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        email: 'newuser@spendwise.ai',
        password: 'securepassword123',
      })
    })
    expect(await screen.findByText('Overview Destination')).toBeInTheDocument()
  })

  it('preserves client-side validation for minimum 8 characters and valid email', async () => {
    const user = userEvent.setup()
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>,
    )

    // Short password
    await user.type(screen.getByLabelText('Email'), 'valid@spendwise.ai')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i)
    expect(mockRegister).not.toHaveBeenCalled()

    // Invalid email
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'notanemail')
    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'securepassword123')
    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i)
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('preserves server error handling such as duplicate email', async () => {
    const user = userEvent.setup()
    mockRegister.mockRejectedValueOnce(
      new ApiError('conflict', 'An account with this email already exists', 409),
    )
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'existing@spendwise.ai')
    await user.type(screen.getByLabelText('Password'), 'securepassword123')
    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists',
    )
  })

  it('preserves loading state and disables button during in-flight registration', async () => {
    const user = userEvent.setup()
    let resolveRegister: () => void
    mockRegister.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRegister = resolve
      }),
    )
    setupUnauthenticated()

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/overview" element={<div>Overview Destination</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Email'), 'newuser@spendwise.ai')
    await user.type(screen.getByLabelText('Password'), 'securepassword123')
    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    const loadingBtn = screen.getByRole('button', { name: /creating account/i })
    expect(loadingBtn).toBeDisabled()
    expect(mockRegister).toHaveBeenCalledTimes(1)

    resolveRegister!()
    expect(await screen.findByText('Overview Destination')).toBeInTheDocument()
  })

  it('redirects authenticated users immediately to /overview', () => {
    vi.spyOn(authModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: { id: 1, email: 'member@spendwise.ai' },
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout,
    })

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/overview" element={<div>Overview Page</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Overview Page')).toBeInTheDocument()
  })

  it('renders the approved organic contour pattern background in the cream form panel', () => {
    setupUnauthenticated()

    const { container } = render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
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

