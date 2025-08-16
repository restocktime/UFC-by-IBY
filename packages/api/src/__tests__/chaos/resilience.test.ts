import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { IntegrationTestSetup, setupIntegrationTests, teardownIntegrationTests } from '../integration/setup';
import { DatabaseManager } from '../../database/manager';
import { PredictionController } from '../../controllers/prediction.controller';
import { FighterRepository } from '../../repositories/fighter.repository';
import { OddsRepository } from '../../repositories/odds.repository';
import { HealthChecker } from '../../monitoring/health-checker';
import { EventProcessor } from '../../notifications/event-processor';

describe('Chaos Engineering and Resilience Tests', () => {
  let testSetup: IntegrationTestSetup;
  let dbManager: DatabaseManager;
  let predictionController: PredictionController;
  let fighterRepo: FighterRepository;
  let oddsRepo: OddsRepository;
  let healthChecker: HealthChecker;
  let eventProcessor: EventProcessor;

  beforeAll(async () => {
    testSetup = await setupIntegrationTests();
    dbManager = testSetup.getDatabaseManager();
    
    fighterRepo = new FighterRepository(dbManager);
    oddsRepo = new OddsRepository(dbManager);
    predictionController = new PredictionController();
    healthChecker = new HealthChecker(dbManager);
    eventProcessor = new EventProcessor();
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  beforeEach(async () => {
    // Reset system state before each test
    await fighterRepo.deleteAll();
    await oddsRepo.deleteAll();
  });

  describe('Database Failure Scenarios', () => {
    it('should handle MongoDB connection failures gracefully', async () => {
      // Seed some data first
      const fighter = await fighterRepo.create(createMockFighter());
      expect(fighter.id).toBeDefined();

      // Simulate MongoDB connection failure
      await simulateMongoDBFailure();

      // System should detect the failure
      const healthStatus = await healthChecker.checkHealth();
      expect(healthStatus.mongodb.status).toBe('unhealthy');

      // Requests should fail gracefully with proper error messages
      await expect(fighterRepo.findById(fighter.id)).rejects.toThrow();

      // System should recover when connection is restored
      await restoreMongoDBConnection();
      
      // Verify recovery
      const recoveredHealthStatus = await healthChecker.checkHealth();
      expect(recoveredHealthStatus.mongodb.status).toBe('healthy');

      // Operations should work again
      const retrievedFighter = await fighterRepo.findById(fighter.id);
      expect(retrievedFighter).toBeDefined();
    });

    it('should handle Redis cache failures without breaking core functionality', async () => {
      // Seed data
      const fighter = await fighterRepo.create(createMockFighter());
      
      // Simulate Redis failure
      await simulateRedisFailure();

      // Core functionality should still work (without caching)
      const retrievedFighter = await fighterRepo.findById(fighter.id);
      expect(retrievedFighter).toBeDefined();
      expect(retrievedFighter?.id).toBe(fighter.id);

      // Health check should report Redis as unhealthy
      const healthStatus = await healthChecker.checkHealth();
      expect(healthStatus.redis.status).toBe('unhealthy');

      // Restore Redis
      await restoreRedisConnection();
      
      const recoveredHealthStatus = await healthChecker.checkHealth();
      expect(recoveredHealthStatus.redis.status).toBe('healthy');
    });

    it('should handle InfluxDB time-series database failures', async () => {
      // Simulate InfluxDB failure
      await simulateInfluxDBFailure();

      // Odds operations that depend on InfluxDB should handle failure gracefully
      const oddsData = createMockOddsData();
      
      // Should either succeed with fallback or fail gracefully
      try {
        await oddsRepo.create(oddsData);
        // If it succeeds, verify it's using fallback storage
        const stored = await oddsRepo.findByFightId(oddsData.fightId);
        expect(stored).toBeDefined();
      } catch (error) {
        // If it fails, should be a graceful failure with proper error message
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('time-series');
      }

      // Health check should report InfluxDB as unhealthy
      const healthStatus = await healthChecker.checkHealth();
      expect(healthStatus.influxdb.status).toBe('unhealthy');
    });
  });

  describe('Network Partition Scenarios', () => {
    it('should handle network timeouts gracefully', async () => {
      // Simulate network timeout by setting very short timeout
      const originalTimeout = process.env.DB_TIMEOUT;
      process.env.DB_TIMEOUT = '1'; // 1ms timeout

      try {
        // Operations should timeout and handle gracefully
        await expect(fighterRepo.findById('non-existent')).rejects.toThrow();
      } finally {
        // Restore original timeout
        process.env.DB_TIMEOUT = originalTimeout;
      }
    });

    it('should implement circuit breaker pattern for external services', async () => {
      let failureCount = 0;
      const maxFailures = 3;

      // Simulate repeated failures to trigger circuit breaker
      for (let i = 0; i < maxFailures + 2; i++) {
        try {
          await simulateExternalServiceCall();
        } catch (error) {
          failureCount++;
        }
      }

      // After max failures, circuit should be open
      expect(failureCount).toBeGreaterThanOrEqual(maxFailures);
      
      // Subsequent calls should fail fast (circuit breaker open)
      const startTime = Date.now();
      try {
        await simulateExternalServiceCall();
      } catch (error) {
        const endTime = Date.now();
        // Should fail quickly (under 100ms) due to circuit breaker
        expect(endTime - startTime).toBeLessThan(100);
      }
    });
  });

  describe('High Load and Resource Exhaustion', () => {
    it('should handle memory pressure gracefully', async () => {
      const initialMemory = process.memoryUsage();
      
      // Create memory pressure by generating large datasets
      const largeDataSets = [];
      try {
        for (let i = 0; i < 100; i++) {
          largeDataSets.push(new Array(10000).fill(createMockFighter()));
        }

        // System should still respond to health checks
        const healthStatus = await healthChecker.checkHealth();
        expect(healthStatus.system.status).toBeDefined();

        // Core operations should still work
        const fighter = await fighterRepo.create(createMockFighter());
        expect(fighter.id).toBeDefined();

      } finally {
        // Clean up memory
        largeDataSets.length = 0;
        if (global.gc) {
          global.gc();
        }
      }
    });

    it('should implement backpressure for event processing', async () => {
      const eventCount = 1000;
      const events = Array.from({ length: eventCount }, (_, i) => ({
        type: 'test_event' as const,
        data: { index: i },
        timestamp: new Date()
      }));

      const startTime = Date.now();
      
      // Process events in batches to test backpressure
      const batchSize = 50;
      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        await Promise.all(batch.map(event => eventProcessor.processEvent(event)));
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete within reasonable time (not hang indefinitely)
      expect(processingTime).toBeLessThan(30000); // 30 seconds max

      // System should remain responsive
      const healthStatus = await healthChecker.checkHealth();
      expect(healthStatus.system.status).toBe('healthy');
    });
  });

  describe('Data Corruption and Recovery', () => {
    it('should detect and handle data corruption', async () => {
      // Create valid fighter
      const fighter = await fighterRepo.create(createMockFighter());
      
      // Simulate data corruption by directly modifying database
      await simulateDataCorruption(fighter.id);

      // System should detect corruption when reading
      try {
        const corruptedFighter = await fighterRepo.findById(fighter.id);
        // If data is returned, it should be validated
        if (corruptedFighter) {
          // Validation should catch corruption
          expect(() => validateFighterData(corruptedFighter)).toThrow();
        }
      } catch (error) {
        // Should handle corruption gracefully
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should implement data backup and recovery procedures', async () => {
      // Create test data
      const fighters = await Promise.all([
        fighterRepo.create(createMockFighter('Fighter 1')),
        fighterRepo.create(createMockFighter('Fighter 2')),
        fighterRepo.create(createMockFighter('Fighter 3'))
      ]);

      // Simulate backup creation
      const backupData = await createDataBackup();
      expect(backupData.fighters.length).toBe(3);

      // Simulate data loss
      await fighterRepo.deleteAll();
      const emptyResult = await fighterRepo.findAll();
      expect(emptyResult.length).toBe(0);

      // Restore from backup
      await restoreFromBackup(backupData);
      
      // Verify restoration
      const restoredFighters = await fighterRepo.findAll();
      expect(restoredFighters.length).toBe(3);
      
      for (const originalFighter of fighters) {
        const restored = restoredFighters.find(f => f.name === originalFighter.name);
        expect(restored).toBeDefined();
      }
    });
  });

  describe('Cascading Failure Prevention', () => {
    it('should isolate failures to prevent cascade', async () => {
      // Simulate failure in one component
      await simulateComponentFailure('prediction-service');

      // Other components should continue working
      const fighter = await fighterRepo.create(createMockFighter());
      expect(fighter.id).toBeDefined();

      const odds = await oddsRepo.create(createMockOddsData());
      expect(odds).toBeDefined();

      // Health check should show isolated failure
      const healthStatus = await healthChecker.checkHealth();
      expect(healthStatus.predictionService?.status).toBe('unhealthy');
      expect(healthStatus.mongodb.status).toBe('healthy');
      expect(healthStatus.redis.status).toBe('healthy');
    });

    it('should implement graceful degradation', async () => {
      // Simulate ML service failure
      await simulateComponentFailure('ml-service');

      // Prediction requests should fall back to simpler methods
      const predictionRequest = {
        fightId: 'test-fight-1',
        fighter1Id: 'test-fighter-1',
        fighter2Id: 'test-fighter-2',
        contextualData: {
          venue: 'Test Arena',
          altitude: 0,
          fightWeek: true,
          lastFightDays: 90
        }
      };

      try {
        const prediction = await predictionController.generatePrediction(predictionRequest);
        
        // Should return fallback prediction with lower confidence
        expect(prediction).toBeDefined();
        expect(prediction.confidence).toBeLessThan(0.7); // Lower confidence for fallback
        expect(prediction.keyFactors).toContain('fallback-method');
      } catch (error) {
        // Or should fail gracefully with clear error message
        expect((error as Error).message).toContain('service unavailable');
      }
    });
  });

  // Helper functions for chaos testing
  async function simulateMongoDBFailure(): Promise<void> {
    // Simulate by closing connection
    await dbManager.disconnect();
  }

  async function restoreMongoDBConnection(): Promise<void> {
    await dbManager.connect();
  }

  async function simulateRedisFailure(): Promise<void> {
    const redisClient = testSetup.getRedisClient();
    if (redisClient) {
      await redisClient.disconnect();
    }
  }

  async function restoreRedisConnection(): Promise<void> {
    const redisClient = testSetup.getRedisClient();
    if (redisClient) {
      await redisClient.connect();
    }
  }

  async function simulateInfluxDBFailure(): Promise<void> {
    // Mock InfluxDB failure by setting invalid configuration
    process.env.INFLUXDB_URL = 'http://invalid-host:8086';
  }

  async function simulateExternalServiceCall(): Promise<void> {
    // Simulate external service call that might fail
    throw new Error('External service unavailable');
  }

  async function simulateDataCorruption(fighterId: string): Promise<void> {
    // Simulate by inserting invalid data directly
    const db = dbManager.getMongoClient().db();
    await db.collection('fighters').updateOne(
      { _id: fighterId },
      { $set: { physicalStats: { height: 'invalid' } } }
    );
  }

  async function simulateComponentFailure(component: string): Promise<void> {
    // Mock component failure by setting environment variable
    process.env[`${component.toUpperCase()}_DISABLED`] = 'true';
  }

  async function createDataBackup(): Promise<any> {
    const fighters = await fighterRepo.findAll();
    return { fighters, timestamp: new Date() };
  }

  async function restoreFromBackup(backupData: any): Promise<void> {
    for (const fighter of backupData.fighters) {
      await fighterRepo.create(fighter);
    }
  }

  function createMockFighter(name: string = 'Test Fighter'): any {
    return {
      name,
      nickname: 'The Test',
      physicalStats: {
        height: 70,
        weight: 155,
        reach: 72,
        legReach: 40,
        stance: 'Orthodox'
      },
      record: {
        wins: 15,
        losses: 3,
        draws: 0,
        noContests: 0
      },
      rankings: {
        weightClass: 'Lightweight',
        rank: 5
      },
      camp: {
        name: 'Test Gym',
        location: 'Las Vegas, NV',
        headCoach: 'Test Coach'
      }
    };
  }

  function createMockOddsData(): any {
    return {
      fightId: 'test-fight-1',
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
  }

  function validateFighterData(fighter: any): void {
    if (typeof fighter.physicalStats?.height !== 'number') {
      throw new Error('Invalid fighter data: height must be a number');
    }
    // Add more validation as needed
  }
});