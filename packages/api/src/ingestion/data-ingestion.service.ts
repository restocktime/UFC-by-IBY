import { EventEmitter } from 'events';
import { DataIngestionResult, ValidationError } from '@ufc-prediction/shared';
import { ingestionManager } from './ingestion-manager.js';
import { DataValidator } from '../validation/data-validator.js';
import { QualityScorer } from '../validation/quality-scorer.js';

export interface DataTransformationRule {
  sourceField: string;
  targetField: string;
  transform?: (value: any) => any;
  required?: boolean;
  defaultValue?: any;
}

export interface DataNormalizationConfig {
  source: string;
  transformations: DataTransformationRule[];
  conflictResolution: ConflictResolutionStrategy;
}

export interface ConflictResolutionStrategy {
  strategy: 'latest' | 'highest_quality' | 'merge' | 'custom';
  customResolver?: (existing: any, incoming: any) => any;
  prioritySources?: string[];
}

export interface ProcessedData {
  id: string;
  sourceId: string;
  originalData: any;
  normalizedData: any;
  qualityScore: number;
  validationErrors: ValidationError[];
  timestamp: Date;
  conflicts?: ConflictInfo[];
}

export interface ConflictInfo {
  field: string;
  existingValue: any;
  incomingValue: any;
  resolution: 'kept_existing' | 'used_incoming' | 'merged';
  reason: string;
}

export class DataIngestionService extends EventEmitter {
  private validator: DataValidator;
  private qualityScorer: QualityScorer;
  private normalizationConfigs: Map<string, DataNormalizationConfig> = new Map();
  private processedDataCache: Map<string, ProcessedData> = new Map();

  constructor() {
    super();
    this.validator = new DataValidator();
    this.qualityScorer = new QualityScorer();
    this.setupIngestionManagerListeners();
  }

  /**
   * Register normalization configuration for a data source
   */
  public registerNormalizationConfig(config: DataNormalizationConfig): void {
    this.normalizationConfigs.set(config.source, config);
    this.emit('normalizationConfigRegistered', { source: config.source });
  }

