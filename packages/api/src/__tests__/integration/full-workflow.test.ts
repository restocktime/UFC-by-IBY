import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { IntegrationTestSetup, setupIntegrationTests, teardownIntegrationTests } from './setup';
import { SportsDataIOConnector } from '../../ingestion/connectors/sports-data-io.connector';
import { OddsAPIConnector } from '../../ingestion/connectors/odds-api.connector';
import { FighterRepository } from '../../repositories/fighter.repository';
import { FightRepository } from '../../repositories/fight.repository';
import { OddsRepository } from '../../repositories/odds.repository';
import { MetricsCalculator } from '../../features/metrics-calculator';
import { ContextualFeatureExtractor } from '../../features/contextual-feature-extractor';
import { OddsFeatureExtractor } from '../../features/odds-feature-extractor';
import { FightOutcomePredictor } from '../../../ml/src/models/fight-outcome-predictor';
import { EnsemblePredictor } from '../../../ml/src/models/ensemble-predictor';
import { PredictionController } from '../../controllers/prediction.controller';
import { Fighter, Fight, Event, OddsSnapshot } from '../../../shared/src/types';

describe('Full Workflow Integration Tests', () => {
  let testSetup: IntegrationTestSetup;
  let fighterRepo: FighterRepository;
  let fightRepo: FightRepository;
  let oddsRepo: OddsRepository;
  let metricsCalculator: MetricsCalculator;
  let contextualExtractor: ContextualFeatureExtractor;
  let oddsExtractor: OddsFeatureExtractor;
  let predictionController: PredictionController;

  beforeAll(async () => {
    testSetup = await setupIntegrationTests();
    const dbManager = testSetup.getDatabaseManager();
    
    fighterRepo = new FighterRepository(dbManager);
    fightRepo = new FightRepository(dbManager);
    oddsRepo = new OddsRepository(dbManager);
    metricsCalculator = new MetricsCalculator();
    contextualExtractor = new ContextualFeatureExtractor();
    oddsExtractor = new OddsFeatureExtractor();
    predictionController = new PredictionController();
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await fighterRepo.deleteAll();
    await fightRepo.deleteAll();
    await oddsRepo.deleteAll();
  });

  describe('Data Ingestion to Prediction Workflow', () => {
    it('should complete full workflow from data ingestion to prediction serving', async () => {
      // Step 1: Simulate data ingestion
      const mockFighterData = createMockFighterData();
      const mockFightData = createMockFightData();
      const mockOddsData = createMockOddsData();

      // Ingest fighter data
      const fighter1 = await fighterRepo.create(mockFighterData.fighter1);
      const fighter2 = await fighterRepo.create(mockFighterData.fighter2);
      
      expect(fighter1.id).toBeDefined();
      expect(fighter2.id).toBeDefined();

      // Ingest fight data
      const fight = await fightRepo.create({
        ...mockFightData,
        fighter1Id: fighter1.id,
        fighter2Id: fighter2.id
      });
      
      expect(fight.id).toBeDefined();

      // Ingest odds data
      const oddsSnapshots = mockOddsData.map(odds => ({
        ...odds,
        fightId: fight.id
      }));
      
      for (const odds of oddsSnapshots) {
        await oddsRepo.create(odds);
      }

      // Step 2: Feature engineering
      const fighter1Metrics = await metricsCalculator.calculateRollingMetrics(fighter1.id);
      const fighter2Metrics = await metricsCalculator.calculateRollingMetrics(fighter2.id);
      
      expect(fighter1Metrics).toBeDefined();
      expect(fighter2Metrics).toBeDefined();

      const contextualFeatures = await contextualExtractor.extractFeatures(fight.id);
      expect(contextualFeatures).toBeDefined();

      const oddsFeatures = await oddsExtractor.extractFeatures(fight.id);
      expect(oddsFeatures).toBeDefined();

      // Step 3: Generate prediction
      const predictionRequest = {
        fightId: fight.id,
        fighter1Id: fighter1.id,
        fighter2Id: fighter2.id,
        contextualData: contextualFeatures
      };

      const prediction = await predictionController.generatePrediction(predictionRequest);
      
      expect(prediction).toBeDefined();
      expect(prediction.winnerProbability).toBeDefined();
      expect(prediction.winnerProbability.fighter1).toBeGreaterThan(0);
      expect(prediction.winnerProbability.fighter2).toBeGreaterThan(0);
      expect(prediction.winnerProbability.fighter1 + prediction.winnerProbability.fighter2).toBeCloseTo(1, 2);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.keyFactors).toBeDefined();
      expect(Array.isArray(prediction.keyFactors)).toBe(true);

      // Step 4: Verify data consistency
      const retrievedFight = await fightRepo.findById(fight.id);
      expect(retrievedFight).toBeDefined();
      expect(retrievedFight?.fighter1Id).toBe(fighter1.id);
      expect(retrievedFight?.fighter2Id).toBe(fighter2.id);

      const fightOdds = await oddsRepo.findByFightId(fight.id);
      expect(fightOdds.length).toBe(mockOddsData.length);
    }, 30000); // 30 second timeout for full workflow

    it('should handle data ingestion failures gracefully', async () => {
      // Test with invalid fighter data
      const invalidFighterData = {
        name: '', // Invalid empty name
        physicalStats: {
          height: -1, // Invalid negative height
          weight: 0,
          reach: 0,
          legReach: 0,
          stance: 'Invalid' as any
        }
      };

      await expect(fighterRepo.create(invalidFighterData as any)).rejects.toThrow();
    });

    it('should maintain data consistency across repositories', async () => {
      const mockData = createMockFighterData();
      const fighter1 = await fighterRepo.create(mockData.fighter1);
      const fighter2 = await fighterRepo.create(mockData.fighter2);

      // Create fight
      const fight = await fightRepo.create({
        eventId: 'test-event-1',
        fighter1Id: fighter1.id,
        fighter2Id: fighter2.id,
        weightClass: 'Lightweight',
        titleFight: false,
        mainEvent: false,
        scheduledRounds: 3,
        status: 'scheduled'
      });

      // Verify referential integrity
      const fightWithFighters = await fightRepo.findByIdWithFighters(fight.id);
      expect(fightWithFighters).toBeDefined();
      expect(fightWithFighters?.fighter1?.id).toBe(fighter1.id);
      expect(fightWithFighters?.fighter2?.id).toBe(fighter2.id);
    });
  });

  describe('Real-time Data Processing', () => {
    it('should process odds updates in real-time', async () => {
      const mockData = createMockFighterData();
      const fighter1 = await fighterRepo.create(mockData.fighter1);
      const fighter2 = await fighterRepo.create(mockData.fighter2);

      const fight = await fightRepo.create({
        eventId: 'test-event-1',
        fighter1Id: fighter1.id,
        fighter2Id: fighter2.id,
        weightClass: 'Lightweight',
        titleFight: false,
        mainEvent: false,
        scheduledRounds: 3,
        status: 'scheduled'
      });

      // Simulate real-time odds updates
      const initialOdds: OddsSnapshot = {
        fightId: fight.id,
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: +130 },
        method: {
          ko: { fighter1: +300, fighter2: +250 },
          submission: { fighter1: +400, fighter2: +350 },
          decision: { fighter1: +200, fighter2: +180 }
        },
        rounds: {
          under2_5: -110,
          over2_5: -110
        }
      };

      await oddsRepo.create(initialOdds);

      // Update odds
      const updatedOdds: OddsSnapshot = {
        ...initialOdds,
        timestamp: new Date(Date.now() + 60000), // 1 minute later
        moneyline: { fighter1: -140, fighter2: +120 } // Line movement
      };

      await oddsRepo.create(updatedOdds);

      // Verify odds movement detection
      const oddsHistory = await oddsRepo.findByFightId(fight.id);
      expect(oddsHistory.length).toBe(2);
      
      const movement = await oddsExtractor.detectMovement(fight.id);
      expect(movement).toBeDefined();
      expect(movement.significantMovement).toBe(true);
    });
  });
});

