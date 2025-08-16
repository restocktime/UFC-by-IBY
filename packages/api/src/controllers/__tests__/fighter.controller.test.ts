/**
 * Unit tests for FighterController
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FighterController } from '../fighter.controller.js';
import { DatabaseManager } from '../../database/manager.js';

// Mock dependencies
vi.mock('../../database/manager.js');
vi.mock('../../repositories/fighter.repository.js');
vi.mock('../../features/metrics-calculator.js');

describe('FighterController Unit Tests', () => {
  let dbManager: DatabaseManager;
  let fighterController: FighterController;

  const mockFighter = {
    id: 'fighter-123',
    name: 'John Doe',
    nickname: 'The Destroyer',
    record: { wins: 15, losses: 3, draws: 0 },
    physicalStats: { height: 72, weight: 155, reach: 74 },
    dateOfBirth: new Date('1990-01-01'),
    weightClass: 'Lightweight',
    camp: {
      name: 'Team Alpha',
      location: 'Las Vegas, NV',
      headCoach: 'Coach Smith'
    }
  };

  const mockMetrics = {
    strikingAccuracy: 0.65,
    takedownDefense: 0.75,
    winStreak: 3,
    recentForm: 0.8,
    finishRate: 0.6,
    averageFightTime: 8.5
  };

  beforeEach(() => {
    // Mock database manager
    dbManager = new DatabaseManager({
      mongodb: { uri: 'mongodb://localhost:27017/test' },
      influxdb: { url: 'http://localhost:8086', token: 'test', org: 'test', bucket: 'test' },
      redis: { host: 'localhost', port: 6379 }
    });

    // Create controller instance
    fighterController = new FighterController(dbManager);

    // Mock repository methods
    vi.mocked(fighterController['fighterRepository'].findById).mockResolvedValue(mockFighter);
    vi.mocked(fighterController['fighterRepository'].search).mockResolvedValue({
      fighters: [mockFighter],
      total: 1
    });
    vi.mocked(fighterController['fighterRepository'].getRankings).mockResolvedValue([
      { ...mockFighter, rank: 5 }
    ]);

    // Mock metrics calculator
    vi.mocked(fighterController['metricsCalculator'].calculateFighterMetrics).mockResolvedValue(mockMetrics);
  });

  describe('Fighter Profile', () => {
    it('should return fighter profile with metrics', async () => {
      const mockReq = {
        params: { fighterId: 'fighter-123' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getFighterProfile(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        profile: mockFighter,
        metrics: mockMetrics,
        timestamp: expect.any(Date)
      });
    });

    it('should return 404 for non-existent fighter', async () => {
      vi.mocked(fighterController['fighterRepository'].findById).mockResolvedValue(null);

      const mockReq = {
        params: { fighterId: 'non-existent' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getFighterProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Fighter not found',
        message: 'No fighter found with ID: non-existent'
      });
    });

    it('should return 400 for invalid fighter ID', async () => {
      const mockReq = {
        params: { fighterId: '' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getFighterProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid fighter ID',
        message: 'Fighter ID must be a valid string'
      });
    });
  });

  describe('Fighter Analytics', () => {
    it('should generate comprehensive analytics', async () => {
      const mockReq = {
        params: { fighterId: 'fighter-123' },
        query: { timeRange: '365' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getFighterAnalytics(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        analytics: expect.objectContaining({
          profile: mockFighter,
          metrics: mockMetrics,
          trends: expect.any(Object),
          recentPerformance: expect.any(Array),
          rankings: expect.any(Object)
        }),
        timeRange: 365,
        timestamp: expect.any(Date)
      });
    });

    it('should validate time range parameter', async () => {
      const mockReq = {
        params: { fighterId: 'fighter-123' },
        query: { timeRange: '5000' } // Too large
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getFighterAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid time range',
        message: 'Time range must be between 1 and 3650 days'
      });
    });
  });

  describe('Fighter Comparison', () => {
    const mockFighter2 = {
      ...mockFighter,
      id: 'fighter-456',
      name: 'Jane Smith',
      record: { wins: 12, losses: 2, draws: 1 },
      physicalStats: { height: 70, weight: 155, reach: 72 }
    };

    beforeEach(() => {
      vi.mocked(fighterController['fighterRepository'].findById)
        .mockImplementation(async (id: string) => {
          if (id === 'fighter-123') return mockFighter;
          if (id === 'fighter-456') return mockFighter2;
          return null;
        });
    });

    it('should compare two fighters', async () => {
      const mockReq = {
        params: { fighter1Id: 'fighter-123', fighter2Id: 'fighter-456' },
        query: { timeRange: '365' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.compareFighters(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        comparison: expect.objectContaining({
          fighter1: expect.any(Object),
          fighter2: expect.any(Object),
          comparison: expect.objectContaining({
            advantages: expect.any(Object),
            keyDifferences: expect.any(Array),
            overallAssessment: expect.any(String)
          })
        }),
        timeRange: 365,
        timestamp: expect.any(Date)
      });
    });

    it('should prevent comparing fighter with themselves', async () => {
      const mockReq = {
        params: { fighter1Id: 'fighter-123', fighter2Id: 'fighter-123' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.compareFighters(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid comparison',
        message: 'Cannot compare a fighter with themselves'
      });
    });

    it('should handle missing fighters in comparison', async () => {
      vi.mocked(fighterController['fighterRepository'].findById)
        .mockImplementation(async (id: string) => {
          if (id === 'fighter-123') return mockFighter;
          return null; // Fighter 2 not found
        });

      const mockReq = {
        params: { fighter1Id: 'fighter-123', fighter2Id: 'non-existent' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.compareFighters(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Fighter not found',
        message: 'Fighter 2 not found with ID: non-existent'
      });
    });
  });

  describe('Fighter Trends', () => {
    it('should calculate performance trends', async () => {
      const mockReq = {
        params: { fighterId: 'fighter-123' },
        query: { 
          timeRange: '365',
          metrics: 'strikingAccuracy,takedownDefense'
        }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getFighterTrends(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        trends: expect.objectContaining({
          strikingAccuracyTrend: expect.any(Object),
          takedownDefenseTrend: expect.any(Object),
          overallTrend: expect.stringMatching(/improving|declining|stable/)
        }),
        timeRange: 365,
        metrics: ['strikingAccuracy', 'takedownDefense'],
        timestamp: expect.any(Date)
      });
    });

    it('should validate metrics parameter', async () => {
      const mockReq = {
        params: { fighterId: 'fighter-123' },
        query: { 
          timeRange: '365',
          metrics: 'invalidMetric,strikingAccuracy'
        }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getFighterTrends(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid metrics',
        message: expect.stringContaining('Invalid metrics: invalidMetric')
      });
    });

    it('should validate minimum time range for trends', async () => {
      const mockReq = {
        params: { fighterId: 'fighter-123' },
        query: { timeRange: '15' } // Too short for trends
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getFighterTrends(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid time range',
        message: 'Time range must be between 30 and 3650 days for trend analysis'
      });
    });
  });

  describe('Fighter Search', () => {
    it('should search fighters with criteria', async () => {
      const mockReq = {
        query: {
          q: 'John',
          weightClass: 'Lightweight',
          active: 'true',
          limit: '10',
          offset: '0'
        }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.searchFighters(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        fighters: [mockFighter],
        pagination: {
          limit: 10,
          offset: 0,
          total: 1,
          hasMore: false
        },
        timestamp: expect.any(Date)
      });
    });

    it('should validate pagination parameters', async () => {
      const mockReq = {
        query: {
          limit: '150', // Too large
          offset: '0'
        }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.searchFighters(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid pagination parameters',
        message: 'Limit must be between 1 and 100, offset must be non-negative'
      });
    });
  });

  describe('Weight Class Rankings', () => {
    it('should return rankings for valid weight class', async () => {
      const mockReq = {
        params: { weightClass: 'Lightweight' },
        query: { limit: '15' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getWeightClassRankings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        weightClass: 'Lightweight',
        rankings: [{ ...mockFighter, rank: 5 }],
        lastUpdated: expect.any(Date),
        timestamp: expect.any(Date)
      });
    });

    it('should validate weight class', async () => {
      const mockReq = {
        params: { weightClass: 'InvalidWeight' },
        query: {}
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getWeightClassRankings(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid weight class',
        message: expect.stringContaining('Valid weight classes:')
      });
    });
  });

  describe('Analytics Generation', () => {
    it('should generate comprehensive analytics', async () => {
      const analytics = await fighterController['generateFighterAnalytics']('fighter-123', 365);

      expect(analytics).toHaveProperty('profile');
      expect(analytics).toHaveProperty('metrics');
      expect(analytics).toHaveProperty('trends');
      expect(analytics).toHaveProperty('recentPerformance');
      expect(analytics).toHaveProperty('rankings');

      expect(analytics.profile).toEqual(mockFighter);
      expect(analytics.metrics).toEqual(mockMetrics);
      expect(analytics.trends).toHaveProperty('overallTrend');
      expect(analytics.recentPerformance).toBeInstanceOf(Array);
    });

    it('should analyze fighter comparison correctly', async () => {
      const fighter1Analytics = {
        profile: mockFighter,
        metrics: { ...mockMetrics, strikingAccuracy: 0.8 },
        trends: {} as any,
        recentPerformance: [],
        rankings: {} as any
      };

      const fighter2Analytics = {
        profile: { ...mockFighter, physicalStats: { ...mockFighter.physicalStats, reach: 70 } },
        metrics: { ...mockMetrics, strikingAccuracy: 0.6 },
        trends: {} as any,
        recentPerformance: [],
        rankings: {} as any
      };

      const comparison = fighterController['analyzeComparison'](fighter1Analytics, fighter2Analytics);

      expect(comparison).toHaveProperty('advantages');
      expect(comparison).toHaveProperty('keyDifferences');
      expect(comparison).toHaveProperty('overallAssessment');

      expect(comparison.advantages.fighter1).toContain('Superior striking accuracy');
      expect(comparison.advantages.fighter1).toContain('Reach advantage');
      expect(comparison.keyDifferences).toHaveLength(2);
    });
  });

  describe('Trend Calculation', () => {
    it('should calculate trends for specified metrics', async () => {
      const trends = await fighterController['calculateTrends']('fighter-123', 365, ['strikingAccuracy', 'takedownDefense']);

      expect(trends).toHaveProperty('strikingAccuracyTrend');
      expect(trends).toHaveProperty('takedownDefenseTrend');
      expect(trends).toHaveProperty('overallTrend');

      expect(trends.strikingAccuracyTrend).toHaveProperty('direction');
      expect(trends.strikingAccuracyTrend).toHaveProperty('percentage');
      expect(trends.strikingAccuracyTrend).toHaveProperty('dataPoints');
      expect(trends.strikingAccuracyTrend).toHaveProperty('significance');

      expect(['up', 'down']).toContain(trends.strikingAccuracyTrend.direction);
      expect(['improving', 'declining', 'stable']).toContain(trends.overallTrend);
    });

    it('should generate trend data points', () => {
      const dataPoints = fighterController['generateTrendDataPoints'](365);

      expect(dataPoints).toBeInstanceOf(Array);
      expect(dataPoints.length).toBeGreaterThan(0);
      expect(dataPoints.length).toBeLessThanOrEqual(10);

      dataPoints.forEach(point => {
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('value');
        expect(point.date).toBeInstanceOf(Date);
        expect(point.value).toBeGreaterThanOrEqual(0.4);
        expect(point.value).toBeLessThanOrEqual(0.8);
      });
    });
  });

  describe('Recent Performance', () => {
    it('should generate recent performance data', async () => {
      const performance = await fighterController['getRecentPerformance']('fighter-123', 5);

      expect(performance).toBeInstanceOf(Array);
      expect(performance).toHaveLength(5);

      performance.forEach(fight => {
        expect(fight).toHaveProperty('fightId');
        expect(fight).toHaveProperty('opponent');
        expect(fight).toHaveProperty('date');
        expect(fight).toHaveProperty('result');
        expect(fight).toHaveProperty('method');
        expect(fight).toHaveProperty('round');
        expect(fight).toHaveProperty('metrics');

        expect(['win', 'loss']).toContain(fight.result);
        expect(fight.round).toBeGreaterThanOrEqual(1);
        expect(fight.round).toBeLessThanOrEqual(3);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      vi.mocked(fighterController['fighterRepository'].findById)
        .mockRejectedValue(new Error('Database connection failed'));

      const mockReq = {
        params: { fighterId: 'fighter-123' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getFighterProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Failed to retrieve fighter profile'
      });
    });

    it('should handle metrics calculation errors', async () => {
      vi.mocked(fighterController['metricsCalculator'].calculateFighterMetrics)
        .mockRejectedValue(new Error('Metrics calculation failed'));

      const mockReq = {
        params: { fighterId: 'fighter-123' }
      } as any;

      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as any;

      await fighterController.getFighterProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Failed to retrieve fighter profile'
      });
    });
  });
});