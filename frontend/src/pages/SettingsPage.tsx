import { SlidersHorizontal, UserRound } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth'

export function SettingsPage() {
  const { user, status } = useAuth()
  const isAuthenticated = status === 'authenticated'

  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Settings"
        title="Profile and preferences"
        description="Manage your account profile and application preferences."
      />

      <Reveal className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your account details.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {user?.email ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-paper/60 p-4">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-forest"
                    aria-hidden="true"
                  >
                    <UserRound className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Signed In As
                    </p>
                    <p className="font-semibold text-ink truncate text-sm sm:text-base">
                      {user.email}
                    </p>
                  </div>
                  {isAuthenticated && (
                    <Badge tone="sage" className="shrink-0">
                      Signed in
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  You are signed in to SpendWise AI. Personal profile customization will be available in an upcoming update.
                </p>
              </div>
            ) : (
              <EmptyState
                size="compact"
                icon={UserRound}
                title="Signed in account"
                description="Your session is active. Detailed profile customization will be available in an upcoming update."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Preferences</CardTitle>
              <CardDescription>Currency, categories and notifications.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <EmptyState
              size="compact"
              icon={SlidersHorizontal}
              title="Default preferences active"
              description="SpendWise AI is operating with standard INR (₹) formatting and default categories. Custom preference controls will be available in an upcoming update."
            />
          </CardContent>
        </Card>
      </Reveal>
    </AnimatedPage>
  )
}

