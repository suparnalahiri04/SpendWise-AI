import { Check, CopyCheck, FileSpreadsheet, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { PageIntro } from '@/components/common/PageIntro'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatementHistoryTable } from '@/features/statements/StatementHistoryTable'
import { StatementImportResultCard } from '@/features/statements/StatementImportResultCard'
import { StatementPreviewTable } from '@/features/statements/StatementPreviewTable'
import { StatementUploadArea } from '@/features/statements/StatementUploadArea'
import { useStatementHistory } from '@/features/statements/useStatementHistory'
import { ApiError } from '@/lib/api/client'
import { importStatement, previewStatement } from '@/lib/api/statements'
import type { StatementImportResult, StatementPreviewResponse } from '@/lib/api/types'
import { cn } from '@/lib/utils'

type ImportStep = 'upload' | 'preview' | 'result'

export function StatementsPage() {
  const [step, setStep] = useState<ImportStep>('upload')
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<StatementPreviewResponse | null>(null)
  const [importResult, setImportResult] = useState<StatementImportResult | null>(null)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const historyState = useStatementHistory()

  async function handlePreview(file: File) {
    setIsAnalyzing(true)
    setError(null)
    setCurrentFile(file)

    try {
      const data = await previewStatement(file)
      setPreviewData(data)
      setStep('preview')
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
      } else {
        setError('Failed to analyze statement file. Please check the file and try again.')
      }
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleConfirmImport() {
    if (!currentFile || isImporting) return

    setIsImporting(true)
    setError(null)

    try {
      const result = await importStatement(currentFile)
      setImportResult(result)
      setStep('result')
      historyState.reload()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
      } else {
        setError('Failed to import statement. Please check your connection and try again.')
      }
    } finally {
      setIsImporting(false)
    }
  }

  function handleReset() {
    setStep('upload')
    setCurrentFile(null)
    setPreviewData(null)
    setImportResult(null)
    setError(null)
  }

  return (
    <AnimatedPage>
      <PageIntro
        eyebrow="Statements"
        title="Bring your statements in"
        description="Upload CSV or Excel statements from your bank or card provider. SpendWise AI validates records, flags formatting issues, and prevents duplicate entries."
      />

      <Reveal
        className={cn(
          'grid grid-cols-1 gap-6',
          step === 'preview' ? 'lg:grid-cols-1' : 'lg:grid-cols-3',
        )}
      >
        <Card className={cn(step === 'preview' ? 'lg:col-span-1' : 'lg:col-span-2')}>
          <CardHeader>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>
                  {step === 'upload' && 'Import a statement'}
                  {step === 'preview' && 'Review Statement Preview'}
                  {step === 'result' && 'Import Summary'}
                </CardTitle>
                <CardDescription>
                  {step === 'upload' && 'Upload a bank or credit card statement file (.csv or .xlsx).'}
                  {step === 'preview' && 'Check parsed transactions before saving them to your ledger.'}
                  {step === 'result' && 'Statement transactions have been processed.'}
                </CardDescription>
              </div>
              {step === 'upload' && <Badge tone="sage">CSV & XLSX</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {step === 'upload' && (
              <StatementUploadArea
                onFileSelected={(file) => setCurrentFile(file)}
                onPreview={handlePreview}
                isAnalyzing={isAnalyzing}
                error={error}
                onClearError={() => setError(null)}
              />
            )}

            {step === 'preview' && previewData && (
              <StatementPreviewTable
                preview={previewData}
                isImporting={isImporting}
                importError={error}
                onConfirmImport={handleConfirmImport}
                onCancel={handleReset}
              />
            )}

            {step === 'result' && importResult && (
              <StatementImportResultCard result={importResult} onReset={handleReset} />
            )}
          </CardContent>
        </Card>

        {step !== 'preview' && (
          <Card>
            <CardHeader>
              <CardTitle>What to expect</CardTitle>
              <CardDescription>How statement processing works</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-4 text-sm">
                <li className="flex gap-3">
                  <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-forest-soft" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-ink">CSV & Excel statements</span>
                    <span className="block text-muted-foreground">
                      Accepts standard bank CSV and XLSX files up to 5 MB in size.
                    </span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest-soft" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-ink">Pre-import validation</span>
                    <span className="block text-muted-foreground">
                      Checks dates, amounts, and descriptions. Invalid rows are flagged before any database writes.
                    </span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <CopyCheck className="mt-0.5 size-4 shrink-0 text-forest-soft" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-ink">Duplicate prevention</span>
                    <span className="block text-muted-foreground">
                      Entries matching existing transactions are safely skipped to keep your accounts accurate.
                    </span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-forest-soft" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-ink">Full review control</span>
                    <span className="block text-muted-foreground">
                      Imported transactions appear in your ledger ready for inspection and category adjustment.
                    </span>
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        )}
      </Reveal>

      <Reveal>
        <StatementHistoryTable
          historyState={historyState}
          onReload={historyState.reload}
        />
      </Reveal>
    </AnimatedPage>
  )
}
