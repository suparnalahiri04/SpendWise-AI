import { Link, Navigate, useNavigate } from 'react-router'
import { AuthForm } from '@/features/auth/AuthForm'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useAuth } from '@/features/auth/auth'

export function RegisterPage() {
  const { status, register } = useAuth()
  const navigate = useNavigate()

  if (status === 'authenticated') return <Navigate to="/overview" replace />

  return (
    <AuthLayout
      title="Start your journal"
      description="Create an account to keep your transactions private to you."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-forest underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <AuthForm
        mode="register"
        onSubmit={async (credentials) => {
          await register(credentials)
          navigate('/overview', { replace: true })
        }}
      />
    </AuthLayout>
  )
}

