import { useState, useEffect } from 'react'
import api from '../services/api'

interface Dataset {
  id: string
  name: string
  description: string
  filename: string
  rowCount: number
  columns: number
  createdAt: string
}

function Datasets() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [datasetName, setDatasetName] = useState('')
  const [description, setDescription] = useState('')
  const [skipRows, setSkipRows] = useState('4')
  const [delimiter, setDelimiter] = useState('\t')

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      if (!datasetName) {
        setDatasetName(file.name.replace(/\.[^/.]+$/, ''))
      }
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile || !datasetName) return

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('name', datasetName)
    formData.append('description', description)
    formData.append('skipRows', skipRows)
    formData.append('delimiter', delimiter)

    try {
      setUploading(true)
      await api.post('/datasets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setShowUpload(false)
      setSelectedFile(null)
      setDatasetName('')
      setDescription('')
      setSkipRows('4')
      await loadDatasets()
    } catch (error: any) {
      console.error('Upload failed:', error)
      alert('Upload failed: ' + (error.response?.data?.message || error.message))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this dataset?')) return

    try {
      await api.delete(`/datasets/${id}`)
      await loadDatasets()
    } catch (error) {
      console.error('Delete failed:', error)
      alert('Failed to delete dataset')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Datasets</h2>
        <button
          onClick={() => setShowUpload(!showUpload)}
          style={{
            padding: '0.5rem 1rem',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {showUpload ? 'Cancel' : '+ Upload Dataset'}
        </button>
      </div>

      {showUpload && (
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0 }}>Upload New Dataset</h3>
          <form onSubmit={handleUpload}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>File</label>
              <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileSelect} required />
              <small style={{ display: 'block', marginTop: '0.25rem', color: '#666' }}>
                Supported formats: CSV, TSV, TXT
              </small>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Dataset Name *</label>
              <input
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                required
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Skip Rows (metadata)</label>
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
              {uploading ? 'Uploading...' : 'Upload Dataset'}
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
          <p>No datasets yet. Upload your first dataset to get started!</p>
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
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start'
              }}
            >
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>{dataset.name}</h3>
                {dataset.description && (
                  <p style={{ margin: '0 0 0.5rem 0', color: '#666' }}>{dataset.description}</p>
                )}
                <div style={{ fontSize: '0.875rem', color: '#999' }}>
                  <span>📄 {dataset.filename}</span>
                  <span style={{ margin: '0 1rem' }}>•</span>
                  <span>{dataset.rowCount.toLocaleString()} rows</span>
                  <span style={{ margin: '0 1rem' }}>•</span>
                  <span>{dataset.columns} columns</span>
                  <span style={{ margin: '0 1rem' }}>•</span>
                  <span>{new Date(dataset.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => window.location.href = `/datasets/${dataset.id}`}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  View
                </button>
                <button
                  onClick={() => handleDelete(dataset.id)}
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
          ))}
        </div>
      )}
    </div>
  )
}

export default Datasets
