import { Compass } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <AnimatedPage>
      <Reveal>
        <EmptyState
          icon={Compass}
          title="This page isn't in the journal"
          description="The address may be mistyped, or the page may have moved."
          action={
            <Button asChild>
              <Link to="/overview">Back to Overview</Link>
            </Button>
          }
        />
      </Reveal>
    </AnimatedPage>
  )
}