// Helper functions for creating mock data
function createMockFighterData() {
  return {
    fighter1: {
      name: 'Test Fighter 1',
      nickname: 'The Test',
      physicalStats: {
        height: 70,
        weight: 155,
        reach: 72,
        legReach: 40,
        stance: 'Orthodox' as const
      },
      record: {
        wins: 15,
        losses: 3,
        draws: 0,
        noContests: 0
      },
      rankings: {
        weightClass: 'Lightweight' as const,
        rank: 5
      },
      camp: {
        name: 'Test Gym 1',
        location: 'Las Vegas, NV',
        headCoach: 'Test Coach 1'
      }
    },
    fighter2: {
      name: 'Test Fighter 2',
      nickname: 'The Challenger',
      physicalStats: {
        height: 68,
        weight: 155,
        reach: 70,
        legReach: 38,
        stance: 'Southpaw' as const
      },
      record: {
        wins: 12,
        losses: 5,
        draws: 1,
        noContests: 0
      },
      rankings: {
        weightClass: 'Lightweight' as const,
        rank: 8
      },
      camp: {
        name: 'Test Gym 2',
        location: 'New York, NY',
        headCoach: 'Test Coach 2'
      }
    }
  };
}

function createMockFightData() {
  return {
    eventId: 'test-event-1',
    weightClass: 'Lightweight' as const,
    titleFight: false,
    mainEvent: false,
    scheduledRounds: 3,
    status: 'scheduled' as const
  };
}

function createMockOddsData(): Omit<OddsSnapshot, 'fightId'>[] {
  return [
    {
      sportsbook: 'DraftKings',
      timestamp: new Date(),
      moneyline: { fighter1: -150, fighter2: +130 },
      method: {
        ko: { fighter1: +300, fighter2: +250 },
        submission: { fighter1: +400, fighter2: +350 },
        decision: { fighter1: +200, fighter2: +180 }
      },
      rounds: {
        under2_5: -110,
        over2_5: -110
      }
    },
    {
      sportsbook: 'FanDuel',
      timestamp: new Date(),
      moneyline: { fighter1: -145, fighter2: +125 },
      method: {
        ko: { fighter1: +290, fighter2: +240 },
        submission: { fighter1: +390, fighter2: +340 },
        decision: { fighter1: +190, fighter2: +170 }
      },
      rounds: {
        under2_5: -105,
        over2_5: -115
      }
    }
  ];
}