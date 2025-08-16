import { z } from 'zod';

/**
 * Validation schemas for Prediction-related types
 */

export const ContextualFeaturesSchema = z.object({
  campData: z.object({
    fighter1Camp: z.string().min(1).max(100),
    fighter2Camp: z.string().min(1).max(100),
    trainingPartners: z.array(z.string().max(100)).max(20)
  }),
  injuryReports: z.object({
    fighter1Injuries: z.array(z.string().max(200)).max(10),
    fighter2Injuries: z.array(z.string().max(200)).max(10)
  }),
  weightCut: z.object({
    fighter1WeightCutHistory: z.array(z.number().min(0).max(50)).max(10),
    fighter2WeightCutHistory: z.array(z.number().min(0).max(50)).max(10)
  }),
  layoff: z.object({
    fighter1DaysSinceLastFight: z.number().min(0).max(3650), // Max 10 years
    fighter2DaysSinceLastFight: z.number().min(0).max(3650)
  })
});

export const FeatureImportanceSchema = z.object({
  feature: z.string().min(1).max(100),
  importance: z.number().min(0).max(1),
  description: z.string().min(1).max(500)
});

export const MethodProbabilitiesSchema = z.object({
  ko: z.number().min(0).max(1),
  submission: z.number().min(0).max(1),
  decision: z.number().min(0).max(1)
}).refine((data) => validateProbabilitySum(data), {
  message: "Method probabilities must sum to 1"
});

export const RoundProbabilitiesSchema = z.object({
  round1: z.number().min(0).max(1),
  round2: z.number().min(0).max(1),
  round3: z.number().min(0).max(1),
  round4: z.number().min(0).max(1).optional(),
  round5: z.number().min(0).max(1).optional()
}).refine((data) => validateRoundProbabilities(data), {
  message: "Round probabilities must sum to 1 and be consistent with fight length"
});

export const PredictionRequestSchema = z.object({
  fightId: z.string().uuid(),
  fighter1Id: z.string().uuid(),
  fighter2Id: z.string().uuid(),
  contextualData: ContextualFeaturesSchema
}).refine((data) => validateFightersDifferent(data), {
  message: "Fighter IDs must be different"
});

export const PredictionResultSchema = z.object({
  winnerProbability: z.object({
    fighter1: z.number().min(0).max(1),
    fighter2: z.number().min(0).max(1)
  }).refine((data) => validateWinnerProbabilities(data), {
    message: "Winner probabilities must sum to 1"
  }),
  methodPrediction: MethodProbabilitiesSchema,
  roundPrediction: RoundProbabilitiesSchema,
  confidence: z.number().min(0).max(1),
  keyFactors: z.array(FeatureImportanceSchema).min(1).max(20),
  modelVersion: z.string().min(1).max(50),
  timestamp: z.date()
}).refine((data) => validatePredictionConsistency(data), {
  message: "Prediction data must be internally consistent"
});

/**
 * Validation functions for prediction data integrity
 */

/**
 * Validates that probabilities sum to 1 (with small tolerance)
 */
export function validateProbabilitySum(probabilities: Record<string, number>): boolean {
  const sum = Object.values(probabilities).reduce((acc, val) => acc + val, 0);
  const tolerance = 0.001; // Allow small floating point errors
  return Math.abs(sum - 1) <= tolerance;
}

/**
 * Validates winner probabilities sum to 1
 */
export function validateWinnerProbabilities(data: { fighter1: number; fighter2: number }): boolean {
  return validateProbabilitySum(data);
}

/**
 * Validates round probabilities are consistent
 */
export function validateRoundProbabilities(data: any): boolean {
  const { round1, round2, round3, round4, round5 } = data;
  
  // Collect all defined round probabilities
  const rounds = [round1, round2, round3];
  if (round4 !== undefined) rounds.push(round4);
  if (round5 !== undefined) rounds.push(round5);
  
  // Must sum to 1
  const sum = rounds.reduce((acc, val) => acc + val, 0);
  const tolerance = 0.001;
  if (Math.abs(sum - 1) > tolerance) return false;
  
  // If round 5 is defined, round 4 should also be defined (5-round fight)
  if (round5 !== undefined && round4 === undefined) return false;
  
  return true;
}

