import { AnimatePresence, MotionConfig } from 'motion/react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { PeriodProvider } from '@/features/period/PeriodProvider'
import { BudgetsPage } from '@/pages/BudgetsPage'
import { InsightsPage } from '@/pages/InsightsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { StatementsPage } from '@/pages/StatementsPage'
import { TransactionsPage } from '@/pages/TransactionsPage'

function App() {
  const location = useLocation()

  return (
    // reducedMotion="user": honours the OS "reduce motion" setting app-wide
    <MotionConfig reducedMotion="user">
      <PeriodProvider>
        <AppShell>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route index element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/statements" element={<StatementsPage />} />
              <Route path="/budgets" element={<BudgetsPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AnimatePresence>
        </AppShell>
      </PeriodProvider>
    </MotionConfig>
  )
}

export default App
