import { DatabaseManager } from '../database';
import { MetricsRepository } from '../repositories/metrics.repository';
import { OddsRepository } from '../repositories/odds.repository';
import { EventRepository } from '../repositories/event.repository';
import { FighterRepository } from '../repositories/fighter.repository';

export interface AnalyticsQuery {
  dataType: 'odds' | 'metrics' | 'events' | 'fighters';
  timeRange: {
    start: Date;
    end: Date;
  };
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count';
  groupBy?: string[];
  filters?: Record<string, any>;
}

export interface ReportConfiguration {
  name: string;
  description: string;
  schedule: string; // cron expression
  queries: AnalyticsQuery[];
  format: 'json' | 'csv' | 'pdf';
  recipients?: string[];
  enabled: boolean;
}

export interface AnalyticsResult {
  query: AnalyticsQuery;
  data: any[];
  metadata: {
    totalRecords: number;
    executionTime: number;
    generatedAt: Date;
  };
}

export interface TrendAnalysis {
  metric: string;
  timeWindow: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercentage: number;
  confidence: number;
  dataPoints: Array<{
    timestamp: Date;
    value: number;
  }>;
}

export interface PerformanceInsight {
  type: 'fighter_performance' | 'odds_movement' | 'betting_pattern';
  title: string;
  description: string;
  confidence: number;
  impact: 'high' | 'medium' | 'low';
  data: any;
  generatedAt: Date;
}

export interface DashboardMetrics {
  totalFights: number;
  totalFighters: number;
  totalEvents: number;
  avgPredictionAccuracy: number;
  totalOddsMovements: number;
  activeArbitrageOpportunities: number;
  dataQualityScore: number;
  systemHealth: 'healthy' | 'degraded' | 'unhealthy';
}

export class AnalyticsReportingService {
  private dbManager: DatabaseManager;
  private metricsRepo: MetricsRepository;
  private oddsRepo: OddsRepository;
  private eventRepo: EventRepository;
  private fighterRepo: FighterRepository;

  constructor() {
    this.dbManager = DatabaseManager.getInstance();
    this.metricsRepo = new MetricsRepository();
    this.oddsRepo = new OddsRepository();
    this.eventRepo = new EventRepository();
    this.fighterRepo = new FighterRepository();
  }

  // Analytics Query Operations

