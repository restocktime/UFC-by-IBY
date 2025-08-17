import { EventEmitter } from 'events';
import { ValidationError } from '@ufc-prediction/shared';

export interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'range' | 'format' | 'custom';
  constraint?: any;
  validator?: (value: any) => boolean;
  message?: string;
  severity: 'warning' | 'error';
}

export interface DataCleaningRule {
  field: string;
  action: 'trim' | 'normalize' | 'convert' | 'sanitize' | 'custom';
  parameters?: any;
  cleaner?: (value: any) => any;
}

export interface ValidationConfig {
  sourceId: string;
  entityType: string;
  rules: ValidationRule[];
  cleaningRules: DataCleaningRule[];
  strictMode: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  cleanedData: any;
  errors: ValidationError[];
  warnings: ValidationError[];
  processingTimeMs: number;
}

export class RealTimeValidatorService extends EventEmitter {
  private validationConfigs: Map<string, ValidationConfig> = new Map();
  private validationStats: Map<string, ValidationStats> = new Map();

  constructor() {
    super();
  }

  /**
   * Register validation configuration for a source and entity type
   */
  public registerValidationConfig(config: ValidationConfig): void {
    const key = `${config.sourceId}:${config.entityType}`;
    this.validationConfigs.set(key, config);
    
    // Initialize stats
    this.validationStats.set(key, {
      totalValidated: 0,
      totalErrors: 0,
      totalWarnings: 0,
      averageProcessingTime: 0,
      lastValidation: new Date()
    });

    this.emit('validationConfigRegistered', { 
      sourceId: config.sourceId, 
      entityType: config.entityType 
    });
  }

  /**
   * Validate and clean data in real-time
   */
  public async validateAndClean(
    sourceId: string, 
    entityType: string, 
    data: any
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const key = `${sourceId}:${entityType}`;
    const config = this.validationConfigs.get(key);

    if (!config) {
      throw new Error(`No validation config found for ${sourceId}:${entityType}`);
    }

    try {
      // Step 1: Clean the data
      const cleanedData = await this.cleanData(data, config.cleaningRules);

      // Step 2: Validate the cleaned data
      const { errors, warnings } = await this.validateData(cleanedData, config.rules);

      // Step 3: Determine if data is valid
      const isValid = config.strictMode ? errors.length === 0 : true;

      const result: ValidationResult = {
        isValid,
        cleanedData,
        errors,
        warnings,
        processingTimeMs: Date.now() - startTime
      };

      // Update statistics
      this.updateValidationStats(key, result);

      this.emit('validationCompleted', {
        sourceId,
        entityType,
        isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
        processingTimeMs: result.processingTimeMs
      });

      return result;

    } catch (error: any) {
      const result: ValidationResult = {
        isValid: false,
        cleanedData: data,
        errors: [{
          field: 'validation',
          message: `Validation failed: ${error.message}`,
          value: error,
          severity: 'error'
        }],
        warnings: [],
        processingTimeMs: Date.now() - startTime
      };

      this.emit('validationError', {
        sourceId,
        entityType,
        error: error.message
      });

      return result;
    }
  }

  /**
   * Clean data according to cleaning rules
   */
  private async cleanData(data: any, cleaningRules: DataCleaningRule[]): Promise<any> {
    const cleaned = { ...data };

    for (const rule of cleaningRules) {
      const value = this.getNestedValue(cleaned, rule.field);
      
      if (value !== undefined && value !== null) {
        let cleanedValue = value;

        switch (rule.action) {
          case 'trim':
            if (typeof value === 'string') {
              cleanedValue = value.trim();
            }
            break;

          case 'normalize':
            cleanedValue = this.normalizeValue(value, rule.parameters);
            break;

          case 'convert':
            cleanedValue = this.convertValue(value, rule.parameters);
            break;

          case 'sanitize':
            cleanedValue = this.sanitizeValue(value, rule.parameters);
            break;

          case 'custom':
            if (rule.cleaner) {
              cleanedValue = rule.cleaner(value);
            }
            break;
        }

        this.setNestedValue(cleaned, rule.field, cleanedValue);
      }
    }

    return cleaned;
  }

