import { QualityScorer, QualityMetrics, SourceQualityMetrics } from '../quality-scorer';
import { DataValidator, ValidationResult } from '../data-validator';
import { vi } from 'vitest';

describe('QualityScorer', () => {
  let qualityScorer: QualityScorer;
  let mockValidator: DataValidator;

  beforeEach(() => {
    mockValidator = {
      validateSingleSource: vi.fn(),
      validateCrossSources: vi.fn(),
      calculateConfidenceScore: vi.fn(),
      updateSourceReliability: vi.fn(),
      getQualityReport: vi.fn()
    } as any;

    qualityScorer = new QualityScorer(mockValidator);
  });

  describe('calculateQualityMetrics', () => {
    it('should calculate comprehensive quality metrics', async () => {
      const validationResults: ValidationResult[] = [
        {
          isValid: true,
          errors: [],
          warnings: [],
          qualityScore: 90,
          sourceReliability: 85
        },
        {
          isValid: false,
          errors: [
            {
              field: 'name',
              rule: 'required',
              message: 'Name is required',
              severity: 'critical',
              impact: 30
            }
          ],
          warnings: [],
          qualityScore: 70,
          sourceReliability: 80
        }
      ];

      const sourceMetrics = new Map<string, SourceQualityMetrics>([
        ['source-1', {
          sourceId: 'source-1',
          sourceName: 'Test Source 1',
          reliability: 85,
          recordsProcessed: 100,
          errorRate: 0.02,
          averageResponseTime: 1200,
          lastUpdated: new Date()
        }]
      ]);

      const metrics = await qualityScorer.calculateQualityMetrics(
        'fighter',
        validationResults,
        sourceMetrics
      );

      expect(metrics.dataType).toBe('fighter');
      expect(metrics.totalRecords).toBe(2);
      expect(metrics.validRecords).toBe(1);
      expect(metrics.averageQualityScore).toBe(80); // (90 + 70) / 2
      expect(metrics.sourceBreakdown).toHaveLength(1);
      expect(metrics.issuesSummary.length).toBeGreaterThan(0);
      expect(metrics.trend).toBeDefined();
    });

    it('should analyze quality issues correctly', async () => {
      const validationResults: ValidationResult[] = [
        {
          isValid: false,
          errors: [
            {
              field: 'name',
              rule: 'required',
              message: 'Name is required',
              severity: 'critical',
              impact: 30
            },
            {
              field: 'weight',
              rule: 'range',
              message: 'Weight out of range',
              severity: 'medium',
              impact: 10
            }
          ],
          warnings: [],
          qualityScore: 60,
          sourceReliability: 80
        },
        {
          isValid: false,
          errors: [
            {
              field: 'name',
              rule: 'required',
              message: 'Name is required',
              severity: 'critical',
              impact: 30
            }
          ],
          warnings: [],
          qualityScore: 70,
          sourceReliability: 85
        }
      ];

      const sourceMetrics = new Map<string, SourceQualityMetrics>();

      const metrics = await qualityScorer.calculateQualityMetrics(
        'fighter',
        validationResults,
        sourceMetrics
      );

      expect(metrics.issuesSummary).toHaveLength(2);
      
      const nameIssue = metrics.issuesSummary.find(i => i.field === 'name');
      expect(nameIssue).toBeDefined();
      expect(nameIssue!.frequency).toBe(100); // 2/2 * 100
      expect(nameIssue!.severity).toBe('critical');

      const weightIssue = metrics.issuesSummary.find(i => i.field === 'weight');
      expect(weightIssue).toBeDefined();
      expect(weightIssue!.frequency).toBe(50); // 1/2 * 100
      expect(weightIssue!.severity).toBe('medium');
    });

    it('should store metrics in history', async () => {
      const validationResults: ValidationResult[] = [
        {
          isValid: true,
          errors: [],
          warnings: [],
          qualityScore: 90,
          sourceReliability: 85
        }
      ];

      const sourceMetrics = new Map<string, SourceQualityMetrics>();

      await qualityScorer.calculateQualityMetrics('fighter', validationResults, sourceMetrics);
      await qualityScorer.calculateQualityMetrics('fighter', validationResults, sourceMetrics);

      const trend = qualityScorer.getQualityTrend('fighter');
      expect(trend).toBeDefined();
      expect(trend.direction).toBe('stable'); // Same scores
    });
  });

  describe('generateQualityReport', () => {
    beforeEach(async () => {
      // Add some test data
      const validationResults: ValidationResult[] = [
        {
          isValid: true,
          errors: [],
          warnings: [],
          qualityScore: 85,
          sourceReliability: 80
        }
      ];

      const sourceMetrics = new Map<string, SourceQualityMetrics>([
        ['source-1', {
          sourceId: 'source-1',
          sourceName: 'Test Source',
          reliability: 80,
          recordsProcessed: 50,
          errorRate: 0.02,
          averageResponseTime: 1000,
          lastUpdated: new Date()
        }]
      ]);

      await qualityScorer.calculateQualityMetrics('fighter', validationResults, sourceMetrics);
      await qualityScorer.calculateQualityMetrics('fight', validationResults, sourceMetrics);
    });

    it('should generate comprehensive quality report', () => {
      const report = qualityScorer.generateQualityReport();

      expect(report.summary.overallScore).toBeGreaterThan(0);
      expect(report.summary.totalDataTypes).toBe(2);
      expect(report.summary.healthyDataTypes).toBeGreaterThan(0);
      expect(report.details).toHaveLength(2);
      expect(report.alerts).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it('should filter by data type', () => {
      const report = qualityScorer.generateQualityReport('fighter');

      expect(report.details).toHaveLength(1);
      expect(report.details[0].dataType).toBe('fighter');
    });

    it('should generate recommendations based on metrics', async () => {
      // Set low thresholds to trigger recommendations
      qualityScorer.setQualityThresholds({
        minQualityScore: 90, // Higher than our test data
        maxErrorRate: 0.01
      });

      // Add low quality data to trigger recommendations
      const lowQualityResults: ValidationResult[] = [
        {
          isValid: false,
          errors: [],
          warnings: [],
          qualityScore: 60, // Below threshold
          sourceReliability: 70
        }
      ];

      await qualityScorer.calculateQualityMetrics('lowQuality', lowQualityResults, new Map());

      const report = qualityScorer.generateQualityReport();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('alert management', () => {
    it('should generate alerts for low quality scores', async () => {
      const validationResults: ValidationResult[] = [
        {
          isValid: false,
          errors: [
            {
              field: 'name',
              rule: 'required',
              message: 'Name is required',
              severity: 'critical',
              impact: 50
            }
          ],
          warnings: [],
          qualityScore: 50, // Below default threshold of 80
          sourceReliability: 70
        }
      ];

      const sourceMetrics = new Map<string, SourceQualityMetrics>();

      await qualityScorer.calculateQualityMetrics('fighter', validationResults, sourceMetrics);

      const alerts = qualityScorer.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      
      const qualityAlert = alerts.find(a => a.type === 'quality_degradation');
      expect(qualityAlert).toBeDefined();
      expect(qualityAlert!.severity).toBe('high');
    });

    it('should generate alerts for unreliable sources', async () => {
      const validationResults: ValidationResult[] = [
        {
          isValid: true,
          errors: [],
          warnings: [],
          qualityScore: 85,
          sourceReliability: 80
        }
      ];

      const sourceMetrics = new Map<string, SourceQualityMetrics>([
        ['unreliable-source', {
          sourceId: 'unreliable-source',
          sourceName: 'Unreliable Source',
          reliability: 30, // Below default threshold of 70
          recordsProcessed: 10,
          errorRate: 0.15, // Above default threshold of 0.05
          averageResponseTime: 8000,
          lastUpdated: new Date()
        }]
      ]);

      await qualityScorer.calculateQualityMetrics('fighter', validationResults, sourceMetrics);

      const alerts = qualityScorer.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      
      const sourceAlert = alerts.find(a => a.type === 'source_failure');
      expect(sourceAlert).toBeDefined();
      expect(sourceAlert!.sourceId).toBe('unreliable-source');
    });

    it('should resolve alerts', async () => {
      // First generate an alert
      const validationResults: ValidationResult[] = [
        {
          isValid: false,
          errors: [],
          warnings: [],
          qualityScore: 50,
          sourceReliability: 70
        }
      ];

      await qualityScorer.calculateQualityMetrics('fighter', validationResults, new Map());

      const alerts = qualityScorer.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      const alertId = alerts[0].id;
      const resolved = qualityScorer.resolveAlert(alertId);

      expect(resolved).toBe(true);
      expect(qualityScorer.getActiveAlerts()).toHaveLength(alerts.length - 1);
    });

    it('should filter alerts by severity', async () => {
      // Generate alerts of different severities
      const criticalResults: ValidationResult[] = [
        {
          isValid: false,
          errors: [],
          warnings: [],
          qualityScore: 30, // Critical level
          sourceReliability: 70
        }
      ];

      const mediumResults: ValidationResult[] = [
        {
          isValid: false,
          errors: [],
          warnings: [],
          qualityScore: 60, // Medium level
          sourceReliability: 70
        }
      ];

      await qualityScorer.calculateQualityMetrics('fighter', criticalResults, new Map());
      await qualityScorer.calculateQualityMetrics('fight', mediumResults, new Map());

      const criticalAlerts = qualityScorer.getActiveAlerts('critical');
      const allAlerts = qualityScorer.getActiveAlerts();

      expect(criticalAlerts.length).toBeGreaterThan(0);
      expect(allAlerts.length).toBeGreaterThanOrEqual(criticalAlerts.length);
    });
  });

  describe('quality trends', () => {
    it('should calculate improving trend', async () => {
      const validationResults1: ValidationResult[] = [
        { isValid: true, errors: [], warnings: [], qualityScore: 70, sourceReliability: 80 }
      ];
      const validationResults2: ValidationResult[] = [
        { isValid: true, errors: [], warnings: [], qualityScore: 85, sourceReliability: 80 }
      ];

      await qualityScorer.calculateQualityMetrics('fighter', validationResults1, new Map());
      await qualityScorer.calculateQualityMetrics('fighter', validationResults2, new Map());

      const trend = qualityScorer.getQualityTrend('fighter');
      expect(trend.direction).toBe('improving');
      expect(trend.changePercent).toBeGreaterThan(0);
    });

    it('should calculate declining trend', async () => {
      const validationResults1: ValidationResult[] = [
        { isValid: true, errors: [], warnings: [], qualityScore: 90, sourceReliability: 80 }
      ];
      const validationResults2: ValidationResult[] = [
        { isValid: true, errors: [], warnings: [], qualityScore: 70, sourceReliability: 80 }
      ];

      await qualityScorer.calculateQualityMetrics('fighter', validationResults1, new Map());
      await qualityScorer.calculateQualityMetrics('fighter', validationResults2, new Map());

      const trend = qualityScorer.getQualityTrend('fighter');
      expect(trend.direction).toBe('declining');
      expect(trend.changePercent).toBeLessThan(0);
    });

    it('should calculate stable trend for small changes', async () => {
      const validationResults1: ValidationResult[] = [
        { isValid: true, errors: [], warnings: [], qualityScore: 85, sourceReliability: 80 }
      ];
      const validationResults2: ValidationResult[] = [
        { isValid: true, errors: [], warnings: [], qualityScore: 87, sourceReliability: 80 }
      ];

      await qualityScorer.calculateQualityMetrics('fighter', validationResults1, new Map());
      await qualityScorer.calculateQualityMetrics('fighter', validationResults2, new Map());

      const trend = qualityScorer.getQualityTrend('fighter');
      expect(trend.direction).toBe('stable');
    });

    it('should handle custom timeframes', () => {
      const trend = qualityScorer.getQualityTrend('nonexistent', 48);
      expect(trend.timeframe).toBe('48h');
      expect(trend.direction).toBe('stable');
      expect(trend.changePercent).toBe(0);
    });
  });

  describe('threshold management', () => {
    it('should update quality thresholds', () => {
      const newThresholds = {
        minQualityScore: 90,
        maxErrorRate: 0.01,
        minSourceReliability: 85
      };

      qualityScorer.setQualityThresholds(newThresholds);

      // Verify thresholds are applied by generating alerts
      const validationResults: ValidationResult[] = [
        { isValid: true, errors: [], warnings: [], qualityScore: 85, sourceReliability: 80 }
      ];

      const sourceMetrics = new Map<string, SourceQualityMetrics>([
        ['test-source', {
          sourceId: 'test-source',
          sourceName: 'Test',
          reliability: 80, // Below new threshold of 85
          recordsProcessed: 10,
          errorRate: 0.005, // Below new threshold
          averageResponseTime: 1000,
          lastUpdated: new Date()
        }]
      ]);

      return qualityScorer.calculateQualityMetrics('fighter', validationResults, sourceMetrics)
        .then(() => {
          const alerts = qualityScorer.getActiveAlerts();
          expect(alerts.length).toBeGreaterThan(0);
        });
    });
  });
});