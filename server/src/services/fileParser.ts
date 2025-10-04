import { parse } from 'csv-parse'
import { createReadStream } from 'fs'
import { Readable } from 'stream'

export interface ColumnMetadata {
  name: string
  type: 'String' | 'Int32' | 'Float64' | 'DateTime' | 'Boolean'
  nullable: boolean
  index: number
}

export interface ParsedData {
  columns: ColumnMetadata[]
  rows: any[][]
  rowCount: number
}

// Infer ClickHouse type from sample values
function inferType(values: string[]): 'String' | 'Int32' | 'Float64' | 'DateTime' | 'Boolean' {
  const nonEmptyValues = values.filter(v => v !== '' && v !== null && v !== undefined)

  if (nonEmptyValues.length === 0) return 'String'

  // Check for boolean
  const booleanValues = nonEmptyValues.filter(v =>
    v.toLowerCase() === 'true' || v.toLowerCase() === 'false' ||
    v.toLowerCase() === 'yes' || v.toLowerCase() === 'no'
  )
  if (booleanValues.length === nonEmptyValues.length) return 'String' // Store as string for flexibility

  // Check for integer
  const intValues = nonEmptyValues.filter(v => /^-?\d+$/.test(v))
  if (intValues.length === nonEmptyValues.length) return 'Int32'

  // Check for float
  const floatValues = nonEmptyValues.filter(v => /^-?\d*\.?\d+$/.test(v))
  if (floatValues.length === nonEmptyValues.length) return 'Float64'

  // Check for date/datetime
  const dateValues = nonEmptyValues.filter(v => {
    const d = new Date(v)
    return !isNaN(d.getTime())
  })
  if (dateValues.length === nonEmptyValues.length && nonEmptyValues.length > 0) {
    // Only if most values look like dates
    return 'String' // Keep as string for now, can enhance later
  }

  return 'String'
}

export async function parseCSVFile(
  filePath: string,
  skipRows: number = 0,
  delimiter: string = '\t'
): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const rows: any[][] = []
    let headers: string[] = []
    let headerRowIndex = skipRows
    let rowIndex = 0

    const parser = parse({
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true
    })

    createReadStream(filePath)
      .pipe(parser)
      .on('data', (row: string[]) => {
        rowIndex++

        // Skip metadata rows
        if (rowIndex <= skipRows) {
          return
        }

        // Next row after skip is the header
        if (rowIndex === skipRows + 1) {
          headers = row.map(h => h.trim())
          return
        }

        rows.push(row)
      })
      .on('end', () => {
        // Infer types from first 100 rows
        const sampleSize = Math.min(100, rows.length)
        const columns: ColumnMetadata[] = headers.map((name, index) => {
          const sampleValues = rows.slice(0, sampleSize).map(row => row[index] || '')
          const hasNulls = sampleValues.some(v => v === '' || v === null || v === undefined || v.toLowerCase() === 'na')

          return {
            name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            type: inferType(sampleValues),
            nullable: hasNulls,
            index
          }
        })

        resolve({
          columns,
          rows,
          rowCount: rows.length
        })
      })
      .on('error', (error) => {
        reject(error)
      })
  })
}

export async function parseCSVBuffer(
  buffer: Buffer,
  skipRows: number = 0,
  delimiter: string = '\t'
): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const rows: any[][] = []
    let headers: string[] = []
    let rowIndex = 0

    const parser = parse({
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true
    })

    const stream = Readable.from(buffer)
    stream
      .pipe(parser)
      .on('data', (row: string[]) => {
        rowIndex++

        if (rowIndex <= skipRows) {
          return
        }

        if (rowIndex === skipRows + 1) {
          headers = row.map(h => h.trim())
          return
        }

        rows.push(row)
      })
      .on('end', () => {
        const sampleSize = Math.min(100, rows.length)
        const columns: ColumnMetadata[] = headers.map((name, index) => {
          const sampleValues = rows.slice(0, sampleSize).map(row => row[index] || '')
          const hasNulls = sampleValues.some(v => v === '' || v === null || v === undefined || v.toLowerCase() === 'na')

          return {
            name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            type: inferType(sampleValues),
            nullable: hasNulls,
            index
          }
        })

        resolve({
          columns,
          rows,
          rowCount: rows.length
        })
      })
      .on('error', (error) => {
        reject(error)
      })
  })
}
