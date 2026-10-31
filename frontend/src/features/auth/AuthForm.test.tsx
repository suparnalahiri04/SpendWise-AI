import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { AuthForm } from './AuthForm'
import { validateCredentials } from './validation'

describe('validateCredentials', () => {
  it('rejects malformed emails', () => {
    expect(validateCredentials('login', { email: 'not-an-email', password: 'x' })).toMatch(/valid email/i)
  })

  it('requires 8+ characters when registering but not when signing in', () => {
    expect(validateCredentials('register', { email: 'a@b.co', password: 'short' })).toMatch(/at least 8/i)
    expect(validateCredentials('login', { email: 'a@b.co', password: 'short' })).toBeNull()
  })

  it('requires a password to sign in', () => {
    expect(validateCredentials('login', { email: 'a@b.co', password: '' })).toMatch(/enter your password/i)
  })
})

describe('AuthForm', () => {
  it('shows a validation message and does not submit invalid input', async () => {
    const onSubmit = vi.fn()
    render(<AuthForm mode="register" onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed credentials', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<AuthForm mode="login" onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Email'), '  jane@example.com ')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ email: 'jane@example.com', password: 'correct-horse' }),
    )
  })

  it('shows a friendly message when sign-in fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError('unauthorized', 'Invalid or missing token', 401))
    render(<AuthForm mode="login" onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    // The form is usable again after a failure
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('shows the server message when the email is already registered', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError('conflict', 'An account with this email already exists.', 409))
    render(<AuthForm mode="register" onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'long-enough-pw')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.')
  })
})
