import express from 'express'
import clickhouseClient from '../config/clickhouse.js'

const router = express.Router()

// Helper to infer display type from column type and name
function inferDisplayType(columnType: string, columnName: string): string {
  const nameLower = columnName.toLowerCase()

  // ID columns
  if (nameLower.includes('id') || nameLower.includes('key')) {
    return 'id'
  }

  // Numeric types
  if (columnType.includes('Int') || columnType.includes('Float') || columnType.includes('Decimal')) {
    return 'numeric'
  }

  // Date/DateTime
  if (columnType.includes('Date')) {
    return 'datetime'
  }

  // Everything else is categorical
  return 'categorical'
}

// Get database as if it were a dataset
router.get('/:database', async (req, res) => {
  try {
    const { database } = req.params

    // Get all tables in this database
    const tablesResult = await clickhouseClient.query({
      query: `
        SELECT name, engine, total_rows
        FROM system.tables
        WHERE database = {database:String}
          AND name NOT LIKE '.%'
        ORDER BY name
      `,
      query_params: { database },
      format: 'JSONEachRow'
    })

    const tables = await tablesResult.json<{ name: string; engine: string; total_rows: string }>()

    // For each table, get its schema
    const tablesWithSchema = await Promise.all(
      tables.map(async (table) => {
        const columnsResult = await clickhouseClient.query({
          query: `
            SELECT name, type, position
            FROM system.columns
            WHERE database = {database:String}
              AND table = {table:String}
            ORDER BY position
          `,
          query_params: { database, table: table.name },
          format: 'JSONEachRow'
        })

        const columns = await columnsResult.json<{ name: string; type: string; position: number }>()

        return {
          id: table.name, // Use table name as ID
          name: table.name,
          displayName: table.name,
          rowCount: parseInt(table.total_rows) || 0,
          columns: columns.map(col => ({
            name: col.name,
            type: col.type.replace(/Nullable\((.*)\)/, '$1'), // Strip Nullable wrapper
            nullable: col.type.includes('Nullable')
          }))
        }
      })
    )

    res.json({
      dataset: {
        id: database,
        name: database,
        description: `ClickHouse database: ${database}`,
        tables: tablesWithSchema
      }
    })
  } catch (error: any) {
    console.error('Get database error:', error)
    res.status(500).json({ error: 'Failed to get database', message: error.message })
  }
})

// Get column metadata for a table (auto-generated)
router.get('/:database/tables/:table/columns', async (req, res) => {
  try {
    const { database, table } = req.params

    const columnsResult = await clickhouseClient.query({
      query: `
        SELECT name, type, position
        FROM system.columns
        WHERE database = {database:String}
          AND table = {table:String}
        ORDER BY position
      `,
      query_params: { database, table },
      format: 'JSONEachRow'
    })

    const columns = await columnsResult.json<{ name: string; type: string; position: number }>()

    // Generate metadata on-the-fly
    const columnMetadata = columns.map((col, index) => {
      const baseType = col.type.replace(/Nullable\((.*)\)/, '$1')
      const displayType = inferDisplayType(baseType, col.name)

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
        unique_value_count: 0, // Will be computed in aggregations
        null_count: 0,
        min_value: null,
        max_value: null,
        suggested_chart: displayType === 'numeric' ? 'histogram' : 'bar',
        display_priority: 50,
        is_hidden: false
      }
    })

    res.json({ columns: columnMetadata })
  } catch (error: any) {
    console.error('Get columns error:', error)
    res.status(500).json({ error: 'Failed to get columns', message: error.message })
  }
})

// Get aggregations for a table (uses the column metadata we generated)
router.get('/:database/tables/:table/aggregations', async (req, res) => {
  try {
    const { database, table } = req.params

    // First get the column metadata we generate
    const columnsResult = await clickhouseClient.query({
      query: `
        SELECT name, type
        FROM system.columns
        WHERE database = {database:String}
          AND table = {table:String}
        ORDER BY position
      `,
      query_params: { database, table },
      format: 'JSONEachRow'
    })

    const columns = await columnsResult.json<{ name: string; type: string }>()

    // For each column, generate basic aggregations
    const aggregations = await Promise.all(
      columns.map(async (col) => {
        const baseType = col.type.replace(/Nullable\((.*)\)/, '$1')
        const displayType = inferDisplayType(baseType, col.name)

        // Get basic stats
        const statsQuery = `
          SELECT
            count() as total_rows,
            countIf(isNull(${col.name})) as null_count,
            uniqExact(${col.name}) as unique_count
          FROM ${database}.${table}
        `

        const statsResult = await clickhouseClient.query({
          query: statsQuery,
          format: 'JSONEachRow'
        })

        const stats = await statsResult.json<{ total_rows: number; null_count: number; unique_count: number }>()
        const { total_rows, null_count, unique_count } = stats[0]

        const aggregation: any = {
          column_name: col.name,
          display_type: displayType,
          total_rows,
          null_count,
          unique_count
        }

        // For categorical columns, get top categories
        if (displayType === 'categorical' || displayType === 'id') {
          const categoriesQuery = `
            SELECT
              toString(${col.name}) as value,
              toString(${col.name}) as display_value,
              count() as count,
              count() * 100.0 / ${total_rows} as percentage
            FROM ${database}.${table}
            WHERE ${col.name} IS NOT NULL
            GROUP BY ${col.name}
            ORDER BY count DESC
            LIMIT 50
          `

          const categoriesResult = await clickhouseClient.query({
            query: categoriesQuery,
            format: 'JSONEachRow'
          })

          aggregation.categories = await categoriesResult.json()
        }

        // For numeric columns, get stats and histogram
        if (displayType === 'numeric') {
          const numericQuery = `
            SELECT
              min(${col.name}) as min,
              max(${col.name}) as max,
              avg(${col.name}) as mean,
              median(${col.name}) as median,
              stddevPop(${col.name}) as stddev,
              quantile(0.25)(${col.name}) as q25,
              quantile(0.75)(${col.name}) as q75
            FROM ${database}.${table}
            WHERE ${col.name} IS NOT NULL
          `

          const numericResult = await clickhouseClient.query({
            query: numericQuery,
            format: 'JSONEachRow'
          })

          const numericStats = await numericResult.json()
          aggregation.numeric_stats = numericStats[0]

          // Simple histogram (20 bins)
          const min = numericStats[0].min
          const max = numericStats[0].max

          if (min !== null && max !== null && min !== max) {
            const binWidth = (max - min) / 20

            const histogramQuery = `
              SELECT
                ${min} + floor((${col.name} - ${min}) / ${binWidth}) * ${binWidth} as bin_start,
                ${min} + (floor((${col.name} - ${min}) / ${binWidth}) + 1) * ${binWidth} as bin_end,
                count() as count,
                count() * 100.0 / ${total_rows} as percentage
              FROM ${database}.${table}
              WHERE ${col.name} IS NOT NULL
              GROUP BY bin_start, bin_end
              ORDER BY bin_start
            `

            const histogramResult = await clickhouseClient.query({
              query: histogramQuery,
              format: 'JSONEachRow'
            })

            aggregation.histogram = await histogramResult.json()
          }
        }

        return aggregation
      })
    )

    res.json({ aggregations })
  } catch (error: any) {
    console.error('Get aggregations error:', error)
    res.status(500).json({ error: 'Failed to get aggregations', message: error.message })
  }
})

export default router
