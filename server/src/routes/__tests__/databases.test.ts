import { describe, test, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'

const { queryMock, closeMock, datasetMetadataMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  closeMock: vi.fn(),
  datasetMetadataMock: vi.fn()
}))

vi.mock('../../config/clickhouse.js', () => ({
  default: {
    query: queryMock
  },
  createClickHouseClient: vi.fn(() => ({
    query: queryMock,
    close: closeMock
  }))
}))

vi.mock('../../services/datasetService.js', () => ({
  default: {
    getDatasetMetadata: datasetMetadataMock
  }
}))

import databasesRouter from '../databases.js'

const app = express()
app.use(express.json())
app.use('/api/databases', databasesRouter)

describe('Databases API Routes', () => {
  beforeEach(() => {
    queryMock.mockReset()
    closeMock.mockReset()
    datasetMetadataMock.mockReset()
  })

  test('GET /api/databases returns non-system databases', async () => {
    queryMock.mockResolvedValue({
      json: async () => [
        { name: 'biai' },
        { name: 'system' },
        { name: 'analytics' },
        { name: 'INFORMATION_SCHEMA' }
      ]
    } as any)

    const response = await request(app).get('/api/databases')

    expect(response.status).toBe(200)
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(response.body.databases).toEqual([
      { name: 'biai' },
      { name: 'analytics' }
    ])
  })

  test('GET /api/databases handles ClickHouse errors', async () => {
    queryMock.mockRejectedValue(new Error('unavailable'))

    const response = await request(app).get('/api/databases')

    expect(response.status).toBe(500)
    expect(response.body.error).toBe('Failed to list databases')
  })

  test('POST /api/databases/list retrieves databases for custom host', async () => {
    queryMock.mockResolvedValueOnce({
      json: async () => [
        { name: 'analytics' },
        { name: 'system' }
      ]
    } as any)

    const response = await request(app)
      .post('/api/databases/list')
      .send({ host: 'remote.clickhouse.local', secure: true, username: 'readonly', password: 'secret' })

    expect(response.status).toBe(200)
    expect(response.body.databases).toEqual([{ name: 'analytics' }])
    expect(closeMock).toHaveBeenCalledTimes(1)
  })
})
