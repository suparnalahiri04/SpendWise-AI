import type { Credentials } from '@/lib/api/types'

export type AuthMode = 'login' | 'register'

export const MIN_PASSWORD_LENGTH = 8
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Client-side checks that mirror backend rules so users get instant feedback. */
export function validateCredentials(mode: AuthMode, { email, password }: Credentials): string | null {
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address.'
  if (mode === 'register' && password.length < MIN_PASSWORD_LENGTH) {
    return `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (mode === 'login' && password.length === 0) return 'Enter your password.'
  return null
}

/** Only allow redirecting back to an internal app path. */
export function safeRedirect(from: unknown): string {
  return typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    from !== '/login' &&
    from !== '/register'
    ? from
    : '/overview'
}


