import clickhouseClient from '../config/clickhouse.js'
import { v4 as uuidv4 } from 'uuid'
import { ColumnMetadata, ParsedData } from './fileParser.js'
import { analyzeColumn } from './columnAnalyzer.js'

export interface TableRelationship {
  foreign_key: string
  referenced_table: string
  referenced_column: string
  type?: string
}

export interface DatasetTable {
  table_id: string
  table_name: string
  display_name: string
  original_filename: string
  file_type: string
  row_count: number
  clickhouse_table_name: string
  schema_json: string
  primary_key?: string
  custom_metadata?: string
  relationships?: TableRelationship[]
  created_at: Date
}

export interface Dataset {
  dataset_id: string
  dataset_name: string
  description: string
  tags?: string[]
  source?: string
  citation?: string
  references?: string[]
  custom_metadata?: string
  created_by: string
  created_at: Date
  updated_at: Date
  tables?: DatasetTable[]
}

export class DatasetService {
  // Create a new empty dataset
  async createDataset(
    name: string,
    description: string = '',
    createdBy: string = 'system',
    tags: string[] = [],
    source: string = '',
    citation: string = '',
    references: string[] = [],
    customMetadata: Record<string, any> = {}
  ): Promise<Dataset> {
    const datasetId = uuidv4()

    await clickhouseClient.insert({
      table: 'datasets_metadata',
      values: [{
        dataset_id: datasetId,
        dataset_name: name,
        description: description,
        tags: tags,
        source: source,
        citation: citation,
        references: references,
        custom_metadata: JSON.stringify(customMetadata),
        created_by: createdBy
      }],
      format: 'JSONEachRow'
    })

    return {
      dataset_id: datasetId,
      dataset_name: name,
      description,
      tags,
      source,
      citation,
      references,
      custom_metadata: JSON.stringify(customMetadata),
      created_by: createdBy,
      created_at: new Date(),
      updated_at: new Date(),
      tables: []
    }
  }

  // Add a table to an existing dataset
  async addTableToDataset(
    datasetId: string,
    tableName: string,
    displayName: string,
    filename: string,
    fileType: string,
    parsedData: ParsedData,
    primaryKey?: string,
    customMetadata: Record<string, any> = {},
    relationships: TableRelationship[] = []
  ): Promise<DatasetTable> {
    const tableId = uuidv4()
    const clickhouseTableName = `dataset_${datasetId.replace(/-/g, '_')}_${tableName.replace(/[^a-z0-9_]/g, '_').toLowerCase()}`

    // Create the ClickHouse table
    await this.createDynamicTable(clickhouseTableName, parsedData.columns)

    // Insert data
    await this.insertData(clickhouseTableName, parsedData.columns, parsedData.rows)

    // Store table metadata
    const schemaJson = JSON.stringify(parsedData.columns)

    await clickhouseClient.insert({
      table: 'dataset_tables',
      values: [{
        dataset_id: datasetId,
        table_id: tableId,
        table_name: tableName,
        display_name: displayName,
        original_filename: filename,
        file_type: fileType,
        row_count: parsedData.rowCount,
        clickhouse_table_name: clickhouseTableName,
        schema_json: schemaJson,
        primary_key: primaryKey || null,
        custom_metadata: JSON.stringify(customMetadata)
      }],
      format: 'JSONEachRow'
    })

    // Store column metadata with analysis
    const columnValues = []
    for (const col of parsedData.columns) {
      // Analyze column to get metadata
      const analysis = await analyzeColumn(
        clickhouseTableName,
        col.name,
        col.type,
        parsedData.rowCount
      )

      columnValues.push({
        dataset_id: datasetId,
        table_id: tableId,
        column_name: col.name,
        column_type: col.type,
        column_index: col.index,
        is_nullable: col.nullable,
        description: '',
        display_type: analysis.display_type,
        unique_value_count: analysis.unique_value_count,
        null_count: analysis.null_count,
        min_value: analysis.min_value,
        max_value: analysis.max_value,
        suggested_chart: analysis.suggested_chart,
        display_priority: analysis.display_priority,
        is_hidden: analysis.is_hidden
      })
    }

    await clickhouseClient.insert({
      table: 'dataset_columns',
      values: columnValues,
      format: 'JSONEachRow'
    })

    // Store relationships
    if (relationships && relationships.length > 0) {
      const relationshipValues = relationships.map(rel => ({
        dataset_id: datasetId,
        table_id: tableId,
        foreign_key: rel.foreign_key,
        referenced_table: rel.referenced_table,
        referenced_column: rel.referenced_column,
        relationship_type: rel.type || 'many-to-one'
      }))

      await clickhouseClient.insert({
        table: 'table_relationships',
        values: relationshipValues,
        format: 'JSONEachRow'
      })
    }

    // Update dataset timestamp
    await clickhouseClient.command({
      query: 'ALTER TABLE biai.datasets_metadata UPDATE updated_at = now() WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId }
    })

    return {
      table_id: tableId,
      table_name: tableName,
      display_name: displayName,
      original_filename: filename,
      file_type: fileType,
      row_count: parsedData.rowCount,
      clickhouse_table_name: clickhouseTableName,
      schema_json: schemaJson,
      primary_key: primaryKey,
      custom_metadata: JSON.stringify(customMetadata),
      relationships: relationships,
      created_at: new Date()
    }
  }

