import clickhouseClient from '../config/clickhouse.js'

export interface CategoryCount {
  value: string | number
  count: number
  percentage: number
}

export interface NumericStats {
  min: number
  max: number
  mean: number
  median: number
  stddev: number
  q25: number
  q75: number
}

export interface HistogramBin {
  bin_start: number
  bin_end: number
  count: number
  percentage: number
}

export interface ColumnAggregation {
  column_name: string
  display_type: string
  total_rows: number
  null_count: number
  unique_count: number

  // For categorical columns
  categories?: CategoryCount[]

  // For numeric columns
  numeric_stats?: NumericStats
  histogram?: HistogramBin[]
}

export interface Filter {
  // Simple filter (leaf node)
  column?: string
  operator?: 'eq' | 'in' | 'gt' | 'lt' | 'gte' | 'lte' | 'between'
  value?: any

  // Logical operators (internal nodes)
  and?: Filter[]
  or?: Filter[]
  not?: Filter
}

class AggregationService {
  /**
   * Get all column names for a table
   */
  private async getTableColumns(clickhouseTableName: string): Promise<Set<string>> {
    try {
      const result = await clickhouseClient.query({
        query: `SELECT name FROM system.columns WHERE database = 'biai' AND table = '${clickhouseTableName}'`,
        format: 'JSONEachRow'
      })
      const columns = await result.json<{ name: string }[]>()
      return new Set(columns.map(c => c.name))
    } catch (error) {
      console.error('Error getting table columns:', error)
      return new Set()
    }
  }

  /**
   * Filter out columns that don't exist in the table
   */
  private filterExistingColumns(filter: Filter, validColumns: Set<string>): Filter | null {
    // Handle logical operators recursively
    if (filter.and && Array.isArray(filter.and)) {
      const filtered = filter.and
        .map(f => this.filterExistingColumns(f, validColumns))
        .filter(f => f !== null) as Filter[]
      if (filtered.length === 0) return null
      if (filtered.length === 1) return filtered[0]
      return { and: filtered }
    }

    if (filter.or && Array.isArray(filter.or)) {
      const filtered = filter.or
        .map(f => this.filterExistingColumns(f, validColumns))
        .filter(f => f !== null) as Filter[]
      if (filtered.length === 0) return null
      if (filtered.length === 1) return filtered[0]
      return { or: filtered }
    }

    if (filter.not) {
      const filtered = this.filterExistingColumns(filter.not, validColumns)
      if (!filtered) return null
      return { not: filtered }
    }

    // Handle simple filter - check if column exists
    if (filter.column) {
      if (!validColumns.has(filter.column)) {
        return null // Skip this filter
      }
    }

    return filter
  }

  /**
   * Build WHERE clause from filters (supports AND, OR, NOT)
   */
  private buildWhereClause(filters: Filter[] | Filter, validColumns?: Set<string>): string {
    if (!filters) {
      return ''
    }

    // Filter out columns that don't exist in the table
    let filteredFilters = filters
    if (validColumns) {
      if (Array.isArray(filters)) {
        const filtered = filters
          .map(f => this.filterExistingColumns(f, validColumns))
          .filter(f => f !== null) as Filter[]
        if (filtered.length === 0) return ''
        filteredFilters = filtered
      } else {
        const filtered = this.filterExistingColumns(filters, validColumns)
        if (!filtered) return ''
        filteredFilters = filtered
      }
    }

    // Handle array of filters (legacy format)
    if (Array.isArray(filteredFilters)) {
      if (filteredFilters.length === 0) return ''
      const filterTree: Filter = filteredFilters.length === 1 ? filteredFilters[0] : { and: filteredFilters }
      const condition = this.buildFilterCondition(filterTree)
      return condition ? `AND (${condition})` : ''
    }

    // Handle single filter object (new format)
    const condition = this.buildFilterCondition(filteredFilters)
    return condition ? `AND (${condition})` : ''
  }

