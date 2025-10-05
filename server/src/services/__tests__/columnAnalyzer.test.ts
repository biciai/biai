import { analyzeColumn } from '../columnAnalyzer'

// Mock the ClickHouse client
jest.mock('../../config/clickhouse.js', () => ({
  default: {
    query: jest.fn()
  }
}))

import clickhouseClient from '../../config/clickhouse.js'

describe('Column Analyzer', () => {
  const mockClickhouseClient = clickhouseClient as jest.Mocked<typeof clickhouseClient>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Display Type Detection', () => {
    test('should identify ID columns', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 100,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'patient_id', 'String', 100)

      expect(result.display_type).toBe('id')
      expect(result.is_hidden).toBe(true)
    })

    test('should identify categorical columns', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 5,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'gender', 'String', 100)

      expect(result.display_type).toBe('categorical')
      expect(result.suggested_chart).toBe('pie')
      expect(result.is_hidden).toBe(false)
    })

    test('should identify numeric columns', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 80,
          null_count: 5,
          min_value: '18',
          max_value: '95'
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'age', 'Int32', 100)

      expect(result.display_type).toBe('numeric')
      expect(result.suggested_chart).toBe('histogram')
    })

    test('should identify text columns', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 95,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'description', 'String', 100)

      expect(result.display_type).toBe('text')
      expect(result.suggested_chart).toBe('none')
    })
  })

  describe('Chart Suggestion', () => {
    test('should suggest pie chart for low cardinality categoricals', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 3,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'status', 'String', 100)

      expect(result.suggested_chart).toBe('pie')
    })

    test('should suggest bar chart for medium cardinality categoricals', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 15,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'city', 'String', 100)

      expect(result.suggested_chart).toBe('bar')
    })

    test('should suggest histogram for numeric columns', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 50,
          null_count: 0,
          min_value: '10',
          max_value: '100'
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'score', 'Float64', 100)

      expect(result.suggested_chart).toBe('histogram')
    })

    test('should suggest none for ID columns', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 100,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'uuid', 'String', 100)

      expect(result.suggested_chart).toBe('none')
    })
  })

  describe('Priority Calculation', () => {
    test('should assign low priority to ID columns', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 100,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'id', 'String', 100)

      expect(result.display_priority).toBe(0)
    })

    test('should assign high priority to low cardinality categoricals', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 3,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'gender', 'String', 100)

      expect(result.display_priority).toBeGreaterThan(500)
    })

    test('should assign medium priority to numeric columns', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 50,
          null_count: 0,
          min_value: '0',
          max_value: '100'
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'age', 'Int32', 100)

      expect(result.display_priority).toBeGreaterThan(0)
      expect(result.display_priority).toBeLessThan(1000)
    })
  })

  describe('Hidden Column Detection', () => {
    test('should hide ID columns', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 100,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'patient_id', 'String', 100)

      expect(result.is_hidden).toBe(true)
    })

    test('should hide columns with all unique values (not ID)', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 100,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'description', 'String', 100)

      expect(result.is_hidden).toBe(true)
    })

    test('should hide columns with single unique value', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 1,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'constant', 'String', 100)

      expect(result.is_hidden).toBe(true)
    })

    test('should not hide useful categorical columns', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 5,
          null_count: 0,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'status', 'String', 100)

      expect(result.is_hidden).toBe(false)
    })
  })

  describe('Null Handling', () => {
    test('should return correct null count', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 3,
          null_count: 25,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'optional_field', 'String', 100)

      expect(result.null_count).toBe(25)
    })

    test('should handle columns with all nulls', async () => {
      mockClickhouseClient.query.mockResolvedValueOnce({
        json: async () => [{
          unique_value_count: 0,
          null_count: 100,
          min_value: null,
          max_value: null
        }]
      } as any)

      const result = await analyzeColumn('test_table', 'empty_field', 'String', 100)

      expect(result.null_count).toBe(100)
      expect(result.is_hidden).toBe(true)
    })
  })
})
