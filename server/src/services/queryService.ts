import clickhouseClient from '../config/clickhouse.js'

export const executeQuery = async (query: string) => {
  try {
    const result = await clickhouseClient.query({
      query,
      format: 'JSONEachRow',
    })
    return await result.json()
  } catch (error) {
    console.error('Query execution error:', error)
    throw error
  }
}

export const getTablesList = async () => {
  const query = 'SHOW TABLES'
  return executeQuery(query)
}
