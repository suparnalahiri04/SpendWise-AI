import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as useAlertsModule from '@/features/alerts/useAlerts'
import type { AlertItem } from '@/lib/api/types'
import { NotificationsMenu } from './NotificationsMenu'

const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('NotificationsMenu', () => {
  const mockAlerts: AlertItem[] = [
    {
      id: 'budget:1:critical',
      alert_type: 'budget_exceeded',
      severity: 'critical',
      title: 'Budget Exceeded: Dining',
      message: 'You have spent ₹5,250.00 of your ₹5,000.00 budget.',
      created_at: '2026-11-03T10:00:00Z',
      link_to: '/budgets',
      metadata: {},
    },
    {
      id: 'recurring:2:warning',
      alert_type: 'recurring_upcoming',
      severity: 'warning',
      title: 'Upcoming Bill: Electricity',
      message: 'Payment of ₹2,100.00 is due in 2 days.',
      created_at: '2026-11-03T11:00:00Z',
      link_to: '/recurring',
      metadata: {},
    },
    {
      id: 'anomaly:3:info',
      alert_type: 'spending_anomaly',
      severity: 'info',
      title: 'Unusual Expense Detected',
      message: '₹4,500.00 at Electronics was significantly higher than normal.',
      created_at: '2026-11-02T15:00:00Z',
      link_to: '/transactions',
      metadata: {},
    },
  ]

  const mockDismissAlert = vi.fn().mockResolvedValue(true)
  const mockDismissAll = vi.fn().mockResolvedValue(true)
  const mockReload = vi.fn().mockResolvedValue(undefined)

  function setupUseAlertsMock(overrides: Partial<useAlertsModule.UseAlertsReturn> = {}) {
    vi.spyOn(useAlertsModule, 'useAlerts').mockReturnValue({
      alerts: mockAlerts,
      alertCount: mockAlerts.length,
      activeCount: mockAlerts.length,
      isLoading: false,
      isDismissing: false,
      dismissingKeys: [],
      error: null,
      dismissError: null,
      dismissAlert: mockDismissAlert,
      dismissAll: mockDismissAll,
      reload: mockReload,
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setupUseAlertsMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderComponent() {
    return render(
      <MemoryRouter>
        <NotificationsMenu />
      </MemoryRouter>,
    )
  }

  describe('bell button and badge behavior', () => {
    it('renders bell with active alerts count and badge when alerts exist', () => {
      renderComponent()

      const trigger = screen.getByRole('button', {
        name: 'Notifications, 3 active alerts',
      })
      expect(trigger).toBeInTheDocument()

      const badge = screen.getByTestId('notifications-badge')
      expect(badge).toHaveTextContent('3')
    })

    it('displays single alert label without pluralization', () => {
      setupUseAlertsMock({
        alerts: [mockAlerts[0]],
        alertCount: 1,
        activeCount: 1,
      })
      renderComponent()

      expect(
        screen.getByRole('button', { name: 'Notifications, 1 active alert' }),
      ).toBeInTheDocument()
      expect(screen.getByTestId('notifications-badge')).toHaveTextContent('1')
    })

    it('renders "99+" badge when active alert count exceeds 99', () => {
      setupUseAlertsMock({
        alerts: mockAlerts,
        alertCount: 120,
        activeCount: 120,
      })
      renderComponent()

      const trigger = screen.getByRole('button', {
        name: 'Notifications, 120 active alerts',
      })
      expect(trigger).toBeInTheDocument()
      expect(screen.getByTestId('notifications-badge')).toHaveTextContent('99+')
    })

    it('renders "no active alerts" label and no badge when alertCount is zero', () => {
      setupUseAlertsMock({
        alerts: [],
        alertCount: 0,
        activeCount: 0,
      })
      renderComponent()

      expect(
        screen.getByRole('button', { name: 'Notifications, no active alerts' }),
      ).toBeInTheDocument()
      expect(screen.queryByTestId('notifications-badge')).not.toBeInTheDocument()
    })
  })

  describe('empty, loading, and error states', () => {
    it('displays empty state when opened and user has zero alerts', async () => {
      setupUseAlertsMock({
        alerts: [],
        alertCount: 0,
        activeCount: 0,
      })
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      expect(await screen.findByTestId('notifications-empty')).toBeInTheDocument()
      expect(screen.getByText("You're all caught up")).toBeInTheDocument()
      expect(
        screen.getByText(/no active alerts right now/i),
      ).toBeInTheDocument()
    })

    it('displays loading indicator while alerts are loading', async () => {
      setupUseAlertsMock({
        alerts: [],
        alertCount: 0,
        activeCount: 0,
        isLoading: true,
      })
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      expect(await screen.findByTestId('notifications-loading')).toBeInTheDocument()
      expect(screen.getByText('Loading alerts...')).toBeInTheDocument()
    })

    it('displays error message and allows user to retry', async () => {
      setupUseAlertsMock({
        alerts: [],
        alertCount: 0,
        activeCount: 0,
        isLoading: false,
        error: 'Failed to load financial alerts from server.',
      })
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      expect(await screen.findByTestId('notifications-error')).toBeInTheDocument()
      expect(
        screen.getByText('Failed to load financial alerts from server.'),
      ).toBeInTheDocument()

      // reload is triggered once when opening dropdown, and once when clicking retry
      expect(mockReload).toHaveBeenCalledTimes(1)

      const retryBtn = screen.getByRole('button', { name: /retry/i })
      await user.click(retryBtn)
      expect(mockReload).toHaveBeenCalledTimes(2)
    })
  })

  describe('alert list rendering & severity hierarchy', () => {
    it('renders all alerts with readable titles, messages, dates, and severity badges', async () => {
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      expect(await screen.findByText('Budget Exceeded: Dining')).toBeInTheDocument()
      expect(screen.getByText('Upcoming Bill: Electricity')).toBeInTheDocument()
      expect(screen.getByText('Unusual Expense Detected')).toBeInTheDocument()

      // Severity badges
      expect(screen.getByText('Critical')).toBeInTheDocument()
      expect(screen.getByText('Warning')).toBeInTheDocument()
      expect(screen.getByText('Notice')).toBeInTheDocument()

      // Active count badge in header
      expect(screen.getByText('3 active')).toBeInTheDocument()
    })
  })

  describe('dismissal actions', () => {
    it('dismisses individual alert when clicking dismiss button without navigating', async () => {
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      const dismissBtn = await screen.findByRole('button', {
        name: 'Dismiss alert: Budget Exceeded: Dining',
      })
      await user.click(dismissBtn)

      expect(mockDismissAlert).toHaveBeenCalledWith('budget:1:critical')
      // Navigation should NOT be triggered
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('dismisses all alerts when clicking "Dismiss all"', async () => {
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      const dismissAllBtn = await screen.findByRole('button', { name: 'Dismiss all' })
      await user.click(dismissAllBtn)

      expect(mockDismissAll).toHaveBeenCalledTimes(1)
    })

    it('disables "Dismiss all" button while dismissal is in progress', async () => {
      setupUseAlertsMock({
        isDismissing: true,
      })
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      const dismissingBtn = await screen.findByRole('button', { name: 'Dismissing...' })
      expect(dismissingBtn).toBeDisabled()
    })

    it('renders dismissal error banner when dismissError is present', async () => {
      setupUseAlertsMock({
        dismissError: 'Server rejected alert dismissal.',
      })
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      const banner = await screen.findByTestId('dismiss-error-banner')
      expect(banner).toHaveTextContent('Server rejected alert dismissal.')
    })
  })

  describe('alert navigation', () => {
    it('navigates to sanitized internal route when alert item is selected', async () => {
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      const alertItem = await screen.findByText('Budget Exceeded: Dining')
      await user.click(alertItem)

      expect(mockNavigate).toHaveBeenCalledWith('/budgets')
    })

    it('navigates to /recurring when recurring bill alert is selected', async () => {
      const user = userEvent.setup()
      renderComponent()

      await user.click(screen.getByRole('button', { name: /notifications/i }))

      const recurringAlert = await screen.findByText('Upcoming Bill: Electricity')
      await user.click(recurringAlert)

      expect(mockNavigate).toHaveBeenCalledWith('/recurring')
    })

    it('does not navigate to external URLs if provided in link_to', async () => {
      setupUseAlertsMock({
        alerts: [
          {
            id: 'malicious:1',
            alert_type: 'spending_anomaly',
            severity: 'critical',
            title: 'Malicious Alert',
            message: 'Suspicious external link',
            created_at: '2026-11-03T00:00:00Z',
            link_to: 'https://evil.com/phishing',
            metadata: {},
          },
        ],
        alertCount: 1,
        activeCount: 1,
      })
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      const alertItem = await screen.findByText('Malicious Alert')
      await user.click(alertItem)

      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  describe('notification dropdown refresh behavior', () => {
    it('invokes reload when the dropdown transitions from closed to open', async () => {
      const user = userEvent.setup()
      renderComponent()

      expect(mockReload).not.toHaveBeenCalled()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      expect(mockReload).toHaveBeenCalledTimes(1)
    })

    it('does not invoke reload when the dropdown closes', async () => {
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      // Open
      await user.click(trigger)
      expect(mockReload).toHaveBeenCalledTimes(1)

      // Close by clicking outside or pressing Escape
      await user.keyboard('{Escape}')
      await waitFor(() => {
        expect(screen.queryByText('Budget Exceeded: Dining')).not.toBeInTheDocument()
      })

      // Reload should NOT have been called a second time on close
      expect(mockReload).toHaveBeenCalledTimes(1)
    })

    it('does not invoke duplicate reload on repeated clicks while open', async () => {
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)
      expect(mockReload).toHaveBeenCalledTimes(1)

      // Content is open; mockReload count stays 1
      expect(await screen.findByText('Budget Exceeded: Dining')).toBeInTheDocument()
      expect(mockReload).toHaveBeenCalledTimes(1)
    })
  })

  describe('keyboard accessibility', () => {
    it('closes the dropdown menu when Escape is pressed', async () => {
      const user = userEvent.setup()
      renderComponent()

      const trigger = screen.getByRole('button', { name: /notifications/i })
      await user.click(trigger)

      expect(await screen.findByText('Budget Exceeded: Dining')).toBeInTheDocument()

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.queryByText('Budget Exceeded: Dining')).not.toBeInTheDocument()
      })
    })
  })
})

