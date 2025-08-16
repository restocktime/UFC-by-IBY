/**
 * Unit tests for OddsController
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OddsController } from '../odds.controller.js';
import { DatabaseManager } from '../../database/manager.js';

// Mock dependencies
vi.mock('../../database/manager.js');
vi.mock('../../repositories/odds.repository.js');

describe('OddsController Unit Tests', () => {
  let dbManager: DatabaseManager;
  let oddsController: OddsController;

  const mockOddsData = [
    {
      id: 'odds-1',
      fightId: 'fight-123',
      sportsbook: 'DraftKings',
      timestamp: new Date(),
      moneyline: { fighter1: -150, fighter2: +130 },
      impliedProbability: { fighter1: 0.6, fighter2: 0.43 }
    },
    {
      id: 'odds-2',
      fightId: 'fight-123',
      sportsbook: 'FanDuel',
      timestamp: new Date(),
      moneyline: { fighter1: -140, fighter2: +120 },
      impliedProbability: { fighter1: 0.58, fighter2: 0.45 }
    }
  ];

  beforeEach(() => {
    // Mock database manager
    dbManager = new DatabaseManager({
      mongodb: { uri: 'mongodb://localhost:27017/test' },
      influxdb: { url: 'http://localhost:8086', token: 'test', org: 'test', bucket: 'test' },
      redis: { host: 'localhost', port: 6379 }
    });

    // Create controller instance
    oddsController = new OddsController(dbManager);

    // Mock repository methods
    vi.mocked(oddsController['oddsRepository'].getLatestOdds).mockResolvedValue(mockOddsData);
    vi.mocked(oddsController['oddsRepository'].getOddsHistory).mockResolvedValue(mockOddsData);
  });

  describe('Current Odds', () => {
    it('should return current odds for a fight', async () => {
      const mockReq = {
        params: { fightId: 'fight-123' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getCurrentOdds(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        fightId: 'fight-123',
        odds: mockOddsData,
        timestamp: expect.any(Date),
        count: 2
      });
    });

    it('should filter by sportsbooks when specified', async () => {
      const mockReq = {
        params: { fightId: 'fight-123' },
        query: { sportsbooks: 'DraftKings,FanDuel' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getCurrentOdds(mockReq, mockRes);

      expect(oddsController['oddsRepository'].getLatestOdds).toHaveBeenCalledWith(
        'fight-123',
        ['DraftKings', 'FanDuel']
      );
    });

    it('should return 404 when no odds found', async () => {
      vi.mocked(oddsController['oddsRepository'].getLatestOdds).mockResolvedValue([]);

      const mockReq = {
        params: { fightId: 'fight-123' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getCurrentOdds(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No odds found',
        message: 'No current odds found for fight: fight-123'
      });
    });

    it('should return 400 for invalid fight ID', async () => {
      const mockReq = {
        params: { fightId: '' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getCurrentOdds(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid fight ID',
        message: 'Fight ID must be a valid string'
      });
    });
  });

  describe('Odds History', () => {
    it('should return odds history with default parameters', async () => {
      const mockReq = {
        params: { fightId: 'fight-123' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getOddsHistory(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        fightId: 'fight-123',
        history: mockOddsData,
        filters: {
          sportsbook: undefined,
          startDate: undefined,
          endDate: undefined,
          interval: '1h',
          limit: 100
        },
        timestamp: expect.any(Date),
        count: 2
      });
    });

    it('should validate limit parameter', async () => {
      const mockReq = {
        params: { fightId: 'fight-123' },
        query: { limit: '2000' } // Too large
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getOddsHistory(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid limit',
        message: 'Limit must be between 1 and 1000'
      });
    });

    it('should validate interval parameter', async () => {
      const mockReq = {
        params: { fightId: 'fight-123' },
        query: { interval: 'invalid' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getOddsHistory(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid interval',
        message: 'Valid intervals: 5m, 15m, 30m, 1h, 4h, 12h, 1d'
      });
    });
  });

  describe('Odds Movements', () => {
    it('should detect odds movements', async () => {
      const mockReq = {
        params: { fightId: 'fight-123' },
        query: { minChange: '3', timeRange: '12' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getOddsMovements(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        fightId: 'fight-123',
        movements: expect.any(Array),
        filters: {
          minChange: 3,
          timeRange: 12,
          movementType: undefined,
          sportsbook: undefined
        },
        timestamp: expect.any(Date),
        count: expect.any(Number)
      });
    });

    it('should validate minimum change parameter', async () => {
      const mockReq = {
        params: { fightId: 'fight-123' },
        query: { minChange: '60' } // Too large
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getOddsMovements(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid minimum change',
        message: 'Minimum change must be between 0 and 50 percent'
      });
    });

    it('should validate movement type parameter', async () => {
      const mockReq = {
        params: { fightId: 'fight-123' },
        query: { movementType: 'invalid' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getOddsMovements(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid movement type',
        message: 'Valid movement types: significant, reverse, steam, minor'
      });
    });
  });

  describe('Market Analysis', () => {
    it('should generate market analysis', async () => {
      const mockReq = {
        params: { fightId: 'fight-123' },
        query: { includeArbitrage: 'true' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getMarketAnalysis(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        analysis: expect.objectContaining({
          fightId: 'fight-123',
          consensus: expect.any(Object),
          marketEfficiency: expect.any(Object),
          valueOpportunities: expect.any(Array),
          movements: expect.any(Array),
          arbitrage: expect.any(Array)
        }),
        timestamp: expect.any(Date)
      });
    });

    it('should return 404 when no market data available', async () => {
      vi.mocked(oddsController['oddsRepository'].getLatestOdds).mockResolvedValue([]);

      const mockReq = {
        params: { fightId: 'fight-123' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getMarketAnalysis(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No market data found',
        message: 'No market data available for fight: fight-123'
      });
    });
  });

  describe('Arbitrage Opportunities', () => {
    it('should find arbitrage opportunities', async () => {
      const mockReq = {
        query: {
          minProfit: '2',
          maxStake: '500',
          active: 'true',
          limit: '10'
        }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getArbitrageOpportunities(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        opportunities: expect.any(Array),
        filters: {
          minProfit: 2,
          maxStake: 500,
          active: true,
          limit: 10
        },
        timestamp: expect.any(Date),
        count: expect.any(Number)
      });
    });

    it('should validate profit parameters', async () => {
      const mockReq = {
        query: { minProfit: '25' } // Too large
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getArbitrageOpportunities(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid minimum profit',
        message: 'Minimum profit must be between 0 and 20 percent'
      });
    });

    it('should validate stake parameters', async () => {
      const mockReq = {
        query: { maxStake: '15000' } // Too large
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getArbitrageOpportunities(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid maximum stake',
        message: 'Maximum stake must be between 10 and 10000'
      });
    });
  });

  describe('Odds Comparison', () => {
    it('should compare odds across sportsbooks', async () => {
      const mockReq = {
        params: { fightId: 'fight-123' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.compareOdds(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        fightId: 'fight-123',
        comparison: expect.objectContaining({
          summary: expect.any(Object),
          sportsbooks: expect.any(Array)
        }),
        timestamp: expect.any(Date)
      });
    });

    it('should return 404 when no odds available for comparison', async () => {
      vi.mocked(oddsController['oddsRepository'].getLatestOdds).mockResolvedValue([]);

      const mockReq = {
        params: { fightId: 'fight-123' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.compareOdds(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No odds found',
        message: 'No odds available for comparison for fight: fight-123'
      });
    });
  });

  describe('Market Analysis Calculations', () => {
    it('should calculate consensus confidence correctly', () => {
      const odds = [
        { impliedProbability: { fighter1: 0.6, fighter2: 0.4 } },
        { impliedProbability: { fighter1: 0.58, fighter2: 0.42 } },
        { impliedProbability: { fighter1: 0.62, fighter2: 0.38 } }
      ];

      const confidence = oddsController['calculateConsensusConfidence'](odds);
      
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('should calculate market efficiency metrics', () => {
      const odds = [
        { moneyline: { fighter1: -150, fighter2: +130 } },
        { moneyline: { fighter1: -140, fighter2: +120 } },
        { moneyline: { fighter1: -160, fighter2: +140 } }
      ];

      const efficiency = oddsController['calculateMarketEfficiency'](odds);
      
      expect(efficiency).toHaveProperty('score');
      expect(efficiency).toHaveProperty('spread');
      expect(efficiency).toHaveProperty('volatility');
      expect(efficiency.score).toBeGreaterThanOrEqual(0);
      expect(efficiency.score).toBeLessThanOrEqual(1);
    });

    it('should calculate expected value correctly', () => {
      // Positive odds (+150) with 60% true probability
      const ev1 = oddsController['calculateExpectedValue'](150, 0.6);
      expect(ev1).toBeGreaterThan(0); // Should be positive EV

      // Negative odds (-200) with 40% true probability  
      const ev2 = oddsController['calculateExpectedValue'](-200, 0.4);
      expect(ev2).toBeLessThan(0); // Should be negative EV
    });

    it('should find value opportunities', () => {
      const odds = [
        {
          sportsbook: 'DraftKings',
          moneyline: { fighter1: -120, fighter2: +150 },
          impliedProbability: { fighter1: 0.55, fighter2: 0.4 }
        }
      ];

      const consensus = {
        fighter1Probability: 0.7, // Much higher than implied
        fighter2Probability: 0.3
      };

      const opportunities = oddsController['findValueOpportunities'](odds, consensus);
      
      expect(opportunities).toBeInstanceOf(Array);
      if (opportunities.length > 0) {
        expect(opportunities[0]).toHaveProperty('sportsbook');
        expect(opportunities[0]).toHaveProperty('expectedValue');
        expect(opportunities[0]).toHaveProperty('confidence');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      vi.mocked(oddsController['oddsRepository'].getLatestOdds)
        .mockRejectedValue(new Error('Database connection failed'));

      const mockReq = {
        params: { fightId: 'fight-123' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getCurrentOdds(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Failed to retrieve current odds'
      });
    });

    it('should handle market analysis generation errors', async () => {
      vi.mocked(oddsController['oddsRepository'].getLatestOdds)
        .mockRejectedValue(new Error('Analysis failed'));

      const mockReq = {
        params: { fightId: 'fight-123' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await oddsController.getMarketAnalysis(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Failed to generate market analysis'
      });
    });
  });
});