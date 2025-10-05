import { parseCSVFile, ColumnMetadataConfig } from '../fileParser'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('File Parser', () => {
  let tempDir: string

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileparser-test-'))
  })

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('Column Metadata Extraction', () => {
    test('should extract display names from specified row', async () => {
      const testFile = path.join(tempDir, 'test.tsv')
      const content = [
        '#Patient ID\tAge\tGender',                        // Row 0: Display names
        '#Patient identifier\tAge in years\tPatient gender', // Row 1: Descriptions
        '#STRING\tNUMBER\tSTRING',                         // Row 2: Data types
        '#1\t2\t3',                                        // Row 3: Priorities
        'PATIENT_ID\tAGE\tGENDER',                         // Row 4: Header
        'P001\t45\tMale'                                   // Row 5: Data
      ].join('\n')

      await fs.writeFile(testFile, content)

      const config: ColumnMetadataConfig = {
        displayNameRow: 0,
        descriptionRow: 1,
        dataTypeRow: 2,
        priorityRow: 3
      }

      const result = await parseCSVFile(testFile, 4, '\t', config)

      expect(result.columns[0].displayName).toBe('Patient ID')
      expect(result.columns[1].displayName).toBe('Age')
      expect(result.columns[2].displayName).toBe('Gender')
    })

    test('should extract descriptions from specified row', async () => {
      const testFile = path.join(tempDir, 'test.tsv')
      const content = [
        '#Patient ID\tAge\tGender',
        '#Patient identifier\tAge in years\tPatient gender',
        '#STRING\tNUMBER\tSTRING',
        '#1\t2\t3',
        'PATIENT_ID\tAGE\tGENDER',
        'P001\t45\tMale'
      ].join('\n')

      await fs.writeFile(testFile, content)

      const config: ColumnMetadataConfig = {
        displayNameRow: 0,
        descriptionRow: 1,
        dataTypeRow: 2,
        priorityRow: 3
      }

      const result = await parseCSVFile(testFile, 4, '\t', config)

      expect(result.columns[0].description).toBe('Patient identifier')
      expect(result.columns[1].description).toBe('Age in years')
      expect(result.columns[2].description).toBe('Patient gender')
    })

    test('should extract data types from specified row', async () => {
      const testFile = path.join(tempDir, 'test.tsv')
      const content = [
        '#Patient ID\tAge\tGender',
        '#Patient identifier\tAge in years\tPatient gender',
        '#STRING\tNUMBER\tSTRING',
        '#1\t2\t3',
        'PATIENT_ID\tAGE\tGENDER',
        'P001\t45\tMale'
      ].join('\n')

      await fs.writeFile(testFile, content)

      const config: ColumnMetadataConfig = {
        displayNameRow: 0,
        descriptionRow: 1,
        dataTypeRow: 2,
        priorityRow: 3
      }

      const result = await parseCSVFile(testFile, 4, '\t', config)

      expect(result.columns[0].userDataType).toBe('STRING')
      expect(result.columns[1].userDataType).toBe('NUMBER')
      expect(result.columns[2].userDataType).toBe('STRING')
    })

    test('should extract priorities from specified row', async () => {
      const testFile = path.join(tempDir, 'test.tsv')
      const content = [
        '#Patient ID\tAge\tGender',
        '#Patient identifier\tAge in years\tPatient gender',
        '#STRING\tNUMBER\tSTRING',
        '#1\t2\t3',
        'PATIENT_ID\tAGE\tGENDER',
        'P001\t45\tMale'
      ].join('\n')

      await fs.writeFile(testFile, content)

      const config: ColumnMetadataConfig = {
        displayNameRow: 0,
        descriptionRow: 1,
        dataTypeRow: 2,
        priorityRow: 3
      }

      const result = await parseCSVFile(testFile, 4, '\t', config)

      expect(result.columns[0].userPriority).toBe(1)
      expect(result.columns[1].userPriority).toBe(2)
      expect(result.columns[2].userPriority).toBe(3)
    })

    test('should strip leading # from display names', async () => {
      const testFile = path.join(tempDir, 'test.tsv')
      const content = [
        '#Patient ID\t#Age\t#Gender',
        'PATIENT_ID\tAGE\tGENDER',
        'P001\t45\tMale'
      ].join('\n')

      await fs.writeFile(testFile, content)

      const config: ColumnMetadataConfig = {
        displayNameRow: 0
      }

      const result = await parseCSVFile(testFile, 1, '\t', config)

      expect(result.columns[0].displayName).toBe('Patient ID')
      expect(result.columns[1].displayName).toBe('Age')
      expect(result.columns[2].displayName).toBe('Gender')
    })

    test('should work without column metadata config', async () => {
      const testFile = path.join(tempDir, 'test.tsv')
      const content = [
        'PATIENT_ID\tAGE\tGENDER',
        'P001\t45\tMale'
      ].join('\n')

      await fs.writeFile(testFile, content)

      const result = await parseCSVFile(testFile, 0, '\t')

      expect(result.columns[0].displayName).toBeUndefined()
      expect(result.columns[0].description).toBeUndefined()
      expect(result.columns[0].userDataType).toBeUndefined()
      expect(result.columns[0].userPriority).toBeUndefined()
    })
  })

  describe('Type Detection', () => {
    test('should detect numeric columns as Int32 or Float64', async () => {
      const testFile = path.join(tempDir, 'test.tsv')
      const content = [
        'ID\tAGE\tSCORE',
        '1\t45\t98.5',
        '2\t32\t87.3'
      ].join('\n')

      await fs.writeFile(testFile, content)

      const result = await parseCSVFile(testFile, 0, '\t')

      expect(result.columns[0].type).toBe('Int32')
      expect(result.columns[1].type).toBe('Int32')
      expect(result.columns[2].type).toBe('Float64')
    })

    test('should detect string columns', async () => {
      const testFile = path.join(tempDir, 'test.tsv')
      const content = [
        'NAME\tCITY',
        'John\tNew York',
        'Jane\tLos Angeles'
      ].join('\n')

      await fs.writeFile(testFile, content)

      const result = await parseCSVFile(testFile, 0, '\t')

      expect(result.columns[0].type).toBe('String')
      expect(result.columns[1].type).toBe('String')
    })
  })

  describe('Data Parsing', () => {
    test('should skip specified number of rows', async () => {
      const testFile = path.join(tempDir, 'test.tsv')
      const content = [
        '#Metadata row 1',
        '#Metadata row 2',
        '#Metadata row 3',
        'ID\tNAME',
        '1\tJohn',
        '2\tJane'
      ].join('\n')

      await fs.writeFile(testFile, content)

      const result = await parseCSVFile(testFile, 3, '\t')

      expect(result.rowCount).toBe(2)
      expect(result.rows[0][1]).toBe('John')
      expect(result.rows[1][1]).toBe('Jane')
    })

    test('should handle CSV delimiter', async () => {
      const testFile = path.join(tempDir, 'test.csv')
      const content = [
        'ID,NAME,AGE',
        '1,John,45',
        '2,Jane,32'
      ].join('\n')

      await fs.writeFile(testFile, content)

      const result = await parseCSVFile(testFile, 0, ',')

      expect(result.columns.length).toBe(3)
      expect(result.columns[0].type).toBe('Int32')
      expect(result.columns[1].type).toBe('String')
      expect(result.columns[2].type).toBe('Int32')
      expect(result.rowCount).toBe(2)
    })
  })
})
