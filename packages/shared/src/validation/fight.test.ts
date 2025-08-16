import { describe, it, expect } from 'vitest';
import { 
  FightSchema,
  FightResultSchema,
  OddsSnapshotSchema,
  validateFighterDifferent,
  validateRoundsForFightType,
  validateFightSchedulingRules,
  validateFightResult,
  validateOddsConsistency
} from './fight.js';

describe('Fight Validation Schemas', () => {
  const createValidFight = () => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    eventId: '123e4567-e89b-12d3-a456-426614174001',
    fighter1Id: '123e4567-e89b-12d3-a456-426614174002',
    fighter2Id: '123e4567-e89b-12d3-a456-426614174003',
    weightClass: 'Lightweight' as const,
    titleFight: false,
    mainEvent: false,
    scheduledRounds: 3,
    status: 'scheduled' as const,
    odds: [],
    predictions: []
  });

  const createValidFightResult = () => ({
    winnerId: '123e4567-e89b-12d3-a456-426614174002',
    method: 'KO/TKO' as const,
    round: 2,
    time: '3:45',
    details: 'Left hook knockout'
  });

  const createValidOddsSnapshot = () => ({
    fightId: '123e4567-e89b-12d3-a456-426614174000',
    sportsbook: 'DraftKings',
    timestamp: new Date(),
    moneyline: { fighter1: -150, fighter2: 130 },
    method: { ko: 300, submission: 400, decision: 200 },
    rounds: { round1: 500, round2: 400, round3: 300 }
  });

  describe('FightSchema', () => {
    it('should validate a complete valid fight', () => {
      const validFight = createValidFight();
      const result = FightSchema.safeParse(validFight);
      expect(result.success).toBe(true);
    });

    it('should reject fight with same fighter IDs', () => {
      const invalidFight = createValidFight();
      invalidFight.fighter2Id = invalidFight.fighter1Id;
      
      const result = FightSchema.safeParse(invalidFight);
      expect(result.success).toBe(false);
    });

    it('should reject title fight with wrong number of rounds', () => {
      const invalidFight = createValidFight();
      invalidFight.titleFight = true;
      invalidFight.scheduledRounds = 3; // Should be 5 for title fights
      
      const result = FightSchema.safeParse(invalidFight);
      expect(result.success).toBe(false);
    });

    it('should validate title fight with 5 rounds', () => {
      const validFight = createValidFight();
      validFight.titleFight = true;
      validFight.scheduledRounds = 5;
      
      const result = FightSchema.safeParse(validFight);
      expect(result.success).toBe(true);
    });

    it('should validate main event with 5 rounds', () => {
      const validFight = createValidFight();
      validFight.mainEvent = true;
      validFight.scheduledRounds = 5;
      
      const result = FightSchema.safeParse(validFight);
      expect(result.success).toBe(true);
    });
  });

  describe('FightResultSchema', () => {
    it('should validate correct fight result', () => {
      const validResult = createValidFightResult();
      const result = FightResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it('should reject invalid time format', () => {
      const invalidResult = createValidFightResult();
      invalidResult.time = '25:30'; // Invalid minutes
      
      const result = FightResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should reject invalid round number', () => {
      const invalidResult = createValidFightResult();
      invalidResult.round = 6; // Max is 5
      
      const result = FightResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should reject invalid method', () => {
      const invalidResult = createValidFightResult();
      (invalidResult as any).method = 'Invalid Method';
      
      const result = FightResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });
  });

  describe('OddsSnapshotSchema', () => {
    it('should validate correct odds snapshot', () => {
      const validOdds = createValidOddsSnapshot();
      const result = OddsSnapshotSchema.safeParse(validOdds);
      expect(result.success).toBe(true);
    });

    it('should reject invalid sportsbook name', () => {
      const invalidOdds = createValidOddsSnapshot();
      invalidOdds.sportsbook = '';
      
      const result = OddsSnapshotSchema.safeParse(invalidOdds);
      expect(result.success).toBe(false);
    });
  });

  describe('validateFighterDifferent', () => {
    it('should validate different fighters', () => {
      const fight = {
        fighter1Id: 'fighter1',
        fighter2Id: 'fighter2'
      };
      
      expect(validateFighterDifferent(fight)).toBe(true);
    });

    it('should reject same fighter', () => {
      const fight = {
        fighter1Id: 'fighter1',
        fighter2Id: 'fighter1'
      };
      
      expect(validateFighterDifferent(fight)).toBe(false);
    });
  });

  describe('validateRoundsForFightType', () => {
    it('should validate title fight with 5 rounds', () => {
      const fight = {
        titleFight: true,
        mainEvent: false,
        scheduledRounds: 5
      };
      
      expect(validateRoundsForFightType(fight)).toBe(true);
    });

    it('should reject title fight with 3 rounds', () => {
      const fight = {
        titleFight: true,
        mainEvent: false,
        scheduledRounds: 3
      };
      
      expect(validateRoundsForFightType(fight)).toBe(false);
    });

    it('should validate main event with 5 rounds', () => {
      const fight = {
        titleFight: false,
        mainEvent: true,
        scheduledRounds: 5
      };
      
      expect(validateRoundsForFightType(fight)).toBe(true);
    });

    it('should validate main event with 3 rounds (legacy)', () => {
      const fight = {
        titleFight: false,
        mainEvent: true,
        scheduledRounds: 3
      };
      
      expect(validateRoundsForFightType(fight)).toBe(true);
    });

    it('should validate regular fight with 3 rounds', () => {
      const fight = {
        titleFight: false,
        mainEvent: false,
        scheduledRounds: 3
      };
      
      expect(validateRoundsForFightType(fight)).toBe(true);
    });

    it('should reject regular fight with 5 rounds', () => {
      const fight = {
        titleFight: false,
        mainEvent: false,
        scheduledRounds: 5
      };
      
      expect(validateRoundsForFightType(fight)).toBe(false);
    });
  });

  describe('validateFightSchedulingRules', () => {
    it('should validate scheduled fight without result', () => {
      const fight = {
        status: 'scheduled',
        result: undefined,
        titleFight: false,
        mainEvent: false
      };
      
      expect(validateFightSchedulingRules(fight)).toBe(true);
    });

    it('should validate completed fight with result', () => {
      const fight = {
        status: 'completed',
        result: createValidFightResult(),
        titleFight: false,
        mainEvent: false
      };
      
      expect(validateFightSchedulingRules(fight)).toBe(true);
    });

    it('should reject completed fight without result', () => {
      const fight = {
        status: 'completed',
        result: undefined,
        titleFight: false,
        mainEvent: false
      };
      
      expect(validateFightSchedulingRules(fight)).toBe(false);
    });

    it('should reject scheduled fight with result', () => {
      const fight = {
        status: 'scheduled',
        result: createValidFightResult(),
        titleFight: false,
        mainEvent: false
      };
      
      expect(validateFightSchedulingRules(fight)).toBe(false);
    });
  });

  describe('validateFightResult', () => {
    it('should validate decision going full distance', () => {
      const fight = {
        scheduledRounds: 3,
        result: {
          round: 3,
          time: '5:00',
          method: 'Decision'
        }
      };
      
      expect(validateFightResult(fight)).toBe(true);
    });

    it('should reject decision not going full distance', () => {
      const fight = {
        scheduledRounds: 3,
        result: {
          round: 2,
          time: '3:45',
          method: 'Decision'
        }
      };
      
      expect(validateFightResult(fight)).toBe(false);
    });

    it('should validate finish before full distance', () => {
      const fight = {
        scheduledRounds: 3,
        result: {
          round: 2,
          time: '3:45',
          method: 'KO/TKO'
        }
      };
      
      expect(validateFightResult(fight)).toBe(true);
    });

    it('should reject round exceeding scheduled rounds', () => {
      const fight = {
        scheduledRounds: 3,
        result: {
          round: 4,
          time: '2:30',
          method: 'KO/TKO'
        }
      };
      
      expect(validateFightResult(fight)).toBe(false);
    });
  });

  describe('validateOddsConsistency', () => {
    it('should validate empty odds array', () => {
      expect(validateOddsConsistency([])).toBe(true);
    });

    it('should validate consistent odds timeline', () => {
      const odds = [{
        snapshots: [
          { ...createValidOddsSnapshot(), timestamp: new Date('2023-01-01') },
          { ...createValidOddsSnapshot(), timestamp: new Date('2023-01-02') }
        ],
        openingOdds: { ...createValidOddsSnapshot(), timestamp: new Date('2023-01-01') },
        closingOdds: { ...createValidOddsSnapshot(), timestamp: new Date('2023-01-02') }
      }];
      
      expect(validateOddsConsistency(odds)).toBe(true);
    });

    it('should reject both fighters with positive odds', () => {
      const odds = [{
        snapshots: [{
          ...createValidOddsSnapshot(),
          moneyline: { fighter1: 150, fighter2: 130 } // Both positive
        }],
        openingOdds: createValidOddsSnapshot()
      }];
      
      expect(validateOddsConsistency(odds)).toBe(false);
    });

    it('should reject unreasonable odds values', () => {
      const odds = [{
        snapshots: [{
          ...createValidOddsSnapshot(),
          moneyline: { fighter1: -50000, fighter2: 130 } // Too extreme
        }],
        openingOdds: createValidOddsSnapshot()
      }];
      
      expect(validateOddsConsistency(odds)).toBe(false);
    });
  });
});