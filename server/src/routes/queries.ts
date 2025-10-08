import { Router } from 'express'
import { executeQuery, getTablesList } from '../services/queryService.js'

const router = Router()

router.get('/tables', async (_req, res) => {
  try {
    const tables = await getTablesList()
    return res.json({ success: true, data: tables })
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch tables' })
  }
})

router.post('/execute', async (req, res) => {
  try {
    const { query } = req.body
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' })
    }
    const result = await executeQuery(query)
    return res.json({ success: true, data: result })
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Query execution failed' })
  }
})

export default router