  private async createDynamicTable(tableName: string, columns: ColumnMetadata[]): Promise<void> {
    const columnDefs = columns.map(col => {
      const nullable = col.nullable ? 'Nullable(' + col.type + ')' : col.type
      return `${col.name} ${nullable}`
    }).join(',\n    ')

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS biai.${tableName} (
        ${columnDefs}
      ) ENGINE = MergeTree()
      ORDER BY tuple()
    `

    await clickhouseClient.command({ query: createTableQuery })
  }

  private async insertData(
    tableName: string,
    columns: ColumnMetadata[],
    rows: any[][]
  ): Promise<void> {
    if (rows.length === 0) return

    const values = rows.map(row => {
      const obj: any = {}
      columns.forEach((col, index) => {
        let value = row[index]

        if (value === '' || value === null || value === undefined || value === 'NA') {
          obj[col.name] = null
          return
        }

        if (col.type === 'Int32') {
          obj[col.name] = parseInt(value, 10)
        } else if (col.type === 'Float64') {
          obj[col.name] = parseFloat(value)
        } else {
          obj[col.name] = value
        }
      })
      return obj
    })

    const batchSize = 1000
    for (let i = 0; i < values.length; i += batchSize) {
      const batch = values.slice(i, i + batchSize)
      await clickhouseClient.insert({
        table: `biai.${tableName}`,
        values: batch,
        format: 'JSONEachRow'
      })
    }
  }

  async listDatasets(): Promise<Dataset[]> {
    const result = await clickhouseClient.query({
      query: 'SELECT * FROM biai.datasets_metadata ORDER BY created_at DESC',
      format: 'JSONEachRow'
    })

    const datasets = await result.json<Dataset[]>()

    // Load tables for each dataset
    for (const dataset of datasets) {
      dataset.tables = await this.getDatasetTables(dataset.dataset_id)
    }

    return datasets
  }

  async getDataset(datasetId: string): Promise<Dataset | null> {
    const result = await clickhouseClient.query({
      query: 'SELECT * FROM biai.datasets_metadata WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId },
      format: 'JSONEachRow'
    })

    const data = await result.json<Dataset[]>()
    if (data.length === 0) return null

    const dataset = data[0]
    dataset.tables = await this.getDatasetTables(datasetId)

    return dataset
  }

  async getDatasetTables(datasetId: string): Promise<DatasetTable[]> {
    const result = await clickhouseClient.query({
      query: 'SELECT * FROM biai.dataset_tables WHERE dataset_id = {datasetId:String} ORDER BY created_at',
      query_params: { datasetId },
      format: 'JSONEachRow'
    })

    const tables = await result.json<DatasetTable[]>()

    // Load relationships for each table
    for (const table of tables) {
      const relResult = await clickhouseClient.query({
        query: 'SELECT * FROM biai.table_relationships WHERE table_id = {tableId:String}',
        query_params: { tableId: table.table_id },
        format: 'JSONEachRow'
      })

      const relationships = await relResult.json<any[]>()
      table.relationships = relationships.map(rel => ({
        foreign_key: rel.foreign_key,
        referenced_table: rel.referenced_table,
        referenced_column: rel.referenced_column,
        type: rel.relationship_type
      }))
    }

    return tables
  }

  async getTableData(datasetId: string, tableId: string, limit: number = 100, offset: number = 0): Promise<any[]> {
    const tableResult = await clickhouseClient.query({
      query: 'SELECT clickhouse_table_name FROM biai.dataset_tables WHERE dataset_id = {datasetId:String} AND table_id = {tableId:String}',
      query_params: { datasetId, tableId },
      format: 'JSONEachRow'
    })

    const tables = await tableResult.json<any[]>()
    if (tables.length === 0) throw new Error('Table not found')

    const result = await clickhouseClient.query({
      query: `SELECT * FROM biai.${tables[0].clickhouse_table_name} LIMIT ${limit} OFFSET ${offset}`,
      format: 'JSONEachRow'
    })

    return await result.json()
  }

  async deleteDataset(datasetId: string): Promise<void> {
    const tables = await this.getDatasetTables(datasetId)

    // Drop all tables
    for (const table of tables) {
      await clickhouseClient.command({
        query: `DROP TABLE IF EXISTS biai.${table.clickhouse_table_name}`
      })
    }

    // Delete metadata
    await clickhouseClient.command({
      query: 'DELETE FROM biai.dataset_tables WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId }
    })

    await clickhouseClient.command({
      query: 'DELETE FROM biai.dataset_columns WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId }
    })

    await clickhouseClient.command({
      query: 'DELETE FROM biai.table_relationships WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId }
    })

    await clickhouseClient.command({
      query: 'DELETE FROM biai.datasets_metadata WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId }
    })
  }

  async deleteTable(datasetId: string, tableId: string): Promise<void> {
    const tables = await clickhouseClient.query({
      query: 'SELECT clickhouse_table_name FROM biai.dataset_tables WHERE dataset_id = {datasetId:String} AND table_id = {tableId:String}',
      query_params: { datasetId, tableId },
      format: 'JSONEachRow'
    })

    const tableData = await tables.json<any[]>()
    if (tableData.length === 0) throw new Error('Table not found')

    // Drop the table
    await clickhouseClient.command({
      query: `DROP TABLE IF EXISTS biai.${tableData[0].clickhouse_table_name}`
    })

    // Delete metadata
    await clickhouseClient.command({
      query: 'DELETE FROM biai.dataset_tables WHERE table_id = {tableId:String}',
      query_params: { tableId }
    })

    await clickhouseClient.command({
      query: 'DELETE FROM biai.dataset_columns WHERE table_id = {tableId:String}',
      query_params: { tableId }
    })

    await clickhouseClient.command({
      query: 'DELETE FROM biai.table_relationships WHERE table_id = {tableId:String}',
      query_params: { tableId }
    })
  }
}

export default new DatasetService()
