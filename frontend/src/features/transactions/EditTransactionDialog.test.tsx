import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTokenProvider } from '@/lib/api/client'
import type { Transaction } from '@/lib/api/types'
import { EditTransactionDialog } from './EditTransactionDialog'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const sampleTransaction: Transaction = {
  id: 42,
  transaction_date: '2026-03-25',
  description: 'Swiggy Dinner Order',
  amount: '350.00',
  transaction_type: 'expense',
  category: 'Other',
  predicted_category: 'Other',
  prediction_confidence: '0.45',
  is_reviewed: false,
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  setTokenProvider(() => 'jwt-test-token')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  setTokenProvider(() => null)
  fetchMock.mockReset()
})

describe('EditTransactionDialog', () => {
  it('prefills all inputs with the transaction values and displays AI prediction info', () => {
    render(
      <EditTransactionDialog
        open={true}
        transaction={sampleTransaction}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: /edit transaction/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toHaveValue('Swiggy Dinner Order')
    expect(screen.getByLabelText(/amount/i)).toHaveValue(350)
    expect(screen.getByLabelText(/date/i)).toHaveValue('2026-03-25')
    expect(screen.getByLabelText(/category/i)).toHaveValue('Other')
    expect(screen.getByRole('radio', { name: /expense/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/originally classified by ai as/i)).toBeInTheDocument()
  })

  it('validates description and amount and does not submit if invalid', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()

    render(
      <EditTransactionDialog
        open={true}
        transaction={sampleTransaction}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    const descInput = screen.getByLabelText(/description/i)
    await user.clear(descInput)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/description/i)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('submits updated values and category correction to PUT /transactions/{id}', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()

    const updatedTx: Transaction = {
      ...sampleTransaction,
      category: 'Food/Dining',
      description: 'Swiggy Dinner Biryani',
      amount: '420.00',
      is_reviewed: true,
    }

    fetchMock.mockResolvedValueOnce(jsonResponse(updatedTx))

    render(
      <EditTransactionDialog
        open={true}
        transaction={sampleTransaction}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    )

    // Change category from "Other" to "Food/Dining"
    const categorySelect = screen.getByLabelText(/category/i)
    await user.selectOptions(categorySelect, 'Food/Dining')

    // Change description
    const descInput = screen.getByLabelText(/description/i)
    await user.clear(descInput)
    await user.type(descInput, 'Swiggy Dinner Biryani')

    // Change amount
    const amtInput = screen.getByLabelText(/amount/i)
    await user.clear(amtInput)
    await user.type(amtInput, '420')

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api.test/transactions/42')
    expect(init?.method).toBe('PUT')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer jwt-test-token',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      description: 'Swiggy Dinner Biryani',
      amount: 420,
      transaction_date: '2026-03-25',
      transaction_type: 'expense',
      category: 'Food/Dining',
    })

    expect(onSuccess).toHaveBeenCalledWith(updatedTx)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('displays API error messages and allows retry', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Database lock timeout. Please retry.' }, 500),
    )

    render(
      <EditTransactionDialog
        open={true}
        transaction={sampleTransaction}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(
      await screen.findByText(/the server ran into a problem|database lock timeout/i),
    ).toBeInTheDocument()

    // Retry should work when API succeeds
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...sampleTransaction, is_reviewed: true }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  it('prevents double submission while request is in flight', async () => {
    const user = userEvent.setup()

    let resolvePromise: (res: Response) => void = () => {}
    const slowResponse = new Promise<Response>((resolve) => {
      resolvePromise = resolve
    })

    fetchMock.mockImplementationOnce(() => slowResponse)

    render(
      <EditTransactionDialog
        open={true}
        transaction={sampleTransaction}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    const saveButton = screen.getByRole('button', { name: /save changes/i })
    await user.click(saveButton)

    // While in flight, button is disabled with loading text
    expect(saveButton).toBeDisabled()
    expect(screen.getByText(/saving changes…/i)).toBeInTheDocument()

    // Second click does nothing
    await user.click(saveButton)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Complete the call
    resolvePromise(jsonResponse({ ...sampleTransaction, is_reviewed: true }))
    await waitFor(() => {
      expect(screen.queryByText(/saving changes…/i)).not.toBeInTheDocument()
    })
  })

  it('cancels without saving when clicking Cancel', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <EditTransactionDialog
        open={true}
        transaction={sampleTransaction}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('formats decimal, percentage, 59.9% boundary, and invalid confidence scores cleanly', () => {
    const cases: Array<{ conf: string | null; expectedText: RegExp; forbidden?: RegExp }> = [
      { conf: '0.599', expectedText: /Food\/Dining \(59\.9% confidence\)/, forbidden: /60%/ },
      { conf: '0.60', expectedText: /Food\/Dining \(60% confidence\)/ },
      { conf: '85', expectedText: /Food\/Dining \(85% confidence\)/, forbidden: /8500%/ },
      { conf: 'not-a-number', expectedText: /Originally classified by AI as Food\/Dining\./, forbidden: /NaN%|Infinity%/ },
      { conf: '', expectedText: /Originally classified by AI as Food\/Dining\./, forbidden: /0%/ },
      { conf: null, expectedText: /Originally classified by AI as Food\/Dining\./, forbidden: /confidence/ },
    ]

    for (const c of cases) {
      const { unmount } = render(
        <EditTransactionDialog
          open={true}
          transaction={{
            ...sampleTransaction,
            predicted_category: 'Food/Dining',
            prediction_confidence: c.conf as string | null,
          }}
          onOpenChange={vi.fn()}
          onSuccess={vi.fn()}
        />,
      )
      const banner = screen.getByText(
        (_content, el) =>
          el?.tagName === 'SPAN' && c.expectedText.test(el.textContent ?? ''),
      )
      expect(banner).toBeInTheDocument()
      if (c.forbidden) {
        expect(banner.textContent).not.toMatch(c.forbidden)
      }
      unmount()
    }
  })
})

