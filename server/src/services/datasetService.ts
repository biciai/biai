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
  created_at: string | Date
}

export interface Dataset {
  dataset_id: string
  dataset_name: string
  database_name: string
  database_type: 'created' | 'connected'
  description: string
  tags?: string[]
  source?: string
  citation?: string
  references?: string[]
  custom_metadata?: string
  created_by: string
  created_at: string | Date
  updated_at: string | Date
  tables?: DatasetTable[]
}

export class DatasetService {
  // Create a new empty dataset with its own ClickHouse database
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
    // Create a unique database name from the dataset name
    const databaseName = `ds_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${datasetId.substring(0, 8)}`
    const databaseType = 'created'

    // Create the ClickHouse database
    await clickhouseClient.command({
      query: `CREATE DATABASE IF NOT EXISTS ${databaseName}`
    })

    await clickhouseClient.insert({
      table: 'biai.datasets_metadata',
      values: [{
        dataset_id: datasetId,
        dataset_name: name,
        database_name: databaseName,
        database_type: databaseType,
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
      database_name: databaseName,
      database_type: databaseType,
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

  // Register an existing ClickHouse database as a connected dataset
  async connectDatabase(
    databaseName: string,
    displayName: string,
    description: string = '',
    createdBy: string = 'system',
    tags: string[] = [],
    customMetadata: Record<string, any> = {}
  ): Promise<Dataset> {
    const datasetId = uuidv4()
    const databaseType = 'connected'

    await clickhouseClient.insert({
      table: 'datasets_metadata',
      values: [{
        dataset_id: datasetId,
        dataset_name: displayName,
        database_name: databaseName,
        database_type: databaseType,
        description: description,
        tags: tags,
        source: '',
        citation: '',
        references: [],
        custom_metadata: JSON.stringify(customMetadata),
        created_by: createdBy
      }],
      format: 'JSONEachRow'
    })

    return {
      dataset_id: datasetId,
      dataset_name: displayName,
      database_name: databaseName,
      database_type: databaseType,
      description,
      tags,
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
    // Get the dataset to find its database name
    const dataset = await this.getDataset(datasetId)
    if (!dataset) {
      throw new Error('Dataset not found')
    }

    const cleanTableName = tableName.replace(/[^a-z0-9_]/g, '_').toLowerCase()

    // Create the ClickHouse table in the dataset's database
    await this.createDynamicTable(dataset.database_name, cleanTableName, parsedData.columns, primaryKey)

    // Insert data
    await this.insertData(dataset.database_name, cleanTableName, parsedData.columns, parsedData.rows)

    // Update dataset timestamp
    await clickhouseClient.command({
      query: 'ALTER TABLE biai.datasets_metadata UPDATE updated_at = now() WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId }
    })

    // Get row count from the newly created table
    const countResult = await clickhouseClient.query({
      query: `SELECT count() as cnt FROM ${dataset.database_name}.${cleanTableName}`,
      format: 'JSONEachRow'
    })
    const countData = await countResult.json<{ cnt: string }>()
    const rowCount = parseInt(countData[0]?.cnt || '0')

    return {
      table_id: cleanTableName,
      table_name: cleanTableName,
      display_name: displayName,
      original_filename: filename,
      file_type: fileType,
      row_count: rowCount,
      clickhouse_table_name: `${dataset.database_name}.${cleanTableName}`,
      schema_json: JSON.stringify(parsedData.columns),
      primary_key: primaryKey,
      custom_metadata: JSON.stringify(customMetadata),
      relationships: relationships,
      created_at: new Date()
    }
  }

  private async createDynamicTable(databaseName: string, tableName: string, columns: ColumnMetadata[], primaryKey?: string): Promise<void> {
    const columnDefs = columns.map(col => {
      // Make all columns nullable except the primary key
      const shouldBeNullable = col.name !== primaryKey
      const columnType = shouldBeNullable ? 'Nullable(' + col.type + ')' : col.type
      return `${col.name} ${columnType}`
    }).join(',\n    ')

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${databaseName}.${tableName} (
        ${columnDefs}
      ) ENGINE = MergeTree()
      ORDER BY tuple()
    `

    await clickhouseClient.command({ query: createTableQuery })
  }

  private async insertData(
    databaseName: string,
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
          const parsed = parseInt(value, 10)
          obj[col.name] = isNaN(parsed) ? null : parsed
        } else if (col.type === 'Float64') {
          const parsed = parseFloat(value)
          obj[col.name] = isNaN(parsed) ? null : parsed
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
        table: `${databaseName}.${tableName}`,
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

    const datasets = await result.json<Dataset>()

    // Load tables for all datasets from ClickHouse system tables
    for (const dataset of datasets) {
      if (dataset.database_name) {
        dataset.tables = await this.getDatabaseTables(dataset.database_name)
      } else {
        dataset.tables = []
      }
    }

    return datasets
  }

  private async getDatabaseTables(databaseName: string): Promise<DatasetTable[]> {
    const tablesResult = await clickhouseClient.query({
      query: `
        SELECT name, engine, total_rows
        FROM system.tables
        WHERE database = {database:String}
          AND name NOT LIKE '.%'
        ORDER BY name
      `,
      query_params: { database: databaseName },
      format: 'JSONEachRow'
    })

    const tables = await tablesResult.json<{ name: string; engine: string; total_rows: string }>()

    return tables.map(table => ({
      table_id: table.name,
      table_name: table.name,
      display_name: table.name,
      original_filename: '',
      file_type: '',
      row_count: parseInt(table.total_rows) || 0,
      clickhouse_table_name: `${databaseName}.${table.name}`,
      schema_json: '[]',
      created_at: new Date()
    }))
  }

  async getDataset(datasetId: string): Promise<Dataset | null> {
    const result = await clickhouseClient.query({
      query: 'SELECT * FROM biai.datasets_metadata WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId },
      format: 'JSONEachRow'
    })

    const data = await result.json<Dataset>()
    if (data.length === 0) return null

    const dataset = data[0]
    // Load tables from ClickHouse system tables
    if (dataset.database_name) {
      dataset.tables = await this.getDatabaseTables(dataset.database_name)
    } else {
      dataset.tables = []
    }

    return dataset
  }

  async getDatasetTables(datasetId: string): Promise<DatasetTable[]> {
    const result = await clickhouseClient.query({
      query: 'SELECT * FROM biai.dataset_tables WHERE dataset_id = {datasetId:String} ORDER BY created_at',
      query_params: { datasetId },
      format: 'JSONEachRow'
    })

    const tables = await result.json<DatasetTable>()

    // Load relationships for each table
    for (const table of tables) {
      const relResult = await clickhouseClient.query({
        query: 'SELECT * FROM biai.table_relationships WHERE table_id = {tableId:String}',
        query_params: { tableId: table.table_id },
        format: 'JSONEachRow'
      })

      const relationships = await relResult.json<{
        foreign_key: string
        referenced_table: string
        referenced_column: string
        relationship_type: string
      }>()
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
    // Get the dataset to find its database name
    const dataset = await this.getDataset(datasetId)
    if (!dataset || !dataset.database_name) {
      throw new Error('Dataset not found')
    }

    // Query the table directly from the dataset's database
    const result = await clickhouseClient.query({
      query: `SELECT * FROM ${dataset.database_name}.${tableId} LIMIT ${limit} OFFSET ${offset}`,
      format: 'JSONEachRow'
    })

    return await result.json<Record<string, unknown>>()
  }

  async getTableColumns(datasetId: string, tableId: string): Promise<any[]> {
    // Get the dataset to find its database name
    const dataset = await this.getDataset(datasetId)
    if (!dataset || !dataset.database_name) {
      throw new Error('Dataset not found')
    }

    // Query system.columns for the table schema
    const columnsResult = await clickhouseClient.query({
      query: `
        SELECT name, type, position
        FROM system.columns
        WHERE database = {database:String}
          AND table = {table:String}
        ORDER BY position
      `,
      query_params: { database: dataset.database_name, table: tableId },
      format: 'JSONEachRow'
    })

    const columns = await columnsResult.json<{ name: string; type: string; position: number }>()

    // Generate metadata on-the-fly (similar to databases API)
    return columns.map((col, index) => {
      const baseType = col.type.replace(/Nullable\((.*)\)/, '$1')
      const displayType = this.inferDisplayType(baseType, col.name)

      return {
        column_name: col.name,
        column_type: baseType,
        column_index: index,
        is_nullable: col.type.includes('Nullable'),
        display_name: col.name,
        description: '',
        user_data_type: '',
        user_priority: null,
        display_type: displayType,
        unique_value_count: 0,
        null_count: 0,
        min_value: null,
        max_value: null,
        suggested_chart: displayType === 'categorical' ? 'bar' : 'histogram',
        display_priority: 0,
        is_hidden: false
      }
    })
  }

  private inferDisplayType(columnType: string, columnName: string): string {
    const nameLower = columnName.toLowerCase()
    if (nameLower.includes('id') || nameLower.includes('key')) return 'id'
    if (columnType.includes('Int') || columnType.includes('Float') || columnType.includes('Decimal')) {
      return 'numeric'
    }
    if (columnType.includes('Date')) return 'datetime'
    return 'categorical'
  }

  async updateColumnMetadata(
    datasetId: string,
    tableId: string,
    columnName: string,
    updates: { displayName?: string; description?: string; isHidden?: boolean; displayType?: string }
  ): Promise<void> {
    if (Object.keys(updates).length === 0) return

    // Get the current row (latest version if there are duplicates)
    const result = await clickhouseClient.query({
      query: `
        SELECT *
        FROM biai.dataset_columns
        WHERE dataset_id = {datasetId:String}
          AND table_id = {tableId:String}
          AND column_name = {columnName:String}
        ORDER BY created_at DESC
        LIMIT 1
      `,
      query_params: { datasetId, tableId, columnName },
      format: 'JSONEachRow'
    })

    const rows = await result.json<Record<string, unknown>>()
    if (rows.length === 0) throw new Error('Column not found')

    const currentRow = rows[0]

    // Apply updates - create a new row with updated timestamp
    const updatedRow = {
      ...currentRow,
      display_name: updates.displayName !== undefined ? updates.displayName : currentRow.display_name,
      description: updates.description !== undefined ? updates.description : currentRow.description,
      is_hidden: updates.isHidden !== undefined ? updates.isHidden : currentRow.is_hidden,
      display_type: updates.displayType !== undefined ? updates.displayType : currentRow.display_type,
      created_at: Math.floor(Date.now() / 1000)  // New timestamp to mark this as the latest version
    }

    // Insert the updated row (old rows will remain but queries will get the latest)
    await clickhouseClient.insert({
      table: 'dataset_columns',
      values: [updatedRow],
      format: 'JSONEachRow'
    })

    // Clean up old versions asynchronously (non-blocking)
    clickhouseClient.command({
      query: 'ALTER TABLE biai.dataset_columns DELETE WHERE dataset_id = {datasetId:String} AND table_id = {tableId:String} AND column_name = {columnName:String} AND created_at < {timestamp:UInt32}',
      query_params: { datasetId, tableId, columnName, timestamp: updatedRow.created_at }
    }).catch(err => console.error('Cleanup error:', err))
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
    const tablesResult = await clickhouseClient.query({
      query: 'SELECT clickhouse_table_name FROM biai.dataset_tables WHERE dataset_id = {datasetId:String} AND table_id = {tableId:String}',
      query_params: { datasetId, tableId },
      format: 'JSONEachRow'
    })

    const tableData = await tablesResult.json<{ clickhouse_table_name: string }>()
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
