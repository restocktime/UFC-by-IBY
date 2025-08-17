import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/ufc_platform?authSource=admin'
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
  },
  
  influxdb: {
    url: process.env.INFLUXDB_URL || 'http://localhost:8086',
    token: process.env.INFLUXDB_TOKEN || 'dev-token-please-change-in-production',
    org: process.env.INFLUXDB_ORG || 'ufc-platform',
    bucket: process.env.INFLUXDB_BUCKET || 'metrics'
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  
  api: {
    rateLimit: {
      windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
      max: parseInt(process.env.API_RATE_LIMIT_MAX || '100', 10)
    }
  },

  // API Keys and Configuration
  apiKeys: {
    sportsDataIO: process.env.SPORTSDATA_IO_API_KEY || '81a9726b488c4b57b48e59042405d1a6',
    oddsAPI: process.env.ODDS_API_KEY || '22e59e4eccd8562ad4b697aeeaccb0fb',
    espnAPI: process.env.ESPN_API_KEY || '', // ESPN doesn't require API key for public endpoints
  },

  // Proxy Configuration
  proxy: {
    oxylabs: {
      enabled: !!(process.env.OXYLABS_USERNAME && process.env.OXYLABS_PASSWORD),
      username: process.env.OXYLABS_USERNAME || '',
      password: process.env.OXYLABS_PASSWORD || '',
      host: process.env.OXYLABS_HOST || 'isp.oxylabs.io',
      ports: process.env.OXYLABS_PORTS?.split(',').map(p => parseInt(p, 10)) || [8001, 8002, 8003, 8004, 8005],
      country: process.env.OXYLABS_COUNTRY || 'US',
      rotationInterval: parseInt(process.env.PROXY_ROTATION_INTERVAL || '300000', 10) // 5 minutes
    }
  },

  // Rate Limiting Configuration
  rateLimits: {
    sportsDataIO: {
      requestsPerMinute: parseInt(process.env.SPORTSDATA_IO_RATE_LIMIT_PER_MINUTE || '60', 10),
      requestsPerHour: parseInt(process.env.SPORTSDATA_IO_RATE_LIMIT_PER_HOUR || '1000', 10),
      requestsPerDay: parseInt(process.env.SPORTSDATA_IO_RATE_LIMIT_PER_DAY || '10000', 10)
    },
    oddsAPI: {
      requestsPerMinute: parseInt(process.env.ODDS_API_RATE_LIMIT_PER_MINUTE || '10', 10),
      requestsPerHour: parseInt(process.env.ODDS_API_RATE_LIMIT_PER_HOUR || '500', 10),
      requestsPerDay: parseInt(process.env.ODDS_API_RATE_LIMIT_PER_DAY || '1000', 10)
    },
    espnAPI: {
      requestsPerMinute: parseInt(process.env.ESPN_API_RATE_LIMIT_PER_MINUTE || '100', 10),
      requestsPerHour: parseInt(process.env.ESPN_API_RATE_LIMIT_PER_HOUR || '2000', 10),
      requestsPerDay: parseInt(process.env.ESPN_API_RATE_LIMIT_PER_DAY || '20000', 10)
    }
  },

  // Retry Configuration
  retry: {
    maxRetries: parseInt(process.env.API_MAX_RETRIES || '3', 10),
    baseDelay: parseInt(process.env.API_RETRY_BASE_DELAY || '1000', 10), // 1 second
    maxDelay: parseInt(process.env.API_RETRY_MAX_DELAY || '30000', 10), // 30 seconds
    backoffMultiplier: parseFloat(process.env.API_RETRY_BACKOFF_MULTIPLIER || '2', 10)
  },

  // Timeout Configuration
  timeouts: {
    default: parseInt(process.env.API_DEFAULT_TIMEOUT || '30000', 10), // 30 seconds
    sportsDataIO: parseInt(process.env.SPORTSDATA_IO_TIMEOUT || '30000', 10),
    oddsAPI: parseInt(process.env.ODDS_API_TIMEOUT || '15000', 10),
    espnAPI: parseInt(process.env.ESPN_API_TIMEOUT || '20000', 10)
  }
};