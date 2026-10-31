export function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function validateTransactionForm(values: {
  description: string
  amount: string
  transactionDate: string
}): string | null {
  const desc = values.description.trim()
  if (!desc) {
    return 'Please enter a transaction description.'
  }
  if (desc.length > 500) {
    return 'Description must be under 500 characters.'
  }

  const amtNum = Number(values.amount)
  if (!values.amount || Number.isNaN(amtNum) || amtNum <= 0) {
    return 'Please enter a valid amount greater than 0.'
  }

  // Check max two decimal places
  if (!/^\d+(\.\d{1,2})?$/.test(values.amount.trim())) {
    return 'Amount can have at most two decimal places.'
  }

  if (!values.transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(values.transactionDate)) {
    return 'Please select a valid date in YYYY-MM-DD format.'
  }

  return null
}

