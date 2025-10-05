const FormData = require('form-data')
const fs = require('fs')
const path = require('path')
const axios = require('axios')

const API_URL = 'http://localhost:5001/api'

/**
 * Parse metadata file in key-value format
 */
function parseMetadataFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const metadata = {}
  let currentKey = null
  let currentArray = []
  let currentObject = {}
  let inArray = false
  let inObject = false
  let baseIndent = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue

    // Measure indentation
    const indent = line.length - line.trimStart().length
    const trimmedLine = line.trim()

    // Check if this is an array item
    if (trimmedLine.startsWith('-')) {
      if (!inArray && currentKey) {
        // First array item - switch to array mode
        inArray = true
        inObject = false
        currentArray = []
        baseIndent = indent
      }
      if (inArray && currentKey) {
        currentArray.push(trimmedLine.substring(1).trim())
      }
      continue
    }

    // Parse key-value pair
    const colonIndex = trimmedLine.indexOf(':')
    if (colonIndex === -1) continue

    const key = trimmedLine.substring(0, colonIndex).trim()
    const value = trimmedLine.substring(colonIndex + 1).trim()

    // If we're in an object and see non-indented key, save object
    if (inObject && indent <= baseIndent && currentKey) {
      metadata[currentKey] = currentObject
      currentObject = {}
      inObject = false
      currentKey = null
    }

    // If we're in an array and see non-indented key, save array
    if (inArray && indent <= baseIndent && currentKey) {
      metadata[currentKey] = currentArray
      currentArray = []
      inArray = false
      currentKey = null
    }

    // Nested key-value (part of object)
    if (inObject && indent > baseIndent && currentKey) {
      currentObject[key] = parseValue(value, key)
      continue
    }

    // Top-level key
    if (!value) {
      // Starting a multi-line structure
      currentKey = key
      baseIndent = indent
      // Peek ahead to determine if it's array or object
      // Check next non-empty line
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim()
        if (!nextLine || nextLine.startsWith('#')) continue
        if (nextLine.startsWith('-')) {
          inArray = true
          currentArray = []
          break
        } else {
          inObject = true
          currentObject = {}
          break
        }
      }
    } else {
      // Single-line value
      metadata[key] = parseValue(value, key)
    }
  }

  // Save any remaining array or object
  if (inArray && currentKey) {
    metadata[currentKey] = currentArray
  }
  if (inObject && currentKey) {
    metadata[currentKey] = currentObject
  }

  return metadata
}

function parseValue(value, key = '') {
  // Boolean
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false

  // Number
  if (/^\d+$/.test(value)) return parseInt(value, 10)
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value)

  // Array (comma-separated) - only for known array fields
  if (value.includes(',') && ['tags', 'groups'].includes(key)) {
    return value.split(',').map(v => v.trim())
  }

  // String
  return value
}

/**
 * Upload dataset with metadata from a directory
 */
