import { describe, test, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn()
}))

vi.mock('../../config/clickhouse.js', () => ({
  default: {
    query: queryMock
  }
}))

import databasesRouter from '../databases.js'

const app = express()
app.use('/api/databases', databasesRouter)

describe('Databases API Routes', () => {
  beforeEach(() => {
    queryMock.mockReset()
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
})
