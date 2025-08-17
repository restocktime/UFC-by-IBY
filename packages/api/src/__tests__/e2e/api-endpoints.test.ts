import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { IntegrationTestSetup, setupIntegrationTests, teardownIntegrationTests } from '../integration/setup';
import { createApp } from '../../index';
import { FighterRepository } from '../../repositories/fighter.repository';
import { FightRepository } from '../../repositories/fight.repository';
import { OddsRepository } from '../../repositories/odds.repository';

describe('End-to-End API Tests', () => {
  let app: Express;
  let testSetup: IntegrationTestSetup;
  let fighterRepo: FighterRepository;
  let fightRepo: FightRepository;
  let oddsRepo: OddsRepository;

  beforeAll(async () => {
    testSetup = await setupIntegrationTests();
    const dbManager = testSetup.getDatabaseManager();
    
    fighterRepo = new FighterRepository(dbManager);
    fightRepo = new FightRepository(dbManager);
    oddsRepo = new OddsRepository(dbManager);
    
    app = createApp(dbManager);
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  beforeEach(async () => {
    // Clean up test data
    await fighterRepo.deleteAll();
    await fightRepo.deleteAll();
    await oddsRepo.deleteAll();
  });

  describe('Fighter API Endpoints', () => {
    it('GET /api/fighters should return empty array initially', async () => {
      const response = await request(app)
        .get('/api/fighters')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('POST /api/fighters should create a new fighter', async () => {
      const fighterData = {
        name: 'Test Fighter',
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

      const response = await request(app)
        .post('/api/fighters')
        .send(fighterData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe(fighterData.name);
      expect(response.body.physicalStats.height).toBe(fighterData.physicalStats.height);
    });

    it('GET /api/fighters/:id should return specific fighter', async () => {
      const fighter = await fighterRepo.create({
        name: 'Test Fighter',
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
      });

      const response = await request(app)
        .get(`/api/fighters/${fighter.id}`)
        .expect(200);

      expect(response.body.id).toBe(fighter.id);
      expect(response.body.name).toBe(fighter.name);
    });

    it('GET /api/fighters/:id should return 404 for non-existent fighter', async () => {
      await request(app)
        .get('/api/fighters/non-existent-id')
        .expect(404);
    });

    it('PUT /api/fighters/:id should update fighter', async () => {
      const fighter = await fighterRepo.create({
        name: 'Test Fighter',
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
      });

      const updateData = {
        record: {
          wins: 16,
          losses: 3,
          draws: 0,
          noContests: 0
        }
      };

      const response = await request(app)
        .put(`/api/fighters/${fighter.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.record.wins).toBe(16);
    });
  });

  describe('Fight API Endpoints', () => {
    it('GET /api/fights should return fights with fighter details', async () => {
      // Create fighters first
      const fighter1 = await fighterRepo.create({
        name: 'Fighter 1',
        physicalStats: { height: 70, weight: 155, reach: 72, legReach: 40, stance: 'Orthodox' },
        record: { wins: 15, losses: 3, draws: 0, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 1', location: 'City 1', headCoach: 'Coach 1' }
      });

      const fighter2 = await fighterRepo.create({
        name: 'Fighter 2',
        physicalStats: { height: 68, weight: 155, reach: 70, legReach: 38, stance: 'Southpaw' },
        record: { wins: 12, losses: 5, draws: 1, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 2', location: 'City 2', headCoach: 'Coach 2' }
      });

      // Create fight
      await fightRepo.create({
        eventId: 'test-event-1',
        fighter1Id: fighter1.id,
        fighter2Id: fighter2.id,
        weightClass: 'Lightweight',
        titleFight: false,
        mainEvent: false,
        scheduledRounds: 3,
        status: 'scheduled'
      });

      const response = await request(app)
        .get('/api/fights')
        .expect(200);

      expect(response.body.length).toBe(1);
      expect(response.body[0].fighter1Id).toBe(fighter1.id);
      expect(response.body[0].fighter2Id).toBe(fighter2.id);
    });

    it('POST /api/fights should create a new fight', async () => {
      const fighter1 = await fighterRepo.create({
        name: 'Fighter 1',
        physicalStats: { height: 70, weight: 155, reach: 72, legReach: 40, stance: 'Orthodox' },
        record: { wins: 15, losses: 3, draws: 0, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 1', location: 'City 1', headCoach: 'Coach 1' }
      });

      const fighter2 = await fighterRepo.create({
        name: 'Fighter 2',
        physicalStats: { height: 68, weight: 155, reach: 70, legReach: 38, stance: 'Southpaw' },
        record: { wins: 12, losses: 5, draws: 1, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 2', location: 'City 2', headCoach: 'Coach 2' }
      });

      const fightData = {
        eventId: 'test-event-1',
        fighter1Id: fighter1.id,
        fighter2Id: fighter2.id,
        weightClass: 'Lightweight',
        titleFight: false,
        mainEvent: true,
        scheduledRounds: 3
      };

      const response = await request(app)
        .post('/api/fights')
        .send(fightData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.mainEvent).toBe(true);
    });
  });

  describe('Prediction API Endpoints', () => {
    it('POST /api/predictions should generate fight prediction', async () => {
      const fighter1 = await fighterRepo.create({
        name: 'Fighter 1',
        physicalStats: { height: 70, weight: 155, reach: 72, legReach: 40, stance: 'Orthodox' },
        record: { wins: 15, losses: 3, draws: 0, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 1', location: 'City 1', headCoach: 'Coach 1' }
      });

      const fighter2 = await fighterRepo.create({
        name: 'Fighter 2',
        physicalStats: { height: 68, weight: 155, reach: 70, legReach: 38, stance: 'Southpaw' },
        record: { wins: 12, losses: 5, draws: 1, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 2', location: 'City 2', headCoach: 'Coach 2' }
      });

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

      const predictionRequest = {
        fightId: fight.id,
        fighter1Id: fighter1.id,
        fighter2Id: fighter2.id,
        contextualData: {
          venue: 'Test Arena',
          altitude: 0,
          fightWeek: true,
          lastFightDays: 90
        }
      };

      const response = await request(app)
        .post('/api/predictions')
        .send(predictionRequest)
        .expect(200);

      expect(response.body.winnerProbability).toBeDefined();
      expect(response.body.winnerProbability.fighter1).toBeGreaterThan(0);
      expect(response.body.winnerProbability.fighter2).toBeGreaterThan(0);
      expect(response.body.confidence).toBeGreaterThan(0);
      expect(response.body.keyFactors).toBeDefined();
    });

    it('GET /api/predictions/:fightId should return cached prediction', async () => {
      const fighter1 = await fighterRepo.create({
        name: 'Fighter 1',
        physicalStats: { height: 70, weight: 155, reach: 72, legReach: 40, stance: 'Orthodox' },
        record: { wins: 15, losses: 3, draws: 0, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 1', location: 'City 1', headCoach: 'Coach 1' }
      });

      const fighter2 = await fighterRepo.create({
        name: 'Fighter 2',
        physicalStats: { height: 68, weight: 155, reach: 70, legReach: 38, stance: 'Southpaw' },
        record: { wins: 12, losses: 5, draws: 1, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 2', location: 'City 2', headCoach: 'Coach 2' }
      });

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

      // First, generate a prediction
      await request(app)
        .post('/api/predictions')
        .send({
          fightId: fight.id,
          fighter1Id: fighter1.id,
          fighter2Id: fighter2.id,
          contextualData: {
            venue: 'Test Arena',
            altitude: 0,
            fightWeek: true,
            lastFightDays: 90
          }
        })
        .expect(200);

      // Then retrieve the cached prediction
      const response = await request(app)
        .get(`/api/predictions/${fight.id}`)
        .expect(200);

      expect(response.body.winnerProbability).toBeDefined();
      expect(response.body.cached).toBe(true);
    });
  });

  describe('Odds API Endpoints', () => {
    it('GET /api/odds/:fightId should return odds for a fight', async () => {
      const fighter1 = await fighterRepo.create({
        name: 'Fighter 1',
        physicalStats: { height: 70, weight: 155, reach: 72, legReach: 40, stance: 'Orthodox' },
        record: { wins: 15, losses: 3, draws: 0, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 1', location: 'City 1', headCoach: 'Coach 1' }
      });

      const fighter2 = await fighterRepo.create({
        name: 'Fighter 2',
        physicalStats: { height: 68, weight: 155, reach: 70, legReach: 38, stance: 'Southpaw' },
        record: { wins: 12, losses: 5, draws: 1, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 2', location: 'City 2', headCoach: 'Coach 2' }
      });

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

      // Create odds data
      await oddsRepo.create({
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
      });

      const response = await request(app)
        .get(`/api/odds/${fight.id}`)
        .expect(200);

      expect(response.body.length).toBe(1);
      expect(response.body[0].sportsbook).toBe('DraftKings');
      expect(response.body[0].moneyline.fighter1).toBe(-150);
    });

    it('POST /api/odds should create new odds entry', async () => {
      const fighter1 = await fighterRepo.create({
        name: 'Fighter 1',
        physicalStats: { height: 70, weight: 155, reach: 72, legReach: 40, stance: 'Orthodox' },
        record: { wins: 15, losses: 3, draws: 0, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 1', location: 'City 1', headCoach: 'Coach 1' }
      });

      const fighter2 = await fighterRepo.create({
        name: 'Fighter 2',
        physicalStats: { height: 68, weight: 155, reach: 70, legReach: 38, stance: 'Southpaw' },
        record: { wins: 12, losses: 5, draws: 1, noContests: 0 },
        rankings: { weightClass: 'Lightweight' },
        camp: { name: 'Gym 2', location: 'City 2', headCoach: 'Coach 2' }
      });

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

      const oddsData = {
        fightId: fight.id,
        sportsbook: 'FanDuel',
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
      };

      const response = await request(app)
        .post('/api/odds')
        .send(oddsData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.sportsbook).toBe('FanDuel');
    });
  });

  describe('Health Check Endpoints', () => {
    it('GET /health should return system health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.services).toBeDefined();
      expect(response.body.services.mongodb).toBeDefined();
      expect(response.body.services.redis).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    it('GET /health/detailed should return detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.system).toBeDefined();
      expect(response.body.services).toBeDefined();
      expect(response.body.metrics).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid request data', async () => {
      const invalidFighterData = {
        name: '', // Invalid empty name
        physicalStats: {
          height: -1, // Invalid negative height
          weight: 0,
          reach: 0,
          legReach: 0,
          stance: 'Invalid'
        }
      };

      const response = await request(app)
        .post('/api/fighters')
        .send(invalidFighterData)
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.message).toContain('validation');
    });

    it('should return 500 for internal server errors', async () => {
      // Simulate internal error by disconnecting database
      await testSetup.getDatabaseManager().disconnect();

      const response = await request(app)
        .get('/api/fighters')
        .expect(500);

      expect(response.body.error).toBeDefined();

      // Reconnect for cleanup
      await testSetup.getDatabaseManager().connect();
    });
  });
});