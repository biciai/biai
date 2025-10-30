import clickhouseClient from '../config/clickhouse.js'

export interface CategoryCount {
  value: string
  display_value: string
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

  // Cross-table metadata (optional)
  tableName?: string
}

export interface TableRelationship {
  foreign_key: string
  referenced_table: string
  referenced_column: string
  type?: string
}

export interface TableMetadata {
  table_name: string
  clickhouse_table_name: string
  relationships?: TableRelationship[]
}

class AggregationService {
  /**
   * Find a relationship path between two tables (supports multi-hop transitive relationships).
   *
   * Uses BFS to find the shortest path between tables through foreign key relationships.
   *
   * @param fromTable - Starting table name
   * @param toTable - Target table name
   * @param allTablesMetadata - Metadata for all tables including relationships
   * @returns Array of relationship steps, or null if no path exists
   *
   * @example
   * // Direct relationship: mutations → samples
   * // Returns: [{ from: 'mutations', to: 'samples', fk: 'sample_id', refCol: 'sample_id' }]
   *
   * // Transitive relationship: mutations → samples → patients
   * // Returns: [
   * //   { from: 'mutations', to: 'samples', fk: 'sample_id', refCol: 'sample_id' },
   * //   { from: 'samples', to: 'patients', fk: 'patient_id', refCol: 'patient_id' }
   * // ]
   */
  private findRelationshipPath(
    fromTable: string,
    toTable: string,
    allTablesMetadata: TableMetadata[]
  ): Array<{ from: string; to: string; fk: string; refCol: string; direction: 'forward' | 'backward' }> | null {
    if (fromTable === toTable) return null

    // BFS to find shortest path
    const queue: Array<{
      table: string
      path: Array<{ from: string; to: string; fk: string; refCol: string; direction: 'forward' | 'backward' }>
    }> = [{ table: fromTable, path: [] }]
    const visited = new Set<string>([fromTable])

    while (queue.length > 0) {
      const { table: currentTable, path } = queue.shift()!

      // Get current table metadata
      const currentTableMeta = allTablesMetadata.find(t => t.table_name === currentTable)
      if (!currentTableMeta) continue

      // Check forward relationships (current table references other tables)
      for (const rel of currentTableMeta.relationships || []) {
        const nextTable = rel.referenced_table
        if (visited.has(nextTable)) continue

        const newPath = [
          ...path,
          {
            from: currentTable,
            to: nextTable,
            fk: rel.foreign_key,
            refCol: rel.referenced_column,
            direction: 'forward' as const
          }
        ]

        if (nextTable === toTable) {
          return newPath
        }

        visited.add(nextTable)
        queue.push({ table: nextTable, path: newPath })
      }

      // Check backward relationships (other tables reference current table)
      for (const otherTableMeta of allTablesMetadata) {
        if (otherTableMeta.table_name === currentTable) continue

        for (const rel of otherTableMeta.relationships || []) {
          if (rel.referenced_table !== currentTable) continue

          const nextTable = otherTableMeta.table_name
          if (visited.has(nextTable)) continue

          const newPath = [
            ...path,
            {
              from: currentTable,
              to: nextTable,
              fk: rel.foreign_key,
              refCol: rel.referenced_column,
              direction: 'backward' as const
            }
          ]

          if (nextTable === toTable) {
            return newPath
          }

          visited.add(nextTable)
          queue.push({ table: nextTable, path: newPath })
        }
      }
    }

    return null // No path found
  }

