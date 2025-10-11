import { Router } from 'express'
import queriesRouter from './queries.js'

const router = Router()

router.get('/test', (_req, res) => {
  return res.json({ message: 'API is working' })
})

router.use('/queries', queriesRouter)

export default router
