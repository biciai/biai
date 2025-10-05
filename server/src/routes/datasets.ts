import express from 'express'
import multer from 'multer'
import { parseCSVFile } from '../services/fileParser.js'
import datasetService from '../services/datasetService.js'
import { unlink } from 'fs/promises'

const router = express.Router()

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
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

// Create a new dataset
router.post('/', async (req, res) => {
  try {
    const { name, description = '', tags = [], source = '', citation = '', references = [], customMetadata = {} } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Dataset name is required' })
    }

    const dataset = await datasetService.createDataset(name, description, 'system', tags, source, citation, references, customMetadata)

    res.json({
      success: true,
      dataset: {
        id: dataset.dataset_id,
        name: dataset.dataset_name,
        description: dataset.description,
        tags: dataset.tags,
        source: dataset.source,
        citation: dataset.citation,
        references: dataset.references,
        createdAt: dataset.created_at
      }
    })
  } catch (error: any) {
    console.error('Create dataset error:', error)
    res.status(500).json({ error: 'Failed to create dataset', message: error.message })
  }
})

// Add table to existing dataset
router.post('/:id/tables', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const {
      tableName,
      displayName,
      skipRows = '0',
      delimiter = '\t',
      primaryKey,
      customMetadata = '{}',
      relationships = '[]',
      columnMetadataConfig = '{}'
    } = req.body

    if (!tableName) {
      await unlink(req.file.path)
      return res.status(400).json({ error: 'Table name is required' })
    }

    // Validate table name (alphanumeric and underscores only)
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      await unlink(req.file.path)
      return res.status(400).json({ error: 'Table name must contain only letters, numbers, and underscores' })
    }

    // Parse column metadata config
    let parsedColumnMetadataConfig
    try {
      const config = JSON.parse(columnMetadataConfig)
      if (Object.keys(config).length > 0) {
        parsedColumnMetadataConfig = config
      }
    } catch (e) {
      // Ignore parse errors, just don't use column metadata
    }

    const parsedData = await parseCSVFile(
      req.file.path,
      parseInt(skipRows, 10),
      delimiter,
      parsedColumnMetadataConfig
    )

    // Parse JSON fields
    let parsedCustomMetadata = {}
    let parsedRelationships = []
    try {
      parsedCustomMetadata = JSON.parse(customMetadata)
      parsedRelationships = JSON.parse(relationships)
    } catch (e) {
      await unlink(req.file.path)
      return res.status(400).json({ error: 'Invalid JSON in customMetadata or relationships' })
    }

    const table = await datasetService.addTableToDataset(
      req.params.id,
      tableName,
      displayName || tableName,
      req.file.originalname,
      req.file.mimetype,
      parsedData,
      primaryKey,
      parsedCustomMetadata,
      parsedRelationships
    )

    await unlink(req.file.path)

    res.json({
      success: true,
      table: {
        id: table.table_id,
        name: table.table_name,
        displayName: table.display_name,
        filename: table.original_filename,
        rowCount: table.row_count,
        columns: parsedData.columns.length
      }
    })
  } catch (error: any) {
    console.error('Add table error:', error)

    if (req.file) {
      try {
        await unlink(req.file.path)
      } catch (e) {}
    }

    res.status(500).json({ error: 'Failed to add table', message: error.message })
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
        tags: d.tags,
        source: d.source,
        citation: d.citation,
        references: d.references,
        tableCount: d.tables?.length || 0,
        tables: d.tables?.map(t => ({
          id: t.table_id,
          name: t.table_name,
          displayName: t.display_name,
          rowCount: t.row_count
        })),
        createdAt: d.created_at,
        updatedAt: d.updated_at
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
        tags: dataset.tags,
        source: dataset.source,
        citation: dataset.citation,
        references: dataset.references,
        customMetadata: dataset.custom_metadata,
        tables: dataset.tables?.map(t => ({
          id: t.table_id,
          name: t.table_name,
          displayName: t.display_name,
          filename: t.original_filename,
          rowCount: t.row_count,
          columns: JSON.parse(t.schema_json),
          primaryKey: t.primary_key,
          customMetadata: t.custom_metadata,
          relationships: t.relationships,
          createdAt: t.created_at
        })),
        createdBy: dataset.created_by,
        createdAt: dataset.created_at,
        updatedAt: dataset.updated_at
      }
    })
  } catch (error: any) {
    console.error('Get dataset error:', error)
    res.status(500).json({ error: 'Failed to get dataset', message: error.message })
  }
})

// Get table data
router.get('/:id/tables/:tableId/data', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100
    const offset = parseInt(req.query.offset as string) || 0

    const data = await datasetService.getTableData(req.params.id, req.params.tableId, limit, offset)

    res.json({
      data,
      limit,
      offset,
      count: data.length
    })
  } catch (error: any) {
    console.error('Get table data error:', error)
    res.status(500).json({ error: 'Failed to get table data', message: error.message })
  }
})

// Get table column metadata
router.get('/:id/tables/:tableId/columns', async (req, res) => {
  try {
    const columns = await datasetService.getTableColumns(req.params.id, req.params.tableId)

    res.json({
      columns
    })
  } catch (error: any) {
    console.error('Get table columns error:', error)
    res.status(500).json({ error: 'Failed to get table columns', message: error.message })
  }
})

// Update column metadata
router.patch('/:id/tables/:tableId/columns/:columnName', async (req, res) => {
  try {
    const { displayName, description, isHidden, displayType } = req.body

    await datasetService.updateColumnMetadata(
      req.params.id,
      req.params.tableId,
      req.params.columnName,
      { displayName, description, isHidden, displayType }
    )

    res.json({ success: true, message: 'Column metadata updated' })
  } catch (error: any) {
    console.error('Update column metadata error:', error)
    res.status(500).json({ error: 'Failed to update column metadata', message: error.message })
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

// Delete table from dataset
router.delete('/:id/tables/:tableId', async (req, res) => {
  try {
    await datasetService.deleteTable(req.params.id, req.params.tableId)
    res.json({ success: true, message: 'Table deleted successfully' })
  } catch (error: any) {
    console.error('Delete table error:', error)
    res.status(500).json({ error: 'Failed to delete table', message: error.message })
  }
})

export default router
