/**
 * Filter helper utilities for cross-table filtering
 */

export interface Filter {
  column?: string
  operator?: 'eq' | 'in' | 'gt' | 'lt' | 'gte' | 'lte' | 'between'
  value?: any
  and?: Filter[]
  or?: Filter[]
  not?: Filter
  tableName?: string
}

export interface TableRelationship {
  foreign_key: string
  referenced_table: string
  referenced_column: string
  type?: string
}

export interface Table {
  id: string
  name: string
  displayName: string
  rowCount: number
  relationships?: TableRelationship[]
}

/**
 * Extract the column name from a filter tree
 */
export const getFilterColumn = (filter: Filter): string | undefined => {
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

/**
 * Extract the table name from a filter
 */
export const getFilterTableName = (filter: Filter): string | undefined => filter.tableName

/**
 * Check if a filter tree contains a specific column
 */
export const filterContainsColumn = (filter: Filter, column: string): boolean => {
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

/**
 * Check if two tables have a relationship (bidirectional)
 */
export const tablesHaveRelationship = (
  table1: Table,
  table2: Table,
  allTables: Table[]
): boolean => {
  // Check if table1 references table2
  const table1RefersToTable2 = table1.relationships?.some(
    rel => rel.referenced_table === table2.name
  )
  if (table1RefersToTable2) return true

  // Check if table2 references table1
  const table2RefersToTable1 = table2.relationships?.some(
    rel => rel.referenced_table === table1.name
  )
  return !!table2RefersToTable1
}

/**
 * Get all effective filters (direct + propagated) for each table
 */
export const getAllEffectiveFilters = (
  filters: Filter[],
  tables: Table[]
): Record<string, { direct: Filter[]; propagated: Filter[] }> => {
  const result: Record<string, { direct: Filter[]; propagated: Filter[] }> = {}

  // Initialize all tables
  for (const table of tables) {
    result[table.name] = { direct: [], propagated: [] }
  }

  // Group filters by their tableName property
  for (const filter of filters) {
    const filterTableName = getFilterTableName(filter)
    if (!filterTableName) continue

    // This filter belongs to filterTableName
    // It's "direct" for that table, "propagated" for other tables with relationships
    for (const table of tables) {
      if (table.name === filterTableName) {
        // Direct filter
        result[table.name].direct.push(filter)
      } else {
        // Check if there's a relationship between these tables
        const filterTable = tables.find(t => t.name === filterTableName)
        if (!filterTable) continue

        const hasRelationship = tablesHaveRelationship(table, filterTable, tables)

        if (hasRelationship) {
          // This is a propagated filter for this table
          result[table.name].propagated.push(filter)
        }
      }
    }
  }

  return result
}
