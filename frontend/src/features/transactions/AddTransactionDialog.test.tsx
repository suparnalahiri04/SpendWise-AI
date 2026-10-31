import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddTransactionDialog } from './AddTransactionDialog'
import { validateTransactionForm } from './validation'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  fetchMock.mockReset()
})

describe('validateTransactionForm', () => {
  it('rejects blank or whitespace description', () => {
    expect(
      validateTransactionForm({
        description: '   ',
        amount: '100',
        transactionDate: '2026-03-31',
      }),
    ).toMatch(/description/i)
  })

  it('rejects negative or zero amount', () => {
    expect(
      validateTransactionForm({
        description: 'Lunch',
        amount: '0',
        transactionDate: '2026-03-31',
      }),
    ).toMatch(/greater than 0/i)

    expect(
      validateTransactionForm({
        description: 'Lunch',
        amount: '-25.50',
        transactionDate: '2026-03-31',
      }),
    ).toMatch(/greater than 0/i)
  })

  it('rejects non-numeric amount or more than 2 decimal places', () => {
    expect(
      validateTransactionForm({
        description: 'Lunch',
        amount: 'abc',
        transactionDate: '2026-03-31',
      }),
    ).toMatch(/greater than 0/i)

    expect(
      validateTransactionForm({
        description: 'Lunch',
        amount: '12.345',
        transactionDate: '2026-03-31',
      }),
    ).toMatch(/two decimal places/i)
  })

  it('rejects invalid date format', () => {
    expect(
      validateTransactionForm({
        description: 'Lunch',
        amount: '100',
        transactionDate: 'invalid-date',
      }),
    ).toMatch(/valid date/i)
  })

  it('passes on valid form values', () => {
    expect(
      validateTransactionForm({
        description: 'Starbucks Coffee',
        amount: '350.50',
        transactionDate: '2026-03-31',
      }),
    ).toBeNull()
  })
})

describe('AddTransactionDialog', () => {
  it('submits a successful expense with ML auto-categorization (category null)', async () => {
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()

    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 101,
        transaction_date: '2026-03-31',
        description: 'Starbucks coffee',
        amount: '280.00',
        transaction_type: 'expense',
        category: 'Food/Dining',
        predicted_category: 'Food/Dining',
        prediction_confidence: '0.9400',
        is_reviewed: false,
      }, 201),
    )

    render(
      <AddTransactionDialog open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
    )

    await userEvent.type(screen.getByLabelText(/description/i), 'Starbucks coffee')
    await userEvent.type(screen.getByLabelText(/amount/i), '280')

    const saveButton = screen.getByRole('button', { name: /save transaction/i })
    await userEvent.click(saveButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const call = fetchMock.mock.calls[0]
    expect(call[0]).toBe('http://api.test/transactions/')
    const reqBody = JSON.parse(call[1]?.body as string)
    expect(reqBody.description).toBe('Starbucks coffee')
    expect(reqBody.amount).toBe(280)
    expect(reqBody.transaction_type).toBe('expense')
    expect(reqBody.category).toBeNull()

    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 101,
        category: 'Food/Dining',
        is_reviewed: false,
      }),
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('submits a successful income transaction with explicit category', async () => {
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()

    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 102,
        transaction_date: '2026-03-31',
        description: 'Freelance design payment',
        amount: '15000.00',
        transaction_type: 'income',
        category: 'Income',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      }, 201),
    )

    render(
      <AddTransactionDialog open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
    )

    // Switch to income
    await userEvent.click(screen.getByRole('radio', { name: /income/i }))
    await userEvent.type(screen.getByLabelText(/description/i), 'Freelance design payment')
    await userEvent.type(screen.getByLabelText(/amount/i), '15000')

    // Select explicit category
    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'Income')

    await userEvent.click(screen.getByRole('button', { name: /save transaction/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const reqBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(reqBody.transaction_type).toBe('income')
    expect(reqBody.category).toBe('Income')

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 102,
          transaction_type: 'income',
          category: 'Income',
          is_reviewed: true,
        }),
      )
    })
  })

  it('prevents double submission while request is in flight', async () => {
    let resolveRequest: (res: Response) => void = () => {}
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve
      }),
    )

    const onSuccess = vi.fn()
    render(
      <AddTransactionDialog open={true} onOpenChange={vi.fn()} onSuccess={onSuccess} />,
    )

    await userEvent.type(screen.getByLabelText(/description/i), 'Test duplicate')
    await userEvent.type(screen.getByLabelText(/amount/i), '50')

    const saveButton = screen.getByRole('button', { name: /save transaction/i })
    await userEvent.click(saveButton)

    // Second click while in-flight
    await userEvent.click(saveButton)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /saving entry/i })).toBeDisabled()

    // Resolve request
    resolveRequest(
      jsonResponse({
        id: 103,
        transaction_date: '2026-03-31',
        description: 'Test duplicate',
        amount: '50.00',
        transaction_type: 'expense',
        category: 'Other',
        predicted_category: null,
        prediction_confidence: null,
        is_reviewed: true,
      }),
    )

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
  })

  it('displays API error message and allows retry', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Transaction description cannot be empty.' }, 422),
    )

    render(
      <AddTransactionDialog open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />,
    )

    await userEvent.type(screen.getByLabelText(/description/i), 'Invalid Item')
    await userEvent.type(screen.getByLabelText(/amount/i), '10')

    await userEvent.click(screen.getByRole('button', { name: /save transaction/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Transaction description cannot be empty.',
    )

    // Form remains usable to correct and retry
    const saveButton = screen.getByRole('button', { name: /save transaction/i })
    expect(saveButton).toBeEnabled()
  })

  it('allows user to cancel without saving', async () => {
    const onOpenChange = vi.fn()
    render(
      <AddTransactionDialog open={true} onOpenChange={onOpenChange} onSuccess={vi.fn()} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
