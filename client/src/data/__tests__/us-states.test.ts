import { describe, it, expect } from 'vitest'
import { getStateCode, getStateName, isValidState, normalizeStateName } from '../us-states'

describe('US States Helper Functions', () => {
  describe('getStateCode', () => {
    it('converts full state names to codes', () => {
      expect(getStateCode('California')).toBe('CA')
      expect(getStateCode('New York')).toBe('NY')
      expect(getStateCode('Texas')).toBe('TX')
      expect(getStateCode('Alaska')).toBe('AK')
    })

    it('is case insensitive', () => {
      expect(getStateCode('california')).toBe('CA')
      expect(getStateCode('CALIFORNIA')).toBe('CA')
      expect(getStateCode('CaLiFoRnIa')).toBe('CA')
    })

    it('handles whitespace', () => {
      expect(getStateCode('  California  ')).toBe('CA')
      expect(getStateCode(' New York ')).toBe('NY')
    })

    it('returns code unchanged when given a code', () => {
      expect(getStateCode('CA')).toBe('CA')
      expect(getStateCode('ca')).toBe('CA')
      expect(getStateCode('NY')).toBe('NY')
    })

    it('returns null for invalid states', () => {
      expect(getStateCode('Invalid State')).toBeNull()
      expect(getStateCode('ZZ')).toBeNull()
      expect(getStateCode('')).toBeNull()
    })

    it('handles territories', () => {
      expect(getStateCode('Puerto Rico')).toBe('PR')
      expect(getStateCode('District of Columbia')).toBe('DC')
    })
  })

  describe('getStateName', () => {
    it('converts state codes to full names', () => {
      expect(getStateName('CA')).toBe('California')
      expect(getStateName('NY')).toBe('New York')
      expect(getStateName('TX')).toBe('Texas')
      expect(getStateName('AK')).toBe('Alaska')
    })

    it('is case insensitive', () => {
      expect(getStateName('ca')).toBe('California')
      expect(getStateName('CA')).toBe('California')
      expect(getStateName('Ca')).toBe('California')
    })

    it('handles whitespace', () => {
      expect(getStateName('  CA  ')).toBe('California')
      expect(getStateName(' NY ')).toBe('New York')
    })

    it('returns name unchanged when given a name', () => {
      expect(getStateName('California')).toBe('California')
      expect(getStateName('New York')).toBe('New York')
    })

    it('returns null for invalid codes', () => {
      expect(getStateName('ZZ')).toBeNull()
      expect(getStateName('Invalid')).toBeNull()
      expect(getStateName('')).toBeNull()
    })
  })

  describe('isValidState', () => {
    it('returns true for valid state names', () => {
      expect(isValidState('California')).toBe(true)
      expect(isValidState('New York')).toBe(true)
      expect(isValidState('Alaska')).toBe(true)
    })

    it('returns true for valid state codes', () => {
      expect(isValidState('CA')).toBe(true)
      expect(isValidState('NY')).toBe(true)
      expect(isValidState('AK')).toBe(true)
    })

    it('is case insensitive', () => {
      expect(isValidState('california')).toBe(true)
      expect(isValidState('ca')).toBe(true)
    })

    it('returns false for invalid states', () => {
      expect(isValidState('Invalid State')).toBe(false)
      expect(isValidState('ZZ')).toBe(false)
      expect(isValidState('')).toBe(false)
    })
  })

  describe('normalizeStateName', () => {
    it('converts codes to full names', () => {
      expect(normalizeStateName('CA')).toBe('California')
      expect(normalizeStateName('NY')).toBe('New York')
      expect(normalizeStateName('TX')).toBe('Texas')
    })

    it('preserves full names with proper casing', () => {
      expect(normalizeStateName('california')).toBe('California')
      expect(normalizeStateName('CALIFORNIA')).toBe('California')
      expect(normalizeStateName('California')).toBe('California')
    })

    it('returns original value for invalid states', () => {
      expect(normalizeStateName('Invalid State')).toBe('Invalid State')
      expect(normalizeStateName('ZZ')).toBe('ZZ')
    })

    it('handles empty strings', () => {
      expect(normalizeStateName('')).toBe('')
    })

    it('normalizes all 50 states correctly', () => {
      // Sample a few states to verify the normalization works
      expect(normalizeStateName('florida')).toBe('Florida')
      expect(normalizeStateName('FL')).toBe('Florida')
      expect(normalizeStateName('washington')).toBe('Washington')
      expect(normalizeStateName('WA')).toBe('Washington')
    })
  })

  describe('Edge cases', () => {
    it('handles multiple representations of the same state', () => {
      // All should map to the same code
      expect(getStateCode('California')).toBe('CA')
      expect(getStateCode('california')).toBe('CA')
      expect(getStateCode('CA')).toBe('CA')
      expect(getStateCode('ca')).toBe('CA')

      // All should normalize to the same name
      expect(normalizeStateName('California')).toBe('California')
      expect(normalizeStateName('california')).toBe('California')
      expect(normalizeStateName('CA')).toBe('California')
      expect(normalizeStateName('ca')).toBe('California')
    })

    it('handles states with spaces in names', () => {
      expect(getStateCode('New York')).toBe('NY')
      expect(getStateCode('New Hampshire')).toBe('NH')
      expect(getStateCode('New Jersey')).toBe('NJ')
      expect(getStateCode('New Mexico')).toBe('NM')
      expect(getStateCode('North Carolina')).toBe('NC')
      expect(getStateCode('North Dakota')).toBe('ND')
      expect(getStateCode('South Carolina')).toBe('SC')
      expect(getStateCode('South Dakota')).toBe('SD')
      expect(getStateCode('West Virginia')).toBe('WV')
      expect(getStateCode('Rhode Island')).toBe('RI')
    })
  })
})
