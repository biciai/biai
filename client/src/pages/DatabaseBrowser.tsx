import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface DatabaseInfo {
  name: string
}

function DatabaseBrowser() {
  const navigate = useNavigate()
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDatabases()
  }, [])

  const loadDatabases = async () => {
    try {
      setLoading(true)
      // Query ClickHouse directly for list of databases
      const response = await fetch('http://localhost:8123/?query=SHOW%20DATABASES%20FORMAT%20JSON')
      const data = await response.json()

      // Filter out system databases
      const filteredDatabases = data.data
        .map((row: any) => ({ name: row.name }))
        .filter((db: DatabaseInfo) =>
          !['system', 'INFORMATION_SCHEMA', 'information_schema'].includes(db.name)
        )

      setDatabases(filteredDatabases)
    } catch (error) {
      console.error('Failed to load databases:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExplore = (databaseName: string) => {
    navigate(`/databases/${databaseName}`)
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h2>ClickHouse Databases</h2>
        <p style={{ color: '#666', margin: '0.5rem 0 0 0' }}>
          Browse and explore any database in your ClickHouse instance
        </p>
      </div>

      {loading ? (
        <p>Loading databases...</p>
      ) : databases.length === 0 ? (
        <div style={{
          background: 'white',
          padding: '3rem',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#666'
        }}>
          <p>No databases found.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {databases.map((database) => (
            <div
              key={database.name}
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>{database.name}</h3>
                <div style={{ fontSize: '0.875rem', color: '#666' }}>
                  ClickHouse Database
                </div>
              </div>
              <button
                onClick={() => handleExplore(database.name)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                📊 Explore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DatabaseBrowser
