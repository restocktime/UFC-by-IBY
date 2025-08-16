import { EventEmitter } from 'events';
import { APIConnector } from './base/api-connector.js';
import { sourceConfigManager, initializeConfigs } from './config/source-configs.js';
import { DataIngestionResult, DataSource, DataSourceStatus } from '@ufc-prediction/shared';

export interface IngestionSchedule {
  sourceId: string;
  intervalMs: number;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export interface IngestionStats {
  totalSources: number;
  activeSources: number;
  errorSources: number;
  totalRecordsProcessed: number;
  totalErrors: number;
  lastSyncTime: Date;
}

export class IngestionManager extends EventEmitter {
  private connectors: Map<string, APIConnector> = new Map();
  private schedules: Map<string, IngestionSchedule> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private stats: IngestionStats = {
    totalSources: 0,
    activeSources: 0,
    errorSources: 0,
    totalRecordsProcessed: 0,
    totalErrors: 0,
    lastSyncTime: new Date()
  };

  constructor() {
    super();
    initializeConfigs();
  }

  /**
   * Register a connector with the ingestion manager
   */
  public registerConnector(sourceId: string, connector: APIConnector): void {
    if (this.connectors.has(sourceId)) {
      throw new Error(`Connector for source '${sourceId}' is already registered`);
    }

    this.connectors.set(sourceId, connector);
    this.setupConnectorEventHandlers(sourceId, connector);
    this.stats.totalSources++;

    this.emit('connectorRegistered', { sourceId });
  }

  /**
   * Unregister a connector
   */
  public unregisterConnector(sourceId: string): boolean {
    const connector = this.connectors.get(sourceId);
    if (!connector) {
      return false;
    }

    // Stop scheduled sync if running
    this.stopScheduledSync(sourceId);
    
    // Remove connector
    this.connectors.delete(sourceId);
    this.schedules.delete(sourceId);
    this.stats.totalSources--;

    this.emit('connectorUnregistered', { sourceId });
    return true;
  }

  /**
   * Schedule automatic data synchronization for a source
   */
  public scheduleSync(sourceId: string, intervalMs: number): void {
    if (!this.connectors.has(sourceId)) {
      throw new Error(`No connector registered for source '${sourceId}'`);
    }

    // Stop existing schedule if any
    this.stopScheduledSync(sourceId);

    const schedule: IngestionSchedule = {
      sourceId,
      intervalMs,
      enabled: true,
      nextRun: new Date(Date.now() + intervalMs)
    };

    this.schedules.set(sourceId, schedule);

    // Start the timer
    const timer = setInterval(async () => {
      await this.syncSource(sourceId);
    }, intervalMs);

    this.timers.set(sourceId, timer);

    this.emit('syncScheduled', { sourceId, intervalMs });
  }

  /**
   * Stop scheduled synchronization for a source
   */
  public stopScheduledSync(sourceId: string): void {
    const timer = this.timers.get(sourceId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(sourceId);
    }

    const schedule = this.schedules.get(sourceId);
    if (schedule) {
      schedule.enabled = false;
      this.emit('syncStopped', { sourceId });
    }
  }

  /**
   * Manually trigger synchronization for a specific source
   */
  public async syncSource(sourceId: string): Promise<DataIngestionResult> {
    const connector = this.connectors.get(sourceId);
    if (!connector) {
      throw new Error(`No connector registered for source '${sourceId}'`);
    }

    const startTime = Date.now();
    
    try {
      this.emit('syncStarted', { sourceId, startTime: new Date(startTime) });

      const result = await connector.syncData();
      
      // Update statistics
      this.updateStats(result);
      
      // Update schedule
      const schedule = this.schedules.get(sourceId);
      if (schedule) {
        schedule.lastRun = new Date();
        schedule.nextRun = new Date(Date.now() + schedule.intervalMs);
      }

      this.emit('syncCompleted', { 
        sourceId, 
        result, 
        duration: Date.now() - startTime 
      });

      return result;
    } catch (error: any) {
      this.stats.totalErrors++;
      
      const errorResult: DataIngestionResult = {
        sourceId,
        recordsProcessed: 0,
        recordsSkipped: 0,
        errors: [{
          field: 'sync',
          message: error.message || 'Unknown sync error',
          value: error,
          severity: 'error'
        }],
        nextSyncTime: new Date(Date.now() + 300000), // 5 minutes
        processingTimeMs: Date.now() - startTime
      };

      this.emit('syncError', { 
        sourceId, 
        error, 
        result: errorResult,
        duration: Date.now() - startTime 
      });

      return errorResult;
    }
  }