  async executeAnalyticsQuery(query: AnalyticsQuery): Promise<AnalyticsResult> {
    const startTime = Date.now();
    
    try {
      let data: any[] = [];
      
      switch (query.dataType) {
        case 'odds':
          data = await this.queryOddsAnalytics(query);
          break;
        case 'metrics':
          data = await this.queryMetricsAnalytics(query);
          break;
        case 'events':
          data = await this.queryEventsAnalytics(query);
          break;
        case 'fighters':
          data = await this.queryFightersAnalytics(query);
          break;
        default:
          throw new Error(`Unsupported data type: ${query.dataType}`);
      }

      const executionTime = Date.now() - startTime;

      return {
        query,
        data,
        metadata: {
          totalRecords: data.length,
          executionTime,
          generatedAt: new Date(),
        },
      };
    } catch (error) {
      console.error('Error executing analytics query:', error);
      throw new Error(`Failed to execute analytics query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateTrendAnalysis(metric: string, timeWindow: string, fighterId?: string): Promise<TrendAnalysis> {
    try {
      const influxDB = this.dbManager.getInfluxDB();
      const queryApi = influxDB.getQueryApi();

      let query = `
        from(bucket: "ufc-data")
        |> range(start: -${timeWindow})
        |> filter(fn: (r) => r._measurement == "fighter_performance")
        |> filter(fn: (r) => r._field == "${metric}")
      `;

      if (fighterId) {
        query += `|> filter(fn: (r) => r.fighterId == "${fighterId}")`;
      }

      query += `
        |> aggregateWindow(every: 1w, fn: mean, createEmpty: false)
        |> sort(columns: ["_time"])
      `;

      const results = await queryApi.collectRows(query);
      
      if (results.length < 2) {
        return {
          metric,
          timeWindow,
          trend: 'stable',
          changePercentage: 0,
          confidence: 0,
          dataPoints: [],
        };
      }

      const dataPoints = results.map(row => ({
        timestamp: new Date(row._time),
        value: row._value || 0,
      }));

      // Calculate trend
      const firstValue = dataPoints[0].value;
      const lastValue = dataPoints[dataPoints.length - 1].value;
      const changePercentage = firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;
      
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (Math.abs(changePercentage) > 5) {
        trend = changePercentage > 0 ? 'increasing' : 'decreasing';
      }

      // Calculate confidence based on data consistency
      const confidence = this.calculateTrendConfidence(dataPoints);

      return {
        metric,
        timeWindow,
        trend,
        changePercentage,
        confidence,
        dataPoints,
      };
    } catch (error) {
      console.error('Error generating trend analysis:', error);
      throw new Error(`Failed to generate trend analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generatePerformanceInsights(timeWindow: string = '30d'): Promise<PerformanceInsight[]> {
    try {
      const insights: PerformanceInsight[] = [];

      // Fighter performance insights
      const fighterInsights = await this.generateFighterInsights(timeWindow);
      insights.push(...fighterInsights);

      // Odds movement insights
      const oddsInsights = await this.generateOddsInsights(timeWindow);
      insights.push(...oddsInsights);

      // Betting pattern insights
      const bettingInsights = await this.generateBettingInsights(timeWindow);
      insights.push(...bettingInsights);

      return insights.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      console.error('Error generating performance insights:', error);
      throw new Error(`Failed to generate performance insights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    try {
      const [
        totalEvents,
        totalFighters,
        predictionAccuracy,
        oddsMovements,
        arbitrageOpportunities,
        dataQuality,
        systemHealth
      ] = await Promise.all([
        this.getTotalEvents(),
        this.getTotalFighters(),
        this.getAveragePredictionAccuracy(),
        this.getTotalOddsMovements(),
        this.getActiveArbitrageOpportunities(),
        this.getDataQualityScore(),
        this.getSystemHealthStatus(),
      ]);

      // Calculate total fights from events
      const totalFights = await this.getTotalFights();

      return {
        totalFights,
        totalFighters,
        totalEvents,
        avgPredictionAccuracy: predictionAccuracy,
        totalOddsMovements: oddsMovements,
        activeArbitrageOpportunities: arbitrageOpportunities,
        dataQualityScore: dataQuality,
        systemHealth,
      };
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      throw new Error(`Failed to get dashboard metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Report Generation

  async generateReport(config: ReportConfiguration): Promise<string> {
    try {
      const reportId = `report_${Date.now()}`;
      const results: AnalyticsResult[] = [];

      // Execute all queries in the report
      for (const query of config.queries) {
        const result = await this.executeAnalyticsQuery(query);
        results.push(result);
      }

      // Format report based on configuration
      const reportData = await this.formatReport(results, config.format);

      // Store report metadata
      const influxDB = this.dbManager.getInfluxDB();
      const writeApi = influxDB.getWriteApi();
      
      const reportPoint = influxDB.createPoint('generated_reports')
        .tag('reportId', reportId)
        .tag('reportName', config.name)
        .tag('format', config.format)
        .intField('queryCount', config.queries.length)
        .intField('totalRecords', results.reduce((sum, r) => sum + r.metadata.totalRecords, 0))
        .timestamp(new Date());

      await writeApi.writePoint(reportPoint);
      await writeApi.flush();

      console.log(`Report ${reportId} generated successfully`);
      return reportId;
    } catch (error) {
      console.error('Error generating report:', error);
      throw new Error(`Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async scheduleReport(config: ReportConfiguration): Promise<string> {
    try {
      const scheduleId = `schedule_${Date.now()}`;

      // Store scheduled report configuration
      const mongodb = this.dbManager.getMongoDB();
      const db = mongodb.getDb();
      const collection = db.collection('scheduled_reports');

      await collection.insertOne({
        scheduleId,
        ...config,
        createdAt: new Date(),
        lastRun: null,
        nextRun: this.calculateNextRun(config.schedule),
      });

      console.log(`Report scheduled with ID: ${scheduleId}`);
      return scheduleId;
    } catch (error) {
      console.error('Error scheduling report:', error);
      throw new Error(`Failed to schedule report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private Helper Methods

  private async queryOddsAnalytics(query: AnalyticsQuery): Promise<any[]> {
    const options = {
      startTime: query.timeRange.start,
      endTime: query.timeRange.end,
      ...query.filters,
    };

    return await this.oddsRepo.getOddsHistory(options);
  }

  private async queryMetricsAnalytics(query: AnalyticsQuery): Promise<any[]> {
    const options = {
      startTime: query.timeRange.start,
      endTime: query.timeRange.end,
      ...query.filters,
    };

    return await this.metricsRepo.getFighterMetrics(options);
  }

  private async queryEventsAnalytics(query: AnalyticsQuery): Promise<any[]> {
    return await this.eventRepo.getEventsByDateRange(
      query.timeRange.start,
      query.timeRange.end
    );
  }

  private async queryFightersAnalytics(query: AnalyticsQuery): Promise<any[]> {
    const searchOptions = {
      ...query.filters,
      limit: 1000, // Default limit
    };

    return await this.fighterRepo.search(searchOptions);
  }

  private async generateFighterInsights(timeWindow: string): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];

    // Example: Top performing fighters
    const topPerformers = await this.getTopPerformingFighters(timeWindow);
    
    if (topPerformers.length > 0) {
      insights.push({
        type: 'fighter_performance',
        title: 'Top Performing Fighters',
        description: `${topPerformers.length} fighters showing exceptional performance in the last ${timeWindow}`,
        confidence: 0.85,
        impact: 'high',
        data: topPerformers,
        generatedAt: new Date(),
      });
    }

    return insights;
  }

  private async generateOddsInsights(timeWindow: string): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];

    // Example: Significant odds movements
    const significantMovements = await this.getSignificantOddsMovements(timeWindow);
    
    if (significantMovements.length > 0) {
      insights.push({
        type: 'odds_movement',
        title: 'Significant Odds Movements',
        description: `${significantMovements.length} significant odds movements detected`,
        confidence: 0.9,
        impact: 'high',
        data: significantMovements,
        generatedAt: new Date(),
      });
    }

    return insights;
  }

  private async generateBettingInsights(timeWindow: string): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];

    // Example: Arbitrage opportunities
    const arbitrageOpps = await this.oddsRepo.getArbitrageOpportunities();
    
    if (arbitrageOpps.length > 0) {
      insights.push({
        type: 'betting_pattern',
        title: 'Active Arbitrage Opportunities',
        description: `${arbitrageOpps.length} arbitrage opportunities currently available`,
        confidence: 0.95,
        impact: 'high',
        data: arbitrageOpps,
        generatedAt: new Date(),
      });
    }

    return insights;
  }

  private calculateTrendConfidence(dataPoints: Array<{ timestamp: Date; value: number }>): number {
    if (dataPoints.length < 3) return 0;

    // Calculate variance to determine confidence
    const values = dataPoints.map(dp => dp.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    // Lower variance = higher confidence
    const normalizedVariance = Math.min(stdDev / mean, 1);
    return Math.max(0, 1 - normalizedVariance);
  }

  private async formatReport(results: AnalyticsResult[], format: string): Promise<any> {
    switch (format) {
      case 'json':
        return JSON.stringify(results, null, 2);
      case 'csv':
        return this.convertToCSV(results);
      case 'pdf':
        return this.generatePDF(results);
      default:
        return results;
    }
  }

  private convertToCSV(results: AnalyticsResult[]): string {
    // Simplified CSV conversion
    let csv = 'Query,Data Type,Records,Execution Time\n';
    
    results.forEach(result => {
      csv += `"${result.query.dataType}","${result.query.dataType}",${result.metadata.totalRecords},${result.metadata.executionTime}\n`;
    });
    
    return csv;
  }

  private generatePDF(results: AnalyticsResult[]): Buffer {
    // Simplified PDF generation - in real implementation, use a PDF library
    const content = JSON.stringify(results, null, 2);
    return Buffer.from(content);
  }

  private calculateNextRun(schedule: string): Date {
    // Simplified cron calculation - in real implementation, use a cron library
    const now = new Date();
    now.setHours(now.getHours() + 24); // Default to 24 hours from now
    return now;
  }

  // Dashboard Metric Helpers

  private async getTotalEvents(): Promise<number> {
    return await this.eventRepo.count();
  }

  private async getTotalFighters(): Promise<number> {
    return await this.fighterRepo.count();
  }

  private async getTotalFights(): Promise<number> {
    return await this.fightRepo.count();
  }

  private async getAveragePredictionAccuracy(): Promise<number> {
    // Simplified - in real implementation, calculate from prediction results
    return 72.5;
  }

  private async getTotalOddsMovements(): Promise<number> {
    try {
      const influxDB = this.dbManager.getInfluxDB();
      const queryApi = influxDB.getQueryApi();

      const query = `
        from(bucket: "ufc-data")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "odds_movements")
        |> count()
      `;

      const results = await queryApi.collectRows(query);
      return results.reduce((sum, row) => sum + (row._value || 0), 0);
    } catch (error) {
      return 0;
    }
  }

  private async getActiveArbitrageOpportunities(): Promise<number> {
    const opportunities = await this.oddsRepo.getArbitrageOpportunities();
    return opportunities.length;
  }

  private async getDataQualityScore(): Promise<number> {
    // Simplified - in real implementation, calculate from data quality metrics
    return 96.8;
  }

  private async getSystemHealthStatus(): Promise<'healthy' | 'degraded' | 'unhealthy'> {
    const healthStatus = await this.dbManager.healthCheck();
    return healthStatus.overall;
  }

  private async getTopPerformingFighters(timeWindow: string): Promise<any[]> {
    // Simplified implementation
    return [];
  }

  private async getSignificantOddsMovements(timeWindow: string): Promise<any[]> {
    // Simplified implementation
    return [];
  }
}