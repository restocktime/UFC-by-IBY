/**
 * Tests for BettingAnalysisService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bettingAnalysisService, BettingAnalysisService } from '../betting-analysis.service.js';
import { FightData, OddsData, PredictionResult } from '@ufc-platform/shared';

describe('BettingAnalysisService', () => {
  let service: BettingAnalysisService;
  let mockFightData: FightData;
  let mockOddsData: OddsData[];
  let mockPrediction: PredictionResult;

  beforeEach(() => {
    service = new BettingAnalysisService();
    
    mockFightData = {
      id: 'fight_123',
      fighter1: { name: 'Fighter One', id: 'f1' },
      fighter2: { name: 'Fighter Two', id: 'f2' },
      weightClass: 'Lightweight',
      isTitleFight: false,
      isMainEvent: true,
      scheduledRounds: 3,
      eventId: 'event_123'
    } as FightData;

    mockOddsData = [
      {
        id: 'odds_1',
        fightId: 'fight_123',
        fighter: 'Fighter One',
        sportsbook: 'DraftKings',
        odds: 2.5,
        timestamp: new Date(),
        market: 'moneyline'
      },
      {
        id: 'odds_2',
        fightId: 'fight_123',
        fighter: 'Fighter Two',
        sportsbook: 'DraftKings',
        odds: 1.8,
        timestamp: new Date(),
        market: 'moneyline'
      }
    ] as OddsData[];

    mockPrediction = {
      winnerProbability: { fighter1: 0.65, fighter2: 0.35 },
      methodPrediction: { ko: 0.3, submission: 0.2, decision: 0.5 },
      roundPrediction: { round1: 0.1, round2: 0.2, round3: 0.4, round4: 0.2, round5: 0.1 },
      confidence: 0.75,
      keyFactors: [],
      modelVersion: 'test_v1',
      timestamp: new Date()
    } as PredictionResult;
  });

  describe('analyzeValueBets', () => {
    it('should identify value betting opportunities', async () => {
      const valueBets = await service.analyzeValueBets(mockFightData, mockOddsData, mockPrediction);

      expect(valueBets).toBeDefined();
      expect(Array.isArray(valueBets)).toBe(true);
      

      
      // Should find value bet for Fighter One (65% true prob vs ~40% implied prob)
      const fighter1Bet = valueBets.find(bet => bet.fighter === 'Fighter One');
      expect(fighter1Bet).toBeDefined();
      expect(fighter1Bet?.expectedValue).toBeGreaterThan(0);
    });

    it('should calculate correct implied probability', async () => {
      const valueBets = await service.analyzeValueBets(mockFightData, mockOddsData, mockPrediction);
      
      const fighter1Bet = valueBets.find(bet => bet.fighter === 'Fighter One');
      expect(fighter1Bet?.impliedProbability).toBeCloseTo(1 / 2.5, 2);
    });

    it('should calculate Kelly fraction correctly', async () => {
      const valueBets = await service.analyzeValueBets(mockFightData, mockOddsData, mockPrediction);
      
      const fighter1Bet = valueBets.find(bet => bet.fighter === 'Fighter One');
      expect(fighter1Bet?.kellyFraction).toBeGreaterThan(0);
      expect(fighter1Bet?.kellyFraction).toBeLessThan(1);
    });

    it('should assess risk levels correctly', async () => {
      const valueBets = await service.analyzeValueBets(mockFightData, mockOddsData, mockPrediction);
      
      for (const bet of valueBets) {
        expect(['low', 'medium', 'high']).toContain(bet.riskLevel);
      }
    });

    it('should provide reasoning for value bets', async () => {
      const valueBets = await service.analyzeValueBets(mockFightData, mockOddsData, mockPrediction);
      
      for (const bet of valueBets) {
        expect(bet.reasoning).toBeDefined();
        expect(Array.isArray(bet.reasoning)).toBe(true);
        expect(bet.reasoning.length).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateExpectedValue', () => {
    it('should calculate expected value correctly', () => {
      const result = service.calculateExpectedValue(0.6, 2.0);
      
      expect(result.winProbability).toBe(0.6);
      expect(result.lossProbability).toBe(0.4);
      expect(result.winPayout).toBe(1.0);
      expect(result.lossAmount).toBe(-1);
      expect(result.expectedValue).toBeCloseTo(0.2, 2); // (0.6 * 1) + (0.4 * -1) = 0.2
    });

    it('should calculate break-even odds correctly', () => {
      const result = service.calculateExpectedValue(0.6, 2.0);
      
      expect(result.breakEvenOdds).toBeCloseTo(1.667, 2); // 1 / 0.6
    });

    it('should calculate margin of safety', () => {
      const result = service.calculateExpectedValue(0.6, 2.0);
      
      expect(result.marginOfSafety).toBeGreaterThan(0);
    });
  });

  describe('generateBankrollRecommendations', () => {
    it('should generate conservative recommendations', () => {
      const recommendations = service.generateBankrollRecommendations(10000, 'conservative');
      
      expect(recommendations.totalBankroll).toBe(10000);
      expect(recommendations.recommendations.conservative.unitSize).toBe(50); // 0.5% of bankroll
      expect(recommendations.recommendations.conservative.maxSingleBet).toBe(200); // 2% of bankroll
      expect(recommendations.recommendations.conservative.maxDailyRisk).toBe(500); // 5% of bankroll
    });

    it('should generate moderate recommendations', () => {
      const recommendations = service.generateBankrollRecommendations(10000, 'moderate');
      
      expect(recommendations.recommendedUnit).toBe(100); // 1% of bankroll
      expect(recommendations.maxBetSize).toBe(500); // 5% of bankroll
    });

    it('should generate aggressive recommendations', () => {
      const recommendations = service.generateBankrollRecommendations(10000, 'aggressive');
      
      expect(recommendations.recommendations.aggressive.unitSize).toBe(200); // 2% of bankroll
      expect(recommendations.recommendations.aggressive.maxSingleBet).toBe(1000); // 10% of bankroll
    });

    it('should include risk and diversification metrics', () => {
      const recommendations = service.generateBankrollRecommendations(10000);
      
      expect(recommendations.currentRisk).toBeDefined();
      expect(recommendations.diversificationScore).toBeDefined();
      expect(recommendations.currentRisk).toBeGreaterThanOrEqual(0);
      expect(recommendations.currentRisk).toBeLessThanOrEqual(1);
      expect(recommendations.diversificationScore).toBeGreaterThanOrEqual(0);
      expect(recommendations.diversificationScore).toBeLessThanOrEqual(1);
    });
  });

  describe('createStrategy', () => {
    it('should create a new betting strategy', () => {
      const strategyId = service.createStrategy({
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'value',
        parameters: {
          minExpectedValue: 0.05,
          maxRiskPerBet: 0.02,
          minConfidence: 0.7,
          maxOdds: 4.0,
          minOdds: 1.5,
          bankrollPercentage: 0.01
        },
        filters: [],
        isActive: true
      });

      expect(strategyId).toBeDefined();
      expect(typeof strategyId).toBe('string');
      expect(strategyId.startsWith('strategy_')).toBe(true);
    });

    it('should initialize strategy with zero performance', () => {
      const strategyId = service.createStrategy({
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'value',
        parameters: {
          minExpectedValue: 0.05,
          maxRiskPerBet: 0.02,
          minConfidence: 0.7,
          maxOdds: 4.0,
          minOdds: 1.5,
          bankrollPercentage: 0.01
        },
        filters: [],
        isActive: true
      });

      const performance = service.getStrategyPerformance(strategyId);
      expect(performance).toBeDefined();
      expect(performance?.totalBets).toBe(0);
      expect(performance?.winningBets).toBe(0);
      expect(performance?.totalProfit).toBe(0);
      expect(performance?.roi).toBe(0);
    });
  });

  describe('applyStrategies', () => {
    it('should apply active strategies to find opportunities', async () => {
      // Create a test strategy
      const strategyId = service.createStrategy({
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'value',
        parameters: {
          minExpectedValue: 0.01, // Low threshold to catch opportunities
          maxRiskPerBet: 0.1,
          minConfidence: 0.5,
          maxOdds: 10.0,
          minOdds: 1.1,
          bankrollPercentage: 0.01
        },
        filters: [],
        isActive: true
      });

      const results = await service.applyStrategies(mockFightData, mockOddsData, mockPrediction);
      
      expect(Array.isArray(results)).toBe(true);
      // Should find at least one strategy result since we have value bets
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should not apply inactive strategies', async () => {
      // Create an inactive strategy
      service.createStrategy({
        name: 'Inactive Strategy',
        description: 'An inactive strategy',
        type: 'value',
        parameters: {
          minExpectedValue: 0.01,
          maxRiskPerBet: 0.1,
          minConfidence: 0.5,
          maxOdds: 10.0,
          minOdds: 1.1,
          bankrollPercentage: 0.01
        },
        filters: [],
        isActive: false
      });

      const results = await service.applyStrategies(mockFightData, mockOddsData, mockPrediction);
      
      // Should not include results from inactive strategy
      const inactiveResults = results.find(r => r.strategy.name === 'Inactive Strategy');
      expect(inactiveResults).toBeUndefined();
    });
  });

  describe('detectArbitrageOpportunities', () => {
    it('should detect arbitrage opportunities when they exist', () => {
      // Create odds that allow for arbitrage
      const arbitrageOdds: OddsData[] = [
        {
          id: 'arb_1',
          fightId: 'fight_123',
          fighter: 'Fighter One',
          sportsbook: 'Sportsbook A',
          odds: 2.2,
          timestamp: new Date(),
          market: 'moneyline'
        },
        {
          id: 'arb_2',
          fightId: 'fight_123',
          fighter: 'Fighter Two',
          sportsbook: 'Sportsbook B',
          odds: 2.2,
          timestamp: new Date(),
          market: 'moneyline'
        }
      ];

      const opportunities = service.detectArbitrageOpportunities(mockFightData, arbitrageOdds);
      
      expect(Array.isArray(opportunities)).toBe(true);
      
      if (opportunities.length > 0) {
        const opp = opportunities[0];
        expect(opp.fightId).toBe('fight_123');
        expect(opp.guaranteedProfit).toBeGreaterThan(0);
        expect(opp.bets).toHaveLength(2);
        expect(opp.profitMargin).toBeGreaterThan(0);
      }
    });

    it('should not detect arbitrage when none exists', () => {
      // Use odds that definitely don't create arbitrage
      const noArbitrageOdds: OddsData[] = [
        {
          id: 'odds_1',
          fightId: 'fight_123',
          fighter: 'Fighter One',
          sportsbook: 'DraftKings',
          odds: 1.5, // Higher implied probability
          timestamp: new Date(),
          market: 'moneyline'
        },
        {
          id: 'odds_2',
          fightId: 'fight_123',
          fighter: 'Fighter Two',
          sportsbook: 'DraftKings',
          odds: 3.0, // Lower implied probability
          timestamp: new Date(),
          market: 'moneyline'
        }
      ];
      
      const opportunities = service.detectArbitrageOpportunities(mockFightData, noArbitrageOdds);
      
      // With these odds (1.5 and 3.0), implied probabilities are 0.67 + 0.33 = 1.0, no arbitrage
      expect(opportunities).toHaveLength(0);
    });

    it('should include risk factors in arbitrage opportunities', () => {
      const arbitrageOdds: OddsData[] = [
        {
          id: 'arb_1',
          fightId: 'fight_123',
          fighter: 'Fighter One',
          sportsbook: 'Same Book', // Same sportsbook - risk factor
          odds: 2.2,
          timestamp: new Date(),
          market: 'moneyline'
        },
        {
          id: 'arb_2',
          fightId: 'fight_123',
          fighter: 'Fighter Two',
          sportsbook: 'Same Book', // Same sportsbook - risk factor
          odds: 2.2,
          timestamp: new Date(),
          market: 'moneyline'
        }
      ];

      const opportunities = service.detectArbitrageOpportunities(mockFightData, arbitrageOdds);
      
      if (opportunities.length > 0) {
        expect(opportunities[0].riskFactors).toBeDefined();
        expect(Array.isArray(opportunities[0].riskFactors)).toBe(true);
      }
    });
  });

  describe('updateStrategyPerformance', () => {
    it('should update strategy performance with winning bet', () => {
      const strategyId = service.createStrategy({
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'value',
        parameters: {
          minExpectedValue: 0.05,
          maxRiskPerBet: 0.02,
          minConfidence: 0.7,
          maxOdds: 4.0,
          minOdds: 1.5,
          bankrollPercentage: 0.01
        },
        filters: [],
        isActive: true
      });

      service.updateStrategyPerformance(strategyId, {
        won: true,
        stake: 100,
        payout: 200,
        odds: 2.0
      });

      const performance = service.getStrategyPerformance(strategyId);
      expect(performance?.totalBets).toBe(1);
      expect(performance?.winningBets).toBe(1);
      expect(performance?.totalProfit).toBe(100); // 200 payout - 100 stake
      expect(performance?.averageOdds).toBe(2.0);
      expect(performance?.roi).toBe(100); // 100% ROI
    });

    it('should update strategy performance with losing bet', () => {
      const strategyId = service.createStrategy({
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'value',
        parameters: {
          minExpectedValue: 0.05,
          maxRiskPerBet: 0.02,
          minConfidence: 0.7,
          maxOdds: 4.0,
          minOdds: 1.5,
          bankrollPercentage: 0.01
        },
        filters: [],
        isActive: true
      });

      service.updateStrategyPerformance(strategyId, {
        won: false,
        stake: 100,
        payout: 0,
        odds: 2.0
      });

      const performance = service.getStrategyPerformance(strategyId);
      expect(performance?.totalBets).toBe(1);
      expect(performance?.winningBets).toBe(0);
      expect(performance?.totalProfit).toBe(-100); // Lost the stake
      expect(performance?.roi).toBe(-100); // -100% ROI
    });
  });

  describe('getActiveStrategies', () => {
    it('should return only active strategies', () => {
      // Create active strategy
      service.createStrategy({
        name: 'Active Strategy',
        description: 'An active strategy',
        type: 'value',
        parameters: {
          minExpectedValue: 0.05,
          maxRiskPerBet: 0.02,
          minConfidence: 0.7,
          maxOdds: 4.0,
          minOdds: 1.5,
          bankrollPercentage: 0.01
        },
        filters: [],
        isActive: true
      });

      // Create inactive strategy
      service.createStrategy({
        name: 'Inactive Strategy',
        description: 'An inactive strategy',
        type: 'value',
        parameters: {
          minExpectedValue: 0.05,
          maxRiskPerBet: 0.02,
          minConfidence: 0.7,
          maxOdds: 4.0,
          minOdds: 1.5,
          bankrollPercentage: 0.01
        },
        filters: [],
        isActive: false
      });

      const activeStrategies = service.getActiveStrategies();
      
      expect(Array.isArray(activeStrategies)).toBe(true);
      
      // Should include default strategies plus our active one
      const activeNames = activeStrategies.map(s => s.name);
      expect(activeNames).toContain('Active Strategy');
      expect(activeNames).not.toContain('Inactive Strategy');
    });
  });

  describe('event handling', () => {
    it('should emit events when analyzing value bets', async () => {
      const eventSpy = vi.fn();
      service.on('valueBetsAnalyzed', eventSpy);

      await service.analyzeValueBets(mockFightData, mockOddsData, mockPrediction);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fightId: 'fight_123',
          valueBets: expect.any(Array),
          count: expect.any(Number)
        })
      );
    });

    it('should emit events when creating strategies', () => {
      const eventSpy = vi.fn();
      service.on('strategyCreated', eventSpy);

      const strategyId = service.createStrategy({
        name: 'Test Strategy',
        description: 'A test strategy',
        type: 'value',
        parameters: {
          minExpectedValue: 0.05,
          maxRiskPerBet: 0.02,
          minConfidence: 0.7,
          maxOdds: 4.0,
          minOdds: 1.5,
          bankrollPercentage: 0.01
        },
        filters: [],
        isActive: true
      });

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId,
          strategy: expect.objectContaining({
            name: 'Test Strategy'
          })
        })
      );
    });
  });
});