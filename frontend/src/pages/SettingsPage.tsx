import { SlidersHorizontal, UserRound } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SettingsPage() {
  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Settings"
        title="Profile and preferences"
        description="Account and preference options will be added alongside sign-in in a later stage."
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
            <EmptyState
              size="compact"
              icon={UserRound}
              title="You are browsing as a guest"
              description="Sign-in is not available yet, so there is no profile to edit."
            />
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
              title="No preferences yet"
              description="Preference options will appear here as the related features are built."
            />
          </CardContent>
        </Card>
      </Reveal>
    </AnimatedPage>
  )
}

