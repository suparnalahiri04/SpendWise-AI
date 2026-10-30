import { Bell, Inbox } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function NotificationsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-[1.125rem]" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuLabel className="text-sm font-semibold text-foreground">
          Notifications
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="p-1">
          <EmptyState
            size="compact"
            icon={Inbox}
            title="You're all caught up"
            description="Budget alerts and statement updates will appear here once those features are available."
            className="border-none bg-transparent"
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