  /**
   * Recursively build filter condition from filter tree
   */
  private buildFilterCondition(filter: Filter): string {
    // Handle logical operators
    if (filter.and && Array.isArray(filter.and)) {
      const conditions = filter.and
        .map(f => this.buildFilterCondition(f))
        .filter(c => c !== '')
      if (conditions.length === 0) return ''
      if (conditions.length === 1) return conditions[0]
      return `(${conditions.join(' AND ')})`
    }

    if (filter.or && Array.isArray(filter.or)) {
      const conditions = filter.or
        .map(f => this.buildFilterCondition(f))
        .filter(c => c !== '')
      if (conditions.length === 0) return ''
      if (conditions.length === 1) return conditions[0]
      return `(${conditions.join(' OR ')})`
    }

    if (filter.not) {
      const condition = this.buildFilterCondition(filter.not)
      if (!condition) return ''
      return `NOT (${condition})`
    }

    // Handle simple filter (leaf node)
    if (!filter.column || !filter.operator) {
      return ''
    }

    const col = filter.column

    switch (filter.operator) {
      case 'eq':
        // Handle empty string case
        if (filter.value === '(Empty)') {
          return `${col} = ''`
        }
        return typeof filter.value === 'string'
          ? `${col} = '${filter.value.replace(/'/g, "''")}'`
          : `${col} = ${filter.value}`

      case 'in':
        const values = Array.isArray(filter.value) ? filter.value : [filter.value]
        const inValues = values.map(v => {
          if (v === '(Empty)') return "''"
          return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
        }).join(', ')
        return `${col} IN (${inValues})`

      case 'gt':
        return `${col} > ${filter.value}`

      case 'lt':
        return `${col} < ${filter.value}`

      case 'gte':
        return `${col} >= ${filter.value}`

      case 'lte':
        return `${col} <= ${filter.value}`

      case 'between':
        return `${col} BETWEEN ${filter.value[0]} AND ${filter.value[1]}`

      default:
        return ''
    }
  }

  /**
   * Get aggregated data for a column based on its display type
   */
  async getColumnAggregation(
    datasetId: string,
    tableId: string,
    columnName: string,
    displayType: string,
    filters: Filter[] | Filter = []
  ): Promise<ColumnAggregation> {
    // Get the ClickHouse table name
    const tableResult = await clickhouseClient.query({
      query: `
        SELECT clickhouse_table_name, row_count
        FROM biai.dataset_tables
        WHERE dataset_id = {datasetId:String}
          AND table_id = {tableId:String}
        LIMIT 1
      `,
      query_params: { datasetId, tableId },
      format: 'JSONEachRow'
    })

    const tables = await tableResult.json<any[]>()
    if (tables.length === 0) {
      throw new Error('Table not found')
    }

    const clickhouseTableName = tables[0].clickhouse_table_name
    const totalRows = tables[0].row_count

    // Get valid columns for this table
    const validColumns = await this.getTableColumns(clickhouseTableName)
    const whereClause = this.buildWhereClause(filters, validColumns)

    // Get filtered row count if filters are applied
    let filteredTotalRows = totalRows
    const hasFilters = Array.isArray(filters) ? filters.length > 0 : (filters && Object.keys(filters).length > 0)
    if (hasFilters && whereClause) {
      const countQuery = `
        SELECT count() AS filtered_count
        FROM biai.${clickhouseTableName}
        WHERE 1=1 ${whereClause}
      `
      const countResult = await clickhouseClient.query({
        query: countQuery,
        format: 'JSONEachRow'
      })
      const countData = await countResult.json<any[]>()
      filteredTotalRows = countData[0].filtered_count
    }

    // Get basic stats (null count, unique count)
    const basicStatsQuery = `
      SELECT
        countIf(isNull(${columnName})) AS null_count,
        uniqExact(${columnName}) AS unique_count
      FROM biai.${clickhouseTableName}
      WHERE 1=1 ${whereClause}
    `

    const basicStatsResult = await clickhouseClient.query({
      query: basicStatsQuery,
      format: 'JSONEachRow'
    })

    const basicStats = await basicStatsResult.json<any[]>()
    const { null_count, unique_count } = basicStats[0]

    const aggregation: ColumnAggregation = {
      column_name: columnName,
      display_type: displayType,
      total_rows: filteredTotalRows,
      null_count,
      unique_count
    }

    // Get aggregation based on display type
    if (displayType === 'categorical' || displayType === 'id') {
      aggregation.categories = await this.getCategoricalAggregation(
        clickhouseTableName,
        columnName,
        filteredTotalRows,
        50,
        whereClause
      )
    } else if (displayType === 'numeric') {
      aggregation.numeric_stats = await this.getNumericStats(
        clickhouseTableName,
        columnName,
        whereClause
      )
      aggregation.histogram = await this.getHistogram(
        clickhouseTableName,
        columnName,
        20,
        whereClause
      )
    }

    return aggregation
  }

