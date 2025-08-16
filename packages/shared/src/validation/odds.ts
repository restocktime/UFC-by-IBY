import { z } from 'zod';
import { OddsSnapshotSchema, MethodOddsSchema, RoundOddsSchema } from './fight.js';

/**
 * Validation schemas for Odds-related types
 */

export const OddsTimeSeriesSchema = z.object({
  timestamp: z.date(),
  fightId: z.string().uuid(),
  sportsbook: z.string().min(1).max(50),
  odds: z.object({
    moneyline: z.tuple([z.number(), z.number()]),
    method: MethodOddsSchema,
    rounds: RoundOddsSchema
  }),
  volume: z.number().min(0).optional(),
  impliedProbability: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
}).refine((data) => validateImpliedProbability(data), {
  message: "Implied probabilities must sum to approximately 1 (accounting for vig)"
}).refine((data) => validateOddsConsistency(data), {
  message: "Odds must be consistent with implied probabilities"
});

export const MovementAlertSchema = z.object({
  fightId: z.string().uuid(),
  movementType: z.enum(['significant', 'reverse', 'steam']),
  oldOdds: OddsSnapshotSchema,
  newOdds: OddsSnapshotSchema,
  percentageChange: z.number().min(-100).max(100),
  timestamp: z.date()
}).refine((data) => validateMovementConsistency(data), {
  message: "Movement alert data must be consistent"
});

export const ArbitrageOpportunitySchema = z.object({
  fightId: z.string().uuid(),
  sportsbooks: z.array(z.string().min(1)).min(2).max(10),
  profit: z.number().min(0).max(50), // Max 50% profit seems reasonable
  stakes: z.record(z.string(), z.number().min(0)),
  expiresAt: z.date()
}).refine((data) => validateArbitrageOpportunity(data), {
  message: "Arbitrage opportunity must be mathematically valid"
});

/**
 * Validation functions for odds data integrity
 */

/**
 * Validates that implied probabilities are reasonable (accounting for sportsbook vig)
 */
export function validateImpliedProbability(data: any): boolean {
  const [prob1, prob2] = data.impliedProbability;
  
  // Probabilities should be between 0 and 1
  if (prob1 < 0 || prob1 > 1 || prob2 < 0 || prob2 > 1) return false;
  
  // Sum should be greater than 1 (due to vig) but not too much
  const sum = prob1 + prob2;
  return sum >= 1.0 && sum <= 1.2; // 0-20% vig is reasonable
}

/**
 * Validates that odds are consistent with implied probabilities
 */
export function validateOddsConsistency(data: any): boolean {
  const [odds1, odds2] = data.odds.moneyline;
  const [prob1, prob2] = data.impliedProbability;
  
  // Convert American odds to implied probability
  const calcProb1 = odds1 > 0 ? 100 / (odds1 + 100) : Math.abs(odds1) / (Math.abs(odds1) + 100);
  const calcProb2 = odds2 > 0 ? 100 / (odds2 + 100) : Math.abs(odds2) / (Math.abs(odds2) + 100);
  
  // Allow small tolerance for rounding
  const tolerance = 0.01;
  return Math.abs(calcProb1 - prob1) <= tolerance && Math.abs(calcProb2 - prob2) <= tolerance;
}

/**
 * Validates movement alert consistency
 */
export function validateMovementConsistency(data: any): boolean {
  const { oldOdds, newOdds, percentageChange, movementType } = data;
  
  // Timestamps should be in correct order
  if (newOdds.timestamp <= oldOdds.timestamp) return false;
  
  // Calculate actual percentage change
  const oldImpliedProb = oldOdds.moneyline.fighter1 > 0 
    ? 100 / (oldOdds.moneyline.fighter1 + 100)
    : Math.abs(oldOdds.moneyline.fighter1) / (Math.abs(oldOdds.moneyline.fighter1) + 100);
    
  const newImpliedProb = newOdds.moneyline.fighter1 > 0
    ? 100 / (newOdds.moneyline.fighter1 + 100)
    : Math.abs(newOdds.moneyline.fighter1) / (Math.abs(newOdds.moneyline.fighter1) + 100);
  
  const actualChange = ((newImpliedProb - oldImpliedProb) / oldImpliedProb) * 100;
  
  // Allow small tolerance for rounding
  const tolerance = 1; // 1%
  if (Math.abs(actualChange - percentageChange) > tolerance) return false;
  
  // Validate movement type based on change
  const absChange = Math.abs(percentageChange);
  switch (movementType) {
    case 'significant':
      return absChange >= 5; // At least 5% change
    case 'reverse':
      return absChange >= 10; // At least 10% reverse movement
    case 'steam':
      return absChange >= 3; // At least 3% steam move
    default:
      return false;
  }
}

/**
 * Validates arbitrage opportunity calculations
 */
export function validateArbitrageOpportunity(data: any): boolean {
  const { sportsbooks, profit, stakes } = data;
  
  // All sportsbooks should have stakes
  for (const sportsbook of sportsbooks) {
    if (!(sportsbook in stakes) || stakes[sportsbook] <= 0) {
      return false;
    }
  }
  
  // Profit should be positive for arbitrage
  if (profit <= 0) return false;
  
  // Stakes should sum to a reasonable total
  const totalStake = Object.values(stakes).reduce((sum: number, stake: number) => sum + stake, 0);
  if (totalStake <= 0) return false;
  
  return true;
}

/**
 * Validates odds format (American odds)
 */
export function validateAmericanOdds(odds: number): boolean {
  // American odds should be integers
  if (!Number.isInteger(odds)) return false;
  
  // Should not be between -100 and 100 (exclusive)
  if (odds > -100 && odds < 100 && odds !== 0) return false;
  
  // Should be within reasonable range
  return odds >= -10000 && odds <= 10000;
}

/**
 * Validates sportsbook name format
 */
export function validateSportsbookName(name: string): boolean {
  // Should not be empty or just whitespace
  if (!name || name.trim().length === 0) return false;
  
  // Should not contain special characters that might cause issues
  const validPattern = /^[a-zA-Z0-9\s\-_.]+$/;
  return validPattern.test(name);
}

/**
 * Validates odds movement threshold
 */
export function validateMovementThreshold(oldOdds: number, newOdds: number, threshold: number): boolean {
  const oldProb = oldOdds > 0 ? 100 / (oldOdds + 100) : Math.abs(oldOdds) / (Math.abs(oldOdds) + 100);
  const newProb = newOdds > 0 ? 100 / (newOdds + 100) : Math.abs(newOdds) / (Math.abs(newOdds) + 100);
  
  const percentageChange = Math.abs((newProb - oldProb) / oldProb) * 100;
  return percentageChange >= threshold;
}