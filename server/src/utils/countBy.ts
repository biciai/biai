import type { CountByConfig } from '../services/aggregationService.js'

/**
 * Parse the `countBy` query parameter into a configuration object.
 *
 * Supported formats:
 *   - undefined, '', or 'rows' → default row counting
 *   - 'parent:<table_name>' → count distinct values of the referenced table
 *
 * @param raw Raw query string value (e.g. "parent:patients")
 * @returns Parsed configuration or an error string when invalid
 */
export function parseCountByQuery(raw?: string): { config?: CountByConfig; error?: string } {
  if (!raw) {
    return { config: undefined }
  }

  const normalized = raw.trim()
  if (!normalized || normalized.toLowerCase() === 'rows') {
    return { config: undefined }
  }

  if (normalized.startsWith('parent:')) {
    const target = normalized.slice('parent:'.length).trim()
    if (!target) {
      return { error: 'Invalid countBy parameter' }
    }
    return {
      config: {
        mode: 'parent',
        target_table: target
      }
    }
  }

  return { error: 'Invalid countBy parameter' }
}
