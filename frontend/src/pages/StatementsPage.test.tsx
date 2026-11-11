import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { saveToken } from '@/features/auth/session'
import { PeriodProvider } from '@/features/period/PeriodProvider'
import type {
  StatementImportHistoryItem,
  StatementImportResult,
  StatementPreviewResponse,
} from '@/lib/api/types'
import { StatementsPage } from './StatementsPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

function renderPage() {
  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter>
        <AuthProvider>
          <PeriodProvider>
            <StatementsPage />
          </PeriodProvider>
        </AuthProvider>
      </MemoryRouter>
    </MotionConfig>,
  )
}

const mockHistory: StatementImportHistoryItem[] = [
  {
    id: 101,
    filename: 'icici_march_2026.csv',
    status: 'completed',
    rows_total: 15,
    rows_imported: 15,
    rows_rejected: 0,
    created_at: '2026-03-25T14:30:00Z',
  },
  {
    id: 100,
    filename: 'hdfc_statement.xlsx',
    status: 'completed_with_errors',
    rows_total: 20,
    rows_imported: 18,
    rows_rejected: 2,
    created_at: '2026-03-20T10:15:00Z',
  },
]

const mockPreview: StatementPreviewResponse = {
  filename: 'bank_statement.csv',
  total_rows: 3,
  valid_rows: 2,
  invalid_rows: 1,
  preview: [
    {
      row_number: 2,
      transaction_date: '2026-03-10',
      description: 'Swiggy Dinner',
      amount: '450.00',
      transaction_type: 'expense',
      category: 'Food/Dining',
      predicted_category: 'Food/Dining',
      prediction_confidence: '0.8800',
      is_valid: true,
      errors: [],
    },
    {
      row_number: 3,
      transaction_date: '2026-03-11',
      description: 'Client Consulting',
      amount: '12000.00',
      transaction_type: 'income',
      category: 'Income',
      is_valid: true,
      errors: [],
    },
    {
      row_number: 4,
      transaction_date: null,
      description: '',
      amount: null,
      transaction_type: null,
      category: 'Other',
      is_valid: false,
      errors: ['Invalid or missing transaction date.', 'Missing transaction description.'],
    },
  ],
}

const mockImportResult: StatementImportResult = {
  message: 'Statement import completed.',
  import_id: 102,
  filename: 'bank_statement.csv',
  status: 'completed_with_errors',
  total_rows: 3,
  imported_rows: 2,
  rejected_rows: 1,
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  saveToken('test-token-value')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  fetchMock.mockReset()
})

