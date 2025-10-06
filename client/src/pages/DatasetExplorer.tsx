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


  useEffect(() => {
    loadDataset()
  }, [id])

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
      const response = await api.get(`/datasets/${id}/tables/${tableId}/aggregations`)
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

  const renderPieChart = (title: string, tableName: string, field: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.categories || aggregation.categories.length === 0) return null

    const labels = aggregation.categories.map(c => String(c.value))
    const values = aggregation.categories.map(c => c.count)

    const metadata = getColumnMetadata(tableName, field)

    return (
      <div style={{
        background: 'white',
        padding: '1rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h4
          style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600, cursor: metadata?.description ? 'help' : 'default' }}
          title={metadata?.description || ''}
        >
          {title}
        </h4>
        {metadata?.description && (
          <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem', fontStyle: 'italic' }}>
            {metadata.description}
          </div>
        )}
        <Plot
          data={[{
            type: 'pie',
            labels,
            values,
            marker: {
              colors: ['#2196F3', '#4CAF50', '#FF9800', '#F44336', '#9C27B0', '#00BCD4', '#FFEB3B', '#795548']
            },
            textinfo: 'label+percent',
            hovertemplate: '%{label}<br>Count: %{value}<br>%{percent}<extra></extra>'
          }]}
          layout={{
            height: 300,
            margin: { t: 0, b: 0, l: 0, r: 0 },
            showlegend: false,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent'
          }}
          config={{
            displayModeBar: false,
            responsive: true
          }}
          style={{ width: '100%', height: '300px' }}
        />
      </div>
    )
  }

  const renderBarChart = (title: string, tableName: string, field: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.categories || aggregation.categories.length === 0) return null

    const labels = aggregation.categories.map(c => String(c.value))
    const values = aggregation.categories.map(c => c.count)

    const metadata = getColumnMetadata(tableName, field)

    return (
      <div style={{
        background: 'white',
        padding: '1rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h4
          style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600, cursor: metadata?.description ? 'help' : 'default' }}
          title={metadata?.description || ''}
        >
          {title}
        </h4>
        {metadata?.description && (
          <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem', fontStyle: 'italic' }}>
            {metadata.description}
          </div>
        )}
        <Plot
          data={[{
            type: 'bar',
            x: labels,
            y: values,
            marker: { color: '#2196F3' },
            hovertemplate: '%{x}<br>Count: %{y}<extra></extra>'
          }]}
          layout={{
            height: 300,
            margin: { t: 10, b: 80, l: 40, r: 10 },
            xaxis: { tickangle: -45, automargin: true },
            yaxis: { title: 'Count', automargin: true },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent'
          }}
          config={{
            displayModeBar: false,
            responsive: true
          }}
          style={{ width: '100%', height: '300px' }}
        />
      </div>
    )
  }

  const renderHistogram = (title: string, tableName: string, field: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.histogram || !aggregation.numeric_stats) return null

    const metadata = getColumnMetadata(tableName, field)

    // Convert histogram bins to bar chart data
    const xValues = aggregation.histogram.map(bin => (bin.bin_start + bin.bin_end) / 2)
    const yValues = aggregation.histogram.map(bin => bin.count)
    const binWidth = aggregation.histogram[0] ? aggregation.histogram[0].bin_end - aggregation.histogram[0].bin_start : 1

    return (
      <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h4
          style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600, cursor: metadata?.description ? 'help' : 'default' }}
          title={metadata?.description || ''}
        >
          {title}
        </h4>
        {metadata?.description && (
          <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem', fontStyle: 'italic' }}>
            {metadata.description}
          </div>
        )}
        <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>
          Mean: {aggregation.numeric_stats.mean.toFixed(2)} |
          Median: {aggregation.numeric_stats.median.toFixed(2)} |
          Range: [{aggregation.numeric_stats.min.toFixed(2)}, {aggregation.numeric_stats.max.toFixed(2)}]
        </div>
        <Plot
          data={[{
            type: 'bar',
            x: xValues,
            y: yValues,
            width: binWidth * 0.9,
            marker: { color: '#4CAF50' },
            hovertemplate: 'Range: [%{customdata[0]:.2f}, %{customdata[1]:.2f}]<br>Count: %{y}<extra></extra>',
            customdata: aggregation.histogram.map(bin => [bin.bin_start, bin.bin_end])
          }]}
          layout={{
            height: 300,
            margin: { t: 10, b: 40, l: 40, r: 10 },
            xaxis: { title: field, automargin: true },
            yaxis: { title: 'Count', automargin: true },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            bargap: 0.1
          }}
          config={{
            displayModeBar: false,
            responsive: true
          }}
          style={{ width: '100%', height: '300px' }}
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
      <button
        onClick={() => navigate(`/datasets/${id}`)}
        style={{
          marginBottom: '1rem',
          padding: '0.5rem 1rem',
          background: '#666',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        ← Back to Dataset
      </button>

      {/* Header */}
      <div style={{ marginBottom: '2rem', background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginTop: 0 }}>{dataset.name}</h2>
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
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '1rem',
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
