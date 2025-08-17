import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/index';
import { DatabaseManager } from './database/manager';
import { createPredictionRoutes } from './routes/prediction.routes';
import { createFighterRoutes } from './routes/fighter.routes';
import { createOddsRoutes } from './routes/odds.routes';
import { createLiveRoutes } from './routes/live.routes';
import { createUFC319Routes } from './routes/ufc319.routes';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize database manager (mock for demo)
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
    url: config.redis?.url || 'redis://localhost:6379'
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
    message: 'UFC Prediction Platform API - Live Data Enabled',
    version: '1.0.0',
    endpoints: {
      predictions: '/api/v1/predictions',
      fighters: '/api/v1/fighters',
      odds: '/api/v1/odds',
      live: '/api/v1/live',
      ufc319: '/api/v1/ufc319',
      health: '/health'
    },
    liveFeatures: {
      ufc319: '/api/v1/live/event/ufc319',
      liveOdds: '/api/v1/live/odds/live',
      bettingAnalysis: '/api/v1/live/analysis/:fightId',
      refresh: '/api/v1/live/refresh'
    }
  });
});

// Live data routes (UFC 319)
app.use('/api/v1/live', createLiveRoutes(dbManager));

// Prediction routes
app.use('/api/v1/predictions', createPredictionRoutes(dbManager));

// Fighter routes
app.use('/api/v1/fighters', createFighterRoutes(dbManager));

// Odds routes
app.use('/api/v1/odds', createOddsRoutes(dbManager));

// UFC 319 integration routes
app.use('/api/v1/ufc319', createUFC319Routes(dbManager));

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

// Start server
async function startServer() {
  try {
    // Initialize database connection (optional for demo)
    console.log('🔌 Initializing database connections...');
    
    app.listen(PORT, () => {
      console.log(`🚀 UFC Prediction Platform API Server running on port ${PORT}`);
      console.log(`📊 Prediction API: http://localhost:${PORT}/api/v1/predictions`);
      console.log(`🥊 Fighter API: http://localhost:${PORT}/api/v1/fighters`);
      console.log(`💰 Odds API: http://localhost:${PORT}/api/v1/odds`);
      console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
      console.log(`📖 API Info: http://localhost:${PORT}/api/v1`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
if (require.main === module) {
  startServer();
}

export { app as createApp };
export default app;