/**
 * Unit tests for PredictionController
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PredictionController } from '../prediction.controller.js';
import { DatabaseManager } from '../../database/manager.js';

// Mock dependencies
vi.mock('../../database/manager.js');
vi.mock('../../repositories/fighter.repository.js');
vi.mock('../../repositories/fight.repository.js');
vi.mock('../../repositories/odds.repository.js');
vi.mock('../../features/metrics-calculator.js');
vi.mock('../../features/contextual-feature-extractor.js');
vi.mock('../../features/odds-feature-extractor.js');

describe('PredictionController Unit Tests', () => {
  let dbManager: DatabaseManager;
  let predictionController: PredictionController;

  const mockFight = {
    id: 'fight-123',
    fighter1Id: 'fighter-1',
    fighter2Id: 'fighter-2',
    titleFight: false,
    mainEvent: true,
    scheduledRounds: 3,
    weightClass: 'Lightweight'
  };

  const mockFighter1 = {
    id: 'fighter-1',
    name: 'John Doe',
    record: { wins: 15, losses: 3, draws: 0 },
    physicalStats: { height: 72, weight: 155, reach: 74 },
    dateOfBirth: new Date('1990-01-01')
  };

  const mockFighter2 = {
    id: 'fighter-2',
    name: 'Jane Smith',
    record: { wins: 12, losses: 2, draws: 1 },
    physicalStats: { height: 70, weight: 155, reach: 72 },
    dateOfBirth: new Date('1992-06-15')
  };

  const mockPrediction = {
    winnerProbability: { fighter1: 0.65, fighter2: 0.35 },
    methodPrediction: { ko: 0.3, submission: 0.2, decision: 0.5 },
    roundPrediction: { round1: 0.15, round2: 0.25, round3: 0.6 },
    confidence: 0.75,
    keyFactors: [
      { feature: 'striking_accuracy', importance: 0.3, description: 'Fighter 1 has superior striking accuracy' },
      { feature: 'experience', importance: 0.25, description: 'Fighter 1 has more experience' }
    ],
    modelVersion: 'ensemble_v1.0.0',
    timestamp: new Date()
  };

  beforeEach(() => {
    // Mock database manager
    dbManager = new DatabaseManager({
      mongodb: { uri: 'mongodb://localhost:27017/test' },
      influxdb: { url: 'http://localhost:8086', token: 'test', org: 'test', bucket: 'test' },
      redis: { host: 'localhost', port: 6379 }
    });

    // Create controller instance
    predictionController = new PredictionController(dbManager);

    // Mock repository methods
    vi.mocked(predictionController['fightRepository'].findById).mockResolvedValue(mockFight);
    vi.mocked(predictionController['fighterRepository'].findById)
      .mockImplementation(async (id: string) => {
        if (id === 'fighter-1') return mockFighter1;
        if (id === 'fighter-2') return mockFighter2;
        return null;
      });

    // Mock feature extractors
    vi.mocked(predictionController['metricsCalculator'].calculateFighterMetrics).mockResolvedValue({
      strikingAccuracy: 0.65,
      takedownDefense: 0.75,
      winStreak: 3,
      recentForm: 0.8
    });

    vi.mocked(predictionController['contextualExtractor'].extractFeatures).mockResolvedValue({
      fighter1DaysSinceLastFight: 90,
      fighter2DaysSinceLastFight: 120,
      campData: {
        fighter1Camp: 'Team Alpha',
        fighter2Camp: 'Team Beta',
        trainingPartners: []
      },
      injuryReports: {
        fighter1Injuries: [],
        fighter2Injuries: []
      },
      weightCut: {
        fighter1WeightCutHistory: [10, 12, 8],
        fighter2WeightCutHistory: [15, 18, 12]
      },
      layoff: {
        fighter1DaysSinceLastFight: 90,
        fighter2DaysSinceLastFight: 120
      }
    });

    vi.mocked(predictionController['oddsExtractor'].extractFeatures).mockResolvedValue({
      impliedProbability1: 0.6,
      impliedProbability2: 0.4,
      movementScore: 0.1
    });

    // Mock ML prediction generation
    vi.spyOn(predictionController as any, 'generateMLPrediction').mockResolvedValue(mockPrediction);
  });

  describe('Prediction Generation', () => {
    it('should generate prediction for valid fight', async () => {
      const prediction = await predictionController['generatePrediction'](mockFight);

      expect(prediction).toHaveProperty('winnerProbability');
      expect(prediction).toHaveProperty('methodPrediction');
      expect(prediction).toHaveProperty('roundPrediction');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction).toHaveProperty('keyFactors');
      expect(prediction).toHaveProperty('modelVersion');
      expect(prediction).toHaveProperty('timestamp');

      expect(prediction.winnerProbability.fighter1).toBeGreaterThan(0);
      expect(prediction.winnerProbability.fighter2).toBeGreaterThan(0);
      expect(prediction.winnerProbability.fighter1 + prediction.winnerProbability.fighter2).toBeCloseTo(1, 2);
    });

    it('should handle missing fighter data', async () => {
      vi.mocked(predictionController['fighterRepository'].findById).mockResolvedValue(null);

      await expect(predictionController['generatePrediction'](mockFight))
        .rejects.toThrow('Fighter data not found');
    });

    it('should validate prediction request', async () => {
      const invalidFight = { ...mockFight, fighter1Id: mockFight.fighter2Id }; // Same fighter IDs

      await expect(predictionController['generatePrediction'](invalidFight))
        .rejects.toThrow('Invalid prediction request');
    });
  });

  describe('Feature Extraction', () => {
    it('should extract fight features correctly', async () => {
      const features = await predictionController['extractFightFeatures'](mockFight);

      expect(features).toHaveProperty('mlFeatures');
      expect(features).toHaveProperty('contextualData');

      const { mlFeatures } = features;
      expect(mlFeatures).toHaveProperty('fighter1StrikingAccuracy');
      expect(mlFeatures).toHaveProperty('fighter2StrikingAccuracy');
      expect(mlFeatures).toHaveProperty('reachAdvantage');
      expect(mlFeatures).toHaveProperty('heightAdvantage');
      expect(mlFeatures).toHaveProperty('titleFight');
      expect(mlFeatures).toHaveProperty('mainEvent');

      expect(mlFeatures.titleFight).toBe(0); // mockFight.titleFight is false
      expect(mlFeatures.mainEvent).toBe(1); // mockFight.mainEvent is true
    });

    it('should calculate fighter advantages correctly', async () => {
      const features = await predictionController['extractFightFeatures'](mockFight);
      const { mlFeatures } = features;

      // Based on mock data: fighter1 reach=74, fighter2 reach=72
      expect(mlFeatures.reachAdvantage).toBe(2);
      
      // Based on mock data: fighter1 height=72, fighter2 height=70
      expect(mlFeatures.heightAdvantage).toBe(2);

      // Experience advantage: fighter1 (15+3=18) vs fighter2 (12+2=14)
      expect(mlFeatures.experienceAdvantage).toBe(4);
    });
  });

  describe('Caching', () => {
    it('should cache predictions', () => {
      const fightId = 'fight-123';
      const prediction = mockPrediction;

      predictionController['cachePrediction'](fightId, prediction);
      const cached = predictionController['getCachedPrediction'](fightId);

      expect(cached).toBeTruthy();
      expect(cached?.prediction).toEqual(prediction);
    });

    it('should return null for non-existent cache', () => {
      const cached = predictionController['getCachedPrediction']('non-existent');
      expect(cached).toBeNull();
    });

    it('should expire cache after TTL', () => {
      const fightId = 'fight-123';
      const prediction = mockPrediction;

      // Set very short TTL
      predictionController.setCacheTimeout(0.001);
      predictionController['cachePrediction'](fightId, prediction);

      // Wait for expiration
      setTimeout(() => {
        const cached = predictionController['getCachedPrediction'](fightId);
        expect(cached).toBeNull();
      }, 10);
    });
  });

  describe('ML Prediction Logic', () => {
    it('should generate reasonable predictions', async () => {
      const features = {
        fighter1StrikingAccuracy: 0.7,
        fighter1TakedownDefense: 0.8,
        fighter1WinStreak: 3,
        fighter1RecentForm: 0.9,
        fighter1Experience: 20,
        fighter1Age: 28,
        fighter1Reach: 74,
        fighter1Height: 72,
        fighter1Weight: 155,
        fighter2StrikingAccuracy: 0.6,
        fighter2TakedownDefense: 0.7,
        fighter2WinStreak: 1,
        fighter2RecentForm: 0.7,
        fighter2Experience: 15,
        fighter2Age: 30,
        fighter2Reach: 72,
        fighter2Height: 70,
        fighter2Weight: 155,
        reachAdvantage: 2,
        heightAdvantage: 2,
        experienceAdvantage: 5,
        ageAdvantage: -2,
        titleFight: 0,
        mainEvent: 1,
        scheduledRounds: 3,
        daysSinceLastFight1: 90,
        daysSinceLastFight2: 120,
        impliedProbability1: 0.6,
        impliedProbability2: 0.4,
        oddsMovement: 0.1
      };

      // Remove mock to test actual logic
      vi.restoreAllMocks();
      
      const prediction = await predictionController['generateMLPrediction'](features);

      expect(prediction.winnerProbability.fighter1).toBeGreaterThan(0.5); // Fighter 1 should be favored
      expect(prediction.winnerProbability.fighter1 + prediction.winnerProbability.fighter2).toBeCloseTo(1, 2);
      expect(prediction.methodPrediction.ko + prediction.methodPrediction.submission + prediction.methodPrediction.decision).toBeCloseTo(1, 2);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.keyFactors).toHaveLength(4);
    });

    it('should calculate fighter advantage correctly', () => {
      const features = {
        fighter1StrikingAccuracy: 0.8,
        fighter2StrikingAccuracy: 0.6,
        fighter1TakedownDefense: 0.9,
        fighter2TakedownDefense: 0.7,
        fighter1RecentForm: 0.8,
        fighter2RecentForm: 0.6,
        experienceAdvantage: 5,
        reachAdvantage: 3,
        heightAdvantage: 2
      } as any;

      const advantage = predictionController['calculateFighterAdvantage'](features);
      expect(advantage).toBeGreaterThan(0); // Fighter 1 should have advantage
      expect(advantage).toBeLessThanOrEqual(0.4); // Should be capped
    });
  });

  describe('Prediction History', () => {
    it('should store prediction history', () => {
      const fightId = 'fight-123';
      const prediction = mockPrediction;

      predictionController['storePredictionHistory'](fightId, prediction);
      
      const history = predictionController['predictionHistory'];
      expect(history).toHaveLength(1);
      expect(history[0].fightId).toBe(fightId);
      expect(history[0].prediction).toEqual(prediction);
    });

    it('should limit history size', () => {
      // Add more than 1000 predictions
      for (let i = 0; i < 1005; i++) {
        predictionController['storePredictionHistory'](`fight-${i}`, mockPrediction);
      }

      const history = predictionController['predictionHistory'];
      expect(history).toHaveLength(1000); // Should be capped at 1000
    });
  });

  describe('Utility Functions', () => {
    it('should calculate age correctly', () => {
      const birthDate = new Date('1990-01-01');
      const age = predictionController['calculateAge'](birthDate);
      
      // Age should be around 34-35 depending on current date
      expect(age).toBeGreaterThan(30);
      expect(age).toBeLessThan(40);
    });

    it('should add feature noise for bootstrap sampling', () => {
      const originalFeatures = {
        fighter1StrikingAccuracy: 0.7,
        fighter2StrikingAccuracy: 0.6,
        reachAdvantage: 2
      } as any;

      const noisyFeatures = predictionController['addFeatureNoise'](originalFeatures, 0.1);
      
      // Values should be different but close
      expect(noisyFeatures.fighter1StrikingAccuracy).not.toBe(originalFeatures.fighter1StrikingAccuracy);
      expect(Math.abs(noisyFeatures.fighter1StrikingAccuracy - originalFeatures.fighter1StrikingAccuracy)).toBeLessThan(0.2);
    });

    it('should calculate standard error', () => {
      const values = [0.5, 0.6, 0.7, 0.8, 0.9];
      const standardError = predictionController['calculateStandardError'](values);
      
      expect(standardError).toBeGreaterThan(0);
      expect(standardError).toBeLessThan(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      vi.mocked(predictionController['fightRepository'].findById)
        .mockRejectedValue(new Error('Database connection failed'));

      await expect(predictionController['generatePrediction'](mockFight))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle feature extraction errors', async () => {
      vi.mocked(predictionController['metricsCalculator'].calculateFighterMetrics)
        .mockRejectedValue(new Error('Feature extraction failed'));

      await expect(predictionController['generatePrediction'](mockFight))
        .rejects.toThrow('Feature extraction failed');
    });
  });
});