import { ChevronDown, LogIn, Settings, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ProfileMenu() {
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
          <span className="hidden text-sm font-medium text-ink sm:inline">Guest</span>
          <ChevronDown className="hidden size-3.5 text-muted-foreground sm:inline" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">Guest</span>
          <span className="font-normal">Not signed in</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <LogIn aria-hidden="true" />
          Sign in
          <span className="ml-auto text-xs text-muted-foreground">Coming later</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

