import type { RecurringFrequency, RecurringPayment } from '@/lib/api/types'

/** Returns today's calendar date as YYYY-MM-DD without UTC shift. */
export function getTodayDateString(refDate: Date = new Date()): string {
  const year = refDate.getFullYear()
  const month = String(refDate.getMonth() + 1).padStart(2, '0')
  const day = String(refDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Formats a frequency identifier for display. */
export function formatFrequency(frequency: RecurringFrequency | string): string {
  switch (frequency) {
    case 'weekly':
      return 'Weekly'
    case 'monthly':
      return 'Monthly'
    case 'quarterly':
      return 'Quarterly'
    case 'yearly':
      return 'Yearly'
    default:
      return frequency.charAt(0).toUpperCase() + frequency.slice(1)
  }
}

export interface DueStatusInfo {
  label: string
  tone: 'sage' | 'butter' | 'terracotta' | 'neutral'
  isOverdue: boolean
}

/** Calculates human badge tone and text for a recurring payment's due status. */
export function getDueStatus(payment: RecurringPayment): DueStatusInfo {
  if (payment.status === 'cancelled' || !payment.is_active) {
    return {
      label: 'Cancelled',
      tone: 'neutral',
      isOverdue: false,
    }
  }

  if (payment.is_overdue || payment.days_until_due < 0) {
    const days = Math.abs(payment.days_until_due)
    return {
      label: days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days`,
      tone: 'terracotta',
      isOverdue: true,
    }
  }

  if (payment.days_until_due === 0) {
    return {
      label: 'Due today',
      tone: 'butter',
      isOverdue: false,
    }
  }

  if (payment.days_until_due === 1) {
    return {
      label: 'Due tomorrow',
      tone: 'butter',
      isOverdue: false,
    }
  }

  if (payment.days_until_due <= 7) {
    return {
      label: `Due in ${payment.days_until_due} days`,
      tone: 'butter',
      isOverdue: false,
    }
  }

  return {
    label: `Due in ${payment.days_until_due} days`,
    tone: 'sage',
    isOverdue: false,
  }
}

export interface RecurringFormValues {
  description: string
  amount: string | number
  category: string
  frequency: string
  startDate?: string
  nextDueDate?: string
}

const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** Validates inputs before creating or editing a recurring payment schedule. */
export function validateRecurringForm(values: RecurringFormValues): string | null {
  const desc = values.description.trim()
  if (!desc) {
    return 'Please enter a description for the payment.'
  }

  const amountNum = typeof values.amount === 'number' ? values.amount : Number(values.amount)
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return 'Amount must be greater than zero.'
  }

  const cat = values.category.trim()
  if (!cat) {
    return 'Please select or enter a category.'
  }

  const validFreqs = ['weekly', 'monthly', 'quarterly', 'yearly']
  if (!validFreqs.includes(values.frequency)) {
    return 'Please choose a valid payment frequency.'
  }

  if (values.startDate && !DATE_REGEX.test(values.startDate.trim())) {
    return 'Start date must be in YYYY-MM-DD format.'
  }

  if (values.nextDueDate && !DATE_REGEX.test(values.nextDueDate.trim())) {
    return 'Next due date must be in YYYY-MM-DD format.'
  }

  return null
}