  /**
   * Get category counts for categorical columns
   */
  private async getCategoricalAggregation(
    tableName: string,
    columnName: string,
    totalRows: number,
    limit: number = 50,
    whereClause: string = ''
  ): Promise<CategoryCount[]> {
    const query = `
      SELECT
        if(${columnName} = '' OR ${columnName} IS NULL, 'N/A', ${columnName}) AS value,
        count() AS count,
        count() * 100.0 / ${totalRows} AS percentage
      FROM biai.${tableName}
      WHERE 1=1
        ${whereClause}
      GROUP BY ${columnName}
      ORDER BY count DESC
      LIMIT ${limit}
    `

    const result = await clickhouseClient.query({
      query,
      format: 'JSONEachRow'
    })

    return await result.json<CategoryCount[]>()
  }

  /**
   * Get numeric statistics for numeric columns
   */
  private async getNumericStats(
    tableName: string,
    columnName: string,
    whereClause: string = ''
  ): Promise<NumericStats> {
    const query = `
      SELECT
        min(${columnName}) AS min,
        max(${columnName}) AS max,
        avg(${columnName}) AS mean,
        median(${columnName}) AS median,
        stddevPop(${columnName}) AS stddev,
        quantile(0.25)(${columnName}) AS q25,
        quantile(0.75)(${columnName}) AS q75
      FROM biai.${tableName}
      WHERE ${columnName} IS NOT NULL
        ${whereClause}
    `

    const result = await clickhouseClient.query({
      query,
      format: 'JSONEachRow'
    })

    const stats = await result.json<any[]>()
    return stats[0]
  }

  /**
   * Get histogram data for numeric columns
   */
  private async getHistogram(
    tableName: string,
    columnName: string,
    bins: number = 20,
    whereClause: string = ''
  ): Promise<HistogramBin[]> {
    // First get min and max to calculate bin width
    const minMaxQuery = `
      SELECT
        min(${columnName}) AS min_val,
        max(${columnName}) AS max_val,
        count() AS total_count
      FROM biai.${tableName}
      WHERE ${columnName} IS NOT NULL
        ${whereClause}
    `

    const minMaxResult = await clickhouseClient.query({
      query: minMaxQuery,
      format: 'JSONEachRow'
    })

    const minMaxData = await minMaxResult.json<any[]>()
    const { min_val, max_val, total_count } = minMaxData[0]

    if (min_val === max_val) {
      // All values are the same
      return [{
        bin_start: min_val,
        bin_end: min_val,
        count: total_count,
        percentage: 100
      }]
    }

    const binWidth = (max_val - min_val) / bins

    // Use ClickHouse's histogram function or manual binning
    const histogramQuery = `
      SELECT
        floor((${columnName} - ${min_val}) / ${binWidth}) AS bin_index,
        ${min_val} + floor((${columnName} - ${min_val}) / ${binWidth}) * ${binWidth} AS bin_start,
        ${min_val} + (floor((${columnName} - ${min_val}) / ${binWidth}) + 1) * ${binWidth} AS bin_end,
        count() AS count,
        count() * 100.0 / ${total_count} AS percentage
      FROM biai.${tableName}
      WHERE ${columnName} IS NOT NULL
        ${whereClause}
      GROUP BY bin_index, bin_start, bin_end
      ORDER BY bin_index
    `

    const result = await clickhouseClient.query({
      query: histogramQuery,
      format: 'JSONEachRow'
    })

    const histogram = await result.json<any[]>()
    return histogram.map(bin => ({
      bin_start: bin.bin_start,
      bin_end: bin.bin_end,
      count: bin.count,
      percentage: bin.percentage
    }))
  }

  /**
   * Get aggregations for all visible columns in a table
   */
  async getTableAggregations(
    datasetId: string,
    tableId: string,
    filters: Filter[] | Filter = []
  ): Promise<ColumnAggregation[]> {
    // Get column metadata
    const columnsResult = await clickhouseClient.query({
      query: `
        SELECT
          column_name,
          display_type,
          is_hidden
        FROM biai.dataset_columns
        WHERE dataset_id = {datasetId:String}
          AND table_id = {tableId:String}
          AND is_hidden = false
        ORDER BY created_at DESC
      `,
      query_params: { datasetId, tableId },
      format: 'JSONEachRow'
    })

    const columns = await columnsResult.json<any[]>()

    // Get aggregations for each column in parallel
    const aggregations = await Promise.all(
      columns.map(col =>
        this.getColumnAggregation(
          datasetId,
          tableId,
          col.column_name,
          col.display_type,
          filters
        )
      )
    )

    return aggregations
  }
}

export default new AggregationService()
