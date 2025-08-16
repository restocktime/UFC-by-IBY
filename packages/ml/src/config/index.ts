import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.ML_PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Model configuration
  models: {
    storageUrl: process.env.MODEL_STORAGE_URL || 's3://ufc-models/',
    version: process.env.MODEL_VERSION || 'latest',
  },
  
  // Feature engineering
  features: {
    lookbackPeriod: parseInt(process.env.FEATURE_LOOKBACK_DAYS || '365', 10),
    minFightsRequired: parseInt(process.env.MIN_FIGHTS_REQUIRED || '3', 10),
  },
  
  // Training configuration
  training: {
    batchSize: parseInt(process.env.TRAINING_BATCH_SIZE || '32', 10),
    epochs: parseInt(process.env.TRAINING_EPOCHS || '100', 10),
    validationSplit: parseFloat(process.env.VALIDATION_SPLIT || '0.2'),
  },
};