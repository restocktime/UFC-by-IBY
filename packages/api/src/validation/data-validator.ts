export interface ValidationRule {
  field: string;
  type: 'required' | 'range' | 'format' | 'consistency' | 'cross_reference';
  params?: any;
  weight: number; // Impact on overall quality score (0-1)
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  qualityScore: number; // 0-100
  sourceReliability: number; // 0-100
}

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: number; // Impact on quality score
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface DataSource {
  id: string;
  name: string;
  reliability: number; // Historical reliability score (0-100)
  lastUpdated: Date;
  responseTime: number;
  errorRate: number;
}

export interface CrossSourceData {
  sourceId: string;
  data: any;
  timestamp: Date;
  confidence: number;
}

export class DataValidator {
  private validationRules: Map<string, ValidationRule[]>;
  private sourceReliability: Map<string, DataSource>;

  constructor() {
    this.validationRules = new Map();
    this.sourceReliability = new Map();
    this.initializeDefaultRules();
  }

  /**
   * Validate data from a single source
   */
  async validateSingleSource(
    dataType: string,
    data: any,
    sourceId: string
  ): Promise<ValidationResult> {
    const rules = this.validationRules.get(dataType) || [];
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let qualityScore = 100;

    for (const rule of rules) {
      const ruleResult = await this.applyRule(rule, data);
      
      if (!ruleResult.isValid) {
        errors.push({
          field: rule.field,
          rule: rule.type,
          message: ruleResult.message,
          severity: ruleResult.severity,
          impact: rule.weight * 100
        });
        
        qualityScore -= rule.weight * 100;
      }

      if (ruleResult.warnings) {
        warnings.push(...ruleResult.warnings);
      }
    }

    const source = this.sourceReliability.get(sourceId);
    const sourceReliability = source?.reliability || 50;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      qualityScore: Math.max(0, qualityScore),
      sourceReliability
    };
  }

  /**
   * Cross-source reconciliation and validation
   */
  async validateCrossSources(
    dataType: string,
    crossSourceData: CrossSourceData[]
  ): Promise<ValidationResult> {
    if (crossSourceData.length < 2) {
      throw new Error('Cross-source validation requires at least 2 sources');
    }

    const reconciled = await this.reconcileData(dataType, crossSourceData);
    const consistencyScore = this.calculateConsistencyScore(crossSourceData);
    const weightedReliability = this.calculateWeightedReliability(crossSourceData);

    // Validate the reconciled data
    const validation = await this.validateSingleSource(
      dataType,
      reconciled.data,
      'reconciled'
    );

    // Adjust quality score based on cross-source consistency
    const adjustedQualityScore = validation.qualityScore * (consistencyScore / 100);

    return {
      ...validation,
      qualityScore: adjustedQualityScore,
      sourceReliability: weightedReliability
    };
  }

  /**
   * Calculate data confidence score based on multiple factors
   */
  calculateConfidenceScore(
    validationResult: ValidationResult,
    dataAge: number, // hours since last update
    sourceCount: number
  ): number {
    const qualityWeight = 0.4;
    const reliabilityWeight = 0.3;
    const freshnessWeight = 0.2;
    const consensusWeight = 0.1;

    // Quality component (0-100)
    const qualityComponent = validationResult.qualityScore;

    // Reliability component (0-100)
    const reliabilityComponent = validationResult.sourceReliability;

    // Freshness component (0-100, decreases with age)
    const freshnessComponent = Math.max(0, 100 - (dataAge * 2));

    // Consensus component (0-100, increases with more sources)
    const consensusComponent = Math.min(100, sourceCount * 25);

    const confidenceScore = 
      (qualityComponent * qualityWeight) +
      (reliabilityComponent * reliabilityWeight) +
      (freshnessComponent * freshnessWeight) +
      (consensusComponent * consensusWeight);

    return Math.round(confidenceScore);
  }

  /**
   * Update source reliability based on validation history
   */
  updateSourceReliability(
    sourceId: string,
    validationResult: ValidationResult,
    responseTime: number
  ): void {
    const existing = this.sourceReliability.get(sourceId);
    const currentReliability = existing?.reliability || 50;
    
    // Calculate new reliability based on validation quality and response time
    const qualityFactor = validationResult.qualityScore / 100;
    const timeFactor = Math.max(0.1, 1 - (responseTime / 10000)); // Penalize slow responses
    
    const newReliability = (currentReliability * 0.8) + ((qualityFactor * timeFactor * 100) * 0.2);

    this.sourceReliability.set(sourceId, {
      id: sourceId,
      name: existing?.name || sourceId,
      reliability: Math.round(newReliability),
      lastUpdated: new Date(),
      responseTime,
      errorRate: existing?.errorRate || 0
    });

    console.log(`Updated source reliability for ${sourceId}: ${newReliability.toFixed(2)}`);
  }

  /**
   * Get quality report for a data type across all sources
   */
  getQualityReport(dataType: string): {
    averageQuality: number;
    sourceBreakdown: Array<{
      sourceId: string;
      reliability: number;
      lastUpdated: Date;
    }>;
    commonIssues: Array<{
      field: string;
      frequency: number;
      impact: number;
    }>;
  } {
    const sources = Array.from(this.sourceReliability.values());
    const averageQuality = sources.length > 0 
      ? sources.reduce((sum, s) => sum + s.reliability, 0) / sources.length
      : 0;

    return {
      averageQuality: Math.round(averageQuality),
      sourceBreakdown: sources.map(s => ({
        sourceId: s.id,
        reliability: s.reliability,
        lastUpdated: s.lastUpdated
      })),
      commonIssues: [] // TODO: Implement issue tracking
    };
  }

  private async applyRule(rule: ValidationRule, data: any): Promise<{
    isValid: boolean;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    warnings?: ValidationWarning[];
  }> {
    const value = this.getNestedValue(data, rule.field);

    switch (rule.type) {
      case 'required':
        return {
          isValid: value !== null && value !== undefined && value !== '',
          message: `Field ${rule.field} is required`,
          severity: 'critical'
        };

      case 'range':
        const { min, max } = rule.params;
        const numValue = Number(value);
        return {
          isValid: !isNaN(numValue) && numValue >= min && numValue <= max,
          message: `Field ${rule.field} must be between ${min} and ${max}`,
          severity: 'medium'
        };

      case 'format':
        const regex = new RegExp(rule.params.pattern);
        return {
          isValid: typeof value === 'string' && regex.test(value),
          message: `Field ${rule.field} format is invalid`,
          severity: 'medium'
        };

      case 'consistency':
        // Check internal data consistency
        return this.validateConsistency(data, rule);

      default:
        return {
          isValid: true,
          message: '',
          severity: 'low'
        };
    }
  }

  private validateConsistency(data: any, rule: ValidationRule): {
    isValid: boolean;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  } {
    // Example: Fighter record consistency (wins + losses + draws should match total fights)
    if (rule.params?.type === 'fighter_record') {
      const wins = data.record?.wins || 0;
      const losses = data.record?.losses || 0;
      const draws = data.record?.draws || 0;
      const totalFights = data.fightHistory?.length || 0;

      const recordTotal = wins + losses + draws;
      const isConsistent = Math.abs(recordTotal - totalFights) <= 1; // Allow 1 fight difference

      return {
        isValid: isConsistent,
        message: `Fighter record inconsistency: ${recordTotal} record total vs ${totalFights} fight history`,
        severity: 'high'
      };
    }

    return { isValid: true, message: '', severity: 'low' };
  }

  private async reconcileData(
    dataType: string,
    crossSourceData: CrossSourceData[]
  ): Promise<{ data: any; confidence: number }> {
    // Simple reconciliation strategy: use most reliable source as base
    const sortedBySources = crossSourceData.sort((a, b) => {
      const sourceA = this.sourceReliability.get(a.sourceId);
      const sourceB = this.sourceReliability.get(b.sourceId);
      return (sourceB?.reliability || 0) - (sourceA?.reliability || 0);
    });

    const baseData = sortedBySources[0].data;
    const confidence = this.calculateConsistencyScore(crossSourceData);

    // TODO: Implement more sophisticated reconciliation logic
    // For now, return the most reliable source's data

    return {
      data: baseData,
      confidence
    };
  }

  private calculateConsistencyScore(crossSourceData: CrossSourceData[]): number {
    if (crossSourceData.length < 2) return 100;

    // Simple consistency check: compare key fields across sources
    const keyFields = ['name', 'id', 'record', 'physicalStats'];
    let consistentFields = 0;
    let totalFields = 0;

    for (const field of keyFields) {
      const values = crossSourceData.map(d => this.getNestedValue(d.data, field));
      const uniqueValues = new Set(values.map(v => JSON.stringify(v)));
      
      totalFields++;
      if (uniqueValues.size === 1) {
        consistentFields++;
      }
    }

    return totalFields > 0 ? (consistentFields / totalFields) * 100 : 0;
  }

  private calculateWeightedReliability(crossSourceData: CrossSourceData[]): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const sourceData of crossSourceData) {
      const source = this.sourceReliability.get(sourceData.sourceId);
      const reliability = source?.reliability || 50;
      const weight = sourceData.confidence;

      weightedSum += reliability * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 50;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private initializeDefaultRules(): void {
    // Fighter validation rules
    this.validationRules.set('fighter', [
      { field: 'name', type: 'required', weight: 0.3 },
      { field: 'record.wins', type: 'range', params: { min: 0, max: 100 }, weight: 0.1 },
      { field: 'record.losses', type: 'range', params: { min: 0, max: 100 }, weight: 0.1 },
      { field: 'physicalStats.height', type: 'range', params: { min: 60, max: 84 }, weight: 0.1 },
      { field: 'physicalStats.weight', type: 'range', params: { min: 115, max: 300 }, weight: 0.1 },
      { field: 'record', type: 'consistency', params: { type: 'fighter_record' }, weight: 0.2 }
    ]);

    // Fight validation rules
    this.validationRules.set('fight', [
      { field: 'fighter1Id', type: 'required', weight: 0.4 },
      { field: 'fighter2Id', type: 'required', weight: 0.4 },
      { field: 'scheduledRounds', type: 'range', params: { min: 1, max: 5 }, weight: 0.1 },
      { field: 'weightClass', type: 'required', weight: 0.1 }
    ]);

    // Odds validation rules
    this.validationRules.set('odds', [
      { field: 'fightId', type: 'required', weight: 0.3 },
      { field: 'sportsbook', type: 'required', weight: 0.2 },
      { field: 'moneyline.fighter1', type: 'range', params: { min: -2000, max: 2000 }, weight: 0.2 },
      { field: 'moneyline.fighter2', type: 'range', params: { min: -2000, max: 2000 }, weight: 0.2 }
    ]);
  }
}