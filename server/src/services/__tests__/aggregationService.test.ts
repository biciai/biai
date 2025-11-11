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

    expect(condition).toBe("(base_table.status IN ('N/A', 5) OR base_table.status = '' OR isNull(base_table.status))")
  })

  test('buildFilterCondition handles nulls in IN filter', () => {
    const condition = callPrivate('buildFilterCondition')({
      column: 'notes',
      operator: 'in',
      value: [null, 'value']
    })

    expect(condition).toBe("(base_table.notes IN ('value') OR isNull(base_table.notes))")
  })

  test('buildFilterCondition handles equality with (Empty)', () => {
    const condition = callPrivate('buildFilterCondition')({
      column: 'age_group',
      operator: 'eq',
      value: '(Empty)'
    })

    expect(condition).toBe("(base_table.age_group = '' OR isNull(base_table.age_group))")
  })

  test('buildFilterCondition handles equality with N/A literal', () => {
    const condition = callPrivate('buildFilterCondition')({
      column: 'age_group',
      operator: 'eq',
      value: '(N/A)'
    })

    expect(condition).toBe("base_table.age_group = 'N/A'")
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
        "base_table.patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE radiation_therapy = 'Yes')"
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
        "base_table.patient_id IN (SELECT patient_id FROM biai.samples_abc123 WHERE sample_type = 'Tumor')"
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
        "base_table.patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE radiation_therapy IN ('Yes', 'No'))"
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
        'base_table.patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE age BETWEEN 30 AND 50)'
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

      expect(whereClause).toContain("base_table.sample_type = 'Tumor'")
      expect(whereClause).toContain(
        "base_table.patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE radiation_therapy = 'Yes')"
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
        "AND (base_table.patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE radiation_therapy = 'Yes'))"
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

      expect(whereClause).toBe("AND (base_table.sample_type = 'Tumor')")
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
      expect(whereClause).toBe("AND (base_table.sample_type = 'Tumor')")
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
        "base_table.patient_id IN (SELECT patient_id FROM biai.samples_abc123 WHERE sample_type = 'Tumor')"
      )
      expect(whereClause).toContain(
        "base_table.patient_id IN (SELECT patient_id FROM biai.treatments_abc123 WHERE treatment_type = 'Chemotherapy')"
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

      expect(whereClause).toContain("base_table.sample_type = 'Tumor'")
      expect(whereClause).toContain("base_table.sample_type = 'Normal'")
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

      expect(whereClause).toContain("base_table.sample_type = 'Tumor'")
      expect(whereClause).toContain(
        "base_table.patient_id IN (SELECT patient_id FROM biai.patients_abc123 WHERE radiation_therapy = 'Yes')"
      )
    })
  })
})

