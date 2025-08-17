import { AnalyticsReportingService, AnalyticsQuery, ReportConfiguration, TrendAnalysis } from '../analytics-reporting.service';
import { DatabaseManager } from '../../database';
import { MetricsRepository } from '../../repositories/metrics.repository';
import { OddsRepository } from '../../repositories/odds.repository';
import { EventRepository } from '../../repositories/event.repository';
import { FighterRepository } from '../../repositories/fighter.repository';

// Mock dependencies
jest.mock('../../database');
jest.mock('../../repositories/metrics.repository');
jest.mock('../../repositories/odds.repository');
jest.mock('../../repositories/event.repository');
jest.mock('../../repositories/fighter.repository');

describe('AnalyticsReportingService', () => {
  let service: AnalyticsReportingService;
  let mockDbManager: jest.Mocked<DatabaseManager>;
  let mockMetricsRepo: jest.Mocked<MetricsRepository>;
  let mockOddsRepo: jest.Mocked<OddsRepository>;
  let mockEventRepo: jest.Mocked<EventRepository>;
  let mockFighterRepo: jest.Mocked<FighterRepository>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock DatabaseManager
    mockDbManager = {
      getInstance: jest.fn(),
      getInfluxDB: jest.fn(),
      getMongoDB: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    // Mock InfluxDB
    const mockInfluxDB = {
      getWriteApi: jest.fn().mockReturnValue({
        writePoint: jest.fn(),
        flush: jest.fn(),
      }),
      getQueryApi: jest.fn().mockReturnValue({
        collectRows: jest.fn(),
      }),
      createPoint: jest.fn().mockReturnValue({
        tag: jest.fn().mockReturnThis(),
        stringField: jest.fn().mockReturnThis(),
        intField: jest.fn().mockReturnThis(),
        floatField: jest.fn().mockReturnThis(),
        timestamp: jest.fn().mockReturnThis(),
      }),
    };

    mockDbManager.getInfluxDB.mockReturnValue(mockInfluxDB as any);

    // Mock MongoDB
    const mockMongoDB = {
      getDb: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          insertOne: jest.fn(),
        }),
      }),
    };

    mockDbManager.getMongoDB.mockReturnValue(mockMongoDB as any);
    mockDbManager.healthCheck.mockResolvedValue({ overall: 'healthy' } as any);

    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDbManager);

    // Mock repositories
    mockMetricsRepo = {
      getFighterMetrics: jest.fn(),
    } as any;

    mockOddsRepo = {
      getOddsHistory: jest.fn(),
      getArbitrageOpportunities: jest.fn(),
    } as any;

    mockEventRepo = {
      getEventsByDateRange: jest.fn(),
      count: jest.fn(),
    } as any;

    mockFighterRepo = {
      search: jest.fn(),
      count: jest.fn(),
    } as any;

    // Create service instance
    service = new AnalyticsReportingService();
  });

  describe('executeAnalyticsQuery', () => {
    it('should execute odds analytics query successfully', async () => {
      const query: AnalyticsQuery = {
        dataType: 'odds',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-02-01'),
        },
        aggregation: 'avg',
      };

      const mockOddsData = [
        { fightId: '1', odds: { moneyline: [150, -170] } },
        { fightId: '2', odds: { moneyline: [200, -220] } },
      ];

      mockOddsRepo.getOddsHistory.mockResolvedValue(mockOddsData as any);

      const result = await service.executeAnalyticsQuery(query);

      expect(result.query).toEqual(query);
      expect(result.data).toEqual(mockOddsData);
      expect(result.metadata.totalRecords).toBe(2);
      expect(result.metadata.executionTime).toBeGreaterThan(0);
      expect(mockOddsRepo.getOddsHistory).toHaveBeenCalledWith({
        startTime: query.timeRange.start,
        endTime: query.timeRange.end,
      });
    });

    it('should execute metrics analytics query successfully', async () => {
      const query: AnalyticsQuery = {
        dataType: 'metrics',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-02-01'),
        },
        aggregation: 'sum',
      };

      const mockMetricsData = [
        { fighterId: '1', metrics: { strikingAccuracy: 0.65 } },
        { fighterId: '2', metrics: { strikingAccuracy: 0.72 } },
      ];

      mockMetricsRepo.getFighterMetrics.mockResolvedValue(mockMetricsData as any);

      const result = await service.executeAnalyticsQuery(query);

      expect(result.data).toEqual(mockMetricsData);
      expect(mockMetricsRepo.getFighterMetrics).toHaveBeenCalledWith({
        startTime: query.timeRange.start,
        endTime: query.timeRange.end,
      });
    });

    it('should execute events analytics query successfully', async () => {
      const query: AnalyticsQuery = {
        dataType: 'events',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-02-01'),
        },
        aggregation: 'count',
      };

      const mockEventsData = [
        { id: '1', name: 'UFC 300' },
        { id: '2', name: 'UFC 301' },
      ];

      mockEventRepo.getEventsByDateRange.mockResolvedValue(mockEventsData as any);

      const result = await service.executeAnalyticsQuery(query);

      expect(result.data).toEqual(mockEventsData);
      expect(mockEventRepo.getEventsByDateRange).toHaveBeenCalledWith(
        query.timeRange.start,
        query.timeRange.end
      );
    });

    it('should execute fighters analytics query successfully', async () => {
      const query: AnalyticsQuery = {
        dataType: 'fighters',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-02-01'),
        },
        aggregation: 'count',
        filters: { weightClass: 'Lightweight' },
      };

      const mockFightersData = [
        { id: '1', name: 'Fighter 1' },
        { id: '2', name: 'Fighter 2' },
      ];

      mockFighterRepo.search.mockResolvedValue(mockFightersData as any);

      const result = await service.executeAnalyticsQuery(query);

      expect(result.data).toEqual(mockFightersData);
      expect(mockFighterRepo.search).toHaveBeenCalledWith({
        weightClass: 'Lightweight',
        limit: 1000,
      });
    });

    it('should handle unsupported data types', async () => {
      const query: AnalyticsQuery = {
        dataType: 'unsupported' as any,
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-02-01'),
        },
        aggregation: 'count',
      };

      await expect(service.executeAnalyticsQuery(query))
        .rejects.toThrow('Unsupported data type: unsupported');
    });

    it('should handle query execution errors', async () => {
      const query: AnalyticsQuery = {
        dataType: 'odds',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-02-01'),
        },
        aggregation: 'avg',
      };

      mockOddsRepo.getOddsHistory.mockRejectedValue(new Error('Query failed'));

      await expect(service.executeAnalyticsQuery(query))
        .rejects.toThrow('Failed to execute analytics query');
    });
  });

  describe('generateTrendAnalysis', () => {
    it('should generate trend analysis successfully', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockResolvedValue([
          { _time: '2024-01-01T00:00:00Z', _value: 10 },
          { _time: '2024-01-08T00:00:00Z', _value: 12 },
          { _time: '2024-01-15T00:00:00Z', _value: 15 },
          { _time: '2024-01-22T00:00:00Z', _value: 18 },
        ]),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const result = await service.generateTrendAnalysis('striking_accuracy', '30d', 'fighter1');

      expect(result.metric).toBe('striking_accuracy');
      expect(result.timeWindow).toBe('30d');
      expect(result.trend).toBe('increasing');
      expect(result.changePercentage).toBe(80); // (18-10)/10 * 100
      expect(result.dataPoints).toHaveLength(4);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle stable trends', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockResolvedValue([
          { _time: '2024-01-01T00:00:00Z', _value: 10 },
          { _time: '2024-01-08T00:00:00Z', _value: 10.2 },
          { _time: '2024-01-15T00:00:00Z', _value: 9.8 },
          { _time: '2024-01-22T00:00:00Z', _value: 10.1 },
        ]),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const result = await service.generateTrendAnalysis('striking_accuracy', '30d');

      expect(result.trend).toBe('stable');
      expect(Math.abs(result.changePercentage)).toBeLessThan(5);
    });

    it('should handle insufficient data', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockResolvedValue([
          { _time: '2024-01-01T00:00:00Z', _value: 10 },
        ]),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const result = await service.generateTrendAnalysis('striking_accuracy', '30d');

      expect(result.trend).toBe('stable');
      expect(result.changePercentage).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.dataPoints).toHaveLength(0);
    });

    it('should handle trend analysis errors', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockRejectedValue(new Error('Query failed')),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      await expect(service.generateTrendAnalysis('striking_accuracy', '30d'))
        .rejects.toThrow('Failed to generate trend analysis');
    });
  });

  describe('generatePerformanceInsights', () => {
    it('should generate performance insights successfully', async () => {
      // Mock arbitrage opportunities
      mockOddsRepo.getArbitrageOpportunities.mockResolvedValue([
        {
          fightId: 'fight1',
          sportsbooks: ['DraftKings', 'FanDuel'],
          profit: 5.2,
          stakes: { DraftKings: 100, FanDuel: 150 },
          expiresAt: new Date(),
        },
      ] as any);

      const insights = await service.generatePerformanceInsights('30d');

      expect(insights).toHaveLength(1);
      expect(insights[0].type).toBe('betting_pattern');
      expect(insights[0].title).toBe('Active Arbitrage Opportunities');
      expect(insights[0].confidence).toBe(0.95);
      expect(insights[0].impact).toBe('high');
    });

    it('should handle empty insights', async () => {
      mockOddsRepo.getArbitrageOpportunities.mockResolvedValue([]);

      const insights = await service.generatePerformanceInsights('30d');

      expect(insights).toHaveLength(0);
    });

    it('should handle insights generation errors', async () => {
      mockOddsRepo.getArbitrageOpportunities.mockRejectedValue(new Error('Query failed'));

      await expect(service.generatePerformanceInsights('30d'))
        .rejects.toThrow('Failed to generate performance insights');
    });
  });

  describe('getDashboardMetrics', () => {
    it('should get dashboard metrics successfully', async () => {
      // Mock repository counts
      mockEventRepo.count.mockResolvedValue(50);
      mockFighterRepo.count.mockResolvedValue(200);
      mockOddsRepo.getArbitrageOpportunities.mockResolvedValue([
        { fightId: 'fight1' },
        { fightId: 'fight2' },
      ] as any);

      // Mock InfluxDB query for odds movements
      const mockQueryApi = {
        collectRows: jest.fn().mockResolvedValue([
          { _value: 25 },
          { _value: 30 },
        ]),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const metrics = await service.getDashboardMetrics();

      expect(metrics.totalEvents).toBe(50);
      expect(metrics.totalFighters).toBe(200);
      expect(metrics.activeArbitrageOpportunities).toBe(2);
      expect(metrics.systemHealth).toBe('healthy');
      expect(metrics.avgPredictionAccuracy).toBe(72.5);
      expect(metrics.dataQualityScore).toBe(96.8);
    });

    it('should handle dashboard metrics errors', async () => {
      mockEventRepo.count.mockRejectedValue(new Error('Count failed'));

      await expect(service.getDashboardMetrics())
        .rejects.toThrow('Failed to get dashboard metrics');
    });
  });

  describe('generateReport', () => {
    it('should generate report successfully', async () => {
      const config: ReportConfiguration = {
        name: 'Weekly Odds Report',
        description: 'Weekly analysis of odds movements',
        schedule: '0 9 * * 1',
        queries: [
          {
            dataType: 'odds',
            timeRange: {
              start: new Date('2024-01-01'),
              end: new Date('2024-01-08'),
            },
            aggregation: 'avg',
          },
        ],
        format: 'json',
        enabled: true,
      };

      mockOddsRepo.getOddsHistory.mockResolvedValue([
        { fightId: '1', odds: {} },
      ] as any);

      const reportId = await service.generateReport(config);

      expect(reportId).toMatch(/^report_\d+$/);
      expect(mockOddsRepo.getOddsHistory).toHaveBeenCalled();
    });

    it('should handle report generation errors', async () => {
      const config: ReportConfiguration = {
        name: 'Test Report',
        description: 'Test',
        schedule: '0 9 * * 1',
        queries: [
          {
            dataType: 'odds',
            timeRange: {
              start: new Date('2024-01-01'),
              end: new Date('2024-01-08'),
            },
            aggregation: 'avg',
          },
        ],
        format: 'json',
        enabled: true,
      };

      mockOddsRepo.getOddsHistory.mockRejectedValue(new Error('Query failed'));

      await expect(service.generateReport(config))
        .rejects.toThrow('Failed to generate report');
    });
  });

  describe('scheduleReport', () => {
    it('should schedule report successfully', async () => {
      const config: ReportConfiguration = {
        name: 'Daily Report',
        description: 'Daily analytics report',
        schedule: '0 8 * * *',
        queries: [],
        format: 'json',
        enabled: true,
      };

      const mockCollection = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'id123' }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      const scheduleId = await service.scheduleReport(config);

      expect(scheduleId).toMatch(/^schedule_\d+$/);
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });

    it('should handle schedule report errors', async () => {
      const config: ReportConfiguration = {
        name: 'Daily Report',
        description: 'Daily analytics report',
        schedule: '0 8 * * *',
        queries: [],
        format: 'json',
        enabled: true,
      };

      const mockCollection = {
        insertOne: jest.fn().mockRejectedValue(new Error('Insert failed')),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await expect(service.scheduleReport(config))
        .rejects.toThrow('Failed to schedule report');
    });
  });
});