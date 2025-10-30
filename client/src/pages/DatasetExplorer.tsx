import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Plot from 'react-plotly.js'
import type { PlotMouseEvent, PlotSelectionEvent } from 'plotly.js'
import SafeHtml from '../components/SafeHtml'
import api from '../services/api'

interface Column {
  name: string
  type: string
  nullable: boolean
}

interface ColumnMetadata {
  column_name: string
  column_type: string
  column_index: number
  is_nullable: boolean
  display_name: string
  description: string
  user_data_type: string
  user_priority: number | null
  display_type: string
  unique_value_count: number
  null_count: number
  min_value: string | null
  max_value: string | null
  suggested_chart: string
  display_priority: number
  is_hidden: boolean
}

interface CategoryCount {
  value: string
  display_value: string
  count: number
  percentage: number
}

interface NumericStats {
  min: number
  max: number
  mean: number
  median: number
  stddev: number
  q25: number
  q75: number
}

interface HistogramBin {
  bin_start: number
  bin_end: number
  count: number
  percentage: number
}

interface ColumnAggregation {
  column_name: string
  display_type: string
  total_rows: number
  null_count: number
  unique_count: number
  categories?: CategoryCount[]
  numeric_stats?: NumericStats
  histogram?: HistogramBin[]
}

interface Filter {
  column?: string
  operator?: 'eq' | 'in' | 'gt' | 'lt' | 'gte' | 'lte' | 'between'
  value?: any
  and?: Filter[]
  or?: Filter[]
  not?: Filter
}

interface TableRelationship {
  foreign_key: string
  referenced_table: string
  referenced_column: string
  type?: string
}

interface Table {
  id: string
  name: string
  displayName: string
  rowCount: number
  columns: Column[]
  primaryKey?: string
  relationships?: TableRelationship[]
}

interface Dataset {
  id: string
  name: string
  database_name?: string
  database_type?: 'created' | 'connected'
  description: string
  tags?: string[]
  tables: Table[]
}