/**
 * Validates that fighter IDs are different
 */
export function validateFightersDifferent(data: { fighter1Id: string; fighter2Id: string }): boolean {
  return data.fighter1Id !== data.fighter2Id;
}

/**
 * Validates internal consistency of prediction result
 */
export function validatePredictionConsistency(data: any): boolean {
  const { confidence, keyFactors, methodPrediction, roundPrediction } = data;
  
  // Confidence should correlate with feature importance spread
  const importanceValues = keyFactors.map((f: any) => f.importance);
  const maxImportance = Math.max(...importanceValues);
  const minImportance = Math.min(...importanceValues);
  const importanceSpread = maxImportance - minImportance;
  
  // High confidence should have high max importance and good spread
  if (confidence > 0.8 && maxImportance < 0.3) return false;
  if (confidence < 0.3 && maxImportance > 0.8) return false;
  
  // Method probabilities should be reasonable
  const { ko, submission, decision } = methodPrediction;
  
  // Decision probability should generally be highest for most fights
  // But allow exceptions for fighters with high finish rates
  if (decision < 0.1 && (ko < 0.7 && submission < 0.7)) return false;
  
  return true;
}

/**
 * Validates contextual features are reasonable
 */
export function validateContextualFeatures(features: any): boolean {
  const { campData, injuryReports, weightCut, layoff } = features;
  
  // Camp names should not be the same (usually)
  if (campData.fighter1Camp === campData.fighter2Camp) {
    // Allow same camp only if it's a well-known large camp
    const largeCamps = ['Jackson Wink MMA', 'American Top Team', 'Team Alpha Male'];
    if (!largeCamps.includes(campData.fighter1Camp)) {
      return false;
    }
  }
  
  // Weight cut history should be reasonable
  const fighter1AvgCut = weightCut.fighter1WeightCutHistory.length > 0
    ? weightCut.fighter1WeightCutHistory.reduce((a: number, b: number) => a + b, 0) / weightCut.fighter1WeightCutHistory.length
    : 0;
  const fighter2AvgCut = weightCut.fighter2WeightCutHistory.length > 0
    ? weightCut.fighter2WeightCutHistory.reduce((a: number, b: number) => a + b, 0) / weightCut.fighter2WeightCutHistory.length
    : 0;
  
  // Average weight cut should not exceed 30 lbs (extreme but possible)
  if (fighter1AvgCut > 30 || fighter2AvgCut > 30) return false;
  
  // Layoff should be reasonable for active fighters
  const maxReasonableLayoff = 1095; // 3 years
  if (layoff.fighter1DaysSinceLastFight > maxReasonableLayoff || 
      layoff.fighter2DaysSinceLastFight > maxReasonableLayoff) {
    return false;
  }
  
  return true;
}

/**
 * Validates feature importance values
 */
export function validateFeatureImportance(features: any[]): boolean {
  if (features.length === 0) return false;
  
  // All importance values should sum to approximately 1
  const totalImportance = features.reduce((sum, f) => sum + f.importance, 0);
  const tolerance = 0.1; // Allow 10% tolerance
  if (Math.abs(totalImportance - 1) > tolerance) return false;
  
  // Should have at least one significant feature
  const maxImportance = Math.max(...features.map(f => f.importance));
  if (maxImportance < 0.1) return false;
  
  // Feature names should be unique
  const featureNames = features.map(f => f.feature);
  const uniqueNames = new Set(featureNames);
  if (featureNames.length !== uniqueNames.size) return false;
  
  return true;
}

/**
 * Validates model version format
 */
export function validateModelVersion(version: string): boolean {
  // Should follow semantic versioning pattern (e.g., "1.2.3" or "v1.2.3-beta")
  const semverPattern = /^v?\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/;
  return semverPattern.test(version);
}

/**
 * Validates prediction timestamp is reasonable
 */
export function validatePredictionTimestamp(timestamp: Date): boolean {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  
  // Prediction should be generated within reasonable time window
  return timestamp >= oneHourAgo && timestamp <= oneHourFromNow;
}