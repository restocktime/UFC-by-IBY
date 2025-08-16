import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { IntegrationTestSetup, setupIntegrationTests, teardownIntegrationTests } from '../integration/setup';
import { PredictionController } from '../../controllers/prediction.controller';
import { FighterController } from '../../controllers/fighter.controller';
import { OddsController } from '../../controllers/odds.controller';
import { FighterRepository } from '../../repositories/fighter.repository';
import { FightRepository } from '../../repositories/fight.repository';
import { OddsRepository } from '../../repositories/odds.repository';

describe('Performance and Load Testing', () => {
  let testSetup: IntegrationTestSetup;
  let predictionController: PredictionController;
  let fighterController: FighterController;
  let oddsController: OddsController;
  let fighterRepo: FighterRepository;
  let fightRepo: FightRepository;
  let oddsRepo: OddsRepository;

  beforeAll(async () => {
    testSetup = await setupIntegrationTests();
    const dbManager = testSetup.getDatabaseManager();
    
    fighterRepo = new FighterRepository(dbManager);
    fightRepo = new FightRepository(dbManager);
    oddsRepo = new OddsRepository(dbManager);
    
    predictionController = new PredictionController();
    fighterController = new FighterController();
    oddsController = new OddsController();

    // Seed test data
    await seedTestData();
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  describe('Concurrent User Load Tests', () => {
    it('should handle 100 concurrent prediction requests', async () => {
      const concurrentRequests = 100;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentRequests }, async (_, index) => {
        const request = {
          fightId: `test-fight-${index % 10}`, // Rotate through 10 fights
          fighter1Id: `test-fighter-${index % 20}`,
          fighter2Id: `test-fighter-${(index % 20) + 1}`,
          contextualData: {
            venue: 'Test Arena',
            altitude: 0,
            fightWeek: true,
            lastFightDays: 90
          }
        };
        
        return predictionController.generatePrediction(request);
      });

      const results = await Promise.allSettled(promises);
      const endTime = performance.now();
      
      const successfulRequests = results.filter(r => r.status === 'fulfilled').length;
      const failedRequests = results.filter(r => r.status === 'rejected').length;
      const totalTime = endTime - startTime;
      const avgResponseTime = totalTime / concurrentRequests;

      console.log(`Load Test Results:
        - Total Requests: ${concurrentRequests}
        - Successful: ${successfulRequests}
        - Failed: ${failedRequests}
        - Total Time: ${totalTime.toFixed(2)}ms
        - Average Response Time: ${avgResponseTime.toFixed(2)}ms
        - Requests per Second: ${(concurrentRequests / (totalTime / 1000)).toFixed(2)}`);

      expect(successfulRequests).toBeGreaterThan(concurrentRequests * 0.95); // 95% success rate
      expect(avgResponseTime).toBeLessThan(1000); // Under 1 second average
    }, 60000);

    it('should handle concurrent fighter data requests', async () => {
      const concurrentRequests = 200;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentRequests }, async (_, index) => {
        const fighterId = `test-fighter-${index % 50}`;
        return fighterController.getFighterProfile(fighterId);
      });

      const results = await Promise.allSettled(promises);
      const endTime = performance.now();
      
      const successfulRequests = results.filter(r => r.status === 'fulfilled').length;
      const totalTime = endTime - startTime;
      const avgResponseTime = totalTime / concurrentRequests;

      expect(successfulRequests).toBeGreaterThan(concurrentRequests * 0.98); // 98% success rate
      expect(avgResponseTime).toBeLessThan(100); // Under 100ms average for cached data
    }, 30000);

    it('should handle concurrent odds updates', async () => {
      const concurrentUpdates = 50;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentUpdates }, async (_, index) => {
        const oddsUpdate = {
          fightId: `test-fight-${index % 10}`,
          sportsbook: `Sportsbook-${index % 5}`,
          timestamp: new Date(),
          moneyline: { 
            fighter1: -150 + (Math.random() * 50), 
            fighter2: 130 + (Math.random() * 50) 
          },
          method: {
            ko: { fighter1: 300, fighter2: 250 },
            submission: { fighter1: 400, fighter2: 350 },
            decision: { fighter1: 200, fighter2: 180 }
          },
          rounds: {
            under2_5: -110,
            over2_5: -110
          }
        };
        
        return oddsRepo.create(oddsUpdate);
      });

      const results = await Promise.allSettled(promises);
      const endTime = performance.now();
      
      const successfulUpdates = results.filter(r => r.status === 'fulfilled').length;
      const totalTime = endTime - startTime;

      expect(successfulUpdates).toBe(concurrentUpdates);
      expect(totalTime).toBeLessThan(5000); // Under 5 seconds for all updates
    }, 15000);
  });

  describe('Memory and Resource Usage Tests', () => {
    it('should not have memory leaks during extended operation', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform 1000 operations
      for (let i = 0; i < 1000; i++) {
        await predictionController.generatePrediction({
          fightId: `test-fight-${i % 10}`,
          fighter1Id: `test-fighter-${i % 20}`,
          fighter2Id: `test-fighter-${(i % 20) + 1}`,
          contextualData: {
            venue: 'Test Arena',
            altitude: 0,
            fightWeek: true,
            lastFightDays: 90
          }
        });
        
        // Force garbage collection every 100 operations
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;
      
      console.log(`Memory Usage:
        - Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        - Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        - Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)`);
      
      // Memory increase should be reasonable (less than 50% increase)
      expect(memoryIncreasePercent).toBeLessThan(50);
    }, 120000);

    it('should handle database connection pooling efficiently', async () => {
      const dbManager = testSetup.getDatabaseManager();
      const connectionPromises = [];
      
      // Create 100 concurrent database operations
      for (let i = 0; i < 100; i++) {
        connectionPromises.push(
          fighterRepo.findById(`test-fighter-${i % 10}`)
        );
      }
      
      const startTime = performance.now();
      const results = await Promise.allSettled(connectionPromises);
      const endTime = performance.now();
      
      const successfulConnections = results.filter(r => r.status === 'fulfilled').length;
      const totalTime = endTime - startTime;
      
      expect(successfulConnections).toBe(100);
      expect(totalTime).toBeLessThan(2000); // Under 2 seconds
    });
  });

  describe('Stress Testing', () => {
    it('should maintain performance under high prediction load', async () => {
      const iterations = 500;
      const batchSize = 10;
      const responseTimes: number[] = [];
      
      for (let i = 0; i < iterations; i += batchSize) {
        const batch = Array.from({ length: Math.min(batchSize, iterations - i) }, (_, j) => {
          const startTime = performance.now();
          return predictionController.generatePrediction({
            fightId: `test-fight-${(i + j) % 10}`,
            fighter1Id: `test-fighter-${(i + j) % 20}`,
            fighter2Id: `test-fighter-${((i + j) % 20) + 1}`,
            contextualData: {
              venue: 'Test Arena',
              altitude: 0,
              fightWeek: true,
              lastFightDays: 90
            }
          }).then(result => {
            const endTime = performance.now();
            responseTimes.push(endTime - startTime);
            return result;
          });
        });
        
        await Promise.all(batch);
        
        // Small delay between batches to simulate realistic load
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];
      const p99ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.99)];
      
      console.log(`Stress Test Results:
        - Total Predictions: ${iterations}
        - Average Response Time: ${avgResponseTime.toFixed(2)}ms
        - 95th Percentile: ${p95ResponseTime.toFixed(2)}ms
        - 99th Percentile: ${p99ResponseTime.toFixed(2)}ms`);
      
      expect(avgResponseTime).toBeLessThan(500); // Under 500ms average
      expect(p95ResponseTime).toBeLessThan(1000); // 95% under 1 second
      expect(p99ResponseTime).toBeLessThan(2000); // 99% under 2 seconds
    }, 180000);
  });

  async function seedTestData(): Promise<void> {
    // Create test fighters
    for (let i = 0; i < 50; i++) {
      await fighterRepo.create({
        name: `Test Fighter ${i}`,
        nickname: `Fighter ${i}`,
        physicalStats: {
          height: 68 + (i % 8),
          weight: 155 + (i % 30),
          reach: 70 + (i % 6),
          legReach: 38 + (i % 4),
          stance: i % 2 === 0 ? 'Orthodox' : 'Southpaw'
        },
        record: {
          wins: 10 + (i % 15),
          losses: i % 8,
          draws: i % 3,
          noContests: 0
        },
        rankings: {
          weightClass: 'Lightweight',
          rank: i < 15 ? i + 1 : undefined
        },
        camp: {
          name: `Test Gym ${i % 10}`,
          location: `City ${i % 5}`,
          headCoach: `Coach ${i % 10}`
        }
      });
    }

    // Create test fights
    for (let i = 0; i < 25; i++) {
      await fightRepo.create({
        eventId: `test-event-${i % 5}`,
        fighter1Id: `test-fighter-${i * 2}`,
        fighter2Id: `test-fighter-${i * 2 + 1}`,
        weightClass: 'Lightweight',
        titleFight: i % 10 === 0,
        mainEvent: i % 5 === 0,
        scheduledRounds: i % 10 === 0 ? 5 : 3,
        status: 'scheduled'
      });
    }
  }
});