import { EventEmitter } from 'events';

export interface TransformationPipeline {
  id: string;
  name: string;
  sourceId: string;
  entityType: string;
  transformations: DataTransformation[];
  enabled: boolean;
}

export interface DataTransformation {
  id: string;
  type: 'map' | 'filter' | 'aggregate' | 'enrich' | 'custom';
  config: TransformationConfig;
  order: number;
}

export interface TransformationConfig {
  // Map transformation
  fieldMappings?: FieldMapping[];
  
  // Filter transformation
  filterConditions?: FilterCondition[];
  
  // Aggregate transformation
  groupBy?: string[];
  aggregations?: AggregationRule[];
  
  // Enrich transformation
  enrichmentRules?: EnrichmentRule[];
  
  // Custom transformation
  customFunction?: (data: any) => any;
}

export interface FieldMapping {
  source: string;
  target: string;
  transform?: (value: any) => any;
  defaultValue?: any;
}

export interface FilterCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'regex' | 'custom';
  value: any;
  customFilter?: (fieldValue: any, conditionValue: any) => boolean;
}

export interface AggregationRule {
  field: string;
  operation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'first' | 'last';
  outputField: string;
}

export interface EnrichmentRule {
  type: 'lookup' | 'calculate' | 'external_api' | 'custom';
  config: any;
  outputField: string;
}

export interface TransformationResult {
  success: boolean;
  transformedData: any[];
  originalCount: number;
  transformedCount: number;
  errors: TransformationError[];
  processingTimeMs: number;
  pipelineId: string;
}

export interface TransformationError {
  transformationId: string;
  message: string;
  data: any;
  error: any;
}

export class DataTransformationService extends EventEmitter {
  private pipelines: Map<string, TransformationPipeline> = new Map();
  private transformationStats: Map<string, TransformationStats> = new Map();

  constructor() {
    super();
  }

  /**
   * Register a transformation pipeline
   */
  public registerPipeline(pipeline: TransformationPipeline): void {
    // Sort transformations by order
    pipeline.transformations.sort((a, b) => a.order - b.order);
    
    this.pipelines.set(pipeline.id, pipeline);
    
    // Initialize stats
    this.transformationStats.set(pipeline.id, {
      totalProcessed: 0,
      totalErrors: 0,
      averageProcessingTime: 0,
      lastExecution: new Date()
    });

    this.emit('pipelineRegistered', { pipelineId: pipeline.id, sourceId: pipeline.sourceId });
  }

  /**
   * Transform data using registered pipeline
   */
  public async transformData(
    sourceId: string, 
    entityType: string, 
    data: any[]
  ): Promise<TransformationResult> {
    const startTime = Date.now();
    const pipeline = this.findPipeline(sourceId, entityType);

    if (!pipeline || !pipeline.enabled) {
      return {
        success: true,
        transformedData: data,
        originalCount: data.length,
        transformedCount: data.length,
        errors: [],
        processingTimeMs: Date.now() - startTime,
        pipelineId: pipeline?.id || 'none'
      };
    }

    try {
      this.emit('transformationStarted', {
        pipelineId: pipeline.id,
        sourceId,
        entityType,
        recordCount: data.length
      });

      let transformedData = [...data];
      const errors: TransformationError[] = [];

      // Execute transformations in order
      for (const transformation of pipeline.transformations) {
        try {
          transformedData = await this.executeTransformation(transformation, transformedData);
        } catch (error: any) {
          errors.push({
            transformationId: transformation.id,
            message: error.message,
            data: transformedData,
            error
          });

          this.emit('transformationError', {
            pipelineId: pipeline.id,
            transformationId: transformation.id,
            error: error.message
          });
        }
      }

      const result: TransformationResult = {
        success: errors.length === 0,
        transformedData,
        originalCount: data.length,
        transformedCount: transformedData.length,
        errors,
        processingTimeMs: Date.now() - startTime,
        pipelineId: pipeline.id
      };

      // Update statistics
      this.updateTransformationStats(pipeline.id, result);

      this.emit('transformationCompleted', {
        pipelineId: pipeline.id,
        originalCount: result.originalCount,
        transformedCount: result.transformedCount,
        errorCount: errors.length,
        processingTimeMs: result.processingTimeMs
      });

      return result;

    } catch (error: any) {
      const result: TransformationResult = {
        success: false,
        transformedData: [],
        originalCount: data.length,
        transformedCount: 0,
        errors: [{
          transformationId: 'pipeline',
          message: error.message,
          data,
          error
        }],
        processingTimeMs: Date.now() - startTime,
        pipelineId: pipeline.id
      };

      this.emit('pipelineError', {
        pipelineId: pipeline.id,
        error: error.message
      });

      return result;
    }
  }

