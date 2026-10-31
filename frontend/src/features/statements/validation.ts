export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
export const ALLOWED_EXTENSIONS = ['.csv', '.xlsx'] as const

/**
 * Validates an uploaded file on the client before making network requests.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateStatementFile(file: File | null | undefined): string | null {
  if (!file) {
    return 'Please select a statement file to upload.'
  }

  const name = file.name.toLowerCase()
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))
  if (!hasValidExt) {
    return 'Unsupported file type. Please upload a CSV or XLSX file.'
  }

  if (file.size === 0) {
    return 'The selected file is empty. Please choose a file with transaction records.'
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'File exceeds the 5 MB upload limit. Please select a smaller file.'
  }

  return null
}

/** Formats a byte count into a readable string (e.g., 24.5 KB, 1.2 MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

