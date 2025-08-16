import { DataValidator, ValidationResult } from './data-validator';

export interface QualityMetrics {
  dataType: string;
  timestamp: Date;
  totalRecords: number;
  validRecords: number;
  averageQualityScore: number;
  sourceBreakdown: SourceQualityMetrics[];
  issuesSummary: QualityIssue[];
  trend: QualityTrend;
}

export interface SourceQualityMetrics {
  sourceId: string;
  sourceName: string;
  reliability: number;
  recordsProcessed: number;
  errorRate: number;
  averageResponseTime: number;
  lastUpdated: Date;
}

export interface QualityIssue {
  type: string;
  field: string;
  frequency: number;
  impact: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

export interface QualityTrend {
  direction: 'improving' | 'declining' | 'stable';
  changePercent: number;
  timeframe: string;
}

export interface QualityAlert {
  id: string;
  type: 'quality_degradation' | 'source_failure' | 'consistency_issue' | 'data_staleness';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  dataType: string;
  sourceId?: string;
  timestamp: Date;
  threshold: number;
  actualValue: number;
  actionRequired: string[];
}

export interface QualityThresholds {
  minQualityScore: number;
  maxErrorRate: number;
  maxResponseTime: number;
  minSourceReliability: number;
  maxDataAge: number; // hours
}

export class QualityScorer {
  private validator: DataValidator;
  private qualityHistory: Map<string, QualityMetrics[]>;
  private activeAlerts: Map<string, QualityAlert>;
  private thresholds: QualityThresholds;

  constructor(validator: DataValidator) {
    this.validator = validator;
    this.qualityHistory = new Map();
    this.activeAlerts = new Map();
    this.thresholds = {
      minQualityScore: 80,
      maxErrorRate: 0.05, // 5%
      maxResponseTime: 5000, // 5 seconds
      minSourceReliability: 70,
      maxDataAge: 24 // 24 hours
    };
  }

  /**
   * Calculate comprehensive quality metrics for a data type
   */
  async calculateQualityMetrics(
    dataType: string,
    validationResults: ValidationResult[],
    sourceMetrics: Map<string, SourceQualityMetrics>
  ): Promise<QualityMetrics> {
    const timestamp = new Date();
    const totalRecords = validationResults.length;
    const validRecords = validationResults.filter(r => r.isValid).length;
    
    const averageQualityScore = validationResults.reduce(
      (sum, result) => sum + result.qualityScore, 0
    ) / totalRecords;

    const sourceBreakdown = Array.from(sourceMetrics.values());
    const issuesSummary = this.analyzeQualityIssues(validationResults);
    const trend = this.calculateTrend(dataType, averageQualityScore);

    const metrics: QualityMetrics = {
      dataType,
      timestamp,
      totalRecords,
      validRecords,
      averageQualityScore: Math.round(averageQualityScore),
      sourceBreakdown,
      issuesSummary,
      trend
    };

    // Store in history
    const history = this.qualityHistory.get(dataType) || [];
    history.push(metrics);
    
    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift();
    }
    
    this.qualityHistory.set(dataType, history);

    // Check for alerts
    await this.checkQualityAlerts(metrics);

    return metrics;
  }

  /**
   * Generate automated quality report
   */
  generateQualityReport(dataType?: string): {
    summary: QualityReportSummary;
    details: QualityMetrics[];
    alerts: QualityAlert[];
    recommendations: string[];
  } {
    const dataTypes = dataType ? [dataType] : Array.from(this.qualityHistory.keys());
    const allMetrics: QualityMetrics[] = [];
    
    for (const type of dataTypes) {
      const history = this.qualityHistory.get(type) || [];
      if (history.length > 0) {
        allMetrics.push(history[history.length - 1]); // Latest metrics
      }
    }

    const summary = this.calculateReportSummary(allMetrics);
    const alerts = Array.from(this.activeAlerts.values())
      .filter(alert => !dataType || alert.dataType === dataType);
    const recommendations = this.generateRecommendations(allMetrics, alerts);

    return {
      summary,
      details: allMetrics,
      alerts,
      recommendations
    };
  }

  /**
   * Set custom quality thresholds
   */
  setQualityThresholds(thresholds: Partial<QualityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    console.log('Updated quality thresholds', this.thresholds);
  }

  /**
   * Get active quality alerts
   */
  getActiveAlerts(severity?: QualityAlert['severity']): QualityAlert[] {
    const alerts = Array.from(this.activeAlerts.values());
    return severity ? alerts.filter(a => a.severity === severity) : alerts;
  }

  /**
   * Resolve a quality alert
   */
  resolveAlert(alertId: string): boolean {
    const deleted = this.activeAlerts.delete(alertId);
    if (deleted) {
      console.log(`Resolved quality alert: ${alertId}`);
    }
    return deleted;
  }

