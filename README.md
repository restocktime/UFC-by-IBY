# UFC Prediction Platform

A comprehensive data-driven system that aggregates fight data, fighter statistics, betting odds, and contextual information to provide AI-powered predictive insights for UFC events.

## Architecture

This is a monorepo containing three main packages:

- **`packages/shared`** - Common TypeScript interfaces, types, and validation schemas
- **`packages/api`** - REST API service for data management and serving predictions
- **`packages/ml`** - Machine learning service for training and serving prediction models
- **`packages/frontend`** - React-based web dashboard for visualization and user interaction

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+

### Installation

```bash
# Install dependencies for all packages
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

### Development

```bash
# Start all services in development mode
npm run dev
```

This will start:
- API service on http://localhost:3000
- ML service on http://localhost:3001  
- Frontend on http://localhost:3002

### Package Scripts

Each package has its own scripts that can be run individually:

```bash
# Run API service only
cd packages/api && npm run dev

# Run ML service only  
cd packages/ml && npm run dev

# Run frontend only
cd packages/frontend && npm run dev
```

## Project Structure

```
ufc-prediction-platform/
├── packages/
│   ├── shared/           # Shared types and utilities
│   │   ├── src/
│   │   │   ├── types/    # TypeScript interfaces
│   │   │   └── validation/ # Zod validation schemas
│   │   └── package.json
│   ├── api/              # REST API service
│   │   ├── src/
│   │   │   ├── config/   # Configuration
│   │   │   ├── routes/   # API routes (to be added)
│   │   │   └── services/ # Business logic (to be added)
│   │   └── package.json
│   ├── ml/               # Machine learning service
│   │   ├── src/
│   │   │   ├── config/   # ML configuration
│   │   │   ├── models/   # ML models (to be added)
│   │   │   └── features/ # Feature engineering (to be added)
│   │   └── package.json
│   └── frontend/         # React frontend
│       ├── src/
│       │   ├── components/ # React components (to be added)
│       │   └── pages/    # Page components (to be added)
│       └── package.json
├── package.json          # Root package.json with workspaces
├── tsconfig.json         # Root TypeScript configuration
└── README.md
```

## Technology Stack

- **Backend**: Node.js with TypeScript, Express.js
- **Frontend**: React with TypeScript, Vite
- **Validation**: Zod for runtime type checking
- **Testing**: Vitest
- **Linting**: ESLint with TypeScript support
- **Code Formatting**: Prettier

## Next Steps

This initial setup provides the foundation for the UFC Prediction Platform. The next tasks involve:

1. Implementing data models and validation (Task 2)
2. Building database layer and repositories (Task 3)  
3. Creating data ingestion framework (Task 4)
4. Developing feature engineering service (Task 5)
5. Building machine learning pipeline (Task 6)

See the [tasks.md](.kiro/specs/ufc-prediction-platform/tasks.md) file for the complete implementation plan.