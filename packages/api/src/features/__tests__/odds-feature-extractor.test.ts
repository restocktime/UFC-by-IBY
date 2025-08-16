import { 
  OddsFeatureExtractor, 
  OddsMovementData, 
  OddsFeatureConfig 
} from '../odds-feature-extractor.js';
import { OddsSnapshot, ArbitrageOpportunity } from '@ufc-platform/shared';

describe('OddsFeatureExtractor', () => {
  let extractor: OddsFeatureExtractor;
  let mockOddsData: OddsMovementData;

  beforeEach(() => {
    extractor = new OddsFeatureExtractor();
    
    // Create comprehensive mock odds data
    const baseTime = new Date('2024-08-01T12:00:00Z');
    
    mockOddsData = {
      fightId: 'fight1',
      snapshots: [
        // Opening odds
        {
          fightId: 'fight1',
          sportsbook: 'Pinnacle',
          timestamp: new Date(baseTime.getTime()),
          moneyline: { fighter1: -150, fighter2: +130 },
          method: { ko: +300, submission: +400, decision: +200 },
          rounds: { round1: +800, round2: +600, round3: +400 },
          volume: 10000
        },
        {
          fightId: 'fight1',
          sportsbook: 'DraftKings',
          timestamp: new Date(baseTime.getTime()),
          moneyline: { fighter1: -140, fighter2: +120 },
          method: { ko: +320, submission: +420, decision: +210 },
          rounds: { round1: +850, round2: +650, round3: +420 },
          volume: 15000
        },
        // Mid-period odds (line movement)
        {
          fightId: 'fight1',
          sportsbook: 'Pinnacle',
          timestamp: new Date(baseTime.getTime() + 2 * 60 * 60 * 1000), // 2 hours later
          moneyline: { fighter1: -170, fighter2: +150 },
          method: { ko: +290, submission: +380, decision: +190 },
          rounds: { round1: +780, round2: +580, round3: +380 },
          volume: 25000
        },
        {
          fightId: 'fight1',
          sportsbook: 'DraftKings',
          timestamp: new Date(baseTime.getTime() + 2 * 60 * 60 * 1000),
          moneyline: { fighter1: -160, fighter2: +140 },
          method: { ko: +310, submission: +400, decision: +200 },
          rounds: { round1: +820, round2: +620, round3: +400 },
          volume: 30000
        },
        // Closing odds
        {
          fightId: 'fight1',
          sportsbook: 'Pinnacle',
          timestamp: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000), // 4 hours later
          moneyline: { fighter1: -180, fighter2: +160 },
          method: { ko: +280, submission: +370, decision: +180 },
          rounds: { round1: +760, round2: +560, round3: +360 },
          volume: 20000
        },
        {
          fightId: 'fight1',
          sportsbook: 'DraftKings',
          timestamp: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
          moneyline: { fighter1: -175, fighter2: +155 },
          method: { ko: +300, submission: +390, decision: +190 },
          rounds: { round1: +800, round2: +600, round3: +380 },
          volume: 18000
        }
      ],
      movements: [],
      arbitrageOpportunities: [
        {
          fightId: 'fight1',
          sportsbooks: ['Pinnacle', 'DraftKings'],
          profit: 2.5,
          stakes: { 'Pinnacle': 0.6, 'DraftKings': 0.4 },
          expiresAt: new Date(baseTime.getTime() + 5 * 60 * 1000)
        }
      ]
    };
  });

  describe('constructor', () => {
    it('should use default configuration when none provided', () => {
      const defaultExtractor = new OddsFeatureExtractor();
      const config = defaultExtractor.getConfig();
      
      expect(config.steamMoveThreshold).toBe(5.0);
      expect(config.significantMoveThreshold).toBe(2.0);
      expect(config.sharpBookmakers).toContain('Pinnacle');
      expect(config.publicBookmakers).toContain('DraftKings');
      expect(config.volumeSpikeFactor).toBe(2.0);
      expect(config.arbitrageMinProfit).toBe(1.0);
    });

    it('should use custom configuration when provided', () => {
      const customConfig: OddsFeatureConfig = {
        steamMoveThreshold: 3.0,
        significantMoveThreshold: 1.5,
        sharpBookmakers: ['Pinnacle'],
        publicBookmakers: ['DraftKings', 'FanDuel'],
        volumeSpikeFactor: 1.5,
        arbitrageMinProfit: 0.5
      };
      
      const customExtractor = new OddsFeatureExtractor(customConfig);
      const config = customExtractor.getConfig();
      
      expect(config).toEqual(customConfig);
    });
  });

  describe('calculateImpliedProbability', () => {
    it('should calculate implied probability correctly for positive odds', () => {
      const moneyline = { fighter1: +150, fighter2: -200 };
      const [prob1, prob2] = extractor.calculateImpliedProbability(moneyline);
      
      // +150 = 100/(150+100) = 0.4 before normalization
      // -200 = 200/(200+100) = 0.667 before normalization
      expect(prob1).toBeCloseTo(0.375, 2); // Normalized
      expect(prob2).toBeCloseTo(0.625, 2); // Normalized
      expect(prob1 + prob2).toBeCloseTo(1.0, 2); // Should sum to 1
    });

    it('should calculate implied probability correctly for negative odds', () => {
      const moneyline = { fighter1: -150, fighter2: +130 };
      const [prob1, prob2] = extractor.calculateImpliedProbability(moneyline);
      
      expect(prob1).toBeGreaterThan(0.5); // Favorite should have > 50%
      expect(prob2).toBeLessThan(0.5); // Underdog should have < 50%
      expect(prob1 + prob2).toBeCloseTo(1.0, 2);
    });
  });

  describe('extractFeatures', () => {
    it('should extract all odds features correctly', () => {
      const features = extractor.extractFeatures(mockOddsData);
      
      // Verify all feature categories are present
      expect(features.openingImpliedProbability).toBeDefined();
      expect(features.closingImpliedProbability).toBeDefined();
      expect(features.currentImpliedProbability).toBeDefined();
      expect(features.marketConsensusStrength).toBeDefined();
      expect(features.bookmakerAgreement).toBeDefined();
      expect(features.impliedProbabilityVariance).toBeDefined();
      expect(features.totalLineMovement).toBeDefined();
      expect(features.lineMovementVelocity).toBeDefined();
      expect(features.lineReversalCount).toBeDefined();
      expect(features.steamMoveCount).toBeDefined();
      expect(features.closingLineValue).toBeDefined();
      expect(features.arbitrageOpportunityCount).toBeDefined();
      expect(features.maxArbitrageProfit).toBeDefined();
      expect(features.sharpMoneyPercentage).toBeDefined();
      expect(features.publicMoneyPercentage).toBeDefined();
      expect(features.sharpPublicDivergence).toBeDefined();
      expect(features.averageVolume).toBeDefined();
      expect(features.volumeSpike).toBeDefined();
      expect(features.liquidityScore).toBeDefined();
      expect(features.methodBettingVariance).toBeDefined();
      expect(features.roundBettingVariance).toBeDefined();
      expect(features.favoriteMethodOdds).toBeDefined();
      expect(features.favoriteRoundOdds).toBeDefined();
      
      // Verify feature values are in expected ranges
      expect(features.openingImpliedProbability[0]).toBeGreaterThan(0);
      expect(features.openingImpliedProbability[0]).toBeLessThan(1);
      expect(features.arbitrageOpportunityCount).toBe(1);
      expect(features.maxArbitrageProfit).toBe(2.5);
    });

    it('should detect line movement correctly', () => {
      const features = extractor.extractFeatures(mockOddsData);
      
      // Line moved from -150 to -180 (favorite got stronger)
      expect(features.totalLineMovement).toBeGreaterThan(0);
      expect(features.lineMovementVelocity).toBeGreaterThan(0);
    });

    it('should calculate market consensus correctly', () => {
      const features = extractor.extractFeatures(mockOddsData);
      
      expect(features.marketConsensusStrength).toBeGreaterThan(0);
      expect(features.marketConsensusStrength).toBeLessThanOrEqual(1);
      expect(features.bookmakerAgreement).toBeGreaterThan(0);
    });
  });

  describe('line movement analysis', () => {
    it('should detect steam moves correctly', () => {
      // Create data with a significant rapid movement
      const steamMoveData: OddsMovementData = {
        ...mockOddsData,
        snapshots: [
          {
            ...mockOddsData.snapshots[0],
            moneyline: { fighter1: -150, fighter2: +130 }
          },
          {
            ...mockOddsData.snapshots[1],
            timestamp: new Date(mockOddsData.snapshots[0].timestamp.getTime() + 30 * 60 * 1000), // 30 min later
            moneyline: { fighter1: -200, fighter2: +180 } // Significant move
          }
        ]
      };
      
      const features = extractor.extractFeatures(steamMoveData);
      expect(features.steamMoveCount).toBeGreaterThan(0);
    });

    it('should detect line reversals correctly', () => {
      // Create data with line reversals
      const reversalData: OddsMovementData = {
        ...mockOddsData,
        snapshots: [
          {
            ...mockOddsData.snapshots[0],
            moneyline: { fighter1: -150, fighter2: +130 }
          },
          {
            ...mockOddsData.snapshots[1],
            timestamp: new Date(mockOddsData.snapshots[0].timestamp.getTime() + 60 * 60 * 1000),
            moneyline: { fighter1: -130, fighter2: +110 } // Move toward underdog
          },
          {
            ...mockOddsData.snapshots[2],
            timestamp: new Date(mockOddsData.snapshots[0].timestamp.getTime() + 120 * 60 * 1000),
            moneyline: { fighter1: -170, fighter2: +150 } // Reverse back to favorite
          }
        ]
      };
      
      const features = extractor.extractFeatures(reversalData);
      expect(features.lineReversalCount).toBeGreaterThan(0);
    });
  });

  describe('bookmaker confidence analysis', () => {
    it('should differentiate between sharp and public money', () => {
      const features = extractor.extractFeatures(mockOddsData);
      
      // Should have different percentages for sharp vs public
      expect(features.sharpMoneyPercentage).toBeDefined();
      expect(features.publicMoneyPercentage).toBeDefined();
      expect(features.sharpPublicDivergence).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing sharp or public bookmakers', () => {
      const limitedData: OddsMovementData = {
        ...mockOddsData,
        snapshots: mockOddsData.snapshots.filter(s => s.sportsbook === 'Pinnacle')
      };
      
      const features = extractor.extractFeatures(limitedData);
      
      // Should not throw errors
      expect(features.sharpMoneyPercentage).toBeDefined();
      expect(features.publicMoneyPercentage).toBeDefined();
    });
  });

  describe('volume and liquidity analysis', () => {
    it('should calculate average volume correctly', () => {
      const features = extractor.extractFeatures(mockOddsData);
      
      // Average volume should be calculated from all snapshots with volume
      expect(features.averageVolume).toBeGreaterThan(0);
    });

    it('should detect volume spikes correctly', () => {
      // Create data with volume spike
      const spikeData: OddsMovementData = {
        ...mockOddsData,
        snapshots: [
          { ...mockOddsData.snapshots[0], volume: 10000 },
          { ...mockOddsData.snapshots[1], volume: 50000 }, // Spike
          { ...mockOddsData.snapshots[2], volume: 12000 }
        ]
      };
      
      const features = extractor.extractFeatures(spikeData);
      expect(features.volumeSpike).toBeGreaterThan(0);
    });

    it('should calculate liquidity score correctly', () => {
      const features = extractor.extractFeatures(mockOddsData);
      
      expect(features.liquidityScore).toBeGreaterThan(0);
      expect(features.liquidityScore).toBeLessThanOrEqual(1);
    });
  });

  describe('method and round betting analysis', () => {
    it('should calculate method betting variance correctly', () => {
      const features = extractor.extractFeatures(mockOddsData);
      
      expect(features.methodBettingVariance).toBeGreaterThanOrEqual(0);
    });

    it('should calculate round betting variance correctly', () => {
      const features = extractor.extractFeatures(mockOddsData);
      
      expect(features.roundBettingVariance).toBeGreaterThanOrEqual(0);
    });

    it('should identify favorite method and round correctly', () => {
      const features = extractor.extractFeatures(mockOddsData);
      
      // Favorite should have lowest odds (highest probability)
      expect(features.favoriteMethodOdds).toBeGreaterThan(0);
      expect(features.favoriteRoundOdds).toBeGreaterThan(0);
    });
  });

  describe('arbitrage detection', () => {
    it('should detect arbitrage opportunities correctly', () => {
      // Create clear arbitrage opportunity
      const arbSnapshots: OddsSnapshot[] = [
        {
          fightId: 'fight1',
          sportsbook: 'Book1',
          timestamp: new Date(),
          moneyline: { fighter1: +150, fighter2: -120 },
          method: { ko: +300, submission: +400, decision: +200 },
          rounds: { round1: +800, round2: +600, round3: +400 }
        },
        {
          fightId: 'fight1',
          sportsbook: 'Book2',
          timestamp: new Date(),
          moneyline: { fighter1: -120, fighter2: +180 },
          method: { ko: +320, submission: +420, decision: +210 },
          rounds: { round1: +850, round2: +650, round3: +420 }
        }
      ];
      
      const opportunities = extractor.detectArbitrageOpportunities(arbSnapshots);
      expect(opportunities.length).toBeGreaterThan(0);
      
      if (opportunities.length > 0) {
        expect(opportunities[0].profit).toBeGreaterThan(0);
        expect(opportunities[0].sportsbooks).toHaveLength(2);
      }
    });

    it('should not detect arbitrage when none exists', () => {
      const noArbSnapshots: OddsSnapshot[] = [
        {
          fightId: 'fight1',
          sportsbook: 'Book1',
          timestamp: new Date(),
          moneyline: { fighter1: -150, fighter2: +130 },
          method: { ko: +300, submission: +400, decision: +200 },
          rounds: { round1: +800, round2: +600, round3: +400 }
        },
        {
          fightId: 'fight1',
          sportsbook: 'Book2',
          timestamp: new Date(),
          moneyline: { fighter1: -140, fighter2: +120 },
          method: { ko: +320, submission: +420, decision: +210 },
          rounds: { round1: +850, round2: +650, round3: +420 }
        }
      ];
      
      const opportunities = extractor.detectArbitrageOpportunities(noArbSnapshots);
      expect(opportunities).toHaveLength(0);
    });
  });

  describe('closing line value calculation', () => {
    it('should calculate positive CLV correctly', () => {
      const betOdds = +150; // Bet at +150
      const closingOdds = +120; // Closed at +120 (worse odds)
      
      const clv = extractor.calculateClosingLineValue(betOdds, closingOdds, 'fighter1');
      expect(clv).toBeGreaterThan(0); // Positive CLV
    });

    it('should calculate negative CLV correctly', () => {
      const betOdds = +120; // Bet at +120
      const closingOdds = +150; // Closed at +150 (better odds)
      
      const clv = extractor.calculateClosingLineValue(betOdds, closingOdds, 'fighter1');
      expect(clv).toBeLessThan(0); // Negative CLV
    });
  });

  describe('edge cases', () => {
    it('should handle empty snapshots gracefully', () => {
      const emptyData: OddsMovementData = {
        fightId: 'fight1',
        snapshots: [],
        movements: [],
        arbitrageOpportunities: []
      };
      
      expect(() => {
        extractor.extractFeatures(emptyData);
      }).toThrow(); // Should throw due to no snapshots
    });

    it('should handle single snapshot', () => {
      const singleSnapshotData: OddsMovementData = {
        fightId: 'fight1',
        snapshots: [mockOddsData.snapshots[0]],
        movements: [],
        arbitrageOpportunities: []
      };
      
      const features = extractor.extractFeatures(singleSnapshotData);
      
      // Should handle gracefully with minimal movement metrics
      expect(features.totalLineMovement).toBe(0);
      expect(features.lineMovementVelocity).toBe(0);
      expect(features.lineReversalCount).toBe(0);
    });

    it('should handle missing volume data', () => {
      const noVolumeData: OddsMovementData = {
        ...mockOddsData,
        snapshots: mockOddsData.snapshots.map(s => ({ ...s, volume: undefined }))
      };
      
      const features = extractor.extractFeatures(noVolumeData);
      
      expect(features.averageVolume).toBe(0);
      expect(features.volumeSpike).toBe(0);
    });

    it('should handle extreme odds values', () => {
      const extremeOddsData: OddsMovementData = {
        ...mockOddsData,
        snapshots: [
          {
            ...mockOddsData.snapshots[0],
            moneyline: { fighter1: -10000, fighter2: +5000 } // Extreme favorite
          }
        ]
      };
      
      const features = extractor.extractFeatures(extremeOddsData);
      
      // Should handle without errors
      expect(features.openingImpliedProbability[0]).toBeGreaterThan(0.9); // Heavy favorite
      expect(features.openingImpliedProbability[1]).toBeLessThan(0.1); // Heavy underdog
    });
  });

  describe('configuration management', () => {
    it('should update configuration correctly', () => {
      const newConfig = { 
        steamMoveThreshold: 3.0, 
        arbitrageMinProfit: 0.5 
      };
      extractor.updateConfig(newConfig);
      
      const config = extractor.getConfig();
      expect(config.steamMoveThreshold).toBe(3.0);
      expect(config.arbitrageMinProfit).toBe(0.5);
      expect(config.significantMoveThreshold).toBe(2.0); // Should keep original value
    });

    it('should return copy of configuration', () => {
      const config1 = extractor.getConfig();
      const config2 = extractor.getConfig();
      
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
    });
  });
});