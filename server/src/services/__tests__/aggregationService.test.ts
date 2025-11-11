import { describe, expect, test, beforeEach, vi } from 'vitest'

vi.mock('../../config/clickhouse.js', () => ({
  default: {
    query: vi.fn()
  }
}))

import aggregationService from '../aggregationService'
import clickhouseClient from '../../config/clickhouse.js'

const mockQuery = vi.mocked(clickhouseClient.query)

const callPrivate = <T extends (...args: any[]) => any>(fnName: string) => {
  const fn = (aggregationService as unknown as Record<string, T>)[fnName]
  return fn.bind(aggregationService)
}

describe('AggregationService helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('getCategoricalAggregation normalizes value and display_value', async () => {
    mockQuery.mockResolvedValueOnce({
      json: async () => [
        { value: '', display_value: '(Empty)', count: 10, percentage: 50 },
        { value: 'N/A', display_value: '(N/A)', count: 5, percentage: 25 },
        { value: 'yes', display_value: 'yes', count: 5, percentage: 25 }
      ]
    } as any)

    const result = await callPrivate('getCategoricalAggregation')(
      'test_table',
      'status',
      20,
      50,
      '',
      { type: 'rows' }
    )

    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(result).toEqual([
      { value: '', display_value: '(Empty)', count: 10, percentage: 50 },
      { value: 'N/A', display_value: '(N/A)', count: 5, percentage: 25 },
      { value: 'yes', display_value: 'yes', count: 5, percentage: 25 }
    ])
  })

  test('buildFilterCondition handles empty, N/A, numeric values in IN filter', () => {
    const condition = callPrivate('buildFilterCondition')({
      column: 'status',
      operator: 'in',
      value: ['(Empty)', '(N/A)', 5]
    })

    expect(condition).toBe("(status IN ('N/A', 5) OR status = '' OR isNull(status))")
  })

  test('buildFilterCondition handles nulls in IN filter', () => {
    const condition = callPrivate('buildFilterCondition')({
      column: 'notes',
      operator: 'in',
      value: [null, 'value']
    })

    expect(condition).toBe("(notes IN ('value') OR isNull(notes))")
  })

  test('buildFilterCondition handles equality with (Empty)', () => {
    const condition = callPrivate('buildFilterCondition')({
      column: 'age_group',
      operator: 'eq',
      value: '(Empty)'
    })

    expect(condition).toBe("(age_group = '' OR isNull(age_group))")
  })

  test('buildFilterCondition handles equality with N/A literal', () => {
    const condition = callPrivate('buildFilterCondition')({
      column: 'age_group',
      operator: 'eq',
      value: '(N/A)'
    })

    expect(condition).toBe("age_group = 'N/A'")
  })
})

