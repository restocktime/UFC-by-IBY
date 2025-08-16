import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/index.js';
import { DatabaseManager } from './database/manager.js';
import { createPredictionRoutes } from './routes/prediction.routes.js';
import { createFighterRoutes } from './routes/fighter.routes.js';
import { createOddsRoutes } from './routes/odds.routes.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize database manager
const dbManager = new DatabaseManager({
  mongodb: {
    uri: config.mongodb?.uri || 'mongodb://localhost:27017/ufc-prediction'
  },
  influxdb: {
    url: config.influxdb?.url || 'http://localhost:8086',
    token: config.influxdb?.token || '',
    org: config.influxdb?.org || 'ufc-platform',
    bucket: config.influxdb?.bucket || 'ufc-data'
  },
  redis: {
    host: config.redis?.host || 'localhost',
    port: config.redis?.port || 6379
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'ufc-prediction-api'
  });
});

// API routes
app.get('/api/v1', (req, res) => {
  res.json({ 
    message: 'UFC Prediction Platform API',
    version: '1.0.0',
    endpoints: {
      predictions: '/api/v1/predictions',
      fighters: '/api/v1/fighters',
      odds: '/api/v1/odds',
      health: '/health'
    }
  });
});

// Prediction routes
app.use('/api/v1/predictions', createPredictionRoutes(dbManager));

// Fighter routes
app.use('/api/v1/fighters', createFighterRoutes(dbManager));

// Odds routes
app.use('/api/v1/odds', createOddsRoutes(dbManager));

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
});

const PORT = config.port || 3000;

app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`📊 Prediction API available at http://localhost:${PORT}/api/v1/predictions`);
  console.log(`🥊 Fighter API available at http://localhost:${PORT}/api/v1/fighters`);
  console.log(`💰 Odds API available at http://localhost:${PORT}/api/v1/odds`);
});

export default app;