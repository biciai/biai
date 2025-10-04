import clickhouseClient from '../config/clickhouse.js'
import { v4 as uuidv4 } from 'uuid'
import { ColumnMetadata, ParsedData } from './fileParser.js'

export interface Dataset {
  dataset_id: string
  dataset_name: string
  description: string
  original_filename: string
  file_type: string
  schema_json: string
  row_count: number
  table_name: string
  created_by: string
  created_at: Date
}

export class DatasetService {
  async createDataset(
    name: string,
    filename: string,
    fileType: string,
    parsedData: ParsedData,
    description: string = '',
    createdBy: string = 'system'
  ): Promise<Dataset> {
    const datasetId = uuidv4()
    const tableName = `dataset_${datasetId.replace(/-/g, '_')}`

    // Create dynamic table for this dataset
    await this.createDynamicTable(tableName, parsedData.columns)

    // Insert data into the table
    await this.insertData(tableName, parsedData.columns, parsedData.rows)

    // Store metadata
    const schemaJson = JSON.stringify(parsedData.columns)

    await clickhouseClient.insert({
      table: 'datasets_metadata',
      values: [{
        dataset_id: datasetId,
        dataset_name: name,
        description: description,
        original_filename: filename,
        file_type: fileType,
        schema_json: schemaJson,
        row_count: parsedData.rowCount,
        table_name: tableName,
        created_by: createdBy
      }],
      format: 'JSONEachRow'
    })

    // Store column metadata
    const columnValues = parsedData.columns.map(col => ({
      dataset_id: datasetId,
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

    return {
      dataset_id: datasetId,
      dataset_name: name,
      description,
      original_filename: filename,
      file_type: fileType,
      schema_json: schemaJson,
      row_count: parsedData.rowCount,
      table_name: tableName,
      created_by: createdBy,
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

    // Convert rows to objects
    const values = rows.map(row => {
      const obj: any = {}
      columns.forEach((col, index) => {
        let value = row[index]

        // Handle empty/null values
        if (value === '' || value === null || value === undefined || value === 'NA') {
          obj[col.name] = null
          return
        }

        // Type conversion
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

    // Insert in batches of 1000
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

    const data = await result.json<Dataset[]>()
    return data
  }

  async getDataset(datasetId: string): Promise<Dataset | null> {
    const result = await clickhouseClient.query({
      query: 'SELECT * FROM biai.datasets_metadata WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId },
      format: 'JSONEachRow'
    })

    const data = await result.json<Dataset[]>()
    return data.length > 0 ? data[0] : null
  }

  async getDatasetData(datasetId: string, limit: number = 100, offset: number = 0): Promise<any[]> {
    const dataset = await this.getDataset(datasetId)
    if (!dataset) throw new Error('Dataset not found')

    const result = await clickhouseClient.query({
      query: `SELECT * FROM biai.${dataset.table_name} LIMIT ${limit} OFFSET ${offset}`,
      format: 'JSONEachRow'
    })

    return await result.json()
  }

  async deleteDataset(datasetId: string): Promise<void> {
    const dataset = await this.getDataset(datasetId)
    if (!dataset) throw new Error('Dataset not found')

    // Drop the data table
    await clickhouseClient.command({
      query: `DROP TABLE IF EXISTS biai.${dataset.table_name}`
    })

    // Delete metadata
    await clickhouseClient.command({
      query: 'DELETE FROM biai.datasets_metadata WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId }
    })

    await clickhouseClient.command({
      query: 'DELETE FROM biai.dataset_columns WHERE dataset_id = {datasetId:String}',
      query_params: { datasetId }
    })
  }
}

export default new DatasetService()
