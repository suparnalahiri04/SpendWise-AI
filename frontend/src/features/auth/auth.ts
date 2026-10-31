import { createContext, useContext } from 'react'
import type { Credentials, UserResponse } from '@/lib/api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  status: AuthStatus
  /** Null until /auth/me has resolved (or if it could not be reached). */
  user: UserResponse | null
  /** Signs in. Throws ApiError on failure so forms can show the message. */
  login: (credentials: Credentials) => Promise<void>
  /** Creates an account and then signs in. Throws ApiError on failure. */
  register: (credentials: Credentials) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

