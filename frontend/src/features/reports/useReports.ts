import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbortError } from '@/lib/api/client'
import {
  downloadSummaryPdf,
  downloadTransactionsCsv,
  fetchReportSummary,
} from '@/lib/api/reports'
import type { ReportPeriod, ReportSummaryResponse } from '@/lib/api/types'

export type ReportStatus = 'idle' | 'loading' | 'success' | 'error'

export interface UseReportsOptions {
  initialPeriod?: ReportPeriod
  initialStartDate?: string
  initialEndDate?: string
}

export function useReports(options: UseReportsOptions = {}) {
  const [period, setPeriodState] = useState<ReportPeriod>(options.initialPeriod ?? 'this-month')
  const [startDate, setStartDate] = useState<string>(options.initialStartDate ?? '')
  const [endDate, setEndDate] = useState<string>(options.initialEndDate ?? '')

  const initialCustomIncomplete =
    (options.initialPeriod === 'custom') && (!options.initialStartDate || !options.initialEndDate)
  const initialCustomInvalid =
    (options.initialPeriod === 'custom') &&
    Boolean(options.initialStartDate && options.initialEndDate && options.initialStartDate > options.initialEndDate)

  const [status, setStatus] = useState<ReportStatus>(
    initialCustomIncomplete ? 'idle' : initialCustomInvalid ? 'error' : 'loading',
  )
  const [summary, setSummary] = useState<ReportSummaryResponse | null>(null)
  const [error, setError] = useState<string | null>(
    initialCustomInvalid ? 'Start date cannot be after end date.' : null,
  )

  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [lastDownloadedFile, setLastDownloadedFile] = useState<string | null>(null)

  const [reloadToken, setReloadToken] = useState(0)
  const activeRequestIdRef = useRef(0)

  const setPeriod = useCallback(
    (newPeriod: ReportPeriod) => {
      setPeriodState(newPeriod)
      setDownloadError(null)

      if (newPeriod === 'custom' && (!startDate || !endDate)) {
        setStatus('idle')
        setError(null)
        setSummary(null)
      } else if (newPeriod === 'custom' && startDate && endDate && startDate > endDate) {
        setStatus('error')
        setError('Start date cannot be after end date.')
        setSummary(null)
      } else {
        setStatus('loading')
        setError(null)
      }
    },
    [startDate, endDate],
  )

  const setCustomDateRange = useCallback((start: string, end: string) => {
    setStartDate(start)
    setEndDate(end)
    setPeriodState('custom')
    setDownloadError(null)

    if (!start || !end) {
      setStatus('idle')
      setError(null)
      setSummary(null)
    } else if (start > end) {
      setStatus('error')
      setError('Start date cannot be after end date.')
      setSummary(null)
    } else {
      setStatus('loading')
      setError(null)
    }
  }, [])

  const reload = useCallback(() => {
    setStatus('loading')
    setError(null)
    setReloadToken((t) => t + 1)
  }, [])

  useEffect(() => {
    // If in custom mode and dates are invalid or incomplete, skip network request
    if (period === 'custom' && (!startDate || !endDate || startDate > endDate)) {
      return
    }

    const controller = new AbortController()
    const requestId = ++activeRequestIdRef.current

    const params = {
      period,
      start_date: period === 'custom' ? startDate : undefined,
      end_date: period === 'custom' ? endDate : undefined,
    }

    fetchReportSummary(params, controller.signal)
      .then((data) => {
        if (activeRequestIdRef.current === requestId) {
          setSummary(data)
          setStatus('success')
          setError(null)
        }
      })
      .catch((err) => {
        if (isAbortError(err, controller.signal)) return
        if (activeRequestIdRef.current === requestId) {
          setError(err instanceof Error ? err.message : 'Unable to load report summary.')
          setStatus('error')
        }
      })

    return () => {
      controller.abort()
    }
  }, [period, startDate, endDate, reloadToken])

  const downloadCsv = useCallback(async (): Promise<string | null> => {
    if (isDownloadingCsv) return null

    setIsDownloadingCsv(true)
    setDownloadError(null)

    try {
      const params = {
        period,
        start_date: period === 'custom' ? startDate : undefined,
        end_date: period === 'custom' ? endDate : undefined,
      }
      const filename = await downloadTransactionsCsv(params)
      setLastDownloadedFile(filename)
      return filename
    } catch (err) {
      if (!isAbortError(err)) {
        const msg = err instanceof Error ? err.message : 'Failed to download transaction CSV.'
        setDownloadError(msg)
      }
      return null
    } finally {
      setIsDownloadingCsv(false)
    }
  }, [isDownloadingCsv, period, startDate, endDate])

  const downloadPdf = useCallback(async (): Promise<string | null> => {
    if (isDownloadingPdf) return null

    setIsDownloadingPdf(true)
    setDownloadError(null)

    try {
      const params = {
        period,
        start_date: period === 'custom' ? startDate : undefined,
        end_date: period === 'custom' ? endDate : undefined,
      }
      const filename = await downloadSummaryPdf(params)
      setLastDownloadedFile(filename)
      return filename
    } catch (err) {
      if (!isAbortError(err)) {
        const msg = err instanceof Error ? err.message : 'Failed to download financial summary PDF.'
        setDownloadError(msg)
      }
      return null
    } finally {
      setIsDownloadingPdf(false)
    }
  }, [isDownloadingPdf, period, startDate, endDate])

  return {
    period,
    setPeriod,
    startDate,
    endDate,
    setCustomDateRange,
    status,
    summary,
    error,
    reload,
    isDownloadingCsv,
    isDownloadingPdf,
    downloadCsv,
    downloadPdf,
    downloadError,
    lastDownloadedFile,
  }
}
