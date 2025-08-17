import { DataWarehouseService, DataWarehouseConfig, DataArchiveOptions, DataRetentionPolicy } from '../data-warehouse.service';
import { DatabaseManager } from '../../database';
import { MetricsRepository } from '../../repositories/metrics.repository';
import { OddsRepository } from '../../repositories/odds.repository';

// Mock dependencies
jest.mock('../../database');
jest.mock('../../repositories/metrics.repository');
jest.mock('../../repositories/odds.repository');

describe('DataWarehouseService', () => {
  let service: DataWarehouseService;
  let mockDbManager: jest.Mocked<DatabaseManager>;
  let mockMetricsRepo: jest.Mocked<MetricsRepository>;
  let mockOddsRepo: jest.Mocked<OddsRepository>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock DatabaseManager
    mockDbManager = {
      getInstance: jest.fn(),
      getInfluxDB: jest.fn(),
      getMongoDB: jest.fn(),
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
        intField: jest.fn().mockReturnThis(),
        floatField: jest.fn().mockReturnThis(),
        booleanField: jest.fn().mockReturnThis(),
        timestamp: jest.fn().mockReturnThis(),
      }),
    };

    mockDbManager.getInfluxDB.mockReturnValue(mockInfluxDB as any);

    // Mock MongoDB
    const mockMongoDB = {
      getDb: jest.fn().mockReturnValue({
        stats: jest.fn().mockResolvedValue({
          dataSize: 1000000,
          indexSize: 100000,
          collections: 5,
          objects: 10000,
        }),
      }),
    };

    mockDbManager.getMongoDB.mockReturnValue(mockMongoDB as any);

    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDbManager);

    // Mock repositories
    mockMetricsRepo = {
      getFighterMetrics: jest.fn(),
    } as any;

    mockOddsRepo = {
      getOddsHistory: jest.fn(),
    } as any;

    // Create service instance
    const config: Partial<DataWarehouseConfig> = {
      retentionPeriods: {
        rawData: '1y',
        aggregatedData: '3y',
        summaryData: '5y',
      },
      compressionSettings: {
        enabled: true,
        algorithm: 'gzip',
        level: 6,
      },
    };

    service = new DataWarehouseService(config);
  });

  describe('createDataPartitions', () => {
    it('should create time-based partitions successfully', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-03-01');

      await service.createDataPartitions('odds', startDate, endDate);

      expect(mockDbManager.getInfluxDB).toHaveBeenCalled();
    });

    it('should handle partition creation errors', async () => {
      const mockWriteApi = {
        writePoint: jest.fn().mockRejectedValue(new Error('Write failed')),
        flush: jest.fn(),
      };

      mockDbManager.getInfluxDB().getWriteApi.mockReturnValue(mockWriteApi as any);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-03-01');

      await expect(service.createDataPartitions('odds', startDate, endDate))
        .rejects.toThrow('Failed to create data partitions');
    });
  });

  describe('compressHistoricalData', () => {
    it('should compress data successfully', async () => {
      const options: DataArchiveOptions = {
        dataType: 'odds',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
        compressionLevel: 6,
      };

      mockOddsRepo.getOddsHistory.mockResolvedValue([
        { fightId: '1', timestamp: new Date(), odds: {} },
        { fightId: '2', timestamp: new Date(), odds: {} },
      ] as any);

      await service.compressHistoricalData(options);

      expect(mockOddsRepo.getOddsHistory).toHaveBeenCalledWith({
        startTime: options.startDate,
        endTime: options.endDate,
      });
    });

    it('should handle empty data gracefully', async () => {
      const options: DataArchiveOptions = {
        dataType: 'odds',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
      };

      mockOddsRepo.getOddsHistory.mockResolvedValue([]);

      await service.compressHistoricalData(options);

      expect(mockOddsRepo.getOddsHistory).toHaveBeenCalled();
    });

    it('should handle compression errors', async () => {
      const options: DataArchiveOptions = {
        dataType: 'odds',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-01'),
      };

      mockOddsRepo.getOddsHistory.mockRejectedValue(new Error('Query failed'));

      await expect(service.compressHistoricalData(options))
        .rejects.toThrow('Failed to compress historical data');
    });
  });

  describe('implementRetentionPolicy', () => {
    it('should implement retention policy successfully', async () => {
      const policy: DataRetentionPolicy = {
        dataType: 'odds',
        retentionPeriod: '2y',
        archiveAfter: '1y',
        deleteAfter: '2y',
        compressionEnabled: true,
      };

      mockOddsRepo.getOddsHistory.mockResolvedValue([]);

      await service.implementRetentionPolicy(policy);

      expect(mockDbManager.getInfluxDB).toHaveBeenCalled();
    });

    it('should handle retention policy errors', async () => {
      const policy: DataRetentionPolicy = {
        dataType: 'odds',
        retentionPeriod: '2y',
        archiveAfter: '1y',
        deleteAfter: '2y',
        compressionEnabled: true,
      };

      mockOddsRepo.getOddsHistory.mockRejectedValue(new Error('Query failed'));

      await expect(service.implementRetentionPolicy(policy))
        .rejects.toThrow('Failed to implement retention policy');
    });
  });

  describe('queryHistoricalData', () => {
    it('should query odds data successfully', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-02-01');
      const mockData = [{ fightId: '1', odds: {} }];

      mockOddsRepo.getOddsHistory.mockResolvedValue(mockData as any);

      const result = await service.queryHistoricalData('odds', startDate, endDate);

      expect(result).toEqual(mockData);
      expect(mockOddsRepo.getOddsHistory).toHaveBeenCalledWith({
        startTime: startDate,
        endTime: endDate,
      });
    });

    it('should query metrics data successfully', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-02-01');
      const mockData = [{ fighterId: '1', metrics: {} }];

      mockMetricsRepo.getFighterMetrics.mockResolvedValue(mockData as any);

      const result = await service.queryHistoricalData('metrics', startDate, endDate);

      expect(result).toEqual(mockData);
      expect(mockMetricsRepo.getFighterMetrics).toHaveBeenCalledWith({
        startTime: startDate,
        endTime: endDate,
      });
    });

    it('should handle unsupported data types', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-02-01');

      await expect(service.queryHistoricalData('unsupported', startDate, endDate))
        .rejects.toThrow('Unsupported data type: unsupported');
    });

    it('should handle query errors', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-02-01');

      mockOddsRepo.getOddsHistory.mockRejectedValue(new Error('Query failed'));

      await expect(service.queryHistoricalData('odds', startDate, endDate))
        .rejects.toThrow('Failed to query historical data');
    });
  });

  describe('getDataQualityMetrics', () => {
    it('should return data quality metrics successfully', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockResolvedValue([
          {
            completeness: 95,
            accuracy: 98,
            consistency: 97,
            timeliness: 96,
            validity: 99,
            uniqueness: 100,
          },
        ]),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const result = await service.getDataQualityMetrics('odds', '30d');

      expect(result).toEqual({
        completeness: 95,
        accuracy: 98,
        consistency: 97,
        timeliness: 96,
        validity: 99,
        uniqueness: 100,
      });
    });

    it('should return default metrics when no data available', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockResolvedValue([]),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const result = await service.getDataQualityMetrics('odds');

      expect(result).toEqual({
        completeness: 95,
        accuracy: 98,
        consistency: 97,
        timeliness: 96,
        validity: 99,
        uniqueness: 100,
      });
    });

    it('should handle query errors gracefully', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockRejectedValue(new Error('Query failed')),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      await expect(service.getDataQualityMetrics('odds'))
        .rejects.toThrow('Failed to get data quality metrics');
    });
  });

  describe('getStorageStatistics', () => {
    it('should return storage statistics successfully', async () => {
      const mockQueryApi = {
        collectRows: jest.fn().mockResolvedValue([
          { _value: 1000 },
          { _value: 2000 },
        ]),
      };

      mockDbManager.getInfluxDB().getQueryApi.mockReturnValue(mockQueryApi as any);

      const result = await service.getStorageStatistics();

      expect(result).toHaveProperty('mongodb');
      expect(result).toHaveProperty('influxdb');
      expect(result).toHaveProperty('compression');
      expect(result.mongodb.totalSize).toBe(1000000);
      expect(result.influxdb.totalRecords).toBe(3000);
    });

    it('should handle storage statistics errors', async () => {
      mockDbManager.getMongoDB().getDb().stats.mockRejectedValue(new Error('Stats failed'));

      await expect(service.getStorageStatistics())
        .rejects.toThrow('Failed to get storage statistics');
    });
  });

  describe('createBackup', () => {
    it('should create backup successfully', async () => {
      const config = {
        schedule: '0 2 * * *',
        destination: 'local' as const,
        encryption: false,
        compression: true,
        retentionDays: 30,
      };

      const backupId = await service.createBackup(config);

      expect(backupId).toMatch(/^backup_\d+$/);
      expect(mockDbManager.getInfluxDB).toHaveBeenCalled();
    });

    it('should handle backup creation errors', async () => {
      const config = {
        schedule: '0 2 * * *',
        destination: 'local' as const,
        encryption: false,
        compression: true,
        retentionDays: 30,
      };

      const mockWriteApi = {
        writePoint: jest.fn().mockRejectedValue(new Error('Write failed')),
        flush: jest.fn(),
      };

      mockDbManager.getInfluxDB().getWriteApi.mockReturnValue(mockWriteApi as any);

      await expect(service.createBackup(config))
        .rejects.toThrow('Failed to create backup');
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore from backup successfully', async () => {
      const backupId = 'backup_123456789';

      await service.restoreFromBackup(backupId);

      expect(mockDbManager.getInfluxDB).toHaveBeenCalled();
    });

    it('should handle restore errors', async () => {
      const backupId = 'backup_123456789';

      const mockWriteApi = {
        writePoint: jest.fn().mockRejectedValue(new Error('Write failed')),
        flush: jest.fn(),
      };

      mockDbManager.getInfluxDB().getWriteApi.mockReturnValue(mockWriteApi as any);

      await expect(service.restoreFromBackup(backupId))
        .rejects.toThrow('Failed to restore from backup');
    });
  });
});