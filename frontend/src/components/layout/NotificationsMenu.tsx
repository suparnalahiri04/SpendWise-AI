import {
  AlertCircle,
  Bell,
  Inbox,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  formatAlertDate,
  getAlertVisuals,
  sanitizeInternalLink,
} from '@/features/alerts/alertUiUtils'
import { useAlerts } from '@/features/alerts/useAlerts'
import type { AlertItem } from '@/lib/api/types'
import { cn } from '@/lib/utils'

interface AlertRowProps {
  alert: AlertItem
  isDismissing: boolean
  onDismiss: (alertKey: string) => void
  onNavigate: (path: string) => void
}

function AlertRow({ alert, isDismissing, onDismiss, onNavigate }: AlertRowProps) {
  const { icon: Icon, iconClass, badgeTone, badgeLabel } = getAlertVisuals(alert)
  const sanitizedLink = sanitizeInternalLink(alert.link_to)
  const formattedDate = formatAlertDate(alert.created_at)

  const content = (
    <>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg mt-0.5',
          iconClass,
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>

      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Badge tone={badgeTone} className="px-1.5 py-0 text-[10px] font-medium shrink-0">
            {badgeLabel}
          </Badge>
          <span className="truncate text-xs font-semibold text-ink">{alert.title}</span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {alert.message}
        </p>
        {formattedDate && (
          <span className="mt-1 block text-[10px] text-muted-foreground/75">
            {formattedDate}
          </span>
        )}
      </div>
    </>
  )

  return (
    <div
      className={cn(
        'group relative flex items-start justify-between gap-2 p-3 transition-colors hover:bg-paper-deep/60',
        isDismissing && 'pointer-events-none opacity-50',
      )}
    >
      {sanitizedLink ? (
        <button
          type="button"
          className="flex flex-1 items-start gap-3 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-lg cursor-pointer"
          onClick={() => onNavigate(sanitizedLink)}
        >
          {content}
        </button>
      ) : (
        <div className="flex flex-1 items-start gap-3">
          {content}
        </div>
      )}

      <button
        type="button"
        aria-label={`Dismiss alert: ${alert.title}`}
        disabled={isDismissing}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 hover:text-ink hover:bg-border/60 transition-colors focus-visible:ring-1 focus-visible:ring-ring outline-none mt-0.5"
        onClick={() => onDismiss(alert.id)}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const navigate = useNavigate()
  const {
    alerts,
    alertCount,
    isLoading,
    isDismissing,
    dismissingKeys,
    error,
    dismissError,
    dismissAlert,
    dismissAll,
    reload,
  } = useAlerts()

  useEffect(() => {
    openRef.current = open
  }, [open])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && !openRef.current) {
        void reload()
      }
      openRef.current = nextOpen
      setOpen(nextOpen)
    },
    [reload],
  )

  const bellAriaLabel =
    alertCount > 0
      ? `Notifications, ${alertCount} active ${alertCount === 1 ? 'alert' : 'alerts'}`
      : 'Notifications, no active alerts'

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={bellAriaLabel}
        >
          <Bell className="size-[1.125rem]" aria-hidden="true" />
          {alertCount > 0 && (
            <span
              data-testid="notifications-badge"
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-forest px-1 text-[10px] font-semibold text-paper shadow-sm"
              aria-hidden="true"
            >
              {alertCount > 99 ? '99+' : alertCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[calc(100vw-2rem)] sm:w-96 max-w-sm p-0 overflow-hidden shadow-popover"
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b border-border/80 px-3.5 py-2.5 bg-paper-deep/30">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {alertCount > 0 && (
              <Badge tone="neutral" className="px-1.5 py-0 text-[11px] font-medium">
                {alertCount} active
              </Badge>
            )}
          </div>
          {alertCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-ink focus-visible:ring-1"
              disabled={isDismissing}
              onClick={(e) => {
                e.preventDefault()
                dismissAll()
              }}
            >
              {isDismissing ? 'Dismissing...' : 'Dismiss all'}
            </Button>
          )}
        </div>

        {dismissError && (
          <div
            role="alert"
            data-testid="dismiss-error-banner"
            className="mx-3 mt-2 flex items-center gap-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
          >
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate flex-1">{dismissError}</span>
          </div>
        )}

        {isLoading && alerts.length === 0 && (
          <div
            data-testid="notifications-loading"
            className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground"
          >
            <Loader2 className="size-5 animate-spin text-forest" aria-hidden="true" />
            <span className="text-xs">Loading alerts...</span>
          </div>
        )}

        {!isLoading && error && alerts.length === 0 && (
          <div
            data-testid="notifications-error"
            className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
          >
            <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
            <p className="text-xs font-medium text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 h-7 text-xs"
              onClick={() => reload()}
            >
              <RefreshCw className="mr-1.5 size-3" aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !error && alerts.length === 0 && (
          <div data-testid="notifications-empty" className="p-4">
            <EmptyState
              size="compact"
              icon={Inbox}
              title="You're all caught up"
              description="No active alerts right now. We'll notify you when budget thresholds, recurring payments, or unusual expenses need attention."
              className="border-none bg-transparent"
            />
          </div>
        )}

        {alerts.length > 0 && (
          <div
            className="max-h-80 overflow-y-auto divide-y divide-border/50"
            role="region"
            aria-label="Active alerts list"
          >
            {alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                isDismissing={dismissingKeys.includes(alert.id) || isDismissing}
                onDismiss={dismissAlert}
                onNavigate={(path) => {
                  handleOpenChange(false)
                  navigate(path)
                }}
              />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
