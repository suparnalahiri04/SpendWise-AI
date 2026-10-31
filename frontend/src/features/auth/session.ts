/**
 * Access-token storage.
 *
 * The backend issues a Bearer JWT in the login response body and does not set
 * an HttpOnly cookie, so the token has to live in JavaScript-accessible
 * storage. We use sessionStorage (cleared when the tab closes) rather than
 * localStorage to limit exposure. Limitation: any script running on the page
 * (e.g. via an XSS bug) could read it. Moving to an HttpOnly, SameSite cookie
 * would need backend support for setting and reading the cookie.
 *
 * Tokens are never logged or rendered.
 */

const STORAGE_KEY = 'spendwise.access_token'

let memoryToken: string | null = null

function readStorage(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null // storage unavailable (e.g. blocked) — fall back to memory only
  }
}

export function getToken(): string | null {
  if (memoryToken === null) memoryToken = readStorage()
  return memoryToken
}

export function saveToken(token: string): void {
  memoryToken = token
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token)
  } catch {
    /* keep the in-memory copy */
  }
}

export function clearToken(): void {
  memoryToken = null
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to clear */
  }
}

