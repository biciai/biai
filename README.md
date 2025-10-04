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
- Backend at http://localhost:5000

### Project Structure

```
biai/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Dashboard, Reports, Settings pages
│   │   ├── services/      # API calls
│   │   └── utils/         # Helper functions
│   └── package.json
├── server/                # Node.js backend
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   ├── services/      # Business logic
│   │   ├── models/        # Data models
│   │   ├── middleware/    # Auth, validation
│   │   └── config/        # Database, env config
│   └── package.json
├── clickhouse/            # ClickHouse initialization scripts
└── docker-compose.yml     # Docker services
```

## Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run dev:client` - Start frontend only
- `npm run dev:server` - Start backend only
- `npm run build` - Build both frontend and backend
- `npm start` - Start production server

## API Endpoints

- `GET /health` - Health check
- `GET /api/test` - Test endpoint
- `GET /api/queries/tables` - Get list of tables
- `POST /api/queries/execute` - Execute a query

## Next Steps

- Add authentication and authorization
- Implement data connectors
- Build dashboard builder interface
- Add more chart types
- Implement query builder
