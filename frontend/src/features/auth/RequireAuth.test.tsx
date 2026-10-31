import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { RequireAuth } from './RequireAuth'
import { saveToken } from './session'

const fetchMock = vi.fn<typeof fetch>()

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Login screen</p>} />
          <Route element={<RequireAuth />}>
            <Route path="/transactions" element={<p>Private ledger</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('RequireAuth', () => {
  it('redirects signed-out visitors to /login without calling the API', () => {
    renderAt('/transactions')

    expect(screen.getByText('Login screen')).toBeInTheDocument()
    expect(screen.queryByText('Private ledger')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the page for a valid stored session', async () => {
    saveToken('test-token-value')
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 1, email: 'jane@example.com' }), { status: 200 }),
    )

    renderAt('/transactions')

    expect(await screen.findByText('Private ledger')).toBeInTheDocument()
  })

  it('signs out and redirects when the stored token is rejected', async () => {
    saveToken('expired-token-value')
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Invalid or missing authentication token.' }), { status: 401 }),
    )

    renderAt('/transactions')

    expect(await screen.findByText('Login screen')).toBeInTheDocument()
    expect(window.sessionStorage.getItem('spendwise.access_token')).toBeNull()
  })
})

