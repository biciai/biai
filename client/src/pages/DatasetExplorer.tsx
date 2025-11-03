import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import Plot from 'react-plotly.js'
import type { PlotMouseEvent, PlotSelectionEvent } from 'plotly.js'
import SafeHtml from '../components/SafeHtml'
import api from '../services/api'
import { findRelationshipPath } from '../utils/filterHelpers'

interface Column {
  name: string
  type: string
  nullable: boolean
}

interface ColumnMetadata {
  column_name: string
  column_type: string
  column_index: number
  is_nullable: boolean
  display_name: string
  description: string
  user_data_type: string
  user_priority: number | null
  display_type: string
  unique_value_count: number
  null_count: number
  min_value: string | null
  max_value: string | null
  suggested_chart: string
  display_priority: number
  is_hidden: boolean
}

interface CategoryCount {
  value: string
  display_value: string
  count: number
  percentage: number
}

interface NumericStats {
  min: number
  max: number
  mean: number
  median: number
  stddev: number
  q25: number
  q75: number
}

interface HistogramBin {
  bin_start: number
  bin_end: number
  count: number
  percentage: number
}

interface ColumnAggregation {
  column_name: string
  display_type: string
  total_rows: number
  null_count: number
  unique_count: number
  categories?: CategoryCount[]
  numeric_stats?: NumericStats
  histogram?: HistogramBin[]
}

interface Filter {
  column?: string
  operator?: 'eq' | 'in' | 'gt' | 'lt' | 'gte' | 'lte' | 'between'
  value?: any
  and?: Filter[]
  or?: Filter[]
  not?: Filter
}

interface FilterPreset {
  id: string
  name: string
  filters: Filter[]
  createdAt: string
}

interface SavedDashboard {
  id: string
  name: string
  charts: Array<{ tableName: string; columnName: string; addedAt: string }>
  createdAt: string
  updatedAt: string
}

interface TableRelationship {
  foreign_key: string
  referenced_table: string
  referenced_column: string
  type?: string
}

interface Table {
  id: string
  name: string
  displayName: string
  rowCount: number
  columns: Column[]
  primaryKey?: string
  relationships?: TableRelationship[]
}

interface Dataset {
  id: string
  name: string
  database_name?: string
  database_type?: 'created' | 'connected'
  description: string
  tags?: string[]
  tables: Table[]
}

