import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { AuthForm } from '@/features/auth/AuthForm'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useAuth } from '@/features/auth/auth'

/** Only allow redirecting back to an internal app path. */
function safeRedirect(from: unknown): string {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login' && from !== '/register'
    ? from
    : '/overview'
}

export function LoginPage() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destination = safeRedirect((location.state as { from?: unknown } | null)?.from)

  if (status === 'authenticated') return <Navigate to={destination} replace />

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to open your money journal."
      footer={
        <>
          New to SpendWise AI?{' '}
          <Link to="/register" className="font-medium text-forest underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <AuthForm
        mode="login"
        onSubmit={async (credentials) => {
          await login(credentials)
          navigate(destination, { replace: true })
        }}
      />
    </AuthLayout>
  )
}