function DatasetExplorer() {
  const { id, database } = useParams()
  const navigate = useNavigate()

  // Determine if we're in database mode or dataset mode
  const isDatabaseMode = !!database
  const identifier = database || id
  const [dataset, setDataset] = useState<Dataset | null>(null)

  // Helper to determine if we should use database API
  // Use database API if:
  // 1. We're in database mode (viewing from /databases/:database), OR
  // 2. The dataset is a "connected" type (registered existing database)
  const usesDatabaseAPI = isDatabaseMode ? true : dataset?.database_type === 'connected'
  const databaseIdentifier = isDatabaseMode ? identifier : dataset?.database_name
  const datasetIdentifier = dataset?.id
  const [loading, setLoading] = useState(true)
  const [columnMetadata, setColumnMetadata] = useState<Record<string, ColumnMetadata[]>>({})
  const [aggregations, setAggregations] = useState<Record<string, ColumnAggregation[]>>({})
  const [baselineAggregations, setBaselineAggregations] = useState<Record<string, ColumnAggregation[]>>({})
  const [filters, setFilters] = useState<Filter[]>([])
  const [activeFilterMenu, setActiveFilterMenu] = useState<{ tableName: string; columnName: string } | null>(null)
  const [customRangeInputs, setCustomRangeInputs] = useState<Record<string, { min: string; max: string }>>({})
  const [rangeSelections, setRangeSelections] = useState<Record<string, Array<{ start: number; end: number }>>>({})


  useEffect(() => {
    loadDataset()
  }, [id, database])

  useEffect(() => {
    // Reload aggregations when filters change
    if (dataset) {
      reloadAggregations()
    }
  }, [filters])

  const reloadAggregations = async () => {
    if (!dataset) return
    // Determine if we should use database API based on current dataset
    const shouldUseDatabaseAPI = isDatabaseMode || dataset.database_type === 'connected'
    const dbIdentifier = isDatabaseMode ? identifier : dataset.database_name

    // Send ALL filters to ALL tables and let the backend figure out cross-table filtering
    // The backend will detect which filters are for each table using the tableName property
    for (const table of dataset.tables) {
      await loadTableAggregations(table.id, table.name, {
        useDbAPI: shouldUseDatabaseAPI,
        dbName: dbIdentifier,
        datasetId: dataset.id,
        tableFilters: filters // Send all filters to every table
      })
    }
  }

  const loadDataset = async () => {
    try {
      setLoading(true)

      // Use different API endpoint based on mode
      const apiPath = isDatabaseMode ? `/databases/${identifier}` : `/datasets/${identifier}`
      const response = await api.get(apiPath)

      const loadedDataset = response.data.dataset
      setDataset(loadedDataset)
      setBaselineAggregations({})
      setCustomRangeInputs({})
      setRangeSelections({})
      setActiveFilterMenu(null)

      // Determine if this dataset uses database API
      const shouldUseDatabaseAPI = isDatabaseMode || loadedDataset.database_type === 'connected'
      const dbIdentifier = isDatabaseMode ? identifier : loadedDataset.database_name

      // Load aggregations and column metadata for all tables
      for (const table of loadedDataset.tables) {
        await loadTableAggregations(table.id, table.name, {
          storeBaseline: true,
          useDbAPI: shouldUseDatabaseAPI,
          dbName: dbIdentifier,
          datasetId: loadedDataset.id
        })
        await loadColumnMetadata(table.id, table.name, {
          useDbAPI: shouldUseDatabaseAPI,
          dbName: dbIdentifier,
          datasetId: loadedDataset.id
        })
      }
    } catch (error) {
      console.error('Failed to load dataset:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTableAggregations = async (
    tableId: string,
    tableName: string,
    options?: { storeBaseline?: boolean; useDbAPI?: boolean; dbName?: string; datasetId?: string; tableFilters?: Filter[] }
  ) => {
    try {
      // Use table-specific filters if provided, otherwise fall back to global filters
      const activeFilters = options?.tableFilters !== undefined ? options.tableFilters : filters
      const params: Record<string, any> = activeFilters.length > 0 ? { filters: JSON.stringify(activeFilters) } : {}
      // Use provided values or fall back to computed values
      const shouldUseDbAPI = options?.useDbAPI !== undefined ? options.useDbAPI : usesDatabaseAPI
      const dbIdentifier = options?.dbName || databaseIdentifier
      const datasetParam = options?.datasetId || datasetIdentifier

      const apiPath = shouldUseDbAPI
        ? `/databases/${dbIdentifier}/tables/${tableId}/aggregations`
        : `/datasets/${identifier}/tables/${tableId}/aggregations`
      if (shouldUseDbAPI && datasetParam) {
        params.datasetId = datasetParam
      }

      const response = await api.get(apiPath, { params })
      setAggregations(prev => ({ ...prev, [tableName]: response.data.aggregations }))
      if (options?.storeBaseline) {
        setBaselineAggregations(prev => ({ ...prev, [tableName]: response.data.aggregations }))
      }
    } catch (error) {
      console.error('Failed to load table aggregations:', error)
    }
  }

  const loadColumnMetadata = async (
    tableId: string,
    tableName: string,
    options?: { useDbAPI?: boolean; dbName?: string; datasetId?: string }
  ) => {
    try {
      // Use provided values or fall back to computed values
      const shouldUseDbAPI = options?.useDbAPI !== undefined ? options.useDbAPI : usesDatabaseAPI
      const dbIdentifier = options?.dbName || databaseIdentifier
      const datasetParam = options?.datasetId || datasetIdentifier

      const apiPath = shouldUseDbAPI
        ? `/databases/${dbIdentifier}/tables/${tableId}/columns`
        : `/datasets/${identifier}/tables/${tableId}/columns`
      const response = await api.get(apiPath, {
        params: shouldUseDbAPI && datasetParam ? { datasetId: datasetParam } : undefined
      })
      setColumnMetadata(prev => ({ ...prev, [tableName]: response.data.columns }))
    } catch (error) {
      console.error('Failed to load column metadata:', error)
    }
  }

  const getBaselineAggregation = (tableName: string, columnName: string): ColumnAggregation | undefined => {
    const tableAggregations = baselineAggregations[tableName]
    if (!tableAggregations) return undefined
    return tableAggregations.find(agg => agg.column_name === columnName)
  }

  const getAggregation = (tableName: string, columnName: string): ColumnAggregation | undefined => {
    const tableAggregations = aggregations[tableName]
    if (!tableAggregations) return undefined
    return tableAggregations.find(agg => agg.column_name === columnName)
  }

  const getColumnMetadata = (tableName: string, columnName: string): ColumnMetadata | undefined => {
    const metadata = columnMetadata[tableName]
    if (!metadata) return undefined
    return metadata.find(col => col.column_name === columnName)
  }

  const getDisplayTitle = (tableName: string, columnName: string): string => {
    const metadata = getColumnMetadata(tableName, columnName)
    return metadata?.display_name || columnName.replace(/_/g, ' ')
  }

  const normalizeFilterValue = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return ''
    return String(value)
  }

  const formatRangeValue = (value: number): string => {
    if (!Number.isFinite(value)) return '–'
    if (Number.isInteger(value)) return value.toString()
    return value.toFixed(2)
  }

const rangeKey = (tableName: string, columnName: string) => `${tableName}.${columnName}`

const rangesEqual = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  Math.abs(a.start - b.start) < 1e-9 && Math.abs(a.end - b.end) < 1e-9

const getFilterColumn = (filter: Filter): string | undefined => {
  if (filter.column) return filter.column
  if (filter.or && Array.isArray(filter.or) && filter.or.length > 0) {
    const child = filter.or[0] as Filter
    return getFilterColumn(child)
  }
  if (filter.and && Array.isArray(filter.and) && filter.and.length > 0) {
    const child = filter.and[0] as Filter
    return getFilterColumn(child)
  }
  if (filter.not) {
    return getFilterColumn(filter.not)
  }
  return undefined
}

const getFilterTableName = (filter: Filter): string | undefined => (filter as any).tableName

  // Helper: Get all effective filters (direct + propagated) for all tables
  const getAllEffectiveFilters = (): Record<string, { direct: Filter[]; propagated: Filter[] }> => {
    if (!dataset) return {}

    const result: Record<string, { direct: Filter[]; propagated: Filter[] }> = {}

    // Initialize all tables
    for (const table of dataset.tables) {
      result[table.name] = { direct: [], propagated: [] }
    }

    // Group filters by their tableName property
    for (const filter of filters) {
      const filterTableName = getFilterTableName(filter)
      if (!filterTableName) continue

      // This filter belongs to filterTableName
      // It's "direct" for that table, "propagated" for other tables with relationships
      for (const table of dataset.tables) {
        if (table.name === filterTableName) {
          // Direct filter
          result[table.name].direct.push(filter)
        } else {
          // Check if there's a relationship between these tables
          const hasRelationship =
            table.relationships?.some(r => r.referenced_table === filterTableName) || // table references filterTable
            dataset.tables.find(t => t.name === filterTableName)?.relationships?.some(r => r.referenced_table === table.name) // filterTable references table

          if (hasRelationship) {
            // This is a propagated filter for this table
            result[table.name].propagated.push(filter)
          }
        }
      }
    }

    return result
  }

const filterContainsColumn = (filter: Filter, column: string): boolean => {
  if (filter.column === column) return true
  if (filter.or && Array.isArray(filter.or)) {
    return filter.or.some(child => filterContainsColumn(child, column))
  }
    if (filter.and && Array.isArray(filter.and)) {
      return filter.and.some(child => filterContainsColumn(child, column))
    }
    if (filter.not) {
      return filterContainsColumn(filter.not, column)
    }
    return false
  }

  const hasColumnFilter = (column: string): boolean => filters.some(f => filterContainsColumn(f, column))

  const removeColumnFilters = (prev: Filter[], column: string): Filter[] =>
    prev.filter(filter => {
      if (filter.column === column) return false
      if (filter.or && Array.isArray(filter.or)) {
        return !filter.or.every(child => filterContainsColumn(child, column))
      }
      return true
    })

  const clearColumnFilter = (tableName: string, columnName: string) => {
    setFilters(prev => removeColumnFilters(prev, columnName))
    const key = rangeKey(tableName, columnName)
    setCustomRangeInputs(prev => {
      if (!(key in prev)) return prev
      const { [key]: _removed, ...rest } = prev
      return rest
    })
    setRangeSelections(prev => {
      if (!(key in prev)) return prev
      const { [key]: _removed, ...rest } = prev
      return rest
    })
  }

  const updateColumnRanges = (
    tableName: string,
    columnName: string,
    updater: (ranges: Array<{ start: number; end: number }>) => Array<{ start: number; end: number }>
  ) => {
    const key = rangeKey(tableName, columnName)
    let nextRanges: Array<{ start: number; end: number }> = []
    setRangeSelections(prev => {
      const prevRanges = prev[key] ?? []
      nextRanges = updater(prevRanges)
      nextRanges = nextRanges
        .slice()
        .sort((a, b) => (a.start - b.start) || (a.end - b.end))
      const unchanged = prevRanges.length === nextRanges.length && prevRanges.every((range, idx) => rangesEqual(range, nextRanges[idx]))
      if (unchanged) {
        nextRanges = prevRanges
        return prev
      }
      const updated = { ...prev }
      if (nextRanges.length === 0) {
        delete updated[key]
      } else {
        updated[key] = nextRanges
      }
      return updated
    })

    setFilters(prev => {
      const without = removeColumnFilters(prev, columnName)
      if (nextRanges.length === 0) return without
      if (nextRanges.length === 1) {
        const range = nextRanges[0]
        return [...without, { column: columnName, operator: 'between', value: [range.start, range.end], tableName } as unknown as Filter]
      }
      const orFilters = nextRanges.map(range => ({ column: columnName, operator: 'between', value: [range.start, range.end] }))
      return [...without, { column: columnName, or: orFilters, tableName } as unknown as Filter]
    })
  }

  const renderFilterMenu = (
    tableName: string,
    columnName: string,
    categories?: CategoryCount[]
  ) => {
    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === columnName
    if (!menuOpen || !categories || categories.length === 0) return null

    const columnHasFilter = hasColumnFilter(columnName)

    return (
      <div
        style={{
          position: 'absolute',
          top: '28px',
          right: 0,
          zIndex: 10,
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          padding: '0.5rem',
          maxHeight: '200px',
          overflowY: 'auto',
          minWidth: '140px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem'
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={() => clearColumnFilter(tableName, columnName)}
          style={{
            border: 'none',
            background: columnHasFilter ? '#1976D2' : '#eee',
            color: columnHasFilter ? 'white' : '#555',
            borderRadius: '4px',
            padding: '0.25rem 0.5rem',
            fontSize: '0.7rem',
            cursor: columnHasFilter ? 'pointer' : 'default',
            opacity: columnHasFilter ? 1 : 0.6
          }}
          disabled={!columnHasFilter}
        >
          Reset
        </button>
        <div style={{ borderBottom: '1px solid #eee', margin: '0.25rem 0' }} />
        {categories.map(category => {
          const rawValue = normalizeFilterValue(category.value)
          const label = category.display_value ?? (category.value === '' ? '(Empty)' : String(category.value))
          const active = isValueFiltered(columnName, rawValue)

          return (
            <button
              key={`${tableName}-${columnName}-${label}`}
              onMouseDown={event => event.preventDefault()}
              onClick={() => toggleFilter(columnName, rawValue, tableName)}
              style={{
                border: active ? '1px solid #1976D2' : '1px solid #ccc',
                background: active ? '#E3F2FD' : '#fafafa',
                color: active ? '#0D47A1' : '#444',
                borderRadius: '999px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.7rem',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              title={`${label} (${category.count} rows)`}
            >
              {label}
            </button>
          )
        })}
      </div>
    )
  }

  useEffect(() => {
    if (!activeFilterMenu) return
    const { tableName, columnName } = activeFilterMenu
    const key = rangeKey(tableName, columnName)
    const baselineAgg = getBaselineAggregation(tableName, columnName)
    if (!baselineAgg || baselineAgg.display_type !== 'numeric') return
    const stats = baselineAgg.numeric_stats
    if (!stats) return

    const defaultMin = stats.min !== null ? String(stats.min) : ''
    const defaultMax = stats.max !== null ? String(stats.max) : ''

    const selectedRanges = rangeSelections[key] ?? []
    const singleRange = selectedRanges.length === 1 ? selectedRanges[0] : null

    const nextMin = singleRange ? String(singleRange.start) : defaultMin
    const nextMax = singleRange ? String(singleRange.end) : defaultMax

    setCustomRangeInputs(prev => {
      const current = prev[key]
      if (current && current.min === nextMin && current.max === nextMax) {
        return prev
      }
      return { ...prev, [key]: { min: nextMin, max: nextMax } }
    })
  }, [activeFilterMenu, baselineAggregations, rangeSelections])

  const handleCustomRangeChange = (
    key: string,
    field: 'min' | 'max',
    value: string
  ) => {
    setCustomRangeInputs(prev => ({
      ...prev,
      [key]: {
        min: field === 'min' ? value : prev[key]?.min ?? '',
        max: field === 'max' ? value : prev[key]?.max ?? ''
      }
    }))
  }

  const applyCustomRange = (tableName: string, columnName: string) => {
    const key = `${tableName}.${columnName}`
    const range = customRangeInputs[key]
    if (!range) return

    const min = range.min.trim()
    const max = range.max.trim()
    if (min === '' || max === '') return

    const minValue = Number(min)
    const maxValue = Number(max)
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || minValue > maxValue) {
      return
    }

    setCustomRangeInputs(prev => ({
      ...prev,
      [key]: { min: String(minValue), max: String(maxValue) }
    }))

    updateColumnRanges(tableName, columnName, prevRanges => {
      const nextRange = { start: minValue, end: maxValue }
      const existingIndex = prevRanges.findIndex(range => rangesEqual(range, nextRange))
      if (existingIndex >= 0) return prevRanges
      return [...prevRanges, nextRange]
    })
  }

  const getNiceBinWidth = (range: number, desiredBins: number): number => {
    if (!Number.isFinite(range) || range <= 0) {
      return 1
    }

    const target = range / Math.max(desiredBins, 1)
    if (!Number.isFinite(target) || target <= 0) {
      return range
    }

    const exponent = Math.floor(Math.log10(target))
    const scaled = target / Math.pow(10, exponent)

    let niceScaled: number
    if (scaled <= 1) {
      niceScaled = 1
    } else if (scaled <= 2) {
      niceScaled = 2
    } else if (scaled <= 5) {
      niceScaled = 5
    } else {
      niceScaled = 10
    }

    return niceScaled * Math.pow(10, exponent)
  }

  const getDisplayHistogram = (
    histogram: HistogramBin[] | undefined,
    stats: NumericStats | undefined
  ): HistogramBin[] => {
    if (!histogram || histogram.length === 0) return []
    if (!stats || stats.min === null || stats.max === null) return histogram

    const min = stats.min
    const max = stats.max
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return histogram

    const totalCount = histogram.reduce((sum, bin) => sum + bin.count, 0)
    if (!Number.isFinite(totalCount) || totalCount === 0) return histogram

    const range = max - min
    const desiredBins = Math.min(Math.max(histogram.length, 1), 60)
    let width = getNiceBinWidth(range, desiredBins)
    if (!Number.isFinite(width) || width <= 0) {
      width = range || 1
    }

    let guard = 0
    while (range / width > 60 && guard < 10) {
      const nextApprox = Math.ceil(range / width / 2)
      width = getNiceBinWidth(range, Math.max(nextApprox, 1))
      if (!Number.isFinite(width) || width <= 0) {
        width = range || 1
        break
      }
      guard += 1
    }

    const start = Math.floor(min / width) * width
    const bucketCount = Math.max(1, Math.ceil((max - start) / width) + 1)
    const buckets: HistogramBin[] = []
    for (let i = 0; i < bucketCount; i++) {
      buckets.push({
        bin_start: start + i * width,
        bin_end: start + (i + 1) * width,
        count: 0,
        percentage: 0
      })
    }

    histogram.forEach(bin => {
      const center = (bin.bin_start + bin.bin_end) / 2
      let index = Math.floor((center - start) / width)
      if (index < 0) index = 0
      if (index >= buckets.length) index = buckets.length - 1
      buckets[index].count += bin.count
    })

    buckets.forEach(bucket => {
      bucket.percentage = bucket.count / totalCount * 100
    })

    const filtered = buckets.filter(bucket => bucket.count > 0)
    return filtered.length > 0 ? filtered : histogram
  }

const renderNumericFilterMenu = (
    tableName: string,
    columnName: string,
    histogram?: HistogramBin[],
    stats?: NumericStats
  ) => {
    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === columnName
    if (!menuOpen) return null

    const bins = histogram ?? []
    const key = `${tableName}.${columnName}`
    const range = customRangeInputs[key] || { min: stats && stats.min !== null ? String(stats.min) : '', max: stats && stats.max !== null ? String(stats.max) : '' }
    const columnHasFilter = hasColumnFilter(columnName)
    const selectedRanges = rangeSelections[key] ?? []
    const customRanges = selectedRanges.filter(range => !bins.some(bin => rangesEqual(range, { start: bin.bin_start, end: bin.bin_end })))
    const minDisplay = stats && stats.min !== null ? formatRangeValue(stats.min) : '–'
    const maxDisplay = stats && stats.max !== null ? formatRangeValue(stats.max) : '–'
    const medianDisplay = stats && stats.median !== null ? formatRangeValue(stats.median) : '–'
    const stdDisplay = stats && stats.stddev !== undefined && stats.stddev !== null ? stats.stddev.toFixed(2) : '–'

    const minValue = Number(range.min)
    const maxValue = Number(range.max)
    const hasValidRange =
      range.min.trim() !== '' &&
      range.max.trim() !== '' &&
      Number.isFinite(minValue) &&
      Number.isFinite(maxValue) &&
      minValue <= maxValue

    return (
      <div
        style={{
          position: 'absolute',
          top: '28px',
          right: 0,
          zIndex: 10,
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          padding: '0.5rem',
          maxHeight: '260px',
          overflowY: 'auto',
          minWidth: '180px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem'
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {stats && (
          <>
            <div style={{ fontSize: '0.7rem', color: '#555', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>Min: {minDisplay}</span>
              <span>Max: {maxDisplay}</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#555', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>Median: {medianDisplay}</span>
              <span>Std: {stdDisplay}</span>
            </div>
          </>
        )}
        {(() => {
          const baselineAgg = getBaselineAggregation(tableName, columnName)
          const nullCount = baselineAgg?.null_count ?? 0
          if (nullCount === 0) return null

          const nullActive = isValueFiltered(columnName, '')
          return (
            <>
              <div style={{ borderBottom: '1px solid #eee', margin: '0.25rem 0' }} />
              <button
                onMouseDown={event => event.preventDefault()}
                onClick={() => toggleFilter(columnName, '', tableName)}
                style={{
                  border: nullActive ? '1px solid #1976D2' : '1px solid #ccc',
                  background: nullActive ? '#E3F2FD' : '#fafafa',
                  color: nullActive ? '#0D47A1' : '#444',
                  borderRadius: '999px',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                title={`Null values (${nullCount} rows)`}
              >
                (Null) — {nullCount} rows
              </button>
            </>
          )
        })()}
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => clearColumnFilter(tableName, columnName)}
            style={{
              border: 'none',
              background: columnHasFilter ? '#1976D2' : '#eee',
              color: columnHasFilter ? 'white' : '#555',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.7rem',
              cursor: columnHasFilter ? 'pointer' : 'default',
              opacity: columnHasFilter ? 1 : 0.6
            }}
            disabled={!columnHasFilter}
          >
            Reset
          </button>
        </div>
        {bins.length > 0 && (
          <div style={{ borderTop: '1px solid #eee', paddingTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {bins.map((bin, index) => {
              const active = isRangeFiltered(tableName, columnName, bin.bin_start, bin.bin_end)
              const label = `${formatRangeValue(bin.bin_start)} – ${formatRangeValue(bin.bin_end)}`
              return (
                <button
                  key={`${tableName}-${columnName}-bin-${index}`}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => toggleRangeFilter(tableName, columnName, bin.bin_start, bin.bin_end)}
                  style={{
                    border: active ? '1px solid #1976D2' : '1px solid #ccc',
                    background: active ? '#E3F2FD' : '#fafafa',
                    color: active ? '#0D47A1' : '#444',
                    borderRadius: '999px',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.7rem',
                    cursor: 'pointer'
                  }}
                  title={`${label} (${bin.count} rows)`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
        {customRanges.length > 0 && (
          <div style={{ borderTop: '1px solid #eee', paddingTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {customRanges.map((range, index) => {
              const label = `${formatRangeValue(range.start)} – ${formatRangeValue(range.end)}`
              return (
                <button
                  key={`${tableName}-${columnName}-custom-${index}`}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => updateColumnRanges(tableName, columnName, prev => prev.filter(r => !rangesEqual(r, range)))}
                  style={{
                    border: '1px solid #1976D2',
                    background: '#E3F2FD',
                    color: '#0D47A1',
                    borderRadius: '999px',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.7rem',
                    cursor: 'pointer'
                  }}
                  title={`Remove ${label}`}
                >
                  {label} ×
                </button>
              )
            })}
          </div>
        )}
        <div style={{ borderTop: '1px solid #eee', paddingTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.7rem', color: '#555', flex: 1 }}>
              From
              <input
                type="number"
                value={range.min}
                onChange={(event) => handleCustomRangeChange(key, 'min', event.target.value)}
                placeholder={stats?.min !== null && stats?.min !== undefined ? String(stats.min) : ''}
                style={{ width: '100%', padding: '0.2rem 0.3rem', marginTop: '0.15rem' }}
              />
            </label>
            <label style={{ fontSize: '0.7rem', color: '#555', flex: 1 }}>
              To
              <input
                type="number"
                value={range.max}
                onChange={(event) => handleCustomRangeChange(key, 'max', event.target.value)}
                placeholder={stats?.max !== null && stats?.max !== undefined ? String(stats.max) : ''}
                style={{ width: '100%', padding: '0.2rem 0.3rem', marginTop: '0.15rem' }}
              />
            </label>
          </div>
          <button
            onClick={() => applyCustomRange(tableName, columnName)}
            style={{
              border: 'none',
              background: hasValidRange ? '#1976D2' : '#ccc',
              color: 'white',
              borderRadius: '4px',
              padding: '0.3rem 0.5rem',
              fontSize: '0.75rem',
              cursor: hasValidRange ? 'pointer' : 'default'
            }}
            disabled={!hasValidRange}
          >
            Apply
          </button>
        </div>
      </div>
    )
  }

  const toggleFilter = (column: string, value: string | number, tableName?: string) => {
    const filterValue = normalizeFilterValue(value)

    setFilters(prevFilters => {
      const nextFilters = [...prevFilters]
      const existingIndex = nextFilters.findIndex(f => f.column === column)

      if (existingIndex === -1) {
        const newFilter: any = { column, operator: 'eq', value: filterValue }
        if (tableName) newFilter.tableName = tableName
        nextFilters.push(newFilter)
        return nextFilters
      }

      const existing = nextFilters[existingIndex]

      if (existing.operator === 'eq') {
        const existingValue = normalizeFilterValue(existing.value as string | number)
        if (existingValue === filterValue) {
          nextFilters.splice(existingIndex, 1)
          return nextFilters
        }

        const updatedFilter: any = {
          column,
          operator: 'in',
          value: [existingValue, filterValue]
        }
        if (tableName) updatedFilter.tableName = tableName
        nextFilters[existingIndex] = updatedFilter
        return nextFilters
      }

      if (existing.operator === 'in') {
        const values = Array.isArray(existing.value)
          ? existing.value.map(v => normalizeFilterValue(v as string | number))
          : []
        const matchIndex = values.findIndex(v => v === filterValue)

        if (matchIndex >= 0) {
          values.splice(matchIndex, 1)
        } else {
          values.push(filterValue)
        }

        if (values.length === 0) {
          nextFilters.splice(existingIndex, 1)
        } else if (values.length === 1) {
          const updatedFilter: any = { column, operator: 'eq', value: values[0] }
          if (tableName) updatedFilter.tableName = tableName
          nextFilters[existingIndex] = updatedFilter
        } else {
          const updatedFilter: any = { column, operator: 'in', value: values }
          if (tableName) updatedFilter.tableName = tableName
          nextFilters[existingIndex] = updatedFilter
        }

        return nextFilters
      }

      const updatedFilter: any = { column, operator: 'eq', value: filterValue }
      if (tableName) updatedFilter.tableName = tableName
      nextFilters[existingIndex] = updatedFilter
      return nextFilters
    })
  }

  const clearFilters = () => {
    setFilters([])
    setCustomRangeInputs({})
    setRangeSelections({})
  }

  const isValueFiltered = (column: string, value: string | number): boolean => {
    const compareValue = normalizeFilterValue(value)
    return filters.some(f => {
      if (f.column !== column) return false
      if (f.operator === 'eq') {
        return normalizeFilterValue(f.value as string | number) === compareValue
      }
      if (f.operator === 'in' && Array.isArray(f.value)) {
        return f.value
          .map(v => normalizeFilterValue(v as string | number))
          .includes(compareValue)
      }
      return false
    })
  }

  const toggleRangeFilter = (tableName: string, column: string, binStart: number, binEnd: number) => {
    const range = { start: binStart, end: binEnd }
    updateColumnRanges(tableName, column, prevRanges => {
      const existingIndex = prevRanges.findIndex(r => rangesEqual(r, range))
      if (existingIndex >= 0) {
        return [...prevRanges.slice(0, existingIndex), ...prevRanges.slice(existingIndex + 1)]
      }
      return [...prevRanges, range]
    })
  }

  const isRangeFiltered = (tableName: string, column: string, binStart: number, binEnd: number): boolean => {
    const key = rangeKey(tableName, column)
    const ranges = rangeSelections[key] ?? []
    return ranges.some(range => rangesEqual(range, { start: binStart, end: binEnd }))
  }

  const getTableColor = (tableName: string): string => {
    // Generate a consistent color for each table using a simple hash
    const hash = tableName.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0)
    const colors = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#FFC107', '#E91E63']
    return colors[Math.abs(hash) % colors.length]
  }

  const renderPieChart = (title: string, tableName: string, field: string, tableColor?: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.categories || aggregation.categories.length === 0) return null

    const labels = aggregation.categories.map(c => c.display_value ?? (c.value === '' ? '(Empty)' : String(c.value)))
    const values = aggregation.categories.map(c => c.count)
    const filterValues = aggregation.categories.map(c => normalizeFilterValue(c.value))

    const metadata = getColumnMetadata(tableName, field)

    const tooltipText = [
      metadata?.display_name || title,
      `ID: ${field}`,
      metadata?.description || ''
    ].filter(Boolean).join('\n')

    const baselineAggregation = getBaselineAggregation(tableName, field)
    const baselineCategories = baselineAggregation?.categories

    const categoriesForMenu = baselineCategories && baselineCategories.length > 0
      ? baselineCategories
      : aggregation.categories

    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === field
    const columnActive = hasColumnFilter(field)

    return (
      <div style={{
        position: 'relative',
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '175px',
        minHeight: '175px',
        boxSizing: 'border-box',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        border: tableColor ? `2px solid ${tableColor}20` : undefined
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
          <h4
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'help',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexGrow: 1
            }}
            title={tooltipText}
          >
            {metadata?.display_name || title}
          </h4>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setActiveFilterMenu(prev =>
                prev && prev.tableName === tableName && prev.columnName === field
                  ? null
                  : { tableName, columnName: field }
              )
            }}
            style={{
              border: 'none',
              background: menuOpen || columnActive ? '#1976D2' : '#f0f0f0',
              color: menuOpen || columnActive ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title="Filter values"
          >
            ⚲
          </button>
        </div>
        <Plot
          data={[{
            type: 'pie',
            labels,
            values,
            textinfo: 'label+percent',
            textposition: 'inside',
            insidetextorientation: 'radial',
            marker: {
              colors: filterValues.map(value =>
                isValueFiltered(field, value) ? '#1976D2' : undefined
              ),
              line: {
                color: filterValues.map(value =>
                  isValueFiltered(field, value) ? '#000' : undefined
                ),
                width: filterValues.map(value =>
                  isValueFiltered(field, value) ? 2 : 0
                )
              }
            },
            textfont: { size: 9 },
            hovertemplate: '%{label}<br>Count: %{value}<br>%{percent}<extra></extra>'
          }]}
          layout={{
            height: 135,
            margin: { t: 5, b: 5, l: 5, r: 5 },
            showlegend: false,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            dragmode: false
          }}
          config={{
            displayModeBar: false,
            responsive: true,
            staticPlot: false
          }}
          style={{ width: '165px', height: '135px', cursor: 'pointer' }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0]
            if (!point) return

            const index = point.pointNumber ?? point.pointIndex
            if (typeof index === 'number' && index >= 0 && index < filterValues.length) {
              const clickedValue = filterValues[index]
              toggleFilter(field, clickedValue, tableName)
            }
          }}
        />
        {renderFilterMenu(tableName, field, categoriesForMenu)}
      </div>
    )
  }

  const renderBarChart = (title: string, tableName: string, field: string, tableColor?: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.categories || aggregation.categories.length === 0) return null

    const labels = aggregation.categories.map(c => c.display_value ?? (c.value === '' ? '(Empty)' : String(c.value)))
    const values = aggregation.categories.map(c => c.count)
    const filterValues = aggregation.categories.map(c => normalizeFilterValue(c.value))

    const metadata = getColumnMetadata(tableName, field)

    const tooltipText = [
      metadata?.display_name || title,
      `ID: ${field}`,
      metadata?.description || ''
    ].filter(Boolean).join('\n')

    const baselineAggregation = getBaselineAggregation(tableName, field)
    const categoriesForMenu = baselineAggregation?.categories || aggregation.categories
    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === field
    const columnActive = hasColumnFilter(field)

    return (
      <div style={{
        position: 'relative',
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '358px',
        minHeight: '175px',
        boxSizing: 'border-box',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        border: tableColor ? `2px solid ${tableColor}20` : undefined
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
          <h4
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'help',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexGrow: 1
            }}
            title={tooltipText}
          >
            {metadata?.display_name || title}
          </h4>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setActiveFilterMenu(prev =>
                prev && prev.tableName === tableName && prev.columnName === field
                  ? null
                  : { tableName, columnName: field }
              )
            }}
            style={{
              border: 'none',
              background: menuOpen || columnActive ? '#1976D2' : '#f0f0f0',
              color: menuOpen || columnActive ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title="Filter values"
          >
            ⚲
          </button>
        </div>
        <Plot
          data={[{
            type: 'bar',
            x: labels,
            y: values,
            marker: {
              color: filterValues.map(value =>
                isValueFiltered(field, value) ? '#1976D2' : '#2196F3'
              ),
              line: {
                color: filterValues.map(value =>
                  isValueFiltered(field, value) ? '#000' : undefined
                ),
                width: filterValues.map(value =>
                  isValueFiltered(field, value) ? 2 : 0
                )
              }
            },
            hovertemplate: '%{x}<br>Count: %{y}<extra></extra>'
          }]}
          layout={{
            height: 135,
            margin: { t: 5, b: 40, l: 30, r: 5 },
            xaxis: { tickangle: -45, automargin: true, tickfont: { size: 9 } },
            yaxis: { title: 'Count', automargin: true, tickfont: { size: 9 }, titlefont: { size: 10 } },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            dragmode: 'select',
            selectdirection: 'h'
          }}
          config={{
            displayModeBar: false,
            responsive: true,
            staticPlot: false,
            scrollZoom: false
          }}
          style={{ width: '348px', height: '135px', cursor: 'pointer' }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0]
            if (!point) return

            const pointIndex = point.pointIndex
            if (typeof pointIndex === 'number' && pointIndex >= 0 && pointIndex < filterValues.length) {
              const clickedValue = filterValues[pointIndex]
              toggleFilter(field, clickedValue, tableName)
            }
          }}
          onSelected={(event: PlotSelectionEvent) => {
            if (!event?.points || event.points.length === 0) return
            const selectedValues = event.points
              .map(p => p.pointIndex)
              .filter((idx): idx is number => typeof idx === 'number' && idx >= 0 && idx < filterValues.length)
              .map(idx => filterValues[idx])

            if (selectedValues.length > 0) {
              setFilters(prev => [
                ...prev.filter(f => f.column !== field),
                { column: field, operator: 'in', value: selectedValues, tableName } as any
              ])
            }
          }}
        />
        {renderFilterMenu(tableName, field, categoriesForMenu)}
      </div>
    )
  }

  const renderHistogram = (title: string, tableName: string, field: string, tableColor?: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.numeric_stats) return null

    const rawHistogram = aggregation.histogram ?? []
    if (rawHistogram.length === 0) return null

    const metadata = getColumnMetadata(tableName, field)

    const statsText = [
      `Mean: ${aggregation.numeric_stats.mean !== null ? aggregation.numeric_stats.mean.toFixed(2) : 'N/A'}`,
      `Median: ${aggregation.numeric_stats.median !== null ? aggregation.numeric_stats.median.toFixed(2) : 'N/A'}`,
      `Range: [${aggregation.numeric_stats.min !== null ? aggregation.numeric_stats.min.toFixed(2) : 'N/A'}, ${aggregation.numeric_stats.max !== null ? aggregation.numeric_stats.max.toFixed(2) : 'N/A'}]`
    ].join(' | ')

    const tooltipText = [
      metadata?.display_name || title,
      `ID: ${field}`,
      metadata?.description || '',
      '',
      statsText
    ].filter(Boolean).join('\n')

    const baselineAggregation = getBaselineAggregation(tableName, field)
    const menuHistogram = baselineAggregation?.histogram ?? rawHistogram
    const menuStats = baselineAggregation?.numeric_stats || aggregation.numeric_stats
    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === field
    const columnActive = hasColumnFilter(field)

    const displayHistogram = getDisplayHistogram(menuHistogram, menuStats)
    const binsForPlot = displayHistogram.length > 0 ? displayHistogram : menuHistogram

    // Convert histogram bins to bar chart data
    // Use baseline bins for x-axis, but filtered counts for y-axis
    const xValues = binsForPlot.map(bin => (bin.bin_start + bin.bin_end) / 2)

    // Map filtered counts to baseline bins by checking overlap
    // Since filtered bins have different boundaries, we need to accumulate counts
    // for filtered bins that overlap with each baseline bin
    const yValues = binsForPlot.map(baselineBin => {
      let totalCount = 0

      // Sum up counts from all filtered bins that overlap with this baseline bin
      rawHistogram.forEach(filteredBin => {
        // Check if there's any overlap between baseline and filtered bin
        const overlapStart = Math.max(baselineBin.bin_start, filteredBin.bin_start)
        const overlapEnd = Math.min(baselineBin.bin_end, filteredBin.bin_end)

        if (overlapStart < overlapEnd) {
          // There's overlap - calculate what fraction of the filtered bin overlaps
          const filteredBinWidth = filteredBin.bin_end - filteredBin.bin_start
          const overlapWidth = overlapEnd - overlapStart
          const overlapFraction = overlapWidth / filteredBinWidth

          // Add proportional count
          totalCount += filteredBin.count * overlapFraction
        }
      })

      return Math.round(totalCount)
    })

    const binWidth = binsForPlot[0] ? binsForPlot[0].bin_end - binsForPlot[0].bin_start : 1

    return (
      <div style={{
        position: 'relative',
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '358px',
        minHeight: '175px',
        boxSizing: 'border-box',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        border: tableColor ? `2px solid ${tableColor}20` : undefined
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
          <h4
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'help',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexGrow: 1
            }}
            title={tooltipText}
          >
            {metadata?.display_name || title}
          </h4>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setActiveFilterMenu(prev =>
                prev && prev.tableName === tableName && prev.columnName === field
                  ? null
                  : { tableName, columnName: field }
              )
            }}
            style={{
              border: 'none',
              background: menuOpen || columnActive ? '#1976D2' : '#f0f0f0',
              color: menuOpen || columnActive ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title="Filter values"
          >
            ⚲
          </button>
        </div>
        <Plot
          data={[{
            type: 'bar',
            x: xValues,
            y: yValues,
            width: binWidth * 0.9,
            marker: {
              color: binsForPlot.map(bin =>
                isRangeFiltered(tableName, field, bin.bin_start, bin.bin_end) ? '#2E7D32' : '#4CAF50'
              ),
              line: {
                color: binsForPlot.map(bin =>
                  isRangeFiltered(tableName, field, bin.bin_start, bin.bin_end) ? '#000' : undefined
                ),
                width: binsForPlot.map(bin =>
                  isRangeFiltered(tableName, field, bin.bin_start, bin.bin_end) ? 2 : 0
                )
              }
            },
            hovertemplate: 'Range: [%{customdata[0]:.2f}, %{customdata[1]:.2f}]<br>Count: %{y}<extra></extra>',
            customdata: binsForPlot.map(bin => [bin.bin_start, bin.bin_end])
          }]}
          layout={{
            height: 135,
            margin: { t: 5, b: 30, l: 30, r: 5 },
            xaxis: { title: field, automargin: true, tickfont: { size: 9 }, titlefont: { size: 10 } },
            yaxis: { title: 'Count', automargin: true, tickfont: { size: 9 }, titlefont: { size: 10 } },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            bargap: 0.1,
            dragmode: 'select',
            selectdirection: 'h'
          }}
          config={{
            displayModeBar: false,
            responsive: true,
            staticPlot: false,
            scrollZoom: false
          }}
          style={{ width: '348px', height: '135px', cursor: 'pointer' }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0]
            if (!point) return

            const pointIndex = point.pointIndex
            if (typeof pointIndex === 'number' && pointIndex >= 0 && pointIndex < binsForPlot.length) {
              const bin = binsForPlot[pointIndex]
              toggleRangeFilter(tableName, field, bin.bin_start, bin.bin_end)
            }
          }}
          onSelected={(event: PlotSelectionEvent) => {
            const rangeX = event?.range?.x
            if (!rangeX || rangeX.length < 2) return

            const [minX, maxX] = rangeX
            updateColumnRanges(tableName, field, prev => {
              const nextRange = { start: minX, end: maxX }
              const existingIndex = prev.findIndex(range => rangesEqual(range, nextRange))
              if (existingIndex >= 0) return prev
              return [...prev, nextRange]
            })
          }}
        />
        {renderNumericFilterMenu(tableName, field, displayHistogram, menuStats)}
      </div>
    )
  }


  if (loading) return <p>Loading explorer...</p>
  if (!dataset) return <p>Dataset not found</p>

  // Get total row count from aggregations
  const totalRecords = Object.values(aggregations)
    .flat()
    .reduce((sum, agg) => Math.max(sum, agg.total_rows), 0)

  return (
    <div>
      {/* Active Filters */}
      {filters.length > 0 && (
        <div style={{
          marginBottom: '1rem',
          background: '#E3F2FD',
          padding: '1rem',
          borderRadius: '8px',
          border: '1px solid #2196F3'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.875rem' }}>Active Filters:</strong>
            <button
              onClick={clearFilters}
              style={{
                padding: '0.25rem 0.75rem',
                background: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
            >
              Clear All
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {filters.map((filter, idx) => {
              const columnName = getFilterColumn(filter)
              const tableName = getFilterTableName(filter)

              let displayValue = String(filter.value)
              let removeHandler = () => {
                if (tableName && columnName) {
                  clearColumnFilter(tableName, columnName)
                } else {
                  setFilters(filters.filter((_, i) => i !== idx))
                }
              }

              if (filter.operator === 'between' && Array.isArray(filter.value)) {
                displayValue = `[${typeof filter.value[0] === 'number' ? filter.value[0].toFixed(2) : filter.value[0]}, ${typeof filter.value[1] === 'number' ? filter.value[1].toFixed(2) : filter.value[1]}]`
              } else if (filter.operator === 'in' && Array.isArray(filter.value)) {
                const displayVals = filter.value.map(v => {
                  if (v === '') return '(Empty)'
                  if (v === ' ') return '(Space)'
                  return v
                })
                displayValue = `{${displayVals.slice(0, 3).join(', ')}${filter.value.length > 3 ? '...' : ''}}`
              } else if (filter.operator === 'eq') {
                if (filter.value === '') displayValue = '(Empty)'
                else if (filter.value === ' ') displayValue = '(Space)'
                else displayValue = String(filter.value)
              } else if (filter.or && Array.isArray(filter.or)) {
                const ranges = filter.or
                  .map(rangeFilter => rangeFilter as Filter)
                  .filter(rangeFilter => rangeFilter.column === filter.column && rangeFilter.operator === 'between' && Array.isArray(rangeFilter.value))
                  .map(rangeFilter => {
                    const [start, end] = rangeFilter.value
                    const startLabel = typeof start === 'number' ? formatRangeValue(start) : String(start)
                    const endLabel = typeof end === 'number' ? formatRangeValue(end) : String(end)
                    return `${startLabel} – ${endLabel}`
                  })

                displayValue = `(${ranges.join(' ∪ ')})`
              }
              const columnLabel = columnName ?? '(Column)'
              return (
                <div
                  key={idx}
                  style={{
                    background: 'white',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    border: '1px solid #2196F3'
                  }}
                >
                  <span><strong>{columnLabel}:</strong> {displayValue}</span>
                  <button
                    onClick={removeHandler}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#666',
                      cursor: 'pointer',
                      padding: '0',
                      fontSize: '1rem',
                      lineHeight: '1'
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '2rem', background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', position: 'relative' }}>
        <button
          onClick={() => navigate(`/datasets/${id}/manage`)}
          style={{
            position: 'absolute',
            top: '1.5rem',
            right: '1.5rem',
            padding: '0.5rem',
            background: '#757575',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1.2rem',
            lineHeight: '1',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Manage dataset"
        >
          ✎
        </button>

        <h2 style={{ marginTop: 0, paddingRight: '3rem' }}>{dataset.name}</h2>
        {dataset.description && (
          <SafeHtml
            html={dataset.description}
            style={{ color: '#666', margin: '0.5rem 0', display: 'block' }}
          />
        )}

        <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', fontSize: '0.875rem' }}>
          <div>
            <strong>Total Records:</strong> {totalRecords.toLocaleString()}
          </div>
          <div>
            <strong>Tables:</strong> {dataset.tables.length}
          </div>
        </div>
      </div>

      {/* Chart Grid - Grouped by Table */}
      {dataset.tables.map(table => {
        const tableAggregations = aggregations[table.name]
        if (!tableAggregations) return null

        // Sort aggregations by display priority (if available from metadata)
        const sortedAggregations = [...tableAggregations].sort((a, b) => {
          const metaA = getColumnMetadata(table.name, a.column_name)
          const metaB = getColumnMetadata(table.name, b.column_name)
          const priorityA = metaA?.display_priority || 0
          const priorityB = metaB?.display_priority || 0
          return priorityB - priorityA
        })

        // Filter out hidden columns
        const visibleAggregations = sortedAggregations.filter(agg => {
          const metadata = getColumnMetadata(table.name, agg.column_name)
          return !metadata?.is_hidden
        })

        if (visibleAggregations.length === 0) return null

        const tableColor = getTableColor(table.name)
        const tableRowCount = visibleAggregations[0]?.total_rows || table.rowCount || 0

        // Get filter counts for this table
        const effectiveFilters = getAllEffectiveFilters()
        const tableFilters = effectiveFilters[table.name] || { direct: [], propagated: [] }
        const directFilterCount = tableFilters.direct.length
        const propagatedFilterCount = tableFilters.propagated.length

        return (
          <div key={table.name} style={{ marginBottom: '2.5rem' }}>
            {/* Table Section Header */}
            <div style={{
              background: `linear-gradient(135deg, ${tableColor}15, ${tableColor}05)`,
              border: `2px solid ${tableColor}40`,
              borderRadius: '8px',
              padding: '0.75rem 1.25rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  background: tableColor,
                  color: 'white',
                  width: '8px',
                  height: '40px',
                  borderRadius: '4px'
                }} />
                <div>
                  <h3 style={{
                    margin: 0,
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    color: '#333'
                  }}>
                    {table.displayName || table.name}
                  </h3>
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#666',
                    marginTop: '0.2rem'
                  }}>
                    {tableRowCount.toLocaleString()} rows · {visibleAggregations.length} columns
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Filter badges */}
                {directFilterCount > 0 && (
                  <div
                    style={{
                      background: '#1976D2',
                      color: 'white',
                      fontSize: '0.7rem',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '4px',
                      fontWeight: 600
                    }}
                    title={`${directFilterCount} direct filter${directFilterCount > 1 ? 's' : ''} applied`}
                  >
                    {directFilterCount} filter{directFilterCount > 1 ? 's' : ''}
                  </div>
                )}
                {propagatedFilterCount > 0 && (
                  <div
                    style={{
                      background: '#64B5F6',
                      color: 'white',
                      fontSize: '0.7rem',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '4px',
                      fontWeight: 600,
                      fontStyle: 'italic'
                    }}
                    title={`${propagatedFilterCount} filter${propagatedFilterCount > 1 ? 's' : ''} propagated from related tables`}
                  >
                    +{propagatedFilterCount} linked
                  </div>
                )}
                <div style={{
                  background: tableColor,
                  color: 'white',
                  fontSize: '0.7rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '4px',
                  fontWeight: 600
                }}>
                  {table.name}
                </div>
              </div>
            </div>

            {/* Table Charts */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}>
              {visibleAggregations.map(agg => {
                const displayTitle = getDisplayTitle(table.name, agg.column_name)

                if (agg.display_type === 'categorical' && agg.categories) {
                  // Pie chart for low cardinality
                  if (agg.categories.length <= 8) {
                    return (
                      <div key={`${table.name}_${agg.column_name}`}>
                        {renderPieChart(displayTitle, table.name, agg.column_name, tableColor)}
                      </div>
                    )
                  }
                  // Bar chart for higher cardinality
                  else {
                    return (
                      <div key={`${table.name}_${agg.column_name}`}>
                        {renderBarChart(displayTitle, table.name, agg.column_name, tableColor)}
                      </div>
                    )
                  }
                } else if (agg.display_type === 'numeric' && agg.histogram) {
                  return (
                    <div key={`${table.name}_${agg.column_name}`}>
                      {renderHistogram(displayTitle, table.name, agg.column_name, tableColor)}
                    </div>
                  )
                }
                return null
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default DatasetExplorer
