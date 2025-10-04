import Plot from 'react-plotly.js'

const sampleData = [
  { name: 'Jan', revenue: 4000, users: 2400 },
  { name: 'Feb', revenue: 3000, users: 1398 },
  { name: 'Mar', revenue: 2000, users: 9800 },
  { name: 'Apr', revenue: 2780, users: 3908 },
  { name: 'May', revenue: 1890, users: 4800 },
  { name: 'Jun', revenue: 2390, users: 3800 },
]

function Dashboard() {
  return (
    <div>
      <h2 style={{ marginBottom: '2rem' }}>Dashboard</h2>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ marginBottom: '1rem' }}>Sample Chart</h3>
        <Plot
          data={[
            {
              type: 'scatter',
              mode: 'lines+markers',
              name: 'Revenue',
              x: sampleData.map(d => d.name),
              y: sampleData.map(d => d.revenue),
              line: { color: '#8884d8' }
            },
            {
              type: 'scatter',
              mode: 'lines+markers',
              name: 'Users',
              x: sampleData.map(d => d.name),
              y: sampleData.map(d => d.users),
              line: { color: '#82ca9d' }
            }
          ]}
          layout={{
            height: 300,
            margin: { t: 20, b: 40, l: 60, r: 20 },
            xaxis: { title: 'Month' },
            yaxis: { title: 'Value' },
            showlegend: true,
            legend: { x: 1, xanchor: 'right', y: 1 }
          }}
          config={{ responsive: true, displayModeBar: false }}
          style={{ width: '100%', height: '300px' }}
        />
      </div>
    </div>
  )
}

export default Dashboard