  /**
   * Execute a single transformation
   */
  private async executeTransformation(
    transformation: DataTransformation, 
    data: any[]
  ): Promise<any[]> {
    switch (transformation.type) {
      case 'map':
        return this.executeMapTransformation(transformation.config, data);
      
      case 'filter':
        return this.executeFilterTransformation(transformation.config, data);
      
      case 'aggregate':
        return this.executeAggregateTransformation(transformation.config, data);
      
      case 'enrich':
        return await this.executeEnrichTransformation(transformation.config, data);
      
      case 'custom':
        return this.executeCustomTransformation(transformation.config, data);
      
      default:
        throw new Error(`Unknown transformation type: ${transformation.type}`);
    }
  }

  /**
   * Execute map transformation (field mapping)
   */
  private executeMapTransformation(config: TransformationConfig, data: any[]): any[] {
    if (!config.fieldMappings) return data;

    return data.map(item => {
      const mapped: any = {};

      for (const mapping of config.fieldMappings) {
        let value = this.getNestedValue(item, mapping.source);

        // Apply transformation if provided
        if (mapping.transform && value !== undefined) {
          try {
            value = mapping.transform(value);
          } catch (error) {
            value = mapping.defaultValue;
          }
        }

        // Use default value if source is missing
        if (value === undefined) {
          value = mapping.defaultValue;
        }

        // Set mapped value
        if (value !== undefined) {
          this.setNestedValue(mapped, mapping.target, value);
        }
      }

      return mapped;
    });
  }

  /**
   * Execute filter transformation
   */
  private executeFilterTransformation(config: TransformationConfig, data: any[]): any[] {
    if (!config.filterConditions) return data;

    return data.filter(item => {
      return config.filterConditions!.every(condition => {
        const fieldValue = this.getNestedValue(item, condition.field);
        return this.evaluateFilterCondition(fieldValue, condition);
      });
    });
  }

  /**
   * Execute aggregate transformation
   */
  private executeAggregateTransformation(config: TransformationConfig, data: any[]): any[] {
    if (!config.groupBy || !config.aggregations) return data;

    // Group data by specified fields
    const groups = this.groupBy(data, config.groupBy);
    
    // Apply aggregations to each group
    const aggregated: any[] = [];

    for (const [groupKey, groupData] of groups) {
      const aggregatedItem: any = {};

      // Add group key fields
      const keyParts = groupKey.split('|');
      config.groupBy.forEach((field, index) => {
        aggregatedItem[field] = keyParts[index];
      });

      // Apply aggregation rules
      for (const rule of config.aggregations) {
        const values = groupData.map(item => this.getNestedValue(item, rule.field))
          .filter(val => val !== undefined && val !== null);

        let aggregatedValue: any;

        switch (rule.operation) {
          case 'sum':
            aggregatedValue = values.reduce((sum, val) => sum + (Number(val) || 0), 0);
            break;
          case 'avg':
            aggregatedValue = values.length > 0 
              ? values.reduce((sum, val) => sum + (Number(val) || 0), 0) / values.length 
              : 0;
            break;
          case 'min':
            aggregatedValue = values.length > 0 ? Math.min(...values.map(Number)) : null;
            break;
          case 'max':
            aggregatedValue = values.length > 0 ? Math.max(...values.map(Number)) : null;
            break;
          case 'count':
            aggregatedValue = values.length;
            break;
          case 'first':
            aggregatedValue = values[0];
            break;
          case 'last':
            aggregatedValue = values[values.length - 1];
            break;
        }

        aggregatedItem[rule.outputField] = aggregatedValue;
      }

      aggregated.push(aggregatedItem);
    }

    return aggregated;
  }

  /**
   * Execute enrich transformation
   */
  private async executeEnrichTransformation(config: TransformationConfig, data: any[]): Promise<any[]> {
    if (!config.enrichmentRules) return data;

    const enriched = [...data];

    for (const item of enriched) {
      for (const rule of config.enrichmentRules) {
        try {
          const enrichedValue = await this.executeEnrichmentRule(rule, item);
          item[rule.outputField] = enrichedValue;
        } catch (error) {
          // Continue with other enrichments on error
          item[rule.outputField] = null;
        }
      }
    }

    return enriched;
  }

