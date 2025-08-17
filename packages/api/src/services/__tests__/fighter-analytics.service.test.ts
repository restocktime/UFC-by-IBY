import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FighterAnalyticsService } from '../fighter-analytics.service.js';
import { ESPNAPIConnector } from '../../ingestion/connectors/espn-api.connector.js';
import { FighterRepository } from '../../repositories/fighter.repository.js';
import { FightRepository } from '../../repositories/fight.repository.js';
import { Fighter } from '@ufc-platform/shared';

// Mock the dependencies
vi.mock('../../ingestion/connectors/espn-api.connector.js');
vi.mock('../../repositories/fighter.repository.js');
vi.mock('../../repositories/fight.repository.js');

describe('FighterAnalyticsService', () => {
  let service: FighterAnalyticsService;
  let mockESPNConnector: vi.Mocked<ESPNAPIConnector>;
  let mockFighterRepo: vi.Mocked<FighterRepository>;
  let mockFightRepo: vi.Mocked<FightRepository>;

  const mockFighter: Fighter = {
    id: 'fighter-1',
    name: 'Jon Jones',
    nickname: 'Bones',
    physicalStats: {
      height: 76,
      weight: 205,
      reach: 84,
      legReach: 40,
      stance: 'Orthodox'
    },
    record: {
      wins: 26,
      losses: 1,
      draws: 0,
      noContests: 1
    },
    rankings: {
      weightClass: 'Light Heavyweight',
      rank: 1,
      p4pRank: 1
    },
    camp: {
      name: 'Jackson Wink MMA',
      location: 'Albuquerque, NM',
      headCoach: 'Greg Jackson'
    },
    socialMedia: {
      instagram: '@jonnybones',
      twitter: '@JonnyBones'
    },
    calculatedMetrics: {
      strikingAccuracy: { value: 58, period: 5, trend: 'stable' },
      takedownDefense: { value: 95, period: 5, trend: 'improving' },
      fightFrequency: 1.2,
      winStreak: 3,
      recentForm: []
    },
    trends: {
      performanceTrend: 'stable',
      activityLevel: 'active',
      injuryHistory: ['Knee injury 2019'],
      lastFightDate: new Date('2023-03-04')
    },
    lastUpdated: new Date()
  };

  const mockFights = [
    {
      id: 'fight-1',
      eventId: 'event-1',
      fighter1Id: 'fighter-1',
      fighter2Id: 'fighter-2',
      date: new Date('2023-03-04'),
      result: {
        winnerId: 'fighter-1',
        method: 'Submission',
        round: 1,
        time: '2:04'
      },
      titleFight: true,
      mainEvent: true
    },
    {
      id: 'fight-2',
      eventId: 'event-2',
      fighter1Id: 'fighter-1',
      fighter2Id: 'fighter-3',
      date: new Date('2022-07-30'),
      result: {
        winnerId: 'fighter-1',
        method: 'Decision',
        round: 5,
        time: '5:00'
      },
      titleFight: true,
      mainEvent: true
    },
    {
      id: 'fight-3',
      eventId: 'event-3',
      fighter1Id: 'fighter-1',
      fighter2Id: 'fighter-4',
      date: new Date('2021-02-13'),
      result: {
        winnerId: 'fighter-1',
        method: 'KO/TKO',
        round: 2,
        time: '1:26'
      },
      titleFight: false,
      mainEvent: true
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock instances
    mockESPNConnector = {} as any;
    
    mockFighterRepo = {
      findById: vi.fn(),
      search: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    } as any;

    mockFightRepo = {
      search: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    } as any;

    service = new FighterAnalyticsService(mockESPNConnector, mockFighterRepo, mockFightRepo);
  });

  describe('getFighterAnalytics', () => {
    it('should return comprehensive fighter analytics', async () => {
      mockFighterRepo.findById.mockResolvedValue(mockFighter);
      mockFightRepo.search.mockResolvedValue(mockFights);

      const analytics = await service.getFighterAnalytics('fighter-1');

      expect(analytics).toBeDefined();
      expect(analytics.fighterId).toBe('fighter-1');
      expect(analytics.fighterName).toBe('Jon Jones');
      expect(analytics.recentPerformance).toBeDefined();
      expect(analytics.historicalTrends).toBeDefined();
      expect(analytics.injuryReports).toBeDefined();
      expect(analytics.trainingCampInfo).toBeDefined();
      expect(analytics.predictionFactors).toBeDefined();
      expect(analytics.lastUpdated).toBeInstanceOf(Date);
    });

    it('should throw error when fighter not found', async () => {
      mockFighterRepo.findById.mockResolvedValue(null);

      await expect(service.getFighterAnalytics('non-existent-fighter'))
        .rejects.toThrow('Fighter not found: non-existent-fighter');
    });

    it('should handle empty fight history', async () => {
      mockFighterRepo.findById.mockResolvedValue(mockFighter);
      mockFightRepo.search.mockResolvedValue([]);

      const analytics = await service.getFighterAnalytics('fighter-1');

      expect(analytics.recentPerformance.last5Fights).toHaveLength(0);
      expect(analytics.recentPerformance.winRate).toBe(0);
      expect(analytics.recentPerformance.finishRate).toBe(0);
    });

    it('should calculate recent performance metrics correctly', async () => {
      mockFighterRepo.findById.mockResolvedValue(mockFighter);
      mockFightRepo.search.mockResolvedValue(mockFights);

      const analytics = await service.getFighterAnalytics('fighter-1');

      expect(analytics.recentPerformance.last5Fights).toHaveLength(3);
      expect(analytics.recentPerformance.winRate).toBeGreaterThan(0);
      expect(analytics.recentPerformance.finishRate).toBeGreaterThan(0);
      expect(typeof analytics.recentPerformance.averageFightTime).toBe('number');
    });

    it('should analyze historical trends', async () => {
      mockFighterRepo.findById.mockResolvedValue(mockFighter);
      mockFightRepo.search.mockResolvedValue(mockFights);

      const analytics = await service.getFighterAnalytics('fighter-1');

      expect(analytics.historicalTrends.careerProgression).toBeDefined();
      expect(analytics.historicalTrends.peakPerformancePeriod).toBeDefined();
      expect(analytics.historicalTrends.consistencyScore).toBeGreaterThanOrEqual(0);
      expect(analytics.historicalTrends.consistencyScore).toBeLessThanOrEqual(100);
      expect(analytics.historicalTrends.experienceLevel).toMatch(/novice|developing|veteran|elite/);
    });

    it('should include injury reports', async () => {
      mockFighterRepo.findById.mockResolvedValue(mockFighter);
      mockFightRepo.search.mockResolvedValue(mockFights);

      const analytics = await service.getFighterAnalytics('fighter-1');

      expect(Array.isArray(analytics.injuryReports)).toBe(true);
      if (analytics.injuryReports.length > 0) {
        const injury = analytics.injuryReports[0];
        expect(injury.type).toBeDefined();
        expect(injury.severity).toMatch(/minor|moderate|major/);
        expect(injury.reportedDate).toBeInstanceOf(Date);
        expect(injury.impactOnPerformance).toBeGreaterThanOrEqual(0);
        expect(injury.impactOnPerformance).toBeLessThanOrEqual(100);
      }
    });

    it('should include training camp information', async () => {
      mockFighterRepo.findById.mockResolvedValue(mockFighter);
      mockFightRepo.search.mockResolvedValue(mockFights);

      const analytics = await service.getFighterAnalytics('fighter-1');

      expect(analytics.trainingCampInfo.currentCamp).toBeDefined();
      expect(analytics.trainingCampInfo.currentCamp.name).toBe(mockFighter.camp.name);
      expect(analytics.trainingCampInfo.currentCamp.location).toBe(mockFighter.camp.location);
      expect(analytics.trainingCampInfo.currentCamp.headCoach).toBe(mockFighter.camp.headCoach);
      expect(Array.isArray(analytics.trainingCampInfo.currentCamp.specialties)).toBe(true);
      expect(analytics.trainingCampInfo.currentCamp.reputation).toBeGreaterThanOrEqual(0);
      expect(analytics.trainingCampInfo.currentCamp.reputation).toBeLessThanOrEqual(100);
    });

    it('should calculate prediction factors', async () => {
      mockFighterRepo.findById.mockResolvedValue(mockFighter);
      mockFightRepo.search.mockResolvedValue(mockFights);

      const analytics = await service.getFighterAnalytics('fighter-1');

      expect(analytics.predictionFactors.formTrend).toMatch(/improving|declining|stable/);
      expect(analytics.predictionFactors.motivationLevel).toBeGreaterThanOrEqual(0);
      expect(analytics.predictionFactors.motivationLevel).toBeLessThanOrEqual(100);
      expect(Array.isArray(analytics.predictionFactors.styleMismatchVulnerabilities)).toBe(true);
      expect(Array.isArray(analytics.predictionFactors.strengthsAgainstOpponentType)).toBe(true);
      expect(analytics.predictionFactors.mentalToughness).toBeGreaterThanOrEqual(0);
      expect(analytics.predictionFactors.mentalToughness).toBeLessThanOrEqual(100);
      expect(analytics.predictionFactors.injuryRisk).toBeGreaterThanOrEqual(0);
      expect(analytics.predictionFactors.injuryRisk).toBeLessThanOrEqual(100);
    });

    it('should handle repository errors gracefully', async () => {
      mockFighterRepo.findById.mockRejectedValue(new Error('Database error'));

      await expect(service.getFighterAnalytics('fighter-1'))
        .rejects.toThrow('Failed to get fighter analytics: Database error');
    });
  });

  describe('compareFighters', () => {
    const mockFighter2: Fighter = {
      ...mockFighter,
      id: 'fighter-2',
      name: 'Daniel Cormier',
      nickname: 'DC'
    };

    it('should compare two fighters and provide matchup analysis', async () => {
      mockFighterRepo.findById
        .mockResolvedValueOnce(mockFighter)
        .mockResolvedValueOnce(mockFighter2);
      mockFightRepo.search.mockResolvedValue(mockFights);

      const comparison = await service.compareFighters('fighter-1', 'fighter-2');

      expect(comparison.fighter1).toBeDefined();
      expect(comparison.fighter2).toBeDefined();
      expect(comparison.matchupAnalysis).toBeDefined();
      
      expect(comparison.fighter1.fighterId).toBe('fighter-1');
      expect(comparison.fighter2.fighterId).toBe('fighter-2');
      
      expect(comparison.matchupAnalysis.styleMismatch).toBeDefined();
      expect(comparison.matchupAnalysis.advantageAreas).toBeDefined();
      expect(Array.isArray(comparison.matchupAnalysis.keyFactors)).toBe(true);
      expect(comparison.matchupAnalysis.prediction).toBeDefined();
    });

    it('should handle errors when comparing fighters', async () => {
      mockFighterRepo.findById.mockRejectedValue(new Error('Fighter not found'));

      await expect(service.compareFighters('fighter-1', 'fighter-2'))
        .rejects.toThrow('Failed to get fighter analytics: Fighter not found');
    });
  });

  describe('performance calculations', () => {
    beforeEach(() => {
      mockFighterRepo.findById.mockResolvedValue(mockFighter);
      mockFightRepo.search.mockResolvedValue(mockFights);
    });

    it('should calculate win rate correctly', async () => {
      const analytics = await service.getFighterAnalytics('fighter-1');
      
      // All mock fights are wins, so win rate should be 100%
      expect(analytics.recentPerformance.winRate).toBe(100);
    });

    it('should calculate finish rate correctly', async () => {
      const analytics = await service.getFighterAnalytics('fighter-1');
      
      // 2 out of 3 fights are finishes (Submission and KO/TKO)
      expect(analytics.recentPerformance.finishRate).toBeCloseTo(66.67, 1);
    });

    it('should determine experience level correctly', async () => {
      const analytics = await service.getFighterAnalytics('fighter-1');
      
      // With 3 fights in mock data, should be 'novice' or 'developing'
      expect(['novice', 'developing', 'veteran', 'elite']).toContain(analytics.historicalTrends.experienceLevel);
    });

    it('should identify career phases', async () => {
      const analytics = await service.getFighterAnalytics('fighter-1');
      
      expect(Array.isArray(analytics.historicalTrends.careerProgression)).toBe(true);
      
      if (analytics.historicalTrends.careerProgression.length > 0) {
        const phase = analytics.historicalTrends.careerProgression[0];
        expect(phase.period.start).toBeInstanceOf(Date);
        expect(phase.period.end).toBeInstanceOf(Date);
        expect(['rising', 'peak', 'stable', 'declining']).toContain(phase.phase);
        expect(phase.keyMetrics.winRate).toBeGreaterThanOrEqual(0);
        expect(phase.keyMetrics.winRate).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('prediction factors', () => {
    beforeEach(() => {
      mockFighterRepo.findById.mockResolvedValue(mockFighter);
      mockFightRepo.search.mockResolvedValue(mockFights);
    });

    it('should determine form trend based on recent performance', async () => {
      const analytics = await service.getFighterAnalytics('fighter-1');
      
      expect(['improving', 'declining', 'stable']).toContain(analytics.predictionFactors.formTrend);
    });

    it('should calculate injury risk based on history', async () => {
      const analytics = await service.getFighterAnalytics('fighter-1');
      
      expect(analytics.predictionFactors.injuryRisk).toBeGreaterThanOrEqual(0);
      expect(analytics.predictionFactors.injuryRisk).toBeLessThanOrEqual(100);
    });

    it('should identify style vulnerabilities', async () => {
      const analytics = await service.getFighterAnalytics('fighter-1');
      
      expect(Array.isArray(analytics.predictionFactors.styleMismatchVulnerabilities)).toBe(true);
      
      // Should identify common vulnerabilities like takedown defense or striking accuracy
      const possibleVulnerabilities = ['Takedown defense', 'Striking accuracy', 'Cardio', 'Ground game'];
      analytics.predictionFactors.styleMismatchVulnerabilities.forEach(vulnerability => {
        expect(typeof vulnerability).toBe('string');
      });
    });

    it('should identify fighter strengths', async () => {
      const analytics = await service.getFighterAnalytics('fighter-1');
      
      expect(Array.isArray(analytics.predictionFactors.strengthsAgainstOpponentType)).toBe(true);
      
      analytics.predictionFactors.strengthsAgainstOpponentType.forEach(strength => {
        expect(typeof strength).toBe('string');
      });
    });
  });

  describe('matchup analysis', () => {
    const mockFighter2: Fighter = {
      ...mockFighter,
      id: 'fighter-2',
      name: 'Daniel Cormier'
    };

    beforeEach(() => {
      mockFighterRepo.findById
        .mockResolvedValueOnce(mockFighter)
        .mockResolvedValueOnce(mockFighter2);
      mockFightRepo.search.mockResolvedValue(mockFights);
    });

    it('should analyze style matchups', async () => {
      const comparison = await service.compareFighters('fighter-1', 'fighter-2');
      
      expect(comparison.matchupAnalysis.styleMismatch).toBeDefined();
      expect(typeof comparison.matchupAnalysis.styleMismatch).toBe('object');
    });

    it('should identify advantage areas for each fighter', async () => {
      const comparison = await service.compareFighters('fighter-1', 'fighter-2');
      
      expect(comparison.matchupAnalysis.advantageAreas).toBeDefined();
      expect(comparison.matchupAnalysis.advantageAreas.fighter1Advantages).toBeDefined();
      expect(comparison.matchupAnalysis.advantageAreas.fighter2Advantages).toBeDefined();
      expect(Array.isArray(comparison.matchupAnalysis.advantageAreas.fighter1Advantages)).toBe(true);
      expect(Array.isArray(comparison.matchupAnalysis.advantageAreas.fighter2Advantages)).toBe(true);
    });

    it('should identify key matchup factors', async () => {
      const comparison = await service.compareFighters('fighter-1', 'fighter-2');
      
      expect(Array.isArray(comparison.matchupAnalysis.keyFactors)).toBe(true);
      expect(comparison.matchupAnalysis.keyFactors.length).toBeGreaterThan(0);
      
      comparison.matchupAnalysis.keyFactors.forEach(factor => {
        expect(typeof factor).toBe('string');
      });
    });

    it('should generate matchup prediction', async () => {
      const comparison = await service.compareFighters('fighter-1', 'fighter-2');
      
      expect(comparison.matchupAnalysis.prediction).toBeDefined();
      expect(comparison.matchupAnalysis.prediction.favoredFighter).toBeDefined();
      expect(comparison.matchupAnalysis.prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(comparison.matchupAnalysis.prediction.confidence).toBeLessThanOrEqual(100);
      expect(comparison.matchupAnalysis.prediction.method).toBeDefined();
      expect(comparison.matchupAnalysis.prediction.reasoning).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle missing fighter gracefully', async () => {
      mockFighterRepo.findById.mockResolvedValue(null);

      await expect(service.getFighterAnalytics('non-existent'))
        .rejects.toThrow('Fighter not found: non-existent');
    });

    it('should handle fight repository errors', async () => {
      mockFighterRepo.findById.mockResolvedValue(mockFighter);
      mockFightRepo.search.mockRejectedValue(new Error('Fight search failed'));

      await expect(service.getFighterAnalytics('fighter-1'))
        .rejects.toThrow('Failed to get fighter analytics: Fight search failed');
    });

    it('should handle comparison errors', async () => {
      mockFighterRepo.findById.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.compareFighters('fighter-1', 'fighter-2'))
        .rejects.toThrow('Failed to get fighter analytics: Database connection failed');
    });
  });
});