describe('AggregationService - countBy metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const metadata: any = [
    {
      table_name: 'samples',
      clickhouse_table_name: 'biai.samples_raw',
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
      table_name: 'patients',
      clickhouse_table_name: 'biai.patients_raw',
      relationships: []
    }
  ]

  test('resolveMetricContext returns parent configuration', () => {
    const context = callPrivate('resolveMetricContext')(
      'samples',
      { mode: 'parent', target_table: 'patients' },
      metadata
    )

    expect(context).toEqual({
      type: 'parent',
      parentTable: 'patients',
      parentColumn: 'patient_id',
      joins: [],
      ancestorExpression: 'base_table.patient_id',
      pathSegments: [
        { from_table: 'samples', via_column: 'patient_id', to_table: 'patients' }
      ]
    })
  })

  test('resolveMetricContext throws descriptive 400 error when relationship missing', () => {
    expect.assertions(2)

    try {
      callPrivate('resolveMetricContext')(
        'samples',
        { mode: 'parent', target_table: 'unknown' },
        metadata
      )
    } catch (error: any) {
      expect(error.status).toBe(400)
      expect(error.message).toContain('No relationship')
    }
  })

  test('getColumnAggregation returns parent metric metadata', async () => {
    const getTableColumnsSpy = vi.spyOn(aggregationService as any, 'getTableColumns')
      .mockResolvedValue(new Set(['status']))

    mockQuery
      .mockResolvedValueOnce({
        json: async () => [{ table_name: 'samples', clickhouse_table_name: 'biai.samples_raw', row_count: 10 }]
      } as any)
      .mockResolvedValueOnce({
        json: async () => [{ filtered_count: 3 }]
      } as any)
      .mockResolvedValueOnce({
        json: async () => [{ null_count: 1, unique_count: 2 }]
      } as any)
      .mockResolvedValueOnce({
        json: async () => [{ value: 'A', display_value: 'A', count: 2, percentage: 100 }]
      } as any)

    const result = await aggregationService.getColumnAggregation(
      'dataset-1',
      'table-1',
      'status',
      'categorical',
      [],
      'samples',
      metadata,
      { mode: 'parent', target_table: 'patients' }
    )

    expect(result.metric_type).toBe('parent')
    expect(result.metric_parent_table).toBe('patients')
    expect(result.total_rows).toBe(3)
    expect(result.categories).toEqual([{ value: 'A', display_value: 'A', count: 2, percentage: 100 }])
    expect(result.metric_path).toEqual([{ from_table: 'samples', via_column: 'patient_id', to_table: 'patients' }])
    expect(mockQuery).toHaveBeenCalledTimes(4)

    getTableColumnsSpy.mockRestore()
  })

  test('resolveMetricContext builds joins for multi-hop ancestor', () => {
    const extendedMetadata = [
      {
        table_name: 'mutations',
        clickhouse_table_name: 'biai.mutations_raw',
        relationships: [
          { foreign_key: 'sample_id', referenced_table: 'samples', referenced_column: 'sample_id', type: 'many-to-one' }
        ]
      },
      {
        table_name: 'samples',
        clickhouse_table_name: 'biai.samples_raw',
        relationships: [
          { foreign_key: 'patient_id', referenced_table: 'patients', referenced_column: 'patient_id', type: 'many-to-one' }
        ]
      },
      {
        table_name: 'patients',
        clickhouse_table_name: 'biai.patients_raw',
        relationships: [
          { foreign_key: 'hospital_id', referenced_table: 'hospitals', referenced_column: 'hospital_id', type: 'many-to-one' }
        ]
      },
      {
        table_name: 'hospitals',
        clickhouse_table_name: 'biai.hospitals_raw',
        relationships: []
      }
    ]

    const context = callPrivate('resolveMetricContext')(
      'mutations',
      { mode: 'parent', target_table: 'hospitals' },
      extendedMetadata
    )

    expect(context.joins).toEqual([
      {
        alias: 'ancestor_0',
        table: 'biai.samples_raw',
        on: 'base_table.sample_id = ancestor_0.sample_id'
      },
      {
        alias: 'ancestor_1',
        table: 'biai.patients_raw',
        on: 'ancestor_0.patient_id = ancestor_1.patient_id'
      }
    ])
    expect(context.ancestorExpression).toBe('ancestor_1.hospital_id')
    expect(context.parentTable).toBe('hospitals')
    expect(context.parentColumn).toBe('hospital_id')
    expect(context.pathSegments).toHaveLength(3)
  })

  test('getTableAggregations returns multi-hop parent metrics end-to-end', async () => {
    const getTableColumnsSpy = vi.spyOn(aggregationService as any, 'getTableColumns')
      .mockResolvedValue(new Set(['status']))

    const datasetTables = [
      { table_id: 'table-mutations', table_name: 'mutations', clickhouse_table_name: 'biai.mutations_raw' },
      { table_id: 'table-samples', table_name: 'samples', clickhouse_table_name: 'biai.samples_raw' },
      { table_id: 'table-patients', table_name: 'patients', clickhouse_table_name: 'biai.patients_raw' },
      { table_id: 'table-hospitals', table_name: 'hospitals', clickhouse_table_name: 'biai.hospitals_raw' }
    ]

    const relationships = [
      {
        table_id: 'table-mutations',
        foreign_key: 'sample_id',
        referenced_table: 'samples',
        referenced_column: 'sample_id',
        relationship_type: 'many-to-one'
      },
      {
        table_id: 'table-samples',
        foreign_key: 'patient_id',
        referenced_table: 'patients',
        referenced_column: 'patient_id',
        relationship_type: 'many-to-one'
      },
      {
        table_id: 'table-patients',
        foreign_key: 'hospital_id',
        referenced_table: 'hospitals',
        referenced_column: 'hospital_id',
        relationship_type: 'many-to-one'
      }
    ]

    mockQuery
      // loadDatasetTablesMetadata - tables
      .mockResolvedValueOnce({
        json: async () => datasetTables
      } as any)
      // loadDatasetTablesMetadata - relationships
      .mockResolvedValueOnce({
        json: async () => relationships
      } as any)
      // dataset_columns
      .mockResolvedValueOnce({
        json: async () => [
          { column_name: 'status', display_type: 'categorical', is_hidden: false }
        ]
      } as any)
      // dataset_tables lookup in getColumnAggregation
      .mockResolvedValueOnce({
        json: async () => [{ table_name: 'mutations', clickhouse_table_name: 'biai.mutations_raw', row_count: 100 }]
      } as any)
      // count query
      .mockResolvedValueOnce({
        json: async () => [{ filtered_count: 80 }]
      } as any)
      // basic stats
      .mockResolvedValueOnce({
        json: async () => [{ null_count: 5, unique_count: 10 }]
      } as any)
      // categorical aggregation
      .mockResolvedValueOnce({
        json: async () => [{ value: 'A', display_value: 'A', count: 80, percentage: 100 }]
      } as any)

    const aggregations = await aggregationService.getTableAggregations(
      'dataset-1',
      'table-mutations',
      [],
      { mode: 'parent', target_table: 'hospitals' }
    )

    expect(aggregations).toHaveLength(1)
    const [aggregation] = aggregations
    expect(aggregation.metric_type).toBe('parent')
    expect(aggregation.metric_parent_table).toBe('hospitals')
    expect(aggregation.metric_path).toEqual([
      { from_table: 'mutations', via_column: 'sample_id', to_table: 'samples' },
      { from_table: 'samples', via_column: 'patient_id', to_table: 'patients' },
      { from_table: 'patients', via_column: 'hospital_id', to_table: 'hospitals' }
    ])
    expect(aggregation.total_rows).toBe(80)
    expect(mockQuery).toHaveBeenCalledTimes(7)

    getTableColumnsSpy.mockRestore()
  })
})
