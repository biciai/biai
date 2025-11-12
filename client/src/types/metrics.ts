export type MetricPathSegment = {
  from_table: string
  via_column: string
  to_table: string
  referenced_column?: string
}
