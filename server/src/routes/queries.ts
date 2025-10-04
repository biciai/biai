import { Router } from 'express'
import { executeQuery, getTablesList } from '../services/queryService.js'

const router = Router()

router.get('/tables', async (req, res) => {
  try {
    const tables = await getTablesList()
    res.json({ success: true, data: tables })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch tables' })
  }
})

router.post('/execute', async (req, res) => {
  try {
    const { query } = req.body
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' })
    }
    const result = await executeQuery(query)
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Query execution failed' })
  }
})

export default router
