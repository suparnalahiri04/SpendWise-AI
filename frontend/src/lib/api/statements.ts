import { apiRequest } from './client'
import type {
  StatementImportHistoryItem,
  StatementImportResult,
  StatementPreviewResponse,
} from './types'

/**
 * POST /statements/preview — Inspect and validate an uploaded CSV/XLSX statement
 * without writing any transactions to the database.
 */
export async function previewStatement(
  file: File,
  signal?: AbortSignal,
): Promise<StatementPreviewResponse> {
  const formData = new FormData()
  formData.append('upload', file)

  return apiRequest<StatementPreviewResponse>('/statements/preview', {
    method: 'POST',
    body: formData,
    signal,
  })
}

/**
 * POST /statements/import — Validate and import valid, non-duplicate transactions
 * into the database for the authenticated user.
 */
export async function importStatement(
  file: File,
  signal?: AbortSignal,
): Promise<StatementImportResult> {
  const formData = new FormData()
  formData.append('upload', file)

  return apiRequest<StatementImportResult>('/statements/import', {
    method: 'POST',
    body: formData,
    signal,
  })
}

/**
 * GET /statements/history — Retrieve all past statement import records
 * for the authenticated user, ordered newest first.
 */
export async function fetchStatementHistory(
  signal?: AbortSignal,
): Promise<StatementImportHistoryItem[]> {
  return apiRequest<StatementImportHistoryItem[]>('/statements/history', {
    method: 'GET',
    signal,
  })
}

