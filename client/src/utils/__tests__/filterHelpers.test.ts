import { describe, expect, test } from 'vitest'
import {
  getFilterColumn,
  getFilterTableName,
  filterContainsColumn,
  tablesHaveRelationship,
  getAllEffectiveFilters,
  type Filter,
  type Table,
} from '../filterHelpers'

describe('filterHelpers', () => {
  describe('getFilterColumn', () => {
    test('returns column from simple filter', () => {
      const filter: Filter = {
        column: 'age',
        operator: 'eq',
        value: 25,
      }

      expect(getFilterColumn(filter)).toBe('age')
    })

    test('returns column from OR filter', () => {
      const filter: Filter = {
        or: [
          { column: 'status', operator: 'eq', value: 'Active' },
          { column: 'status', operator: 'eq', value: 'Pending' },
        ],
      }

      expect(getFilterColumn(filter)).toBe('status')
    })

    test('returns column from AND filter', () => {
      const filter: Filter = {
        and: [
          { column: 'age', operator: 'gte', value: 18 },
          { column: 'age', operator: 'lte', value: 65 },
        ],
      }

      expect(getFilterColumn(filter)).toBe('age')
    })

    test('returns column from NOT filter', () => {
      const filter: Filter = {
        not: {
          column: 'deleted',
          operator: 'eq',
          value: true,
        },
      }

      expect(getFilterColumn(filter)).toBe('deleted')
    })

    test('returns undefined for filter without column', () => {
      const filter: Filter = {
        or: [],
      }

      expect(getFilterColumn(filter)).toBeUndefined()
    })
  })

  describe('getFilterTableName', () => {
    test('returns tableName when present', () => {
      const filter: Filter = {
        column: 'age',
        operator: 'eq',
        value: 25,
        tableName: 'patients',
      }

      expect(getFilterTableName(filter)).toBe('patients')
    })

    test('returns undefined when tableName not present', () => {
      const filter: Filter = {
        column: 'age',
        operator: 'eq',
        value: 25,
      }

      expect(getFilterTableName(filter)).toBeUndefined()
    })
  })

  describe('filterContainsColumn', () => {
    test('returns true for direct column match', () => {
      const filter: Filter = {
        column: 'age',
        operator: 'eq',
        value: 25,
      }

      expect(filterContainsColumn(filter, 'age')).toBe(true)
    })

    test('returns false for non-matching column', () => {
      const filter: Filter = {
        column: 'age',
        operator: 'eq',
        value: 25,
      }

      expect(filterContainsColumn(filter, 'name')).toBe(false)
    })

    test('returns true for column in OR filter', () => {
      const filter: Filter = {
        or: [
          { column: 'status', operator: 'eq', value: 'Active' },
          { column: 'status', operator: 'eq', value: 'Pending' },
        ],
      }

      expect(filterContainsColumn(filter, 'status')).toBe(true)
    })

    test('returns true for column in AND filter', () => {
      const filter: Filter = {
        and: [
          { column: 'age', operator: 'gte', value: 18 },
          { column: 'name', operator: 'eq', value: 'John' },
        ],
      }

      expect(filterContainsColumn(filter, 'age')).toBe(true)
      expect(filterContainsColumn(filter, 'name')).toBe(true)
    })

    test('returns true for column in NOT filter', () => {
      const filter: Filter = {
        not: {
          column: 'deleted',
          operator: 'eq',
          value: true,
        },
      }

      expect(filterContainsColumn(filter, 'deleted')).toBe(true)
    })

    test('returns false for empty filter', () => {
      const filter: Filter = {}

      expect(filterContainsColumn(filter, 'age')).toBe(false)
    })
  })

  describe('tablesHaveRelationship', () => {
    const mockTables: Table[] = [
      {
        id: '1',
        name: 'patients',
        displayName: 'Patients',
        rowCount: 100,
        relationships: [],
      },
      {
        id: '2',
        name: 'samples',
        displayName: 'Samples',
        rowCount: 200,
        relationships: [
          {
            foreign_key: 'patient_id',
            referenced_table: 'patients',
            referenced_column: 'patient_id',
            type: 'many-to-one',
          },
        ],
      },
      {
        id: '3',
        name: 'tests',
        displayName: 'Tests',
        rowCount: 50,
        relationships: [],
      },
    ]

    test('returns true when table1 references table2', () => {
      const samples = mockTables[1]
      const patients = mockTables[0]

      expect(tablesHaveRelationship(samples, patients, mockTables)).toBe(true)
    })

    test('returns true when table2 references table1 (bidirectional)', () => {
      const patients = mockTables[0]
      const samples = mockTables[1]

      expect(tablesHaveRelationship(patients, samples, mockTables)).toBe(true)
    })

    test('returns false when no relationship exists', () => {
      const patients = mockTables[0]
      const tests = mockTables[2]

      expect(tablesHaveRelationship(patients, tests, mockTables)).toBe(false)
    })
  })

  describe('getAllEffectiveFilters', () => {
    const mockTables: Table[] = [
      {
        id: '1',
        name: 'patients',
        displayName: 'Patients',
        rowCount: 100,
        relationships: [],
      },
      {
        id: '2',
        name: 'samples',
        displayName: 'Samples',
        rowCount: 200,
        relationships: [
          {
            foreign_key: 'patient_id',
            referenced_table: 'patients',
            referenced_column: 'patient_id',
            type: 'many-to-one',
          },
        ],
      },
      {
        id: '3',
        name: 'tests',
        displayName: 'Tests',
        rowCount: 50,
        relationships: [],
      },
    ]

    test('categorizes direct filters correctly', () => {
      const filters: Filter[] = [
        {
          column: 'radiation_therapy',
          operator: 'eq',
          value: 'Yes',
          tableName: 'patients',
        },
      ]

      const result = getAllEffectiveFilters(filters, mockTables)

      expect(result.patients.direct).toHaveLength(1)
      expect(result.patients.direct[0]).toEqual(filters[0])
      expect(result.patients.propagated).toHaveLength(0)
    })

    test('categorizes propagated filters correctly', () => {
      const filters: Filter[] = [
        {
          column: 'radiation_therapy',
          operator: 'eq',
          value: 'Yes',
          tableName: 'patients',
        },
      ]

      const result = getAllEffectiveFilters(filters, mockTables)

      // The filter is direct for patients
      expect(result.patients.direct).toHaveLength(1)
      expect(result.patients.propagated).toHaveLength(0)

      // The filter is propagated to samples (has relationship with patients)
      expect(result.samples.direct).toHaveLength(0)
      expect(result.samples.propagated).toHaveLength(1)
      expect(result.samples.propagated[0]).toEqual(filters[0])

      // The filter is NOT propagated to tests (no relationship with patients)
      expect(result.tests.direct).toHaveLength(0)
      expect(result.tests.propagated).toHaveLength(0)
    })

    test('handles bidirectional relationships', () => {
      const filters: Filter[] = [
        {
          column: 'sample_type',
          operator: 'eq',
          value: 'Tumor',
          tableName: 'samples',
        },
      ]

      const result = getAllEffectiveFilters(filters, mockTables)

      // The filter is direct for samples
      expect(result.samples.direct).toHaveLength(1)
      expect(result.samples.propagated).toHaveLength(0)

      // The filter is propagated to patients (samples references patients)
      expect(result.patients.direct).toHaveLength(0)
      expect(result.patients.propagated).toHaveLength(1)
      expect(result.patients.propagated[0]).toEqual(filters[0])
    })

    test('handles multiple filters from different tables', () => {
      const filters: Filter[] = [
        {
          column: 'radiation_therapy',
          operator: 'eq',
          value: 'Yes',
          tableName: 'patients',
        },
        {
          column: 'sample_type',
          operator: 'eq',
          value: 'Tumor',
          tableName: 'samples',
        },
      ]

      const result = getAllEffectiveFilters(filters, mockTables)

      // Patients has 1 direct, 1 propagated
      expect(result.patients.direct).toHaveLength(1)
      expect(result.patients.propagated).toHaveLength(1)

      // Samples has 1 direct, 1 propagated
      expect(result.samples.direct).toHaveLength(1)
      expect(result.samples.propagated).toHaveLength(1)

      // Tests has 0 direct, 0 propagated (no relationships)
      expect(result.tests.direct).toHaveLength(0)
      expect(result.tests.propagated).toHaveLength(0)
    })

    test('ignores filters without tableName', () => {
      const filters: Filter[] = [
        {
          column: 'age',
          operator: 'eq',
          value: 25,
        },
      ]

      const result = getAllEffectiveFilters(filters, mockTables)

      expect(result.patients.direct).toHaveLength(0)
      expect(result.patients.propagated).toHaveLength(0)
      expect(result.samples.direct).toHaveLength(0)
      expect(result.samples.propagated).toHaveLength(0)
    })

    test('initializes all tables in result', () => {
      const filters: Filter[] = []

      const result = getAllEffectiveFilters(filters, mockTables)

      expect(result).toHaveProperty('patients')
      expect(result).toHaveProperty('samples')
      expect(result).toHaveProperty('tests')
      expect(result.patients).toEqual({ direct: [], propagated: [] })
      expect(result.samples).toEqual({ direct: [], propagated: [] })
      expect(result.tests).toEqual({ direct: [], propagated: [] })
    })
  })
})