describe('StatementsPage', () => {
  it('loads and displays past statement import history', async () => {
    fetchMock.mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse(mockHistory)
      return jsonResponse({}, 404)
    })

    renderPage()

    expect(await screen.findByText('icici_march_2026.csv')).toBeInTheDocument()
    expect(screen.getByText('hdfc_statement.xlsx')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('With skipped')).toBeInTheDocument()
  })

  it('displays empty state when there are no past statement imports', async () => {
    fetchMock.mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse([])
      return jsonResponse({}, 404)
    })

    renderPage()

    expect(await screen.findByText('No statements imported')).toBeInTheDocument()
  })

  it('validates file type and size on the client before making requests', async () => {
    fetchMock.mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse([])
      return jsonResponse({}, 404)
    })

    renderPage()

    // 1. Invalid PDF file (simulate user selecting All Files in picker or dropping PDF)
    const fileInput = screen.getByLabelText(/upload csv or xlsx statement file/i)
    const pdfFile = new File(['dummy'], 'statement.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [pdfFile] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/unsupported file type/i)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/statements/preview'))).toBe(false)

    // 2. Empty file (0 bytes)
    const emptyFile = new File([], 'empty.csv', { type: 'text/csv' })
    fireEvent.change(fileInput, { target: { files: [emptyFile] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/file is empty/i)
  })

  it('allows file selection and displays parsed preview from POST /statements/preview', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse([])
      if (urlStr.endsWith('/statements/preview') && init?.method === 'POST') {
        return jsonResponse(mockPreview)
      }
      return jsonResponse({}, 404)
    })

    renderPage()

    const fileInput = screen.getByLabelText(/upload csv or xlsx statement file/i)
    const validFile = new File(['date,description,amount\n2026-03-10,Swiggy Dinner,450.00'], 'bank_statement.csv', {
      type: 'text/csv',
    })

    await user.upload(fileInput, validFile)

    expect(screen.getByText('bank_statement.csv')).toBeInTheDocument()

    // Click "Inspect & Preview"
    const previewBtn = screen.getByRole('button', { name: /inspect & preview/i })
    await user.click(previewBtn)

    // Preview table displays parsed rows and stats
    expect(await screen.findByText('Review Statement Preview')).toBeInTheDocument()
    expect(screen.getByText('Swiggy Dinner')).toBeInTheDocument()
    expect(screen.getByText('AI: Food/Dining (88%)')).toBeInTheDocument()
    expect(screen.getByText('Client Consulting')).toBeInTheDocument()
    expect(screen.getByText(/missing transaction description/i)).toBeInTheDocument()

    // Verify valid & invalid counts
    expect(screen.getByText('Valid:').parentElement).toHaveTextContent('2')
    expect(screen.getByText('Issues:').parentElement).toHaveTextContent('1')

    // Confirm button shows valid count
    expect(screen.getByRole('button', { name: /import 2 transactions/i })).toBeInTheDocument()
  })

  it('handles preview API error without crashing and allows recovery', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse([])
      if (urlStr.endsWith('/statements/preview') && init?.method === 'POST') {
        return jsonResponse({ detail: 'Missing required columns: date, description, amount.' }, 400)
      }
      return jsonResponse({}, 404)
    })

    renderPage()

    const fileInput = screen.getByLabelText(/upload csv or xlsx statement file/i)
    const file = new File(['col1,col2'], 'missing_cols.csv', { type: 'text/csv' })
    await user.upload(fileInput, file)

    await user.click(screen.getByRole('button', { name: /inspect & preview/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/missing required columns/i)
    expect(screen.queryByText('Review Statement Preview')).not.toBeInTheDocument()
  })

  it('completes the full flow: preview -> confirm import -> display results & refresh history', async () => {
    const user = userEvent.setup()

    let historyRecords: StatementImportHistoryItem[] = []

    fetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse(historyRecords)
      if (urlStr.endsWith('/statements/preview') && init?.method === 'POST') {
        return jsonResponse(mockPreview)
      }
      if (urlStr.endsWith('/statements/import') && init?.method === 'POST') {
        historyRecords = [
          {
            id: mockImportResult.import_id,
            filename: mockImportResult.filename,
            status: mockImportResult.status,
            rows_total: mockImportResult.total_rows,
            rows_imported: mockImportResult.imported_rows,
            rows_rejected: mockImportResult.rejected_rows,
            created_at: new Date().toISOString(),
          },
        ]
        return jsonResponse(mockImportResult)
      }
      return jsonResponse({}, 404)
    })

    renderPage()

    const fileInput = screen.getByLabelText(/upload csv or xlsx statement file/i)
    const validFile = new File(['mock content'], 'bank_statement.csv', { type: 'text/csv' })
    await user.upload(fileInput, validFile)

    await user.click(screen.getByRole('button', { name: /inspect & preview/i }))

    expect(await screen.findByText('Review Statement Preview')).toBeInTheDocument()

    // Confirm import
    const confirmBtn = screen.getByRole('button', { name: /import 2 transactions/i })
    await user.click(confirmBtn)

    // Result card appears
    expect(await screen.findByText('Statement Import Completed')).toBeInTheDocument()
    expect(screen.getByText('Import Summary')).toBeInTheDocument()
    expect(screen.getByText(/Processed file/i)).toHaveTextContent('Processed file bank_statement.csv (Import #102)')

    // History refreshed
    expect(await screen.findByRole('cell', { name: /bank_statement\.csv/i })).toBeInTheDocument()
  })

  it('handles import API failure gracefully without claiming success', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse([])
      if (urlStr.endsWith('/statements/preview') && init?.method === 'POST') {
        return jsonResponse(mockPreview)
      }
      if (urlStr.endsWith('/statements/import') && init?.method === 'POST') {
        return jsonResponse({ detail: 'Database error while saving transactions.' }, 500)
      }
      return jsonResponse({}, 404)
    })

    renderPage()

    const fileInput = screen.getByLabelText(/upload csv or xlsx statement file/i)
    const file = new File(['mock'], 'bank_statement.csv', { type: 'text/csv' })
    await user.upload(fileInput, file)

    await user.click(screen.getByRole('button', { name: /inspect & preview/i }))

    expect(await screen.findByRole('button', { name: /import 2 transactions/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /import 2 transactions/i }))

    // Error alert is displayed, result card is NOT displayed
    expect(await screen.findByRole('alert')).toHaveTextContent(/the server ran into a problem|database error/i)
    expect(screen.queryByText('Statement Import Completed')).not.toBeInTheDocument()
    expect(screen.queryByText('Import Summary')).not.toBeInTheDocument()

    // Confirm button is still available to retry
    expect(screen.getByRole('button', { name: /import 2 transactions/i })).toBeInTheDocument()
  })

  it('allows canceling preview and returning to upload area', async () => {
    const user = userEvent.setup()

    fetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse([])
      if (urlStr.endsWith('/statements/preview') && init?.method === 'POST') {
        return jsonResponse(mockPreview)
      }
      return jsonResponse({}, 404)
    })

    renderPage()

    const fileInput = screen.getByLabelText(/upload csv or xlsx statement file/i)
    await user.upload(fileInput, new File(['mock'], 'statement.csv', { type: 'text/csv' }))

    await user.click(screen.getByRole('button', { name: /inspect & preview/i }))
    expect(await screen.findByText('Review Statement Preview')).toBeInTheDocument()

    // Click "Upload different file"
    await user.click(screen.getByRole('button', { name: /upload different file/i }))

    // Returns to upload area
    expect(await screen.findByText('Import a statement')).toBeInTheDocument()
    expect(screen.getByText('Drag and drop your statement file')).toBeInTheDocument()
  })

  it('normalizes ML confidence labels cleanly in StatementPreviewTable across decimal, percentage, 59.9%, and invalid inputs', async () => {
    const user = userEvent.setup()

    const boundaryPreview: StatementPreviewResponse = {
      filename: 'boundary.csv',
      total_rows: 5,
      valid_rows: 5,
      invalid_rows: 0,
      preview: [
        {
          row_number: 2,
          transaction_date: '2026-03-10',
          description: 'Borderline Entry',
          amount: '100.00',
          transaction_type: 'expense',
          category: 'Other',
          predicted_category: 'Food/Dining',
          prediction_confidence: '0.599',
          is_valid: true,
          errors: [],
        },
        {
          row_number: 3,
          transaction_date: '2026-03-11',
          description: 'Threshold Exact Entry',
          amount: '120.00',
          transaction_type: 'expense',
          category: 'Travel',
          predicted_category: 'Travel',
          prediction_confidence: '0.60',
          is_valid: true,
          errors: [],
        },
        {
          row_number: 4,
          transaction_date: '2026-03-12',
          description: 'Percent Scale Entry',
          amount: '140.00',
          transaction_type: 'expense',
          category: 'Shopping',
          predicted_category: 'Shopping',
          prediction_confidence: 85,
          is_valid: true,
          errors: [],
        },
        {
          row_number: 5,
          transaction_date: '2026-03-13',
          description: 'Invalid Confidence Entry',
          amount: '160.00',
          transaction_type: 'expense',
          category: 'Other',
          predicted_category: 'Utilities',
          prediction_confidence: 'invalid-val',
          is_valid: true,
          errors: [],
        },
        {
          row_number: 6,
          transaction_date: '2026-03-14',
          description: 'Missing Confidence Entry',
          amount: '180.00',
          transaction_type: 'expense',
          category: 'Other',
          predicted_category: 'Healthcare',
          prediction_confidence: null,
          is_valid: true,
          errors: [],
        },
      ],
    }

    fetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse([])
      if (urlStr.endsWith('/statements/preview') && init?.method === 'POST') {
        return jsonResponse(boundaryPreview)
      }
      return jsonResponse({}, 404)
    })

    renderPage()

    const fileInput = screen.getByLabelText(/upload csv or xlsx statement file/i)
    await user.upload(fileInput, new File(['mock'], 'boundary.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: /inspect & preview/i }))

    expect(await screen.findByText('AI: Food/Dining (59.9%)')).toBeInTheDocument()
    expect(screen.getByText('AI: Travel (60%)')).toBeInTheDocument()
    expect(screen.getByText('AI: Shopping (85%)')).toBeInTheDocument()
    expect(screen.getByText('AI: Utilities')).toBeInTheDocument()
    expect(screen.getByText('AI: Healthcare')).toBeInTheDocument()
    expect(screen.queryByText(/NaN%|8500%|Infinity%/)).not.toBeInTheDocument()
  })

  it('displays duplicate badge, count, and net importable count when preview includes duplicates', async () => {
    const user = userEvent.setup()

    const dupPreview = {
      filename: 'reimport.csv',
      total_rows: 2,
      valid_rows: 2,
      invalid_rows: 0,
      duplicate_rows: 1,
      preview: [
        {
          row_number: 2,
          transaction_date: '2026-04-01',
          description: 'Morning Coffee',
          amount: '150.00',
          transaction_type: 'expense',
          category: 'Food/Dining',
          is_valid: true,
          is_duplicate: true,
          errors: [],
        },
        {
          row_number: 3,
          transaction_date: '2026-04-02',
          description: 'Metro Recharge',
          amount: '500.00',
          transaction_type: 'expense',
          category: 'Transport',
          is_valid: true,
          is_duplicate: false,
          errors: [],
        },
      ],
    }

    fetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse([])
      if (urlStr.endsWith('/statements/preview') && init?.method === 'POST') {
        return jsonResponse(dupPreview)
      }
      return jsonResponse({}, 404)
    })

    renderPage()

    const fileInput = screen.getByLabelText(/upload csv or xlsx statement file/i)
    await user.upload(fileInput, new File(['mock'], 'reimport.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: /inspect & preview/i }))

    expect(await screen.findByText('Duplicate')).toBeInTheDocument()
    expect(screen.getByText('Duplicates:').parentElement).toHaveTextContent('1')
    expect(screen.getByText('Importable:').parentElement).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /import 1 transaction$/i })).toBeInTheDocument()
  })

  it('displays Paytm SUCCESS eligibility, PENDING/FAILED/missing/unknown exclusions, and accurate importable count', async () => {
    const user = userEvent.setup()

    const paytmPreview: StatementPreviewResponse = {
      filename: 'paytm_passbook.xlsx',
      total_rows: 6,
      valid_rows: 2,
      importable_rows: 1,
      invalid_rows: 0,
      duplicate_rows: 1,
      status_excluded_rows: 4,
      pending_rows: 1,
      failed_rows: 1,
      missing_status_rows: 1,
      unknown_status_rows: 1,
      preview: [
        {
          row_number: 2,
          transaction_date: '2026-04-01',
          description: 'Payment to Swiggy',
          amount: '450.00',
          transaction_type: 'expense',
          category: 'Food/Dining',
          source_status: 'SUCCESS',
          status_category: 'success',
          is_status_excluded: false,
          exclusion_reason: null,
          is_valid: true,
          is_duplicate: false,
          errors: [],
        },
        {
          row_number: 3,
          transaction_date: '2026-04-01',
          description: 'Payment to Swiggy',
          amount: '450.00',
          transaction_type: 'expense',
          category: 'Food/Dining',
          source_status: 'SUCCESS',
          status_category: 'success',
          is_status_excluded: false,
          exclusion_reason: null,
          is_valid: true,
          is_duplicate: true,
          errors: [],
        },
        {
          row_number: 4,
          transaction_date: '2026-04-02',
          description: 'Pending Uber',
          amount: '240.00',
          transaction_type: 'expense',
          category: 'Transport',
          source_status: 'PENDING',
          status_category: 'pending',
          is_status_excluded: true,
          exclusion_reason: 'Pending transaction — excluded (only SUCCESS transactions are imported).',
          is_valid: false,
          is_duplicate: false,
          errors: [],
        },
        {
          row_number: 5,
          transaction_date: '2026-04-03',
          description: 'Failed Bill',
          amount: '999.00',
          transaction_type: 'expense',
          category: 'Other',
          source_status: 'FAILED',
          status_category: 'failed',
          is_status_excluded: true,
          exclusion_reason: 'Failed transaction — excluded (only SUCCESS transactions are imported).',
          is_valid: false,
          is_duplicate: false,
          errors: [],
        },
        {
          row_number: 6,
          transaction_date: '2026-04-04',
          description: 'Blank Status Row',
          amount: '100.00',
          transaction_type: 'expense',
          category: 'Other',
          source_status: null,
          status_category: 'missing',
          is_status_excluded: true,
          exclusion_reason: 'Missing status — excluded (only SUCCESS transactions are imported).',
          is_valid: false,
          is_duplicate: false,
          errors: [],
        },
        {
          row_number: 7,
          transaction_date: '2026-04-05',
          description: 'Unknown Status Row',
          amount: '150.00',
          transaction_type: 'expense',
          category: 'Shopping',
          source_status: 'REVERSED',
          status_category: 'unknown',
          is_status_excluded: true,
          exclusion_reason: "Unrecognized status 'REVERSED' — excluded (only SUCCESS transactions are imported).",
          is_valid: false,
          is_duplicate: false,
          errors: [],
        },
      ],
    }

    fetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse([])
      if (urlStr.endsWith('/statements/preview') && init?.method === 'POST') {
        return jsonResponse(paytmPreview)
      }
      return jsonResponse({}, 404)
    })

    renderPage()

    const fileInput = screen.getByLabelText(/upload csv or xlsx statement file/i)
    await user.upload(fileInput, new File(['mock'], 'paytm_passbook.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    await user.click(screen.getByRole('button', { name: /inspect & preview/i }))

    expect(await screen.findByText('SUCCESS · Eligible')).toBeInTheDocument()
    expect(screen.getByText('Pending — Excluded')).toBeInTheDocument()
    expect(screen.getByText('Failed — Excluded')).toBeInTheDocument()
    expect(screen.getByText('Missing Status — Excluded')).toBeInTheDocument()
    expect(screen.getByText('Unknown (REVERSED) — Excluded')).toBeInTheDocument()
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
    expect(screen.getByText('Pending transaction — excluded (only SUCCESS transactions are imported).')).toBeInTheDocument()
    expect(screen.getByText('Failed transaction — excluded (only SUCCESS transactions are imported).')).toBeInTheDocument()
    expect(screen.getByText('Missing status — excluded (only SUCCESS transactions are imported).')).toBeInTheDocument()
    expect(screen.getByText("Unrecognized status 'REVERSED' — excluded (only SUCCESS transactions are imported).")).toBeInTheDocument()

    expect(screen.getByText('Total:').parentElement).toHaveTextContent('6')
    expect(screen.getByText('Valid:').parentElement).toHaveTextContent('2')
    expect(screen.getByText('Importable:').parentElement).toHaveTextContent('1')
    expect(screen.getByText('Duplicates:').parentElement).toHaveTextContent('1')
    expect(screen.getByText('Excluded:').parentElement).toHaveTextContent('4')
    expect(screen.getByRole('button', { name: /import 1 transaction$/i })).toBeEnabled()
  })

  it('disables import and explains zero eligible rows when all rows are excluded or duplicates', async () => {
    const user = userEvent.setup()

    const zeroEligiblePreview: StatementPreviewResponse = {
      filename: 'only_pending.xlsx',
      total_rows: 1,
      valid_rows: 0,
      importable_rows: 0,
      invalid_rows: 0,
      duplicate_rows: 0,
      status_excluded_rows: 1,
      pending_rows: 1,
      failed_rows: 0,
      missing_status_rows: 0,
      unknown_status_rows: 0,
      preview: [
        {
          row_number: 2,
          transaction_date: '2026-04-02',
          description: 'Pending Order',
          amount: '320.00',
          transaction_type: 'expense',
          category: 'Shopping',
          source_status: 'PENDING',
          status_category: 'pending',
          is_status_excluded: true,
          exclusion_reason: 'Pending transaction — excluded (only SUCCESS transactions are imported).',
          is_valid: false,
          is_duplicate: false,
          errors: [],
        },
      ],
    }

    fetchMock.mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/auth/me')) return jsonResponse({ id: 1, email: 'user@example.com' })
      if (urlStr.endsWith('/statements/history')) return jsonResponse([])
      if (urlStr.endsWith('/statements/preview') && init?.method === 'POST') {
        return jsonResponse(zeroEligiblePreview)
      }
      return jsonResponse({}, 404)
    })

    renderPage()

    const fileInput = screen.getByLabelText(/upload csv or xlsx statement file/i)
    await user.upload(fileInput, new File(['mock'], 'only_pending.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    await user.click(screen.getByRole('button', { name: /inspect & preview/i }))

    expect(await screen.findByText(/no success transactions are eligible to import/i)).toBeInTheDocument()
    const importBtn = screen.getByRole('button', { name: /import 0 transactions/i })
    expect(importBtn).toBeDisabled()
  })
})
