// Base classes and interfaces
export { APIConnector, CircuitBreakerState } from './base/api-connector.js';
export { ScrapingEngine } from './base/scraping-engine.js';

// Connectors
export { SportsDataIOConnector } from './connectors/sports-data-io.connector.js';
export { OddsAPIConnector } from './connectors/odds-api.connector.js';
export { UFCStatsConnector } from './connectors/ufc-stats.connector.js';

// Configuration management
export { 
  SourceConfigManager, 
  sourceConfigManager, 
  API_SOURCES, 
  initializeConfigs 
} from './config/source-configs.js';

// Ingestion management
export { 
  IngestionManager, 
  ingestionManager 
} from './ingestion-manager.js';

// Types
export type { 
  CircuitBreakerConfig, 
  RateLimiterState 
} from './base/api-connector.js';

export type {
  ProxyConfig,
  ScrapingConfig,
  ScrapingSession
} from './base/scraping-engine.js';

export type {
  UFCStatsScrapingConfig,
  UFCStatsFighter,
  UFCStatsFight,
  FightStats
} from './connectors/ufc-stats.connector.js';

export type { 
  APISourceConfig 
} from './config/source-configs.js';

export type { 
  IngestionSchedule, 
  IngestionStats 
} from './ingestion-manager.js';

export type {
  TheOddsAPIEvent,
  TheOddsAPIBookmaker,
  TheOddsAPIMarket,
  TheOddsAPIOutcome,
  TheOddsAPIUsage,
  OddsMovementDetectionOptions
} from './connectors/odds-api.connector.js';