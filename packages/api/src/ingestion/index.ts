// Base classes and interfaces
export { APIConnector, CircuitBreakerState } from './base/api-connector.js';
export { ScrapingEngine } from './base/scraping-engine.js';

// Connectors
export { SportsDataIOConnector } from './connectors/sports-data-io.connector.js';
export { OddsAPIConnector } from './connectors/odds-api.connector.js';
export { UFCStatsConnector } from './connectors/ufc-stats.connector.js';
export { ESPNAPIConnector } from './connectors/espn-api.connector.js';

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

// Data processing services
export { 
  DataIngestionService, 
  dataIngestionService 
} from './data-ingestion.service.js';

export { 
  RealTimeValidatorService, 
  realTimeValidatorService 
} from './real-time-validator.service.js';

export { 
  DataTransformationService, 
  dataTransformationService 
} from './data-transformation.service.js';

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
  DataTransformationRule,
  DataNormalizationConfig,
  ConflictResolutionStrategy,
  ProcessedData,
  ConflictInfo
} from './data-ingestion.service.js';

export type {
  ValidationRule,
  DataCleaningRule,
  ValidationConfig,
  ValidationResult
} from './real-time-validator.service.js';

export type {
  TransformationPipeline,
  DataTransformation,
  TransformationConfig,
  TransformationResult,
  TransformationError
} from './data-transformation.service.js';

export type {
  TheOddsAPIEvent,
  TheOddsAPIBookmaker,
  TheOddsAPIMarket,
  TheOddsAPIOutcome,
  TheOddsAPIUsage,
  OddsMovementDetectionOptions
} from './connectors/odds-api.connector.js';

export type {
  ESPNScoreboardResponse,
  ESPNEvent,
  ESPNAthlete,
  LiveFightData,
  FightStats
} from './connectors/espn-api.connector.js';