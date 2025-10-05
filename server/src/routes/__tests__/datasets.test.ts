import { describe, test, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'

// Mock the services
vi.mock('../../services/datasetService.js', () => ({
  default: {
    createDataset: vi.fn(),
    listDatasets: vi.fn(),
    getDataset: vi.fn(),
    getTableColumns: vi.fn(),
    updateColumnMetadata: vi.fn(),
    deleteDataset: vi.fn()
  }
}))

import datasetsRouter from '../datasets.js'
import datasetService from '../../services/datasetService.js'

const mockCreateDataset = vi.mocked(datasetService.createDataset)
const mockListDatasets = vi.mocked(datasetService.listDatasets)
const mockGetDataset = vi.mocked(datasetService.getDataset)
const mockGetTableColumns = vi.mocked(datasetService.getTableColumns)
const mockUpdateColumnMetadata = vi.mocked(datasetService.updateColumnMetadata)
const mockDeleteDataset = vi.mocked(datasetService.deleteDataset)

const app = express()
app.use(express.json())
app.use('/api/datasets', datasetsRouter)

describe('Datasets API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/datasets', () => {
    test('should create a new dataset', async () => {
      const mockDataset = {
        dataset_id: 'test-id',
        dataset_name: 'Test Dataset',
        description: 'Test description',
        tags: ['test'],
        created_at: new Date(),
        updated_at: new Date()
      }

      mockCreateDataset.mockResolvedValue(mockDataset as any)

      const response = await request(app)
        .post('/api/datasets')
        .send({
          name: 'Test Dataset',
          description: 'Test description',
          tags: ['test']
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.dataset.name).toBe('Test Dataset')
      expect(mockCreateDataset).toHaveBeenCalledWith(
        'Test Dataset',
        'Test description',
        'system',
        ['test'],
        '',
        '',
        [],
        {}
      )
    })

    test('should return 400 if name is missing', async () => {
      const response = await request(app)
        .post('/api/datasets')
        .send({
          description: 'Test description'
        })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Dataset name is required')
    })
  })

  describe('GET /api/datasets', () => {
    test('should list all datasets', async () => {
      const mockDatasets = [
        {
          dataset_id: '1',
          dataset_name: 'Dataset 1',
          description: 'Desc 1',
          tags: [],
          tables: [],
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          dataset_id: '2',
          dataset_name: 'Dataset 2',
          description: 'Desc 2',
          tags: [],
          tables: [],
          created_at: new Date(),
          updated_at: new Date()
        }
      ]

      mockListDatasets.mockResolvedValue(mockDatasets as any)

      const response = await request(app).get('/api/datasets')

      expect(response.status).toBe(200)
      expect(response.body.datasets).toHaveLength(2)
      expect(response.body.datasets[0].name).toBe('Dataset 1')
    })
  })

  describe('GET /api/datasets/:id', () => {
    test('should get dataset by id', async () => {
      const mockDataset = {
        dataset_id: 'test-id',
        dataset_name: 'Test Dataset',
        description: 'Test description',
        tags: ['test'],
        tables: [],
        created_at: new Date(),
        updated_at: new Date()
      }

      mockGetDataset.mockResolvedValue(mockDataset as any)

      const response = await request(app).get('/api/datasets/test-id')

      expect(response.status).toBe(200)
      expect(response.body.dataset.name).toBe('Test Dataset')
      expect(mockGetDataset).toHaveBeenCalledWith('test-id')
    })

    test('should return 404 if dataset not found', async () => {
      mockGetDataset.mockResolvedValue(null)

      const response = await request(app).get('/api/datasets/nonexistent')

      expect(response.status).toBe(404)
      expect(response.body.error).toBe('Dataset not found')
    })
  })

  describe('GET /api/datasets/:id/tables/:tableId/columns', () => {
    test('should get table columns', async () => {
      const mockColumns = [
        {
          column_name: 'id',
          column_type: 'String',
          display_name: 'ID',
          description: 'Primary key',
          display_type: 'id'
        },
        {
          column_name: 'name',
          column_type: 'String',
          display_name: 'Name',
          description: 'Patient name',
          display_type: 'text'
        }
      ]

      mockGetTableColumns.mockResolvedValue(mockColumns as any)

      const response = await request(app)
        .get('/api/datasets/dataset-id/tables/table-id/columns')

      expect(response.status).toBe(200)
      expect(response.body.columns).toHaveLength(2)
      expect(response.body.columns[0].column_name).toBe('id')
      expect(mockGetTableColumns).toHaveBeenCalledWith('dataset-id', 'table-id')
    })
  })

  describe('PATCH /api/datasets/:id/tables/:tableId/columns/:columnName', () => {
    test('should update column metadata', async () => {
      mockUpdateColumnMetadata.mockResolvedValue(undefined)

      const response = await request(app)
        .patch('/api/datasets/dataset-id/tables/table-id/columns/age')
        .send({
          displayName: 'Patient Age',
          description: 'Age in years',
          isHidden: false
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(mockUpdateColumnMetadata).toHaveBeenCalledWith(
        'dataset-id',
        'table-id',
        'age',
        {
          displayName: 'Patient Age',
          description: 'Age in years',
          isHidden: false,
          displayType: undefined
        }
      )
    })

    test('should update display type', async () => {
      mockUpdateColumnMetadata.mockResolvedValue(undefined)

      const response = await request(app)
        .patch('/api/datasets/dataset-id/tables/table-id/columns/status')
        .send({
          displayType: 'category'
        })

      expect(response.status).toBe(200)
      expect(mockUpdateColumnMetadata).toHaveBeenCalledWith(
        'dataset-id',
        'table-id',
        'status',
        expect.objectContaining({
          displayType: 'category'
        })
      )
    })
  })

  describe('DELETE /api/datasets/:id', () => {
    test('should delete dataset', async () => {
      mockDeleteDataset.mockResolvedValue(undefined)

      const response = await request(app).delete('/api/datasets/test-id')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.message).toBe('Dataset deleted successfully')
      expect(mockDeleteDataset).toHaveBeenCalledWith('test-id')
    })
  })

  describe('Error Handling', () => {
    test('should handle service errors gracefully', async () => {
      mockListDatasets.mockRejectedValue(new Error('Database error'))

      const response = await request(app).get('/api/datasets')

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('Failed to list datasets')
    })
  })
})
