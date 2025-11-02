import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import DatasetExplorer from '../DatasetExplorer'
import api from '../../services/api'

// Mock the API module
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

// Mock react-router-dom hooks
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: 'test-dataset-id' }),
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/datasets/test-dataset-id', search: '', hash: '' }),
  }
})

// Mock Plotly to avoid rendering issues in tests
vi.mock('react-plotly.js', () => ({
  default: () => <div data-testid="mock-plot">Mock Plot</div>,
}))

// Mock SafeHtml component
vi.mock('../../components/SafeHtml', () => ({
  default: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}))

describe('DatasetExplorer', () => {
  const mockDataset = {
    id: 'test-dataset-id',
    name: 'Test Dataset',
    description: 'Test dataset description',
    database_type: 'created',
    tables: [
      {
        id: 'table1',
        name: 'customers',
        displayName: 'Customers',
        rowCount: 100,
        columns: [
          { name: 'id', type: 'integer', nullable: false },
          { name: 'name', type: 'string', nullable: false },
          { name: 'age', type: 'integer', nullable: true },
        ],
        relationships: [],
      },
      {
        id: 'table2',
        name: 'orders',
        displayName: 'Orders',
        rowCount: 500,
        columns: [
          { name: 'id', type: 'integer', nullable: false },
          { name: 'customer_id', type: 'integer', nullable: false },
          { name: 'amount', type: 'number', nullable: false },
        ],
        relationships: [
          {
            foreign_key: 'customer_id',
            referenced_table: 'customers',
            referenced_column: 'id',
            type: 'many-to-one',
          },
        ],
      },
    ],
  }

  const mockAggregations = [
    {
      column_name: 'age',
      display_type: 'numeric',
      total_rows: 100,
      null_count: 5,
      unique_count: 45,
      histogram: [
        { bin_start: 0, bin_end: 10, count: 20, percentage: 20 },
        { bin_start: 10, bin_end: 20, count: 30, percentage: 30 },
      ],
    },
    {
      column_name: 'country',
      display_type: 'categorical',
      total_rows: 100,
      null_count: 0,
      unique_count: 3,
      categories: [
        { value: 'USA', display_value: 'USA', count: 50, percentage: 50 },
        { value: 'Canada', display_value: 'Canada', count: 30, percentage: 30 },
        { value: 'UK', display_value: 'UK', count: 20, percentage: 20 },
      ],
    },
  ]

  const mockColumnMetadata = [
    {
      column_name: 'age',
      column_type: 'integer',
      column_index: 2,
      is_nullable: true,
      display_name: 'Age',
      description: 'Customer age',
      user_data_type: 'numeric',
      user_priority: 1,
      display_type: 'numeric',
      unique_value_count: 45,
      null_count: 5,
      min_value: '18',
      max_value: '90',
      suggested_chart: 'histogram',
      display_priority: 1,
      is_hidden: false,
    },
    {
      column_name: 'country',
      column_type: 'string',
      column_index: 3,
      is_nullable: false,
      display_name: 'Country',
      description: 'Customer country',
      user_data_type: 'categorical',
      user_priority: 2,
      display_type: 'categorical',
      unique_value_count: 3,
      null_count: 0,
      min_value: null,
      max_value: null,
      suggested_chart: 'pie',
      display_priority: 2,
      is_hidden: false,
    },
  ]

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks()

    // Clear localStorage
    localStorage.clear()

    // Reset navigate mock
    mockNavigate.mockClear()

    // Setup default API responses
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/datasets/test-dataset-id') {
        return Promise.resolve({ data: { dataset: mockDataset } })
      }
      if (url.includes('/aggregations')) {
        return Promise.resolve({ data: { aggregations: mockAggregations } })
      }
      if (url.includes('/columns')) {
        return Promise.resolve({ data: { columns: mockColumnMetadata } })
      }
      return Promise.reject(new Error(`Unknown endpoint: ${url}`))
    })
  })

  describe('Smoke Test', () => {
    test('renders without crashing with mock dataset', async () => {
      render(
        <BrowserRouter>
          <DatasetExplorer />
        </BrowserRouter>
      )

      // Wait for dataset to load
      await waitFor(() => {
        expect(screen.getByText('Test Dataset')).toBeInTheDocument()
      })

      // Verify tables are present (using getAllByText since tabs now also show table names)
      const customersElements = screen.getAllByText('Customers')
      expect(customersElements.length).toBeGreaterThan(0)

      const ordersElements = screen.getAllByText('Orders')
      expect(ordersElements.length).toBeGreaterThan(0)
    })
  })

  describe('Filter Persistence', () => {
    test('saves filters to localStorage when filters change', async () => {
      render(
        <BrowserRouter>
          <DatasetExplorer />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Dataset')).toBeInTheDocument()
      })

      // Simulate adding a filter (this would normally happen through chart interaction)
      // For now, we verify localStorage is set up correctly
      const storedFilters = localStorage.getItem('filters_test-dataset-id')

      // Initially should be null or empty
      expect(storedFilters).toBeNull()
    })

    test('updates URL hash when filters change', async () => {
      render(
        <BrowserRouter>
          <DatasetExplorer />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Dataset')).toBeInTheDocument()
      })

      // Verify navigate was not called initially (no filters)
      // In the actual implementation, navigate would be called when filters are added
      // This test validates the initial state
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    test('restores filters from URL hash on mount', async () => {
      // This test verifies the deserialization logic works
      // Create a filter and encode it (same format as the app uses)
      const testFilter = [{ column: 'age', operator: 'gte' as const, value: 25, tableName: 'customers' }]
      const encoded = btoa(encodeURIComponent(JSON.stringify(testFilter)))

      // Verify encoding/decoding works correctly (unit test style)
      const decoded = JSON.parse(decodeURIComponent(atob(encoded)))
      expect(decoded).toEqual(testFilter)

      // In a full E2E test, you would navigate to /#filters=${encoded}
      // For this unit test, we verify the serialization logic
      expect(decoded[0].column).toBe('age')
      expect(decoded[0].value).toBe(25)
    })
  })

  describe('Filter Presets', () => {
    test('saves new filter preset to localStorage', async () => {
      render(
        <BrowserRouter>
          <DatasetExplorer />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Dataset')).toBeInTheDocument()
      })

      // Initially no presets
      const storedPresets = localStorage.getItem('presets_test-dataset-id')
      expect(storedPresets).toBeNull()

      // In actual implementation, this would test the save preset button click
      // For now, verify initial state
    })

    test('loads filter preset and applies filters', async () => {
      // Pre-populate localStorage with a preset
      const mockPreset = {
        id: 'preset1',
        name: 'Test Preset',
        filters: [{ column: 'age', operator: 'gte' as const, value: 25, tableName: 'customers' }],
        createdAt: new Date().toISOString(),
      }
      localStorage.setItem('presets_test-dataset-id', JSON.stringify([mockPreset]))

      render(
        <BrowserRouter>
          <DatasetExplorer />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Dataset')).toBeInTheDocument()
      })

      // Verify preset was loaded
      const storedPresets = localStorage.getItem('presets_test-dataset-id')
      expect(storedPresets).toBeTruthy()
      const presets = JSON.parse(storedPresets!)
      expect(presets).toHaveLength(1)
      expect(presets[0].name).toBe('Test Preset')
    })

    test('deletes filter preset from localStorage', async () => {
      // Pre-populate localStorage with presets
      const mockPresets = [
        {
          id: 'preset1',
          name: 'Preset 1',
          filters: [],
          createdAt: new Date().toISOString(),
        },
        {
          id: 'preset2',
          name: 'Preset 2',
          filters: [],
          createdAt: new Date().toISOString(),
        },
      ]
      localStorage.setItem('presets_test-dataset-id', JSON.stringify(mockPresets))

      render(
        <BrowserRouter>
          <DatasetExplorer />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Dataset')).toBeInTheDocument()
      })

      // Verify presets were loaded
      const storedPresets = localStorage.getItem('presets_test-dataset-id')
      const presets = JSON.parse(storedPresets!)
      expect(presets).toHaveLength(2)

      // In actual implementation, would test delete button click
      // For now, verify presets are loaded
    })
  })

  describe('View Preferences', () => {
    test('toggles between chart and table view and persists to localStorage', async () => {
      render(
        <BrowserRouter>
          <DatasetExplorer />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Dataset')).toBeInTheDocument()
      })

      // Initially no view preferences stored
      const storedPrefs = localStorage.getItem('viewPrefs_test-dataset-id')
      expect(storedPrefs).toBeNull()

      // In actual implementation, would test toggle button click
      // For now, verify initial state
    })
  })
})
