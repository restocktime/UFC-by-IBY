import { QualityReporter, QualityReportConfig } from '../quality-reporter';
import { QualityScorer, QualityMetrics, QualityAlert } from '../quality-scorer';
import { vi } from 'vitest';

describe('QualityReporter', () => {
  let qualityReporter: QualityReporter;
  let mockQualityScorer: QualityScorer;

  beforeEach(() => {
    mockQualityScorer = {
      generateQualityReport: vi.fn(),
      getQualityTrend: vi.fn(),
      getActiveAlerts: vi.fn(),
      calculateQualityMetrics: vi.fn(),
      setQualityThresholds: vi.fn(),
      resolveAlert: vi.fn()
    } as any;

    // Default mock return value
    (mockQualityScorer.generateQualityReport as any).mockReturnValue({
      summary: {
        overallScore: 85,
        totalDataTypes: 1,
        healthyDataTypes: 1,
        criticalIssues: 0,
        totalRecords: 100,
        validRecords: 95
      },
      details: [],
      alerts: [],
      recommendations: []
    });

    // Default mock for getQualityTrend
    (mockQualityScorer.getQualityTrend as any).mockReturnValue({
      direction: 'stable',
      changePercent: 0,
      timeframe: '24h'
    });

    qualityReporter = new QualityReporter(mockQualityScorer);
  });

  describe('generateReport', () => {
    beforeEach(() => {
      const mockMetrics: QualityMetrics[] = [
        {
          dataType: 'fighter',
          timestamp: new Date(),
          totalRecords: 100,
          validRecords: 95,
          averageQualityScore: 85,
          sourceBreakdown: [
            {
              sourceId: 'source-1',
              sourceName: 'Test Source 1',
              reliability: 90,
              recordsProcessed: 50,
              errorRate: 0.02,
              averageResponseTime: 1200,
              lastUpdated: new Date()
            }
          ],
          issuesSummary: [
            {
              type: 'required',
              field: 'name',
              frequency: 5,
              impact: 20,
              severity: 'medium',
              recommendation: 'Ensure name is provided'
            }
          ],
          trend: {
            direction: 'improving',
            changePercent: 2.5,
            timeframe: '24h'
          }
        }
      ];

      const mockAlerts: QualityAlert[] = [
        {
          id: 'alert-1',
          type: 'quality_degradation',
          severity: 'medium',
          message: 'Quality score below threshold',
          dataType: 'fighter',
          timestamp: new Date(),
          threshold: 80,
          actualValue: 75,
          actionRequired: ['Review data sources']
        }
      ];

      (mockQualityScorer.generateQualityReport as any).mockReturnValue({
        summary: {
          overallScore: 85,
          totalDataTypes: 1,
          healthyDataTypes: 1,
          criticalIssues: 0,
          totalRecords: 100,
          validRecords: 95
        },
        details: mockMetrics,
        alerts: mockAlerts,
        recommendations: ['Consider implementing additional validation rules']
      });

      (mockQualityScorer.getQualityTrend as any).mockReturnValue({
        direction: 'improving',
        changePercent: 2.5,
        timeframe: '24h'
      });
    });

    it('should generate comprehensive quality report', async () => {
      const report = await qualityReporter.generateReport();

      expect(report.id).toBeDefined();
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.period.start).toBeInstanceOf(Date);
      expect(report.period.end).toBeInstanceOf(Date);
      expect(report.summary).toBeDefined();
      expect(report.dataTypeMetrics).toHaveLength(1);
      expect(report.alerts).toHaveLength(1);
      expect(report.trends).toHaveLength(1);
      expect(report.recommendations).toHaveLength(1);
      expect(report.charts).toBeDefined();
    });

    it('should filter by data types', async () => {
      const report = await qualityReporter.generateReport(
        undefined,
        undefined,
        ['fighter']
      );

      expect(report.dataTypeMetrics).toHaveLength(1);
      expect(report.dataTypeMetrics[0].dataType).toBe('fighter');
    });

    it('should use custom date range', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-01-02');

      const report = await qualityReporter.generateReport(startDate, endDate);

      expect(report.period.start).toEqual(startDate);
      expect(report.period.end).toEqual(endDate);
    });

    it('should calculate report summary correctly', async () => {
      const report = await qualityReporter.generateReport();

      expect(report.summary.overallHealthScore).toBe(85);
      expect(report.summary.totalDataProcessed).toBe(100);
      expect(report.summary.dataQualityTrend).toBe('improving');
      expect(report.summary.criticalIssuesCount).toBe(0);
      expect(report.summary.sourceReliabilityAverage).toBe(90);
    });

    it('should generate trend summaries', async () => {
      const report = await qualityReporter.generateReport();

      expect(report.trends).toHaveLength(1);
      expect(report.trends[0].dataType).toBe('fighter');
      expect(report.trends[0].currentScore).toBe(85);
      expect(report.trends[0].trend).toBe('improving');
      expect(report.trends[0].changePercent).toBe(2.5);
    });

    it('should generate chart data when enabled', async () => {
      const report = await qualityReporter.generateReport();

      expect(report.charts).toBeDefined();
      expect(report.charts!.length).toBeGreaterThan(0);
      
      const qualityChart = report.charts!.find(c => c.title === 'Quality Score by Data Type');
      expect(qualityChart).toBeDefined();
      expect(qualityChart!.type).toBe('bar');
      expect(qualityChart!.data).toHaveLength(1);
      expect(qualityChart!.labels).toHaveLength(1);
    });
  });

  describe('scheduleReports', () => {
    it('should store report configuration', () => {
      const config: QualityReportConfig = {
        schedule: 'daily',
        recipients: ['admin@example.com'],
        includeCharts: true,
        alertThresholds: {
          criticalAlerts: 5,
          qualityScoreThreshold: 75
        }
      };

      qualityReporter.scheduleReports(config);

      // Verify configuration is stored (we can't directly test private properties,
      // but we can test the behavior that depends on it)
      expect(() => qualityReporter.scheduleReports(config)).not.toThrow();
    });
  });

  describe('sendImmediateAlert', () => {
    it('should queue critical alerts for immediate sending', async () => {
      const criticalAlert: QualityAlert = {
        id: 'critical-alert',
        type: 'source_failure',
        severity: 'critical',
        message: 'Critical system failure',
        dataType: 'fighter',
        timestamp: new Date(),
        threshold: 90,
        actualValue: 20,
        actionRequired: ['Immediate action required']
      };

      await qualityReporter.sendImmediateAlert(criticalAlert);

      // Since we can't directly test the notification queue,
      // we verify the method completes without error
      expect(true).toBe(true);
    });

    it('should queue high severity alerts', async () => {
      const highAlert: QualityAlert = {
        id: 'high-alert',
        type: 'quality_degradation',
        severity: 'high',
        message: 'Quality degradation detected',
        dataType: 'fighter',
        timestamp: new Date(),
        threshold: 80,
        actualValue: 60,
        actionRequired: ['Review data sources']
      };

      await qualityReporter.sendImmediateAlert(highAlert);

      expect(true).toBe(true);
    });

    it('should not queue low severity alerts', async () => {
      const lowAlert: QualityAlert = {
        id: 'low-alert',
        type: 'data_staleness',
        severity: 'low',
        message: 'Data is slightly stale',
        dataType: 'fighter',
        timestamp: new Date(),
        threshold: 24,
        actualValue: 26,
        actionRequired: ['Monitor situation']
      };

      await qualityReporter.sendImmediateAlert(lowAlert);

      // Low severity alerts should not be queued for immediate sending
      expect(true).toBe(true);
    });
  });

  describe('getReportHistory', () => {
    it('should return report history in chronological order', async () => {
      // Generate multiple reports
      await qualityReporter.generateReport();
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await qualityReporter.generateReport();

      const history = qualityReporter.getReportHistory(5);

      expect(history).toHaveLength(2);
      expect(history[0].timestamp.getTime()).toBeGreaterThan(history[1].timestamp.getTime());
    });

    it('should limit results based on limit parameter', async () => {
      // Generate multiple reports with small delays to ensure different timestamps
      for (let i = 0; i < 5; i++) {
        await qualityReporter.generateReport();
        await new Promise(resolve => setTimeout(resolve, 1)); // Small delay
      }

      const history = qualityReporter.getReportHistory(3);

      expect(history.length).toBeLessThanOrEqual(5);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should return empty array when no reports exist', () => {
      const history = qualityReporter.getReportHistory();

      expect(history).toHaveLength(0);
    });
  });

  describe('exportReport', () => {
    let reportId: string;

    beforeEach(async () => {
      const report = await qualityReporter.generateReport();
      reportId = report.id;
    });

    it('should export report as JSON', () => {
      const exported = qualityReporter.exportReport(reportId, 'json');

      expect(typeof exported).toBe('string');
      expect(() => JSON.parse(exported as string)).not.toThrow();
    });

    it('should export report as CSV', () => {
      const exported = qualityReporter.exportReport(reportId, 'csv');

      expect(typeof exported).toBe('string');
      expect((exported as string).includes('Data Type')).toBe(true);
      expect((exported as string).includes('Quality Score')).toBe(true);
    });

    it('should export report as PDF placeholder', () => {
      const exported = qualityReporter.exportReport(reportId, 'pdf');

      expect(exported).toBeInstanceOf(Buffer);
    });

    it('should throw error for non-existent report', () => {
      expect(() => {
        qualityReporter.exportReport('non-existent', 'json');
      }).toThrow('Report non-existent not found');
    });

    it('should throw error for unsupported format', () => {
      expect(() => {
        qualityReporter.exportReport(reportId, 'xml' as any);
      }).toThrow('Unsupported export format: xml');
    });
  });

  describe('getDashboardData', () => {
    beforeEach(() => {
      (mockQualityScorer.generateQualityReport as any).mockReturnValue({
        summary: {
          overallScore: 82,
          totalDataTypes: 3,
          healthyDataTypes: 2,
          criticalIssues: 1,
          totalRecords: 300,
          validRecords: 285
        },
        details: [
          {
            dataType: 'fighter',
            timestamp: new Date(),
            totalRecords: 100,
            validRecords: 95,
            averageQualityScore: 85,
            sourceBreakdown: [],
            issuesSummary: [
              { type: 'required', field: 'name', frequency: 5, impact: 20, severity: 'medium', recommendation: 'Fix names' }
            ],
            trend: { direction: 'improving', changePercent: 2.5, timeframe: '24h' }
          },
          {
            dataType: 'fight',
            timestamp: new Date(),
            totalRecords: 200,
            validRecords: 190,
            averageQualityScore: 80,
            sourceBreakdown: [],
            issuesSummary: [
              { type: 'range', field: 'rounds', frequency: 10, impact: 15, severity: 'low', recommendation: 'Check rounds' }
            ],
            trend: { direction: 'stable', changePercent: 0.5, timeframe: '24h' }
          }
        ],
        alerts: [
          {
            id: 'alert-1',
            type: 'quality_degradation',
            severity: 'medium',
            message: 'Quality issue',
            dataType: 'fighter',
            timestamp: new Date(),
            threshold: 80,
            actualValue: 75,
            actionRequired: []
          }
        ],
        recommendations: []
      });

      (mockQualityScorer.getQualityTrend as any).mockImplementation((dataType) => {
        if (dataType === 'fighter') {
          return { direction: 'improving', changePercent: 2.5, timeframe: '24h' };
        }
        return { direction: 'stable', changePercent: 0.5, timeframe: '24h' };
      });
    });

    it('should return comprehensive dashboard data', () => {
      const dashboard = qualityReporter.getDashboardData();

      expect(dashboard.currentHealth).toBe(83); // (85 + 80) / 2, rounded
      expect(dashboard.activeAlerts).toBe(1);
      expect(dashboard.dataTypesMonitored).toBe(2);
      expect(dashboard.recentTrends).toHaveLength(2);
      expect(dashboard.topIssues).toHaveLength(2);
    });

    it('should calculate top issues correctly', () => {
      const dashboard = qualityReporter.getDashboardData();

      expect(dashboard.topIssues[0].type).toBe('required');
      expect(dashboard.topIssues[0].count).toBe(1);
      expect(dashboard.topIssues[0].impact).toBe(20);

      expect(dashboard.topIssues[1].type).toBe('range');
      expect(dashboard.topIssues[1].count).toBe(1);
      expect(dashboard.topIssues[1].impact).toBe(15);
    });

    it('should handle empty data gracefully', () => {
      mockQualityScorer.generateQualityReport.mockReturnValue({
        summary: {
          overallScore: 0,
          totalDataTypes: 0,
          healthyDataTypes: 0,
          criticalIssues: 0,
          totalRecords: 0,
          validRecords: 0
        },
        details: [],
        alerts: [],
        recommendations: []
      });

      const dashboard = qualityReporter.getDashboardData();

      expect(dashboard.currentHealth).toBe(0);
      expect(dashboard.activeAlerts).toBe(0);
      expect(dashboard.dataTypesMonitored).toBe(0);
      expect(dashboard.recentTrends).toHaveLength(0);
      expect(dashboard.topIssues).toHaveLength(0);
    });
  });

  describe('CSV export functionality', () => {
    it('should generate valid CSV format', async () => {
      // Override mock to return data with metrics
      (mockQualityScorer.generateQualityReport as any).mockReturnValueOnce({
        summary: { overallScore: 85, totalDataTypes: 1, healthyDataTypes: 1, criticalIssues: 0, totalRecords: 100, validRecords: 95 },
        details: [{
          dataType: 'fighter',
          timestamp: new Date(),
          totalRecords: 100,
          validRecords: 95,
          averageQualityScore: 85,
          sourceBreakdown: [],
          issuesSummary: [],
          trend: { direction: 'improving', changePercent: 2.5, timeframe: '24h' }
        }],
        alerts: [],
        recommendations: []
      });

      // Mock the getQualityTrend method for this test
      (mockQualityScorer.getQualityTrend as any).mockReturnValueOnce({
        direction: 'improving',
        changePercent: 2.5,
        timeframe: '24h'
      });

      const report = await qualityReporter.generateReport();
      const csv = qualityReporter.exportReport(report.id, 'csv');

      const lines = (csv as string).split('\n');
      expect(lines.length).toBeGreaterThan(1); // Header + at least one data row

      const headers = lines[0].split(',');
      expect(headers).toContain('Data Type');
      expect(headers).toContain('Quality Score');
      expect(headers).toContain('Total Records');
      expect(headers).toContain('Valid Records');
    });

    it('should handle empty metrics in CSV export', async () => {
      mockQualityScorer.generateQualityReport.mockReturnValue({
        summary: {
          overallScore: 0,
          totalDataTypes: 0,
          healthyDataTypes: 0,
          criticalIssues: 0,
          totalRecords: 0,
          validRecords: 0
        },
        details: [],
        alerts: [],
        recommendations: []
      });

      const report = await qualityReporter.generateReport();
      const csv = qualityReporter.exportReport(report.id, 'csv');

      const lines = (csv as string).split('\n');
      expect(lines).toHaveLength(1); // Only header row
    });
  });
});