async function uploadDatasetWithMetadata(datasetDir) {
  try {
    console.log(`\n📁 Processing dataset directory: ${datasetDir}\n`)

    // Read dataset metadata
    const datasetMetaPath = path.join(datasetDir, 'dataset.meta')
    const datasetMeta = parseMetadataFile(datasetMetaPath)

    console.log('📋 Dataset metadata:', JSON.stringify(datasetMeta, null, 2))

    // Create dataset
    const datasetResponse = await axios.post(`${API_URL}/datasets`, {
      name: datasetMeta.name || path.basename(datasetDir),
      description: datasetMeta.description || '',
      tags: Array.isArray(datasetMeta.tags) ? datasetMeta.tags : (datasetMeta.tags ? [datasetMeta.tags] : []),
      source: datasetMeta.source || '',
      citation: datasetMeta.citation || '',
      references: Array.isArray(datasetMeta.references) ? datasetMeta.references : (datasetMeta.references ? [datasetMeta.references] : []),
      customMetadata: extractCustomMetadata(datasetMeta, ['name', 'description', 'tags', 'source', 'citation', 'references'])
    })

    const datasetId = datasetResponse.data.dataset.id
    console.log(`✅ Dataset created with ID: ${datasetId}\n`)

    // Find all .meta files for tables
    const files = fs.readdirSync(datasetDir)
    const tableMetaFiles = files.filter(f => f.endsWith('.meta') && f !== 'dataset.meta')

    if (tableMetaFiles.length === 0) {
      console.log('⚠️  No table metadata files found')
      return
    }

    // Upload each table
    for (const metaFile of tableMetaFiles) {
      const tableMeta = parseMetadataFile(path.join(datasetDir, metaFile))

      // Get data file
      const dataFile = tableMeta.data_file || tableMeta.data_filename
      if (!dataFile) {
        console.log(`⚠️  No data_file specified in ${metaFile}, skipping`)
        continue
      }

      const dataFilePath = path.join(datasetDir, dataFile)
      if (!fs.existsSync(dataFilePath)) {
        console.log(`⚠️  Data file ${dataFile} not found, skipping`)
        continue
      }

      console.log(`📊 Uploading table: ${tableMeta.display_name || tableMeta.table_name || dataFile}`)

      // Prepare form data
      const formData = new FormData()
      formData.append('file', fs.createReadStream(dataFilePath))
      formData.append('tableName', tableMeta.table_name || path.basename(dataFile, path.extname(dataFile)))
      formData.append('displayName', tableMeta.display_name || tableMeta.table_name || dataFile)
      formData.append('skipRows', (tableMeta.skip_rows || 0).toString())

      // Parse delimiter
      let delimiter = tableMeta.delimiter || tableMeta.Delimiter || '\t'
      if (delimiter.toLowerCase() === 'tab') delimiter = '\t'
      if (delimiter.toLowerCase() === 'comma') delimiter = ','
      formData.append('delimiter', delimiter)

      if (tableMeta.primary_key) {
        formData.append('primaryKey', tableMeta.primary_key)
      }

      // Add custom metadata
      const customMeta = extractCustomMetadata(tableMeta, [
        'data_file', 'data_filename', 'table_name', 'display_name',
        'skip_rows', 'delimiter', 'Delimiter', 'primary_key', 'foreign_key', 'references'
      ])
      formData.append('customMetadata', JSON.stringify(customMeta))

      // Add relationships if present
      if (tableMeta.relationship || tableMeta.foreign_key || tableMeta.relationships) {
        const relationships = parseRelationships(tableMeta)
        formData.append('relationships', JSON.stringify(relationships))
      }

      // Add column metadata configuration if present
      const columnMetadataConfig = {}
      if (tableMeta.column_display_name_row !== undefined) {
        columnMetadataConfig.displayNameRow = tableMeta.column_display_name_row
      }
      if (tableMeta.column_description_row !== undefined) {
        columnMetadataConfig.descriptionRow = tableMeta.column_description_row
      }
      if (tableMeta.column_datatype_row !== undefined) {
        columnMetadataConfig.dataTypeRow = tableMeta.column_datatype_row
      }
      if (tableMeta.column_priority_row !== undefined) {
        columnMetadataConfig.priorityRow = tableMeta.column_priority_row
      }

      if (Object.keys(columnMetadataConfig).length > 0) {
        formData.append('columnMetadataConfig', JSON.stringify(columnMetadataConfig))
      }

      // Upload table
      const tableResponse = await axios.post(
        `${API_URL}/datasets/${datasetId}/tables`,
        formData,
        { headers: formData.getHeaders() }
      )

      console.log(`   ✓ ${tableResponse.data.table.rowCount} rows, ${tableResponse.data.table.columns} columns`)
    }

    console.log(`\n✅ Dataset successfully uploaded!`)
    console.log(`   View at: http://localhost:3000/datasets/${datasetId}\n`)

  } catch (error) {
    console.error('\n❌ Upload failed:', error.response?.data || error.message)
    process.exit(1)
  }
}

/**
 * Extract custom metadata (fields not in core schema)
 */
function extractCustomMetadata(metadata, coreFields) {
  const custom = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (!coreFields.includes(key)) {
      custom[key] = value
    }
  }
  return custom
}

/**
 * Parse relationships from metadata
 */
function parseRelationships(tableMeta) {
  const relationships = []

  // Nested object format (preferred)
  if (tableMeta.relationship && typeof tableMeta.relationship === 'object' && !Array.isArray(tableMeta.relationship)) {
    // Only add if all required fields are present
    if (tableMeta.relationship.foreign_key && tableMeta.relationship.references_table && tableMeta.relationship.references_column) {
      relationships.push({
        foreign_key: tableMeta.relationship.foreign_key,
        referenced_table: tableMeta.relationship.references_table,
        referenced_column: tableMeta.relationship.references_column,
        type: tableMeta.relationship.type || 'many-to-one'
      })
    }
  }

  // Legacy format: separate foreign_key and references fields
  if (tableMeta.foreign_key && tableMeta.references) {
    // Parse: "(patient_id) references data_clinical_patient(sample_id)"
    const fkMatch = tableMeta.foreign_key.match(/\(([^)]+)\)/)
    const refMatch = tableMeta.references.match(/([a-zA-Z0-9_]+)\(([^)]+)\)/)

    if (fkMatch && refMatch) {
      relationships.push({
        foreign_key: fkMatch[1],
        referenced_table: refMatch[1],
        referenced_column: refMatch[2],
        type: 'many-to-one'
      })
    } else {
      // Simple format: foreign_key: column, references: table(column)
      const simpleRefMatch = tableMeta.references.match(/([a-zA-Z0-9_]+)\(([^)]+)\)/)
      if (simpleRefMatch) {
        relationships.push({
          foreign_key: tableMeta.foreign_key,
          referenced_table: simpleRefMatch[1],
          referenced_column: simpleRefMatch[2],
          type: 'many-to-one'
        })
      }
    }
  }

  // Array of relationships
  if (tableMeta.relationships && Array.isArray(tableMeta.relationships)) {
    relationships.push(...tableMeta.relationships)
  }

  return relationships
}

// Run with command line argument
const datasetDir = process.argv[2] || 'example_data/gbm_tcga_pan_can_atlas_2018'
uploadDatasetWithMetadata(datasetDir)
