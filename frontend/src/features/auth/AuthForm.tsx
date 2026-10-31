import { Loader2, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api/client'
import type { Credentials } from '@/lib/api/types'
import { EMAIL_PATTERN, MIN_PASSWORD_LENGTH, validateCredentials, type AuthMode } from './validation'

interface AuthFormProps {
  mode: AuthMode
  onSubmit: (credentials: Credentials) => Promise<void>
}

function messageFor(error: unknown, mode: AuthMode): string {
  if (error instanceof ApiError) {
    if (error.kind === 'unauthorized' && mode === 'login') return 'Incorrect email or password.'
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isRegister = mode === 'register'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const credentials = { email: email.trim(), password }
    const problem = validateCredentials(mode, credentials)
    if (problem) {
      setError(problem)
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await onSubmit(credentials)
    } catch (caught) {
      setError(messageFor(caught, mode))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-terracotta/40 bg-terracotta/10 px-3.5 py-3 text-sm text-[#8a3f29]"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="auth-email" className="text-sm font-medium text-ink">
          Email
        </label>
        <Input
          id="auth-email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error !== null && !EMAIL_PATTERN.test(email.trim())}
          disabled={submitting}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="auth-password" className="text-sm font-medium text-ink">
          Password
        </label>
        <Input
          id="auth-password"
          type="password"
          name="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={isRegister ? 'auth-password-hint' : undefined}
          disabled={submitting}
          required
        />
        {isRegister && (
          <p id="auth-password-hint" className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={submitting} className="mt-2">
        {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
        {submitting ? (isRegister ? 'Creating account…' : 'Signing in…') : isRegister ? 'Create account' : 'Sign in'}
      </Button>
    </form>
  )
}
