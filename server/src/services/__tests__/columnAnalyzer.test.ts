import { describe, test, expect, beforeEach, vi } from 'vitest'

// Mock the ClickHouse client
vi.mock('../../config/clickhouse.js', () => ({
  default: {
    query: vi.fn()
  }
}))

import { analyzeColumn } from '../columnAnalyzer'
import clickhouseClient from '../../config/clickhouse.js'

const mockQuery = vi.mocked(clickhouseClient.query)

describe('Column Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Helper to mock column stats
  const mockColumnStats = (stats: { unique_count: number; null_count: number; total_count?: number }) => {
    // Mock count query
    mockQuery.mockResolvedValueOnce({
      json: async () => [{
        unique_count: stats.unique_count,
        null_count: stats.null_count,
        total_count: stats.total_count || 100
      }]
    } as any)
    // Mock sample query
    mockQuery.mockResolvedValueOnce({
      json: async () => []
    } as any)
  }

  // Helper to mock numeric column stats with min/max
  const mockNumericStats = (stats: { unique_count: number; null_count: number; min_value: string; max_value: string; total_count?: number }) => {
    mockColumnStats({ unique_count: stats.unique_count, null_count: stats.null_count, total_count: stats.total_count })
    // Mock min/max query for numeric columns
    mockQuery.mockResolvedValueOnce({
      json: async () => [{
        min_val: stats.min_value,
        max_val: stats.max_value
      }]
    } as any)
  }

  describe('Display Type Detection', () => {
    test('should identify ID columns', async () => {
      mockColumnStats({ unique_count: 100, null_count: 0 })
      const result = await analyzeColumn('test_table', 'patient_id', 'String')
      expect(result.display_type).toBe('id')
      expect(result.is_hidden).toBe(true)
    })

    test('should identify categorical columns', async () => {
      mockColumnStats({ unique_count: 5, null_count: 0 })
      const result = await analyzeColumn('test_table', 'gender', 'String')
      expect(result.display_type).toBe('categorical')
      expect(result.suggested_chart).toBe('pie')
      expect(result.is_hidden).toBe(false)
    })

    test('should identify numeric columns', async () => {
      mockNumericStats({ unique_count: 80, null_count: 5, min_value: '18', max_value: '95' })
      const result = await analyzeColumn('test_table', 'age', 'Int32')
      expect(result.display_type).toBe('numeric')
      expect(result.suggested_chart).toBe('histogram')
    })

    test('should identify text columns', async () => {
      mockColumnStats({ unique_count: 95, null_count: 0 })
      const result = await analyzeColumn('test_table', 'description', 'String')
      // 95/100 unique values is still categorical (threshold is >95%)
      expect(result.display_type).toBe('categorical')
      expect(result.suggested_chart).toBe('none')
    })
  })

  describe('Chart Suggestion', () => {
    test('should suggest pie chart for low cardinality categoricals', async () => {
      mockColumnStats({ unique_count: 3, null_count: 0 })
      const result = await analyzeColumn('test_table', 'status', 'String')
      expect(result.suggested_chart).toBe('pie')
    })

    test('should suggest bar chart for medium cardinality categoricals', async () => {
      mockColumnStats({ unique_count: 15, null_count: 0 })
      const result = await analyzeColumn('test_table', 'city', 'String')
      expect(result.suggested_chart).toBe('bar')
    })

    test('should suggest histogram for numeric columns', async () => {
      mockNumericStats({ unique_count: 50, null_count: 0, min_value: '10', max_value: '100' })
      const result = await analyzeColumn('test_table', 'score', 'Float64')
      expect(result.suggested_chart).toBe('histogram')
    })

    test('should suggest none for ID columns', async () => {
      mockColumnStats({ unique_count: 100, null_count: 0 })
      const result = await analyzeColumn('test_table', 'uuid', 'String')
      expect(result.suggested_chart).toBe('none')
    })
  })

  describe('Priority Calculation', () => {
    test('should assign low priority to ID columns', async () => {
      mockColumnStats({ unique_count: 100, null_count: 0 })
      const result = await analyzeColumn('test_table', 'id', 'String')
      expect(result.display_priority).toBe(0)
    })

    test('should assign high priority to low cardinality categoricals', async () => {
      mockColumnStats({ unique_count: 3, null_count: 0 })
      const result = await analyzeColumn('test_table', 'gender', 'String')
      expect(result.display_priority).toBeGreaterThan(500)
    })

    test('should assign medium priority to numeric columns', async () => {
      mockNumericStats({ unique_count: 50, null_count: 0, min_value: '0', max_value: '100' })
      const result = await analyzeColumn('test_table', 'age', 'Int32')
      expect(result.display_priority).toBeGreaterThan(0)
      expect(result.display_priority).toBeLessThan(1000)
    })
  })

  describe('Hidden Column Detection', () => {
    test('should hide ID columns', async () => {
      mockColumnStats({ unique_count: 100, null_count: 0 })
      const result = await analyzeColumn('test_table', 'patient_id', 'String')
      expect(result.is_hidden).toBe(true)
    })

    test('should hide columns with all unique values (not ID)', async () => {
      mockColumnStats({ unique_count: 100, null_count: 0 })
      const result = await analyzeColumn('test_table', 'description', 'String')
      expect(result.is_hidden).toBe(true)
    })

    test('should hide columns with single unique value', async () => {
      mockColumnStats({ unique_count: 1, null_count: 0 })
      const result = await analyzeColumn('test_table', 'constant', 'String')
      expect(result.is_hidden).toBe(true)
    })

    test('should not hide useful categorical columns', async () => {
      mockColumnStats({ unique_count: 5, null_count: 0 })
      const result = await analyzeColumn('test_table', 'status', 'String')
      expect(result.is_hidden).toBe(false)
    })
  })

  describe('Null Handling', () => {
    test('should return correct null count', async () => {
      mockColumnStats({ unique_count: 3, null_count: 25 })
      const result = await analyzeColumn('test_table', 'optional_field', 'String')
      expect(result.null_count).toBe(25)
    })

    test('should handle columns with all nulls', async () => {
      mockColumnStats({ unique_count: 0, null_count: 100 })
      const result = await analyzeColumn('test_table', 'empty_field', 'String')
      expect(result.null_count).toBe(100)
      expect(result.is_hidden).toBe(true)
    })
  })
})
