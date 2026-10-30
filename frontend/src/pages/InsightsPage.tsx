import { Compass, Sparkles, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react'
import { PageIntro } from '@/components/common/PageIntro'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface PlannedInsight {
  title: string
  description: string
  icon: LucideIcon
  iconClass: string
}

const PLANNED_INSIGHTS: readonly PlannedInsight[] = [
  {
    title: 'Spending patterns',
    description: 'Recurring habits and how your categories shift from month to month.',
    icon: Compass,
    iconClass: 'bg-sage text-forest',
  },
  {
    title: 'Unusual transactions',
    description: 'Charges that look out of character, such as duplicates or unexpected spikes.',
    icon: TriangleAlert,
    iconClass: 'bg-terracotta/20 text-[#9a4a33]',
  },
  {
    title: 'Expense forecast',
    description: 'An estimate of upcoming monthly spending based on your history.',
    icon: TrendingUp,
    iconClass: 'bg-butter text-ink',
  },
]

export function InsightsPage() {
  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Insights"
        title="Notes from your money journal"
        description="SpendWise AI will learn from your transaction history to surface patterns worth knowing. These insights are not generated yet."
      />

      <Reveal className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PLANNED_INSIGHTS.map(({ title, description, icon: Icon, iconClass }) => (
          <Card key={title}>
            <CardHeader>
              <span
                className={`flex size-10 items-center justify-center rounded-xl ${iconClass}`}
                aria-hidden="true"
              >
                <Icon className="size-5" />
              </span>
              <Badge tone="outline">Planned</Badge>
            </CardHeader>
            <CardContent>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </Reveal>

      <Reveal>
        <Card className="border-sage-deep bg-sage/50">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-forest text-butter"
              aria-hidden="true"
            >
              <Sparkles className="size-5" />
            </span>
            <p className="text-sm leading-relaxed text-ink/80">
              Insights need real transaction history. After you import statements, this page will show
              findings for the selected period.
            </p>
          </CardContent>
        </Card>
      </Reveal>
    </AnimatedPage>
  )
}

