import { describe, expect, it } from 'vitest'
import {
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  validateStatementFile,
} from './validation'

describe('validateStatementFile', () => {
  it('rejects null or undefined file', () => {
    expect(validateStatementFile(null)).toMatch(/select a statement file/i)
    expect(validateStatementFile(undefined)).toMatch(/select a statement file/i)
  })

  it('rejects unsupported file extensions', () => {
    const pdfFile = new File(['dummy content'], 'statement.pdf', { type: 'application/pdf' })
    expect(validateStatementFile(pdfFile)).toMatch(/unsupported file type/i)

    const txtFile = new File(['dummy content'], 'statement.txt', { type: 'text/plain' })
    expect(validateStatementFile(txtFile)).toMatch(/unsupported file type/i)

    const docxFile = new File(['dummy content'], 'statement.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    expect(validateStatementFile(docxFile)).toMatch(/unsupported file type/i)
  })

  it('rejects empty (0 byte) files', () => {
    const emptyCsv = new File([], 'statement.csv', { type: 'text/csv' })
    expect(validateStatementFile(emptyCsv)).toMatch(/file is empty/i)
  })

  it('rejects files exceeding 5 MB', () => {
    const largeContent = new Uint8Array(MAX_FILE_SIZE_BYTES + 1)
    const largeFile = new File([largeContent], 'big_statement.csv', { type: 'text/csv' })
    expect(validateStatementFile(largeFile)).toMatch(/exceeds the 5 MB upload limit/i)
  })

  it('accepts valid .csv and .xlsx files under 5 MB', () => {
    const validCsv = new File(['date,description,amount\n2026-03-01,Groceries,45.00'], 'statement.csv', {
      type: 'text/csv',
    })
    expect(validateStatementFile(validCsv)).toBeNull()

    const validXlsx = new File(['mock binary content'], 'statement.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    expect(validateStatementFile(validXlsx)).toBeNull()
  })

  it('handles case-insensitive extensions (e.g., .CSV, .XLSX)', () => {
    const upperCsv = new File(['date,amount'], 'MARCH.CSV', { type: 'text/csv' })
    expect(validateStatementFile(upperCsv)).toBeNull()

    const upperXlsx = new File(['binary'], 'MARCH.XLSX')
    expect(validateStatementFile(upperXlsx)).toBeNull()
  })
})

describe('formatFileSize', () => {
  it('formats bytes correctly', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(20480)).toBe('20.0 KB')
    expect(formatFileSize(1048576)).toBe('1.0 MB')
    expect(formatFileSize(5242880)).toBe('5.0 MB')
  })
})
