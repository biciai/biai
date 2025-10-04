import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

interface Column {
  name: string
  type: string
  nullable: boolean
}

interface Relationship {
  foreign_key: string
  referenced_table: string
  referenced_column: string
  type?: string
}

interface Table {
  id: string
  name: string
  displayName: string
  filename: string
  rowCount: number
  columns: Column[]
  primaryKey?: string
  relationships?: Relationship[]
  customMetadata?: string
  createdAt: string
}

interface Dataset {
  id: string
  name: string
  description: string
  tags?: string[]
  source?: string
  citation?: string
  references?: string[]
  customMetadata?: string
  tables: Table[]
  createdAt: string
  updatedAt: string
}

function DatasetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddTable, setShowAddTable] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [tableName, setTableName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [skipRows, setSkipRows] = useState('4')
  const [delimiter, setDelimiter] = useState('\t')
  const [primaryKey, setPrimaryKey] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableData, setTableData] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(false)

  useEffect(() => {
    loadDataset()
  }, [id])

  const loadDataset = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/datasets/${id}`)
      setDataset(response.data.dataset)
    } catch (error) {
      console.error('Failed to load dataset:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      if (!tableName) {
        const name = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_]/gi, '_').toLowerCase()
        setTableName(name)
        setDisplayName(file.name.replace(/\.[^/.]+$/, ''))
      }
    }
  }

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile || !tableName) return

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('tableName', tableName)
    formData.append('displayName', displayName || tableName)
    formData.append('skipRows', skipRows)
    formData.append('delimiter', delimiter)
    if (primaryKey) formData.append('primaryKey', primaryKey)

    try {
      setUploading(true)
      await api.post(`/datasets/${id}/tables`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setShowAddTable(false)
      setSelectedFile(null)
      setTableName('')
      setDisplayName('')
      setSkipRows('4')
      setPrimaryKey('')
      await loadDataset()
    } catch (error: any) {
      console.error('Add table failed:', error)
      alert('Add table failed: ' + (error.response?.data?.message || error.message))
    } finally {
      setUploading(false)
    }
  }

  const loadTableData = async (tableId: string) => {
    try {
      setLoadingData(true)
      setSelectedTable(tableId)
      const response = await api.get(`/datasets/${id}/tables/${tableId}/data?limit=100`)
      setTableData(response.data.data)
    } catch (error) {
      console.error('Failed to load table data:', error)
    } finally {
      setLoadingData(false)
    }
  }

  const handleDeleteTable = async (tableId: string) => {
    if (!confirm('Are you sure you want to delete this table?')) return

    try {
      await api.delete(`/datasets/${id}/tables/${tableId}`)
      await loadDataset()
      if (selectedTable === tableId) {
        setSelectedTable(null)
        setTableData([])
      }
    } catch (error) {
      console.error('Delete table failed:', error)
      alert('Failed to delete table')
    }
  }

  if (loading) return <p>Loading dataset...</p>

  if (!dataset) return <p>Dataset not found</p>

  return (
    <div>
      <button
        onClick={() => navigate('/datasets')}
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
        ← Back to Datasets
      </button>

      <div style={{ marginBottom: '2rem', background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginTop: 0 }}>{dataset.name}</h2>
        {dataset.description && <p style={{ color: '#666' }} dangerouslySetInnerHTML={{ __html: dataset.description }}></p>}

        {dataset.tags && dataset.tags.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ marginRight: '0.5rem' }}>Tags:</strong>
            {dataset.tags.map((tag, i) => (
              <span
                key={i}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: '#e3f2fd',
                  color: '#1976d2',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {dataset.source && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#666' }}>
            <strong>Source:</strong> {dataset.source}
          </div>
        )}

        {dataset.citation && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
            <strong>Citation:</strong> {dataset.citation}
          </div>
        )}

        {dataset.references && dataset.references.length > 0 && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#666' }}>
            <strong>References:</strong>
            <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
              {dataset.references.map((ref, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>
                  {ref.startsWith('pmid:') ? (
                    <a href={`https://pubmed.ncbi.nlm.nih.gov/${ref.substring(5)}/`} target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                      {ref}
                    </a>
                  ) : ref.startsWith('doi:') ? (
                    <a href={`https://doi.org/${ref.substring(4)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                      {ref}
                    </a>
                  ) : (
                    ref
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Tables ({dataset.tables.length})</h3>
          <button
            onClick={() => setShowAddTable(!showAddTable)}
            style={{
              padding: '0.5rem 1rem',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {showAddTable ? 'Cancel' : '+ Add Table'}
          </button>
        </div>

        {showAddTable && (
          <div style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h4 style={{ marginTop: 0 }}>Add Table to Dataset</h4>
            <form onSubmit={handleAddTable}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>File</label>
                <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileSelect} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Table Name (identifier) *</label>
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    required
                    placeholder="e.g., patients"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g., Clinical Patients"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Skip Rows</label>
                  <input
                    type="number"
                    value={skipRows}
                    onChange={(e) => setSkipRows(e.target.value)}
                    min="0"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Delimiter</label>
                  <select
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                  >
                    <option value="\t">Tab</option>
                    <option value=",">Comma</option>
                    <option value=";">Semicolon</option>
                    <option value="|">Pipe</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Primary Key (optional)</label>
                  <input
                    type="text"
                    value={primaryKey}
                    onChange={(e) => setPrimaryKey(e.target.value)}
                    placeholder="e.g., patient_id"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={uploading || !selectedFile}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: uploading ? '#ccc' : '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: uploading ? 'not-allowed' : 'pointer'
                }}
              >
                {uploading ? 'Adding...' : 'Add Table'}
              </button>
            </form>
          </div>
        )}

        <div style={{ display: 'grid', gap: '1rem' }}>
          {dataset.tables.map((table) => (
            <div
              key={table.id}
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: selectedTable === table.id ? '2px solid #2196F3' : '2px solid transparent'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>{table.displayName}</h4>
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>
                    <span>{table.filename}</span>
                    <span style={{ margin: '0 1rem' }}>•</span>
                    <span>{table.rowCount.toLocaleString()} rows</span>
                    <span style={{ margin: '0 1rem' }}>•</span>
                    <span>{table.columns.length} columns</span>
                    {table.primaryKey && (
                      <>
                        <span style={{ margin: '0 1rem' }}>•</span>
                        <span>PK: {table.primaryKey}</span>
                      </>
                    )}
                  </div>
                  {table.relationships && table.relationships.length > 0 && (
                    <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                      <strong>Relationships:</strong>
                      {table.relationships.map((rel, i) => (
                        <div key={i} style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                          {rel.foreign_key} → {rel.referenced_table}.{rel.referenced_column} ({rel.type || 'many-to-one'})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => loadTableData(table.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    View Data
                  </button>
                  <button
                    onClick={() => handleDeleteTable(table.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <details>
                <summary style={{ cursor: 'pointer', color: '#666', fontSize: '0.875rem' }}>
                  View columns ({table.columns.length})
                </summary>
                <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                  {table.columns.map((col, idx) => (
                    <div key={idx} style={{ fontSize: '0.75rem', padding: '0.25rem', background: '#f5f5f5', borderRadius: '3px' }}>
                      <strong>{col.name}</strong>: {col.type}{col.nullable ? '?' : ''}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ))}
        </div>
      </div>

      {selectedTable && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Table Data Preview</h3>
          {loadingData ? (
            <p>Loading data...</p>
          ) : tableData.length > 0 ? (
            <div style={{ overflowX: 'auto', background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ddd' }}>
                    {Object.keys(tableData[0]).map((key) => (
                      <th key={key} style={{ padding: '0.5rem', textAlign: 'left', background: '#f5f5f5' }}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.slice(0, 50).map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                      {Object.values(row).map((val: any, i) => (
                        <td key={i} style={{ padding: '0.5rem' }}>{val?.toString() || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {tableData.length > 50 && (
                <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.875rem' }}>
                  Showing first 50 of {tableData.length} rows
                </p>
              )}
            </div>
          ) : (
            <p>No data available</p>
          )}
        </div>
      )}
    </div>
  )
}

export default DatasetDetail
