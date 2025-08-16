import { describe, it, expect } from 'vitest';
import { 
  PredictionRequestSchema,
  PredictionResultSchema,
  ContextualFeaturesSchema,
  MethodProbabilitiesSchema,
  RoundProbabilitiesSchema,
  validateProbabilitySum,
  validateWinnerProbabilities,
  validateRoundProbabilities,
  validateFightersDifferent,
  validatePredictionConsistency,
  validateContextualFeatures,
  validateFeatureImportance,
  validateModelVersion,
  validatePredictionTimestamp
} from './prediction.js';

describe('Prediction Validation Schemas', () => {
  const createValidContextualFeatures = () => ({
    campData: {
      fighter1Camp: 'Jackson Wink MMA',
      fighter2Camp: 'American Top Team',
      trainingPartners: ['Jon Jones', 'Holly Holm']
    },
    injuryReports: {
      fighter1Injuries: ['Torn meniscus 2019'],
      fighter2Injuries: []
    },
    weightCut: {
      fighter1WeightCutHistory: [15, 18, 16],
      fighter2WeightCutHistory: [12, 14, 13]
    },
    layoff: {
      fighter1DaysSinceLastFight: 180,
      fighter2DaysSinceLastFight: 120
    }
  });

  const createValidPredictionRequest = () => ({
    fightId: '123e4567-e89b-12d3-a456-426614174000',
    fighter1Id: '123e4567-e89b-12d3-a456-426614174001',
    fighter2Id: '123e4567-e89b-12d3-a456-426614174002',
    contextualData: createValidContextualFeatures()
  });

  const createValidPredictionResult = () => ({
    winnerProbability: {
      fighter1: 0.65,
      fighter2: 0.35
    },
    methodPrediction: {
      ko: 0.3,
      submission: 0.2,
      decision: 0.5
    },
    roundPrediction: {
      round1: 0.1,
      round2: 0.2,
      round3: 0.7
    },
    confidence: 0.75,
    keyFactors: [
      {
        feature: 'striking_accuracy',
        importance: 0.4,
        description: 'Fighter 1 has superior striking accuracy'
      },
      {
        feature: 'takedown_defense',
        importance: 0.3,
        description: 'Fighter 1 has better takedown defense'
      },
      {
        feature: 'experience',
        importance: 0.3,
        description: 'Fighter 1 has more championship experience'
      }
    ],
    modelVersion: 'v2.1.0',
    timestamp: new Date()
  });

  describe('ContextualFeaturesSchema', () => {
    it('should validate correct contextual features', () => {
      const validFeatures = createValidContextualFeatures();
      const result = ContextualFeaturesSchema.safeParse(validFeatures);
      expect(result.success).toBe(true);
    });

    it('should reject empty camp name', () => {
      const invalidFeatures = createValidContextualFeatures();
      invalidFeatures.campData.fighter1Camp = '';
      
      const result = ContextualFeaturesSchema.safeParse(invalidFeatures);
      expect(result.success).toBe(false);
    });

    it('should reject excessive weight cut', () => {
      const invalidFeatures = createValidContextualFeatures();
      invalidFeatures.weightCut.fighter1WeightCutHistory = [60]; // Too much
      
      const result = ContextualFeaturesSchema.safeParse(invalidFeatures);
      expect(result.success).toBe(false);
    });

    it('should reject excessive layoff', () => {
      const invalidFeatures = createValidContextualFeatures();
      invalidFeatures.layoff.fighter1DaysSinceLastFight = 4000; // Over 10 years
      
      const result = ContextualFeaturesSchema.safeParse(invalidFeatures);
      expect(result.success).toBe(false);
    });

    it('should reject too many training partners', () => {
      const invalidFeatures = createValidContextualFeatures();
      invalidFeatures.campData.trainingPartners = new Array(25).fill('Partner');
      
      const result = ContextualFeaturesSchema.safeParse(invalidFeatures);
      expect(result.success).toBe(false);
    });
  });

  describe('MethodProbabilitiesSchema', () => {
    it('should validate correct method probabilities', () => {
      const validMethod = { ko: 0.3, submission: 0.2, decision: 0.5 };
      const result = MethodProbabilitiesSchema.safeParse(validMethod);
      expect(result.success).toBe(true);
    });

    it('should reject probabilities that don\'t sum to 1', () => {
      const invalidMethod = { ko: 0.3, submission: 0.2, decision: 0.4 }; // Sum = 0.9
      const result = MethodProbabilitiesSchema.safeParse(invalidMethod);
      expect(result.success).toBe(false);
    });

    it('should reject negative probabilities', () => {
      const invalidMethod = { ko: -0.1, submission: 0.2, decision: 0.9 };
      const result = MethodProbabilitiesSchema.safeParse(invalidMethod);
      expect(result.success).toBe(false);
    });

    it('should reject probabilities over 1', () => {
      const invalidMethod = { ko: 1.5, submission: 0.2, decision: -0.7 };
      const result = MethodProbabilitiesSchema.safeParse(invalidMethod);
      expect(result.success).toBe(false);
    });
  });

  describe('RoundProbabilitiesSchema', () => {
    it('should validate 3-round fight probabilities', () => {
      const validRounds = { round1: 0.1, round2: 0.2, round3: 0.7 };
      const result = RoundProbabilitiesSchema.safeParse(validRounds);
      expect(result.success).toBe(true);
    });

    it('should validate 5-round fight probabilities', () => {
      const validRounds = { 
        round1: 0.1, 
        round2: 0.2, 
        round3: 0.3, 
        round4: 0.2, 
        round5: 0.2 
      };
      const result = RoundProbabilitiesSchema.safeParse(validRounds);
      expect(result.success).toBe(true);
    });

    it('should reject round5 without round4', () => {
      const invalidRounds = { 
        round1: 0.1, 
        round2: 0.2, 
        round3: 0.3, 
        round5: 0.4 // Missing round4
      };
      const result = RoundProbabilitiesSchema.safeParse(invalidRounds);
      expect(result.success).toBe(false);
    });

    it('should reject probabilities that don\'t sum to 1', () => {
      const invalidRounds = { round1: 0.1, round2: 0.2, round3: 0.6 }; // Sum = 0.9
      const result = RoundProbabilitiesSchema.safeParse(invalidRounds);
      expect(result.success).toBe(false);
    });
  });

  describe('PredictionRequestSchema', () => {
    it('should validate correct prediction request', () => {
      const validRequest = createValidPredictionRequest();
      const result = PredictionRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject same fighter IDs', () => {
      const invalidRequest = createValidPredictionRequest();
      invalidRequest.fighter2Id = invalidRequest.fighter1Id;
      
      const result = PredictionRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID format', () => {
      const invalidRequest = createValidPredictionRequest();
      invalidRequest.fightId = 'invalid-uuid';
      
      const result = PredictionRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('PredictionResultSchema', () => {
    it('should validate correct prediction result', () => {
      const validResult = createValidPredictionResult();
      const result = PredictionResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it('should reject winner probabilities that don\'t sum to 1', () => {
      const invalidResult = createValidPredictionResult();
      invalidResult.winnerProbability = { fighter1: 0.7, fighter2: 0.2 }; // Sum = 0.9
      
      const result = PredictionResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should reject confidence outside 0-1 range', () => {
      const invalidResult = createValidPredictionResult();
      invalidResult.confidence = 1.5;
      
      const result = PredictionResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should reject empty key factors', () => {
      const invalidResult = createValidPredictionResult();
      invalidResult.keyFactors = [];
      
      const result = PredictionResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });

    it('should reject too many key factors', () => {
      const invalidResult = createValidPredictionResult();
      invalidResult.keyFactors = new Array(25).fill({
        feature: 'test',
        importance: 0.04,
        description: 'Test factor'
      });
      
      const result = PredictionResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });
  });

  describe('validateProbabilitySum', () => {
    it('should validate probabilities that sum to 1', () => {
      const probs = { a: 0.3, b: 0.4, c: 0.3 };
      expect(validateProbabilitySum(probs)).toBe(true);
    });

    it('should allow small floating point errors', () => {
      const probs = { a: 0.333333, b: 0.333333, c: 0.333334 };
      expect(validateProbabilitySum(probs)).toBe(true);
    });

    it('should reject probabilities that don\'t sum to 1', () => {
      const probs = { a: 0.3, b: 0.4, c: 0.2 }; // Sum = 0.9
      expect(validateProbabilitySum(probs)).toBe(false);
    });
  });

  describe('validateWinnerProbabilities', () => {
    it('should validate winner probabilities that sum to 1', () => {
      const probs = { fighter1: 0.6, fighter2: 0.4 };
      expect(validateWinnerProbabilities(probs)).toBe(true);
    });

    it('should reject winner probabilities that don\'t sum to 1', () => {
      const probs = { fighter1: 0.7, fighter2: 0.2 };
      expect(validateWinnerProbabilities(probs)).toBe(false);
    });
  });

  describe('validateRoundProbabilities', () => {
    it('should validate 3-round probabilities', () => {
      const data = { round1: 0.1, round2: 0.2, round3: 0.7 };
      expect(validateRoundProbabilities(data)).toBe(true);
    });

    it('should validate 5-round probabilities', () => {
      const data = { 
        round1: 0.1, 
        round2: 0.2, 
        round3: 0.3, 
        round4: 0.2, 
        round5: 0.2 
      };
      expect(validateRoundProbabilities(data)).toBe(true);
    });

    it('should reject round5 without round4', () => {
      const data = { round1: 0.1, round2: 0.2, round3: 0.3, round5: 0.4 };
      expect(validateRoundProbabilities(data)).toBe(false);
    });

    it('should reject probabilities that don\'t sum to 1', () => {
      const data = { round1: 0.1, round2: 0.2, round3: 0.6 };
      expect(validateRoundProbabilities(data)).toBe(false);
    });
  });

  describe('validateFightersDifferent', () => {
    it('should validate different fighter IDs', () => {
      const data = { fighter1Id: 'id1', fighter2Id: 'id2' };
      expect(validateFightersDifferent(data)).toBe(true);
    });

    it('should reject same fighter IDs', () => {
      const data = { fighter1Id: 'id1', fighter2Id: 'id1' };
      expect(validateFightersDifferent(data)).toBe(false);
    });
  });

  describe('validatePredictionConsistency', () => {
    it('should validate consistent prediction data', () => {
      const data = {
        confidence: 0.8,
        keyFactors: [
          { importance: 0.5 },
          { importance: 0.3 },
          { importance: 0.2 }
        ],
        methodPrediction: { ko: 0.3, submission: 0.2, decision: 0.5 }
      };
      expect(validatePredictionConsistency(data)).toBe(true);
    });

    it('should reject high confidence with low max importance', () => {
      const data = {
        confidence: 0.9,
        keyFactors: [
          { importance: 0.2 }, // Max importance too low for high confidence
          { importance: 0.15 }
        ],
        methodPrediction: { ko: 0.3, submission: 0.2, decision: 0.5 }
      };
      expect(validatePredictionConsistency(data)).toBe(false);
    });

    it('should reject unrealistic method probabilities', () => {
      const data = {
        confidence: 0.7,
        keyFactors: [{ importance: 0.5 }],
        methodPrediction: { ko: 0.05, submission: 0.05, decision: 0.9 }
      };
      expect(validatePredictionConsistency(data)).toBe(true);
    });
  });

  describe('validateContextualFeatures', () => {
    it('should validate reasonable contextual features', () => {
      const features = createValidContextualFeatures();
      expect(validateContextualFeatures(features)).toBe(true);
    });

    it('should allow same camp for large camps', () => {
      const features = createValidContextualFeatures();
      features.campData.fighter1Camp = 'Jackson Wink MMA';
      features.campData.fighter2Camp = 'Jackson Wink MMA';
      expect(validateContextualFeatures(features)).toBe(true);
    });

    it('should reject same camp for small camps', () => {
      const features = createValidContextualFeatures();
      features.campData.fighter1Camp = 'Small Local Gym';
      features.campData.fighter2Camp = 'Small Local Gym';
      expect(validateContextualFeatures(features)).toBe(false);
    });

    it('should reject excessive weight cuts', () => {
      const features = createValidContextualFeatures();
      features.weightCut.fighter1WeightCutHistory = [35, 40, 45]; // Too much
      expect(validateContextualFeatures(features)).toBe(false);
    });

    it('should reject excessive layoffs', () => {
      const features = createValidContextualFeatures();
      features.layoff.fighter1DaysSinceLastFight = 1200; // Over 3 years
      expect(validateContextualFeatures(features)).toBe(false);
    });
  });

  describe('validateFeatureImportance', () => {
    it('should validate reasonable feature importance', () => {
      const features = [
        { feature: 'striking', importance: 0.4, description: 'test' },
        { feature: 'grappling', importance: 0.35, description: 'test' },
        { feature: 'cardio', importance: 0.25, description: 'test' }
      ];
      expect(validateFeatureImportance(features)).toBe(true);
    });

    it('should reject empty features array', () => {
      expect(validateFeatureImportance([])).toBe(false);
    });

    it('should reject features that don\'t sum to ~1', () => {
      const features = [
        { feature: 'striking', importance: 0.2, description: 'test' },
        { feature: 'grappling', importance: 0.2, description: 'test' }
      ]; // Sum = 0.4, too low
      expect(validateFeatureImportance(features)).toBe(false);
    });

    it('should reject features with no significant importance', () => {
      const features = [
        { feature: 'striking', importance: 0.05, description: 'test' },
        { feature: 'grappling', importance: 0.05, description: 'test' }
      ]; // All too low
      expect(validateFeatureImportance(features)).toBe(false);
    });

    it('should reject duplicate feature names', () => {
      const features = [
        { feature: 'striking', importance: 0.5, description: 'test' },
        { feature: 'striking', importance: 0.5, description: 'test' }
      ];
      expect(validateFeatureImportance(features)).toBe(false);
    });
  });

  describe('validateModelVersion', () => {
    it('should validate semantic version format', () => {
      expect(validateModelVersion('1.0.0')).toBe(true);
      expect(validateModelVersion('v2.1.3')).toBe(true);
      expect(validateModelVersion('1.2.3-beta')).toBe(true);
      expect(validateModelVersion('v1.0.0-alpha')).toBe(true);
    });

    it('should reject invalid version formats', () => {
      expect(validateModelVersion('1.0')).toBe(false);
      expect(validateModelVersion('v1')).toBe(false);
      expect(validateModelVersion('1.0.0.0')).toBe(false);
      expect(validateModelVersion('invalid')).toBe(false);
    });
  });

  describe('validatePredictionTimestamp', () => {
    it('should validate recent timestamp', () => {
      const now = new Date();
      expect(validatePredictionTimestamp(now)).toBe(true);
    });

    it('should validate timestamp within one hour', () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      expect(validatePredictionTimestamp(thirtyMinutesAgo)).toBe(true);
    });

    it('should reject timestamp too far in past', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(validatePredictionTimestamp(twoHoursAgo)).toBe(false);
    });

    it('should reject timestamp too far in future', () => {
      const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
      expect(validatePredictionTimestamp(twoHoursFromNow)).toBe(false);
    });
  });
});