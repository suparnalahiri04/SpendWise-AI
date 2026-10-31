/**
 * Minimal typed API client for the SpendWise AI backend.
 *
 * - Base URL comes from VITE_API_BASE_URL (default: local FastAPI dev server).
 * - Authentication is a Bearer JWT supplied by a registered token provider, so
 *   this module never reads storage itself and never logs tokens.
 * - Failures are normalised into ApiError with a user-friendly message.
 */

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8001'

/** Resolve the API base URL, tolerating trailing slashes. */
export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined
  return (configured?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
}

export type ApiErrorKind = 'network' | 'unauthorized' | 'validation' | 'conflict' | 'server' | 'unknown'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

/** Determine whether an error was caused by request abort or cancellation. */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  ) {
    return true
  }
  return false
}

type TokenProvider = () => string | null
type UnauthorizedHandler = () => void

let tokenProvider: TokenProvider = () => null
let unauthorizedHandler: UnauthorizedHandler | null = null

/** Register how the client obtains the current access token. */
export function setTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider
}

/** Register a callback invoked when an authenticated request is rejected with 401. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Send the Bearer token (default true). Login/register pass false. */
  auth?: boolean
  signal?: AbortSignal
}

/** Pull a readable message out of a FastAPI error body, or return null. */
function extractDetail(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('detail' in payload)) return null
  const { detail } = payload as { detail: unknown }
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI 422: [{ loc: [...], msg: "..." }, ...]
    const first = detail[0] as { loc?: unknown[]; msg?: unknown } | undefined
    if (first && typeof first.msg === 'string') {
      const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : ''
      return field && field !== 'body' ? `${field}: ${first.msg}` : first.msg
    }
  }
  return null
}

function toApiError(status: number, payload: unknown): ApiError {
  const detail = extractDetail(payload)
  if (status === 401) {
    return new ApiError('unauthorized', detail ?? 'Your session is not valid. Please sign in again.', status)
  }
  if (status === 409) {
    return new ApiError('conflict', detail ?? 'That already exists.', status)
  }
  if (status === 422 || status === 400) {
    return new ApiError('validation', detail ?? 'Please check the details you entered.', status)
  }
  if (status === 413) {
    return new ApiError('validation', detail ?? 'File exceeds the 5 MB upload limit.', status)
  }
  if (status >= 500) {
    return new ApiError('server', 'The server ran into a problem. Please try again in a moment.', status)
  }
  return new ApiError('unknown', detail ?? 'Something went wrong. Please try again.', status)
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = options
  const headers: Record<string, string> = { Accept: 'application/json' }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json'

  if (auth) {
    const token = tokenProvider()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? (body as BodyInit) : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (isAbortError(error, signal)) throw error
    throw new ApiError(
      'network',
      "We couldn't reach the SpendWise server. Check that the backend is running and try again.",
    )
  }

  let payload: unknown = null
  if (response.status !== 204) {
    try {
      payload = await response.json()
    } catch (error) {
      if (isAbortError(error, signal)) throw error
      payload = null
    }
  }

  if (!response.ok) {
    const error = toApiError(response.status, payload)
    // Only treat 401 as "session expired" for authenticated calls (not bad login credentials).
    if (error.kind === 'unauthorized' && auth) unauthorizedHandler?.()
    throw error
  }

  return payload as T
}

