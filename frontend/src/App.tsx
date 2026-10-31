import { AnimatePresence, MotionConfig } from 'motion/react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { PeriodProvider } from '@/features/period/PeriodProvider'
import { BudgetsPage } from '@/pages/BudgetsPage'
import { InsightsPage } from '@/pages/InsightsPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { RecurringPage } from '@/pages/RecurringPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { StatementsPage } from '@/pages/StatementsPage'
import { TransactionsPage } from '@/pages/TransactionsPage'

/** The signed-in application: shell plus the animated page routes. */
function AuthenticatedApp() {
  const location = useLocation()

  return (
    <PeriodProvider>
      <AppShell>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/statements" element={<StatementsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/recurring" element={<RecurringPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AnimatePresence>
      </AppShell>
    </PeriodProvider>
  )
}

function App() {
  return (
    // reducedMotion="user": honours the OS "reduce motion" setting app-wide
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/*" element={<AuthenticatedApp />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MotionConfig>
  )
}

export default App
