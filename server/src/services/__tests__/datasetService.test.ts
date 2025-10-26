import { describe, test, expect, beforeEach, vi } from 'vitest'

const { commandMock, insertMock, queryMock } = vi.hoisted(() => ({
  commandMock: vi.fn(),
  insertMock: vi.fn(),
  queryMock: vi.fn()
}))

vi.mock('../../config/clickhouse.js', () => ({
  default: {
    command: commandMock,
    insert: insertMock,
    query: queryMock
  }
}))

vi.mock('../columnAnalyzer.js', () => ({
  analyzeColumn: vi.fn()
}))

import datasetService from '../datasetService'
import { analyzeColumn } from '../columnAnalyzer.js'

const mockAnalyzeColumn = vi.mocked(analyzeColumn)

describe('DatasetService', () => {
  beforeEach(() => {
    commandMock.mockReset()
    insertMock.mockReset()
    queryMock.mockReset()
    mockAnalyzeColumn.mockReset()
  })

  test('addTableToDataset stores metadata and analyzes columns using fully qualified table names', async () => {
    const datasetId = 'dataset-1'
    const datasetMeta = {
      dataset_id: datasetId,
      dataset_name: 'Glioblastoma',
      database_name: 'ds_glioblastoma_1234',
      database_type: 'created',
      description: 'Test dataset',
      tags: [],
      source: '',
      citation: '',
      references: [],
      custom_metadata: '{}',
      created_by: 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // getDataset -> datasets_metadata
    queryMock.mockResolvedValueOnce({
      json: async () => [datasetMeta]
    } as any)
    // getDatasetTables -> dataset_tables
    queryMock.mockResolvedValueOnce({
      json: async () => []
    } as any)
    // Row count query after data insert
    queryMock.mockResolvedValueOnce({
      json: async () => [{ cnt: '2' }]
    } as any)

    mockAnalyzeColumn.mockResolvedValue({
      display_type: 'id',
      unique_value_count: 2,
      null_count: 0,
      min_value: null,
      max_value: null,
      suggested_chart: 'none',
      display_priority: 0,
      is_hidden: true
    })

    insertMock.mockResolvedValue(undefined)
    commandMock.mockResolvedValue(undefined)

    const parsedData = {
      columns: [
        {
          name: 'patient_id',
          type: 'String',
          index: 0,
          nullable: false,
          displayName: 'Patient ID'
        }
      ],
      rows: [
        ['GBM-1'],
        ['GBM-2']
      ]
    }

    const result = await datasetService.addTableToDataset(
      datasetId,
      'patients',
      'Clinical Patients',
      'patients.tsv',
      'text/tab-separated-values',
      parsedData as any,
      'patient_id'
    )

    expect(result.table_name).toBe('patients')
    expect(result.display_name).toBe('Clinical Patients')
    expect(result.row_count).toBe(2)

    // CREATE TABLE command issued inside dataset database
    expect(commandMock.mock.calls[0]?.[0].query).toContain(`CREATE TABLE IF NOT EXISTS ${datasetMeta.database_name}.`)
    // Dataset timestamp update
    expect(commandMock.mock.calls[1]?.[0].query).toContain('ALTER TABLE biai.datasets_metadata UPDATE')

    // First insert should stream data into the dataset-specific table
    const dataInsertCall = insertMock.mock.calls.find(call => (call[0] as any).table.startsWith(`${datasetMeta.database_name}.`))
    expect(dataInsertCall).toBeTruthy()

    // Metadata rows stored in dataset_tables
    const tableMetadataCall = insertMock.mock.calls.find(call => (call[0] as any).table === 'biai.dataset_tables')
    expect(tableMetadataCall).toBeTruthy()
    const insertedTableMetadata = (tableMetadataCall![0] as any).values[0]
    expect(insertedTableMetadata.dataset_id).toBe(datasetId)
    expect(insertedTableMetadata.clickhouse_table_name.startsWith(`${datasetMeta.database_name}.`)).toBe(true)

    // Column metadata persisted
    const columnMetadataCall = insertMock.mock.calls.find(call => (call[0] as any).table === 'biai.dataset_columns')
    expect(columnMetadataCall).toBeTruthy()
    expect((columnMetadataCall![0] as any).values).toHaveLength(1)

    // analyzeColumn invoked with the fully-qualified table identifier
    expect(mockAnalyzeColumn).toHaveBeenCalledWith(
      insertedTableMetadata.clickhouse_table_name,
      'patient_id',
      'String'
    )

    // Service response mirrors stored metadata
    expect(result.table_id).toBe(insertedTableMetadata.table_id)
    expect(result.clickhouse_table_name).toBe(insertedTableMetadata.clickhouse_table_name)
  })

  describe('getTableData', () => {
    test('uses stored qualified table name when present', async () => {
      queryMock.mockResolvedValueOnce({
        json: async () => [{ clickhouse_table_name: 'customdb.tbl_patients' }]
      } as any)
      queryMock.mockResolvedValueOnce({
        json: async () => [{ patient_id: 'GBM-1' }]
      } as any)

      const rows = await datasetService.getTableData('dataset-1', 'patients', 25, 5)

      expect(rows).toEqual([{ patient_id: 'GBM-1' }])
      expect(queryMock).toHaveBeenCalledTimes(2)
      expect(queryMock.mock.calls[1]?.[0].query).toContain('FROM customdb.tbl_patients')
      expect(queryMock.mock.calls[1]?.[0].query).toContain('LIMIT 25 OFFSET 5')
    })

    test('defaults to biai schema when table name is unqualified', async () => {
      queryMock.mockResolvedValueOnce({
        json: async () => [{ clickhouse_table_name: 'tbl_patients' }]
      } as any)
      queryMock.mockResolvedValueOnce({
        json: async () => []
      } as any)

      await datasetService.getTableData('dataset-1', 'patients', 10, 0)

      expect(queryMock.mock.calls[1]?.[0].query).toContain('FROM biai.tbl_patients')
    })
  })
})
