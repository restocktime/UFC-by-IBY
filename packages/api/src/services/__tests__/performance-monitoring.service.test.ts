import { PerformanceMonitoringService, PredictionAccuracyMetrics, APIPerformanceMetrics, SystemHealthMetrics } from '../performance-monitoring.service';
import { DatabaseManager } from '../../database';
import { AnalyticsReportingService } from '../analytics-reporting.service';

// Mock dependencies
jest.mock('../../database');
jest.mock('../analytics-reporting.service');

describe('PerformanceMonitoringService', () => {
  let service: PerformanceMonitoringService;
  let mockDbManager: jest.Mocked<DatabaseManager>;
  let mockAnalyticsService: jest.Mocked<AnalyticsReportingService>;

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
        writePoints: jest.fn(),
        flush: jest.fn(),
      }),
      getQueryApi: jest.fn().mockReturnValue({
        collectRows: jest.fn(),
      }),
      createPoint: jest.fn().mockReturnValue({
        tag: jest.fn().mockReturnThis(),
        stringField: jest.fn().mockReturnThis(),
        floatField: jest.fn().mockReturnThis(),
        booleanField: jest.fn().mockReturnThis(),
        timestamp: jest.fn().mockReturnThis(),
      }),
    };

    mockDbManager.getInfluxDB.mockReturnValue(mockInfluxDB as any);

    // Mock MongoDB
    const mockMongoDB = {
      getDb: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          aggregate: jest.fn().mockReturnValue({
            toArray: jest.fn(),
          }),
          replaceOne: jest.fn(),
        }),
      }),
    };

    mockDbManager.getMongoDB.mockReturnValue(mockMongoDB as any);

    // Mock health check
    mockDbManager.healthCheck.mockResolvedValue({
      overall: 'healthy',
      services: {
        mongodb: { status: 'healthy', details: { connections: { current: 5 } } },
        influxdb: { status: 'healthy', details: {} },
        redis: { status: 'healthy', details: {} },
      },
      timestamp: new Date(),
    } as any);

    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDbManager);

    // Mock AnalyticsReportingService
    mockAnalyticsService = {} as any;

    // Create service instance
    service = new PerformanceMonitoringService();
  });

  describe('trackPredictionAccuracy', () => {
    it('should track prediction accuracy successfully', async () => {
      const metrics: PredictionAccuracyMetrics = {
        fightId: 'fight123',
        predictedOutcome: 'fighter1',
        actualOutcome: 'fighter1',
        confidence: 0.85,
        timestamp: new Date(),
        correct: true,
      };

      await service.trackPredictionAccuracy(metrics);

      expect(mockDbManager.getInfluxDB).toHaveBeenCalled();
    });

    it('should handle tracking errors', async () => {
      const metrics: PredictionAccuracyMetrics = {
        fightId: 'fight123',
        predictedOutcome: 'fighter1',
        actualOutcome: 'fighter2',
        confidence: 0.75,
        timestamp: new Date(),
        correct: false,
      };

      const mockWriteApi = {
        writePoint: jest.fn().mockRejectedValue(new Error('Write failed')),
        flush: jest.fn(),
      };

      mockDbManager.getInfluxDB().getWriteApi.mockReturnValue(mockWriteApi as any);

      await expect(service.trackPredictionAccuracy(metrics))
        .rejects.toThrow('Failed to track prediction accuracy');
    });
  });

  describe('getPredictionAccuracyOverTime', () => {
    it('should get prediction accuracy over time successfully', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockResolvedValue([
          { _time: '2024-01-01T00:00:00Z', _value: 75.5 },
          { _time: '2024-01-02T00:00:00Z', _value: 78.2 },
          { _time: '2024-01-03T00:00:00Z', _value: 72.8 },
        ]),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const result = await service.getPredictionAccuracyOverTime('7d');

      expect(result).toHaveLength(3);
      expect(result[0].accuracy).toBe(75.5);
      expect(result[1].accuracy).toBe(78.2);
      expect(result[2].accuracy).toBe(72.8);
    });

    it('should handle query errors', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockRejectedValue(new Error('Query failed')),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      await expect(service.getPredictionAccuracyOverTime('7d'))
        .rejects.toThrow('Failed to get prediction accuracy');
    });
  });

  describe('getPredictionAccuracyByWeightClass', () => {
    it('should get prediction accuracy by weight class successfully', async () => {
      const mockCollection = {
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            { weightClass: 'Lightweight', accuracy: 78.5 },
            { weightClass: 'Welterweight', accuracy: 72.3 },
            { weightClass: 'Middleweight', accuracy: 75.8 },
          ]),
        }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      const result = await service.getPredictionAccuracyByWeightClass('30d');

      expect(result).toEqual({
        'Lightweight': 78.5,
        'Welterweight': 72.3,
        'Middleweight': 75.8,
      });
    });

    it('should handle aggregation errors', async () => {
      const mockCollection = {
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockRejectedValue(new Error('Aggregation failed')),
        }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await expect(service.getPredictionAccuracyByWeightClass('30d'))
        .rejects.toThrow('Failed to get prediction accuracy by weight class');
    });
  });

  describe('trackAPIPerformance', () => {
    it('should track API performance successfully', async () => {
      const metrics: APIPerformanceMetrics = {
        endpoint: '/api/predictions',
        method: 'GET',
        responseTime: 150,
        statusCode: 200,
        timestamp: new Date(),
      };

      await service.trackAPIPerformance(metrics);

      expect(mockDbManager.getInfluxDB).toHaveBeenCalled();
    });

    it('should track API errors', async () => {
      const metrics: APIPerformanceMetrics = {
        endpoint: '/api/predictions',
        method: 'POST',
        responseTime: 5000,
        statusCode: 500,
        timestamp: new Date(),
        errorMessage: 'Internal server error',
      };

      await service.trackAPIPerformance(metrics);

      expect(mockDbManager.getInfluxDB).toHaveBeenCalled();
    });

    it('should handle tracking errors', async () => {
      const metrics: APIPerformanceMetrics = {
        endpoint: '/api/predictions',
        method: 'GET',
        responseTime: 150,
        statusCode: 200,
        timestamp: new Date(),
      };

      const mockWriteApi = {
        writePoint: jest.fn().mockRejectedValue(new Error('Write failed')),
        flush: jest.fn(),
      };

      mockDbManager.getInfluxDB().getWriteApi.mockReturnValue(mockWriteApi as any);

      await expect(service.trackAPIPerformance(metrics))
        .rejects.toThrow('Failed to track API performance');
    });
  });

  describe('getAPIPerformanceMetrics', () => {
    it('should get API performance metrics successfully', async () => {
      const mockQueryApi = {
        collectRows: jest.fn()
          .mockResolvedValueOnce([{ _value: 250 }]) // Average response time
          .mockResolvedValueOnce([{ '200': 950, '500': 50 }]) // Error rates
          .mockResolvedValueOnce([{ _value: 15.5 }]), // Requests per minute
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const result = await service.getAPIPerformanceMetrics('24h');

      expect(result.averageResponseTime).toBe(250);
      expect(result.errorRate).toBe(5); // 50/1000 * 100
      expect(result.requestsPerMinute).toBe(15.5);
    });

    it('should handle performance metrics errors', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockRejectedValue(new Error('Query failed')),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      await expect(service.getAPIPerformanceMetrics('24h'))
        .rejects.toThrow('Failed to get API performance metrics');
    });
  });

  describe('getSlowestEndpoints', () => {
    it('should get slowest endpoints successfully', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockResolvedValue([
          { endpoint: '/api/predictions', _value: 450 },
          { endpoint: '/api/fighters', _value: 320 },
          { endpoint: '/api/odds', _value: 280 },
        ]),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const result = await service.getSlowestEndpoints(3, '24h');

      expect(result).toHaveLength(3);
      expect(result[0].endpoint).toBe('/api/predictions');
      expect(result[0].averageTime).toBe(450);
    });

    it('should handle slowest endpoints query errors', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockRejectedValue(new Error('Query failed')),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      await expect(service.getSlowestEndpoints(5, '24h'))
        .rejects.toThrow('Failed to get slowest endpoints');
    });
  });

  describe('trackSystemHealth', () => {
    it('should track system health successfully', async () => {
      const metrics: SystemHealthMetrics = {
        cpu: {
          usage: 45.2,
          load: [1.2, 1.5, 1.8],
        },
        memory: {
          used: 2048000000,
          total: 8192000000,
          percentage: 25.0,
        },
        database: {
          mongodb: {
            status: 'healthy',
            responseTime: 15,
            connections: 10,
          },
          influxdb: {
            status: 'healthy',
            responseTime: 8,
            writeRate: 1000,
          },
          redis: {
            status: 'healthy',
            responseTime: 2,
            memoryUsage: 50000000,
          },
        },
        timestamp: new Date(),
      };

      await service.trackSystemHealth(metrics);

      expect(mockDbManager.getInfluxDB).toHaveBeenCalled();
    });

    it('should handle system health tracking errors', async () => {
      const metrics: SystemHealthMetrics = {
        cpu: { usage: 45.2, load: [1.2, 1.5, 1.8] },
        memory: { used: 2048000000, total: 8192000000, percentage: 25.0 },
        database: {
          mongodb: { status: 'healthy', responseTime: 15, connections: 10 },
          influxdb: { status: 'healthy', responseTime: 8, writeRate: 1000 },
          redis: { status: 'healthy', responseTime: 2, memoryUsage: 50000000 },
        },
        timestamp: new Date(),
      };

      const mockWriteApi = {
        writePoints: jest.fn().mockRejectedValue(new Error('Write failed')),
        flush: jest.fn(),
      };

      mockDbManager.getInfluxDB().getWriteApi.mockReturnValue(mockWriteApi as any);

      await expect(service.trackSystemHealth(metrics))
        .rejects.toThrow('Failed to track system health');
    });
  });

  describe('getSystemHealthStatus', () => {
    it('should get system health status successfully', async () => {
      const result = await service.getSystemHealthStatus();

      expect(result.mongodb.status).toBe('healthy');
      expect(result.influxdb.status).toBe('healthy');
      expect(result.redis.status).toBe('healthy');
      expect(mockDbManager.healthCheck).toHaveBeenCalled();
    });

    it('should handle system health status errors', async () => {
      mockDbManager.healthCheck.mockRejectedValue(new Error('Health check failed'));

      await expect(service.getSystemHealthStatus())
        .rejects.toThrow('Failed to get system health status');
    });
  });

  describe('getPerformanceDashboard', () => {
    it('should get performance dashboard successfully', async () => {
      // Mock all the required methods
      const mockQueryApi = {
        collectRows: jest.fn()
          .mockResolvedValueOnce([{ _value: 72.5 }]) // Overall accuracy
          .mockResolvedValueOnce([{ _value: 75.0 }]) // 24h accuracy
          .mockResolvedValueOnce([{ _value: 73.8 }]) // 7d accuracy
          .mockResolvedValueOnce([{ _value: 250 }]) // API response time
          .mockResolvedValueOnce([{ '200': 950, '500': 50 }]) // Error rates
          .mockResolvedValueOnce([{ _value: 15.5 }]) // Requests per minute
          .mockResolvedValueOnce([
            { endpoint: '/api/predictions', _value: 450 },
            { endpoint: '/api/fighters', _value: 320 },
          ]), // Slowest endpoints
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const mockCollection = {
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            { weightClass: 'Lightweight', accuracy: 78.5 },
            { weightClass: 'Welterweight', accuracy: 72.3 },
          ]),
        }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      const result = await service.getPerformanceDashboard();

      expect(result).toHaveProperty('predictionAccuracy');
      expect(result).toHaveProperty('apiPerformance');
      expect(result).toHaveProperty('systemHealth');
      expect(result).toHaveProperty('dataQuality');
      expect(result.predictionAccuracy.overall).toBe(72.5);
      expect(result.apiPerformance.averageResponseTime).toBe(250);
    });

    it('should handle dashboard errors', async () => {
      mockDbManager.healthCheck.mockRejectedValue(new Error('Health check failed'));

      await expect(service.getPerformanceDashboard())
        .rejects.toThrow('Failed to get performance dashboard');
    });
  });

  describe('configureAlert', () => {
    it('should configure alert successfully', async () => {
      const config = {
        id: 'alert1',
        name: 'High Response Time',
        type: 'api_performance' as const,
        condition: {
          metric: 'responseTime',
          operator: '>' as const,
          threshold: 1000,
          timeWindow: '5m',
        },
        actions: {
          email: ['admin@example.com'],
        },
        enabled: true,
        cooldownMinutes: 15,
      };

      const mockCollection = {
        replaceOne: jest.fn().mockResolvedValue({ upsertedId: 'alert1' }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await service.configureAlert(config);

      expect(mockCollection.replaceOne).toHaveBeenCalledWith(
        { id: config.id },
        config,
        { upsert: true }
      );
    });

    it('should handle alert configuration errors', async () => {
      const config = {
        id: 'alert1',
        name: 'High Response Time',
        type: 'api_performance' as const,
        condition: {
          metric: 'responseTime',
          operator: '>' as const,
          threshold: 1000,
          timeWindow: '5m',
        },
        actions: {},
        enabled: true,
        cooldownMinutes: 15,
      };

      const mockCollection = {
        replaceOne: jest.fn().mockRejectedValue(new Error('Insert failed')),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await expect(service.configureAlert(config))
        .rejects.toThrow('Failed to configure alert');
    });
  });

  describe('triggerAlert', () => {
    it('should trigger alert successfully', async () => {
      const alertId = 'alert1';
      const message = 'High response time detected';
      const severity = 'high';

      // Mock alert configuration
      const mockCollection = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            {
              id: alertId,
              name: 'High Response Time',
              enabled: true,
              cooldownMinutes: 15,
              actions: { email: ['admin@example.com'] },
            },
          ]),
        }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await service.triggerAlert(alertId, message, severity);

      expect(mockDbManager.getInfluxDB).toHaveBeenCalled();
    });
  });
});