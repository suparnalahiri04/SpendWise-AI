import { FileSpreadsheet, FileText, ShieldCheck, Upload } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageIntro } from '@/components/common/PageIntro'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function StatementsPage() {
  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Statements"
        title="Bring your statements in"
        description="Statement import is the starting point for SpendWise AI. Uploading will be enabled in an upcoming stage."
      />

      <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Import a statement</CardTitle>
              <CardDescription>Upload a bank or credit card statement file.</CardDescription>
            </div>
            <Badge tone="butter">Coming soon</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-sage-deep bg-paper/60 px-6 py-12 text-center">
              <span
                className="flex size-14 items-center justify-center rounded-2xl bg-sage text-forest"
                aria-hidden="true"
              >
                <Upload className="size-6" />
              </span>
              <div>
                <p className="font-semibold text-ink">Statement upload is not available yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This area will accept statement files once the backend import is built.
                </p>
              </div>
              <Button disabled>
                <Upload aria-hidden="true" />
                Choose file
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What to expect</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-4 text-sm">
              <li className="flex gap-3">
                <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-forest-soft" aria-hidden="true" />
                <span>
                  <span className="font-medium text-ink">CSV statements</span>
                  <span className="block text-muted-foreground">Planned as the first supported format.</span>
                </span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest-soft" aria-hidden="true" />
                <span>
                  <span className="font-medium text-ink">Validation</span>
                  <span className="block text-muted-foreground">
                    Files will be checked before any transactions are created.
                  </span>
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </Reveal>

      <Reveal>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Imported statements</CardTitle>
              <CardDescription>A history of every file you have imported.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={FileText}
              title="No statements imported"
              description="Imported statements will be listed here with their date range and status."
            />
          </CardContent>
        </Card>
      </Reveal>
    </AnimatedPage>
  )
}

