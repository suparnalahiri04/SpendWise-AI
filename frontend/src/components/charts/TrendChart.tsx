import { ChartLine } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '@/components/common/EmptyState'

export interface TrendPoint {
  label: string
  value: number
}

interface TrendChartProps {
  data: readonly TrendPoint[]
  /** Accessible summary of what the chart shows. */
  ariaLabel: string
  emptyTitle: string
  emptyDescription: string
  height?: number
}

/**
 * Themed Recharts area chart. Renders an explicit empty state when there is no
 * data, so the UI never implies numbers that do not exist.
 */
export function TrendChart({
  data,
  ariaLabel,
  emptyTitle,
  emptyDescription,
  height = 240,
}: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col" style={{ minHeight: height }}>
        <EmptyState
          icon={ChartLine}
          title={emptyTitle}
          description={emptyDescription}
          className="flex-1"
        />
      </div>
    )
  }

  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-forest)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-forest)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-sage-deep)' }}
            contentStyle={{
              background: 'var(--color-popover)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              fontSize: 13,
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-forest)"
            strokeWidth={2}
            fill="url(#trendFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
