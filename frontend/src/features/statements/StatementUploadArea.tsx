import { FileSpreadsheet, Loader2, TriangleAlert, Upload, X } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatFileSize, validateStatementFile } from './validation'

interface StatementUploadAreaProps {
  onFileSelected: (file: File) => void
  onPreview: (file: File) => void
  isAnalyzing: boolean
  error: string | null
  onClearError: () => void
}

export function StatementUploadArea({
  onFileSelected,
  onPreview,
  isAnalyzing,
  error,
  onClearError,
}: StatementUploadAreaProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeError = error || localError

  function handleFile(file: File | null) {
    if (!file) return
    onClearError()
    const validationError = validateStatementFile(file)
    if (validationError) {
      setLocalError(validationError)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setLocalError(null)
    setSelectedFile(file)
    onFileSelected(file)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null
    handleFile(file)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!isAnalyzing) {
      setIsDragging(true)
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    if (isAnalyzing) return

    const file = event.dataTransfer.files?.[0] || null
    handleFile(file)
  }

  function handleClearFile() {
    setSelectedFile(null)
    setLocalError(null)
    onClearError()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleTriggerPreview() {
    if (selectedFile && !isAnalyzing) {
      onPreview(selectedFile)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        id="statement-file-input"
        accept=".csv, .xlsx, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleInputChange}
        disabled={isAnalyzing}
        className="sr-only"
        aria-label="Upload CSV or XLSX statement file"
      />

      {activeError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-terracotta/40 bg-terracotta/10 px-3.5 py-3 text-sm text-[#8a3f29]"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-terracotta" aria-hidden="true" />
          <div className="flex-1">
            <span className="font-medium">File error:</span> {activeError}
          </div>
          <button
            type="button"
            onClick={() => {
              setLocalError(null)
              onClearError()
            }}
            aria-label="Dismiss error"
            className="text-terracotta hover:opacity-75"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center gap-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            isDragging
              ? 'border-forest bg-sage/30'
              : 'border-sage-deep bg-paper/60 hover:border-forest/50 hover:bg-paper/80',
          )}
        >
          <span
            className="flex size-14 items-center justify-center rounded-2xl bg-sage text-forest"
            aria-hidden="true"
          >
            <Upload className="size-6" />
          </span>
          <div>
            <p className="font-semibold text-ink">Drag and drop your statement file</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Supports CSV (.csv) or Excel (.xlsx) files up to 5 MB
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={isAnalyzing}
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
          >
            <Upload className="size-4" aria-hidden="true" />
            <span>Choose file</span>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-forest"
                aria-hidden="true"
              >
                <FileSpreadsheet className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink text-sm sm:text-base" title={selectedFile.name}>
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isAnalyzing}
                onClick={handleClearFile}
                className="text-xs text-muted-foreground hover:text-ink"
              >
                Change file
              </Button>
              <Button
                type="button"
                disabled={isAnalyzing}
                onClick={handleTriggerPreview}
                className="gap-1.5"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    <span>Analyzing statement…</span>
                  </>
                ) : (
                  <span>Inspect & Preview</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Format guidelines footnote */}
      <div className="rounded-xl border border-border/60 bg-paper/50 p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-ink">Required format columns:</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <code className="rounded bg-card px-1.5 py-0.5 font-mono text-ink">date</code>
          <code className="rounded bg-card px-1.5 py-0.5 font-mono text-ink">description</code>
          <code className="rounded bg-card px-1.5 py-0.5 font-mono text-ink">amount</code>
        </div>
        <p className="mt-2">
          Optional columns: <code className="rounded bg-card px-1.5 py-0.5 font-mono text-ink">transaction_type</code> (income / expense) and <code className="rounded bg-card px-1.5 py-0.5 font-mono text-ink">category</code>.
        </p>
      </div>
    </div>
  )
}