  /**
   * Process raw data through validation, transformation, and normalization
   */
  public async processData(sourceId: string, rawData: any[]): Promise<ProcessedData[]> {
    const startTime = Date.now();
    const processedResults: ProcessedData[] = [];

    try {
      this.emit('dataProcessingStarted', { 
        sourceId, 
        recordCount: rawData.length,
        timestamp: new Date()
      });

      for (const item of rawData) {
        const processed = await this.processDataItem(sourceId, item);
        processedResults.push(processed);
      }

      // Include existing cached data for conflict resolution
      const allDataForResolution = [...processedResults];
      
      // Add existing cached data that might conflict
      for (const processed of processedResults) {
        const existingCached = Array.from(this.processedDataCache.values())
          .filter(cached => cached.id === processed.id && cached.sourceId !== processed.sourceId);
        allDataForResolution.push(...existingCached);
      }

      // Resolve conflicts between sources
      const resolvedData = await this.resolveConflicts(allDataForResolution);

      // Update cache with resolved data
      for (const resolved of resolvedData) {
        this.processedDataCache.set(resolved.id, resolved);
      }

      this.emit('dataProcessingCompleted', {
        sourceId,
        processedCount: resolvedData.length,
        processingTimeMs: Date.now() - startTime,
        averageQualityScore: this.calculateAverageQuality(resolvedData)
      });

      return resolvedData;

    } catch (error: any) {
      this.emit('dataProcessingError', {
        sourceId,
        error: error.message,
        processingTimeMs: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Process a single data item
   */
  private async processDataItem(sourceId: string, rawData: any): Promise<ProcessedData> {
    // Generate unique ID for the data item
    const id = this.generateDataId(sourceId, rawData);

    // Validate raw data
    const validationResult = await this.validator.validateData(rawData, sourceId);

    // Transform and normalize data
    const normalizedData = this.normalizeData(sourceId, rawData);

    // Calculate quality score
    const qualityScore = await this.qualityScorer.calculateScore(normalizedData, validationResult.errors);

    const processed: ProcessedData = {
      id,
      sourceId,
      originalData: rawData,
      normalizedData,
      qualityScore,
      validationErrors: validationResult.errors,
      timestamp: new Date()
    };

    this.emit('dataItemProcessed', { 
      id, 
      sourceId, 
      qualityScore,
      errorCount: validationResult.errors.length
    });

    return processed;
  }

  /**
   * Normalize data according to source configuration
   */
  private normalizeData(sourceId: string, rawData: any): any {
    const config = this.normalizationConfigs.get(sourceId);
    if (!config) {
      // Return raw data if no normalization config
      return rawData;
    }

    const normalized: any = {};

    for (const rule of config.transformations) {
      let value = this.getNestedValue(rawData, rule.sourceField);

      // Apply transformation if provided
      if (rule.transform && value !== undefined) {
        try {
          value = rule.transform(value);
        } catch (error: any) {
          this.emit('transformationError', {
            sourceId,
            field: rule.sourceField,
            error: error.message,
            originalValue: value
          });
          value = rule.defaultValue;
        }
      }

      // Use default value if required field is missing
      if (value === undefined && rule.required) {
        value = rule.defaultValue;
      }

      // Set normalized value
      if (value !== undefined) {
        this.setNestedValue(normalized, rule.targetField, value);
      }
    }

    return normalized;
  }

  /**
   * Resolve conflicts between multiple data sources
   */
  private async resolveConflicts(processedData: ProcessedData[]): Promise<ProcessedData[]> {
    const groupedById = this.groupDataById(processedData);
    const resolvedData: ProcessedData[] = [];

    for (const [id, items] of groupedById) {
      if (items.length === 1) {
        // No conflicts, use as-is
        resolvedData.push(items[0]);
      } else {
        // Resolve conflicts
        const resolved = await this.resolveDataConflicts(id, items);
        resolvedData.push(resolved);
      }
    }

    return resolvedData;
  }

  /**
   * Resolve conflicts for a specific data item
   */
  private async resolveDataConflicts(id: string, conflictingItems: ProcessedData[]): Promise<ProcessedData> {
    // Sort by quality score and timestamp
    const sortedItems = conflictingItems.sort((a, b) => {
      if (a.qualityScore !== b.qualityScore) {
        return b.qualityScore - a.qualityScore; // Higher quality first
      }
      return b.timestamp.getTime() - a.timestamp.getTime(); // More recent first
    });

    const primary = sortedItems[0];
    const conflicts: ConflictInfo[] = [];

    // Get the normalization config for conflict resolution
    const config = this.normalizationConfigs.get(primary.sourceId);
    const strategy = config?.conflictResolution || { strategy: 'highest_quality' };

    let resolvedData = { ...primary.normalizedData };

    // Apply conflict resolution strategy
    for (let i = 1; i < sortedItems.length; i++) {
      const conflicting = sortedItems[i];
      const resolution = this.applyConflictResolution(
        resolvedData,
        conflicting.normalizedData,
        strategy,
        primary.sourceId,
        conflicting.sourceId
      );

      resolvedData = resolution.data;
      conflicts.push(...resolution.conflicts);
    }

    const resolved: ProcessedData = {
      ...primary,
      normalizedData: resolvedData,
      conflicts,
      qualityScore: this.calculateMergedQualityScore(sortedItems)
    };

    this.emit('conflictsResolved', {
      id,
      conflictCount: conflicts.length,
      sourcesInvolved: conflictingItems.map(item => item.sourceId),
      strategy: strategy.strategy
    });

    return resolved;
  }

  /**
   * Apply specific conflict resolution strategy
   */
  private applyConflictResolution(
    existing: any,
    incoming: any,
    strategy: ConflictResolutionStrategy,
    existingSource: string,
    incomingSource: string
  ): { data: any; conflicts: ConflictInfo[] } {
    const conflicts: ConflictInfo[] = [];
    let resolvedData = { ...existing };

    switch (strategy.strategy) {
      case 'latest':
        // Always use incoming data (assuming it's more recent)
        resolvedData = { ...incoming };
        break;

      case 'highest_quality':
        // Data is already sorted by quality, so keep existing
        break;

      case 'merge':
        // Merge non-conflicting fields, prefer existing for conflicts
        resolvedData = { ...existing };
        for (const [key, value] of Object.entries(incoming)) {
          if (!(key in existing)) {
            resolvedData[key] = value;
          } else if (existing[key] !== value) {
            conflicts.push({
              field: key,
              existingValue: existing[key],
              incomingValue: value,
              resolution: 'kept_existing',
              reason: 'Merge strategy - kept existing value'
            });
          }
        }
        break;

      case 'custom':
        if (strategy.customResolver) {
          resolvedData = strategy.customResolver(existing, incoming);
        }
        break;
    }

    return { data: resolvedData, conflicts };
  }

  /**
   * Group processed data by ID for conflict resolution
   */
  private groupDataById(processedData: ProcessedData[]): Map<string, ProcessedData[]> {
    const grouped = new Map<string, ProcessedData[]>();

    for (const item of processedData) {
      const existing = grouped.get(item.id) || [];
      existing.push(item);
      grouped.set(item.id, existing);
    }

    return grouped;
  }

  /**
   * Generate unique ID for data item
   */
  private generateDataId(sourceId: string, data: any): string {
    // Try to use natural keys first
    if (data.id) return `${sourceId}:${data.id}`;
    if (data.fighterId) return `fighter:${data.fighterId}`;
    if (data.eventId) return `event:${data.eventId}`;
    if (data.fightId) return `fight:${data.fightId}`;

    // Fallback to hash of data
    const hash = this.hashObject(data);
    return `${sourceId}:${hash}`;
  }

  /**
   * Calculate average quality score
   */
  private calculateAverageQuality(data: ProcessedData[]): number {
    if (data.length === 0) return 0;
    const sum = data.reduce((acc, item) => acc + item.qualityScore, 0);
    return sum / data.length;
  }

  /**
   * Calculate merged quality score for resolved conflicts
   */
  private calculateMergedQualityScore(items: ProcessedData[]): number {
    // Weight by quality scores
    const totalWeight = items.reduce((sum, item) => sum + item.qualityScore, 0);
    if (totalWeight === 0) return 0;

    return items.reduce((weighted, item) => {
      const weight = item.qualityScore / totalWeight;
      return weighted + (item.qualityScore * weight);
    }, 0);
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested value in object using dot notation
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!(key in current)) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * Simple hash function for objects
   */
  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Setup listeners for ingestion manager events
   */
  private setupIngestionManagerListeners(): void {
    ingestionManager.on('syncCompleted', async (event) => {
      // Process the synced data
      if (event.result.recordsProcessed > 0) {
        this.emit('dataAvailableForProcessing', {
          sourceId: event.sourceId,
          recordCount: event.result.recordsProcessed
        });
      }
    });

    ingestionManager.on('syncError', (event) => {
      this.emit('ingestionError', {
        sourceId: event.sourceId,
        error: event.error
      });
    });
  }

  /**
   * Get processing statistics
   */
  public getProcessingStats(): any {
    return {
      totalItemsProcessed: this.processedDataCache.size,
      averageQualityScore: this.calculateAverageQuality(Array.from(this.processedDataCache.values())),
      sourcesWithConfigs: this.normalizationConfigs.size,
      lastProcessingTime: new Date()
    };
  }

  /**
   * Clear processed data cache
   */
  public clearCache(): void {
    this.processedDataCache.clear();
    this.emit('cacheCleared');
  }
}

// Singleton instance
export const dataIngestionService = new DataIngestionService();