  /**
   * Build a subquery for cross-table filtering.
   *
   * Generates SQL subqueries to filter a table based on filters from related tables
   * through foreign key relationships. Supports bidirectional and transitive (multi-hop) relationships.
   *
   * @param currentTableName - The table being filtered
   * @param filter - The filter to apply (must have tableName property for cross-table)
   * @param allTablesMetadata - Metadata for all tables including relationships
   * @returns SQL subquery string or null if not a cross-table filter or no relationship exists
   *
   * @example
   * // Direct: Filtering samples by patient attributes:
   * // WHERE samples.patient_id IN (SELECT patient_id FROM patients WHERE radiation_therapy = 'Yes')
   *
   * // Transitive: Filtering mutations by patient attributes (mutations → samples → patients):
   * // WHERE mutations.sample_id IN (
   * //   SELECT sample_id FROM samples WHERE patient_id IN (
   * //     SELECT patient_id FROM patients WHERE radiation_therapy = 'Yes'
   * //   )
   * // )
   */
  private buildCrossTableSubquery(
    currentTableName: string,
    filter: Filter,
    allTablesMetadata: TableMetadata[]
  ): string | null {
    const filterTableName = filter.tableName
    if (!filterTableName || filterTableName === currentTableName) {
      return null // Not a cross-table filter
    }

    // Find the filter's table metadata
    const filterTable = allTablesMetadata.find(t => t.table_name === filterTableName)
    if (!filterTable) {
      console.warn(`Cross-table filter references unknown table: ${filterTableName}`)
      return null
    }

    // Find relationship path (supports transitive/multi-hop relationships)
    const path = this.findRelationshipPath(currentTableName, filterTableName, allTablesMetadata)
    if (!path || path.length === 0) {
      console.warn(`No relationship path found between ${currentTableName} and ${filterTableName}`)
      return null
    }

    // Build the filter condition for the target table
    const filterCondition = this.buildFilterCondition(filter)
    if (!filterCondition) return null

    // Build nested IN subqueries for ClickHouse (no JOINs, better performance)
    // Example path: mutations → samples → patients
    // Build: mutations.sample_id IN (
    //          SELECT sample_id FROM samples WHERE patient_id IN (
    //            SELECT patient_id FROM patients WHERE condition
    //          )
    //        )

    // Start with the innermost query (filter table) and wrap outward
    const lastStep = path[path.length - 1]
    const lastTable = allTablesMetadata.find(t => t.table_name === lastStep.to)
    if (!lastTable) return null

    const qualifiedLastTable = this.qualifyTableName(lastTable.clickhouse_table_name)

    // Innermost: SELECT key FROM filter_table WHERE condition
    let subquery = lastStep.direction === 'forward'
      ? `SELECT ${lastStep.refCol} FROM ${qualifiedLastTable} WHERE ${filterCondition}`
      : `SELECT ${lastStep.fk} FROM ${qualifiedLastTable} WHERE ${filterCondition}`

    // Work backwards through the path, wrapping each level
    for (let i = path.length - 2; i >= 0; i--) {
      const step = path[i]
      const nextStep = path[i + 1]
      const stepTable = allTablesMetadata.find(t => t.table_name === step.to)
      if (!stepTable) return null

      const qualifiedTable = this.qualifyTableName(stepTable.clickhouse_table_name)

      // Determine SELECT column (what current table needs)
      const selectCol = step.direction === 'forward' ? step.refCol : step.fk

      // Determine WHERE column (what links to next table)
      const whereCol = nextStep.direction === 'forward' ? nextStep.fk : nextStep.refCol

      subquery = `SELECT ${selectCol} FROM ${qualifiedTable} WHERE ${whereCol} IN (${subquery})`
    }

    // Final wrap: current_table.column IN (subquery)
    const firstStep = path[0]
    const finalColumn = firstStep.direction === 'forward' ? firstStep.fk : firstStep.refCol
    subquery = `${finalColumn} IN (${subquery})`

    return subquery
  }

