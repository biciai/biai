import express from 'express'
import multer from 'multer'
import { parseCSVFile, detectSkipRows } from '../services/fileParser.js'
import datasetService from '../services/datasetService.js'
import aggregationService from '../services/aggregationService.js'
import { unlink } from 'fs/promises'
import { fetchFileFromUrl } from '../utils/urlFetcher.js'
import { detectForeignKeys } from '../services/foreignKeyDetector.js'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'

const router = express.Router()

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for actual upload
    fieldSize: 10 * 1024 * 1024 // 10MB for URL field
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['.csv', '.txt', '.tsv']
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'))
    if (allowedTypes.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV, TSV, and TXT files are allowed'))
    }
  }
})

const sanitizeConnectionSettings = (raw?: string) => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.host) {
      return null
    }
    const { host, port, protocol, username } = parsed
    return { host, port, protocol, username }
  } catch (error) {
    console.warn('Failed to parse connection settings for response:', error)
    return null
  }
}

// Create a new dataset
router.post('/', async (req, res) => {
  try {
    const { name, description = '', tags = [], source = '', citation = '', references = [], customMetadata = {} } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Dataset name is required' })
    }

    const dataset = await datasetService.createDataset(name, description, 'system', tags, source, citation, references, customMetadata)

    return res.json({
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
    return res.status(500).json({ error: 'Failed to create dataset', message: error.message })
  }
})

// Connect to existing database
router.post('/connect', async (req, res) => {
  try {
    const {
      databaseName,
      displayName,
      description = '',
      tags = [],
      customMetadata = {},
      host,
      port,
      protocol,
      secure,
      username,
      password
    } = req.body

    if (!databaseName || !displayName || !host) {
      return res.status(400).json({ error: 'Database name, display name, and host are required' })
    }

    const resolvedProtocol: 'http' | 'https' =
      protocol === 'https' || secure === true ? 'https' : 'http'

    const connectionSettings = {
      host,
      port: port !== undefined && port !== null && port !== '' ? Number(port) : undefined,
      protocol: resolvedProtocol,
      username: username || undefined,
      password: password || undefined
    }

    const dataset = await datasetService.connectDatabase(
      databaseName,
      displayName,
      description,
      'system',
      tags,
      customMetadata,
      connectionSettings
    )

    const connectionInfo = sanitizeConnectionSettings(dataset.connection_settings)

    return res.json({
      success: true,
      dataset: {
        id: dataset.dataset_id,
        name: dataset.dataset_name,
        database_name: dataset.database_name,
        database_type: dataset.database_type,
        description: dataset.description,
        tags: dataset.tags,
        connectionInfo,
        createdAt: dataset.created_at
      }
    })
  } catch (error: any) {
    console.error('Connect database error:', error)
    return res.status(500).json({ error: 'Failed to connect database', message: error.message })
  }
})

// Preview table data before importing
router.post('/:id/tables/preview', upload.single('file'), async (req, res) => {
  let tempFilePath: string | null = null

  try {
    const {
      fileUrl,
      skipRows = '0',
      delimiter = '\t'
    } = req.body

    // Handle either file upload or URL
    let filePath: string
    let filename: string

    if (fileUrl) {
      // Fetch file from URL
      tempFilePath = path.join('uploads', `preview_${uuidv4()}`)
      const fetchedFile = await fetchFileFromUrl(fileUrl, tempFilePath)
      filePath = fetchedFile.path
      filename = fetchedFile.filename
    } else if (req.file) {
      // Use uploaded file
      filePath = req.file.path
      filename = req.file.originalname
      tempFilePath = filePath
    } else {
      return res.status(400).json({ error: 'Either file upload or fileUrl is required' })
    }

    // Auto-detect skipRows if set to 0 - check if first rows start with #
    let finalSkipRows = parseInt(skipRows, 10)
    let detectedSkipRows: number | undefined

    if (finalSkipRows === 0) {
      const detectedRows = await detectSkipRows(filePath, delimiter)
      if (detectedRows > 0) {
        detectedSkipRows = detectedRows
        finalSkipRows = detectedRows
      }
    }

    // Parse the file in preview mode (only reads first ~100 rows)
    const parsedData = await parseCSVFile(
      filePath,
      finalSkipRows,
      delimiter,
      undefined,
      true // previewOnly mode
    )

    // Get existing tables in the dataset to detect potential foreign keys
    const dataset = await datasetService.getDataset(req.params.id)
    const existingTables = dataset?.tables || []

    // Detect potential foreign keys
    const detectedRelationships = await detectForeignKeys(
      parsedData,
      existingTables
    )

    // Clean up temporary file
    await unlink(tempFilePath)
    tempFilePath = null

    // Return preview data with sample rows
    const sampleRows = parsedData.rows.slice(0, 10)

    return res.json({
      success: true,
      preview: {
        filename,
        columns: parsedData.columns,
        sampleRows,
        totalRows: parsedData.rowCount,
        detectedRelationships,
        detectedSkipRows
      }
    })
  } catch (error: any) {
    console.error('Preview error:', error)

    if (tempFilePath) {
      try {
        await unlink(tempFilePath)
      } catch (e) {}
    }

    return res.status(500).json({ error: 'Failed to preview table', message: error.message })
  }
})

// Add table to existing dataset
router.post('/:id/tables', upload.single('file'), async (req, res) => {
  let tempFilePath: string | null = null

  try {
    // Set a longer timeout for large file processing
    req.setTimeout(600000) // 10 minutes
    res.setTimeout(600000)
    const {
      fileUrl,
      tableName,
      displayName,
      skipRows = '0',
      delimiter = '\t',
      primaryKey,
      customMetadata = '{}',
      relationships = '[]',
      columnMetadataConfig = '{}'
    } = req.body

    // Handle either file upload or URL
    let filePath: string
    let filename: string
    let mimetype: string

    if (fileUrl) {
      // Fetch file from URL
      tempFilePath = path.join('uploads', `url_${uuidv4()}`)
      const fetchedFile = await fetchFileFromUrl(fileUrl, tempFilePath)
      filePath = fetchedFile.path
      filename = fetchedFile.filename
      mimetype = fetchedFile.mimetype
    } else if (req.file) {
      // Use uploaded file
      filePath = req.file.path
      filename = req.file.originalname
      mimetype = req.file.mimetype
      tempFilePath = filePath
    } else {
      return res.status(400).json({ error: 'Either file upload or fileUrl is required' })
    }

    if (!tableName) {
      await unlink(tempFilePath)
      return res.status(400).json({ error: 'Table name is required' })
    }

    // Validate table name (alphanumeric and underscores only)
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      await unlink(tempFilePath)
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
      filePath,
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
      await unlink(tempFilePath)
      return res.status(400).json({ error: 'Invalid JSON in customMetadata or relationships' })
    }

    const table = await datasetService.addTableToDataset(
      req.params.id,
      tableName,
      displayName || tableName,
      filename,
      mimetype,
      parsedData,
      primaryKey,
      parsedCustomMetadata,
      parsedRelationships
    )

    await unlink(tempFilePath)
    tempFilePath = null

    return res.json({
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

    if (tempFilePath) {
      try {
        await unlink(tempFilePath)
      } catch (e) {}
    }

    return res.status(500).json({ error: 'Failed to add table', message: error.message })
  }
})

// List all datasets
router.get('/', async (_req, res) => {
  try {
    const datasets = await datasetService.listDatasets()
    res.json({
      datasets: datasets.map(d => ({
        id: d.dataset_id,
        name: d.dataset_name,
        database_name: d.database_name,
        database_type: d.database_type,
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
        connectionInfo: sanitizeConnectionSettings(d.connection_settings),
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

    const connectionInfo = sanitizeConnectionSettings(dataset.connection_settings)

    return res.json({
      dataset: {
        id: dataset.dataset_id,
        name: dataset.dataset_name,
        database_name: dataset.database_name,
        database_type: dataset.database_type,
        description: dataset.description,
        tags: dataset.tags,
        source: dataset.source,
        citation: dataset.citation,
        references: dataset.references,
        customMetadata: dataset.custom_metadata,
        connectionInfo,
        tables: dataset.tables?.map(t => ({
          id: t.table_id,
          name: t.table_name,
          displayName: t.display_name,
          filename: t.original_filename,
          rowCount: t.row_count,
          columns: t.schema_json ? JSON.parse(t.schema_json) : [],
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
    return res.status(500).json({ error: 'Failed to get dataset', message: error.message })
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

// Update table primary key
router.patch('/:id/tables/:tableId/primary-key', async (req, res) => {
  try {
    const primaryKey = req.body.primaryKey === undefined ? null : req.body.primaryKey
    if (primaryKey !== null && typeof primaryKey !== 'string') {
      return res.status(400).json({ error: 'Primary key must be a string or null' })
    }

    await datasetService.updatePrimaryKey(req.params.id, req.params.tableId, primaryKey)
    res.json({ success: true })
  } catch (error: any) {
    console.error('Update primary key error:', error)
    res.status(500).json({ error: 'Failed to update primary key', message: error.message })
  }
})

// Add table relationship
router.post('/:id/tables/:tableId/relationships', async (req, res) => {
  try {
    const { foreignKey, referencedTableId, referencedColumn, type } = req.body

    if (!foreignKey || !referencedTableId || !referencedColumn) {
      return res.status(400).json({ error: 'foreignKey, referencedTableId, and referencedColumn are required' })
    }

    await datasetService.addRelationship(req.params.id, req.params.tableId, {
      foreign_key: foreignKey,
      referenced_table: referencedTableId,
      referenced_column: referencedColumn,
      type
    })

    res.json({ success: true })
  } catch (error: any) {
    console.error('Add relationship error:', error)
    res.status(500).json({ error: 'Failed to add relationship', message: error.message })
  }
})

// Remove table relationship
router.delete('/:id/tables/:tableId/relationships', async (req, res) => {
  try {
    const { foreignKey, referencedTable, referencedColumn } = req.query

    if (!foreignKey || !referencedTable || !referencedColumn) {
      return res.status(400).json({ error: 'foreignKey, referencedTable, and referencedColumn are required' })
    }

    await datasetService.deleteRelationship(
      req.params.id,
      req.params.tableId,
      {
        foreign_key: String(foreignKey),
        referenced_table: String(referencedTable),
        referenced_column: String(referencedColumn)
      }
    )

    res.json({ success: true })
  } catch (error: any) {
    console.error('Delete relationship error:', error)
    res.status(500).json({ error: 'Failed to delete relationship', message: error.message })
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

// Get aggregated data for all columns in a table
router.get('/:id/tables/:tableId/aggregations', async (req, res) => {
  try {
    // Parse filters from query string
    let filters = []
    if (req.query.filters) {
      try {
        filters = JSON.parse(req.query.filters as string)
      } catch (e) {
        return res.status(400).json({ error: 'Invalid filters JSON' })
      }
    }

    const aggregations = await aggregationService.getTableAggregations(
      req.params.id,
      req.params.tableId,
      filters
    )

    return res.json({
      aggregations
    })
  } catch (error: any) {
    console.error('Get table aggregations error:', error)
    return res.status(500).json({ error: 'Failed to get table aggregations', message: error.message })
  }
})

// Get aggregated data for a specific column
router.get('/:id/tables/:tableId/columns/:columnName/aggregation', async (req, res) => {
  try {
    const { displayType } = req.query

    if (!displayType) {
      return res.status(400).json({ error: 'displayType query parameter is required' })
    }

    const aggregation = await aggregationService.getColumnAggregation(
      req.params.id,
      req.params.tableId,
      req.params.columnName,
      displayType as string
    )

    return res.json({
      aggregation
    })
  } catch (error: any) {
    console.error('Get column aggregation error:', error)
    return res.status(500).json({ error: 'Failed to get column aggregation', message: error.message })
  }
})

export default router
