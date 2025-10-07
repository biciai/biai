import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Plot from 'react-plotly.js'
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
  value: string | number
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

interface Table {
  id: string
  name: string
  displayName: string
  rowCount: number
  columns: Column[]
  primaryKey?: string
}

interface Dataset {
  id: string
  name: string
  description: string
  tags?: string[]
  tables: Table[]
}

function DatasetExplorer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [columnMetadata, setColumnMetadata] = useState<Record<string, ColumnMetadata[]>>({})
  const [aggregations, setAggregations] = useState<Record<string, ColumnAggregation[]>>({})
  const [filters, setFilters] = useState<Filter[]>([])


  useEffect(() => {
    loadDataset()
  }, [id])

  useEffect(() => {
    // Reload aggregations when filters change
    if (dataset) {
      reloadAggregations()
    }
  }, [filters])

  const reloadAggregations = async () => {
    if (!dataset) return
    for (const table of dataset.tables) {
      await loadTableAggregations(table.id, table.name)
    }
  }

  const loadDataset = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/datasets/${id}`)
      setDataset(response.data.dataset)

      // Load aggregations and column metadata for all tables
      for (const table of response.data.dataset.tables) {
        await loadTableAggregations(table.id, table.name)
        await loadColumnMetadata(table.id, table.name)
      }
    } catch (error) {
      console.error('Failed to load dataset:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTableAggregations = async (tableId: string, tableName: string) => {
    try {
      const params = filters.length > 0 ? { filters: JSON.stringify(filters) } : {}
      const response = await api.get(`/datasets/${id}/tables/${tableId}/aggregations`, { params })
      setAggregations(prev => ({ ...prev, [tableName]: response.data.aggregations }))
    } catch (error) {
      console.error('Failed to load table aggregations:', error)
    }
  }

  const loadColumnMetadata = async (tableId: string, tableName: string) => {
    try {
      const response = await api.get(`/datasets/${id}/tables/${tableId}/columns`)
      setColumnMetadata(prev => ({ ...prev, [tableName]: response.data.columns }))
    } catch (error) {
      console.error('Failed to load column metadata:', error)
    }
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

  const toggleFilter = (column: string, value: string | number) => {
    // Backend returns "N/A" for empty strings/nulls, convert back
    const filterValue = value === 'N/A' ? '' : value

    // Check if this exact filter exists
    const existingFilterIndex = filters.findIndex(
      f => f.column === column && f.operator === 'eq' && f.value === filterValue
    )

    if (existingFilterIndex >= 0) {
      // Remove the filter
      setFilters(filters.filter((_, i) => i !== existingFilterIndex))
    } else {
      // Add the filter
      setFilters([...filters, { column, operator: 'eq', value: filterValue }])
    }
  }

  const clearFilters = () => {
    setFilters([])
  }

  const isValueFiltered = (column: string, value: string | number): boolean => {
    // Backend returns "N/A" for empty strings/nulls
    const compareValue = value === 'N/A' ? '' : value
    return filters.some(f => f.column === column && f.operator === 'eq' && f.value === compareValue)
  }

  const toggleRangeFilter = (column: string, binStart: number, binEnd: number) => {
    // Check if this exact range filter exists
    const existingFilterIndex = filters.findIndex(
      f => f.column === column && f.operator === 'between' &&
           Array.isArray(f.value) && f.value[0] === binStart && f.value[1] === binEnd
    )

    if (existingFilterIndex >= 0) {
      // Remove the filter
      setFilters(filters.filter((_, i) => i !== existingFilterIndex))
    } else {
      // Add the filter
      setFilters([...filters, { column, operator: 'between', value: [binStart, binEnd] }])
    }
  }

  const isRangeFiltered = (column: string, binStart: number, binEnd: number): boolean => {
    return filters.some(
      f => f.column === column && f.operator === 'between' &&
           Array.isArray(f.value) && f.value[0] === binStart && f.value[1] === binEnd
    )
  }

  const renderPieChart = (title: string, tableName: string, field: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.categories || aggregation.categories.length === 0) return null

    const labels = aggregation.categories.map(c => String(c.value))
    const values = aggregation.categories.map(c => c.count)
    // Backend returns "N/A" for both empty strings and nulls
    // We'll convert N/A to empty string for filtering (more common case)
    const originalValues = aggregation.categories.map(c =>
      c.value === 'N/A' ? '' : c.value
    )

    const metadata = getColumnMetadata(tableName, field)

    const tooltipText = [
      metadata?.display_name || title,
      `ID: ${field}`,
      metadata?.description || ''
    ].filter(Boolean).join('\n')

    return (
      <div style={{
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '175px',
        height: '175px',
        boxSizing: 'border-box',
        flexShrink: 0
      }}>
        <h4
          style={{
            margin: '0 0 0.25rem 0',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'help',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            height: '1rem'
          }}
          title={tooltipText}
        >
          {metadata?.display_name || title}
        </h4>
        <Plot
          data={[{
            type: 'pie',
            labels,
            values,
            marker: {
              colors: originalValues.map(value =>
                isValueFiltered(field, value) ? '#1976D2' : undefined
              ),
              line: {
                color: originalValues.map(value =>
                  isValueFiltered(field, value) ? '#000' : undefined
                ),
                width: originalValues.map(value =>
                  isValueFiltered(field, value) ? 2 : 0
                )
              }
            },
            textinfo: 'label+percent',
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
          onClick={(data) => {
            if (data?.points?.[0]) {
              const point = data.points[0]
              // Use pointNumber or pointIndex depending on what's available
              const index = point.pointNumber !== undefined ? point.pointNumber : point.pointIndex
              if (index !== undefined && index >= 0 && index < originalValues.length) {
                const clickedValue = originalValues[index]
                toggleFilter(field, clickedValue)
              }
            }
          }}
        />
      </div>
    )
  }

  const renderBarChart = (title: string, tableName: string, field: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.categories || aggregation.categories.length === 0) return null

    const labels = aggregation.categories.map(c => String(c.value))
    const values = aggregation.categories.map(c => c.count)
    // Backend returns "N/A" for both empty strings and nulls
    // We'll convert N/A to empty string for filtering (more common case)
    const originalValues = aggregation.categories.map(c =>
      c.value === 'N/A' ? '' : c.value
    )

    const metadata = getColumnMetadata(tableName, field)

    const tooltipText = [
      metadata?.display_name || title,
      `ID: ${field}`,
      metadata?.description || ''
    ].filter(Boolean).join('\n')

    return (
      <div style={{
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '358px',
        height: '175px',
        boxSizing: 'border-box',
        flexShrink: 0
      }}>
        <h4
          style={{
            margin: '0 0 0.25rem 0',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'help',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            height: '1rem'
          }}
          title={tooltipText}
        >
          {metadata?.display_name || title}
        </h4>
        <Plot
          data={[{
            type: 'bar',
            x: labels,
            y: values,
            marker: {
              color: originalValues.map(value =>
                isValueFiltered(field, value) ? '#1976D2' : '#2196F3'
              ),
              line: {
                color: originalValues.map(value =>
                  isValueFiltered(field, value) ? '#000' : undefined
                ),
                width: originalValues.map(value =>
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
          onClick={(data) => {
            if (data?.points?.[0]) {
              const pointIndex = data.points[0].pointIndex
              if (pointIndex !== undefined && pointIndex >= 0 && pointIndex < originalValues.length) {
                const clickedValue = originalValues[pointIndex]
                toggleFilter(field, clickedValue)
              }
            }
          }}
          onSelected={(data) => {
            if (data?.points && data.points.length > 0) {
              // Get all selected values
              const selectedValues = data.points
                .map(p => p.pointIndex)
                .filter(idx => idx !== undefined && idx >= 0 && idx < originalValues.length)
                .map(idx => originalValues[idx])
              // Add IN filter with selected values
              if (selectedValues.length > 0) {
                setFilters(prev => [...prev.filter(f => f.column !== field), { column: field, operator: 'in', value: selectedValues }])
              }
            }
          }}
        />
      </div>
    )
  }

  const renderHistogram = (title: string, tableName: string, field: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.histogram || !aggregation.numeric_stats) return null

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

    // Convert histogram bins to bar chart data
    const xValues = aggregation.histogram.map(bin => (bin.bin_start + bin.bin_end) / 2)
    const yValues = aggregation.histogram.map(bin => bin.count)
    const binWidth = aggregation.histogram[0] ? aggregation.histogram[0].bin_end - aggregation.histogram[0].bin_start : 1

    return (
      <div style={{
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '358px',
        height: '175px',
        boxSizing: 'border-box',
        flexShrink: 0
      }}>
        <h4
          style={{
            margin: '0 0 0.25rem 0',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'help',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            height: '1rem'
          }}
          title={tooltipText}
        >
          {metadata?.display_name || title}
        </h4>
        <Plot
          data={[{
            type: 'bar',
            x: xValues,
            y: yValues,
            width: binWidth * 0.9,
            marker: {
              color: aggregation.histogram.map(bin =>
                isRangeFiltered(field, bin.bin_start, bin.bin_end) ? '#2E7D32' : '#4CAF50'
              ),
              line: {
                color: aggregation.histogram.map(bin =>
                  isRangeFiltered(field, bin.bin_start, bin.bin_end) ? '#000' : undefined
                ),
                width: aggregation.histogram.map(bin =>
                  isRangeFiltered(field, bin.bin_start, bin.bin_end) ? 2 : 0
                )
              }
            },
            hovertemplate: 'Range: [%{customdata[0]:.2f}, %{customdata[1]:.2f}]<br>Count: %{y}<extra></extra>',
            customdata: aggregation.histogram.map(bin => [bin.bin_start, bin.bin_end])
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
          onClick={(data) => {
            if (data?.points?.[0] && aggregation.histogram) {
              const pointIndex = data.points[0].pointIndex
              if (pointIndex !== undefined && pointIndex >= 0 && pointIndex < aggregation.histogram.length) {
                const bin = aggregation.histogram[pointIndex]
                toggleRangeFilter(field, bin.bin_start, bin.bin_end)
              }
            }
          }}
          onSelected={(data) => {
            if (data?.range?.x && Array.isArray(data.range.x) && data.range.x.length >= 2) {
              const [minX, maxX] = data.range.x
              // Add BETWEEN filter with selected range
              setFilters(prev => [...prev.filter(f => f.column !== field), { column: field, operator: 'between', value: [minX, maxX] }])
            }
          }}
        />
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
              let displayValue = String(filter.value)
              let removeHandler = () => setFilters(filters.filter((_, i) => i !== idx))

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
              }

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
                  <span><strong>{filter.column}:</strong> {displayValue}</span>
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
          <p style={{ color: '#666', margin: '0.5rem 0' }} dangerouslySetInnerHTML={{ __html: dataset.description }}></p>
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

      {/* Chart Grid */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        marginBottom: '2rem'
      }}>
        {/* Render charts based on aggregations */}
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

          return sortedAggregations.map(agg => {
            const displayTitle = getDisplayTitle(table.name, agg.column_name)
            const metadata = getColumnMetadata(table.name, agg.column_name)

            // Skip hidden columns
            if (metadata?.is_hidden) return null

            if (agg.display_type === 'categorical' && agg.categories) {
              // Pie chart for low cardinality
              if (agg.categories.length <= 8) {
                return (
                  <div key={`${table.name}_${agg.column_name}`}>
                    {renderPieChart(displayTitle, table.name, agg.column_name)}
                  </div>
                )
              }
              // Bar chart for higher cardinality
              else {
                return (
                  <div key={`${table.name}_${agg.column_name}`}>
                    {renderBarChart(displayTitle, table.name, agg.column_name)}
                  </div>
                )
              }
            } else if (agg.display_type === 'numeric' && agg.histogram) {
              return (
                <div key={`${table.name}_${agg.column_name}`}>
                  {renderHistogram(displayTitle, table.name, agg.column_name)}
                </div>
              )
            }
            return null
          })
        })}
      </div>
    </div>
  )
}

export default DatasetExplorer