  /**
   * Validate data according to validation rules
   */
  private async validateData(
    data: any, 
    rules: ValidationRule[]
  ): Promise<{ errors: ValidationError[]; warnings: ValidationError[] }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    for (const rule of rules) {
      const value = this.getNestedValue(data, rule.field);
      const validationError = this.validateField(rule, value);

      if (validationError) {
        if (validationError.severity === 'error') {
          errors.push(validationError);
        } else {
          warnings.push(validationError);
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate a single field
   */
  private validateField(rule: ValidationRule, value: any): ValidationError | null {
    let isValid = true;
    let message = rule.message || `Validation failed for field ${rule.field}`;

    switch (rule.type) {
      case 'required':
        isValid = value !== undefined && value !== null && value !== '';
        message = rule.message || `Field ${rule.field} is required`;
        break;

      case 'type':
        isValid = this.validateType(value, rule.constraint);
        message = rule.message || `Field ${rule.field} must be of type ${rule.constraint}`;
        break;

      case 'range':
        isValid = this.validateRange(value, rule.constraint);
        message = rule.message || `Field ${rule.field} must be within range ${JSON.stringify(rule.constraint)}`;
        break;

      case 'format':
        isValid = this.validateFormat(value, rule.constraint);
        message = rule.message || `Field ${rule.field} format is invalid`;
        break;

      case 'custom':
        if (rule.validator) {
          isValid = rule.validator(value);
        }
        break;
    }

    if (!isValid) {
      return {
        field: rule.field,
        message,
        value,
        severity: rule.severity
      };
    }

    return null;
  }

  /**
   * Validate data type
   */
  private validateType(value: any, expectedType: string): boolean {
    if (value === undefined || value === null) return true; // Let required rule handle this

    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && !Array.isArray(value);
      case 'date':
        return value instanceof Date || !isNaN(Date.parse(value));
      default:
        return true;
    }
  }

  /**
   * Validate value range
   */
  private validateRange(value: any, range: { min?: number; max?: number }): boolean {
    if (value === undefined || value === null) return true;
    
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue)) return false;

    if (range.min !== undefined && numValue < range.min) return false;
    if (range.max !== undefined && numValue > range.max) return false;

    return true;
  }

  /**
   * Validate format using regex
   */
  private validateFormat(value: any, pattern: string | RegExp): boolean {
    if (value === undefined || value === null) return true;
    
    const stringValue = String(value);
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    return regex.test(stringValue);
  }

  /**
   * Normalize value
   */
  private normalizeValue(value: any, parameters: any): any {
    if (typeof value === 'string') {
      switch (parameters?.type) {
        case 'lowercase':
          return value.toLowerCase();
        case 'uppercase':
          return value.toUpperCase();
        case 'title':
          return value.replace(/\w\S*/g, (txt) => 
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
          );
        default:
          return value;
      }
    }
    return value;
  }

  /**
   * Convert value to different type
   */
  private convertValue(value: any, parameters: any): any {
    switch (parameters?.to) {
      case 'number':
        const num = parseFloat(value);
        return isNaN(num) ? value : num;
      case 'string':
        return String(value);
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true' || value === '1';
        }
        return Boolean(value);
      case 'date':
        return new Date(value);
      default:
        return value;
    }
  }

  /**
   * Sanitize value
   */
  private sanitizeValue(value: any, parameters: any): any {
    if (typeof value === 'string') {
      switch (parameters?.type) {
        case 'html':
          return value.replace(/<[^>]*>/g, '');
        case 'sql':
          return value.replace(/['";\\]/g, '');
        case 'alphanumeric':
          return value.replace(/[^a-zA-Z0-9]/g, '');
        default:
          return value;
      }
    }
    return value;
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
   * Update validation statistics
   */
  private updateValidationStats(key: string, result: ValidationResult): void {
    const stats = this.validationStats.get(key);
    if (stats) {
      stats.totalValidated++;
      stats.totalErrors += result.errors.length;
      stats.totalWarnings += result.warnings.length;
      stats.averageProcessingTime = (
        (stats.averageProcessingTime * (stats.totalValidated - 1)) + result.processingTimeMs
      ) / stats.totalValidated;
      stats.lastValidation = new Date();
    }
  }

  /**
   * Get validation statistics
   */
  public getValidationStats(): Map<string, ValidationStats> {
    return new Map(this.validationStats);
  }

  /**
   * Get validation config for source and entity type
   */
  public getValidationConfig(sourceId: string, entityType: string): ValidationConfig | undefined {
    return this.validationConfigs.get(`${sourceId}:${entityType}`);
  }

  /**
   * Remove validation config
   */
  public removeValidationConfig(sourceId: string, entityType: string): boolean {
    const key = `${sourceId}:${entityType}`;
    const removed = this.validationConfigs.delete(key);
    if (removed) {
      this.validationStats.delete(key);
      this.emit('validationConfigRemoved', { sourceId, entityType });
    }
    return removed;
  }
}

interface ValidationStats {
  totalValidated: number;
  totalErrors: number;
  totalWarnings: number;
  averageProcessingTime: number;
  lastValidation: Date;
}

// Singleton instance
export const realTimeValidatorService = new RealTimeValidatorService();