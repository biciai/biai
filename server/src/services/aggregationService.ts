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

class AggregationService {
  /**
   * Get aggregated data for a column based on its display type
   */
  async getColumnAggregation(
    datasetId: string,
    tableId: string,
    columnName: string,
    displayType: string
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

    // Get basic stats (null count, unique count)
    const basicStatsQuery = `
      SELECT
        countIf(isNull(${columnName})) AS null_count,
        uniqExact(${columnName}) AS unique_count
      FROM biai.${clickhouseTableName}
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
      total_rows: totalRows,
      null_count,
      unique_count
    }

    // Get aggregation based on display type
    if (displayType === 'categorical' || displayType === 'id') {
      aggregation.categories = await this.getCategoricalAggregation(
        clickhouseTableName,
        columnName,
        totalRows
      )
    } else if (displayType === 'numeric') {
      aggregation.numeric_stats = await this.getNumericStats(
        clickhouseTableName,
        columnName
      )
      aggregation.histogram = await this.getHistogram(
        clickhouseTableName,
        columnName
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
    limit: number = 50
  ): Promise<CategoryCount[]> {
    const query = `
      SELECT
        if(${columnName} = '', '(Empty)', ${columnName}) AS value,
        count() AS count,
        count() * 100.0 / ${totalRows} AS percentage
      FROM biai.${tableName}
      WHERE ${columnName} IS NOT NULL
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
    columnName: string
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
    bins: number = 20
  ): Promise<HistogramBin[]> {
    // First get min and max to calculate bin width
    const minMaxQuery = `
      SELECT
        min(${columnName}) AS min_val,
        max(${columnName}) AS max_val,
        count() AS total_count
      FROM biai.${tableName}
      WHERE ${columnName} IS NOT NULL
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
    tableId: string
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
          col.display_type
        )
      )
    )

    return aggregations
  }
}

export default new AggregationService()