  /**
   * Get quality trend for a specific data type
   */
  getQualityTrend(dataType: string, timeframe: number = 24): QualityTrend {
    const history = this.qualityHistory.get(dataType) || [];
    if (history.length < 2) {
      return { direction: 'stable', changePercent: 0, timeframe: `${timeframe}h` };
    }

    const cutoffTime = new Date(Date.now() - (timeframe * 60 * 60 * 1000));
    const recentMetrics = history.filter(m => m.timestamp >= cutoffTime);
    
    if (recentMetrics.length < 2) {
      return { direction: 'stable', changePercent: 0, timeframe: `${timeframe}h` };
    }

    const oldScore = recentMetrics[0].averageQualityScore;
    const newScore = recentMetrics[recentMetrics.length - 1].averageQualityScore;
    const changePercent = ((newScore - oldScore) / oldScore) * 100;

    let direction: QualityTrend['direction'] = 'stable';
    if (Math.abs(changePercent) > 5) {
      direction = changePercent > 0 ? 'improving' : 'declining';
    }

    return {
      direction,
      changePercent: Math.round(changePercent * 100) / 100,
      timeframe: `${timeframe}h`
    };
  }

  private analyzeQualityIssues(validationResults: ValidationResult[]): QualityIssue[] {
    const issueMap = new Map<string, { count: number; totalImpact: number; severity: string }>();

    for (const result of validationResults) {
      for (const error of result.errors) {
        const key = `${error.field}:${error.rule}`;
        const existing = issueMap.get(key) || { count: 0, totalImpact: 0, severity: error.severity };
        
        existing.count++;
        existing.totalImpact += error.impact;
        
        // Use highest severity
        if (this.getSeverityWeight(error.severity) > this.getSeverityWeight(existing.severity)) {
          existing.severity = error.severity;
        }
        
        issueMap.set(key, existing);
      }
    }

    const issues: QualityIssue[] = [];
    for (const [key, data] of issueMap) {
      const [field, type] = key.split(':');
      const frequency = (data.count / validationResults.length) * 100;
      
      issues.push({
        type,
        field,
        frequency: Math.round(frequency * 100) / 100,
        impact: Math.round(data.totalImpact / data.count),
        severity: data.severity as QualityIssue['severity'],
        recommendation: this.getRecommendationForIssue(type, field)
      });
    }

    return issues.sort((a, b) => b.impact - a.impact);
  }

  private calculateTrend(dataType: string, currentScore: number): QualityTrend {
    const history = this.qualityHistory.get(dataType) || [];
    if (history.length < 2) {
      return { direction: 'stable', changePercent: 0, timeframe: '24h' };
    }

    const previousScore = history[history.length - 1].averageQualityScore;
    const changePercent = ((currentScore - previousScore) / previousScore) * 100;

    let direction: QualityTrend['direction'] = 'stable';
    if (Math.abs(changePercent) > 3) {
      direction = changePercent > 0 ? 'improving' : 'declining';
    }

    return {
      direction,
      changePercent: Math.round(changePercent * 100) / 100,
      timeframe: '24h'
    };
  }

  private async checkQualityAlerts(metrics: QualityMetrics): Promise<void> {
    const alerts: QualityAlert[] = [];

    // Check overall quality score
    if (metrics.averageQualityScore < this.thresholds.minQualityScore) {
      alerts.push({
        id: `quality_${metrics.dataType}_${Date.now()}`,
        type: 'quality_degradation',
        severity: metrics.averageQualityScore < 50 ? 'critical' : 'high',
        message: `Quality score for ${metrics.dataType} is below threshold`,
        dataType: metrics.dataType,
        timestamp: new Date(),
        threshold: this.thresholds.minQualityScore,
        actualValue: metrics.averageQualityScore,
        actionRequired: [
          'Review data sources',
          'Check validation rules',
          'Investigate recent changes'
        ]
      });
    }

    // Check source reliability
    for (const source of metrics.sourceBreakdown) {
      if (source.reliability < this.thresholds.minSourceReliability) {
        alerts.push({
          id: `source_${source.sourceId}_${Date.now()}`,
          type: 'source_failure',
          severity: source.reliability < 30 ? 'critical' : 'high',
          message: `Source ${source.sourceName} reliability is below threshold`,
          dataType: metrics.dataType,
          sourceId: source.sourceId,
          timestamp: new Date(),
          threshold: this.thresholds.minSourceReliability,
          actualValue: source.reliability,
          actionRequired: [
            'Check source connectivity',
            'Review source configuration',
            'Consider alternative sources'
          ]
        });
      }

      if (source.errorRate > this.thresholds.maxErrorRate) {
        alerts.push({
          id: `error_rate_${source.sourceId}_${Date.now()}`,
          type: 'source_failure',
          severity: 'medium',
          message: `High error rate for source ${source.sourceName}`,
          dataType: metrics.dataType,
          sourceId: source.sourceId,
          timestamp: new Date(),
          threshold: this.thresholds.maxErrorRate,
          actualValue: source.errorRate,
          actionRequired: [
            'Review error logs',
            'Check API limits',
            'Validate request format'
          ]
        });
      }
    }

    // Store new alerts
    for (const alert of alerts) {
      this.activeAlerts.set(alert.id, alert);
      console.warn(`Quality alert generated: ${alert.message}`, alert);
    }
  }

