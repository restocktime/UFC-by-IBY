import { z } from 'zod';
import { WeightClassSchema } from './fighter.js';

/**
 * Validation schemas for Fight-related types
 */

export const FightMethodSchema = z.enum([
  'KO/TKO',
  'Submission', 
  'Decision',
  'DQ',
  'No Contest'
]);

export const FightStatusSchema = z.enum([
  'scheduled',
  'in_progress', 
  'completed',
  'cancelled'
]);

export const FightResultSchema = z.object({
  winnerId: z.string().uuid(),
  method: FightMethodSchema,
  round: z.number().min(1).max(5),
  time: z.string().regex(/^[0-5]:[0-5][0-9]$/), // MM:SS format
  details: z.string().max(500).optional()
});

export const MethodOddsSchema = z.object({
  ko: z.number(),
  submission: z.number(),
  decision: z.number()
});

export const RoundOddsSchema = z.object({
  round1: z.number(),
  round2: z.number(),
  round3: z.number(),
  round4: z.number().optional(),
  round5: z.number().optional()
});

export const OddsSnapshotSchema = z.object({
  fightId: z.string().uuid(),
  sportsbook: z.string().min(1).max(50),
  timestamp: z.date(),
  moneyline: z.object({
    fighter1: z.number(),
    fighter2: z.number()
  }),
  method: MethodOddsSchema,
  rounds: RoundOddsSchema
});

export const OddsHistorySchema = z.object({
  snapshots: z.array(OddsSnapshotSchema),
  openingOdds: OddsSnapshotSchema,
  closingOdds: OddsSnapshotSchema.optional()
});

export const PredictionHistorySchema = z.object({
  timestamp: z.date(),
  modelVersion: z.string().min(1).max(20),
  prediction: z.any() // Will be more specific when prediction types are defined
});

export const FightSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  fighter1Id: z.string().uuid(),
  fighter2Id: z.string().uuid(),
  weightClass: WeightClassSchema,
  titleFight: z.boolean(),
  mainEvent: z.boolean(),
  scheduledRounds: z.number().min(1).max(5),
  status: FightStatusSchema,
  result: FightResultSchema.optional(),
  odds: z.array(OddsHistorySchema),
  predictions: z.array(PredictionHistorySchema)
}).refine((data) => validateFightSchedulingRules(data), {
  message: "Fight scheduling rules violated"
}).refine((data) => validateFighterDifferent(data), {
  message: "Fighter cannot fight themselves"
}).refine((data) => validateRoundsForFightType(data), {
  message: "Invalid number of rounds for fight type"
});

/**
 * Validation functions for fight scheduling rules and constraints
 */

/**
 * Validates that fighters are different
 */
export function validateFighterDifferent(fight: any): boolean {
  return fight.fighter1Id !== fight.fighter2Id;
}

/**
 * Validates rounds are appropriate for fight type
 */
export function validateRoundsForFightType(fight: any): boolean {
  const { titleFight, mainEvent, scheduledRounds } = fight;
  
  // Title fights and main events are typically 5 rounds
  if (titleFight && scheduledRounds !== 5) {
    return false;
  }
  
  // Main events (non-title) are typically 5 rounds in modern UFC
  if (mainEvent && !titleFight && scheduledRounds !== 5 && scheduledRounds !== 3) {
    return false;
  }
  
  // Regular fights are typically 3 rounds
  if (!titleFight && !mainEvent && scheduledRounds !== 3) {
    return false;
  }
  
  return true;
}

/**
 * Validates general fight scheduling rules
 */
export function validateFightSchedulingRules(fight: any): boolean {
  const { status, result, titleFight, mainEvent } = fight;
  
  // Completed fights must have results
  if (status === 'completed' && !result) {
    return false;
  }
  
  // Scheduled/in-progress fights should not have results
  if ((status === 'scheduled' || status === 'in_progress') && result) {
    return false;
  }
  
  // Only one main event per card (this would need to be validated at event level)
  // Only one title fight per weight class per card (this would need to be validated at event level)
  
  return true;
}

/**
 * Validates fight result consistency
 */
export function validateFightResult(fight: any): boolean {
  if (!fight.result) return true;
  
  const { result, scheduledRounds } = fight;
  const { round, time, method } = result;
  
  // Round cannot exceed scheduled rounds
  if (round > scheduledRounds) return false;
  
  // Time validation based on method
  if (method === 'Decision') {
    // Decision should go the full distance
    if (round !== scheduledRounds) return false;
    // Time should be 5:00 for the final round
    if (time !== '5:00') return false;
  } else {
    // Finish should not be at 5:00 of any round (except round 1 in rare cases)
    if (time === '5:00' && round < scheduledRounds) return false;
  }
  
  return true;
}

/**
 * Validates odds consistency and format
 */
export function validateOddsConsistency(odds: any[]): boolean {
  if (odds.length === 0) return true;
  
  for (const oddsHistory of odds) {
    const { snapshots, openingOdds, closingOdds } = oddsHistory;
    
    // Opening odds should be the first snapshot
    if (snapshots.length > 0) {
      const firstSnapshot = snapshots[0];
      if (openingOdds.timestamp > firstSnapshot.timestamp) {
        return false;
      }
    }
    
    // Closing odds should be the last snapshot (if exists)
    if (closingOdds && snapshots.length > 0) {
      const lastSnapshot = snapshots[snapshots.length - 1];
      if (closingOdds.timestamp < lastSnapshot.timestamp) {
        return false;
      }
    }
    
    // Validate moneyline odds format (American odds)
    for (const snapshot of snapshots) {
      const { fighter1, fighter2 } = snapshot.moneyline;
      
      // Both fighters can't have positive odds (one must be favorite)
      if (fighter1 > 0 && fighter2 > 0) return false;
      
      // Odds should be reasonable ranges
      if (Math.abs(fighter1) > 10000 || Math.abs(fighter2) > 10000) return false;
      if (Math.abs(fighter1) < 100 || Math.abs(fighter2) < 100) return false;
    }
  }
  
  return true;
}