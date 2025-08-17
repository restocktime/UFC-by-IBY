/**
 * Tests for RealTimeFeatureEngineeringService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { realTimeFeatureEngineeringService, RealTimeFeatureEngineeringService } from '../real-time-feature-engineering.service.js';
import { FightData, FighterData, OddsData } from '@ufc-platform/shared';

describe('RealTimeFeatureEngineeringService', () => {
  let service: RealTimeFeatureEngineeringService;
  let mockFightData: FightData;
  let mockFighter1Data: FighterData;
  let mockFighter2Data: FighterData;
  let mockOddsData: OddsData[];

  beforeEach(() => {
    service = new RealTimeFeatureEngineeringService();
    
    mockFightData = {
      id: 'fight_123',
      fighter1: { name: 'Fighter One', id: 'f1' },
      fighter2: { name: 'Fighter Two', id: 'f2' },
      weightClass: 'Lightweight',
      isTitleFight: true,
      isMainEvent: true,
      scheduledRounds: 5,
      eventId: 'event_123'
    } as FightData;

    mockFighter1Data = {
      id: 'f1',
      name: 'Fighter One',
      dateOfBirth: '1990-01-01',
      stats: {
        strikingAccuracy: 0.65,
        takedownDefense: 0.80,
        significantStrikes: 150,
        takedowns: 5
      },
      physicalStats: {
        height: 180,
        weight: 70,
        reach: 175
      },
      record: {
        wins: 15,
        losses: 3,
        draws: 0,
        totalFights: 18
      }
    } as FighterData;

    mockFighter2Data = {
      id: 'f2',
      name: 'Fighter Two',
      dateOfBirth: '1988-06-15',
      stats: {
        strikingAccuracy: 0.58,
        takedownDefense: 0.75,
        significantStrikes: 120,
        takedowns: 8
      },
      physicalStats: {
        height: 175,
        weight: 70,
        reach: 170
      },
      record: {
        wins: 12,
        losses: 5,
        draws: 1,
        totalFights: 18
      }
    } as FighterData;

    mockOddsData = [
      {
        id: 'odds_1',
        fightId: 'fight_123',
        fighter: 'Fighter One',
        sportsbook: 'DraftKings',
        odds: 1.8,
        timestamp: new Date(),
        market: 'moneyline'
      },
      {
        id: 'odds_2',
        fightId: 'fight_123',
        fighter: 'Fighter Two',
        sportsbook: 'DraftKings',
        odds: 2.2,
        timestamp: new Date(),
        market: 'moneyline'
      }
    ] as OddsData[];
  });

  describe('extractFeatures', () => {
    it('should extract complete feature engineering', async () => {
      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      expect(engineering).toBeDefined();
      expect(engineering.baseFeatures).toBeDefined();
      expect(engineering.dynamicFeatures).toBeDefined();
      expect(engineering.derivedFeatures).toBeDefined();
      expect(engineering.contextualFeatures).toBeDefined();
      expect(engineering.temporalFeatures).toBeDefined();
    });

    it('should extract base features correctly', async () => {
      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      const features = engineering.baseFeatures;
      
      // Fighter 1 features
      expect(features.fighter1StrikingAccuracy).toBe(0.65);
      expect(features.fighter1TakedownDefense).toBe(0.80);
      expect(features.fighter1Experience).toBe(18);
      expect(features.fighter1Height).toBe(180);
      expect(features.fighter1Weight).toBe(70);
      expect(features.fighter1Reach).toBe(175);

      // Fighter 2 features
      expect(features.fighter2StrikingAccuracy).toBe(0.58);
      expect(features.fighter2TakedownDefense).toBe(0.75);
      expect(features.fighter2Experience).toBe(18);
      expect(features.fighter2Height).toBe(175);
      expect(features.fighter2Weight).toBe(70);
      expect(features.fighter2Reach).toBe(170);
    });

    it('should calculate comparative features correctly', async () => {
      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      const features = engineering.baseFeatures;
      
      expect(features.reachAdvantage).toBe(5); // 175 - 170
      expect(features.heightAdvantage).toBe(5); // 180 - 175
      expect(features.experienceAdvantage).toBe(0); // 18 - 18
      expect(features.ageAdvantage).toBeGreaterThan(0); // Fighter 2 is older
    });

    it('should extract contextual features correctly', async () => {
      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      const features = engineering.baseFeatures;
      
      expect(features.titleFight).toBe(1); // Is title fight
      expect(features.mainEvent).toBe(1); // Is main event
      expect(features.scheduledRounds).toBe(5); // Title fight rounds
    });

    it('should extract odds features correctly', async () => {
      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      const features = engineering.baseFeatures;
      
      expect(features.impliedProbability1).toBeDefined();
      expect(features.impliedProbability2).toBeDefined();
      expect(features.oddsMovement).toBeDefined();
      
      // Probabilities should sum to approximately 1 (after normalization)
      const total = features.impliedProbability1! + features.impliedProbability2!;
      expect(total).toBeCloseTo(1, 1);
    });

    it('should generate dynamic features', async () => {
      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      expect(Array.isArray(engineering.dynamicFeatures)).toBe(true);
      
      for (const feature of engineering.dynamicFeatures) {
        expect(feature.name).toBeDefined();
        expect(typeof feature.value).toBe('number');
        expect(typeof feature.importance).toBe('number');
        expect(feature.source).toBeDefined();
        expect(feature.timestamp).toBeInstanceOf(Date);
        expect(typeof feature.confidence).toBe('number');
        expect(feature.confidence).toBeGreaterThanOrEqual(0);
        expect(feature.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should create derived features', async () => {
      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      expect(Array.isArray(engineering.derivedFeatures)).toBe(true);
      expect(engineering.derivedFeatures.length).toBeGreaterThan(0);
      
      // Should have composite skill features
      const fighter1Composite = engineering.derivedFeatures.find(
        f => f.name === 'fighter1_composite_skill'
      );
      expect(fighter1Composite).toBeDefined();
      expect(fighter1Composite?.value).toBeGreaterThan(0);
      expect(fighter1Composite?.dependencies).toContain('fighter1StrikingAccuracy');
      
      const fighter2Composite = engineering.derivedFeatures.find(
        f => f.name === 'fighter2_composite_skill'
      );
      expect(fighter2Composite).toBeDefined();
    });

    it('should extract contextual features', async () => {
      const contextData = {
        eventImportance: 'high',
        venue: 'T-Mobile Arena'
      };

      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData,
        contextData
      );

      expect(Array.isArray(engineering.contextualFeatures)).toBe(true);
      
      for (const feature of engineering.contextualFeatures) {
        expect(feature.name).toBeDefined();
        expect(typeof feature.value).toBe('number');
        expect(feature.context).toBeDefined();
        expect(typeof feature.relevance).toBe('number');
        expect(feature.relevance).toBeGreaterThanOrEqual(0);
        expect(feature.relevance).toBeLessThanOrEqual(1);
      }
    });

    it('should emit featuresExtracted event', async () => {
      const eventSpy = vi.fn();
      service.on('featuresExtracted', eventSpy);

      await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fightId: 'fight_123',
          engineering: expect.any(Object),
          processingTime: expect.any(Number)
        })
      );
    });

    it('should handle missing data gracefully', async () => {
      const incompleteFighter1 = {
        ...mockFighter1Data,
        stats: undefined,
        physicalStats: undefined
      };

      const engineering = await service.extractFeatures(
        mockFightData,
        incompleteFighter1,
        mockFighter2Data,
        mockOddsData
      );

      expect(engineering).toBeDefined();
      expect(engineering.baseFeatures.fighter1StrikingAccuracy).toBe(0);
      expect(engineering.baseFeatures.fighter1Height).toBe(0);
    });
  });

  describe('updateFeatures', () => {
    it('should update features with new odds data', async () => {
      // First extract initial features
      await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      // Update with new odds
      const newOddsData: OddsData[] = [
        {
          id: 'odds_3',
          fightId: 'fight_123',
          fighter: 'Fighter One',
          sportsbook: 'FanDuel',
          odds: 1.9,
          timestamp: new Date(),
          market: 'moneyline'
        }
      ];

      const updatedEngineering = await service.updateFeatures('fight_123', {
        oddsData: newOddsData
      });

      expect(updatedEngineering).toBeDefined();
      expect(updatedEngineering?.baseFeatures.impliedProbability1).toBeDefined();
    });

    it('should return null for non-existent fight', async () => {
      const result = await service.updateFeatures('non_existent_fight', {
        oddsData: mockOddsData
      });

      expect(result).toBeNull();
    });

    it('should emit featuresUpdated event', async () => {
      // First extract initial features
      await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      const eventSpy = vi.fn();
      service.on('featuresUpdated', eventSpy);

      await service.updateFeatures('fight_123', {
        oddsData: mockOddsData
      });

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fightId: 'fight_123',
          updatedFeatures: expect.any(Object),
          updateType: expect.arrayContaining(['oddsData'])
        })
      );
    });
  });

  describe('getCachedFeatures', () => {
    it('should return cached features after extraction', async () => {
      await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      const cached = service.getCachedFeatures('fight_123');
      
      expect(cached).toBeDefined();
      expect(cached?.fightId).toBe('fight_123');
      expect(cached?.features).toBeDefined();
      expect(cached?.metadata).toBeDefined();
      expect(cached?.timestamp).toBeInstanceOf(Date);
    });

    it('should return null for non-cached fight', () => {
      const cached = service.getCachedFeatures('non_existent_fight');
      expect(cached).toBeNull();
    });
  });

  describe('getFeatureImportance', () => {
    it('should return feature importance map', () => {
      const importance = service.getFeatureImportance();
      
      expect(importance).toBeInstanceOf(Map);
      expect(importance.size).toBeGreaterThan(0);
      
      // Should have some default importance scores
      expect(importance.has('fighter1StrikingAccuracy')).toBe(true);
      expect(importance.has('fighter2StrikingAccuracy')).toBe(true);
      
      // Values should be between 0 and 1
      for (const [feature, score] of importance) {
        expect(typeof score).toBe('number');
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('updateFeatureImportance', () => {
    it('should update feature importance scores', () => {
      const updates = [
        {
          feature: 'fighter1StrikingAccuracy',
          oldImportance: 0.15,
          newImportance: 0.20,
          reason: 'Model feedback indicates higher importance',
          timestamp: new Date()
        }
      ];

      service.updateFeatureImportance(updates);

      const importance = service.getFeatureImportance();
      expect(importance.get('fighter1StrikingAccuracy')).toBe(0.20);
    });

    it('should emit featureImportanceUpdated event', () => {
      const eventSpy = vi.fn();
      service.on('featureImportanceUpdated', eventSpy);

      const update = {
        feature: 'fighter1StrikingAccuracy',
        oldImportance: 0.15,
        newImportance: 0.20,
        reason: 'Model feedback',
        timestamp: new Date()
      };

      service.updateFeatureImportance([update]);

      expect(eventSpy).toHaveBeenCalledWith(update);
    });
  });

  describe('feature quality metrics', () => {
    it('should calculate feature metadata with quality metrics', async () => {
      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      const cached = service.getCachedFeatures('fight_123');
      expect(cached?.metadata).toBeDefined();
      
      const metadata = cached!.metadata;
      expect(typeof metadata.dataQuality).toBe('number');
      expect(typeof metadata.completeness).toBe('number');
      expect(typeof metadata.confidence).toBe('number');
      expect(typeof metadata.staleness).toBe('number');
      expect(Array.isArray(metadata.sources)).toBe(true);
      expect(metadata.version).toBeDefined();
      
      // Quality metrics should be between 0 and 1
      expect(metadata.dataQuality).toBeGreaterThanOrEqual(0);
      expect(metadata.dataQuality).toBeLessThanOrEqual(1);
      expect(metadata.completeness).toBeGreaterThanOrEqual(0);
      expect(metadata.completeness).toBeLessThanOrEqual(1);
      expect(metadata.confidence).toBeGreaterThanOrEqual(0);
      expect(metadata.confidence).toBeLessThanOrEqual(1);
    });

    it('should calculate completeness correctly', async () => {
      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      const cached = service.getCachedFeatures('fight_123');
      const completeness = cached!.metadata.completeness;
      
      // With complete mock data, completeness should be high
      expect(completeness).toBeGreaterThan(0.5);
    });
  });

  describe('error handling', () => {
    it.skip('should handle extraction errors gracefully', async () => {
      const eventSpy = vi.fn();
      service.on('featureExtractionError', eventSpy);

      // Create invalid data that might cause errors
      const invalidFightData = null as any;

      try {
        await service.extractFeatures(
          invalidFightData,
          mockFighter1Data,
          mockFighter2Data,
          mockOddsData
        );
        // If no error is thrown, fail the test
        expect.fail('Expected extractFeatures to throw an error');
      } catch (error) {
        // Error was thrown as expected
        expect(error).toBeDefined();
      }

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('temporal features', () => {
    it('should generate temporal features when history exists', async () => {
      // Extract features multiple times to build history
      await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      // Update features to create history
      await service.updateFeatures('fight_123', {
        oddsData: [
          {
            ...mockOddsData[0],
            odds: 1.9,
            timestamp: new Date()
          }
        ]
      });

      const engineering = await service.extractFeatures(
        mockFightData,
        mockFighter1Data,
        mockFighter2Data,
        mockOddsData
      );

      expect(Array.isArray(engineering.temporalFeatures)).toBe(true);
      
      for (const feature of engineering.temporalFeatures) {
        expect(feature.name).toBeDefined();
        expect(typeof feature.value).toBe('number');
        expect(feature.timeWindow).toBeDefined();
        expect(['increasing', 'decreasing', 'stable']).toContain(feature.trend);
      }
    });
  });
});