  /**
   * Execute custom transformation
   */
  private executeCustomTransformation(config: TransformationConfig, data: any[]): any[] {
    if (!config.customFunction) return data;

    try {
      return config.customFunction(data);
    } catch (error) {
      throw new Error(`Custom transformation failed: ${error}`);
    }
  }

  /**
   * Evaluate filter condition
   */
  private evaluateFilterCondition(fieldValue: any, condition: FilterCondition): boolean {
    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'greater_than':
        return Number(fieldValue) > Number(condition.value);
      case 'less_than':
        return Number(fieldValue) < Number(condition.value);
      case 'contains':
        return String(fieldValue).includes(String(condition.value));
      case 'regex':
        return new RegExp(condition.value).test(String(fieldValue));
      case 'custom':
        return condition.customFilter ? condition.customFilter(fieldValue, condition.value) : true;
      default:
        return true;
    }
  }

  /**
   * Execute enrichment rule
   */
  private async executeEnrichmentRule(rule: EnrichmentRule, item: any): Promise<any> {
    switch (rule.type) {
      case 'lookup':
        // Implement lookup logic (e.g., database lookup)
        return null;
      
      case 'calculate':
        // Implement calculation logic
        return this.executeCalculation(rule.config, item);
      
      case 'external_api':
        // Implement external API call
        return null;
      
      case 'custom':
        return rule.config.customFunction ? rule.config.customFunction(item) : null;
      
      default:
        return null;
    }
  }

  /**
   * Execute calculation enrichment
   */
  private executeCalculation(config: any, item: any): any {
    if (!config.formula) return null;

    try {
      // Simple formula evaluation (extend as needed)
      const formula = config.formula as string;
      const variables = config.variables || {};

      // Replace variables in formula
      let evaluableFormula = formula;
      for (const [varName, fieldPath] of Object.entries(variables)) {
        const value = this.getNestedValue(item, fieldPath as string);
        evaluableFormula = evaluableFormula.replace(
          new RegExp(`\\$${varName}`, 'g'), 
          String(value || 0)
        );
      }

      // Basic math evaluation (use a proper expression evaluator in production)
      return Function(`"use strict"; return (${evaluableFormula})`)();
    } catch (error) {
      return null;
    }
  }

  /**
   * Group data by specified fields
   */
  private groupBy(data: any[], fields: string[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();

    for (const item of data) {
      const key = fields.map(field => this.getNestedValue(item, field)).join('|');
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }

    return groups;
  }

  /**
   * Find pipeline for source and entity type
   */
  private findPipeline(sourceId: string, entityType: string): TransformationPipeline | undefined {
    for (const pipeline of this.pipelines.values()) {
      if (pipeline.sourceId === sourceId && pipeline.entityType === entityType) {
        return pipeline;
      }
    }
    return undefined;
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested value in object
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
   * Update transformation statistics
   */
  private updateTransformationStats(pipelineId: string, result: TransformationResult): void {
    const stats = this.transformationStats.get(pipelineId);
    if (stats) {
      stats.totalProcessed++;
      stats.totalErrors += result.errors.length;
      stats.averageProcessingTime = (
        (stats.averageProcessingTime * (stats.totalProcessed - 1)) + result.processingTimeMs
      ) / stats.totalProcessed;
      stats.lastExecution = new Date();
    }
  }

  /**
   * Get transformation statistics
   */
  public getTransformationStats(): Map<string, TransformationStats> {
    return new Map(this.transformationStats);
  }

  /**
   * Get pipeline by ID
   */
  public getPipeline(pipelineId: string): TransformationPipeline | undefined {
    return this.pipelines.get(pipelineId);
  }

  /**
   * Update pipeline
   */
  public updatePipeline(pipeline: TransformationPipeline): void {
    if (this.pipelines.has(pipeline.id)) {
      pipeline.transformations.sort((a, b) => a.order - b.order);
      this.pipelines.set(pipeline.id, pipeline);
      this.emit('pipelineUpdated', { pipelineId: pipeline.id });
    }
  }

  /**
   * Remove pipeline
   */
  public removePipeline(pipelineId: string): boolean {
    const removed = this.pipelines.delete(pipelineId);
    if (removed) {
      this.transformationStats.delete(pipelineId);
      this.emit('pipelineRemoved', { pipelineId });
    }
    return removed;
  }
}

interface TransformationStats {
  totalProcessed: number;
  totalErrors: number;
  averageProcessingTime: number;
  lastExecution: Date;
}

// Singleton instance
export const dataTransformationService = new DataTransformationService();