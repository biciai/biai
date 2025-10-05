// Test the relationship parsing logic from upload-dataset-with-metadata.js

/**
 * Parse relationships from metadata
 */
function parseRelationships(tableMeta) {
  const relationships = []

  // Nested object format (preferred)
  if (tableMeta.relationship && typeof tableMeta.relationship === 'object' && !Array.isArray(tableMeta.relationship)) {
    // Only add if all required fields are present
    if (tableMeta.relationship.foreign_key && tableMeta.relationship.references_table && tableMeta.relationship.references_column) {
      relationships.push({
        foreign_key: tableMeta.relationship.foreign_key,
        referenced_table: tableMeta.relationship.references_table,
        referenced_column: tableMeta.relationship.references_column,
        type: tableMeta.relationship.type || 'many-to-one'
      })
    }
  }

  // Legacy format: separate foreign_key and references fields
  if (tableMeta.foreign_key && tableMeta.references) {
    // Parse: "(patient_id) references data_clinical_patient(sample_id)"
    const fkMatch = tableMeta.foreign_key.match(/\(([^)]+)\)/)
    const refMatch = tableMeta.references.match(/([a-zA-Z0-9_]+)\(([^)]+)\)/)

    if (fkMatch && refMatch) {
      relationships.push({
        foreign_key: fkMatch[1],
        referenced_table: refMatch[1],
        referenced_column: refMatch[2],
        type: 'many-to-one'
      })
    } else {
      // Simple format: foreign_key: column, references: table(column)
      const simpleRefMatch = tableMeta.references.match(/([a-zA-Z0-9_]+)\(([^)]+)\)/)
      if (simpleRefMatch) {
        relationships.push({
          foreign_key: tableMeta.foreign_key,
          referenced_table: simpleRefMatch[1],
          referenced_column: simpleRefMatch[2],
          type: 'many-to-one'
        })
      }
    }
  }

  // Array of relationships
  if (tableMeta.relationships && Array.isArray(tableMeta.relationships)) {
    relationships.push(...tableMeta.relationships)
  }

  return relationships
}

describe('Relationship Parsing', () => {
  describe('Nested Object Format', () => {
    test('should parse relationship from nested object', () => {
      const tableMeta = {
        relationship: {
          foreign_key: 'patient_id',
          references_table: 'patients',
          references_column: 'patient_id',
          type: 'many-to-one'
        }
      }

      const result = parseRelationships(tableMeta)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        foreign_key: 'patient_id',
        referenced_table: 'patients',
        referenced_column: 'patient_id',
        type: 'many-to-one'
      })
    })

    test('should use default type if not specified', () => {
      const tableMeta = {
        relationship: {
          foreign_key: 'user_id',
          references_table: 'users',
          references_column: 'id'
        }
      }

      const result = parseRelationships(tableMeta)

      expect(result[0].type).toBe('many-to-one')
    })

    test('should skip incomplete relationship objects', () => {
      const tableMeta = {
        relationship: {
          foreign_key: 'user_id'
          // Missing references_table and references_column
        }
      }

      const result = parseRelationships(tableMeta)

      expect(result).toHaveLength(0)
    })
  })

  describe('Legacy Format with Parentheses', () => {
    test('should parse foreign key with parentheses format', () => {
      const tableMeta = {
        foreign_key: '(patient_id)',
        references: 'patients(patient_id)'
      }

      const result = parseRelationships(tableMeta)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        foreign_key: 'patient_id',
        referenced_table: 'patients',
        referenced_column: 'patient_id',
        type: 'many-to-one'
      })
    })

    test('should parse simple legacy format', () => {
      const tableMeta = {
        foreign_key: 'patient_id',
        references: 'patients(id)'
      }

      const result = parseRelationships(tableMeta)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        foreign_key: 'patient_id',
        referenced_table: 'patients',
        referenced_column: 'id',
        type: 'many-to-one'
      })
    })
  })

  describe('Array Format', () => {
    test('should parse array of relationships', () => {
      const tableMeta = {
        relationships: [
          {
            foreign_key: 'patient_id',
            referenced_table: 'patients',
            referenced_column: 'id',
            type: 'many-to-one'
          },
          {
            foreign_key: 'doctor_id',
            referenced_table: 'doctors',
            referenced_column: 'id',
            type: 'many-to-one'
          }
        ]
      }

      const result = parseRelationships(tableMeta)

      expect(result).toHaveLength(2)
      expect(result[0].foreign_key).toBe('patient_id')
      expect(result[1].foreign_key).toBe('doctor_id')
    })
  })

  describe('No Relationships', () => {
    test('should return empty array when no relationships defined', () => {
      const tableMeta = {
        table_name: 'patients',
        primary_key: 'id'
      }

      const result = parseRelationships(tableMeta)

      expect(result).toHaveLength(0)
    })
  })

  describe('Multiple Format Support', () => {
    test('should combine relationships from different formats', () => {
      const tableMeta = {
        relationship: {
          foreign_key: 'patient_id',
          references_table: 'patients',
          references_column: 'id'
        },
        relationships: [
          {
            foreign_key: 'doctor_id',
            referenced_table: 'doctors',
            referenced_column: 'id',
            type: 'many-to-one'
          }
        ]
      }

      const result = parseRelationships(tableMeta)

      expect(result).toHaveLength(2)
    })
  })
})
