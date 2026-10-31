import { apiRequest } from './client'
import type { Credentials, TokenResponse, UserResponse } from './types'

/** POST /auth/register — creates an account. Does not sign the user in. */
export function registerUser(credentials: Credentials): Promise<UserResponse> {
  return apiRequest<UserResponse>('/auth/register', { method: 'POST', body: credentials, auth: false })
}

/** POST /auth/login — returns a Bearer access token. */
export function loginUser(credentials: Credentials): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/auth/login', { method: 'POST', body: credentials, auth: false })
}

/** GET /auth/me — profile of the authenticated user. */
export function fetchCurrentUser(signal?: AbortSignal): Promise<UserResponse> {
  return apiRequest<UserResponse>('/auth/me', { signal })
}

