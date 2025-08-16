import { MetricsCalculator, FightStats, RollingStatsConfig } from '../metrics-calculator.js';

describe('MetricsCalculator', () => {
  let calculator: MetricsCalculator;
  let mockFightStats: FightStats[];

  beforeEach(() => {
    calculator = new MetricsCalculator();
    
    // Create mock fight stats for testing
    mockFightStats = [
      {
        fightId: 'fight1',
        fighterId: 'fighter1',
        date: new Date('2024-01-01'),
        strikesLanded: 50,
        strikesAttempted: 100,
        takedownsLanded: 2,
        takedownsAttempted: 5,
        takedownsDefended: 3,
        takedownsAgainst: 4,
        controlTime: 120,
        fightDuration: 900, // 15 minutes
        result: 'win',
        performance: 85
      },
      {
        fightId: 'fight2',
        fighterId: 'fighter1',
        date: new Date('2023-10-01'),
        strikesLanded: 40,
        strikesAttempted: 80,
        takedownsLanded: 1,
        takedownsAttempted: 3,
        takedownsDefended: 2,
        takedownsAgainst: 3,
        controlTime: 90,
        fightDuration: 600, // 10 minutes
        result: 'win',
        performance: 75
      },
      {
        fightId: 'fight3',
        fighterId: 'fighter1',
        date: new Date('2023-06-01'),
        strikesLanded: 30,
        strikesAttempted: 90,
        takedownsLanded: 0,
        takedownsAttempted: 2,
        takedownsDefended: 1,
        takedownsAgainst: 2,
        controlTime: 60,
        fightDuration: 450, // 7.5 minutes
        result: 'loss',
        performance: 60
      }
    ];
  });

  describe('constructor', () => {
    it('should use default configuration when none provided', () => {
      const calc = new MetricsCalculator();
      const config = calc.getConfig();
      
      expect(config.windowSize).toBe(5);
      expect(config.minDataPoints).toBe(3);
      expect(config.trendThreshold).toBe(10);
    });

    it('should use custom configuration when provided', () => {
      const customConfig: RollingStatsConfig = {
        windowSize: 3,
        minDataPoints: 2,
        trendThreshold: 15
      };
      
      const calc = new MetricsCalculator(customConfig);
      const config = calc.getConfig();
      
      expect(config).toEqual(customConfig);
    });
  });

  describe('calculateRollingStats', () => {
    it('should calculate rolling statistics correctly', () => {
      const stats = calculator.calculateRollingStats(mockFightStats);
      
      expect(stats.strikingAccuracy.value).toBeCloseTo(44.44, 1); // (50+40+30)/(100+80+90)
      expect(stats.strikingAccuracy.period).toBe(3);
      
      expect(stats.takedownAccuracy.value).toBeCloseTo(30, 1); // (2+1+0)/(5+3+2)
      expect(stats.takedownDefense.value).toBeCloseTo(66.67, 1); // (3+2+1)/(4+3+2)
      
      expect(stats.winRate.value).toBeCloseTo(66.67, 1); // 2 wins out of 3 fights
    });

    it('should throw error when insufficient data points', () => {
      const insufficientStats = mockFightStats.slice(0, 2);
      
      expect(() => {
        calculator.calculateRollingStats(insufficientStats);
      }).toThrow('Insufficient data points');
    });

    it('should handle edge case with zero attempted strikes', () => {
      const zeroStrikesStats: FightStats[] = [
        {
          ...mockFightStats[0],
          strikesLanded: 0,
          strikesAttempted: 0
        },
        mockFightStats[1],
        mockFightStats[2]
      ];
      
      const stats = calculator.calculateRollingStats(zeroStrikesStats);
      expect(stats.strikingAccuracy.value).toBeCloseTo(41.18, 1); // (0+40+30)/(0+80+90)
    });

    it('should handle edge case with zero takedown attempts', () => {
      const zeroTakedownStats: FightStats[] = [
        {
          ...mockFightStats[0],
          takedownsLanded: 0,
          takedownsAttempted: 0
        },
        mockFightStats[1],
        mockFightStats[2]
      ];
      
      const stats = calculator.calculateRollingStats(zeroTakedownStats);
      expect(stats.takedownAccuracy.value).toBeCloseTo(20, 1); // (0+1+0)/(0+3+2)
    });
  });

  describe('calculateFightFrequency', () => {
    it('should calculate fight frequency correctly', () => {
      const stats = calculator.calculateRollingStats(mockFightStats);
      
      // 3 fights over ~7 months (Jan 2024 to Jun 2023)
      expect(stats.fightFrequency).toBeGreaterThan(5); // More than 5 fights per year
      expect(stats.fightFrequency).toBeLessThan(10); // Less than 10 fights per year
    });

    it('should return 0 for single fight', () => {
      const singleFightStats = [mockFightStats[0]];
      
      // Need to use a custom calculator with lower minDataPoints for this test
      const customCalculator = new MetricsCalculator({
        windowSize: 5,
        minDataPoints: 1,
        trendThreshold: 10
      });
      
      const stats = customCalculator.calculateRollingStats(singleFightStats);
      expect(stats.fightFrequency).toBe(0);
    });
  });

  describe('trend calculation', () => {
    it('should detect increasing trend', () => {
      const increasingStats: FightStats[] = [
        { ...mockFightStats[0], strikesLanded: 60, strikesAttempted: 100, date: new Date('2024-03-01') },
        { ...mockFightStats[1], strikesLanded: 50, strikesAttempted: 100, date: new Date('2024-02-01') },
        { ...mockFightStats[2], strikesLanded: 40, strikesAttempted: 100, date: new Date('2024-01-01') }
      ];
      
      const stats = calculator.calculateRollingStats(increasingStats);
      expect(stats.strikingAccuracy.trend).toBe('increasing');
    });

    it('should detect decreasing trend', () => {
      const decreasingStats: FightStats[] = [
        { ...mockFightStats[0], strikesLanded: 40, strikesAttempted: 100, date: new Date('2024-03-01') },
        { ...mockFightStats[1], strikesLanded: 50, strikesAttempted: 100, date: new Date('2024-02-01') },
        { ...mockFightStats[2], strikesLanded: 60, strikesAttempted: 100, date: new Date('2024-01-01') }
      ];
      
      const stats = calculator.calculateRollingStats(decreasingStats);
      expect(stats.strikingAccuracy.trend).toBe('decreasing');
    });

    it('should detect stable trend', () => {
      const stableStats: FightStats[] = [
        { ...mockFightStats[0], strikesLanded: 50, strikesAttempted: 100, date: new Date('2024-03-01') },
        { ...mockFightStats[1], strikesLanded: 51, strikesAttempted: 100, date: new Date('2024-02-01') },
        { ...mockFightStats[2], strikesLanded: 49, strikesAttempted: 100, date: new Date('2024-01-01') }
      ];
      
      const stats = calculator.calculateRollingStats(stableStats);
      expect(stats.strikingAccuracy.trend).toBe('stable');
    });
  });

  describe('analyzeMetricTrend', () => {
    it('should provide detailed trend analysis', () => {
      const values = [40, 45, 50, 55, 60]; // Clear increasing trend
      const analysis = calculator.analyzeMetricTrend(values, 'striking_accuracy');
      
      expect(analysis.metric).toBe('striking_accuracy');
      expect(analysis.trend).toBe('increasing');
      expect(analysis.changePercentage).toBeGreaterThan(0);
      expect(analysis.confidence).toBeGreaterThan(0.8); // High confidence for clear trend
    });

    it('should handle insufficient data', () => {
      const values = [50]; // Single value
      const analysis = calculator.analyzeMetricTrend(values, 'test_metric');
      
      expect(analysis.trend).toBe('stable');
      expect(analysis.changePercentage).toBe(0);
      expect(analysis.confidence).toBe(0);
    });

    it('should calculate confidence correctly', () => {
      const perfectTrend = [10, 20, 30, 40, 50]; // Perfect linear trend
      const noisyTrend = [10, 25, 28, 35, 50]; // Noisy but trending
      
      const perfectAnalysis = calculator.analyzeMetricTrend(perfectTrend, 'perfect');
      const noisyAnalysis = calculator.analyzeMetricTrend(noisyTrend, 'noisy');
      
      expect(perfectAnalysis.confidence).toBeGreaterThan(noisyAnalysis.confidence);
    });
  });

  describe('generateFormIndicators', () => {
    it('should generate form indicators correctly', () => {
      const indicators = calculator.generateFormIndicators(mockFightStats);
      
      expect(indicators).toHaveLength(3);
      expect(indicators[0].fightId).toBe('fight1'); // Most recent first
      expect(indicators[0].result).toBe('win');
      expect(indicators[0].performance).toBe(85);
      
      expect(indicators[2].fightId).toBe('fight3'); // Oldest last
    });

    it('should limit to window size', () => {
      const manyStats = Array.from({ length: 10 }, (_, i) => ({
        ...mockFightStats[0],
        fightId: `fight${i}`,
        date: new Date(2024, i, 1)
      }));
      
      const indicators = calculator.generateFormIndicators(manyStats);
      expect(indicators).toHaveLength(5); // Default window size
    });
  });

  describe('configuration management', () => {
    it('should update configuration correctly', () => {
      const newConfig = { windowSize: 7, trendThreshold: 15 };
      calculator.updateConfig(newConfig);
      
      const config = calculator.getConfig();
      expect(config.windowSize).toBe(7);
      expect(config.trendThreshold).toBe(15);
      expect(config.minDataPoints).toBe(3); // Should keep original value
    });

    it('should return copy of configuration', () => {
      const config1 = calculator.getConfig();
      const config2 = calculator.getConfig();
      
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty fight stats array', () => {
      expect(() => {
        calculator.calculateRollingStats([]);
      }).toThrow('Insufficient data points');
    });

    it('should handle fights with zero duration', () => {
      const zeroDurationStats: FightStats[] = [
        { ...mockFightStats[0], fightDuration: 0 },
        mockFightStats[1],
        mockFightStats[2]
      ];
      
      const stats = calculator.calculateRollingStats(zeroDurationStats);
      expect(Number.isFinite(stats.controlTimePerMinute.value)).toBe(true);
    });

    it('should handle all losses correctly', () => {
      const allLossStats: FightStats[] = mockFightStats.map(stat => ({
        ...stat,
        result: 'loss' as const
      }));
      
      const stats = calculator.calculateRollingStats(allLossStats);
      expect(stats.winRate.value).toBe(0);
    });

    it('should handle all wins correctly', () => {
      const allWinStats: FightStats[] = mockFightStats.map(stat => ({
        ...stat,
        result: 'win' as const
      }));
      
      const stats = calculator.calculateRollingStats(allWinStats);
      expect(stats.winRate.value).toBe(100);
    });

    it('should handle draws and no contests', () => {
      const mixedResultStats: FightStats[] = [
        { ...mockFightStats[0], result: 'win' },
        { ...mockFightStats[1], result: 'draw' },
        { ...mockFightStats[2], result: 'nc' }
      ];
      
      const stats = calculator.calculateRollingStats(mixedResultStats);
      expect(stats.winRate.value).toBeCloseTo(33.33, 1); // 1 win out of 3 fights
    });
  });
});