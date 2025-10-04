import { createClient } from '@clickhouse/client'
import dotenv from 'dotenv'

dotenv.config()

const clickhouseClient = createClient({
  url: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DATABASE || 'biai',
})

export const testConnection = async () => {
  try {
    const result = await clickhouseClient.query({
      query: 'SELECT 1',
      format: 'JSONEachRow',
    })
    const data = await result.json()
    console.log('ClickHouse connection successful:', data)
    return true
  } catch (error) {
    console.error('ClickHouse connection failed:', error)
    return false
  }
}

export default clickhouseClient
