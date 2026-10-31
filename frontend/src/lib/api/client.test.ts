import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiRequest,
  getApiBaseUrl,
  isAbortError,
  setTokenProvider,
  setUnauthorizedHandler,
} from './client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  setTokenProvider(() => 'test-token-value')
  setUnauthorizedHandler(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  fetchMock.mockReset()
  setTokenProvider(() => null)
  setUnauthorizedHandler(null)
})

describe('getApiBaseUrl', () => {
  it('defaults to the local FastAPI server', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:8001')
  })

  it('uses VITE_API_BASE_URL and trims trailing slashes', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test//')
    expect(getApiBaseUrl()).toBe('https://api.example.test')
  })
})

describe('apiRequest', () => {
  it('sends the Bearer token on authenticated requests', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
    fetchMock.mockResolvedValue(jsonResponse([]))

    await apiRequest('/transactions/')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/transactions/')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token-value')
  })

  it('does not send a token when auth is disabled (login/register)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'x', token_type: 'bearer' }))

    await apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'pw' }, auth: false })

    const init = fetchMock.mock.calls[0][1]
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(init?.body).toBe(JSON.stringify({ email: 'a@b.co', password: 'pw' }))
  })

  it('maps a FastAPI string detail to a readable ApiError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'An account with this email already exists.' }, 409))

    await expect(apiRequest('/auth/register', { method: 'POST', body: {}, auth: false })).rejects.toMatchObject({
      kind: 'conflict',
      status: 409,
      message: 'An account with this email already exists.',
    })
  })

  it('maps a 422 validation list to a readable message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters' }] }, 422),
    )

    await expect(apiRequest('/auth/register', { method: 'POST', body: {}, auth: false })).rejects.toMatchObject({
      kind: 'validation',
      message: 'password: String should have at least 8 characters',
    })
  })

  it('reports network failures with a friendly message', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await apiRequest('/transactions/').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('network')
    expect((error as ApiError).message).toMatch(/couldn't reach/i)
  })

  it('hides raw details for server errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Traceback: secret internals' }, 500))

    const error = (await apiRequest('/transactions/').catch((e: unknown) => e)) as ApiError
    expect(error.kind).toBe('server')
    expect(error.message).not.toMatch(/traceback|secret/i)
  })

  it('signs the user out when an authenticated request returns 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Invalid or missing authentication token.' }, 401))

    await expect(apiRequest('/transactions/')).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('does not trigger sign-out for a failed login (bad credentials)', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Incorrect email or password.' }, 401))

    await expect(
      apiRequest('/auth/login', { method: 'POST', body: {}, auth: false }),
    ).rejects.toMatchObject({ kind: 'unauthorized', message: 'Incorrect email or password.' })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('sends FormData without JSON Content-Type so the browser sets the multipart boundary', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'ok' }))

    const formData = new FormData()
    formData.append('key', 'value')

    await apiRequest('/statements/preview', { method: 'POST', body: formData })

    const init = fetchMock.mock.calls[0][1]
    expect(init?.body).toBe(formData)
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('maps HTTP 413 payload too large to a validation ApiError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'File exceeds the 5 MB upload limit.' }, 413))

    await expect(apiRequest('/statements/preview', { method: 'POST' })).rejects.toMatchObject({
      kind: 'validation',
      status: 413,
      message: 'File exceeds the 5 MB upload limit.',
    })
  })

  it('preserves abort errors and does not wrap them in a network ApiError', async () => {
    const abortError = new Error('The user aborted a request.')
    abortError.name = 'AbortError'
    fetchMock.mockRejectedValue(abortError)

    const controller = new AbortController()
    controller.abort()

    await expect(apiRequest('/transactions/', { signal: controller.signal })).rejects.toThrow(
      'The user aborted a request.',
    )
  })
})

describe('isAbortError', () => {
  it('returns true if the signal was aborted', () => {
    const controller = new AbortController()
    controller.abort()
    expect(isAbortError(new Error('any error'), controller.signal)).toBe(true)
  })

  it('returns true for DOMException AbortError or Error named AbortError', () => {
    const error = new Error('Operation aborted')
    error.name = 'AbortError'
    expect(isAbortError(error)).toBe(true)
  })

  it('returns false for general network errors', () => {
    expect(isAbortError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isAbortError(new ApiError('network', 'failed'))).toBe(false)
  })
})

