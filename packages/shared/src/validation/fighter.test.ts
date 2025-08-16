import { describe, it, expect } from 'vitest';
import { 
  FighterSchema, 
  PhysicalStatsSchema, 
  FightRecordSchema,
  validateWeightClassConsistency,
  validateRecordConsistency,
  validateFighterAge,
  validateReachMeasurements
} from './fighter.js';

describe('Fighter Validation Schemas', () => {
  const createValidFighter = () => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Jon Jones',
    nickname: 'Bones',
    physicalStats: {
      height: 76, // 6'4"
      weight: 205,
      reach: 84,
      legReach: 40,
      stance: 'Orthodox' as const
    },
    record: {
      wins: 26,
      losses: 1,
      draws: 0,
      noContests: 1
    },
    rankings: {
      weightClass: 'Light Heavyweight' as const,
      rank: 1,
      p4pRank: 1
    },
    camp: {
      name: 'Jackson Wink MMA',
      location: 'Albuquerque, NM',
      headCoach: 'Greg Jackson'
    },
    socialMedia: {
      instagram: 'https://instagram.com/jonnybones',
      twitter: 'https://twitter.com/jonnybones'
    },
    calculatedMetrics: {
      strikingAccuracy: {
        value: 58.2,
        period: 5,
        trend: 'stable' as const
      },
      takedownDefense: {
        value: 95.0,
        period: 5,
        trend: 'increasing' as const
      },
      fightFrequency: 1.2,
      winStreak: 1,
      recentForm: [
        {
          fightId: '123e4567-e89b-12d3-a456-426614174001',
          date: new Date('2023-03-04'),
          result: 'win' as const,
          performance: 85
        }
      ]
    },
    trends: {
      performanceTrend: 'stable' as const,
      activityLevel: 'active' as const,
      injuryHistory: ['Torn meniscus 2019'],
      lastFightDate: new Date('2023-03-04')
    },
    lastUpdated: new Date()
  });

  describe('PhysicalStatsSchema', () => {
    it('should validate correct physical stats', () => {
      const validStats = {
        height: 72, // 6'0"
        weight: 170,
        reach: 74,
        legReach: 40,
        stance: 'Orthodox' as const
      };

      const result = PhysicalStatsSchema.safeParse(validStats);
      expect(result.success).toBe(true);
    });

    it('should reject invalid height', () => {
      const invalidStats = {
        height: 50, // Too short
        weight: 170,
        reach: 74,
        legReach: 40,
        stance: 'Orthodox' as const
      };

      const result = PhysicalStatsSchema.safeParse(invalidStats);
      expect(result.success).toBe(false);
    });

    it('should reject invalid weight', () => {
      const invalidStats = {
        height: 72,
        weight: 300, // Too heavy for UFC
        reach: 74,
        legReach: 40,
        stance: 'Orthodox' as const
      };

      const result = PhysicalStatsSchema.safeParse(invalidStats);
      expect(result.success).toBe(false);
    });

    it('should reject invalid stance', () => {
      const invalidStats = {
        height: 72,
        weight: 170,
        reach: 74,
        legReach: 40,
        stance: 'Invalid' as any
      };

      const result = PhysicalStatsSchema.safeParse(invalidStats);
      expect(result.success).toBe(false);
    });
  });

  describe('FightRecordSchema', () => {
    it('should validate correct fight record', () => {
      const validRecord = {
        wins: 15,
        losses: 3,
        draws: 1,
        noContests: 0
      };

      const result = FightRecordSchema.safeParse(validRecord);
      expect(result.success).toBe(true);
    });

    it('should reject negative values', () => {
      const invalidRecord = {
        wins: -1,
        losses: 3,
        draws: 1,
        noContests: 0
      };

      const result = FightRecordSchema.safeParse(invalidRecord);
      expect(result.success).toBe(false);
    });
  });

  describe('FighterSchema', () => {
    it('should validate a complete valid fighter', () => {
      const validFighter = createValidFighter();
      const result = FighterSchema.safeParse(validFighter);
      expect(result.success).toBe(true);
    });

    it('should reject fighter with invalid weight class consistency', () => {
      const invalidFighter = createValidFighter();
      invalidFighter.physicalStats.weight = 125; // Too light for Light Heavyweight
      
      const result = FighterSchema.safeParse(invalidFighter);
      expect(result.success).toBe(false);
    });

    it('should reject fighter with invalid record consistency', () => {
      const invalidFighter = createValidFighter();
      invalidFighter.calculatedMetrics.winStreak = 30; // More than total wins
      
      const result = FighterSchema.safeParse(invalidFighter);
      expect(result.success).toBe(false);
    });
  });

  describe('validateWeightClassConsistency', () => {
    it('should validate correct weight for weight class', () => {
      const fighter = {
        physicalStats: { weight: 170 },
        rankings: { weightClass: 'Welterweight' }
      };
      
      expect(validateWeightClassConsistency(fighter)).toBe(true);
    });

    it('should reject weight too heavy for weight class', () => {
      const fighter = {
        physicalStats: { weight: 200 },
        rankings: { weightClass: 'Welterweight' }
      };
      
      expect(validateWeightClassConsistency(fighter)).toBe(false);
    });

    it('should reject weight too light for weight class', () => {
      const fighter = {
        physicalStats: { weight: 135 }, // Much too light for Welterweight (155-170)
        rankings: { weightClass: 'Welterweight' }
      };
      
      expect(validateWeightClassConsistency(fighter)).toBe(false);
    });

    it('should allow reasonable variance for weight cutting', () => {
      const fighter = {
        physicalStats: { weight: 175 }, // Slightly over welterweight limit
        rankings: { weightClass: 'Welterweight' }
      };
      
      expect(validateWeightClassConsistency(fighter)).toBe(true);
    });

    it('should handle women\'s weight classes', () => {
      const fighter = {
        physicalStats: { weight: 115 },
        rankings: { weightClass: 'Women\'s Strawweight' }
      };
      
      expect(validateWeightClassConsistency(fighter)).toBe(true);
    });
  });

  describe('validateRecordConsistency', () => {
    it('should validate consistent record and win streak', () => {
      const fighter = {
        record: { wins: 15, losses: 3, draws: 0, noContests: 0 },
        calculatedMetrics: {
          winStreak: 3,
          recentForm: [
            { result: 'loss' },
            { result: 'win' },
            { result: 'win' },
            { result: 'win' }
          ]
        }
      };
      
      expect(validateRecordConsistency(fighter)).toBe(true);
    });

    it('should reject win streak greater than total wins', () => {
      const fighter = {
        record: { wins: 5, losses: 3, draws: 0, noContests: 0 },
        calculatedMetrics: {
          winStreak: 10,
          recentForm: []
        }
      };
      
      expect(validateRecordConsistency(fighter)).toBe(false);
    });

    it('should reject negative win streak', () => {
      const fighter = {
        record: { wins: 15, losses: 3, draws: 0, noContests: 0 },
        calculatedMetrics: {
          winStreak: -1,
          recentForm: []
        }
      };
      
      expect(validateRecordConsistency(fighter)).toBe(false);
    });

    it('should reject inconsistent recent form', () => {
      const fighter = {
        record: { wins: 15, losses: 3, draws: 0, noContests: 0 },
        calculatedMetrics: {
          winStreak: 2,
          recentForm: [
            { result: 'win' },
            { result: 'loss' } // Most recent should be win if win streak > 0
          ]
        }
      };
      
      expect(validateRecordConsistency(fighter)).toBe(false);
    });

    it('should handle zero win streak correctly', () => {
      const fighter = {
        record: { wins: 15, losses: 3, draws: 0, noContests: 0 },
        calculatedMetrics: {
          winStreak: 0,
          recentForm: [
            { result: 'win' },
            { result: 'loss' } // OK if win streak is 0
          ]
        }
      };
      
      expect(validateRecordConsistency(fighter)).toBe(true);
    });
  });

  describe('validateFighterAge', () => {
    it('should validate reasonable fighter age', () => {
      const birthDate = new Date('1990-01-01');
      const lastFightDate = new Date('2023-01-01');
      
      expect(validateFighterAge(birthDate, lastFightDate)).toBe(true);
    });

    it('should reject too young fighter', () => {
      const birthDate = new Date('2010-01-01'); // 13 years old
      const lastFightDate = new Date('2023-01-01');
      
      expect(validateFighterAge(birthDate, lastFightDate)).toBe(false);
    });

    it('should reject too old fighter', () => {
      const birthDate = new Date('1960-01-01'); // 63 years old
      const lastFightDate = new Date('2023-01-01');
      
      expect(validateFighterAge(birthDate, lastFightDate)).toBe(false);
    });
  });

  describe('validateReachMeasurements', () => {
    it('should validate realistic reach measurements', () => {
      const physicalStats = {
        height: 72, // 6'0"
        reach: 74, // 2" longer than height
        legReach: 36 // 50% of height
      };
      
      expect(validateReachMeasurements(physicalStats)).toBe(true);
    });

    it('should reject unrealistic reach difference', () => {
      const physicalStats = {
        height: 72,
        reach: 80, // 8" longer than height (too much)
        legReach: 36
      };
      
      expect(validateReachMeasurements(physicalStats)).toBe(false);
    });

    it('should reject unrealistic leg reach ratio', () => {
      const physicalStats = {
        height: 72,
        reach: 74,
        legReach: 20 // Too short relative to height
      };
      
      expect(validateReachMeasurements(physicalStats)).toBe(false);
    });
  });
});