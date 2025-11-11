import type { CountByConfig } from '../services/aggregationService.js'

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