function DatasetExplorer() {
  const { id, database } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Determine if we're in database mode or dataset mode
  const isDatabaseMode = !!database
  const identifier = database || id
  const [dataset, setDataset] = useState<Dataset | null>(null)

  // Helper to determine if we should use database API
  // Use database API if:
  // 1. We're in database mode (viewing from /databases/:database), OR
  // 2. The dataset is a "connected" type (registered existing database)
  const usesDatabaseAPI = isDatabaseMode ? true : dataset?.database_type === 'connected'
  const databaseIdentifier = isDatabaseMode ? identifier : dataset?.database_name
  const datasetIdentifier = dataset?.id
  const [loading, setLoading] = useState(true)
  const [columnMetadata, setColumnMetadata] = useState<Record<string, ColumnMetadata[]>>({})
  const [aggregations, setAggregations] = useState<Record<string, ColumnAggregation[]>>({})
  const [baselineAggregations, setBaselineAggregations] = useState<Record<string, ColumnAggregation[]>>({})
  const [filters, setFilters] = useState<Filter[]>([])
  const [activeFilterMenu, setActiveFilterMenu] = useState<{ tableName: string; columnName: string } | null>(null)
  const [customRangeInputs, setCustomRangeInputs] = useState<Record<string, { min: string; max: string }>>({})
  const [rangeSelections, setRangeSelections] = useState<Record<string, Array<{ start: number; end: number }>>>({})

  // Filter preset state
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false)
  const [showManagePresetsDialog, setShowManagePresetsDialog] = useState(false)
  const [showPresetsDropdown, setShowPresetsDropdown] = useState(false)
  const [presetNameInput, setPresetNameInput] = useState('')
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)

  // View preferences: track whether each column should show chart or table
  // Key format: "tableName.columnName", Value: "chart" | "table"
  const [viewPreferences, setViewPreferences] = useState<Record<string, 'chart' | 'table'>>({})

  // Tab navigation state: track which table tab is currently active
  const [activeTab, setActiveTab] = useState<string | null>(null)

  // Dashboard state: track which charts are pinned to dashboard
  // Structure: { tableName: string, columnName: string, addedAt: string }[]
  const [dashboardCharts, setDashboardCharts] = useState<Array<{ tableName: string; columnName: string; addedAt: string }>>([])

  // Saved dashboards state
  const [savedDashboards, setSavedDashboards] = useState<SavedDashboard[]>([])
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null) // null = "Most Recent"
  const [showSaveDashboardDialog, setShowSaveDashboardDialog] = useState(false)
  const [showLoadDashboardDialog, setShowLoadDashboardDialog] = useState(false)
  const [showManageDashboardsDialog, setShowManageDashboardsDialog] = useState(false)
  const [newDashboardName, setNewDashboardName] = useState('')
  const [editingDashboardId, setEditingDashboardId] = useState<string | null>(null)
  const [editingDashboardName, setEditingDashboardName] = useState('')

  // Track if filters have been initialized from URL to prevent overwriting
  const filtersInitialized = useRef(false)
  const isUpdatingURL = useRef(false)
  const dashboardInitialized = useRef(false)
  const savedDashboardsInitialized = useRef(false)

  // Helper functions for URL persistence
  const serializeFilters = (filters: Filter[]): string => {
    try {
      const json = JSON.stringify(filters)
      return btoa(encodeURIComponent(json))
    } catch (error) {
      console.error('Failed to serialize filters:', error)
      return ''
    }
  }

  const deserializeFilters = (encoded: string): Filter[] | null => {
    try {
      const json = decodeURIComponent(atob(encoded))
      return JSON.parse(json)
    } catch (error) {
      console.error('Failed to deserialize filters:', error)
      return null
    }
  }

  const saveFiltersToLocalStorage = (filters: Filter[]) => {
    try {
      localStorage.setItem(`filters_${identifier}`, JSON.stringify(filters))
    } catch (error) {
      console.error('Failed to save filters to localStorage:', error)
    }
  }

  const loadFiltersFromLocalStorage = (): Filter[] | null => {
    try {
      const stored = localStorage.getItem(`filters_${identifier}`)
      return stored ? JSON.parse(stored) : null
    } catch (error) {
      console.error('Failed to load filters from localStorage:', error)
      return null
    }
  }

  // Helper functions for preset management
  const savePresetsToLocalStorage = (presets: FilterPreset[]) => {
    try {
      localStorage.setItem(`presets_${identifier}`, JSON.stringify(presets))
    } catch (error) {
      console.error('Failed to save presets to localStorage:', error)
    }
  }

  const loadPresetsFromLocalStorage = (): FilterPreset[] => {
    try {
      const stored = localStorage.getItem(`presets_${identifier}`)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('Failed to load presets from localStorage:', error)
      return []
    }
  }

  const savePreset = () => {
    if (!presetNameInput.trim() || filters.length === 0) return

    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetNameInput.trim(),
      filters: JSON.parse(JSON.stringify(filters)), // Deep clone
      createdAt: new Date().toISOString()
    }

    const updated = [...presets, newPreset]
    setPresets(updated)
    savePresetsToLocalStorage(updated)
    setPresetNameInput('')
    setShowSavePresetDialog(false)
  }

  const applyPreset = (preset: FilterPreset) => {
    setFilters(JSON.parse(JSON.stringify(preset.filters))) // Deep clone
    setShowPresetsDropdown(false)
  }

  const deletePreset = (presetId: string) => {
    const updated = presets.filter(p => p.id !== presetId)
    setPresets(updated)
    savePresetsToLocalStorage(updated)
  }

  const renamePreset = (presetId: string, newName: string) => {
    if (!newName.trim()) return
    const updated = presets.map(p =>
      p.id === presetId ? { ...p, name: newName.trim() } : p
    )
    setPresets(updated)
    savePresetsToLocalStorage(updated)
    setEditingPresetId(null)
  }

  const exportPresets = () => {
    const json = JSON.stringify(presets, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `saved-filters-${identifier}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importPresets = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string) as FilterPreset[]
        if (Array.isArray(imported)) {
          const updated = [...presets, ...imported]
          setPresets(updated)
          savePresetsToLocalStorage(updated)
        }
      } catch (error) {
        console.error('Failed to import filters:', error)
        alert('Failed to import filters. Invalid file format.')
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be imported again
    event.target.value = ''
  }

  // Helper functions for view preferences
  const getViewPreference = (tableName: string, columnName: string, categoryCount: number): 'chart' | 'table' => {
    const key = `${tableName}.${columnName}`
    // Check if user has set a preference
    if (viewPreferences[key]) {
      return viewPreferences[key]
    }
    // Default: table for >8 categories, chart for ≤8
    return categoryCount > 8 ? 'table' : 'chart'
  }

  const toggleViewPreference = (tableName: string, columnName: string) => {
    const key = `${tableName}.${columnName}`
    setViewPreferences(prev => {
      const current = prev[key]
      const newValue = current === 'table' ? 'chart' : 'table'
      const updated = { ...prev, [key]: newValue }
      // Save to localStorage
      try {
        localStorage.setItem(`viewPrefs_${identifier}`, JSON.stringify(updated))
      } catch (error) {
        console.error('Failed to save view preferences:', error)
      }
      return updated
    })
  }

  // Dashboard chart management
  const isOnDashboard = (tableName: string, columnName: string): boolean => {
    return dashboardCharts.some(chart => chart.tableName === tableName && chart.columnName === columnName)
  }

  const toggleDashboard = (tableName: string, columnName: string) => {
    if (isOnDashboard(tableName, columnName)) {
      // Remove from dashboard
      setDashboardCharts(prev => prev.filter(chart => !(chart.tableName === tableName && chart.columnName === columnName)))
    } else {
      // Add to dashboard
      setDashboardCharts(prev => [...prev, { tableName, columnName, addedAt: new Date().toISOString() }])
    }
  }

  const addAllChartsToTable = (tableName: string) => {
    const tableAggregations = aggregations[tableName]
    const tableMetadata = columnMetadata[tableName]
    if (!tableAggregations || !Array.isArray(tableAggregations)) return
    if (!tableMetadata || !Array.isArray(tableMetadata)) return

    // Get all visible aggregations for this table
    const visibleAggregations = tableAggregations.filter(agg => {
      const metadata = tableMetadata.find(m => m.column_name === agg.column_name)
      return !metadata?.is_hidden
    })

    // Add all charts that aren't already on dashboard
    const newCharts = visibleAggregations
      .filter(agg => !isOnDashboard(tableName, agg.column_name))
      .map(agg => ({
        tableName,
        columnName: agg.column_name,
        addedAt: new Date().toISOString()
      }))

    if (newCharts.length > 0) {
      setDashboardCharts(prev => [...prev, ...newCharts])
    }
  }

  const getTableChartCount = (tableName: string): number => {
    const tableAggregations = aggregations[tableName]
    const tableMetadata = columnMetadata[tableName]
    if (!tableAggregations || !Array.isArray(tableAggregations)) return 0
    if (!tableMetadata || !Array.isArray(tableMetadata)) return 0

    // Count visible aggregations for this table
    return tableAggregations.filter(agg => {
      const metadata = tableMetadata.find(m => m.column_name === agg.column_name)
      return !metadata?.is_hidden
    }).length
  }

  // Saved dashboard management
  const saveDashboard = async (name: string) => {
    const newDashboard: SavedDashboard = {
      id: `dashboard_${Date.now()}`,
      name,
      charts: [...dashboardCharts],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    try {
      // Save to database
      await api.post(`/datasets/${identifier}/dashboards`, {
        dashboard_id: newDashboard.id,
        dashboard_name: newDashboard.name,
        charts: newDashboard.charts,
        is_most_recent: false
      })

      // Update local state
      setSavedDashboards(prev => [...prev, newDashboard])
      setShowSaveDashboardDialog(false)
      setNewDashboardName('')
    } catch (error) {
      console.error('Failed to save dashboard:', error)
      alert('Failed to save dashboard. Please try again.')
    }
  }

  const loadDashboard = (dashboardId: string) => {
    const dashboard = savedDashboards.find(d => d.id === dashboardId)
    if (dashboard) {
      setDashboardCharts(dashboard.charts)
      setActiveDashboardId(dashboardId)
    }
  }

  const loadMostRecent = () => {
    // Most Recent is the current dashboardCharts state (already loaded from database)
    setActiveDashboardId(null)
  }

  const deleteDashboard = async (dashboardId: string) => {
    try {
      // Delete from database
      await api.delete(`/datasets/${identifier}/dashboards/${dashboardId}`)

      // Update local state
      setSavedDashboards(prev => prev.filter(d => d.id !== dashboardId))
      if (activeDashboardId === dashboardId) {
        setActiveDashboardId(null)
      }
    } catch (error) {
      console.error('Failed to delete dashboard:', error)
      alert('Failed to delete dashboard. Please try again.')
    }
  }

  const renameDashboard = async (dashboardId: string, newName: string) => {
    const dashboard = savedDashboards.find(d => d.id === dashboardId)
    if (!dashboard) return

    try {
      // Update in database
      await api.post(`/datasets/${identifier}/dashboards`, {
        dashboard_id: dashboardId,
        dashboard_name: newName,
        charts: dashboard.charts,
        is_most_recent: false
      })

      // Update local state
      setSavedDashboards(prev => prev.map(d =>
        d.id === dashboardId
          ? { ...d, name: newName, updatedAt: new Date().toISOString() }
          : d
      ))
      setEditingDashboardId(null)
      setEditingDashboardName('')
    } catch (error) {
      console.error('Failed to rename dashboard:', error)
      alert('Failed to rename dashboard. Please try again.')
    }
  }

  const getCurrentDashboardName = (): string => {
    if (!activeDashboardId) return 'Most Recent'
    const dashboard = savedDashboards.find(d => d.id === activeDashboardId)
    return dashboard?.name || 'Most Recent'
  }

  // Load view preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`viewPrefs_${identifier}`)
      if (stored) {
        setViewPreferences(JSON.parse(stored))
      }
    } catch (error) {
      console.error('Failed to load view preferences:', error)
    }
  }, [identifier])

  // Load "Most Recent" dashboard from database on mount (only once)
  useEffect(() => {
    if (!identifier || dashboardInitialized.current) return

    const loadMostRecentDashboard = async () => {
      try {
        // Try to load from API first
        const response = await api.get(`/datasets/${identifier}/dashboards`)
        const dashboards = response.data.dashboards || []
        const mostRecent = dashboards.find((d: any) => d.is_most_recent)

        if (mostRecent) {
          setDashboardCharts(mostRecent.charts)
        } else {
          // Migration: check localStorage for legacy data
          const key = `dashboard_${identifier}`
          const stored = localStorage.getItem(key)
          if (stored) {
            const charts = JSON.parse(stored)
            setDashboardCharts(charts)
            // Migrate to database
            if (charts.length > 0) {
              await api.post(`/datasets/${identifier}/dashboards`, {
                dashboard_id: 'most_recent',
                dashboard_name: 'Most Recent',
                charts,
                is_most_recent: true
              })
            }
            // Clear localStorage after migration
            localStorage.removeItem(key)
          }
        }
      } catch (error) {
        console.error('Failed to load most recent dashboard:', error)
        // Fallback to localStorage if API fails
        try {
          const key = `dashboard_${identifier}`
          const stored = localStorage.getItem(key)
          if (stored) {
            setDashboardCharts(JSON.parse(stored))
          }
        } catch (e) {
          console.error('Failed to load from localStorage:', e)
        }
      } finally {
        setTimeout(() => {
          dashboardInitialized.current = true
        }, 50)
      }
    }

    loadMostRecentDashboard()
  }, [identifier])

  // Save "Most Recent" dashboard to database when changed (only after initial load)
  useEffect(() => {
    if (!dashboardInitialized.current || !identifier) return

    const saveMostRecentDashboard = async () => {
      try {
        await api.post(`/datasets/${identifier}/dashboards`, {
          dashboard_id: 'most_recent',
          dashboard_name: 'Most Recent',
          charts: dashboardCharts,
          is_most_recent: true
        })
      } catch (error) {
        console.error('Failed to save most recent dashboard:', error)
        // Fallback to localStorage if API fails
        try {
          const key = `dashboard_${identifier}`
          localStorage.setItem(key, JSON.stringify(dashboardCharts))
        } catch (e) {
          console.error('Failed to save to localStorage:', e)
        }
      }
    }

    saveMostRecentDashboard()
  }, [dashboardCharts, identifier])

  // Load saved dashboards from database on mount (only once)
  useEffect(() => {
    if (!identifier || savedDashboardsInitialized.current) return

    const loadSavedDashboards = async () => {
      try {
        // Try to load from API first
        const response = await api.get(`/datasets/${identifier}/dashboards`)
        const dashboards = response.data.dashboards || []

        // Filter out "Most Recent" (is_most_recent = true)
        const savedOnly = dashboards
          .filter((d: any) => !d.is_most_recent)
          .map((d: any) => ({
            id: d.dashboard_id,
            name: d.dashboard_name,
            charts: d.charts,
            createdAt: d.created_at,
            updatedAt: d.updated_at
          }))

        setSavedDashboards(savedOnly)

        // Migration: check localStorage for legacy data
        const key = `savedDashboards_${identifier}`
        const stored = localStorage.getItem(key)
        if (stored) {
          const localDashboards = JSON.parse(stored)

          // Migrate each dashboard to database
          for (const dashboard of localDashboards) {
            try {
              await api.post(`/datasets/${identifier}/dashboards`, {
                dashboard_id: dashboard.id,
                dashboard_name: dashboard.name,
                charts: dashboard.charts,
                is_most_recent: false
              })
            } catch (err) {
              console.error(`Failed to migrate dashboard ${dashboard.id}:`, err)
            }
          }

          // Clear localStorage after migration
          localStorage.removeItem(key)

          // Reload dashboards after migration
          const updatedResponse = await api.get(`/datasets/${identifier}/dashboards`)
          const updatedDashboards = updatedResponse.data.dashboards || []
          const updatedSavedOnly = updatedDashboards
            .filter((d: any) => !d.is_most_recent)
            .map((d: any) => ({
              id: d.dashboard_id,
              name: d.dashboard_name,
              charts: d.charts,
              createdAt: d.created_at,
              updatedAt: d.updated_at
            }))
          setSavedDashboards(updatedSavedOnly)
        }
      } catch (error) {
        console.error('Failed to load saved dashboards from database:', error)
        // Fallback to localStorage if API fails
        try {
          const key = `savedDashboards_${identifier}`
          const stored = localStorage.getItem(key)
          if (stored) {
            setSavedDashboards(JSON.parse(stored))
          }
        } catch (e) {
          console.error('Failed to load from localStorage:', e)
        }
      } finally {
        setTimeout(() => {
          savedDashboardsInitialized.current = true
        }, 50)
      }
    }

    loadSavedDashboards()
  }, [identifier])

  // Note: Saved dashboards are now persisted individually through save/update/delete functions
  // No need for a bulk save effect since each operation updates the database directly

  // Restore filters from URL hash on mount
  useEffect(() => {
    if (filtersInitialized.current) return

    // Parse hash fragment for filters
    const hash = location.hash
    const match = hash.match(/filters=([^&]+)/)
    const encodedFilters = match ? match[1] : null

    if (encodedFilters) {
      const restored = deserializeFilters(encodedFilters)
      if (restored && restored.length > 0) {
        setFilters(restored)
        filtersInitialized.current = true
        return
      }
    }

    // Fallback to localStorage if hash doesn't have filters
    const localFilters = loadFiltersFromLocalStorage()
    if (localFilters && localFilters.length > 0) {
      setFilters(localFilters)
    }

    filtersInitialized.current = true
  }, [location.hash, identifier])

  // Update URL hash when filters change
  useEffect(() => {
    if (!filtersInitialized.current || isUpdatingURL.current) return

    let newHash = ''

    if (filters.length === 0) {
      // Remove filters from hash
      newHash = ''
      // Clear localStorage
      try {
        localStorage.removeItem(`filters_${identifier}`)
      } catch (error) {
        console.error('Failed to clear localStorage:', error)
      }
    } else {
      // Encode and add filters to hash
      const encoded = serializeFilters(filters)
      newHash = `#filters=${encoded}`

      // Save to localStorage as backup
      saveFiltersToLocalStorage(filters)
    }

    const newURL = `${location.pathname}${location.search}${newHash}`

    // Only update if hash actually changed
    if (newHash !== location.hash) {
      isUpdatingURL.current = true
      navigate(newURL, { replace: true })
      // Reset flag after navigation
      setTimeout(() => {
        isUpdatingURL.current = false
      }, 0)
    }
  }, [filters, location.pathname, location.search, location.hash, navigate, identifier])

  // Load presets from localStorage on mount
  useEffect(() => {
    const stored = loadPresetsFromLocalStorage()
    setPresets(stored)
  }, [identifier])

  useEffect(() => {
    loadDataset()
  }, [id, database])

  useEffect(() => {
    // Reload aggregations when filters change
    if (dataset) {
      reloadAggregations()
    }
  }, [filters])

  const reloadAggregations = async () => {
    if (!dataset) return
    // Determine if we should use database API based on current dataset
    const shouldUseDatabaseAPI = isDatabaseMode || dataset.database_type === 'connected'
    const dbIdentifier = isDatabaseMode ? identifier : dataset.database_name

    // Send ALL filters to ALL tables and let the backend figure out cross-table filtering
    // The backend will detect which filters are for each table using the tableName property
    for (const table of dataset.tables) {
      await loadTableAggregations(table.id, table.name, {
        useDbAPI: shouldUseDatabaseAPI,
        dbName: dbIdentifier,
        datasetId: dataset.id,
        tableFilters: filters // Send all filters to every table
      })
    }
  }

  const loadDataset = async () => {
    try {
      setLoading(true)

      // Use different API endpoint based on mode
      const apiPath = isDatabaseMode ? `/databases/${identifier}` : `/datasets/${identifier}`
      const response = await api.get(apiPath)

      const loadedDataset = response.data.dataset
      setDataset(loadedDataset)
      setBaselineAggregations({})
      setCustomRangeInputs({})
      setRangeSelections({})
      setActiveFilterMenu(null)

      // Initialize active tab to dashboard
      setActiveTab('dashboard')

      // Determine if this dataset uses database API
      const shouldUseDatabaseAPI = isDatabaseMode || loadedDataset.database_type === 'connected'
      const dbIdentifier = isDatabaseMode ? identifier : loadedDataset.database_name

      // Load aggregations and column metadata for all tables
      for (const table of loadedDataset.tables) {
        await loadTableAggregations(table.id, table.name, {
          storeBaseline: true,
          useDbAPI: shouldUseDatabaseAPI,
          dbName: dbIdentifier,
          datasetId: loadedDataset.id
        })
        await loadColumnMetadata(table.id, table.name, {
          useDbAPI: shouldUseDatabaseAPI,
          dbName: dbIdentifier,
          datasetId: loadedDataset.id
        })
      }
    } catch (error) {
      console.error('Failed to load dataset:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTableAggregations = async (
    tableId: string,
    tableName: string,
    options?: { storeBaseline?: boolean; useDbAPI?: boolean; dbName?: string; datasetId?: string; tableFilters?: Filter[] }
  ) => {
    try {
      // Use table-specific filters if provided, otherwise fall back to global filters
      const activeFilters = options?.tableFilters !== undefined ? options.tableFilters : filters
      const params: Record<string, any> = activeFilters.length > 0 ? { filters: JSON.stringify(activeFilters) } : {}
      // Use provided values or fall back to computed values
      const shouldUseDbAPI = options?.useDbAPI !== undefined ? options.useDbAPI : usesDatabaseAPI
      const dbIdentifier = options?.dbName || databaseIdentifier
      const datasetParam = options?.datasetId || datasetIdentifier

      const apiPath = shouldUseDbAPI
        ? `/databases/${dbIdentifier}/tables/${tableId}/aggregations`
        : `/datasets/${identifier}/tables/${tableId}/aggregations`
      if (shouldUseDbAPI && datasetParam) {
        params.datasetId = datasetParam
      }

      const response = await api.get(apiPath, { params })
      setAggregations(prev => ({ ...prev, [tableName]: response.data.aggregations }))
      if (options?.storeBaseline) {
        setBaselineAggregations(prev => ({ ...prev, [tableName]: response.data.aggregations }))
      }
    } catch (error) {
      console.error('Failed to load table aggregations:', error)
    }
  }

  const loadColumnMetadata = async (
    tableId: string,
    tableName: string,
    options?: { useDbAPI?: boolean; dbName?: string; datasetId?: string }
  ) => {
    try {
      // Use provided values or fall back to computed values
      const shouldUseDbAPI = options?.useDbAPI !== undefined ? options.useDbAPI : usesDatabaseAPI
      const dbIdentifier = options?.dbName || databaseIdentifier
      const datasetParam = options?.datasetId || datasetIdentifier

      const apiPath = shouldUseDbAPI
        ? `/databases/${dbIdentifier}/tables/${tableId}/columns`
        : `/datasets/${identifier}/tables/${tableId}/columns`
      const response = await api.get(apiPath, {
        params: shouldUseDbAPI && datasetParam ? { datasetId: datasetParam } : undefined
      })
      setColumnMetadata(prev => ({ ...prev, [tableName]: response.data.columns }))
    } catch (error) {
      console.error('Failed to load column metadata:', error)
    }
  }

  const getBaselineAggregation = (tableName: string, columnName: string): ColumnAggregation | undefined => {
    const tableAggregations = baselineAggregations[tableName]
    if (!tableAggregations) return undefined
    return tableAggregations.find(agg => agg.column_name === columnName)
  }

  const getAggregation = (tableName: string, columnName: string): ColumnAggregation | undefined => {
    const tableAggregations = aggregations[tableName]
    if (!tableAggregations) return undefined
    return tableAggregations.find(agg => agg.column_name === columnName)
  }

  const getColumnMetadata = (tableName: string, columnName: string): ColumnMetadata | undefined => {
    const metadata = columnMetadata[tableName]
    if (!metadata) return undefined
    return metadata.find(col => col.column_name === columnName)
  }

  const getDisplayTitle = (tableName: string, columnName: string): string => {
    const metadata = getColumnMetadata(tableName, columnName)
    return metadata?.display_name || columnName.replace(/_/g, ' ')
  }

  const normalizeFilterValue = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return ''
    return String(value)
  }

  const formatRangeValue = (value: number): string => {
    if (!Number.isFinite(value)) return '–'
    if (Number.isInteger(value)) return value.toString()
    return value.toFixed(2)
  }

const rangeKey = (tableName: string, columnName: string) => `${tableName}.${columnName}`

const rangesEqual = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  Math.abs(a.start - b.start) < 1e-9 && Math.abs(a.end - b.end) < 1e-9

const getFilterColumn = (filter: Filter): string | undefined => {
  if (filter.column) return filter.column
  if (filter.or && Array.isArray(filter.or) && filter.or.length > 0) {
    const child = filter.or[0] as Filter
    return getFilterColumn(child)
  }
  if (filter.and && Array.isArray(filter.and) && filter.and.length > 0) {
    const child = filter.and[0] as Filter
    return getFilterColumn(child)
  }
  if (filter.not) {
    return getFilterColumn(filter.not)
  }
  return undefined
}

const getFilterTableName = (filter: Filter): string | undefined => (filter as any).tableName

  // Helper: Get all effective filters (direct + propagated) for all tables
  const getAllEffectiveFilters = (): Record<string, { direct: Filter[]; propagated: Filter[] }> => {
    if (!dataset) return {}

    const result: Record<string, { direct: Filter[]; propagated: Filter[] }> = {}

    // Initialize all tables
    for (const table of dataset.tables) {
      result[table.name] = { direct: [], propagated: [] }
    }

    // Group filters by their tableName property
    for (const filter of filters) {
      const filterTableName = getFilterTableName(filter)
      if (!filterTableName) continue

      // This filter belongs to filterTableName
      // It's "direct" for that table, "propagated" for other tables with relationships
      for (const table of dataset.tables) {
        if (table.name === filterTableName) {
          // Direct filter
          result[table.name].direct.push(filter)
        } else {
          // Check if there's a relationship path between these tables (including transitive)
          const path = findRelationshipPath(table.name, filterTableName, dataset.tables)
          const hasRelationship = path !== null

          if (hasRelationship) {
            // This is a propagated filter for this table
            result[table.name].propagated.push(filter)
          }
        }
      }
    }

    return result
  }

const filterContainsColumn = (filter: Filter, column: string): boolean => {
  if (filter.column === column) return true
  if (filter.or && Array.isArray(filter.or)) {
    return filter.or.some(child => filterContainsColumn(child, column))
  }
    if (filter.and && Array.isArray(filter.and)) {
      return filter.and.some(child => filterContainsColumn(child, column))
    }
    if (filter.not) {
      return filterContainsColumn(filter.not, column)
    }
    return false
  }

  const hasColumnFilter = (column: string): boolean => filters.some(f => filterContainsColumn(f, column))

  const removeColumnFilters = (prev: Filter[], column: string): Filter[] =>
    prev.filter(filter => {
      // Unwrap NOT if present
      const actualFilter = (filter as any).not || filter

      if (actualFilter.column === column) return false
      if (actualFilter.or && Array.isArray(actualFilter.or)) {
        return !actualFilter.or.every(child => filterContainsColumn(child, column))
      }
      return true
    })

  const clearColumnFilter = (tableName: string, columnName: string) => {
    setFilters(prev => removeColumnFilters(prev, columnName))
    const key = rangeKey(tableName, columnName)
    setCustomRangeInputs(prev => {
      if (!(key in prev)) return prev
      const { [key]: _removed, ...rest } = prev
      return rest
    })
    setRangeSelections(prev => {
      if (!(key in prev)) return prev
      const { [key]: _removed, ...rest } = prev
      return rest
    })
  }

  const updateColumnRanges = (
    tableName: string,
    columnName: string,
    updater: (ranges: Array<{ start: number; end: number }>) => Array<{ start: number; end: number }>
  ) => {
    const key = rangeKey(tableName, columnName)
    let nextRanges: Array<{ start: number; end: number }> = []
    setRangeSelections(prev => {
      const prevRanges = prev[key] ?? []
      nextRanges = updater(prevRanges)
      nextRanges = nextRanges
        .slice()
        .sort((a, b) => (a.start - b.start) || (a.end - b.end))
      const unchanged = prevRanges.length === nextRanges.length && prevRanges.every((range, idx) => rangesEqual(range, nextRanges[idx]))
      if (unchanged) {
        nextRanges = prevRanges
        return prev
      }
      const updated = { ...prev }
      if (nextRanges.length === 0) {
        delete updated[key]
      } else {
        updated[key] = nextRanges
      }
      return updated
    })

    setFilters(prev => {
      const without = removeColumnFilters(prev, columnName)
      if (nextRanges.length === 0) return without
      if (nextRanges.length === 1) {
        const range = nextRanges[0]
        return [...without, { column: columnName, operator: 'between', value: [range.start, range.end], tableName } as unknown as Filter]
      }
      const orFilters = nextRanges.map(range => ({ column: columnName, operator: 'between', value: [range.start, range.end] }))
      return [...without, { column: columnName, or: orFilters, tableName } as unknown as Filter]
    })
  }

  const renderFilterMenu = (
    tableName: string,
    columnName: string,
    categories?: CategoryCount[]
  ) => {
    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === columnName
    if (!menuOpen || !categories || categories.length === 0) return null

    const columnHasFilter = hasColumnFilter(columnName)

    // Check if the current filter for this column has NOT wrapper
    const currentFilter = filters.find(f => {
      const actualF = (f as any).not || f
      return getFilterColumn(actualF) === columnName
    })
    const isNot = currentFilter ? !!(currentFilter as any).not : false

    // Toggle NOT for this column's filter
    const toggleColumnNot = () => {
      setFilters(prev => {
        const idx = prev.findIndex(f => {
          const actualF = (f as any).not || f
          return getFilterColumn(actualF) === columnName
        })
        if (idx === -1) return prev

        const updated = [...prev]
        const filter = prev[idx]
        if ((filter as any).not) {
          // Remove NOT wrapper
          updated[idx] = (filter as any).not
        } else {
          // Add NOT wrapper
          updated[idx] = { not: filter } as any
        }
        return updated
      })
    }

    return (
      <div
        style={{
          position: 'absolute',
          top: '28px',
          right: 0,
          zIndex: 10,
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          padding: '0.5rem',
          maxHeight: '200px',
          overflowY: 'auto',
          minWidth: '140px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem'
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => clearColumnFilter(tableName, columnName)}
            style={{
              border: 'none',
              background: columnHasFilter ? '#1976D2' : '#eee',
              color: columnHasFilter ? 'white' : '#555',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.7rem',
              cursor: columnHasFilter ? 'pointer' : 'default',
              opacity: columnHasFilter ? 1 : 0.6,
              flex: 1
            }}
            disabled={!columnHasFilter}
          >
            Reset
          </button>
          <button
            onClick={toggleColumnNot}
            style={{
              border: 'none',
              background: isNot ? '#333' : '#f0f0f0',
              color: isNot ? 'white' : '#555',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.7rem',
              cursor: columnHasFilter ? 'pointer' : 'default',
              opacity: columnHasFilter ? 1 : 0.6,
              fontWeight: isNot ? 'bold' : 'normal'
            }}
            disabled={!columnHasFilter}
            title={isNot ? 'Remove NOT' : 'Add NOT'}
          >
            ¬
          </button>
        </div>
        <div style={{ borderBottom: '1px solid #eee', margin: '0.25rem 0' }} />
        {categories.map(category => {
          const rawValue = normalizeFilterValue(category.value)
          const label = category.display_value ?? (category.value === '' ? '(Empty)' : String(category.value))
          const active = isValueFiltered(columnName, rawValue)

          return (
            <button
              key={`${tableName}-${columnName}-${label}`}
              onMouseDown={event => event.preventDefault()}
              onClick={() => toggleFilter(columnName, rawValue, tableName)}
              style={{
                border: active ? '1px solid #1976D2' : '1px solid #ccc',
                background: active ? '#E3F2FD' : '#fafafa',
                color: active ? '#0D47A1' : '#444',
                borderRadius: '999px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.7rem',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              title={`${label} (${category.count} rows)`}
            >
              {label}
            </button>
          )
        })}
      </div>
    )
  }

  useEffect(() => {
    if (!activeFilterMenu) return
    const { tableName, columnName } = activeFilterMenu
    const key = rangeKey(tableName, columnName)
    const baselineAgg = getBaselineAggregation(tableName, columnName)
    if (!baselineAgg || baselineAgg.display_type !== 'numeric') return
    const stats = baselineAgg.numeric_stats
    if (!stats) return

    const defaultMin = stats.min !== null ? String(stats.min) : ''
    const defaultMax = stats.max !== null ? String(stats.max) : ''

    const selectedRanges = rangeSelections[key] ?? []
    const singleRange = selectedRanges.length === 1 ? selectedRanges[0] : null

    const nextMin = singleRange ? String(singleRange.start) : defaultMin
    const nextMax = singleRange ? String(singleRange.end) : defaultMax

    setCustomRangeInputs(prev => {
      const current = prev[key]
      if (current && current.min === nextMin && current.max === nextMax) {
        return prev
      }
      return { ...prev, [key]: { min: nextMin, max: nextMax } }
    })
  }, [activeFilterMenu, baselineAggregations, rangeSelections])

  const handleCustomRangeChange = (
    key: string,
    field: 'min' | 'max',
    value: string
  ) => {
    setCustomRangeInputs(prev => ({
      ...prev,
      [key]: {
        min: field === 'min' ? value : prev[key]?.min ?? '',
        max: field === 'max' ? value : prev[key]?.max ?? ''
      }
    }))
  }

  const applyCustomRange = (tableName: string, columnName: string) => {
    const key = `${tableName}.${columnName}`
    const range = customRangeInputs[key]
    if (!range) return

    const min = range.min.trim()
    const max = range.max.trim()
    if (min === '' || max === '') return

    const minValue = Number(min)
    const maxValue = Number(max)
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || minValue > maxValue) {
      return
    }

    setCustomRangeInputs(prev => ({
      ...prev,
      [key]: { min: String(minValue), max: String(maxValue) }
    }))

    updateColumnRanges(tableName, columnName, prevRanges => {
      const nextRange = { start: minValue, end: maxValue }
      const existingIndex = prevRanges.findIndex(range => rangesEqual(range, nextRange))
      if (existingIndex >= 0) return prevRanges
      return [...prevRanges, nextRange]
    })
  }

  const getNiceBinWidth = (range: number, desiredBins: number): number => {
    if (!Number.isFinite(range) || range <= 0) {
      return 1
    }

    const target = range / Math.max(desiredBins, 1)
    if (!Number.isFinite(target) || target <= 0) {
      return range
    }

    const exponent = Math.floor(Math.log10(target))
    const scaled = target / Math.pow(10, exponent)

    let niceScaled: number
    if (scaled <= 1) {
      niceScaled = 1
    } else if (scaled <= 2) {
      niceScaled = 2
    } else if (scaled <= 5) {
      niceScaled = 5
    } else {
      niceScaled = 10
    }

    return niceScaled * Math.pow(10, exponent)
  }

  const getDisplayHistogram = (
    histogram: HistogramBin[] | undefined,
    stats: NumericStats | undefined
  ): HistogramBin[] => {
    if (!histogram || histogram.length === 0) return []
    if (!stats || stats.min === null || stats.max === null) return histogram

    const min = stats.min
    const max = stats.max
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return histogram

    const totalCount = histogram.reduce((sum, bin) => sum + bin.count, 0)
    if (!Number.isFinite(totalCount) || totalCount === 0) return histogram

    const range = max - min
    const desiredBins = Math.min(Math.max(histogram.length, 1), 60)
    let width = getNiceBinWidth(range, desiredBins)
    if (!Number.isFinite(width) || width <= 0) {
      width = range || 1
    }

    let guard = 0
    while (range / width > 60 && guard < 10) {
      const nextApprox = Math.ceil(range / width / 2)
      width = getNiceBinWidth(range, Math.max(nextApprox, 1))
      if (!Number.isFinite(width) || width <= 0) {
        width = range || 1
        break
      }
      guard += 1
    }

    const start = Math.floor(min / width) * width
    const bucketCount = Math.max(1, Math.ceil((max - start) / width) + 1)
    const buckets: HistogramBin[] = []
    for (let i = 0; i < bucketCount; i++) {
      buckets.push({
        bin_start: start + i * width,
        bin_end: start + (i + 1) * width,
        count: 0,
        percentage: 0
      })
    }

    histogram.forEach(bin => {
      const center = (bin.bin_start + bin.bin_end) / 2
      let index = Math.floor((center - start) / width)
      if (index < 0) index = 0
      if (index >= buckets.length) index = buckets.length - 1
      buckets[index].count += bin.count
    })

    buckets.forEach(bucket => {
      bucket.percentage = bucket.count / totalCount * 100
    })

    const filtered = buckets.filter(bucket => bucket.count > 0)
    return filtered.length > 0 ? filtered : histogram
  }

const renderNumericFilterMenu = (
    tableName: string,
    columnName: string,
    histogram?: HistogramBin[],
    stats?: NumericStats
  ) => {
    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === columnName
    if (!menuOpen) return null

    const bins = histogram ?? []
    const key = `${tableName}.${columnName}`
    const range = customRangeInputs[key] || { min: stats && stats.min !== null ? String(stats.min) : '', max: stats && stats.max !== null ? String(stats.max) : '' }
    const columnHasFilter = hasColumnFilter(columnName)
    const selectedRanges = rangeSelections[key] ?? []
    const customRanges = selectedRanges.filter(range => !bins.some(bin => rangesEqual(range, { start: bin.bin_start, end: bin.bin_end })))
    const minDisplay = stats && stats.min !== null ? formatRangeValue(stats.min) : '–'
    const maxDisplay = stats && stats.max !== null ? formatRangeValue(stats.max) : '–'
    const medianDisplay = stats && stats.median !== null ? formatRangeValue(stats.median) : '–'
    const stdDisplay = stats && stats.stddev !== undefined && stats.stddev !== null ? stats.stddev.toFixed(2) : '–'

    const minValue = Number(range.min)
    const maxValue = Number(range.max)
    const hasValidRange =
      range.min.trim() !== '' &&
      range.max.trim() !== '' &&
      Number.isFinite(minValue) &&
      Number.isFinite(maxValue) &&
      minValue <= maxValue

    // Check if the current filter for this column has NOT wrapper
    const currentFilter = filters.find(f => {
      const actualF = (f as any).not || f
      return getFilterColumn(actualF) === columnName
    })
    const isNot = currentFilter ? !!(currentFilter as any).not : false

    // Toggle NOT for this column's filter
    const toggleColumnNot = () => {
      setFilters(prev => {
        const idx = prev.findIndex(f => {
          const actualF = (f as any).not || f
          return getFilterColumn(actualF) === columnName
        })
        if (idx === -1) return prev

        const updated = [...prev]
        const filter = prev[idx]
        if ((filter as any).not) {
          // Remove NOT wrapper
          updated[idx] = (filter as any).not
        } else {
          // Add NOT wrapper
          updated[idx] = { not: filter } as any
        }
        return updated
      })
    }

    return (
      <div
        style={{
          position: 'absolute',
          top: '28px',
          right: 0,
          zIndex: 10,
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          padding: '0.5rem',
          maxHeight: '260px',
          overflowY: 'auto',
          minWidth: '180px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem'
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {stats && (
          <>
            <div style={{ fontSize: '0.7rem', color: '#555', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>Min: {minDisplay}</span>
              <span>Max: {maxDisplay}</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#555', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>Median: {medianDisplay}</span>
              <span>Std: {stdDisplay}</span>
            </div>
          </>
        )}
        {(() => {
          const baselineAgg = getBaselineAggregation(tableName, columnName)
          const nullCount = baselineAgg?.null_count ?? 0
          if (nullCount === 0) return null

          const nullActive = isValueFiltered(columnName, '')
          return (
            <>
              <div style={{ borderBottom: '1px solid #eee', margin: '0.25rem 0' }} />
              <button
                onMouseDown={event => event.preventDefault()}
                onClick={() => toggleFilter(columnName, '', tableName)}
                style={{
                  border: nullActive ? '1px solid #1976D2' : '1px solid #ccc',
                  background: nullActive ? '#E3F2FD' : '#fafafa',
                  color: nullActive ? '#0D47A1' : '#444',
                  borderRadius: '999px',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                title={`Null values (${nullCount} rows)`}
              >
                (Null) — {nullCount} rows
              </button>
            </>
          )
        })()}
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => clearColumnFilter(tableName, columnName)}
            style={{
              border: 'none',
              background: columnHasFilter ? '#1976D2' : '#eee',
              color: columnHasFilter ? 'white' : '#555',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.7rem',
              cursor: columnHasFilter ? 'pointer' : 'default',
              opacity: columnHasFilter ? 1 : 0.6,
              flex: 1
            }}
            disabled={!columnHasFilter}
          >
            Reset
          </button>
          <button
            onClick={toggleColumnNot}
            style={{
              border: 'none',
              background: isNot ? '#333' : '#f0f0f0',
              color: isNot ? 'white' : '#555',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.7rem',
              cursor: columnHasFilter ? 'pointer' : 'default',
              opacity: columnHasFilter ? 1 : 0.6,
              fontWeight: isNot ? 'bold' : 'normal'
            }}
            disabled={!columnHasFilter}
            title={isNot ? 'Remove NOT' : 'Add NOT'}
          >
            ¬
          </button>
        </div>
        {bins.length > 0 && (
          <div style={{ borderTop: '1px solid #eee', paddingTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {bins.map((bin, index) => {
              const active = isRangeFiltered(tableName, columnName, bin.bin_start, bin.bin_end)
              const label = `${formatRangeValue(bin.bin_start)} – ${formatRangeValue(bin.bin_end)}`
              return (
                <button
                  key={`${tableName}-${columnName}-bin-${index}`}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => toggleRangeFilter(tableName, columnName, bin.bin_start, bin.bin_end)}
                  style={{
                    border: active ? '1px solid #1976D2' : '1px solid #ccc',
                    background: active ? '#E3F2FD' : '#fafafa',
                    color: active ? '#0D47A1' : '#444',
                    borderRadius: '999px',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.7rem',
                    cursor: 'pointer'
                  }}
                  title={`${label} (${bin.count} rows)`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
        {customRanges.length > 0 && (
          <div style={{ borderTop: '1px solid #eee', paddingTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {customRanges.map((range, index) => {
              const label = `${formatRangeValue(range.start)} – ${formatRangeValue(range.end)}`
              return (
                <button
                  key={`${tableName}-${columnName}-custom-${index}`}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => updateColumnRanges(tableName, columnName, prev => prev.filter(r => !rangesEqual(r, range)))}
                  style={{
                    border: '1px solid #1976D2',
                    background: '#E3F2FD',
                    color: '#0D47A1',
                    borderRadius: '999px',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.7rem',
                    cursor: 'pointer'
                  }}
                  title={`Remove ${label}`}
                >
                  {label} ×
                </button>
              )
            })}
          </div>
        )}
        <div style={{ borderTop: '1px solid #eee', paddingTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.7rem', color: '#555', flex: 1 }}>
              From
              <input
                type="number"
                value={range.min}
                onChange={(event) => handleCustomRangeChange(key, 'min', event.target.value)}
                placeholder={stats?.min !== null && stats?.min !== undefined ? String(stats.min) : ''}
                style={{ width: '100%', padding: '0.2rem 0.3rem', marginTop: '0.15rem' }}
              />
            </label>
            <label style={{ fontSize: '0.7rem', color: '#555', flex: 1 }}>
              To
              <input
                type="number"
                value={range.max}
                onChange={(event) => handleCustomRangeChange(key, 'max', event.target.value)}
                placeholder={stats?.max !== null && stats?.max !== undefined ? String(stats.max) : ''}
                style={{ width: '100%', padding: '0.2rem 0.3rem', marginTop: '0.15rem' }}
              />
            </label>
          </div>
          <button
            onClick={() => applyCustomRange(tableName, columnName)}
            style={{
              border: 'none',
              background: hasValidRange ? '#1976D2' : '#ccc',
              color: 'white',
              borderRadius: '4px',
              padding: '0.3rem 0.5rem',
              fontSize: '0.75rem',
              cursor: hasValidRange ? 'pointer' : 'default'
            }}
            disabled={!hasValidRange}
          >
            Apply
          </button>
        </div>
      </div>
    )
  }

  const toggleFilter = (column: string, value: string | number, tableName?: string) => {
    const filterValue = normalizeFilterValue(value)

    setFilters(prevFilters => {
      const nextFilters = [...prevFilters]

      // Find existing filter, checking both regular and NOT-wrapped filters
      const existingIndex = nextFilters.findIndex(f => {
        const actualFilter = (f as any).not || f
        return actualFilter.column === column
      })

      // Check if the found filter is NOT-wrapped
      const isNot = existingIndex >= 0 && !!(nextFilters[existingIndex] as any).not

      if (existingIndex === -1) {
        const newFilter: any = { column, operator: 'eq', value: filterValue }
        if (tableName) newFilter.tableName = tableName
        nextFilters.push(newFilter)
        return nextFilters
      }

      // Get the actual filter (unwrap NOT if present)
      const existing = isNot ? (nextFilters[existingIndex] as any).not : nextFilters[existingIndex]

      if (existing.operator === 'eq') {
        const existingValue = normalizeFilterValue(existing.value as string | number)
        if (existingValue === filterValue) {
          nextFilters.splice(existingIndex, 1)
          return nextFilters
        }

        const updatedFilter: any = {
          column,
          operator: 'in',
          value: [existingValue, filterValue]
        }
        if (tableName) updatedFilter.tableName = tableName
        // Re-wrap with NOT if it was originally wrapped
        nextFilters[existingIndex] = isNot ? { not: updatedFilter } as any : updatedFilter
        return nextFilters
      }

      if (existing.operator === 'in') {
        const values = Array.isArray(existing.value)
          ? existing.value.map(v => normalizeFilterValue(v as string | number))
          : []
        const matchIndex = values.findIndex(v => v === filterValue)

        if (matchIndex >= 0) {
          values.splice(matchIndex, 1)
        } else {
          values.push(filterValue)
        }

        if (values.length === 0) {
          nextFilters.splice(existingIndex, 1)
        } else if (values.length === 1) {
          const updatedFilter: any = { column, operator: 'eq', value: values[0] }
          if (tableName) updatedFilter.tableName = tableName
          // Re-wrap with NOT if it was originally wrapped
          nextFilters[existingIndex] = isNot ? { not: updatedFilter } as any : updatedFilter
        } else {
          const updatedFilter: any = { column, operator: 'in', value: values }
          if (tableName) updatedFilter.tableName = tableName
          // Re-wrap with NOT if it was originally wrapped
          nextFilters[existingIndex] = isNot ? { not: updatedFilter } as any : updatedFilter
        }

        return nextFilters
      }

      const updatedFilter: any = { column, operator: 'eq', value: filterValue }
      if (tableName) updatedFilter.tableName = tableName
      // Re-wrap with NOT if it was originally wrapped
      nextFilters[existingIndex] = isNot ? { not: updatedFilter } as any : updatedFilter
      return nextFilters
    })
  }

  const clearFilters = () => {
    setFilters([])
    setCustomRangeInputs({})
    setRangeSelections({})
  }

  const isValueFiltered = (column: string, value: string | number): boolean => {
    const compareValue = normalizeFilterValue(value)
    return filters.some(f => {
      // Unwrap NOT if present
      const actualFilter = (f as any).not || f
      if (actualFilter.column !== column) return false
      if (actualFilter.operator === 'eq') {
        return normalizeFilterValue(actualFilter.value as string | number) === compareValue
      }
      if (actualFilter.operator === 'in' && Array.isArray(actualFilter.value)) {
        return actualFilter.value
          .map(v => normalizeFilterValue(v as string | number))
          .includes(compareValue)
      }
      return false
    })
  }

  const toggleRangeFilter = (tableName: string, column: string, binStart: number, binEnd: number) => {
    const range = { start: binStart, end: binEnd }
    updateColumnRanges(tableName, column, prevRanges => {
      const existingIndex = prevRanges.findIndex(r => rangesEqual(r, range))
      if (existingIndex >= 0) {
        return [...prevRanges.slice(0, existingIndex), ...prevRanges.slice(existingIndex + 1)]
      }
      return [...prevRanges, range]
    })
  }

  const isRangeFiltered = (tableName: string, column: string, binStart: number, binEnd: number): boolean => {
    const key = rangeKey(tableName, column)
    const ranges = rangeSelections[key] ?? []
    return ranges.some(range => rangesEqual(range, { start: binStart, end: binEnd }))
  }

  const getTableColor = (tableName: string): string => {
    if (!dataset?.tables) return '#9E9E9E'

    // Assign colors based on table index for more consistent, predictable coloring
    const tableIndex = dataset.tables.findIndex(t => t.name === tableName)
    const colors = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#FFC107', '#E91E63']

    return tableIndex >= 0 ? colors[tableIndex % colors.length] : '#9E9E9E'
  }

  const renderTableView = (title: string, tableName: string, field: string, tableColor?: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.categories || aggregation.categories.length === 0) return null

    const metadata = getColumnMetadata(tableName, field)
    const tooltipText = [
      metadata?.display_name || title,
      `ID: ${field}`,
      metadata?.description || ''
    ].filter(Boolean).join('\n')

    const baselineAggregation = getBaselineAggregation(tableName, field)
    const categoriesForMenu = baselineAggregation?.categories || aggregation.categories
    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === field
    const columnActive = hasColumnFilter(field)

    // Prepare table data
    const totalRows = aggregation.categories.reduce((sum, cat) => sum + cat.count, 0)

    const tableData = aggregation.categories.map(cat => ({
      category: cat.display_value ?? (cat.value === '' ? '(Empty)' : String(cat.value)),
      rawValue: cat.value,
      count: cat.count,
      percentage: totalRows > 0 ? (cat.count / totalRows) * 100 : 0
    }))

    // Sort by count descending by default
    const sortedData = [...tableData].sort((a, b) => b.count - a.count)

    const showLimit = 100
    const visibleData = sortedData.slice(0, showLimit)
    const hasMore = sortedData.length > showLimit

    return (
      <div style={{
        position: 'relative',
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '358px',
        height: '358px',
        boxSizing: 'border-box',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        border: tableColor ? `2px solid ${tableColor}20` : undefined
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
          {tableColor && (
            <div style={{
              width: '3px',
              height: '14px',
              borderRadius: '1.5px',
              background: tableColor,
              flexShrink: 0
            }} />
          )}
          <h4
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'help',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexGrow: 1
            }}
            title={tooltipText}
          >
            {metadata?.display_name || title}
          </h4>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggleViewPreference(tableName, field)
            }}
            style={{
              border: 'none',
              background: '#f0f0f0',
              color: '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title="Switch to chart view"
          >
            ◐
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggleDashboard(tableName, field)
            }}
            style={{
              border: 'none',
              background: isOnDashboard(tableName, field) ? '#4CAF50' : '#f0f0f0',
              color: isOnDashboard(tableName, field) ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title={isOnDashboard(tableName, field) ? "Remove from dashboard" : "Add to dashboard"}
          >
            {isOnDashboard(tableName, field) ? '✓' : '+'}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setActiveFilterMenu(prev =>
                prev && prev.tableName === tableName && prev.columnName === field
                  ? null
                  : { tableName, columnName: field }
              )
            }}
            style={{
              border: 'none',
              background: menuOpen || columnActive ? '#1976D2' : '#f0f0f0',
              color: menuOpen || columnActive ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title="Filter values"
          >
            ⚲
          </button>
        </div>

        {/* Table */}
        <div style={{
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
          fontSize: '0.75rem'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.75rem'
          }}>
            <thead style={{
              position: 'sticky',
              top: 0,
              background: '#f5f5f5',
              borderBottom: '2px solid #ddd'
            }}>
              <tr>
                <th style={{
                  padding: '0.4rem 0.5rem',
                  textAlign: 'left',
                  fontWeight: 600
                }}>
                  Category
                </th>
                <th style={{
                  padding: '0.4rem 0.5rem',
                  textAlign: 'right',
                  fontWeight: 600
                }}>
                  Count ↓
                </th>
                <th style={{
                  padding: '0.4rem 0.5rem',
                  textAlign: 'right',
                  fontWeight: 600
                }}>
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleData.map((row, idx) => {
                const rawValue = normalizeFilterValue(row.rawValue)
                const isFiltered = isValueFiltered(field, rawValue)
                return (
                  <tr
                    key={idx}
                    onClick={() => toggleFilter(field, rawValue, tableName)}
                    style={{
                      cursor: 'pointer',
                      background: isFiltered ? '#E3F2FD' : idx % 2 === 0 ? 'white' : '#fafafa',
                      borderLeft: isFiltered ? '3px solid #1976D2' : '3px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (!isFiltered) e.currentTarget.style.background = '#f0f0f0'
                    }}
                    onMouseLeave={(e) => {
                      if (!isFiltered) e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'
                    }}
                  >
                    <td style={{
                      padding: '0.4rem 0.5rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '180px'
                    }}>
                      {row.category}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                      {row.count.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                      {row.percentage.toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {hasMore && (
            <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.7rem', color: '#666' }}>
              Showing first {showLimit} of {sortedData.length} categories
            </div>
          )}
        </div>
        {renderFilterMenu(tableName, field, categoriesForMenu)}
      </div>
    )
  }

  const renderPieChart = (title: string, tableName: string, field: string, tableColor?: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.categories || aggregation.categories.length === 0) return null

    const labels = aggregation.categories.map(c => c.display_value ?? (c.value === '' ? '(Empty)' : String(c.value)))
    const values = aggregation.categories.map(c => c.count)
    const filterValues = aggregation.categories.map(c => normalizeFilterValue(c.value))

    const metadata = getColumnMetadata(tableName, field)

    const tooltipText = [
      metadata?.display_name || title,
      `ID: ${field}`,
      metadata?.description || ''
    ].filter(Boolean).join('\n')

    const baselineAggregation = getBaselineAggregation(tableName, field)
    const baselineCategories = baselineAggregation?.categories

    const categoriesForMenu = baselineCategories && baselineCategories.length > 0
      ? baselineCategories
      : aggregation.categories

    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === field
    const columnActive = hasColumnFilter(field)

    return (
      <div style={{
        position: 'relative',
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '175px',
        minHeight: '175px',
        boxSizing: 'border-box',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        border: tableColor ? `2px solid ${tableColor}20` : undefined
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
          {tableColor && (
            <div style={{
              width: '3px',
              height: '14px',
              borderRadius: '1.5px',
              background: tableColor,
              flexShrink: 0
            }} />
          )}
          <h4
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'help',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexGrow: 1
            }}
            title={tooltipText}
          >
            {metadata?.display_name || title}
          </h4>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggleViewPreference(tableName, field)
            }}
            style={{
              border: 'none',
              background: '#f0f0f0',
              color: '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title="Switch to table view"
          >
            ⊞
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggleDashboard(tableName, field)
            }}
            style={{
              border: 'none',
              background: isOnDashboard(tableName, field) ? '#4CAF50' : '#f0f0f0',
              color: isOnDashboard(tableName, field) ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title={isOnDashboard(tableName, field) ? "Remove from dashboard" : "Add to dashboard"}
          >
            {isOnDashboard(tableName, field) ? '✓' : '+'}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setActiveFilterMenu(prev =>
                prev && prev.tableName === tableName && prev.columnName === field
                  ? null
                  : { tableName, columnName: field }
              )
            }}
            style={{
              border: 'none',
              background: menuOpen || columnActive ? '#1976D2' : '#f0f0f0',
              color: menuOpen || columnActive ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title="Filter values"
          >
            ⚲
          </button>
        </div>
        <Plot
          data={[{
            type: 'pie',
            labels,
            values,
            textinfo: 'label+percent',
            textposition: 'inside',
            insidetextorientation: 'radial',
            marker: {
              colors: filterValues.map(value =>
                isValueFiltered(field, value) ? '#1976D2' : undefined
              ),
              line: {
                color: filterValues.map(value =>
                  isValueFiltered(field, value) ? '#000' : undefined
                ),
                width: filterValues.map(value =>
                  isValueFiltered(field, value) ? 2 : 0
                )
              }
            },
            textfont: { size: 9 },
            hovertemplate: '%{label}<br>Count: %{value}<br>%{percent}<extra></extra>'
          }]}
          layout={{
            height: 135,
            margin: { t: 5, b: 5, l: 5, r: 5 },
            showlegend: false,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            dragmode: false
          }}
          config={{
            displayModeBar: false,
            responsive: true,
            staticPlot: false
          }}
          style={{ width: '165px', height: '135px', cursor: 'pointer' }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0]
            if (!point) return

            const index = point.pointNumber ?? point.pointIndex
            if (typeof index === 'number' && index >= 0 && index < filterValues.length) {
              const clickedValue = filterValues[index]
              toggleFilter(field, clickedValue, tableName)
            }
          }}
        />
        {renderFilterMenu(tableName, field, categoriesForMenu)}
      </div>
    )
  }

  const renderBarChart = (title: string, tableName: string, field: string, tableColor?: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.categories || aggregation.categories.length === 0) return null

    const labels = aggregation.categories.map(c => c.display_value ?? (c.value === '' ? '(Empty)' : String(c.value)))
    const values = aggregation.categories.map(c => c.count)
    const filterValues = aggregation.categories.map(c => normalizeFilterValue(c.value))

    const metadata = getColumnMetadata(tableName, field)

    const tooltipText = [
      metadata?.display_name || title,
      `ID: ${field}`,
      metadata?.description || ''
    ].filter(Boolean).join('\n')

    const baselineAggregation = getBaselineAggregation(tableName, field)
    const categoriesForMenu = baselineAggregation?.categories || aggregation.categories
    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === field
    const columnActive = hasColumnFilter(field)

    return (
      <div style={{
        position: 'relative',
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '358px',
        minHeight: '175px',
        boxSizing: 'border-box',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        border: tableColor ? `2px solid ${tableColor}20` : undefined
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
          {tableColor && (
            <div style={{
              width: '3px',
              height: '14px',
              borderRadius: '1.5px',
              background: tableColor,
              flexShrink: 0
            }} />
          )}
          <h4
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'help',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexGrow: 1
            }}
            title={tooltipText}
          >
            {metadata?.display_name || title}
          </h4>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggleViewPreference(tableName, field)
            }}
            style={{
              border: 'none',
              background: '#f0f0f0',
              color: '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title="Switch to table view"
          >
            ⊞
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggleDashboard(tableName, field)
            }}
            style={{
              border: 'none',
              background: isOnDashboard(tableName, field) ? '#4CAF50' : '#f0f0f0',
              color: isOnDashboard(tableName, field) ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title={isOnDashboard(tableName, field) ? "Remove from dashboard" : "Add to dashboard"}
          >
            {isOnDashboard(tableName, field) ? '✓' : '+'}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setActiveFilterMenu(prev =>
                prev && prev.tableName === tableName && prev.columnName === field
                  ? null
                  : { tableName, columnName: field }
              )
            }}
            style={{
              border: 'none',
              background: menuOpen || columnActive ? '#1976D2' : '#f0f0f0',
              color: menuOpen || columnActive ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title="Filter values"
          >
            ⚲
          </button>
        </div>
        <Plot
          data={[{
            type: 'bar',
            x: labels,
            y: values,
            marker: {
              color: filterValues.map(value =>
                isValueFiltered(field, value) ? '#1976D2' : '#2196F3'
              ),
              line: {
                color: filterValues.map(value =>
                  isValueFiltered(field, value) ? '#000' : undefined
                ),
                width: filterValues.map(value =>
                  isValueFiltered(field, value) ? 2 : 0
                )
              }
            },
            hovertemplate: '%{x}<br>Count: %{y}<extra></extra>'
          }]}
          layout={{
            height: 135,
            margin: { t: 5, b: 40, l: 30, r: 5 },
            xaxis: { tickangle: -45, automargin: true, tickfont: { size: 9 } },
            yaxis: { title: 'Count', automargin: true, tickfont: { size: 9 }, titlefont: { size: 10 } },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            dragmode: 'select',
            selectdirection: 'h'
          }}
          config={{
            displayModeBar: false,
            responsive: true,
            staticPlot: false,
            scrollZoom: false
          }}
          style={{ width: '348px', height: '135px', cursor: 'pointer' }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0]
            if (!point) return

            const pointIndex = point.pointIndex
            if (typeof pointIndex === 'number' && pointIndex >= 0 && pointIndex < filterValues.length) {
              const clickedValue = filterValues[pointIndex]
              toggleFilter(field, clickedValue, tableName)
            }
          }}
          onSelected={(event: PlotSelectionEvent) => {
            if (!event?.points || event.points.length === 0) return
            const selectedValues = event.points
              .map(p => p.pointIndex)
              .filter((idx): idx is number => typeof idx === 'number' && idx >= 0 && idx < filterValues.length)
              .map(idx => filterValues[idx])

            if (selectedValues.length > 0) {
              setFilters(prev => [
                ...prev.filter(f => f.column !== field),
                { column: field, operator: 'in', value: selectedValues, tableName } as any
              ])
            }
          }}
        />
        {renderFilterMenu(tableName, field, categoriesForMenu)}
      </div>
    )
  }

  const renderHistogram = (title: string, tableName: string, field: string, tableColor?: string) => {
    const aggregation = getAggregation(tableName, field)
    if (!aggregation?.numeric_stats) return null

    const rawHistogram = aggregation.histogram ?? []
    if (rawHistogram.length === 0) return null

    const metadata = getColumnMetadata(tableName, field)

    const statsText = [
      `Mean: ${aggregation.numeric_stats.mean !== null ? aggregation.numeric_stats.mean.toFixed(2) : 'N/A'}`,
      `Median: ${aggregation.numeric_stats.median !== null ? aggregation.numeric_stats.median.toFixed(2) : 'N/A'}`,
      `Range: [${aggregation.numeric_stats.min !== null ? aggregation.numeric_stats.min.toFixed(2) : 'N/A'}, ${aggregation.numeric_stats.max !== null ? aggregation.numeric_stats.max.toFixed(2) : 'N/A'}]`
    ].join(' | ')

    const tooltipText = [
      metadata?.display_name || title,
      `ID: ${field}`,
      metadata?.description || '',
      '',
      statsText
    ].filter(Boolean).join('\n')

    const baselineAggregation = getBaselineAggregation(tableName, field)
    const menuHistogram = baselineAggregation?.histogram ?? rawHistogram
    const menuStats = baselineAggregation?.numeric_stats || aggregation.numeric_stats
    const menuOpen = activeFilterMenu?.tableName === tableName && activeFilterMenu.columnName === field
    const columnActive = hasColumnFilter(field)

    const displayHistogram = getDisplayHistogram(menuHistogram, menuStats)
    const binsForPlot = displayHistogram.length > 0 ? displayHistogram : menuHistogram

    // Convert histogram bins to bar chart data
    // Use baseline bins for x-axis, but filtered counts for y-axis
    const xValues = binsForPlot.map(bin => (bin.bin_start + bin.bin_end) / 2)

    // Map filtered counts to baseline bins by checking overlap
    // Since filtered bins have different boundaries, we need to accumulate counts
    // for filtered bins that overlap with each baseline bin
    const yValues = binsForPlot.map(baselineBin => {
      let totalCount = 0

      // Sum up counts from all filtered bins that overlap with this baseline bin
      rawHistogram.forEach(filteredBin => {
        // Check if there's any overlap between baseline and filtered bin
        const overlapStart = Math.max(baselineBin.bin_start, filteredBin.bin_start)
        const overlapEnd = Math.min(baselineBin.bin_end, filteredBin.bin_end)

        if (overlapStart < overlapEnd) {
          // There's overlap - calculate what fraction of the filtered bin overlaps
          const filteredBinWidth = filteredBin.bin_end - filteredBin.bin_start
          const overlapWidth = overlapEnd - overlapStart
          const overlapFraction = overlapWidth / filteredBinWidth

          // Add proportional count
          totalCount += filteredBin.count * overlapFraction
        }
      })

      return Math.round(totalCount)
    })

    const binWidth = binsForPlot[0] ? binsForPlot[0].bin_end - binsForPlot[0].bin_start : 1

    return (
      <div style={{
        position: 'relative',
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '358px',
        minHeight: '175px',
        boxSizing: 'border-box',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        border: tableColor ? `2px solid ${tableColor}20` : undefined
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
          {tableColor && (
            <div style={{
              width: '3px',
              height: '14px',
              borderRadius: '1.5px',
              background: tableColor,
              flexShrink: 0
            }} />
          )}
          <h4
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'help',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexGrow: 1
            }}
            title={tooltipText}
          >
            {metadata?.display_name || title}
          </h4>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggleDashboard(tableName, field)
            }}
            style={{
              border: 'none',
              background: isOnDashboard(tableName, field) ? '#4CAF50' : '#f0f0f0',
              color: isOnDashboard(tableName, field) ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title={isOnDashboard(tableName, field) ? "Remove from dashboard" : "Add to dashboard"}
          >
            {isOnDashboard(tableName, field) ? '✓' : '+'}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setActiveFilterMenu(prev =>
                prev && prev.tableName === tableName && prev.columnName === field
                  ? null
                  : { tableName, columnName: field }
              )
            }}
            style={{
              border: 'none',
              background: menuOpen || columnActive ? '#1976D2' : '#f0f0f0',
              color: menuOpen || columnActive ? 'white' : '#333',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0
            }}
            title="Filter values"
          >
            ⚲
          </button>
        </div>
        <Plot
          data={[{
            type: 'bar',
            x: xValues,
            y: yValues,
            width: binWidth * 0.9,
            marker: {
              color: binsForPlot.map(bin =>
                isRangeFiltered(tableName, field, bin.bin_start, bin.bin_end) ? '#2E7D32' : '#4CAF50'
              ),
              line: {
                color: binsForPlot.map(bin =>
                  isRangeFiltered(tableName, field, bin.bin_start, bin.bin_end) ? '#000' : undefined
                ),
                width: binsForPlot.map(bin =>
                  isRangeFiltered(tableName, field, bin.bin_start, bin.bin_end) ? 2 : 0
                )
              }
            },
            hovertemplate: 'Range: [%{customdata[0]:.2f}, %{customdata[1]:.2f}]<br>Count: %{y}<extra></extra>',
            customdata: binsForPlot.map(bin => [bin.bin_start, bin.bin_end])
          }]}
          layout={{
            height: 135,
            margin: { t: 5, b: 30, l: 30, r: 5 },
            xaxis: { title: field, automargin: true, tickfont: { size: 9 }, titlefont: { size: 10 } },
            yaxis: { title: 'Count', automargin: true, tickfont: { size: 9 }, titlefont: { size: 10 } },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            bargap: 0.1,
            dragmode: 'select',
            selectdirection: 'h'
          }}
          config={{
            displayModeBar: false,
            responsive: true,
            staticPlot: false,
            scrollZoom: false
          }}
          style={{ width: '348px', height: '135px', cursor: 'pointer' }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0]
            if (!point) return

            const pointIndex = point.pointIndex
            if (typeof pointIndex === 'number' && pointIndex >= 0 && pointIndex < binsForPlot.length) {
              const bin = binsForPlot[pointIndex]
              toggleRangeFilter(tableName, field, bin.bin_start, bin.bin_end)
            }
          }}
          onSelected={(event: PlotSelectionEvent) => {
            const rangeX = event?.range?.x
            if (!rangeX || rangeX.length < 2) return

            const [minX, maxX] = rangeX
            updateColumnRanges(tableName, field, prev => {
              const nextRange = { start: minX, end: maxX }
              const existingIndex = prev.findIndex(range => rangesEqual(range, nextRange))
              if (existingIndex >= 0) return prev
              return [...prev, nextRange]
            })
          }}
        />
        {renderNumericFilterMenu(tableName, field, displayHistogram, menuStats)}
      </div>
    )
  }


  if (loading) return <p>Loading explorer...</p>
  if (!dataset) return <p>Dataset not found</p>

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem', background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', position: 'relative' }}>
        <button
          onClick={() => navigate(`/datasets/${id}/manage`)}
          style={{
            position: 'absolute',
            top: '1.5rem',
            right: '1.5rem',
            padding: '0.5rem',
            background: '#757575',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1.2rem',
            lineHeight: '1',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Manage dataset"
        >
          ✎
        </button>

        <h2 style={{ marginTop: 0, paddingRight: '3rem' }}>{dataset.name}</h2>
        {dataset.description && (
          <SafeHtml
            html={dataset.description}
            style={{ color: '#666', margin: '0.5rem 0', display: 'block' }}
          />
        )}

        <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', fontSize: '0.875rem' }}>
          <div>
            <strong>Tables:</strong> {dataset.tables.length}
          </div>
        </div>
      </div>

      {/* Saved Filters Bar - Always visible when presets exist */}
      {presets.length > 0 && (
        <div style={{
          marginBottom: '1rem',
          background: '#E3F2FD',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          border: '1px solid #90CAF9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#1976D2', fontWeight: 500 }}>
            {presets.length} saved filter{presets.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowPresetsDropdown(!showPresetsDropdown)}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem'
                }}
                title="Load a saved filter"
              >
                Load Filter
              </button>
            </div>
            <button
              onClick={() => setShowManagePresetsDialog(true)}
              style={{
                padding: '0.25rem 0.75rem',
                background: '#FF9800',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
              title="Manage saved filters"
            >
              Manage
            </button>
          </div>
        </div>
      )}

      {/* Active Filters */}
      {filters.length > 0 && (
        <div style={{
          marginBottom: '1rem',
          background: '#F5F5F5',
          padding: '1rem',
          borderRadius: '8px',
          border: '1px solid #E0E0E0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.875rem' }}>Active Filters:</strong>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => setShowSavePresetDialog(true)}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem'
                }}
                title="Save current filters"
              >
                Save Filter
              </button>
              <button
                onClick={clearFilters}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem'
                }}
              >
                Clear All
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {filters.map((filter, idx) => {
              // Check if this filter is wrapped with NOT
              const isNot = !!(filter as any).not
              const actualFilter = isNot ? (filter as any).not : filter

              const columnName = getFilterColumn(actualFilter)
              const tableName = getFilterTableName(actualFilter)
              const tableColor = tableName ? getTableColor(tableName) : '#9E9E9E'
              const table = dataset?.tables.find(t => t.name === tableName)

              let displayValue = String(actualFilter.value)
              let logicType = '' // For tooltip

              // Remove handler - uses actualFilter's column/table regardless of NOT wrapper
              const removeHandler = () => {
                if (tableName && columnName) {
                  clearColumnFilter(tableName, columnName)
                } else {
                  setFilters(filters.filter((_, i) => i !== idx))
                }
              }

              // Toggle NOT wrapper
              const toggleNot = () => {
                setFilters(prev => {
                  const updated = [...prev]
                  if (isNot) {
                    // Remove NOT wrapper
                    updated[idx] = actualFilter
                  } else {
                    // Add NOT wrapper
                    updated[idx] = { not: actualFilter } as any
                  }
                  return updated
                })
              }

              if (actualFilter.operator === 'between' && Array.isArray(actualFilter.value)) {
                displayValue = `[${typeof actualFilter.value[0] === 'number' ? actualFilter.value[0].toFixed(2) : actualFilter.value[0]}, ${typeof actualFilter.value[1] === 'number' ? actualFilter.value[1].toFixed(2) : actualFilter.value[1]}]`
                logicType = 'Range'
              } else if (actualFilter.operator === 'in' && Array.isArray(actualFilter.value)) {
                const displayVals = actualFilter.value.map(v => {
                  if (v === '') return '(Empty)'
                  if (v === ' ') return '(Space)'
                  return v
                })
                // Show OR for multi-value selections
                if (actualFilter.value.length > 1) {
                  displayValue = displayVals.slice(0, 3).join(' OR ')
                  if (actualFilter.value.length > 3) {
                    displayValue += ` OR ${actualFilter.value.length - 3} more...`
                  }
                } else {
                  displayValue = displayVals[0] || ''
                }
                logicType = actualFilter.value.length > 1 ? `OR (${actualFilter.value.length} values)` : 'Single value'
              } else if (actualFilter.operator === 'eq') {
                if (actualFilter.value === '') displayValue = '(Empty)'
                else if (actualFilter.value === ' ') displayValue = '(Space)'
                else displayValue = String(actualFilter.value)
                logicType = 'Equals'
              } else if (actualFilter.or && Array.isArray(actualFilter.or)) {
                const ranges = actualFilter.or
                  .map(rangeFilter => rangeFilter as Filter)
                  .filter(rangeFilter => rangeFilter.column === actualFilter.column && rangeFilter.operator === 'between' && Array.isArray(rangeFilter.value))
                  .map(rangeFilter => {
                    const [start, end] = rangeFilter.value
                    const startLabel = typeof start === 'number' ? formatRangeValue(start) : String(start)
                    const endLabel = typeof end === 'number' ? formatRangeValue(end) : String(end)
                    return `${startLabel}–${endLabel}`
                  })

                displayValue = ranges.join(' OR ')
                logicType = `OR (${ranges.length} ranges)`
              }
              const columnLabel = columnName ?? '(Column)'
              const notPrefix = isNot ? 'NOT: ' : ''
              const tooltipText = tableName
                ? `${table?.displayName || tableName}.${columnLabel}\n${notPrefix}${logicType}\nValue: ${displayValue}`
                : columnLabel

              const showAndSeparator = idx > 0

              return (
                <React.Fragment key={idx}>
                  {showAndSeparator && (
                    <div style={{
                      color: '#666',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0 0.25rem',
                      userSelect: 'none'
                    }}>
                      AND
                    </div>
                  )}
                  <div
                    style={{
                      background: isNot ? `linear-gradient(135deg, ${tableColor}DD, ${tableColor}BB)` : tableColor,
                      padding: '0.25rem 0.75rem',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      border: isNot ? `2px dashed ${tableColor}` : `2px solid ${tableColor}`,
                      color: 'white',
                      fontWeight: 500,
                      opacity: isNot ? 0.9 : 1
                    }}
                    title={tooltipText}
                  >
                    {isNot && (
                      <span style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '3px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        marginRight: '0.1rem'
                      }}>
                        NOT
                      </span>
                    )}
                    <span style={{ textDecoration: isNot ? 'line-through' : 'none' }}>
                      <strong>{columnLabel}:</strong> {displayValue}
                    </span>
                    <button
                      onClick={toggleNot}
                      style={{
                        background: isNot ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        padding: '0 0.3rem',
                        fontSize: '0.75rem',
                        lineHeight: '1',
                        borderRadius: '3px',
                        fontWeight: 'bold'
                      }}
                      title={isNot ? 'Remove NOT' : 'Add NOT'}
                    >
                      ¬
                    </button>
                    <button
                      onClick={removeHandler}
                      style={{
                        background: 'rgba(255,255,255,0.3)',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        padding: '0 0.25rem',
                        fontSize: '1rem',
                        lineHeight: '1',
                        borderRadius: '3px',
                        fontWeight: 'bold'
                      }}
                    >
                      ×
                    </button>
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}

      {/* Save Filter Dialog */}
      {showSavePresetDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowSavePresetDialog(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '8px',
              minWidth: '400px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Save Filter</h3>
            <input
              type="text"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              placeholder="Enter filter name..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') savePreset()
                if (e.key === 'Escape') setShowSavePresetDialog(false)
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSavePresetDialog(false)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f0f0f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Cancel
              </button>
              <button
                onClick={savePreset}
                disabled={!presetNameInput.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  background: presetNameInput.trim() ? '#4CAF50' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: presetNameInput.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Filter Dropdown */}
      {showPresetsDropdown && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999
          }}
          onClick={() => setShowPresetsDropdown(false)}
        >
          <div
            style={{
              position: 'absolute',
              top: '120px',
              right: '20px',
              background: 'white',
              border: '1px solid #ddd',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '0.5rem',
              minWidth: '300px',
              maxHeight: '400px',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '0.5rem', borderBottom: '1px solid #eee', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.875rem' }}>Select Filter</strong>
            </div>
            {presets.map((preset) => (
              <div
                key={preset.id}
                onClick={() => applyPreset(preset)}
                style={{
                  padding: '0.75rem',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  marginBottom: '0.25rem',
                  border: '1px solid #eee',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                  {preset.name}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#666' }}>
                  {preset.filters.length} filter{preset.filters.length !== 1 ? 's' : ''} · {new Date(preset.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manage Filters Dialog */}
      {showManagePresetsDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowManagePresetsDialog(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '8px',
              minWidth: '500px',
              maxHeight: '600px',
              overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Manage Saved Filters</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={exportPresets}
                  style={{
                    padding: '0.4rem 0.75rem',
                    background: '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  Export
                </button>
                <label style={{
                  padding: '0.4rem 0.75rem',
                  background: '#FF9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem'
                }}>
                  Import
                  <input
                    type="file"
                    accept=".json"
                    onChange={importPresets}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
            {presets.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center', padding: '2rem' }}>
                No filters saved yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      padding: '0.75rem'
                    }}
                  >
                    {editingPresetId === preset.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          defaultValue={preset.name}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renamePreset(preset.id, e.currentTarget.value)
                            if (e.key === 'Escape') setEditingPresetId(null)
                          }}
                          autoFocus
                          style={{
                            flex: 1,
                            padding: '0.25rem 0.5rem',
                            border: '1px solid #2196F3',
                            borderRadius: '4px',
                            fontSize: '0.875rem'
                          }}
                        />
                        <button
                          onClick={(e) => renamePreset(preset.id, e.currentTarget.previousElementSibling?.['value'] || '')}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingPresetId(null)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f0f0f0',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <strong style={{ fontSize: '0.875rem' }}>{preset.name}</strong>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => setEditingPresetId(preset.id)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#2196F3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete saved filter "${preset.name}"?`)) {
                                deletePreset(preset.id)
                              }
                            }}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>
                      {preset.filters.length} filter{preset.filters.length !== 1 ? 's' : ''} · Created {new Date(preset.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowManagePresetsDialog(false)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f0f0f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Dashboard Dialog */}
      {showSaveDashboardDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowSaveDashboardDialog(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '8px',
              minWidth: '400px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Save Dashboard</h3>
            <input
              type="text"
              value={newDashboardName}
              onChange={(e) => setNewDashboardName(e.target.value)}
              placeholder="Enter dashboard name..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newDashboardName.trim()) saveDashboard(newDashboardName.trim())
                if (e.key === 'Escape') setShowSaveDashboardDialog(false)
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowSaveDashboardDialog(false)
                  setNewDashboardName('')
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f0f0f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => saveDashboard(newDashboardName.trim())}
                disabled={!newDashboardName.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  background: newDashboardName.trim() ? '#4CAF50' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: newDashboardName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Dashboard Dialog */}
      {showLoadDashboardDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowLoadDashboardDialog(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '8px',
              minWidth: '400px',
              maxWidth: '500px',
              maxHeight: '600px',
              overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Load Dashboard</h3>
            {savedDashboards.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center', padding: '2rem' }}>
                No saved dashboards yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {savedDashboards.map(dashboard => (
                  <div
                    key={dashboard.id}
                    onClick={() => {
                      loadDashboard(dashboard.id)
                      setShowLoadDashboardDialog(false)
                    }}
                    style={{
                      padding: '0.75rem',
                      border: activeDashboardId === dashboard.id ? '2px solid #2196F3' : '1px solid #ddd',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'background 0.2s, border-color 0.2s',
                      background: activeDashboardId === dashboard.id ? '#E3F2FD' : 'white'
                    }}
                    onMouseEnter={(e) => {
                      if (activeDashboardId !== dashboard.id) {
                        e.currentTarget.style.background = '#f5f5f5'
                        e.currentTarget.style.borderColor = '#2196F3'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeDashboardId !== dashboard.id) {
                        e.currentTarget.style.background = 'white'
                        e.currentTarget.style.borderColor = '#ddd'
                      }
                    }}
                  >
                    <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                      {dashboard.name}
                      {activeDashboardId === dashboard.id && (
                        <span style={{ marginLeft: '0.5rem', color: '#2196F3', fontSize: '0.75rem' }}>(Most Recently Loaded)</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>
                      {dashboard.charts.length} chart{dashboard.charts.length !== 1 ? 's' : ''} · Created {new Date(dashboard.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowLoadDashboardDialog(false)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f0f0f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Dashboards Dialog */}
      {showManageDashboardsDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowManageDashboardsDialog(false)}
        >
          <div
            style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '8px',
              minWidth: '500px',
              maxHeight: '600px',
              overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem 0' }}>Manage Saved Dashboards</h3>
            {savedDashboards.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center', padding: '2rem' }}>
                No dashboards saved yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {savedDashboards.map((dashboard) => (
                  <div
                    key={dashboard.id}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      padding: '0.75rem'
                    }}
                  >
                    {editingDashboardId === dashboard.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          defaultValue={dashboard.name}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renameDashboard(dashboard.id, e.currentTarget.value)
                            if (e.key === 'Escape') setEditingDashboardId(null)
                          }}
                          autoFocus
                          style={{
                            flex: 1,
                            padding: '0.25rem 0.5rem',
                            border: '1px solid #2196F3',
                            borderRadius: '4px',
                            fontSize: '0.875rem'
                          }}
                        />
                        <button
                          onClick={(e) => {
                            const input = e.currentTarget.previousElementSibling as HTMLInputElement
                            renameDashboard(dashboard.id, input?.value || '')
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingDashboardId(null)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f0f0f0',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <strong style={{ fontSize: '0.875rem' }}>{dashboard.name}</strong>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => {
                              setEditingDashboardId(dashboard.id)
                              setEditingDashboardName(dashboard.name)
                            }}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#2196F3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete dashboard "${dashboard.name}"?`)) {
                                deleteDashboard(dashboard.id)
                              }
                            }}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>
                      {dashboard.charts.length} chart{dashboard.charts.length !== 1 ? 's' : ''} · Created {new Date(dashboard.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowManageDashboardsDialog(false)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f0f0f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{
        marginBottom: '1.5rem',
        background: 'white',
        padding: '0.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap'
      }}>
        {/* Dashboard Tab */}
        <button
          onClick={() => setActiveTab('dashboard')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'dashboard' ? '#607D8B' : 'transparent',
            color: activeTab === 'dashboard' ? 'white' : '#333',
            border: `2px solid ${activeTab === 'dashboard' ? '#607D8B' : '#E0E0E0'}`,
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: activeTab === 'dashboard' ? 600 : 400,
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseEnter={(e) => {
            if (activeTab !== 'dashboard') {
              e.currentTarget.style.borderColor = '#607D8B'
              e.currentTarget.style.color = '#607D8B'
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'dashboard') {
              e.currentTarget.style.borderColor = '#E0E0E0'
              e.currentTarget.style.color = '#333'
            }
          }}
        >
          <div style={{
            width: '8px',
            height: '20px',
            borderRadius: '2px',
            background: activeTab === 'dashboard' ? 'white' : '#607D8B'
          }} />
          Dashboard {dashboardCharts.length > 0 && `(${dashboardCharts.length})`}
        </button>

        {/* Table Tabs */}
        {dataset.tables.map(table => {
          const tableColor = getTableColor(table.name)
          const isActive = activeTab === table.name
          const chartCount = getTableChartCount(table.name)

          return (
            <button
              key={table.name}
              onClick={() => setActiveTab(table.name)}
              style={{
                padding: '0.75rem 1.5rem',
                background: isActive ? tableColor : 'transparent',
                color: isActive ? 'white' : '#333',
                border: `2px solid ${isActive ? tableColor : '#E0E0E0'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = tableColor
                  e.currentTarget.style.color = tableColor
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = '#E0E0E0'
                  e.currentTarget.style.color = '#333'
                }
              }}
            >
              <div style={{
                width: '8px',
                height: '20px',
                borderRadius: '2px',
                background: isActive ? 'white' : tableColor
              }} />
              {table.displayName || table.name} {chartCount > 0 && `(${chartCount})`}
            </button>
          )
        })}
      </div>

      {/* Dashboard View */}
      {activeTab === 'dashboard' && (
        <div>
          {/* Dashboard Controls - always visible */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            gap: '1rem'
          }}>
            <h3 style={{ margin: 0 }}>
              {activeDashboardId
                ? `Dashboard: ${savedDashboards.find(d => d.id === activeDashboardId)?.name || 'Unknown'}`
                : `Dashboard (${dashboardCharts.length} charts)`}
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setShowLoadDashboardDialog(true)}
                disabled={savedDashboards.length === 0}
                style={{
                  padding: '0.5rem 1rem',
                  background: savedDashboards.length > 0 ? '#4CAF50' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: savedDashboards.length > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem'
                }}
              >
                Load Dashboard
              </button>
              <button
                onClick={() => setShowSaveDashboardDialog(true)}
                disabled={dashboardCharts.length === 0}
                style={{
                  padding: '0.5rem 1rem',
                  background: dashboardCharts.length > 0 ? '#2196F3' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: dashboardCharts.length > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem'
                }}
              >
                Save Dashboard
              </button>
              <button
                onClick={() => setShowManageDashboardsDialog(true)}
                disabled={savedDashboards.length === 0}
                style={{
                  padding: '0.5rem 1rem',
                  background: savedDashboards.length > 0 ? '#FF9800' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: savedDashboards.length > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem'
                }}
              >
                Manage
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Clear all charts from dashboard?')) {
                    setDashboardCharts([])
                    setActiveDashboardId(null)
                  }
                }}
                disabled={dashboardCharts.length === 0}
                style={{
                  padding: '0.5rem 1rem',
                  background: dashboardCharts.length > 0 ? '#f44336' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: dashboardCharts.length > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem'
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Dashboard Content */}
          {dashboardCharts.length === 0 ? (
            <div style={{
              background: 'white',
              padding: '3rem',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              textAlign: 'center',
              color: '#666'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#333' }}>Your Dashboard is Empty</h3>
              <p style={{ margin: 0 }}>
                Click on the <strong>+ Add to Dashboard</strong> button on any chart in the table tabs to pin it here.
                {savedDashboards.length > 0 && <><br />Or use the <strong>Load Dashboard</strong> button above to load a saved dashboard.</>}
              </p>
            </div>
          ) : (
            <div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, 175px)',
                gridAutoRows: '175px',
                gap: '0.5rem',
                gridAutoFlow: 'dense'
              }}>
                {dashboardCharts.map(({ tableName, columnName }) => {
                  const aggregation = getAggregation(tableName, columnName)
                  if (!aggregation) return null

                  const tableColor = getTableColor(tableName)
                  const displayTitle = getDisplayTitle(tableName, columnName)
                  const table = dataset.tables.find(t => t.name === tableName)

                  if (aggregation.display_type === 'categorical' && aggregation.categories) {
                    const categoryCount = aggregation.categories.length
                    const viewPref = getViewPreference(tableName, columnName, categoryCount)

                    if (viewPref === 'table') {
                      return (
                        <div key={`${tableName}_${columnName}`} style={{ gridColumn: 'span 2', gridRow: 'span 2' }}>
                          {renderTableView(`${table?.displayName || tableName} - ${displayTitle}`, tableName, columnName, tableColor)}
                        </div>
                      )
                    }

                    if (categoryCount <= 8) {
                      return (
                        <div key={`${tableName}_${columnName}`}>
                          {renderPieChart(`${table?.displayName || tableName} - ${displayTitle}`, tableName, columnName, tableColor)}
                        </div>
                      )
                    } else {
                      return (
                        <div key={`${tableName}_${columnName}`} style={{ gridColumn: 'span 2' }}>
                          {renderBarChart(`${table?.displayName || tableName} - ${displayTitle}`, tableName, columnName, tableColor)}
                        </div>
                      )
                    }
                  } else if (aggregation.display_type === 'numeric' && aggregation.histogram) {
                    return (
                      <div key={`${tableName}_${columnName}`} style={{ gridColumn: 'span 2' }}>
                        {renderHistogram(`${table?.displayName || tableName} - ${displayTitle}`, tableName, columnName, tableColor)}
                      </div>
                    )
                  }
                  return null
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chart Grid - Grouped by Table */}
      {dataset.tables
        .filter(table => table.name === activeTab)
        .map(table => {
        const tableAggregations = aggregations[table.name]
        if (!tableAggregations) return null

        // Sort aggregations by display priority (if available from metadata)
        const sortedAggregations = [...tableAggregations].sort((a, b) => {
          const metaA = getColumnMetadata(table.name, a.column_name)
          const metaB = getColumnMetadata(table.name, b.column_name)
          const priorityA = metaA?.display_priority || 0
          const priorityB = metaB?.display_priority || 0
          return priorityB - priorityA
        })

        // Filter out hidden columns
        const visibleAggregations = sortedAggregations.filter(agg => {
          const metadata = getColumnMetadata(table.name, agg.column_name)
          return !metadata?.is_hidden
        })

        if (visibleAggregations.length === 0) return null

        const tableColor = getTableColor(table.name)
        const tableRowCount = visibleAggregations[0]?.total_rows || table.rowCount || 0

        // Get baseline (unfiltered) row count for this table
        const baselineTableAggs = baselineAggregations[table.name] || []
        const baselineRowCount = baselineTableAggs.length > 0
          ? baselineTableAggs[0]?.total_rows || tableRowCount
          : tableRowCount

        // Get filter counts for this table
        const effectiveFilters = getAllEffectiveFilters()
        const tableFilters = effectiveFilters[table.name] || { direct: [], propagated: [] }
        const directFilterCount = tableFilters.direct.length
        const propagatedFilterCount = tableFilters.propagated.length
        const hasTableFilters = directFilterCount > 0 || propagatedFilterCount > 0

        // Calculate maximum path length for transitive relationships (2+ hops only)
        let maxPathLength = 0
        if (propagatedFilterCount > 0 && dataset?.tables) {
          for (const filter of tableFilters.propagated) {
            if (filter.tableName) {
              const path = findRelationshipPath(table.name, filter.tableName, dataset.tables)
              if (path && path.length > 1) {
                const pathLength = path.length - 1 // Number of hops
                // Only track paths with 2+ hops (truly transitive)
                if (pathLength >= 2) {
                  maxPathLength = Math.max(maxPathLength, pathLength)
                }
              }
            }
          }
        }

        return (
          <div key={table.name} style={{ marginBottom: '2.5rem' }}>
            {/* Table Section Header */}
            <div style={{
              background: `linear-gradient(135deg, ${tableColor}15, ${tableColor}05)`,
              border: `2px solid ${tableColor}40`,
              borderRadius: '8px',
              padding: '0.75rem 1.25rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  background: tableColor,
                  color: 'white',
                  width: '8px',
                  height: '40px',
                  borderRadius: '4px'
                }} />
                <div>
                  <h3 style={{
                    margin: 0,
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    color: '#333'
                  }}>
                    {table.displayName || table.name}
                  </h3>
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#666',
                    marginTop: '0.2rem'
                  }}>
                    {hasTableFilters ? (
                      <>
                        <span style={{ color: '#E65100', fontWeight: 600 }}>
                          {tableRowCount.toLocaleString()}
                        </span>
                        <span style={{ color: '#999' }}> / </span>
                        <span>{baselineRowCount.toLocaleString()}</span>
                        <span style={{
                          marginLeft: '0.3rem',
                          padding: '0.1rem 0.4rem',
                          background: '#FF9800',
                          color: 'white',
                          borderRadius: '8px',
                          fontSize: '0.7rem',
                          fontWeight: 600
                        }}>
                          {baselineRowCount > 0 ? ((tableRowCount / baselineRowCount) * 100).toFixed(1) : '0'}%
                        </span>
                        <span> rows · {visibleAggregations.length} columns</span>
                      </>
                    ) : (
                      <>{tableRowCount.toLocaleString()} rows · {visibleAggregations.length} columns</>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Filter badges */}
                {directFilterCount > 0 && (
                  <div
                    style={{
                      background: '#1976D2',
                      color: 'white',
                      fontSize: '0.7rem',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '4px',
                      fontWeight: 600
                    }}
                    title={`${directFilterCount} direct filter${directFilterCount > 1 ? 's' : ''} applied`}
                  >
                    {directFilterCount} filter{directFilterCount > 1 ? 's' : ''}
                  </div>
                )}
                {propagatedFilterCount > 0 && (
                  <div
                    style={{
                      background: '#64B5F6',
                      color: 'white',
                      fontSize: '0.7rem',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '4px',
                      fontWeight: 600,
                      fontStyle: 'italic'
                    }}
                    title={`${propagatedFilterCount} filter${propagatedFilterCount > 1 ? 's' : ''} propagated from related tables${maxPathLength > 0 ? ` (max ${maxPathLength} hop${maxPathLength > 1 ? 's' : ''})` : ''}`}
                  >
                    +{propagatedFilterCount} linked{maxPathLength > 0 ? ` (${maxPathLength}-hop)` : ''}
                  </div>
                )}
                {/* Add All Charts button */}
                <button
                  onClick={() => {
                    addAllChartsToTable(table.name)
                  }}
                  style={{
                    padding: '0.3rem 0.6rem',
                    background: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#45a049'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#4CAF50'
                  }}
                  title="Add all charts from this table to dashboard"
                >
                  + Add All
                </button>
                <div style={{
                  background: tableColor,
                  color: 'white',
                  fontSize: '0.7rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '4px',
                  fontWeight: 600
                }}>
                  {table.name}
                </div>
              </div>
            </div>

            {/* Table Charts */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, 175px)',
              gridAutoRows: '175px',
              gap: '0.5rem',
              gridAutoFlow: 'dense'
            }}>
              {visibleAggregations.map(agg => {
                const displayTitle = getDisplayTitle(table.name, agg.column_name)

                if (agg.display_type === 'categorical' && agg.categories) {
                  const categoryCount = agg.categories.length
                  const viewPref = getViewPreference(table.name, agg.column_name, categoryCount)

                  // Show table if user chose table or if >8 categories by default
                  if (viewPref === 'table') {
                    return (
                      <div key={`${table.name}_${agg.column_name}`} style={{ gridColumn: 'span 2', gridRow: 'span 2' }}>
                        {renderTableView(displayTitle, table.name, agg.column_name, tableColor)}
                      </div>
                    )
                  }

                  // Otherwise show chart (pie for ≤8, bar for >8)
                  if (categoryCount <= 8) {
                    return (
                      <div key={`${table.name}_${agg.column_name}`}>
                        {renderPieChart(displayTitle, table.name, agg.column_name, tableColor)}
                      </div>
                    )
                  } else {
                    return (
                      <div key={`${table.name}_${agg.column_name}`} style={{ gridColumn: 'span 2' }}>
                        {renderBarChart(displayTitle, table.name, agg.column_name, tableColor)}
                      </div>
                    )
                  }
                } else if (agg.display_type === 'numeric' && agg.histogram) {
                  return (
                    <div key={`${table.name}_${agg.column_name}`} style={{ gridColumn: 'span 2' }}>
                      {renderHistogram(displayTitle, table.name, agg.column_name, tableColor)}
                    </div>
                  )
                }
                return null
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default DatasetExplorer
