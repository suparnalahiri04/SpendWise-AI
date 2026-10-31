import {
  CalendarClock,
  Compass,
  Repeat,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { InsightItem, InsightSeverity } from '@/lib/api/types'
import { formatAmount, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

interface InsightCardProps {
  insight: InsightItem
}

function getInsightVisuals(insight: InsightItem): {
  icon: LucideIcon
  iconClass: string
  badgeTone: 'neutral' | 'sage' | 'butter' | 'terracotta' | 'outline'
  typeLabel: string
} {
  // Determine Type Label & Primary Icon
  let icon: LucideIcon = Compass
  let typeLabel = 'Pattern'

  if (insight.id.startsWith('budget-')) {
    icon = Target
    typeLabel = 'Budget'
  } else if (insight.id.startsWith('recurring-')) {
    icon = insight.id.includes('overdue') ? CalendarClock : Repeat
    typeLabel = 'Recurring'
  } else if (insight.type === 'anomaly') {
    icon = TriangleAlert
    typeLabel = 'Unusual Activity'
  } else if (insight.type === 'forecast') {
    icon = Sparkles
    typeLabel = 'Forecast'
  } else if (insight.id.includes('decrease')) {
    icon = TrendingDown
    typeLabel = 'Spending Drop'
  } else if (insight.id.includes('increase')) {
    icon = TrendingUp
    typeLabel = 'Spending Rise'
  }

  // Determine Severity Colors and Tone
  let iconClass = 'bg-muted text-muted-foreground'
  let badgeTone: 'neutral' | 'sage' | 'butter' | 'terracotta' | 'outline' = 'outline'

  const severity: InsightSeverity = insight.severity
  switch (severity) {
    case 'critical':
      iconClass = 'bg-terracotta/20 text-[#9a4a33]'
      badgeTone = 'terracotta'
      break
    case 'warning':
      iconClass = 'bg-butter text-ink'
      badgeTone = 'butter'
      break
    case 'positive':
      iconClass = 'bg-sage text-forest'
      badgeTone = 'sage'
      break
    case 'info':
    default:
      iconClass = 'bg-paper-deep text-forest'
      badgeTone = 'outline'
      break
  }

  return { icon, iconClass, badgeTone, typeLabel }
}

export function InsightCard({ insight }: InsightCardProps) {
  const { icon: Icon, iconClass, badgeTone, typeLabel } = getInsightVisuals(insight)

  return (
    <Card className="flex flex-col justify-between transition-all hover:shadow-card-hover min-w-0 overflow-hidden">
      <CardHeader className="space-y-3 pb-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-xl transition-colors shrink-0',
                iconClass,
              )}
              aria-hidden="true"
            >
              <Icon className="size-4" />
            </span>
            <Badge tone="outline" className="text-[11px] font-medium text-muted-foreground shrink-0">
              {typeLabel}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 justify-end">
            {insight.metric_label && (
              <Badge tone={badgeTone} className="font-semibold text-xs shrink-0">
                {insight.metric_label}
              </Badge>
            )}
            {insight.category && (
              <Badge
                tone="neutral"
                className="text-[11px] text-muted-foreground break-all max-w-[200px]"
                title={insight.category}
              >
                {insight.category}
              </Badge>
            )}
          </div>
        </div>

        <CardTitle className="font-serif text-lg font-bold text-ink leading-snug break-words hyphens-auto [overflow-wrap:anywhere]">
          {insight.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-0 min-w-0">
        <CardDescription className="text-sm leading-relaxed text-ink/80 break-words [overflow-wrap:anywhere]">
          {insight.description}
        </CardDescription>

        {(insight.amount !== null || insight.date) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground min-w-0">
            {insight.date ? (
              <span className="truncate">Recorded: {formatDate(insight.date)}</span>
            ) : (
              <span />
            )}
            {insight.amount !== null && (
              <span className="font-medium tabular text-ink shrink-0 ml-auto">
                ₹{formatAmount(insight.amount)}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
