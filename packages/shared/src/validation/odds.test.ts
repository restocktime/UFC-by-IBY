import { describe, it, expect } from 'vitest';
import { 
  OddsTimeSeriesSchema,
  MovementAlertSchema,
  ArbitrageOpportunitySchema,
  validateImpliedProbability,
  validateOddsConsistency,
  validateMovementConsistency,
  validateArbitrageOpportunity,
  validateAmericanOdds,
  validateSportsbookName,
  validateMovementThreshold
} from './odds.js';

describe('Odds Validation Schemas', () => {
  const createValidOddsTimeSeries = () => ({
    timestamp: new Date(),
    fightId: '123e4567-e89b-12d3-a456-426614174000',
    sportsbook: 'DraftKings',
    odds: {
      moneyline: [-150, 130] as [number, number],
      method: { ko: 300, submission: 400, decision: 200 },
      rounds: { round1: 500, round2: 400, round3: 300 }
    },
    volume: 1000,
    impliedProbability: [0.6, 0.435] as [number, number] // Includes vig
  });

  const createValidMovementAlert = () => ({
    fightId: '123e4567-e89b-12d3-a456-426614174000',
    movementType: 'significant' as const,
    oldOdds: {
      fightId: '123e4567-e89b-12d3-a456-426614174000',
      sportsbook: 'DraftKings',
      timestamp: new Date('2023-01-01'),
      moneyline: { fighter1: -150, fighter2: 130 },
      method: { ko: 300, submission: 400, decision: 200 },
      rounds: { round1: 500, round2: 400, round3: 300 }
    },
    newOdds: {
      fightId: '123e4567-e89b-12d3-a456-426614174000',
      sportsbook: 'DraftKings',
      timestamp: new Date('2023-01-02'),
      moneyline: { fighter1: -120, fighter2: 100 },
      method: { ko: 300, submission: 400, decision: 200 },
      rounds: { round1: 500, round2: 400, round3: 300 }
    },
    percentageChange: -8.33, // Approximate change from -150 to -120
    timestamp: new Date('2023-01-02')
  });

  const createValidArbitrageOpportunity = () => ({
    fightId: '123e4567-e89b-12d3-a456-426614174000',
    sportsbooks: ['DraftKings', 'FanDuel'],
    profit: 5.2,
    stakes: {
      'DraftKings': 100,
      'FanDuel': 95
    },
    expiresAt: new Date(Date.now() + 60000) // 1 minute from now
  });

  describe('OddsTimeSeriesSchema', () => {
    it('should validate correct odds time series', () => {
      const validOdds = createValidOddsTimeSeries();
      const result = OddsTimeSeriesSchema.safeParse(validOdds);
      expect(result.success).toBe(true);
    });

    it('should reject invalid implied probability sum', () => {
      const invalidOdds = createValidOddsTimeSeries();
      invalidOdds.impliedProbability = [0.3, 0.3]; // Sum too low
      
      const result = OddsTimeSeriesSchema.safeParse(invalidOdds);
      expect(result.success).toBe(false);
    });

    it('should reject inconsistent odds and probabilities', () => {
      const invalidOdds = createValidOddsTimeSeries();
      invalidOdds.impliedProbability = [0.9, 0.1]; // Doesn't match odds
      
      const result = OddsTimeSeriesSchema.safeParse(invalidOdds);
      expect(result.success).toBe(false);
    });

    it('should reject negative volume', () => {
      const invalidOdds = createValidOddsTimeSeries();
      invalidOdds.volume = -100;
      
      const result = OddsTimeSeriesSchema.safeParse(invalidOdds);
      expect(result.success).toBe(false);
    });
  });

  describe('MovementAlertSchema', () => {
    it('should validate correct movement alert', () => {
      const validAlert = createValidMovementAlert();
      const result = MovementAlertSchema.safeParse(validAlert);
      expect(result.success).toBe(true);
    });

    it('should reject invalid movement type', () => {
      const invalidAlert = createValidMovementAlert();
      (invalidAlert as any).movementType = 'invalid';
      
      const result = MovementAlertSchema.safeParse(invalidAlert);
      expect(result.success).toBe(false);
    });

    it('should reject percentage change out of range', () => {
      const invalidAlert = createValidMovementAlert();
      invalidAlert.percentageChange = 150; // Over 100%
      
      const result = MovementAlertSchema.safeParse(invalidAlert);
      expect(result.success).toBe(false);
    });
  });

  describe('ArbitrageOpportunitySchema', () => {
    it('should validate correct arbitrage opportunity', () => {
      const validArb = createValidArbitrageOpportunity();
      const result = ArbitrageOpportunitySchema.safeParse(validArb);
      expect(result.success).toBe(true);
    });

    it('should reject too few sportsbooks', () => {
      const invalidArb = createValidArbitrageOpportunity();
      invalidArb.sportsbooks = ['DraftKings']; // Need at least 2
      
      const result = ArbitrageOpportunitySchema.safeParse(invalidArb);
      expect(result.success).toBe(false);
    });

    it('should reject negative profit', () => {
      const invalidArb = createValidArbitrageOpportunity();
      invalidArb.profit = -1;
      
      const result = ArbitrageOpportunitySchema.safeParse(invalidArb);
      expect(result.success).toBe(false);
    });

    it('should reject unrealistic profit', () => {
      const invalidArb = createValidArbitrageOpportunity();
      invalidArb.profit = 60; // Over 50% seems unrealistic
      
      const result = ArbitrageOpportunitySchema.safeParse(invalidArb);
      expect(result.success).toBe(false);
    });
  });

  describe('validateImpliedProbability', () => {
    it('should validate reasonable implied probabilities', () => {
      const data = { impliedProbability: [0.6, 0.45] }; // 5% vig
      expect(validateImpliedProbability(data)).toBe(true);
    });

    it('should reject probabilities that sum to less than 1', () => {
      const data = { impliedProbability: [0.4, 0.5] }; // Sum = 0.9
      expect(validateImpliedProbability(data)).toBe(false);
    });

    it('should reject probabilities with excessive vig', () => {
      const data = { impliedProbability: [0.7, 0.6] }; // 30% vig
      expect(validateImpliedProbability(data)).toBe(false);
    });

    it('should reject probabilities outside 0-1 range', () => {
      const data = { impliedProbability: [1.2, 0.3] };
      expect(validateImpliedProbability(data)).toBe(false);
    });
  });

  describe('validateOddsConsistency', () => {
    it('should validate consistent odds and probabilities', () => {
      const data = {
        odds: { moneyline: [-150, 130] },
        impliedProbability: [0.6, 0.435]
      };
      expect(validateOddsConsistency(data)).toBe(true);
    });

    it('should reject inconsistent odds and probabilities', () => {
      const data = {
        odds: { moneyline: [-150, 130] },
        impliedProbability: [0.8, 0.2] // Doesn't match odds
      };
      expect(validateOddsConsistency(data)).toBe(false);
    });
  });

  describe('validateMovementConsistency', () => {
    it('should validate consistent movement data', () => {
      const data = {
        oldOdds: {
          timestamp: new Date('2023-01-01'),
          moneyline: { fighter1: -150 }
        },
        newOdds: {
          timestamp: new Date('2023-01-02'),
          moneyline: { fighter1: -120 }
        },
        percentageChange: -8.33,
        movementType: 'significant'
      };
      expect(validateMovementConsistency(data)).toBe(true);
    });

    it('should reject backwards timestamps', () => {
      const data = {
        oldOdds: {
          timestamp: new Date('2023-01-02'),
          moneyline: { fighter1: -150 }
        },
        newOdds: {
          timestamp: new Date('2023-01-01'), // Earlier than old
          moneyline: { fighter1: -120 }
        },
        percentageChange: -8.33,
        movementType: 'significant'
      };
      expect(validateMovementConsistency(data)).toBe(false);
    });

    it('should reject movement type that doesn\'t match change', () => {
      const data = {
        oldOdds: {
          timestamp: new Date('2023-01-01'),
          moneyline: { fighter1: -150 }
        },
        newOdds: {
          timestamp: new Date('2023-01-02'),
          moneyline: { fighter1: -148 } // Very small change
        },
        percentageChange: -0.5,
        movementType: 'significant' // Requires >= 5%
      };
      expect(validateMovementConsistency(data)).toBe(false);
    });
  });

  describe('validateArbitrageOpportunity', () => {
    it('should validate valid arbitrage opportunity', () => {
      const data = {
        sportsbooks: ['DraftKings', 'FanDuel'],
        profit: 5.2,
        stakes: {
          'DraftKings': 100,
          'FanDuel': 95
        }
      };
      expect(validateArbitrageOpportunity(data)).toBe(true);
    });

    it('should reject missing stakes for sportsbook', () => {
      const data = {
        sportsbooks: ['DraftKings', 'FanDuel'],
        profit: 5.2,
        stakes: {
          'DraftKings': 100
          // Missing FanDuel
        }
      };
      expect(validateArbitrageOpportunity(data)).toBe(false);
    });

    it('should reject zero or negative profit', () => {
      const data = {
        sportsbooks: ['DraftKings', 'FanDuel'],
        profit: 0,
        stakes: {
          'DraftKings': 100,
          'FanDuel': 95
        }
      };
      expect(validateArbitrageOpportunity(data)).toBe(false);
    });

    it('should reject zero or negative stakes', () => {
      const data = {
        sportsbooks: ['DraftKings', 'FanDuel'],
        profit: 5.2,
        stakes: {
          'DraftKings': 0,
          'FanDuel': 95
        }
      };
      expect(validateArbitrageOpportunity(data)).toBe(false);
    });
  });

  describe('validateAmericanOdds', () => {
    it('should validate standard American odds', () => {
      expect(validateAmericanOdds(-150)).toBe(true);
      expect(validateAmericanOdds(130)).toBe(true);
      expect(validateAmericanOdds(-10000)).toBe(true);
      expect(validateAmericanOdds(10000)).toBe(true);
    });

    it('should reject non-integer odds', () => {
      expect(validateAmericanOdds(-150.5)).toBe(false);
    });

    it('should reject odds between -100 and 100', () => {
      expect(validateAmericanOdds(-50)).toBe(false);
      expect(validateAmericanOdds(50)).toBe(false);
    });

    it('should reject extreme odds', () => {
      expect(validateAmericanOdds(-20000)).toBe(false);
      expect(validateAmericanOdds(20000)).toBe(false);
    });
  });

  describe('validateSportsbookName', () => {
    it('should validate standard sportsbook names', () => {
      expect(validateSportsbookName('DraftKings')).toBe(true);
      expect(validateSportsbookName('FanDuel')).toBe(true);
      expect(validateSportsbookName('Bet365')).toBe(true);
      expect(validateSportsbookName('William Hill')).toBe(true);
    });

    it('should reject empty or whitespace names', () => {
      expect(validateSportsbookName('')).toBe(false);
      expect(validateSportsbookName('   ')).toBe(false);
    });

    it('should reject names with special characters', () => {
      expect(validateSportsbookName('Draft@Kings')).toBe(false);
      expect(validateSportsbookName('Fan$Duel')).toBe(false);
    });

    it('should allow hyphens, underscores, and dots', () => {
      expect(validateSportsbookName('Bet-365')).toBe(true);
      expect(validateSportsbookName('Sports_Book')).toBe(true);
      expect(validateSportsbookName('Book.com')).toBe(true);
    });
  });

  describe('validateMovementThreshold', () => {
    it('should validate movement above threshold', () => {
      expect(validateMovementThreshold(-150, -120, 5)).toBe(true); // ~8.33% change
    });

    it('should reject movement below threshold', () => {
      expect(validateMovementThreshold(-150, -148, 5)).toBe(false); // ~0.5% change
    });

    it('should handle positive odds', () => {
      expect(validateMovementThreshold(130, 150, 5)).toBe(true); // Significant change
    });

    it('should handle mixed positive/negative odds', () => {
      expect(validateMovementThreshold(-110, 150, 10)).toBe(true); // Significant change crossing even
    });
  });
});