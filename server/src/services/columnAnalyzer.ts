import clickhouseClient from '../config/clickhouse.js'

export interface ColumnAnalysis {
  display_type: 'categorical' | 'numeric' | 'datetime' | 'survival_time' | 'survival_status' | 'id' | 'text'
  unique_value_count: number
  null_count: number
  min_value: string | null
  max_value: string | null
  suggested_chart: 'pie' | 'bar' | 'histogram' | 'survival' | 'none'
  display_priority: number
  is_hidden: boolean
}

interface ColumnStats {
  unique_count: number
  null_count: number
  total_count: number
  sample_values: any[]
  min_value: any
  max_value: any
}

export async function analyzeColumn(
  tableName: string,
  columnName: string,
  columnType: string
): Promise<ColumnAnalysis> {
  // Get column statistics
  const stats = await getColumnStats(tableName, columnName, columnType)

  // Detect display type
  const displayType = detectDisplayType(columnName, columnType, stats)

  // Suggest chart type
  const suggestedChart = suggestChartType(displayType, stats)

  // Calculate priority (higher = more important)
  const priority = calculatePriority(columnName, displayType, stats)

  // Determine if should be hidden
  const isHidden = shouldHideColumn(displayType, stats)

  return {
    display_type: displayType,
    unique_value_count: stats.unique_count,
    null_count: stats.null_count,
    min_value: stats.min_value ? String(stats.min_value) : null,
    max_value: stats.max_value ? String(stats.max_value) : null,
    suggested_chart: suggestedChart,
    display_priority: priority,
    is_hidden: isHidden
  }
}

async function getColumnStats(
  tableName: string,
  columnName: string,
  columnType: string
): Promise<ColumnStats> {
  // Handle nullable types
  const isNumericType = columnType.includes('Int') || columnType.includes('Float') || columnType.includes('Decimal')

  // Get unique count and null count
  const nullCondition = isNumericType
    ? `isNull(${columnName})`
    : `isNull(${columnName}) OR ${columnName} = ''`

  const countQuery = `
    SELECT
      uniqExact(${columnName}) as unique_count,
      countIf(${nullCondition}) as null_count,
      count() as total_count
    FROM biai.${tableName}
  `

  const countResult = await clickhouseClient.query({
    query: countQuery,
    format: 'JSONEachRow'
  })
  const countData = await countResult.json<{
    unique_count: number
    null_count: number
    total_count: number
  }>()
  const counts =
    countData && countData.length > 0
      ? countData[0]
      : { unique_count: 0, null_count: 0, total_count: 0 }

  // Get sample values (up to 100)
  const whereCondition = isNumericType
    ? `${columnName} IS NOT NULL`
    : `${columnName} IS NOT NULL AND ${columnName} != ''`

  const sampleQuery = `
    SELECT DISTINCT ${columnName}
    FROM biai.${tableName}
    WHERE ${whereCondition}
    LIMIT 100
  `

  const sampleResult = await clickhouseClient.query({
    query: sampleQuery,
    format: 'JSONEachRow'
  })
  const sampleData = await sampleResult.json<Record<string, unknown>>()
  const sampleValues = sampleData.map(row => row[columnName] as any)

  // Get min/max for numeric columns
  let minValue = null
  let maxValue = null

  if (columnType.includes('Int') || columnType.includes('Float')) {
    const minMaxQuery = `
      SELECT
        min(${columnName}) as min_val,
        max(${columnName}) as max_val
      FROM biai.${tableName}
      WHERE ${columnName} IS NOT NULL
    `

    const minMaxResult = await clickhouseClient.query({
      query: minMaxQuery,
      format: 'JSONEachRow'
    })
    const minMaxData = await minMaxResult.json<{ min_val: number | null; max_val: number | null }>()
    if (minMaxData && minMaxData.length > 0 && minMaxData[0]) {
      minValue = minMaxData[0].min_val
      maxValue = minMaxData[0].max_val
    }
  }

  return {
    unique_count: counts.unique_count,
    null_count: counts.null_count,
    total_count: counts.total_count,
    sample_values: sampleValues,
    min_value: minValue,
    max_value: maxValue
  }
}

