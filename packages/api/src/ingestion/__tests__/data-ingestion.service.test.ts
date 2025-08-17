import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DataIngestionService, DataNormalizationConfig } from '../data-ingestion.service.js';
import { DataValidator } from '../../validation/data-validator.js';
import { QualityScorer } from '../../validation/quality-scorer.js';

// Mock dependencies
vi.mock('../../validation/data-validator.js');
vi.mock('../../validation/quality-scorer.js');
vi.mock('../ingestion-manager.js', () => ({
  ingestionManager: {
    on: vi.fn()
  }
}));

describe('DataIngestionService', () => {
  let service: DataIngestionService;
  let mockValidator: vi.Mocked<DataValidator>;
  let mockQualityScorer: vi.Mocked<QualityScorer>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockValidator = {
      validateData: vi.fn()
    } as any;
    
    mockQualityScorer = {
      calculateScore: vi.fn()
    } as any;

    // Mock constructor dependencies
    vi.mocked(DataValidator).mockImplementation(() => mockValidator);
    vi.mocked(QualityScorer).mockImplementation(() => mockQualityScorer);

    service = new DataIngestionService();
  });

  afterEach(() => {
    service.removeAllListeners();
  });

  describe('registerNormalizationConfig', () => {
    it('should register normalization configuration', () => {
      const config: DataNormalizationConfig = {
        source: 'test-source',
        transformations: [
          {
            sourceField: 'name',
            targetField: 'fighterName',
            required: true
          }
        ],
        conflictResolution: {
          strategy: 'latest'
        }
      };

      const eventSpy = vi.fn();
      service.on('normalizationConfigRegistered', eventSpy);

      service.registerNormalizationConfig(config);

      expect(eventSpy).toHaveBeenCalledWith({ source: 'test-source' });
    });
  });

  describe('processData', () => {
    beforeEach(() => {
      mockValidator.validateData.mockResolvedValue({
        isValid: true,
        errors: []
      });
      
      mockQualityScorer.calculateScore.mockResolvedValue(0.85);
    });

    it('should process data successfully', async () => {
      const rawData = [
        { id: '1', name: 'Fighter 1', weight: 155 },
        { id: '2', name: 'Fighter 2', weight: 170 }
      ];

      const eventSpy = vi.fn();
      service.on('dataProcessingCompleted', eventSpy);

      const result = await service.processData('test-source', rawData);

      expect(result).toHaveLength(2);
      expect(result[0].sourceId).toBe('test-source');
      expect(result[0].qualityScore).toBe(0.85);
      expect(eventSpy).toHaveBeenCalled();
    });

    it('should handle validation errors', async () => {
      mockValidator.validateData.mockResolvedValue({
        isValid: false,
        errors: [
          {
            field: 'weight',
            message: 'Invalid weight',
            value: -1,
            severity: 'error'
          }
        ]
      });

      const rawData = [{ id: '1', name: 'Fighter 1', weight: -1 }];

      const result = await service.processData('test-source', rawData);

      expect(result[0].validationErrors).toHaveLength(1);
      expect(result[0].validationErrors[0].message).toBe('Invalid weight');
    });

    it('should normalize data according to configuration', async () => {
      const config: DataNormalizationConfig = {
        source: 'test-source',
        transformations: [
          {
            sourceField: 'name',
            targetField: 'fighterName',
            transform: (value: string) => value.toUpperCase()
          },
          {
            sourceField: 'weight',
            targetField: 'weightLbs',
            required: true
          }
        ],
        conflictResolution: {
          strategy: 'latest'
        }
      };

      service.registerNormalizationConfig(config);

      const rawData = [{ id: '1', name: 'fighter one', weight: 155 }];

      const result = await service.processData('test-source', rawData);

      expect(result[0].normalizedData.fighterName).toBe('FIGHTER ONE');
      expect(result[0].normalizedData.weightLbs).toBe(155);
    });

    it('should process data with basic conflict detection', async () => {
      const config: DataNormalizationConfig = {
        source: 'test-source',
        transformations: [
          { sourceField: 'name', targetField: 'fighterName' },
          { sourceField: 'weight', targetField: 'weightLbs' }
        ],
        conflictResolution: {
          strategy: 'latest'
        }
      };

      service.registerNormalizationConfig(config);

      const data = [{ id: '1', name: 'Fighter One', weight: 155 }];
      const result = await service.processData('test-source', data);

      expect(result).toHaveLength(1);
      expect(result[0].normalizedData.fighterName).toBe('Fighter One');
      expect(result[0].normalizedData.weightLbs).toBe(155);
    });

    it('should handle transformation errors gracefully', async () => {
      const config: DataNormalizationConfig = {
        source: 'test-source',
        transformations: [
          {
            sourceField: 'name',
            targetField: 'fighterName',
            transform: () => { throw new Error('Transform error'); },
            defaultValue: 'Unknown Fighter'
          }
        ],
        conflictResolution: {
          strategy: 'latest'
        }
      };

      service.registerNormalizationConfig(config);

      const rawData = [{ id: '1', name: 'Fighter 1' }];

      const transformErrorSpy = vi.fn();
      service.on('transformationError', transformErrorSpy);

      const result = await service.processData('test-source', rawData);

      expect(transformErrorSpy).toHaveBeenCalled();
      expect(result[0].normalizedData.fighterName).toBe('Unknown Fighter');
    });

    it('should emit processing events', async () => {
      const rawData = [{ id: '1', name: 'Fighter 1' }];

      const startSpy = vi.fn();
      const completedSpy = vi.fn();
      const itemProcessedSpy = vi.fn();

      service.on('dataProcessingStarted', startSpy);
      service.on('dataProcessingCompleted', completedSpy);
      service.on('dataItemProcessed', itemProcessedSpy);

      await service.processData('test-source', rawData);

      expect(startSpy).toHaveBeenCalledWith({
        sourceId: 'test-source',
        recordCount: 1,
        timestamp: expect.any(Date)
      });

      expect(itemProcessedSpy).toHaveBeenCalledWith({
        id: expect.any(String),
        sourceId: 'test-source',
        qualityScore: 0.85,
        errorCount: 0
      });

      expect(completedSpy).toHaveBeenCalledWith({
        sourceId: 'test-source',
        processedCount: 1,
        processingTimeMs: expect.any(Number),
        averageQualityScore: 0.85
      });
    });
  });

  describe('conflict resolution strategies', () => {
    beforeEach(() => {
      mockValidator.validateData.mockResolvedValue({
        isValid: true,
        errors: []
      });
      
      mockQualityScorer.calculateScore.mockResolvedValue(0.8);
    });

    it('should apply latest strategy', async () => {
      const config: DataNormalizationConfig = {
        source: 'test-source',
        transformations: [
          { sourceField: 'name', targetField: 'fighterName' }
        ],
        conflictResolution: {
          strategy: 'latest'
        }
      };

      service.registerNormalizationConfig(config);

      // Process same data twice with different timestamps
      const data1 = [{ id: '1', name: 'Original Name' }];
      const data2 = [{ id: '1', name: 'Updated Name' }];

      await service.processData('test-source', data1);
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await service.processData('test-source', data2);

      // Latest data should be used
      expect(result[0].normalizedData.fighterName).toBe('Updated Name');
    });

    it('should apply latest strategy by default', async () => {
      const config: DataNormalizationConfig = {
        source: 'test-source',
        transformations: [
          { sourceField: 'name', targetField: 'fighterName' },
          { sourceField: 'weight', targetField: 'weightLbs' }
        ],
        conflictResolution: {
          strategy: 'latest'
        }
      };

      service.registerNormalizationConfig(config);

      const data = [{ id: '1', name: 'Fighter One', weight: 155 }];
      const result = await service.processData('test-source', data);

      expect(result[0].normalizedData.fighterName).toBe('Fighter One');
      expect(result[0].normalizedData.weightLbs).toBe(155);
    });

    it('should handle highest quality strategy', async () => {
      const config: DataNormalizationConfig = {
        source: 'test-source',
        transformations: [
          { sourceField: 'name', targetField: 'fighterName' }
        ],
        conflictResolution: {
          strategy: 'highest_quality'
        }
      };

      service.registerNormalizationConfig(config);

      const data = [{ id: '1', name: 'Fighter One' }];
      const result = await service.processData('test-source', data);

      expect(result[0].normalizedData.fighterName).toBe('Fighter One');
    });
  });

  describe('getProcessingStats', () => {
    it('should return processing statistics', async () => {
      mockValidator.validateData.mockResolvedValue({
        isValid: true,
        errors: []
      });
      
      mockQualityScorer.calculateScore.mockResolvedValue(0.9);

      const rawData = [{ id: '1', name: 'Fighter 1' }];
      await service.processData('test-source', rawData);

      const stats = service.getProcessingStats();

      expect(stats.totalItemsProcessed).toBe(1);
      expect(stats.averageQualityScore).toBe(0.9);
      expect(stats.sourcesWithConfigs).toBe(0);
      expect(stats.lastProcessingTime).toBeInstanceOf(Date);
    });
  });

  describe('clearCache', () => {
    it('should clear processed data cache', async () => {
      mockValidator.validateData.mockResolvedValue({
        isValid: true,
        errors: []
      });
      
      mockQualityScorer.calculateScore.mockResolvedValue(0.8);

      const rawData = [{ id: '1', name: 'Fighter 1' }];
      await service.processData('test-source', rawData);

      const eventSpy = vi.fn();
      service.on('cacheCleared', eventSpy);

      service.clearCache();

      expect(eventSpy).toHaveBeenCalled();
      
      const stats = service.getProcessingStats();
      expect(stats.totalItemsProcessed).toBe(0);
    });
  });
});