  /**
   * Sync all registered sources
   */
  public async syncAllSources(): Promise<Map<string, DataIngestionResult>> {
    const results = new Map<string, DataIngestionResult>();
    const promises: Promise<void>[] = [];

    for (const sourceId of this.connectors.keys()) {
      const promise = this.syncSource(sourceId)
        .then(result => results.set(sourceId, result))
        .catch(error => {
          results.set(sourceId, {
            sourceId,
            recordsProcessed: 0,
            recordsSkipped: 0,
            errors: [{
              field: 'sync',
              message: error.message,
              value: error,
              severity: 'error'
            }],
            nextSyncTime: new Date(Date.now() + 300000),
            processingTimeMs: 0
          });
        });
      
      promises.push(promise);
    }

    await Promise.all(promises);
    
    this.emit('allSourcesSynced', { 
      results: Object.fromEntries(results),
      totalSources: results.size 
    });

    return results;
  }

  /**
   * Get status of all data sources
   */
  public getSourcesStatus(): DataSource[] {
    const sources: DataSource[] = [];

    for (const [sourceId, connector] of this.connectors) {
      const config = sourceConfigManager.getConfig(sourceId);
      const schedule = this.schedules.get(sourceId);
      const connectorStatus = connector.getStatus();

      if (config) {
        const source: DataSource = {
          id: sourceId,
          name: config.name,
          type: 'api',
          config,
          lastSync: schedule?.lastRun || new Date(0),
          status: this.determineSourceStatus(connectorStatus),
          errorCount: connectorStatus.failureCount,
          successCount: 0 // Would need to track this separately
        };

        sources.push(source);
      }
    }

    return sources;
  }

  /**
   * Get ingestion statistics
   */
  public getStats(): IngestionStats {
    // Update active/error source counts
    const sources = this.getSourcesStatus();
    this.stats.activeSources = sources.filter(s => s.status === 'active').length;
    this.stats.errorSources = sources.filter(s => s.status === 'error').length;
    this.stats.lastSyncTime = new Date();

    return { ...this.stats };
  }

  /**
   * Get schedule information for all sources
   */
  public getSchedules(): IngestionSchedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Reset circuit breaker for a specific source
   */
  public resetCircuitBreaker(sourceId: string): void {
    const connector = this.connectors.get(sourceId);
    if (connector) {
      connector.resetCircuitBreaker();
      this.emit('circuitBreakerReset', { sourceId });
    }
  }

  /**
   * Shutdown the ingestion manager
   */
  public shutdown(): void {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();

    // Clear schedules
    this.schedules.clear();

    // Remove all connectors
    this.connectors.clear();

    this.emit('shutdown');
  }

  private setupConnectorEventHandlers(sourceId: string, connector: APIConnector): void {
    connector.on('rateLimitHit', (event) => {
      this.emit('rateLimitHit', { sourceId, ...event });
    });

    connector.on('circuitBreakerStateChange', (event) => {
      this.emit('circuitBreakerStateChange', { sourceId, ...event });
    });

    connector.on('retryAttempt', (event) => {
      this.emit('retryAttempt', { sourceId, ...event });
    });

    connector.on('requestError', (event) => {
      this.emit('requestError', { sourceId, ...event });
    });
  }

  private updateStats(result: DataIngestionResult): void {
    this.stats.totalRecordsProcessed += result.recordsProcessed;
    this.stats.totalErrors += result.errors.length;
    this.stats.lastSyncTime = new Date();
  }

  private determineSourceStatus(connectorStatus: any): DataSourceStatus {
    if (connectorStatus.circuitBreakerState === 'open') {
      return 'error';
    }
    if (connectorStatus.failureCount > 0) {
      return 'warning';
    }
    return 'active';
  }
}

// Singleton instance
export const ingestionManager = new IngestionManager();