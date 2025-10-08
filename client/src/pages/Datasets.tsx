import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SafeHtml from '../components/SafeHtml'
import api from '../services/api'

interface DatasetTable {
  id: string
  name: string
  displayName: string
  rowCount: number
}

interface Dataset {
  id: string
  name: string
  description: string
  tags?: string[]
  source?: string
  citation?: string
  references?: string[]
  tableCount: number
  tables: DatasetTable[]
  createdAt: string
  updatedAt: string
}

function Datasets() {
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [datasetName, setDatasetName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadDatasets()
  }, [])

  const loadDatasets = async () => {
    try {
      setLoading(true)
      const response = await api.get('/datasets')
      setDatasets(response.data.datasets)
    } catch (error) {
      console.error('Failed to load datasets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!datasetName) return

    try {
      setCreating(true)
      const response = await api.post('/datasets', {
        name: datasetName,
        description: description
      })
      setShowCreate(false)
      setDatasetName('')
      setDescription('')

      // Navigate to the new dataset to add tables
      navigate(`/datasets/${response.data.dataset.id}/manage`)
    } catch (error: any) {
      console.error('Create failed:', error)
      alert('Create failed: ' + (error.response?.data?.message || error.message))
    } finally {
      setCreating(false)
    }
  }


  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Datasets</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: '0.5rem 1rem',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {showCreate ? 'Cancel' : '+ New Dataset'}
        </button>
      </div>

      {showCreate && (
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0 }}>Create New Dataset</h3>
          <form onSubmit={handleCreate}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Dataset Name *</label>
              <input
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                required
                placeholder="e.g., TCGA GBM Study"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe this dataset..."
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
              />
            </div>

            <button
              type="submit"
              disabled={creating || !datasetName}
              style={{
                padding: '0.75rem 1.5rem',
                background: creating ? '#ccc' : '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: creating ? 'not-allowed' : 'pointer'
              }}
            >
              {creating ? 'Creating...' : 'Create Dataset'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <p>Loading datasets...</p>
      ) : datasets.length === 0 ? (
        <div style={{
          background: 'white',
          padding: '3rem',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#666'
        }}>
          <p>No datasets yet. Create your first dataset to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {datasets.map((dataset) => (
            <div
              key={dataset.id}
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>{dataset.name}</h3>
                  {dataset.description && (
                    <SafeHtml
                      html={dataset.description}
                      style={{ margin: '0 0 0.5rem 0', color: '#666', display: 'block' }}
                    />
                  )}
                  {dataset.tags && dataset.tags.length > 0 && (
                    <div style={{ margin: '0.5rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {dataset.tags.map((tag, i) => (
                        <span
                          key={i}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#e3f2fd',
                            color: '#1976d2',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 500
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {dataset.source && (
                    <div style={{ fontSize: '0.875rem', color: '#666', margin: '0.5rem 0' }}>
                      <strong>Source:</strong> {dataset.source}
                    </div>
                  )}
                  {dataset.citation && (
                    <div style={{ fontSize: '0.875rem', color: '#666', margin: '0.5rem 0' }}>
                      <strong>Citation:</strong> {dataset.citation}
                    </div>
                  )}
                  <div style={{ fontSize: '0.875rem', color: '#999' }}>
                    <span>{dataset.tableCount} table{dataset.tableCount !== 1 ? 's' : ''}</span>
                    <span style={{ margin: '0 1rem' }}>•</span>
                    <span>Updated {new Date(dataset.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => navigate(`/datasets/${dataset.id}`)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    📊 Explore Data
                  </button>
                  <button
                    onClick={() => navigate(`/datasets/${dataset.id}/manage`)}
                    style={{
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
                </div>
              </div>

              {dataset.tables && dataset.tables.length > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                    {dataset.tables.map((table) => (
                      <div
                        key={table.id}
                        style={{
                          padding: '0.5rem',
                          background: '#f5f5f5',
                          borderRadius: '4px',
                          fontSize: '0.875rem'
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{table.displayName}</div>
                        <div style={{ color: '#666', fontSize: '0.75rem' }}>
                          {table.rowCount.toLocaleString()} rows
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Datasets
