import express from 'express';
import { config } from './config/index.js';

// Export ML components for use by other services
export * from './training/index.js';
export * from './preprocessing/index.js';
export * from './models/index.js';

const app = express();

// Body parsing middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'ufc-prediction-ml'
  });
});

// ML service routes will be added here
app.get('/api/v1', (req, res) => {
  res.json({ 
    message: 'UFC Prediction Platform ML Service',
    version: '1.0.0'
  });
});

const PORT = config.port || 3001;

app.listen(PORT, () => {
  console.log(`🤖 ML Service running on port ${PORT}`);
});

export default app;