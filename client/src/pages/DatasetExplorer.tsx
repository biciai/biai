import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Plot from 'react-plotly.js'
import api from '../services/api'

interface Column {
  name: string
  type: string
  nullable: boolean
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
  const [tableData, setTableData] = useState<Record<string, any[]>>({})
  const [selectedFilters, setSelectedFilters] = useState<Record<string, Set<string>>>({})

  useEffect(() => {
    loadDataset()
  }, [id])

  const loadDataset = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/datasets/${id}`)
      setDataset(response.data.dataset)

      // Load all table data
      for (const table of response.data.dataset.tables) {
        await loadTableData(table.id, table.name)
      }
    } catch (error) {
      console.error('Failed to load dataset:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTableData = async (tableId: string, tableName: string) => {
    try {
      const response = await api.get(`/datasets/${id}/tables/${tableId}/data?limit=10000`)
      setTableData(prev => ({ ...prev, [tableName]: response.data.data }))
    } catch (error) {
      console.error('Failed to load table data:', error)
    }
  }

  const getFilteredData = (tableName: string) => {
    const data = tableData[tableName] || []
    if (Object.keys(selectedFilters).length === 0) return data

    return data.filter(row => {
      return Object.entries(selectedFilters).every(([field, values]) => {
        if (values.size === 0) return true
        const rowValue = String(row[field])
        return values.has(rowValue)
      })
    })
  }

  const handleChartClick = (field: string, value: string) => {
    setSelectedFilters(prev => {
      const newFilters = { ...prev }
      if (!newFilters[field]) {
        newFilters[field] = new Set()
      }

      if (newFilters[field].has(value)) {
        newFilters[field].delete(value)
        if (newFilters[field].size === 0) {
          delete newFilters[field]
        }
      } else {
        newFilters[field].add(value)
      }

      return newFilters
    })
  }

  const clearFilters = () => {
    setSelectedFilters({})
  }

  const renderPieChart = (title: string, tableName: string, field: string) => {
    const data = getFilteredData(tableName)
    if (!data.length) return null

    const counts: Record<string, number> = {}
    data.forEach(row => {
      const value = row[field]
      if (value !== null && value !== undefined && value !== '') {
        counts[value] = (counts[value] || 0) + 1
      }
    })

    if (Object.keys(counts).length === 0) return null

    const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const labels = sortedEntries.map(([label]) => label)
    const values = sortedEntries.map(([, count]) => count)

    const isFiltered = selectedFilters[field]?.size > 0

    return (
      <div style={{
        background: 'white',
        padding: '1rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        border: isFiltered ? '2px solid #2196F3' : '2px solid transparent'
      }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600 }}>
          {title}
          {isFiltered && <span style={{ color: '#2196F3', marginLeft: '0.5rem' }}>●</span>}
        </h4>
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
          onClick={(data) => {
            if (data.points && data.points[0]) {
              handleChartClick(field, String(data.points[0].label))
            }
          }}
          style={{ width: '100%', height: '300px', cursor: 'pointer' }}
        />
      </div>
    )
  }

  const renderBarChart = (title: string, tableName: string, field: string, limit: number = 10) => {
    const data = getFilteredData(tableName)
    if (!data.length) return null

    const counts: Record<string, number> = {}
    data.forEach(row => {
      const value = row[field]
      if (value !== null && value !== undefined && value !== '') {
        counts[value] = (counts[value] || 0) + 1
      }
    })

    if (Object.keys(counts).length === 0) return null

    const sortedEntries = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)

    const labels = sortedEntries.map(([label]) => label)
    const values = sortedEntries.map(([, count]) => count)

    const isFiltered = selectedFilters[field]?.size > 0

    return (
      <div style={{
        background: 'white',
        padding: '1rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        border: isFiltered ? '2px solid #2196F3' : '2px solid transparent'
      }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600 }}>
          {title}
          {isFiltered && <span style={{ color: '#2196F3', marginLeft: '0.5rem' }}>●</span>}
        </h4>
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
          onClick={(data) => {
            if (data.points && data.points[0]) {
              handleChartClick(field, String(data.points[0].x))
            }
          }}
          style={{ width: '100%', height: '300px', cursor: 'pointer' }}
        />
      </div>
    )
  }

  const renderHistogram = (title: string, tableName: string, field: string, bins: number = 20) => {
    const data = getFilteredData(tableName)
    if (!data.length) return null

    const values = data
      .map(row => row[field])
      .filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)))
      .map(Number)

    if (values.length === 0) return null

    return (
      <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600 }}>{title}</h4>
        <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>
          Mean: {(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)} |
          Median: {values.sort((a, b) => a - b)[Math.floor(values.length / 2)].toFixed(2)} |
          N: {values.length}
        </div>
        <Plot
          data={[{
            type: 'histogram',
            x: values,
            nbinsx: bins,
            marker: { color: '#4CAF50' },
            hovertemplate: 'Range: %{x}<br>Count: %{y}<extra></extra>'
          }]}
          layout={{
            height: 300,
            margin: { t: 10, b: 40, l: 40, r: 10 },
            xaxis: { title: field, automargin: true },
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

  const renderSurvivalCurve = (title: string, tableName: string, timeField: string, statusField: string) => {
    const data = getFilteredData(tableName)
    if (!data.length) return null

    // Prepare survival data
    const survivalData = data
      .filter(row => row[timeField] !== null && row[timeField] !== undefined && row[statusField] !== null)
      .map(row => ({
        time: Number(row[timeField]),
        status: String(row[statusField]).includes('DECEASED') ||
                String(row[statusField]).includes('DEAD') ||
                String(row[statusField]).includes('1:') ? 1 : 0
      }))
      .sort((a, b) => a.time - b.time)

    if (survivalData.length === 0) return null

    // Calculate Kaplan-Meier survival curve
    let atRisk = survivalData.length
    let survivalProb = 1.0
    const times = [0]
    const probabilities = [1.0]

    survivalData.forEach((point) => {
      if (point.status === 1) {
        survivalProb *= (atRisk - 1) / atRisk
        times.push(point.time)
        probabilities.push(survivalProb)
      }
      atRisk--
    })

    // Add final time point
    if (survivalData.length > 0) {
      times.push(survivalData[survivalData.length - 1].time)
      probabilities.push(probabilities[probabilities.length - 1])
    }

    // Calculate median survival
    const medianIdx = probabilities.findIndex(p => p <= 0.5)
    const medianSurvival = medianIdx > 0 ? times[medianIdx] : null

    // Calculate events
    const events = survivalData.filter(d => d.status === 1).length

    return (
      <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600 }}>{title}</h4>
        <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>
          {medianSurvival && `Median: ${medianSurvival.toFixed(1)} months | `}
          Events: {events} / {survivalData.length}
        </div>
        <Plot
          data={[{
            type: 'scatter',
            mode: 'lines',
            x: times,
            y: probabilities,
            line: { color: '#2196F3', shape: 'hv', width: 2 },
            fill: 'tozeroy',
            fillcolor: 'rgba(33, 150, 243, 0.1)',
            hovertemplate: 'Time: %{x:.1f}<br>Survival: %{y:.1%}<extra></extra>'
          }]}
          layout={{
            height: 350,
            margin: { t: 10, b: 40, l: 50, r: 10 },
            xaxis: { title: 'Time (months)', automargin: true },
            yaxis: { title: 'Probability', tickformat: '.0%', range: [0, 1], automargin: true },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent'
          }}
          config={{
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['select2d', 'lasso2d'],
            responsive: true
          }}
          style={{ width: '100%', height: '350px' }}
        />
      </div>
    )
  }

  if (loading) return <p>Loading explorer...</p>
  if (!dataset) return <p>Dataset not found</p>

  // Get counts for summary
  const totalRecords = Object.values(tableData).reduce((sum, data) => sum + data.length, 0)
  const filteredRecords = Object.keys(tableData).reduce((sum, tableName) => sum + getFilteredData(tableName).length, 0)

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
            <strong>Total Records:</strong> {filteredRecords} {filteredRecords !== totalRecords && `/ ${totalRecords}`}
          </div>
          <div>
            <strong>Tables:</strong> {dataset.tables.length}
          </div>
        </div>

        {Object.keys(selectedFilters).length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <button
              onClick={clearFilters}
              style={{
                padding: '0.5rem 1rem',
                background: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Clear All Filters ({Object.keys(selectedFilters).length})
            </button>
            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#666' }}>
              Active filters: {Object.entries(selectedFilters).map(([field, values]) =>
                `${field} (${values.size})`
              ).join(', ')}
            </div>
          </div>
        )}
      </div>

      {/* Chart Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        {/* Render charts dynamically based on available data */}
        {dataset.tables.map(table => {
          const data = tableData[table.name]
          if (!data || data.length === 0) return null

          const charts = []

          // Analyze columns and create appropriate charts
          table.columns.forEach(col => {
            const sampleValues = data.slice(0, 100).map(row => row[col.name]).filter(v => v !== null && v !== undefined && v !== '')
            if (sampleValues.length === 0) return

            const uniqueValues = new Set(sampleValues)
            const isNumeric = sampleValues.every(v => !isNaN(Number(v)))

            // Categorical data with few unique values -> Pie chart
            if (!isNumeric && uniqueValues.size <= 8 && uniqueValues.size > 1) {
              charts.push(
                <div key={`${table.name}_${col.name}`}>
                  {renderPieChart(col.name.replace(/_/g, ' '), table.name, col.name)}
                </div>
              )
            }
            // Categorical data with many values -> Bar chart
            else if (!isNumeric && uniqueValues.size > 8 && uniqueValues.size <= 50) {
              charts.push(
                <div key={`${table.name}_${col.name}`}>
                  {renderBarChart(col.name.replace(/_/g, ' '), table.name, col.name, 10)}
                </div>
              )
            }
            // Numeric data -> Histogram
            else if (isNumeric && uniqueValues.size > 10) {
              charts.push(
                <div key={`${table.name}_${col.name}`}>
                  {renderHistogram(col.name.replace(/_/g, ' '), table.name, col.name)}
                </div>
              )
            }
          })

          return charts
        })}
      </div>

      {/* Survival Analysis - Check for time/status column patterns */}
      {dataset.tables.map(table => {
        const data = tableData[table.name]
        if (!data || data.length === 0) return null

        const survivalPairs: Array<{timeField: string, statusField: string, title: string}> = []

        // Look for common survival column patterns
        table.columns.forEach(col => {
          const lowerName = col.name.toLowerCase()
          if (lowerName.includes('months') || lowerName.includes('time')) {
            // Find corresponding status column
            const statusCol = table.columns.find(c => {
              const statusLower = c.name.toLowerCase()
              const baseName = lowerName.replace(/_months|_time/g, '')
              return statusLower.includes('status') && statusLower.includes(baseName)
            })

            if (statusCol) {
              survivalPairs.push({
                timeField: col.name,
                statusField: statusCol.name,
                title: col.name.replace(/_months|_time/g, '').replace(/_/g, ' ')
              })
            }
          }
        })

        if (survivalPairs.length === 0) return null

        return (
          <div key={`survival_${table.name}`} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            {survivalPairs.map(pair => (
              <div key={`${pair.timeField}_${pair.statusField}`}>
                {renderSurvivalCurve(pair.title, table.name, pair.timeField, pair.statusField)}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default DatasetExplorer
