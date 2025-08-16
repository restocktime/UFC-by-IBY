import { z } from 'zod';

/**
 * Validation schemas for Fighter-related types
 */

export const FightStanceSchema = z.enum(['Orthodox', 'Southpaw', 'Switch']);

export const WeightClassSchema = z.enum([
  'Flyweight',
  'Bantamweight', 
  'Featherweight',
  'Lightweight',
  'Welterweight',
  'Middleweight',
  'Light Heavyweight',
  'Heavyweight',
  'Women\'s Strawweight',
  'Women\'s Flyweight',
  'Women\'s Bantamweight',
  'Women\'s Featherweight'
]);

export const PhysicalStatsSchema = z.object({
  height: z.number().min(60).max(84), // 5'0" to 7'0"
  weight: z.number().min(115).max(265), // UFC weight ranges
  reach: z.number().min(60).max(84),
  legReach: z.number().min(30).max(50),
  stance: FightStanceSchema
});

export const FightRecordSchema = z.object({
  wins: z.number().min(0),
  losses: z.number().min(0),
  draws: z.number().min(0),
  noContests: z.number().min(0)
});

export const RankingsSchema = z.object({
  weightClass: WeightClassSchema,
  rank: z.number().min(1).max(15).optional(),
  p4pRank: z.number().min(1).max(15).optional()
});

export const CampSchema = z.object({
  name: z.string().min(1).max(100),
  location: z.string().min(1).max(100),
  headCoach: z.string().min(1).max(100)
});

export const SocialMediaSchema = z.object({
  instagram: z.string().url().optional(),
  twitter: z.string().url().optional()
});

export const RollingAverageSchema = z.object({
  value: z.number().min(0).max(100),
  period: z.number().min(1).max(20),
  trend: z.enum(['increasing', 'decreasing', 'stable'])
});

export const FormIndicatorSchema = z.object({
  fightId: z.string().uuid(),
  date: z.date(),
  result: z.enum(['win', 'loss', 'draw', 'nc']),
  performance: z.number().min(0).max(100)
});

export const PerformanceMetricsSchema = z.object({
  strikingAccuracy: RollingAverageSchema,
  takedownDefense: RollingAverageSchema,
  fightFrequency: z.number().min(0).max(10),
  winStreak: z.number().min(0),
  recentForm: z.array(FormIndicatorSchema).max(10)
});

export const TrendAnalysisSchema = z.object({
  performanceTrend: z.enum(['improving', 'declining', 'stable']),
  activityLevel: z.enum(['active', 'inactive', 'semi_active']),
  injuryHistory: z.array(z.string()).max(20),
  lastFightDate: z.date()
});

export const FighterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  nickname: z.string().max(50).optional(),
  physicalStats: PhysicalStatsSchema,
  record: FightRecordSchema,
  rankings: RankingsSchema,
  camp: CampSchema,
  socialMedia: SocialMediaSchema,
  calculatedMetrics: PerformanceMetricsSchema,
  trends: TrendAnalysisSchema,
  lastUpdated: z.date()
}).refine((data) => validateWeightClassConsistency(data), {
  message: "Fighter weight must be appropriate for their weight class"
}).refine((data) => validateRecordConsistency(data), {
  message: "Fighter record must be consistent with recent form and win streak"
});

/**
 * Validation functions for fighter data integrity
 */

/**
 * Validates that a fighter's weight is appropriate for their weight class
 */
export function validateWeightClassConsistency(fighter: any): boolean {
  const { physicalStats, rankings } = fighter;
  const weight = physicalStats.weight;
  const weightClass = rankings.weightClass;

  const weightLimits: Record<string, { min: number; max: number }> = {
    'Flyweight': { min: 115, max: 125 },
    'Bantamweight': { min: 125, max: 135 },
    'Featherweight': { min: 135, max: 145 },
    'Lightweight': { min: 145, max: 155 },
    'Welterweight': { min: 155, max: 170 },
    'Middleweight': { min: 170, max: 185 },
    'Light Heavyweight': { min: 185, max: 205 },
    'Heavyweight': { min: 205, max: 265 },
    'Women\'s Strawweight': { min: 105, max: 115 },
    'Women\'s Flyweight': { min: 115, max: 125 },
    'Women\'s Bantamweight': { min: 125, max: 135 },
    'Women\'s Featherweight': { min: 135, max: 145 }
  };

  const limits = weightLimits[weightClass];
  if (!limits) return false;

  // Allow 10% variance for weight cutting/bulking
  const variance = 0.1;
  const minWeight = limits.min * (1 - variance);
  const maxWeight = limits.max * (1 + variance);

  return weight >= minWeight && weight <= maxWeight;
}

/**
 * Validates that a fighter's record is consistent with their recent form and win streak
 */
export function validateRecordConsistency(fighter: any): boolean {
  const { record, calculatedMetrics } = fighter;
  const { wins, losses } = record;
  const { winStreak, recentForm } = calculatedMetrics;

  // Win streak cannot exceed total wins
  if (winStreak > wins) return false;

  // Win streak cannot be negative
  if (winStreak < 0) return false;

  // Recent form should not have more entries than total fights
  const totalFights = wins + losses + record.draws + record.noContests;
  if (recentForm.length > totalFights) return false;

  // If win streak > 0, the most recent form entry should be a win
  if (winStreak > 0 && recentForm.length > 0) {
    const mostRecentFight = recentForm[recentForm.length - 1];
    if (mostRecentFight.result !== 'win') return false;
  }

  // Count consecutive wins from the end of recent form
  let consecutiveWins = 0;
  for (let i = recentForm.length - 1; i >= 0; i--) {
    if (recentForm[i].result === 'win') {
      consecutiveWins++;
    } else {
      break;
    }
  }

  // Win streak should match consecutive wins in recent form (if recent form is complete)
  if (recentForm.length >= winStreak && consecutiveWins !== winStreak) {
    return false;
  }

  return true;
}

/**
 * Validates fighter age based on typical career patterns
 */
export function validateFighterAge(birthDate: Date, lastFightDate: Date): boolean {
  const age = new Date().getFullYear() - birthDate.getFullYear();
  const lastFightAge = lastFightDate.getFullYear() - birthDate.getFullYear();

  // Fighters typically compete between ages 18-50
  return age >= 18 && age <= 50 && lastFightAge >= 18;
}

/**
 * Validates reach measurements are realistic
 */
export function validateReachMeasurements(physicalStats: any): boolean {
  const { height, reach, legReach } = physicalStats;

  // Reach is typically close to height (within 6 inches)
  const reachHeightDiff = Math.abs(reach - height);
  if (reachHeightDiff > 6) return false;

  // Leg reach should be reasonable proportion of height
  const legReachRatio = legReach / height;
  return legReachRatio >= 0.4 && legReachRatio <= 0.7;
}