  /**
   * Ensure numeric filter values are safe for interpolation
   */
  private ensureNumeric(value: unknown, operator: string): number {
    if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        return value
      }
      throw new Error(`Invalid numeric value provided for ${operator} filter`)
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        throw new Error(`Invalid numeric value provided for ${operator} filter`)
      }
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }

    throw new Error(`Invalid numeric value provided for ${operator} filter`)
  }

  /**
   * Get all column names for a table
   */
  private async getTableColumns(clickhouseTableName: string): Promise<Set<string>> {
    try {
      const { database, table } = this.parseTableIdentifier(clickhouseTableName)
      const result = await clickhouseClient.query({
        query: `
          SELECT name
          FROM system.columns
          WHERE database = {database:String}
            AND table = {table:String}
        `,
        query_params: { database, table },
        format: 'JSONEachRow'
      })
      const columns = await result.json<{ name: string }>()
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
   * Build WHERE clause from filters.
   *
   * Supports logical operators (AND, OR, NOT) and cross-table filtering through
   * foreign key relationships. Filters can target columns in related tables.
   *
   * @param filters - Filter or array of filters to apply
   * @param validColumns - Set of valid column names for the current table (optional)
   * @param currentTableName - Name of the table being filtered (required for cross-table)
   * @param allTablesMetadata - Metadata for all tables with relationships (required for cross-table)
   * @returns SQL WHERE clause string (includes 'AND' prefix) or empty string
   */
  private buildWhereClause(
    filters: Filter[] | Filter,
    validColumns?: Set<string>,
    currentTableName?: string,
    allTablesMetadata?: TableMetadata[]
  ): string {
    if (!filters) {
      return ''
    }

    const filterArray = Array.isArray(filters) ? filters : [filters]
    const localFilters: Filter[] = []
    const crossTableConditions: string[] = []

    // Separate local filters from cross-table filters
    for (const filter of filterArray) {
      const isCrossTable = filter.tableName && currentTableName && allTablesMetadata && filter.tableName !== currentTableName

      if (isCrossTable) {
        // This is a cross-table filter - build subquery
        const subquery = this.buildCrossTableSubquery(
          currentTableName,
          filter,
          allTablesMetadata!
        )
        if (subquery) {
          crossTableConditions.push(subquery)
        }
      } else {
        // Local filter
        localFilters.push(filter)
      }
    }

    // Filter out columns that don't exist in the table (for local filters only)
    let filteredLocalFilters = localFilters
    if (validColumns && localFilters.length > 0) {
      const filtered = localFilters
        .map(f => this.filterExistingColumns(f, validColumns))
        .filter(f => f !== null) as Filter[]
      filteredLocalFilters = filtered
    }

    // Build local filter condition
    let localCondition = ''
    if (filteredLocalFilters.length > 0) {
      const filterTree: Filter = filteredLocalFilters.length === 1 ? filteredLocalFilters[0] : { and: filteredLocalFilters }
      localCondition = this.buildFilterCondition(filterTree)
    }

    // Combine local and cross-table conditions
    const allConditions = []
    if (localCondition) allConditions.push(localCondition)
    allConditions.push(...crossTableConditions)

    if (allConditions.length === 0) return ''
    return `AND (${allConditions.join(' AND ')})`
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
        if (filter.value === '(Empty)' || filter.value === '') {
          return `(${col} = '' OR isNull(${col}))`
        }
        if (filter.value === '(N/A)') {
          return `${col} = 'N/A'`
        }
        if (filter.value === null) {
          return `isNull(${col})`
        }
        if (typeof filter.value === 'number') {
          if (!Number.isFinite(filter.value)) {
            throw new Error('Invalid value provided for eq filter')
          }
          return `${col} = ${filter.value}`
        }
        if (typeof filter.value === 'string') {
          return `${col} = '${filter.value.replace(/'/g, "''")}'`
        }
        throw new Error('Invalid value provided for eq filter')

      case 'in':
        const values = Array.isArray(filter.value) ? filter.value : [filter.value]
        let includesEmpty = false
        let includesNull = false
        const inValues = values
          .map(v => {
            if (v === '(Empty)' || v === '') {
              includesEmpty = true
              return null
            }
            if (v === '(N/A)') {
              return `'N/A'`
            }
            if (v === null) {
              includesNull = true
              return null
            }
            if (typeof v === 'number') {
              if (!Number.isFinite(v)) {
                throw new Error('Invalid numeric value provided for in filter')
              }
              return `${v}`
            }
            if (typeof v === 'string') {
              return `'${v.replace(/'/g, "''")}'`
            }
            throw new Error('Invalid value provided for in filter')
          })
          .filter((item): item is string => item !== null)
          .join(', ')

        const conditions: string[] = []
        if (inValues.length > 0) {
          conditions.push(`${col} IN (${inValues})`)
        }
        if (includesEmpty) {
          conditions.push(`${col} = ''`)
          conditions.push(`isNull(${col})`)
        } else if (includesNull) {
          conditions.push(`isNull(${col})`)
        }

        if (conditions.length === 0) {
          // No valid values provided; return a condition that always fails
          return '0'
        }

        if (conditions.length === 1) {
          return conditions[0]
        }

        return `(${conditions.join(' OR ')})`

      case 'gt':
        return `${col} > ${this.ensureNumeric(filter.value, 'gt')}`

      case 'lt':
        return `${col} < ${this.ensureNumeric(filter.value, 'lt')}`

      case 'gte':
        return `${col} >= ${this.ensureNumeric(filter.value, 'gte')}`

      case 'lte':
        return `${col} <= ${this.ensureNumeric(filter.value, 'lte')}`

      case 'between':
        if (!Array.isArray(filter.value) || filter.value.length !== 2) {
          throw new Error('Between filter requires an array with exactly two values')
        }
        const [start, end] = filter.value.map(v => this.ensureNumeric(v, 'between'))
        return `${col} BETWEEN ${start} AND ${end}`

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
    filters: Filter[] | Filter = [],
    currentTableName?: string,
    allTablesMetadata?: TableMetadata[]
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

    const tables = await tableResult.json<{ clickhouse_table_name: string; row_count: number }>()
    if (tables.length === 0) {
      throw new Error('Table not found')
    }

    const clickhouseTableName = tables[0].clickhouse_table_name
    const qualifiedTableName = this.qualifyTableName(clickhouseTableName)
    const totalRows = tables[0].row_count

    // Get valid columns for this table
    const validColumns = await this.getTableColumns(clickhouseTableName)
    const whereClause = this.buildWhereClause(filters, validColumns, currentTableName, allTablesMetadata)

    // Get filtered row count if filters are applied
    let filteredTotalRows = totalRows
    const hasFilters = Array.isArray(filters) ? filters.length > 0 : (filters && Object.keys(filters).length > 0)
    if (hasFilters && whereClause) {
      const countQuery = `
        SELECT count() AS filtered_count
        FROM ${qualifiedTableName}
        WHERE 1=1 ${whereClause}
      `
      const countResult = await clickhouseClient.query({
        query: countQuery,
        format: 'JSONEachRow'
      })
      const countData = await countResult.json<{ filtered_count: number }>()
      filteredTotalRows = countData[0].filtered_count
    }

    // Get basic stats (null count, unique count)
    const basicStatsQuery = `
      SELECT
        countIf(isNull(${columnName})) AS null_count,
        uniqExact(${columnName}) AS unique_count
      FROM ${qualifiedTableName}
      WHERE 1=1 ${whereClause}
    `

    const basicStatsResult = await clickhouseClient.query({
      query: basicStatsQuery,
      format: 'JSONEachRow'
    })

    const basicStats = await basicStatsResult.json<{ null_count: number; unique_count: number }>()
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
        qualifiedTableName,
        columnName,
        filteredTotalRows,
        50,
        whereClause
      )
    } else if (displayType === 'numeric') {
      aggregation.numeric_stats = await this.getNumericStats(
        qualifiedTableName,
        columnName,
        whereClause
      )
      aggregation.histogram = await this.getHistogram(
        qualifiedTableName,
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
    qualifiedTableName: string,
    columnName: string,
    totalRows: number,
    limit: number = 50,
    whereClause: string = ''
  ): Promise<CategoryCount[]> {
    const query = `
      SELECT
        multiIf(
          isNull(${columnName}) OR lengthUTF8(trimBoth(toString(${columnName}))) = 0, '',
          lowerUTF8(trimBoth(toString(${columnName}))) = 'n/a', 'N/A',
          trimBoth(toString(${columnName}))
        ) AS value,
        multiIf(
          isNull(${columnName}) OR lengthUTF8(trimBoth(toString(${columnName}))) = 0, '(Empty)',
          lowerUTF8(trimBoth(toString(${columnName}))) = 'n/a', '(N/A)',
          trimBoth(toString(${columnName}))
        ) AS display_value,
        count() AS count,
        if(${totalRows} = 0, 0, count() * 100.0 / ${totalRows}) AS percentage
      FROM ${qualifiedTableName}
      WHERE 1=1
        ${whereClause}
      GROUP BY value, display_value
      ORDER BY count DESC
      LIMIT ${limit}
    `

    const result = await clickhouseClient.query({
      query,
      format: 'JSONEachRow'
    })

    return await result.json<CategoryCount>()
  }

  /**
   * Get numeric statistics for numeric columns
   */
  private async getNumericStats(
    qualifiedTableName: string,
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
      FROM ${qualifiedTableName}
      WHERE ${columnName} IS NOT NULL
        ${whereClause}
    `

    const result = await clickhouseClient.query({
      query,
      format: 'JSONEachRow'
    })

    const stats = await result.json<NumericStats>()
    return stats[0]
  }

  /**
   * Get histogram data for numeric columns
   */
  private async getHistogram(
    qualifiedTableName: string,
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
      FROM ${qualifiedTableName}
      WHERE ${columnName} IS NOT NULL
        ${whereClause}
    `

    const minMaxResult = await clickhouseClient.query({
      query: minMaxQuery,
      format: 'JSONEachRow'
    })

    const minMaxData = await minMaxResult.json<{ min_val: number | null; max_val: number | null; total_count: number }>()
    if (minMaxData.length === 0) {
      return []
    }

    const { min_val, max_val, total_count } = minMaxData[0]
    if (min_val === null || max_val === null) {
      return []
    }

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
      FROM ${qualifiedTableName}
      WHERE ${columnName} IS NOT NULL
        ${whereClause}
      GROUP BY bin_index, bin_start, bin_end
      ORDER BY bin_index
    `

    const result = await clickhouseClient.query({
      query: histogramQuery,
      format: 'JSONEachRow'
    })

    const histogram = await result.json<{ bin_start: number; bin_end: number; count: number; percentage: number }>()
    return histogram.map(bin => ({
      bin_start: bin.bin_start,
      bin_end: bin.bin_end,
      count: bin.count,
      percentage: bin.percentage
    }))
  }

  private qualifyTableName(tableName: string): string {
    return tableName.includes('.') ? tableName : `biai.${tableName}`
  }

  private parseTableIdentifier(tableName: string): { database: string; table: string } {
    if (tableName.includes('.')) {
      const [database, table] = tableName.split('.', 2)
      return { database, table }
    }
    return { database: 'biai', table: tableName }
  }

  /**
   * Get aggregations for all visible columns in a table.
   *
   * Loads table metadata including foreign key relationships to support
   * cross-table filtering. Filters from related tables are automatically
   * propagated through relationship chains.
   *
   * @param datasetId - The dataset ID
   * @param tableId - The table ID
   * @param filters - Filters to apply (may include cross-table filters with tableName property)
   * @returns Array of column aggregations
   */
  async getTableAggregations(
    datasetId: string,
    tableId: string,
    filters: Filter[] | Filter = []
  ): Promise<ColumnAggregation[]> {
    // Get all tables metadata for cross-table filtering support
    const tablesResult = await clickhouseClient.query({
      query: `
        SELECT
          table_name,
          clickhouse_table_name
        FROM biai.dataset_tables
        WHERE dataset_id = {datasetId:String}
      `,
      query_params: { datasetId },
      format: 'JSONEachRow'
    })

    const tablesData = await tablesResult.json<{ table_name: string; clickhouse_table_name: string }>()

    // Get relationships for all tables
    const relationshipsResult = await clickhouseClient.query({
      query: `
        SELECT
          table_id,
          foreign_key,
          referenced_table,
          referenced_column,
          relationship_type
        FROM biai.table_relationships
        WHERE dataset_id = {datasetId:String}
      `,
      query_params: { datasetId },
      format: 'JSONEachRow'
    })

    const relationshipsData = await relationshipsResult.json<{
      table_id: string
      foreign_key: string
      referenced_table: string
      referenced_column: string
      relationship_type: string
    }>()

    // Map table_id to table_name
    const tableIdToNameResult = await clickhouseClient.query({
      query: `
        SELECT table_id, table_name
        FROM biai.dataset_tables
        WHERE dataset_id = {datasetId:String}
      `,
      query_params: { datasetId },
      format: 'JSONEachRow'
    })
    const tableIdToName = await tableIdToNameResult.json<{ table_id: string; table_name: string }>()
    const idToNameMap = new Map(tableIdToName.map(t => [t.table_id, t.table_name]))

    // Build table metadata with relationships
    const allTablesMetadata: TableMetadata[] = tablesData.map(table => {
      const tableRelationships = relationshipsData
        .filter(rel => {
          const relTableName = idToNameMap.get(rel.table_id)
          return relTableName === table.table_name
        })
        .map(rel => ({
          foreign_key: rel.foreign_key,
          referenced_table: rel.referenced_table,
          referenced_column: rel.referenced_column,
          type: rel.relationship_type
        }))

      return {
        table_name: table.table_name,
        clickhouse_table_name: table.clickhouse_table_name,
        relationships: tableRelationships
      }
    })

    // Get current table name
    const currentTableIdName = tableIdToName.find(t => t.table_id === tableId)
    const currentTableName = currentTableIdName?.table_name

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

    const columns = await columnsResult.json<{ column_name: string; display_type: string; is_hidden: boolean }>()

    // Get aggregations for each column in parallel
    const aggregations = await Promise.all(
      columns.map(col =>
        this.getColumnAggregation(
          datasetId,
          tableId,
          col.column_name,
          col.display_type,
          filters,
          currentTableName,
          allTablesMetadata
        )
      )
    )

    return aggregations
  }
}

export default new AggregationService()
