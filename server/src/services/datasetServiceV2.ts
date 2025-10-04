import clickhouseClient from '../config/clickhouse.js'
import { v4 as uuidv4 } from 'uuid'
import { ColumnMetadata, ParsedData } from './fileParser.js'

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
  created_at: Date
}

export interface Dataset {
  dataset_id: string
  dataset_name: string
  description: string
  created_by: string
  created_at: Date
  updated_at: Date
  tables?: DatasetTable[]
}

export class DatasetServiceV2 {
  // Create a new empty dataset
  async createDataset(
    name: string,
    description: string = '',
    createdBy: string = 'system'
  ): Promise<Dataset> {
    const datasetId = uuidv4()

    await clickhouseClient.insert({
      table: 'datasets_metadata',
      values: [{
        dataset_id: datasetId,
        dataset_name: name,
        description: description,
        created_by: createdBy
      }],
      format: 'JSONEachRow'
    })

    return {
      dataset_id: datasetId,
      dataset_name: name,
      description,
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
    primaryKey?: string
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
        primary_key: primaryKey || null
      }],
      format: 'JSONEachRow'
    })

    // Store column metadata
    const columnValues = parsedData.columns.map(col => ({
      dataset_id: datasetId,
      table_id: tableId,
      column_name: col.name,
      column_type: col.type,
      column_index: col.index,
      is_nullable: col.nullable,
      description: ''
    }))

    await clickhouseClient.insert({
      table: 'dataset_columns',
      values: columnValues,
      format: 'JSONEachRow'
    })

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

    return await result.json<DatasetTable[]>()
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
  }
}

export default new DatasetServiceV2()
