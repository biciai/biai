# BIAI - Business Intelligence AI

A modern BI tool built with React, Node.js, ClickHouse, and Recharts.

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **Database**: ClickHouse
- **Visualization**: Recharts

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Docker and Docker Compose
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp server/.env.example server/.env
```

3. Start ClickHouse:
```bash
docker-compose up -d
```

4. Start development servers:
```bash
npm run dev
```

This will start:
- Frontend at http://localhost:3000
- Backend at http://localhost:5001

### Project Structure

```
biai/
├── client/                     # React frontend
│   ├── src/
│   │   ├── pages/             # Dataset management, Dashboard, Reports
│   │   ├── services/          # API client
│   │   └── main.tsx           # App entry point
│   └── package.json
├── server/                     # Node.js backend
│   ├── src/
│   │   ├── routes/            # API endpoints (datasetsV2, queries)
│   │   ├── services/          # Business logic (datasetServiceV2, fileParser)
│   │   └── config/            # ClickHouse configuration
│   └── package.json
├── clickhouse/                 # ClickHouse initialization scripts
│   └── init/01-init.sql       # Database schema
├── example_data/               # Sample TCGA clinical data
└── docker-compose.yml          # Docker services
```

## Features

- **Multi-table Datasets**: Create datasets with multiple related tables
- **Dynamic Schema**: Automatic type inference from CSV/TSV files
- **File Upload**: Support for CSV, TSV with configurable delimiters
- **Data Preview**: View table data with pagination
- **Metadata Management**: Track columns, types, primary keys

## Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run dev:client` - Start frontend only
- `npm run dev:server` - Start backend only
- `npm run build` - Build both frontend and backend

## API Endpoints

### Datasets
- `POST /api/datasets` - Create new dataset
- `GET /api/datasets` - List all datasets
- `GET /api/datasets/:id` - Get dataset details
- `DELETE /api/datasets/:id` - Delete dataset
- `POST /api/datasets/:id/tables` - Add table to dataset
- `GET /api/datasets/:id/tables/:tableId/data` - Get table data
- `DELETE /api/datasets/:id/tables/:tableId` - Delete table

### System
- `GET /health` - Health check

## Example Data

The project includes TCGA GBM clinical data in `example_data/`. Upload it using:
```bash
node upload-tcga-dataset.js
```

## Next Steps

- Add table relationship/join visualization
- Implement query builder for cross-table analysis
- Add data export functionality
- Build custom dashboards from uploaded data
- Add authentication and multi-user support
