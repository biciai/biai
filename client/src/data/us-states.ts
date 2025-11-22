/**
 * US States lookup data and helper functions for geographic visualizations
 */

export interface StateInfo {
  name: string
  code: string
}

export const US_STATES: StateInfo[] = [
  { name: 'Alabama', code: 'AL' },
  { name: 'Alaska', code: 'AK' },
  { name: 'Arizona', code: 'AZ' },
  { name: 'Arkansas', code: 'AR' },
  { name: 'California', code: 'CA' },
  { name: 'Colorado', code: 'CO' },
  { name: 'Connecticut', code: 'CT' },
  { name: 'Delaware', code: 'DE' },
  { name: 'Florida', code: 'FL' },
  { name: 'Georgia', code: 'GA' },
  { name: 'Hawaii', code: 'HI' },
  { name: 'Idaho', code: 'ID' },
  { name: 'Illinois', code: 'IL' },
  { name: 'Indiana', code: 'IN' },
  { name: 'Iowa', code: 'IA' },
  { name: 'Kansas', code: 'KS' },
  { name: 'Kentucky', code: 'KY' },
  { name: 'Louisiana', code: 'LA' },
  { name: 'Maine', code: 'ME' },
  { name: 'Maryland', code: 'MD' },
  { name: 'Massachusetts', code: 'MA' },
  { name: 'Michigan', code: 'MI' },
  { name: 'Minnesota', code: 'MN' },
  { name: 'Mississippi', code: 'MS' },
  { name: 'Missouri', code: 'MO' },
  { name: 'Montana', code: 'MT' },
  { name: 'Nebraska', code: 'NE' },
  { name: 'Nevada', code: 'NV' },
  { name: 'New Hampshire', code: 'NH' },
  { name: 'New Jersey', code: 'NJ' },
  { name: 'New Mexico', code: 'NM' },
  { name: 'New York', code: 'NY' },
  { name: 'North Carolina', code: 'NC' },
  { name: 'North Dakota', code: 'ND' },
  { name: 'Ohio', code: 'OH' },
  { name: 'Oklahoma', code: 'OK' },
  { name: 'Oregon', code: 'OR' },
  { name: 'Pennsylvania', code: 'PA' },
  { name: 'Rhode Island', code: 'RI' },
  { name: 'South Carolina', code: 'SC' },
  { name: 'South Dakota', code: 'SD' },
  { name: 'Tennessee', code: 'TN' },
  { name: 'Texas', code: 'TX' },
  { name: 'Utah', code: 'UT' },
  { name: 'Vermont', code: 'VT' },
  { name: 'Virginia', code: 'VA' },
  { name: 'Washington', code: 'WA' },
  { name: 'West Virginia', code: 'WV' },
  { name: 'Wisconsin', code: 'WI' },
  { name: 'Wyoming', code: 'WY' },
  { name: 'District of Columbia', code: 'DC' },
  { name: 'Puerto Rico', code: 'PR' },
]

// Create lookup maps for O(1) access
const nameToCodeMap = new Map<string, string>()
const codeToNameMap = new Map<string, string>()

US_STATES.forEach(state => {
  nameToCodeMap.set(state.name.toLowerCase(), state.code)
  codeToNameMap.set(state.code.toLowerCase(), state.name)
})

/**
 * Convert state name to 2-letter code
 * @param stateName - Full state name (case insensitive)
 * @returns State code (uppercase) or null if not found
 */
export function getStateCode(stateName: string): string | null {
  if (!stateName) return null

  const normalized = stateName.trim().toLowerCase()

  // Check if already a code
  if (normalized.length === 2 && codeToNameMap.has(normalized)) {
    return normalized.toUpperCase()
  }

  // Lookup by name
  const code = nameToCodeMap.get(normalized)
  return code ?? null
}

/**
 * Convert state code to full name
 * @param stateCode - 2-letter state code (case insensitive)
 * @returns Full state name or null if not found
 */
export function getStateName(stateCode: string): string | null {
  if (!stateCode) return null

  const normalized = stateCode.trim().toLowerCase()

  // Check if already a name
  if (nameToCodeMap.has(normalized)) {
    return stateCode.trim()
  }

  // Lookup by code
  const name = codeToNameMap.get(normalized)
  return name ?? null
}

/**
 * Check if a value is a valid US state (name or code)
 * @param value - State name or code
 * @returns true if valid state
 */
export function isValidState(value: string): boolean {
  if (!value) return false

  const normalized = value.trim().toLowerCase()
  return nameToCodeMap.has(normalized) || codeToNameMap.has(normalized)
}

/**
 * Normalize state value to full name
 * @param value - State name or code
 * @returns Full state name or original value if not found
 */
export function normalizeStateName(value: string): string {
  if (!value) return value

  const normalized = value.trim().toLowerCase()

  // If it's a code, convert to name
  if (normalized.length === 2 && codeToNameMap.has(normalized)) {
    return codeToNameMap.get(normalized)!
  }

  // If it's a name, return it with proper casing
  if (nameToCodeMap.has(normalized)) {
    const code = nameToCodeMap.get(normalized)!
    return US_STATES.find(s => s.code === code)!.name
  }

  // Return original if not found
  return value
}
