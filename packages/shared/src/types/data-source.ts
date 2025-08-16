import { DataSourceType, DataSourceStatus } from './core.js';

/**
 * Data source and ingestion interfaces
 */

export interface SourceConfig {
  apiKey?: string;
  baseUrl: string;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  retryConfig: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
  };
}

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  config: SourceConfig;
  lastSync: Date;
  status: DataSourceStatus;
  errorCount: number;
  successCount: number;
}

export interface ValidationError {
  field: string;
  message: string;
  value: any;
  severity: 'warning' | 'error';
}

export interface DataIngestionResult {
  sourceId: string;
  recordsProcessed: number;
  recordsSkipped: number;
  errors: ValidationError[];
  nextSyncTime: Date;
  processingTimeMs: number;
}