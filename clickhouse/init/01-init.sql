-- Create database if not exists
CREATE DATABASE IF NOT EXISTS biai;

-- Use the database
USE biai;

-- Datasets metadata (container for multiple tables)
CREATE TABLE IF NOT EXISTS datasets_metadata (
    dataset_id String,
    dataset_name String,
    description String,
    created_by String,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (created_at, dataset_id);

-- Individual tables within datasets
CREATE TABLE IF NOT EXISTS dataset_tables (
    dataset_id String,
    table_id String,
    table_name String,
    display_name String,
    original_filename String,
    file_type String,
    row_count UInt64,
    clickhouse_table_name String,
    schema_json String,
    primary_key Nullable(String),
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (dataset_id, created_at);

-- Column metadata for each table
CREATE TABLE IF NOT EXISTS dataset_columns (
    dataset_id String,
    table_id String,
    column_name String,
    column_type String,
    column_index UInt32,
    is_nullable Boolean,
    description String,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (dataset_id, table_id, column_index);
