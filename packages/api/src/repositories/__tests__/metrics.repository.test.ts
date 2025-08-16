import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetricsRepository, PerformanceMetric } from '../metrics.repository';
import { DatabaseManager } from '../../database';

// Mock the database manager
vi.mock('../../database');

describe('MetricsRepository', () => {
  let metricsRepository: MetricsRepository;
  let mockWriteApi: any;
  let mockQueryApi: any;
  let mockInfluxDB: any;
  let mockDbManager: any;

  const mockPerformanceMetric: PerformanceMetric = {
    fighterId: 'fighter123',
    fightId: 'fight123',
    timestamp: new Date('2023-03-04T22:00:00Z'),
    metrics: {
      strikesLandedPerMinute: 4.2,
      strikingAccuracy: 58.5,
      takedownAccuracy: 75.0,
      takedownDefense: 85.0,
      submissionAttempts: 2,
      controlTime: 180.5,
      significantStrikes: 85,
      totalStrikes: 145,
      knockdowns: 1,
      reversals: 0,
    },
    opponent: 'opponent123',
    weightClass: 'Light Heavyweight',
    result: 'win',
  };

  beforeEach(() => {
    // Mock InfluxDB APIs
    mockWriteApi = {
      writePoint: vi.fn(),
      writePoints: vi.fn(),
      flush: vi.fn(),
      close: vi.fn(),
    };

    mockQueryApi = {
      collectRows: vi.fn(),
    };

    mockInfluxDB = {
      getWriteApi: vi.fn().mockReturnValue(mockWriteApi),
      getQueryApi: vi.fn().mockReturnValue(mockQueryApi),
    };

    mockDbManager = {
      getInfluxDB: vi.fn().mockReturnValue(mockInfluxDB),
    };

    (DatabaseManager.getInstance as any).mockReturnValue(mockDbManager);

    metricsRepository = new MetricsRepository();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('writePerformanceMetrics', () => {
    it('should write performance metrics successfully', async () => {
      await metricsRepository.writePerformanceMetrics(mockPerformanceMetric);

      expect(mockWriteApi.writePoint).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'fighter_performance',
        })
      );
    });

    it('should handle write errors', async () => {
      mockWriteApi.writePoint.mockRejectedValue(new Error('Write failed'));

      await expect(metricsRepository.writePerformanceMetrics(mockPerformanceMetric))
        .rejects.toThrow('Failed to write performance metrics');
    });
  });
});