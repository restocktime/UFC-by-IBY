import { QualityScorer, QualityMetrics, QualityAlert } from './quality-scorer';

export interface QualityReportConfig {
  schedule: 'hourly' | 'daily' | 'weekly';
  recipients: string[];
  includeCharts: boolean;
  alertThresholds: {
    criticalAlerts: number;
    qualityScoreThreshold: number;
  };
}

export interface QualityReport {
  id: string;
  timestamp: Date;
  period: {
    start: Date;
    end: Date;
  };
  summary: QualityReportSummary;
  dataTypeMetrics: QualityMetrics[];
  alerts: QualityAlert[];
  trends: QualityTrendSummary[];
  recommendations: string[];
  charts?: QualityChartData[];
}

export interface QualityReportSummary {
  overallHealthScore: number;
  totalDataProcessed: number;
  dataQualityTrend: 'improving' | 'declining' | 'stable';
  criticalIssuesCount: number;
  sourceReliabilityAverage: number;
}

export interface QualityTrendSummary {
  dataType: string;
  currentScore: number;
  previousScore: number;
  changePercent: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface QualityChartData {
  type: 'line' | 'bar' | 'pie';
  title: string;
  data: any[];
  labels: string[];
}

export interface AlertNotification {
  id: string;
  type: 'email' | 'slack' | 'webhook';
  recipients: string[];
  subject: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
}

export class QualityReporter {
  private qualityScorer: QualityScorer;
  private reportConfig: QualityReportConfig;
  private reportHistory: Map<string, QualityReport>;
  private notificationQueue: AlertNotification[];

  constructor(qualityScorer: QualityScorer) {
    this.qualityScorer = qualityScorer;
    this.reportHistory = new Map();
    this.notificationQueue = [];
    this.reportConfig = {
      schedule: 'daily',
      recipients: [],
      includeCharts: true,
      alertThresholds: {
        criticalAlerts: 3,
        qualityScoreThreshold: 70
      }
    };
  }

  /**
   * Generate comprehensive quality report
   */
  async generateReport(
    startDate?: Date,
    endDate?: Date,
    dataTypes?: string[]
  ): Promise<QualityReport> {
    const reportId = `report_${Date.now()}`;
    const timestamp = new Date();
    const period = {
      start: startDate || new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      end: endDate || new Date()
    };

    console.log(`Generating quality report ${reportId} for period ${period.start} to ${period.end}`);

    // Get quality data
    const qualityData = this.qualityScorer.generateQualityReport();
    const filteredMetrics = dataTypes 
      ? qualityData.details.filter(m => dataTypes.includes(m.dataType))
      : qualityData.details;

    // Calculate summary
    const summary = this.calculateReportSummary(filteredMetrics, qualityData.alerts);

    // Generate trends
    const trends = this.calculateTrendSummaries(filteredMetrics);

    // Generate charts if enabled
    const charts = this.reportConfig.includeCharts 
      ? this.generateChartData(filteredMetrics, qualityData.alerts)
      : undefined;

    const report: QualityReport = {
      id: reportId,
      timestamp,
      period,
      summary,
      dataTypeMetrics: filteredMetrics,
      alerts: qualityData.alerts,
      trends,
      recommendations: qualityData.recommendations,
      charts
    };

    // Store report
    this.reportHistory.set(reportId, report);

    // Check if alerts need to be sent
    await this.checkAlertConditions(report);

    console.log(`Generated quality report ${reportId} with ${filteredMetrics.length} data types`);

    return report;
  }

  /**
   * Schedule automated reports
   */
  scheduleReports(config: QualityReportConfig): void {
    this.reportConfig = config;
    console.log(`Scheduled quality reports: ${config.schedule}`, config);

    // In a real implementation, this would set up cron jobs or scheduled tasks
    // For now, we'll just store the configuration
  }

  /**
   * Send immediate alert for critical issues
   */
  async sendImmediateAlert(alert: QualityAlert): Promise<void> {
    if (alert.severity === 'critical' || alert.severity === 'high') {
      const notification: AlertNotification = {
        id: `alert_${Date.now()}`,
        type: 'email', // Default to email, could be configurable
        recipients: this.reportConfig.recipients,
        subject: `Data Quality Alert: ${alert.type}`,
        message: this.formatAlertMessage(alert),
        priority: alert.severity === 'critical' ? 'urgent' : 'high',
        timestamp: new Date()
      };

      this.notificationQueue.push(notification);
      await this.processNotificationQueue();
    }
  }