describe('AggregationService - Cross-Table Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockTablesMetadata = [
    {
      table_name: 'patients',
      clickhouse_table_name: 'biai.patients_abc123',
      relationships: []
    },
    {
      table_name: 'samples',
      clickhouse_table_name: 'biai.samples_abc123',
      relationships: [
        {
          foreign_key: 'patient_id',
          referenced_table: 'patients',
          referenced_column: 'patient_id',
          type: 'many-to-one'
        }
      ]
    }
  ]

  const mockTransitiveTablesMetadata = [
    {
      table_name: 'patients',
      clickhouse_table_name: 'biai.patients_abc123',
      relationships: []
    },
    {
      table_name: 'samples',
      clickhouse_table_name: 'biai.samples_abc123',
      relationships: [
        {
          foreign_key: 'patient_id',
          referenced_table: 'patients',
          referenced_column: 'patient_id',
          type: 'many-to-one'
        }
      ]
    },
    {
      table_name: 'mutations',
      clickhouse_table_name: 'biai.mutations_abc123',
      relationships: [
        {
          foreign_key: 'sample_id',
          referenced_table: 'samples',
          referenced_column: 'sample_id',
          type: 'many-to-one'
        }
      ]
    }
  ]

  describe('buildCrossTableSubquery', () => {
    test('generates subquery for child→parent relationship (samples filtered by patients)', () => {
      const filter = {
        column: 'radiation_therapy',
        operator: 'eq' as const,
        value: 'Yes',
        tableName: 'patients'
      }

      const subquery = callPrivate('buildCrossTableSubquery')(
        'samples',
        filter,
        mockTablesMetadata
      )

      expect(subquery).toBe(
        "patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE radiation_therapy = 'Yes')"
      )
    })

    test('generates subquery for parent→child relationship (patients filtered by samples)', () => {
      const filter = {
        column: 'sample_type',
        operator: 'eq' as const,
        value: 'Tumor',
        tableName: 'samples'
      }

      const subquery = callPrivate('buildCrossTableSubquery')(
        'patients',
        filter,
        mockTablesMetadata
      )

      expect(subquery).toBe(
        "patient_id IN (SELECT patient_id FROM biai.samples_abc123 WHERE sample_type = 'Tumor')"
      )
    })

    test('returns null when filter has no tableName', () => {
      const filter = {
        column: 'radiation_therapy',
        operator: 'eq' as const,
        value: 'Yes'
      }

      const subquery = callPrivate('buildCrossTableSubquery')(
        'patients',
        filter,
        mockTablesMetadata
      )

      expect(subquery).toBeNull()
    })

    test('returns null when filter tableName matches current table', () => {
      const filter = {
        column: 'radiation_therapy',
        operator: 'eq' as const,
        value: 'Yes',
        tableName: 'patients'
      }

      const subquery = callPrivate('buildCrossTableSubquery')(
        'patients',
        filter,
        mockTablesMetadata
      )

      expect(subquery).toBeNull()
    })

    test('returns null when no relationship exists between tables', () => {
      const metadataWithoutRels = [
        {
          table_name: 'patients',
          clickhouse_table_name: 'biai.patients_abc123',
          relationships: []
        },
        {
          table_name: 'treatments',
          clickhouse_table_name: 'biai.treatments_abc123',
          relationships: []
        }
      ]

      const filter = {
        column: 'treatment_type',
        operator: 'eq' as const,
        value: 'Chemotherapy',
        tableName: 'treatments'
      }

      const subquery = callPrivate('buildCrossTableSubquery')(
        'patients',
        filter,
        metadataWithoutRels
      )

      expect(subquery).toBeNull()
    })

    test('handles IN operator with multiple values', () => {
      const filter = {
        column: 'radiation_therapy',
        operator: 'in' as const,
        value: ['Yes', 'No'],
        tableName: 'patients'
      }

      const subquery = callPrivate('buildCrossTableSubquery')(
        'samples',
        filter,
        mockTablesMetadata
      )

      expect(subquery).toBe(
        "patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE radiation_therapy IN ('Yes', 'No'))"
      )
    })

    test('handles BETWEEN operator for numeric ranges', () => {
      const filter = {
        column: 'age',
        operator: 'between' as const,
        value: [30, 50],
        tableName: 'patients'
      }

      const subquery = callPrivate('buildCrossTableSubquery')(
        'samples',
        filter,
        mockTablesMetadata
      )

      expect(subquery).toBe(
        'patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE age BETWEEN 30 AND 50)'
      )
    })

    test('generates nested IN subquery for transitive 2-hop relationship (mutations→samples→patients)', () => {
      const filter = {
        column: 'age',
        operator: 'gte' as const,
        value: 50,
        tableName: 'patients'
      }

      const subquery = callPrivate('buildCrossTableSubquery')(
        'mutations',
        filter,
        mockTransitiveTablesMetadata
      )

      // Should use nested IN subqueries (ClickHouse-friendly, no JOINs)
      expect(subquery).toContain('sample_id IN')
      expect(subquery).toContain('SELECT sample_id FROM biai.samples_abc123')
      expect(subquery).toContain('patient_id IN')
      expect(subquery).toContain('SELECT patient_id FROM biai.patients_abc123')
      expect(subquery).toContain('age >= 50')
    })

    test('generates nested IN subquery for reverse transitive relationship (patients→samples→mutations)', () => {
      const filter = {
        column: 'gene',
        operator: 'eq' as const,
        value: 'TP53',
        tableName: 'mutations'
      }

      const subquery = callPrivate('buildCrossTableSubquery')(
        'patients',
        filter,
        mockTransitiveTablesMetadata
      )

      // Should use nested IN subqueries (ClickHouse-friendly, no JOINs)
      expect(subquery).toContain('patient_id IN')
      expect(subquery).toContain('SELECT patient_id FROM biai.samples_abc123')
      expect(subquery).toContain('sample_id IN')
      expect(subquery).toContain('SELECT sample_id FROM biai.mutations_abc123')
      expect(subquery).toContain("gene = 'TP53'")
    })
  })

  describe('findRelationshipPath', () => {
    test('finds direct relationship path', () => {
      const path = callPrivate('findRelationshipPath')(
        'samples',
        'patients',
        mockTablesMetadata
      )

      expect(path).toBeTruthy()
      expect(path).toHaveLength(1)
      expect(path[0].from).toBe('samples')
      expect(path[0].to).toBe('patients')
    })

    test('finds transitive 2-hop relationship path', () => {
      const path = callPrivate('findRelationshipPath')(
        'mutations',
        'patients',
        mockTransitiveTablesMetadata
      )

      expect(path).toBeTruthy()
      expect(path).toHaveLength(2)
      expect(path[0].from).toBe('mutations')
      expect(path[0].to).toBe('samples')
      expect(path[1].from).toBe('samples')
      expect(path[1].to).toBe('patients')
    })

    test('finds reverse transitive path', () => {
      const path = callPrivate('findRelationshipPath')(
        'patients',
        'mutations',
        mockTransitiveTablesMetadata
      )

      expect(path).toBeTruthy()
      expect(path).toHaveLength(2)
    })

    test('returns null when no path exists', () => {
      const noPathMetadata = [
        ...mockTransitiveTablesMetadata,
        {
          table_name: 'unrelated',
          clickhouse_table_name: 'biai.unrelated_abc123',
          relationships: []
        }
      ]

      const path = callPrivate('findRelationshipPath')(
        'patients',
        'unrelated',
        noPathMetadata
      )

      expect(path).toBeNull()
    })

    test('returns null for same table', () => {
      const path = callPrivate('findRelationshipPath')(
        'patients',
        'patients',
        mockTablesMetadata
      )

      expect(path).toBeNull()
    })
  })

  describe('buildWhereClause with cross-table filters', () => {
    test('combines local and cross-table filters with AND', () => {
      const filters = [
        {
          column: 'sample_type',
          operator: 'eq' as const,
          value: 'Tumor',
          tableName: 'samples'
        },
        {
          column: 'radiation_therapy',
          operator: 'eq' as const,
          value: 'Yes',
          tableName: 'patients'
        }
      ]

      const whereClause = callPrivate('buildWhereClause')(
        filters,
        new Set(['sample_type']), // samples table has sample_type column
        'samples',
        mockTablesMetadata
      )

      expect(whereClause).toContain("sample_type = 'Tumor'")
      expect(whereClause).toContain(
        "patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE radiation_therapy = 'Yes')"
      )
      expect(whereClause).toContain('AND')
    })

    test('handles only cross-table filters', () => {
      const filters = [
        {
          column: 'radiation_therapy',
          operator: 'eq' as const,
          value: 'Yes',
          tableName: 'patients'
        }
      ]

      const whereClause = callPrivate('buildWhereClause')(
        filters,
        new Set(['sample_type', 'sample_id']), // samples columns
        'samples',
        mockTablesMetadata
      )

      expect(whereClause).toBe(
        "AND (patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE radiation_therapy = 'Yes'))"
      )
    })

    test('handles only local filters', () => {
      const filters = [
        {
          column: 'sample_type',
          operator: 'eq' as const,
          value: 'Tumor',
          tableName: 'samples'
        }
      ]

      const whereClause = callPrivate('buildWhereClause')(
        filters,
        new Set(['sample_type']),
        'samples',
        mockTablesMetadata
      )

      expect(whereClause).toBe("AND (sample_type = 'Tumor')")
    })

    test('filters out non-existent columns from local filters', () => {
      const filters = [
        {
          column: 'non_existent_column',
          operator: 'eq' as const,
          value: 'value',
          tableName: 'samples'
        },
        {
          column: 'sample_type',
          operator: 'eq' as const,
          value: 'Tumor',
          tableName: 'samples'
        }
      ]

      const whereClause = callPrivate('buildWhereClause')(
        filters,
        new Set(['sample_type']), // only sample_type exists
        'samples',
        mockTablesMetadata
      )

      // Should only include sample_type, not non_existent_column
      expect(whereClause).toBe("AND (sample_type = 'Tumor')")
      expect(whereClause).not.toContain('non_existent_column')
    })

    test('returns empty string when no valid filters', () => {
      const filters = [
        {
          column: 'non_existent_column',
          operator: 'eq' as const,
          value: 'value',
          tableName: 'samples'
        }
      ]

      const whereClause = callPrivate('buildWhereClause')(
        filters,
        new Set(['sample_type']), // column doesn't exist
        'samples',
        mockTablesMetadata
      )

      expect(whereClause).toBe('')
    })

    test('handles multiple cross-table filters from different tables', () => {
      const extendedMetadata = [
        ...mockTablesMetadata,
        {
          table_name: 'treatments',
          clickhouse_table_name: 'biai.treatments_abc123',
          relationships: [
            {
              foreign_key: 'patient_id',
              referenced_table: 'patients',
              referenced_column: 'patient_id',
              type: 'many-to-one'
            }
          ]
        }
      ]

      const filters = [
        {
          column: 'sample_type',
          operator: 'eq' as const,
          value: 'Tumor',
          tableName: 'samples'
        },
        {
          column: 'treatment_type',
          operator: 'eq' as const,
          value: 'Chemotherapy',
          tableName: 'treatments'
        }
      ]

      const whereClause = callPrivate('buildWhereClause')(
        filters,
        new Set(['patient_id', 'radiation_therapy']),
        'patients',
        extendedMetadata
      )

      expect(whereClause).toContain(
        "patient_id IN (SELECT patient_id FROM biai.samples_abc123 WHERE sample_type = 'Tumor')"
      )
      expect(whereClause).toContain(
        "patient_id IN (SELECT patient_id FROM biai.treatments_abc123 WHERE treatment_type = 'Chemotherapy')"
      )
    })
  })

  describe('buildWhereClause with logical operators and cross-table filters', () => {
    test('handles OR filters with cross-table filtering', () => {
      const filters = {
        or: [
          {
            column: 'sample_type',
            operator: 'eq' as const,
            value: 'Tumor',
            tableName: 'samples'
          },
          {
            column: 'sample_type',
            operator: 'eq' as const,
            value: 'Normal',
            tableName: 'samples'
          }
        ]
      }

      const whereClause = callPrivate('buildWhereClause')(
        filters,
        new Set(['sample_type']),
        'samples',
        mockTablesMetadata
      )

      expect(whereClause).toContain("sample_type = 'Tumor'")
      expect(whereClause).toContain("sample_type = 'Normal'")
      expect(whereClause).toContain('OR')
    })

    test('handles AND filters with cross-table filtering', () => {
      // When filters are combined with AND, they're passed as an array (not wrapped in an 'and' object)
      const filters = [
        {
          column: 'sample_type',
          operator: 'eq' as const,
          value: 'Tumor',
          tableName: 'samples'
        },
        {
          column: 'radiation_therapy',
          operator: 'eq' as const,
          value: 'Yes',
          tableName: 'patients'
        }
      ]

      const whereClause = callPrivate('buildWhereClause')(
        filters,
        new Set(['sample_type']),
        'samples',
        mockTablesMetadata
      )

      expect(whereClause).toContain("sample_type = 'Tumor'")
      expect(whereClause).toContain(
        "patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE radiation_therapy = 'Yes')"
      )
    })
  })
})
