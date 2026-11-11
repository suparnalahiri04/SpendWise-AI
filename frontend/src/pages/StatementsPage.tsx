import { Check, CopyCheck, FileSpreadsheet, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { PageIntro } from '@/components/common/PageIntro'
import { AnimatedPage, Reveal } from '@/components/motion/AnimatedPage'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatementHistoryTable } from '@/features/statements/StatementHistoryTable'
import { StatementImportResultCard } from '@/features/statements/StatementImportResultCard'
import { StatementPreviewTable } from '@/features/statements/StatementPreviewTable'
import { StatementUploadArea } from '@/features/statements/StatementUploadArea'
import { useStatementHistory } from '@/features/statements/useStatementHistory'
import { notifyFinancialMutation } from '@/features/alerts/alertEvents'
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
      notifyFinancialMutation('statement:imported')
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
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-4 text-sm">
                <li className="flex items-start gap-3">
                  <div
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sage/35 text-forest"
                    aria-hidden="true"
                  >
                    <FileSpreadsheet className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">CSV & Excel statements</p>
                    <p className="text-muted-foreground">
                      Accepts standard bank CSV and XLSX files up to 5 MB in size.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sage/35 text-forest"
                    aria-hidden="true"
                  >
                    <ShieldCheck className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">Pre-import validation</p>
                    <p className="text-muted-foreground">
                      Checks dates, amounts, and descriptions. Invalid rows are flagged before any database writes.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sage/35 text-forest"
                    aria-hidden="true"
                  >
                    <CopyCheck className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">Duplicate prevention</p>
                    <p className="text-muted-foreground">
                      Entries matching existing transactions are safely skipped to keep your accounts accurate.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sage/35 text-forest"
                    aria-hidden="true"
                  >
                    <Check className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">Full review control</p>
                    <p className="text-muted-foreground">
                      Imported transactions appear in your ledger ready for inspection and category adjustment.
                    </p>
                  </div>
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