  /**
   * Get report history
   */
  getReportHistory(limit: number = 10): QualityReport[] {
    const reports = Array.from(this.reportHistory.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    return reports;
  }

  /**
   * Export report to different formats
   */
  exportReport(reportId: string, format: 'json' | 'csv' | 'pdf'): string | Buffer {
    const report = this.reportHistory.get(reportId);
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      
      case 'csv':
        return this.convertReportToCSV(report);
      
      case 'pdf':
        // In a real implementation, this would generate a PDF
        return Buffer.from('PDF generation not implemented');
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Get quality dashboard data
   */
  getDashboardData(): {
    currentHealth: number;
    activeAlerts: number;
    dataTypesMonitored: number;
    recentTrends: QualityTrendSummary[];
    topIssues: Array<{
      type: string;
      count: number;
      impact: number;
    }>;
  } {
    const qualityData = this.qualityScorer.generateQualityReport();
    const activeAlerts = qualityData.alerts.length;
    const dataTypesMonitored = qualityData.details.length;
    
    const currentHealth = qualityData.details.length > 0
      ? qualityData.details.reduce((sum, m) => sum + m.averageQualityScore, 0) / qualityData.details.length
      : 0;

    const recentTrends = this.calculateTrendSummaries(qualityData.details);

    // Aggregate top issues across all data types
    const issueMap = new Map<string, { count: number; impact: number }>();
    
    for (const metrics of qualityData.details) {
      for (const issue of metrics.issuesSummary) {
        const existing = issueMap.get(issue.type) || { count: 0, impact: 0 };
        existing.count += 1;
        existing.impact += issue.impact;
        issueMap.set(issue.type, existing);
      }
    }

    const topIssues = Array.from(issueMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 5);

    return {
      currentHealth: Math.round(currentHealth),
      activeAlerts,
      dataTypesMonitored,
      recentTrends,
      topIssues
    };
  }

  private calculateReportSummary(
    metrics: QualityMetrics[],
    alerts: QualityAlert[]
  ): QualityReportSummary {
    const overallHealthScore = metrics.length > 0
      ? Math.round(metrics.reduce((sum, m) => sum + m.averageQualityScore, 0) / metrics.length)
      : 0;

    const totalDataProcessed = metrics.reduce((sum, m) => sum + m.totalRecords, 0);
    const criticalIssuesCount = alerts.filter(a => a.severity === 'critical').length;
    
    const sourceReliabilityAverage = metrics.length > 0
      ? Math.round(
          metrics.reduce((sum, m) => 
            sum + (m.sourceBreakdown.reduce((s, sb) => s + sb.reliability, 0) / m.sourceBreakdown.length), 0
          ) / metrics.length
        )
      : 0;

    // Determine overall trend
    const trendScores = metrics.map(m => {
      const trend = this.qualityScorer.getQualityTrend(m.dataType);
      return trend.changePercent;
    });
    
    const avgTrendChange = trendScores.reduce((sum, score) => sum + score, 0) / trendScores.length;
    const dataQualityTrend: QualityReportSummary['dataQualityTrend'] = 
      Math.abs(avgTrendChange) < 2 ? 'stable' : 
      avgTrendChange > 0 ? 'improving' : 'declining';

    return {
      overallHealthScore,
      totalDataProcessed,
      dataQualityTrend,
      criticalIssuesCount,
      sourceReliabilityAverage
    };
  }

  private calculateTrendSummaries(metrics: QualityMetrics[]): QualityTrendSummary[] {
    return metrics.map(m => {
      const trend = this.qualityScorer.getQualityTrend(m.dataType);
      
      return {
        dataType: m.dataType,
        currentScore: m.averageQualityScore,
        previousScore: Math.round(m.averageQualityScore - (m.averageQualityScore * trend.changePercent / 100)),
        changePercent: trend.changePercent,
        trend: trend.direction
      };
    });
  }

  private generateChartData(metrics: QualityMetrics[], alerts: QualityAlert[]): QualityChartData[] {
    const charts: QualityChartData[] = [];

    // Quality score by data type
    charts.push({
      type: 'bar',
      title: 'Quality Score by Data Type',
      data: metrics.map(m => m.averageQualityScore),
      labels: metrics.map(m => m.dataType)
    });

    // Alert distribution by severity
    const alertCounts = alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    charts.push({
      type: 'pie',
      title: 'Alerts by Severity',
      data: Object.values(alertCounts),
      labels: Object.keys(alertCounts)
    });

    // Source reliability comparison
    const sourceData = new Map<string, number[]>();
    
    for (const metric of metrics) {
      for (const source of metric.sourceBreakdown) {
        if (!sourceData.has(source.sourceId)) {
          sourceData.set(source.sourceId, []);
        }
        sourceData.get(source.sourceId)!.push(source.reliability);
      }
    }

    const avgSourceReliability = Array.from(sourceData.entries()).map(([sourceId, reliabilities]) => ({
      source: sourceId,
      avgReliability: reliabilities.reduce((sum, r) => sum + r, 0) / reliabilities.length
    }));

    charts.push({
      type: 'bar',
      title: 'Average Source Reliability',
      data: avgSourceReliability.map(s => s.avgReliability),
      labels: avgSourceReliability.map(s => s.source)
    });

    return charts;
  }

  private async checkAlertConditions(report: QualityReport): Promise<void> {
    const criticalAlerts = report.alerts.filter(a => a.severity === 'critical').length;
    const lowQualityTypes = report.dataTypeMetrics.filter(
      m => m.averageQualityScore < this.reportConfig.alertThresholds.qualityScoreThreshold
    ).length;

    // Send alert if thresholds exceeded
    if (criticalAlerts >= this.reportConfig.alertThresholds.criticalAlerts) {
      const notification: AlertNotification = {
        id: `threshold_alert_${Date.now()}`,
        type: 'email',
        recipients: this.reportConfig.recipients,
        subject: 'Data Quality Threshold Exceeded',
        message: `Critical alert threshold exceeded: ${criticalAlerts} critical alerts detected`,
        priority: 'urgent',
        timestamp: new Date()
      };

      this.notificationQueue.push(notification);
    }

    if (lowQualityTypes > 0) {
      const notification: AlertNotification = {
        id: `quality_alert_${Date.now()}`,
        type: 'email',
        recipients: this.reportConfig.recipients,
        subject: 'Data Quality Below Threshold',
        message: `${lowQualityTypes} data types have quality scores below ${this.reportConfig.alertThresholds.qualityScoreThreshold}%`,
        priority: 'high',
        timestamp: new Date()
      };

      this.notificationQueue.push(notification);
    }

    await this.processNotificationQueue();
  }

  private formatAlertMessage(alert: QualityAlert): string {
    return `
Data Quality Alert

Type: ${alert.type}
Severity: ${alert.severity}
Data Type: ${alert.dataType}
${alert.sourceId ? `Source: ${alert.sourceId}` : ''}

Message: ${alert.message}

Threshold: ${alert.threshold}
Actual Value: ${alert.actualValue}

Recommended Actions:
${alert.actionRequired.map(action => `- ${action}`).join('\n')}

Timestamp: ${alert.timestamp.toISOString()}
Alert ID: ${alert.id}
    `.trim();
  }

  private async processNotificationQueue(): Promise<void> {
    while (this.notificationQueue.length > 0) {
      const notification = this.notificationQueue.shift()!;
      
      try {
        // In a real implementation, this would send actual notifications
        console.log(`Sending notification: ${notification.subject}`, {
          type: notification.type,
          recipients: notification.recipients,
          priority: notification.priority
        });
        
        // Simulate notification sending
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Failed to send notification ${notification.id}:`, error);
        // Could implement retry logic here
      }
    }
  }

  private convertReportToCSV(report: QualityReport): string {
    const headers = [
      'Data Type',
      'Quality Score',
      'Total Records',
      'Valid Records',
      'Error Rate',
      'Trend Direction',
      'Trend Change %'
    ];

    const rows = report.dataTypeMetrics.map(metric => {
      const trend = report.trends.find(t => t.dataType === metric.dataType);
      const errorRate = ((metric.totalRecords - metric.validRecords) / metric.totalRecords * 100).toFixed(2);
      
      return [
        metric.dataType,
        metric.averageQualityScore.toString(),
        metric.totalRecords.toString(),
        metric.validRecords.toString(),
        `${errorRate}%`,
        trend?.trend || 'stable',
        trend?.changePercent.toString() || '0'
      ];
    });

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}