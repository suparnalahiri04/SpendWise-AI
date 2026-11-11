import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as savingsGoalsApi from '@/lib/api/savingsGoals'
import { ApiError } from '@/lib/api/client'
import type { SavingsGoal, SavingsGoalsSummaryResponse } from '@/lib/api/types'
import { useSavingsGoals } from './useSavingsGoals'

const mockGoals: SavingsGoal[] = [
  {
    id: 1,
    user_id: 1,
    name: 'Emergency Fund',
    target_amount: '50000.00',
    target_date: '2026-12-31',
    status: 'in_progress',
    total_contributed: '10000.00',
    remaining_amount: '40000.00',
    progress_pct: 20.0,
    is_completed: false,
    is_on_track: true,
    days_remaining: 60,
    recent_contributions: [],
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 2,
    user_id: 1,
    name: 'New Bike',
    target_amount: '20000.00',
    target_date: null,
    status: 'completed',
    total_contributed: '20000.00',
    remaining_amount: '0.00',
    progress_pct: 100.0,
    is_completed: true,
    is_on_track: true,
    days_remaining: null,
    recent_contributions: [],
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 3,
    user_id: 1,
    name: 'Archived Trip',
    target_amount: '15000.00',
    target_date: null,
    status: 'archived',
    total_contributed: '5000.00',
    remaining_amount: '10000.00',
    progress_pct: 33.33,
    is_completed: false,
    is_on_track: null,
    days_remaining: null,
    recent_contributions: [],
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  },
]

const mockSummary: SavingsGoalsSummaryResponse = {
  total_target_amount: '70000.00',
  total_saved_amount: '30000.00',
  total_remaining_amount: '40000.00',
  overall_progress_pct: 42.86,
  goals_count: 2,
  completed_goals_count: 1,
  items: mockGoals,
}

describe('useSavingsGoals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads goals successfully and provides summary metrics', async () => {
    vi.spyOn(savingsGoalsApi, 'fetchSavingsGoals').mockResolvedValueOnce(mockSummary)

    const { result } = renderHook(() => useSavingsGoals())

    expect(result.current.status).toBe('loading')

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    expect(result.current.goals).toEqual(mockGoals)
    expect(result.current.filteredGoals).toEqual(mockGoals)
    expect(result.current.summary).toEqual(mockSummary)
    expect(result.current.error).toBeNull()
  })

  it('handles API loading failure and exposes error message', async () => {
    vi.spyOn(savingsGoalsApi, 'fetchSavingsGoals').mockRejectedValueOnce(
      new ApiError('network', 'Failed to fetch savings goals from server'),
    )

    const { result } = renderHook(() => useSavingsGoals())

    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })

    expect(result.current.error).toBe('Failed to fetch savings goals from server')
    expect(result.current.goals).toEqual([])
  })

  it('filters goals according to active statusFilter', async () => {
    vi.spyOn(savingsGoalsApi, 'fetchSavingsGoals').mockResolvedValueOnce(mockSummary)

    const { result } = renderHook(() => useSavingsGoals())

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    // Default 'all'
    expect(result.current.filteredGoals).toHaveLength(3)

    // Filter 'in_progress'
    act(() => {
      result.current.setStatusFilter('in_progress')
    })
    expect(result.current.filteredGoals).toHaveLength(1)
    expect(result.current.filteredGoals[0].id).toBe(1)

    // Filter 'completed'
    act(() => {
      result.current.setStatusFilter('completed')
    })
    expect(result.current.filteredGoals).toHaveLength(1)
    expect(result.current.filteredGoals[0].id).toBe(2)

    // Filter 'archived'
    act(() => {
      result.current.setStatusFilter('archived')
    })
    expect(result.current.filteredGoals).toHaveLength(1)
    expect(result.current.filteredGoals[0].id).toBe(3)
  })

  it('allows manual reload after failure', async () => {
    vi.spyOn(savingsGoalsApi, 'fetchSavingsGoals')
      .mockRejectedValueOnce(new ApiError('network', 'Server offline'))
      .mockResolvedValueOnce(mockSummary)

    const { result } = renderHook(() => useSavingsGoals())

    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })

    act(() => {
      result.current.reload()
    })

    expect(result.current.status).toBe('loading')

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    expect(result.current.goals).toHaveLength(3)
  })
})

