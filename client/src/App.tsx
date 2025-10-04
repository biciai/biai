import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import DatasetsV2 from './pages/DatasetsV2'
import DatasetDetail from './pages/DatasetDetail'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function App() {
  return (
    <Router>
      <div className="app">
        <nav className="navbar">
          <h1>BIAI</h1>
          <ul>
            <li><Link to="/">Dashboard</Link></li>
            <li><Link to="/datasets">Datasets</Link></li>
            <li><Link to="/reports">Reports</Link></li>
            <li><Link to="/settings">Settings</Link></li>
          </ul>
        </nav>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/datasets" element={<DatasetsV2 />} />
            <Route path="/datasets/:id" element={<DatasetDetail />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
