import { ArrowLeftRight, Search, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { PeriodBadge } from '@/components/common/PeriodBadge'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const COLUMNS = ['Date', 'Description', 'Category', 'Account', 'Amount'] as const

export function TransactionsPage() {
  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Ledger"
        title="Every entry, neatly recorded"
        description="Imported transactions will be listed here with their automatically assigned categories, ready for review."
        actions={<PeriodBadge />}
      />

      <Reveal>
        <Card className="overflow-hidden">
          {/* Toolbar layout — controls are disabled until transactions exist */}
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="relative w-full sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                disabled
                placeholder="Search transactions"
                aria-label="Search transactions (available after import)"
                className="h-10 w-full rounded-xl border border-input bg-paper/60 pl-9 pr-3 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <Button variant="outline" disabled title="Available after import">
              <SlidersHorizontal aria-hidden="true" />
              Filters
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Transactions</caption>
              <thead>
                <tr className="border-b border-border bg-paper/60">
                  {COLUMNS.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className={
                        'px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground' +
                        (col === 'Amount' ? ' text-right' : '')
                      }
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={COLUMNS.length} className="p-4 sm:p-6">
                    <EmptyState
                      icon={ArrowLeftRight}
                      title="No transactions yet"
                      description="Import a statement to populate your ledger. Search and filters will become available then."
                      action={
                        <Button asChild variant="secondary">
                          <Link to="/statements">Go to Statements</Link>
                        </Button>
                      }
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </Reveal>
    </AnimatedPage>
  )
}

