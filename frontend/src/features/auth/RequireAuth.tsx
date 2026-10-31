import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './auth'

/** Layout route: renders child routes only for signed-in users. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background" role="status">
        <span className="sr-only">Checking your session…</span>
        <span className="size-8 animate-spin rounded-full border-2 border-sage-deep border-t-forest" aria-hidden="true" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