function detectDisplayType(
  columnName: string,
  columnType: string,
  stats: ColumnStats
): ColumnAnalysis['display_type'] {
  const nameLower = columnName.toLowerCase()

  // ID columns
  if (nameLower.includes('_id') || nameLower === 'id' ||
      nameLower.endsWith('identifier') ||
      stats.unique_count === stats.total_count) {
    return 'id'
  }

  // Survival time columns
  if ((nameLower.includes('months') || nameLower.includes('days') || nameLower.includes('time')) &&
      (nameLower.includes('survival') || nameLower.includes('os') ||
       nameLower.includes('pfs') || nameLower.includes('dfs') || nameLower.includes('dss'))) {
    return 'survival_time'
  }

  // Survival status columns
  if (nameLower.includes('status') &&
      (nameLower.includes('survival') || nameLower.includes('os') ||
       nameLower.includes('pfs') || nameLower.includes('dfs') || nameLower.includes('dss'))) {
    return 'survival_status'
  }

  // Datetime columns
  if (columnType.includes('Date') || nameLower.includes('date') || nameLower.includes('time')) {
    return 'datetime'
  }

  // Numeric columns
  if (columnType.includes('Int') || columnType.includes('Float') || columnType.includes('Decimal')) {
    // Check if it's really numeric by sampling values
    const isNumeric = stats.sample_values.every(v => !isNaN(Number(v)))
    if (isNumeric) {
      return 'numeric'
    }
  }

  // Text columns (high cardinality)
  if (stats.unique_count > 100) {
    return 'text'
  }

  // Default to categorical
  return 'categorical'
}

function suggestChartType(
  displayType: ColumnAnalysis['display_type'],
  stats: ColumnStats
): ColumnAnalysis['suggested_chart'] {
  // Don't chart ID, text, or hidden columns
  if (displayType === 'id' || displayType === 'text') {
    return 'none'
  }

  // Survival columns are charted together as survival curves
  if (displayType === 'survival_time' || displayType === 'survival_status') {
    return 'survival'
  }

  // Datetime - could be timeline, but skip for now
  if (displayType === 'datetime') {
    return 'none'
  }

  // Numeric - histogram
  if (displayType === 'numeric') {
    // Only histogram if there's good variation
    if (stats.unique_count >= 10) {
      return 'histogram'
    }
    return 'none'
  }

  // Categorical
  if (displayType === 'categorical') {
    // Pie chart for few categories
    if (stats.unique_count >= 2 && stats.unique_count <= 8) {
      return 'pie'
    }
    // Bar chart for more categories
    if (stats.unique_count > 8 && stats.unique_count <= 50) {
      return 'bar'
    }
    // Too many categories
    return 'none'
  }

  return 'none'
}

function calculatePriority(
  columnName: string,
  displayType: ColumnAnalysis['display_type'],
  stats: ColumnStats
): number {
  const nameLower = columnName.toLowerCase()
  let priority = 0

  // Survival curves get highest priority
  if (displayType === 'survival_time' || displayType === 'survival_status') {
    priority = 1000
  }

  // Common demographic/clinical fields
  const highPriorityFields = ['sex', 'gender', 'age', 'race', 'ethnicity', 'status', 'type', 'stage', 'grade']
  if (highPriorityFields.some(field => nameLower.includes(field))) {
    priority += 500
  }

  // Categorical with good distribution (not too sparse)
  if (displayType === 'categorical') {
    const nonNullPercent = ((stats.total_count - stats.null_count) / stats.total_count) * 100
    if (nonNullPercent > 50) {
      priority += 200
    }
  }

  // Numeric with variation
  if (displayType === 'numeric' && stats.unique_count >= 10) {
    priority += 100
  }

  // Penalize high null percentage
  const nullPercent = (stats.null_count / stats.total_count) * 100
  if (nullPercent > 80) {
    priority -= 300
  }

  return priority
}

function shouldHideColumn(
  displayType: ColumnAnalysis['display_type'],
  stats: ColumnStats
): boolean {
  // Hide ID columns
  if (displayType === 'id') {
    return true
  }

  // Hide text columns
  if (displayType === 'text') {
    return true
  }

  // Hide if mostly null (>90%)
  const nullPercent = (stats.null_count / stats.total_count) * 100
  if (nullPercent > 90) {
    return true
  }

  // Hide if only one unique value
  if (stats.unique_count <= 1) {
    return true
  }

  return false
}
