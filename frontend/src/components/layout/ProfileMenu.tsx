import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/auth'

export function ProfileMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const name = user?.email ?? 'Your account'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Profile menu"
          className="flex items-center gap-2 rounded-full border border-border bg-card p-1 pr-1 outline-none transition-colors hover:border-sage-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:pr-3"
        >
          <span
            className="flex size-8 items-center justify-center rounded-full bg-sage text-forest"
            aria-hidden="true"
          >
            <UserRound className="size-4" />
          </span>
          <span className="hidden max-w-32 truncate text-sm font-medium text-ink sm:inline">{name}</span>
          <ChevronDown className="hidden size-3.5 text-muted-foreground sm:inline" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">Signed in</span>
          <span className="truncate font-normal">{name}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            logout()
            navigate('/login', { replace: true })
          }}
        >
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
