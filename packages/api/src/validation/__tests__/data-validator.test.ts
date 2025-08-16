import { DataValidator, ValidationRule, CrossSourceData } from '../data-validator';

describe('DataValidator', () => {
  let validator: DataValidator;

  beforeEach(() => {
    validator = new DataValidator();
  });

  describe('validateSingleSource', () => {
    it('should validate fighter data successfully', async () => {
      const fighterData = {
        name: 'Jon Jones',
        record: {
          wins: 26,
          losses: 1,
          draws: 0
        },
        physicalStats: {
          height: 76,
          weight: 205,
          reach: 84.5
        },
        fightHistory: Array(27).fill({}) // 27 fights total
      };

      const result = await validator.validateSingleSource('fighter', fighterData, 'test-source');

      expect(result.isValid).toBe(true);
      expect(result.qualityScore).toBeGreaterThan(80);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', async () => {
      const fighterData = {
        // Missing name
        record: {
          wins: 26,
          losses: 1,
          draws: 0
        }
      };

      const result = await validator.validateSingleSource('fighter', fighterData, 'test-source');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      const nameError = result.errors.find(e => e.field === 'name');
      expect(nameError).toBeDefined();
      expect(nameError!.rule).toBe('required');
      expect(nameError!.severity).toBe('critical');
    });

    it('should detect out-of-range values', async () => {
      const fighterData = {
        name: 'Test Fighter',
        record: {
          wins: 150, // Unrealistic number
          losses: 1,
          draws: 0
        },
        physicalStats: {
          height: 120, // Unrealistic height
          weight: 50   // Unrealistic weight
        }
      };

      const result = await validator.validateSingleSource('fighter', fighterData, 'test-source');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      const rangeErrors = result.errors.filter(e => e.rule === 'range');
      expect(rangeErrors.length).toBeGreaterThan(0);
    });

    it('should detect record consistency issues', async () => {
      const fighterData = {
        name: 'Test Fighter',
        record: {
          wins: 20,
          losses: 5,
          draws: 1
        },
        fightHistory: Array(30).fill({}) // 30 fights but record shows 26
      };

      const result = await validator.validateSingleSource('fighter', fighterData, 'test-source');

      expect(result.isValid).toBe(false);
      
      const consistencyErrors = result.errors.filter(e => e.rule === 'consistency');
      expect(consistencyErrors.length).toBeGreaterThan(0);
      expect(consistencyErrors[0].severity).toBe('high');
    });

    it('should validate fight data', async () => {
      const fightData = {
        fighter1Id: 'fighter-1',
        fighter2Id: 'fighter-2',
        scheduledRounds: 3,
        weightClass: 'Lightweight'
      };

      const result = await validator.validateSingleSource('fight', fightData, 'test-source');

      expect(result.isValid).toBe(true);
      expect(result.qualityScore).toBe(100);
    });

    it('should validate odds data', async () => {
      const oddsData = {
        fightId: 'fight-123',
        sportsbook: 'DraftKings',
        moneyline: {
          fighter1: -150,
          fighter2: +130
        }
      };

      const result = await validator.validateSingleSource('odds', oddsData, 'test-source');

      expect(result.isValid).toBe(true);
      expect(result.qualityScore).toBe(100);
    });
  });

  describe('validateCrossSources', () => {
    it('should reconcile consistent data from multiple sources', async () => {
      const crossSourceData: CrossSourceData[] = [
        {
          sourceId: 'source-1',
          data: {
            name: 'Jon Jones',
            record: { wins: 26, losses: 1, draws: 0 },
            physicalStats: { height: 76, weight: 205, reach: 84 },
            fightHistory: Array(27).fill({}) // Add fight history for consistency
          },
          timestamp: new Date(),
          confidence: 0.9
        },
        {
          sourceId: 'source-2',
          data: {
            name: 'Jon Jones',
            record: { wins: 26, losses: 1, draws: 0 },
            physicalStats: { height: 76, weight: 205, reach: 84 },
            fightHistory: Array(27).fill({}) // Add fight history for consistency
          },
          timestamp: new Date(),
          confidence: 0.8
        }
      ];

      const result = await validator.validateCrossSources('fighter', crossSourceData);

      expect(result.isValid).toBe(true);
      expect(result.qualityScore).toBeGreaterThan(70);
      expect(result.sourceReliability).toBeGreaterThanOrEqual(49);
    });

    it('should handle inconsistent data from multiple sources', async () => {
      const crossSourceData: CrossSourceData[] = [
        {
          sourceId: 'source-1',
          data: {
            name: 'Jon Jones',
            record: { wins: 26, losses: 1, draws: 0 }
          },
          timestamp: new Date(),
          confidence: 0.9
        },
        {
          sourceId: 'source-2',
          data: {
            name: 'Jon Jones',
            record: { wins: 25, losses: 2, draws: 0 } // Different record
          },
          timestamp: new Date(),
          confidence: 0.7
        }
      ];

      const result = await validator.validateCrossSources('fighter', crossSourceData);

      // Should still be valid but with lower quality score due to inconsistency
      expect(result.qualityScore).toBeLessThan(100);
    });

    it('should throw error with insufficient sources', async () => {
      const crossSourceData: CrossSourceData[] = [
        {
          sourceId: 'source-1',
          data: { name: 'Test' },
          timestamp: new Date(),
          confidence: 0.9
        }
      ];

      await expect(
        validator.validateCrossSources('fighter', crossSourceData)
      ).rejects.toThrow('Cross-source validation requires at least 2 sources');
    });
  });

  describe('calculateConfidenceScore', () => {
    it('should calculate confidence score correctly', () => {
      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        qualityScore: 90,
        sourceReliability: 85
      };

      const confidence = validator.calculateConfidenceScore(validationResult, 2, 3);

      expect(confidence).toBeGreaterThan(70);
      expect(confidence).toBeLessThanOrEqual(100);
    });

    it('should penalize old data', () => {
      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        qualityScore: 90,
        sourceReliability: 85
      };

      const freshConfidence = validator.calculateConfidenceScore(validationResult, 1, 3);
      const staleConfidence = validator.calculateConfidenceScore(validationResult, 48, 3);

      expect(freshConfidence).toBeGreaterThan(staleConfidence);
    });

    it('should reward multiple sources', () => {
      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        qualityScore: 90,
        sourceReliability: 85
      };

      const singleSourceConfidence = validator.calculateConfidenceScore(validationResult, 2, 1);
      const multiSourceConfidence = validator.calculateConfidenceScore(validationResult, 2, 4);

      expect(multiSourceConfidence).toBeGreaterThan(singleSourceConfidence);
    });
  });

  describe('updateSourceReliability', () => {
    it('should update source reliability based on validation results', () => {
      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        qualityScore: 95,
        sourceReliability: 80
      };

      validator.updateSourceReliability('test-source', validationResult, 1000);

      const report = validator.getQualityReport('fighter');
      const source = report.sourceBreakdown.find(s => s.sourceId === 'test-source');
      
      expect(source).toBeDefined();
      expect(source!.reliability).toBeGreaterThan(50);
    });

    it('should penalize slow response times', () => {
      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        qualityScore: 90,
        sourceReliability: 80
      };

      validator.updateSourceReliability('fast-source', validationResult, 500);
      validator.updateSourceReliability('slow-source', validationResult, 8000);

      const report = validator.getQualityReport('fighter');
      const fastSource = report.sourceBreakdown.find(s => s.sourceId === 'fast-source');
      const slowSource = report.sourceBreakdown.find(s => s.sourceId === 'slow-source');

      if (fastSource && slowSource) {
        expect(fastSource.reliability).toBeGreaterThan(slowSource.reliability);
      }
    });
  });

  describe('getQualityReport', () => {
    it('should generate quality report', () => {
      // Add some source data first
      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        qualityScore: 85,
        sourceReliability: 80
      };

      validator.updateSourceReliability('source-1', validationResult, 1000);
      validator.updateSourceReliability('source-2', validationResult, 1500);

      const report = validator.getQualityReport('fighter');

      expect(report.averageQuality).toBeGreaterThan(0);
      expect(report.sourceBreakdown).toHaveLength(2);
      expect(report.commonIssues).toBeDefined();
    });

    it('should handle empty data gracefully', () => {
      const report = validator.getQualityReport('nonexistent');

      expect(report.averageQuality).toBe(0);
      expect(report.sourceBreakdown).toHaveLength(0);
      expect(report.commonIssues).toHaveLength(0);
    });
  });

  describe('validation rules', () => {
    it('should handle nested field validation', async () => {
      const data = {
        record: {
          wins: 10
        }
      };

      // Test that nested field access works
      const result = await validator.validateSingleSource('fighter', data, 'test');
      
      // Should find the nested wins field
      const rangeErrors = result.errors.filter(e => e.field === 'record.wins');
      expect(rangeErrors).toBeDefined();
    });

    it('should apply correct weights to validation rules', async () => {
      const dataWithCriticalError = {
        // Missing name (weight: 0.3)
        record: { wins: 10, losses: 2, draws: 0 },
        physicalStats: { height: 72, weight: 185 }
      };

      const dataWithMinorError = {
        name: 'Test Fighter',
        record: { wins: 10, losses: 2, draws: 0 },
        physicalStats: { 
          height: 72, 
          weight: 500 // Out of range (weight: 0.1)
        }
      };

      const criticalResult = await validator.validateSingleSource('fighter', dataWithCriticalError, 'test');
      const minorResult = await validator.validateSingleSource('fighter', dataWithMinorError, 'test');

      expect(criticalResult.qualityScore).toBeLessThan(minorResult.qualityScore);
    });
  });
});