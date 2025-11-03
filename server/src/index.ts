import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import apiRoutes from './routes/api.js'
import datasetsRoutes from './routes/datasets.js'
import databasesRoutes from './routes/databases.js'
import dashboardService from './services/dashboardService.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001

app.use(cors())
app.use(express.json())

app.use('/api', apiRoutes)
app.use('/api/datasets', datasetsRoutes)
app.use('/api/databases', databasesRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'BIAI Server is running' })
})

// Initialize dashboard table
dashboardService.initializeTable().then(() => {
  console.log('Dashboard table initialized')
}).catch(err => {
  console.error('Failed to initialize dashboard table:', err)
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
