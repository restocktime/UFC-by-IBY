import { FeatureEngineeringService } from '../index.js';

describe('FeatureEngineeringService', () => {
  let service: FeatureEngineeringService;

  beforeEach(() => {
    service = new FeatureEngineeringService();
  });

  describe('constructor', () => {
    it('should create service with default configurations', () => {
      expect(service.getMetricsCalculator()).toBeDefined();
      expect(service.getContextualExtractor()).toBeDefined();
      expect(service.getOddsExtractor()).toBeDefined();
    });

    it('should create service with custom configurations', () => {
      const customService = new FeatureEngineeringService(
        { windowSize: 3, minDataPoints: 2, trendThreshold: 15 },
        { injuryLookbackDays: 180, weightCutLookbackFights: 3, layoffThresholdDays: 90, altitudeThresholdFeet: 2000, timeZoneThresholdHours: 2 },
        { steamMoveThreshold: 3.0, significantMoveThreshold: 1.5, sharpBookmakers: ['Pinnacle'], publicBookmakers: ['DraftKings'], volumeSpikeFactor: 1.5, arbitrageMinProfit: 0.5 }
      );

      expect(customService.getMetricsCalculator().getConfig().windowSize).toBe(3);
      expect(customService.getContextualExtractor().getConfig().injuryLookbackDays).toBe(180);
      expect(customService.getOddsExtractor().getConfig().steamMoveThreshold).toBe(3.0);
    });
  });

  describe('component access', () => {
    it('should provide access to metrics calculator', () => {
      const calculator = service.getMetricsCalculator();
      expect(calculator).toBeDefined();
      expect(typeof calculator.calculateRollingStats).toBe('function');
    });

    it('should provide access to contextual extractor', () => {
      const extractor = service.getContextualExtractor();
      expect(extractor).toBeDefined();
      expect(typeof extractor.extractFeatures).toBe('function');
    });

    it('should provide access to odds extractor', () => {
      const extractor = service.getOddsExtractor();
      expect(extractor).toBeDefined();
      expect(typeof extractor.extractFeatures).toBe('function');
    });
  });

  describe('extractAllFeatures', () => {
    it('should extract all features successfully', async () => {
      // Mock data for testing
      const mockFightStats = [
        {
          fightId: 'fight1',
          fighterId: 'fighter1',
          date: new Date(),
          strikesLanded: 50,
          strikesAttempted: 100,
          takedownsLanded: 2,
          takedownsAttempted: 5,
          takedownsDefended: 3,
          takedownsAgainst: 4,
          controlTime: 120,
          fightDuration: 900,
          result: 'win' as const,
          performance: 85
        },
        {
          fightId: 'fight2',
          fighterId: 'fighter1',
          date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          strikesLanded: 40,
          strikesAttempted: 80,
          takedownsLanded: 1,
          takedownsAttempted: 3,
          takedownsDefended: 2,
          takedownsAgainst: 3,
          controlTime: 90,
          fightDuration: 600,
          result: 'win' as const,
          performance: 75
        },
        {
          fightId: 'fight3',
          fighterId: 'fighter1',
          date: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
          strikesLanded: 30,
          strikesAttempted: 90,
          takedownsLanded: 0,
          takedownsAttempted: 2,
          takedownsDefended: 1,
          takedownsAgainst: 2,
          controlTime: 60,
          fightDuration: 450,
          result: 'loss' as const,
          performance: 60
        }
      ];

      const mockContextualData = {
        fighterId: 'fighter1',
        camp: {
          name: 'Test Gym',
          location: 'Test City',
          headCoach: 'Test Coach',
          knownFor: ['striking'],
          reputation: 7,
          facilities: ['octagon']
        },
        injuryHistory: [],
        weightCutHistory: [],
        layoffInfo: {
          daysSinceLastFight: 90,
          reasonForLayoff: 'personal' as const,
          activityLevel: 'training' as const,
          rustFactor: 0.2
        },
        venueExperience: {
          country: 'USA',
          altitude: 1000,
          climate: 'temperate' as const,
          timeZoneChange: 0,
          previousFightsAtVenue: 1,
          recordAtVenue: { wins: 1, losses: 0 }
        },
        opponentHistory: {
          commonOpponents: [],
          styleMismatch: {
            strikingVsGrappling: 0,
            orthodoxVsSouthpaw: false,
            reachAdvantage: 0,
            paceMatch: 0
          },
          experienceGap: 0,
          sizeAdvantage: {
            heightDifference: 0,
            reachDifference: 0,
            weightDifference: 0
          }
        }
      };

      const mockOddsData = {
        fightId: 'fight1',
        snapshots: [
          {
            fightId: 'fight1',
            sportsbook: 'TestBook',
            timestamp: new Date(),
            moneyline: { fighter1: -150, fighter2: +130 },
            method: { ko: +300, submission: +400, decision: +200 },
            rounds: { round1: +800, round2: +600, round3: +400 }
          }
        ],
        movements: [],
        arbitrageOpportunities: []
      };

      const result = await service.extractAllFeatures(
        mockFightStats,
        mockContextualData,
        mockOddsData
      );

      expect(result.rollingStats).toBeDefined();
      expect(result.contextualFeatures).toBeDefined();
      expect(result.oddsFeatures).toBeDefined();

      // Verify structure of returned features
      expect(result.rollingStats.strikingAccuracy).toBeDefined();
      expect(result.contextualFeatures.campReputation).toBeDefined();
      expect(result.oddsFeatures.openingImpliedProbability).toBeDefined();
    });
  });
});