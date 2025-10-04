import express from 'express'
import multer from 'multer'
import { parseCSVFile } from '../services/fileParser.js'
import datasetService from '../services/datasetService.js'
import { unlink } from 'fs/promises'

const router = express.Router()

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.txt', '.tsv']
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'))
    if (allowedTypes.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV, TSV, and TXT files are allowed'))
    }
  }
})

// Upload and create dataset
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const { name, description = '', skipRows = '0', delimiter = '\t' } = req.body

    if (!name) {
      await unlink(req.file.path)
      return res.status(400).json({ error: 'Dataset name is required' })
    }

    // Parse the uploaded file
    const parsedData = await parseCSVFile(
      req.file.path,
      parseInt(skipRows, 10),
      delimiter
    )

    // Create dataset
    const dataset = await datasetService.createDataset(
      name,
      req.file.originalname,
      req.file.mimetype,
      parsedData,
      description
    )

    // Clean up uploaded file
    await unlink(req.file.path)

    res.json({
      success: true,
      dataset: {
        id: dataset.dataset_id,
        name: dataset.dataset_name,
        filename: dataset.original_filename,
        rowCount: dataset.row_count,
        columns: parsedData.columns.length,
        createdAt: dataset.created_at
      }
    })
  } catch (error: any) {
    console.error('Upload error:', error)

    // Clean up file if it exists
    if (req.file) {
      try {
        await unlink(req.file.path)
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    res.status(500).json({
      error: 'Failed to upload dataset',
      message: error.message
    })
  }
})

// List all datasets
router.get('/', async (req, res) => {
  try {
    const datasets = await datasetService.listDatasets()
    res.json({
      datasets: datasets.map(d => ({
        id: d.dataset_id,
        name: d.dataset_name,
        description: d.description,
        filename: d.original_filename,
        rowCount: d.row_count,
        columns: JSON.parse(d.schema_json).length,
        createdAt: d.created_at
      }))
    })
  } catch (error: any) {
    console.error('List datasets error:', error)
    res.status(500).json({ error: 'Failed to list datasets', message: error.message })
  }
})

// Get dataset details
router.get('/:id', async (req, res) => {
  try {
    const dataset = await datasetService.getDataset(req.params.id)
    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found' })
    }

    res.json({
      dataset: {
        id: dataset.dataset_id,
        name: dataset.dataset_name,
        description: dataset.description,
        filename: dataset.original_filename,
        fileType: dataset.file_type,
        rowCount: dataset.row_count,
        columns: JSON.parse(dataset.schema_json),
        tableName: dataset.table_name,
        createdBy: dataset.created_by,
        createdAt: dataset.created_at
      }
    })
  } catch (error: any) {
    console.error('Get dataset error:', error)
    res.status(500).json({ error: 'Failed to get dataset', message: error.message })
  }
})

// Get dataset data
router.get('/:id/data', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100
    const offset = parseInt(req.query.offset as string) || 0

    const data = await datasetService.getDatasetData(req.params.id, limit, offset)

    res.json({
      data,
      limit,
      offset,
      count: data.length
    })
  } catch (error: any) {
    console.error('Get dataset data error:', error)
    res.status(500).json({ error: 'Failed to get dataset data', message: error.message })
  }
})

// Delete dataset
router.delete('/:id', async (req, res) => {
  try {
    await datasetService.deleteDataset(req.params.id)
    res.json({ success: true, message: 'Dataset deleted successfully' })
  } catch (error: any) {
    console.error('Delete dataset error:', error)
    res.status(500).json({ error: 'Failed to delete dataset', message: error.message })
  }
})

export default router
