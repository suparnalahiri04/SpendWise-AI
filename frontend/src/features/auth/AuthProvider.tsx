import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchCurrentUser, loginUser, registerUser } from '@/lib/api/auth'
import { ApiError, isAbortError, setTokenProvider, setUnauthorizedHandler } from '@/lib/api/client'
import type { Credentials, UserResponse } from '@/lib/api/types'
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth'
import { clearToken, getToken, saveToken } from './session'

// The API client reads the token through this provider, so it is registered once, at module load.
setTokenProvider(getToken)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? 'loading' : 'unauthenticated'))
  const [user, setUser] = useState<UserResponse | null>(null)

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  // Any authenticated request rejected with 401 (expired/invalid token) signs the user out.
  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  // Validate a token restored from sessionStorage and load the profile.
  useEffect(() => {
    if (!getToken()) return
    const controller = new AbortController()
    let isSubscribed = true

    fetchCurrentUser(controller.signal)
      .then((profile) => {
        if (!isSubscribed || controller.signal.aborted) return
        setUser(profile)
        setStatus('authenticated')
      })
      .catch((error: unknown) => {
        if (!isSubscribed || controller.signal.aborted || isAbortError(error, controller.signal)) return
        // 401 already triggered logout via the handler. For network/server errors keep the
        // session: the token may still be valid and pages will show their own error state.
        if (error instanceof ApiError && error.kind === 'unauthorized') return
        setStatus('authenticated')
      })

    return () => {
      isSubscribed = false
      controller.abort()
    }
  }, [])

  const login = useCallback(async (credentials: Credentials) => {
    const { access_token } = await loginUser(credentials)
    saveToken(access_token)
    setStatus('authenticated')
    try {
      setUser(await fetchCurrentUser())
    } catch {
      // Signed in, but the profile could not be loaded; the email just won't be shown.
    }
  }, [])

  const register = useCallback(
    async (credentials: Credentials) => {
      await registerUser(credentials)
      await login(credentials)
    },
    [login],
  )

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