  private calculateReportSummary(metrics: QualityMetrics[]): QualityReportSummary {
    if (metrics.length === 0) {
      return {
        overallScore: 0,
        totalDataTypes: 0,
        healthyDataTypes: 0,
        criticalIssues: 0,
        totalRecords: 0,
        validRecords: 0
      };
    }

    const overallScore = metrics.reduce((sum, m) => sum + m.averageQualityScore, 0) / metrics.length;
    const healthyDataTypes = metrics.filter(m => m.averageQualityScore >= this.thresholds.minQualityScore).length;
    const criticalIssues = metrics.reduce((sum, m) => 
      sum + m.issuesSummary.filter(i => i.severity === 'critical').length, 0
    );
    const totalRecords = metrics.reduce((sum, m) => sum + m.totalRecords, 0);
    const validRecords = metrics.reduce((sum, m) => sum + m.validRecords, 0);

    return {
      overallScore: Math.round(overallScore),
      totalDataTypes: metrics.length,
      healthyDataTypes,
      criticalIssues,
      totalRecords,
      validRecords
    };
  }

  private generateRecommendations(metrics: QualityMetrics[], alerts: QualityAlert[]): string[] {
    const recommendations: string[] = [];

    // General recommendations based on metrics
    const avgScore = metrics.reduce((sum, m) => sum + m.averageQualityScore, 0) / metrics.length;
    
    if (avgScore < 70) {
      recommendations.push('Consider implementing additional data validation rules');
      recommendations.push('Review and update source reliability scoring');
    }

    if (alerts.length > 5) {
      recommendations.push('High number of active alerts - consider adjusting thresholds');
    }

    // Specific recommendations based on alert types
    const alertTypes = new Set(alerts.map(a => a.type));
    
    if (alertTypes.has('source_failure')) {
      recommendations.push('Implement backup data sources for critical data types');
    }
    
    if (alertTypes.has('quality_degradation')) {
      recommendations.push('Increase validation frequency for degraded data types');
    }

    return recommendations;
  }

  private getSeverityWeight(severity: string): number {
    const weights = { low: 1, medium: 2, high: 3, critical: 4 };
    return weights[severity as keyof typeof weights] || 1;
  }

  private getRecommendationForIssue(type: string, field: string): string {
    const recommendations: Record<string, string> = {
      'required': `Ensure ${field} is always provided by data sources`,
      'range': `Validate ${field} values are within expected ranges`,
      'format': `Standardize ${field} format across all sources`,
      'consistency': `Implement cross-reference validation for ${field}`
    };

    return recommendations[type] || `Review validation rules for ${field}`;
  }

  private generateRecommendations(metrics: QualityMetrics[], alerts: QualityAlert[]): string[] {
    const recommendations: string[] = [];

    // General recommendations based on metrics
    if (metrics.length > 0) {
      const avgScore = metrics.reduce((sum, m) => sum + m.averageQualityScore, 0) / metrics.length;
      
      if (avgScore < 70) {
        recommendations.push('Consider implementing additional data validation rules');
        recommendations.push('Review and update source reliability scoring');
      }
    }

    if (alerts.length > 5) {
      recommendations.push('High number of active alerts - consider adjusting thresholds');
    }

    // Specific recommendations based on alert types
    const alertTypes = new Set(alerts.map(a => a.type));
    
    if (alertTypes.has('source_failure')) {
      recommendations.push('Implement backup data sources for critical data types');
    }
    
    if (alertTypes.has('quality_degradation')) {
      recommendations.push('Increase validation frequency for degraded data types');
    }

    return recommendations;
  }

  private calculateReportSummary(allMetrics: QualityMetrics[]): QualityReportSummary {
    if (allMetrics.length === 0) {
      return {
        overallScore: 0,
        totalDataTypes: 0,
        healthyDataTypes: 0,
        criticalIssues: 0,
        totalRecords: 0,
        validRecords: 0
      };
    }

    const overallScore = allMetrics.reduce((sum, m) => sum + m.averageQualityScore, 0) / allMetrics.length;
    const healthyDataTypes = allMetrics.filter(m => m.averageQualityScore >= this.thresholds.minQualityScore).length;
    const criticalIssues = allMetrics.reduce((sum, m) => 
      sum + m.issuesSummary.filter(i => i.severity === 'critical').length, 0
    );
    const totalRecords = allMetrics.reduce((sum, m) => sum + m.totalRecords, 0);
    const validRecords = allMetrics.reduce((sum, m) => sum + m.validRecords, 0);

    return {
      overallScore: Math.round(overallScore),
      totalDataTypes: allMetrics.length,
      healthyDataTypes,
      criticalIssues,
      totalRecords,
      validRecords
    };
  }
}

interface QualityReportSummary {
  overallScore: number;
  totalDataTypes: number;
  healthyDataTypes: number;
  criticalIssues: number;
  totalRecords: number;
  validRecords: number;
}

interface QualityReportSummary {
  overallScore: number;
  totalDataTypes: number;
  healthyDataTypes: number;
  criticalIssues: number;
  totalRecords: number;
  validRecords: number;
}