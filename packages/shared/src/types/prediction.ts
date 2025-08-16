/**
 * Prediction and ML-related interfaces
 */

export interface ContextualFeatures {
  campData: {
    fighter1Camp: string;
    fighter2Camp: string;
    trainingPartners: string[];
  };
  injuryReports: {
    fighter1Injuries: string[];
    fighter2Injuries: string[];
  };
  weightCut: {
    fighter1WeightCutHistory: number[];
    fighter2WeightCutHistory: number[];
  };
  layoff: {
    fighter1DaysSinceLastFight: number;
    fighter2DaysSinceLastFight: number;
  };
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  description: string;
}

export interface MethodProbabilities {
  ko: number;
  submission: number;
  decision: number;
}

export interface RoundProbabilities {
  round1: number;
  round2: number;
  round3: number;
  round4?: number;
  round5?: number;
}

export interface PredictionRequest {
  fightId: string;
  fighter1Id: string;
  fighter2Id: string;
  contextualData: ContextualFeatures;
}

export interface PredictionResult {
  winnerProbability: { fighter1: number; fighter2: number };
  methodPrediction: MethodProbabilities;
  roundPrediction: RoundProbabilities;
  confidence: number;
  keyFactors: FeatureImportance[];
  modelVersion: string;
  timestamp: Date;
}