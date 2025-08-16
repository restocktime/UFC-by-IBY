/**
 * Feature Engineering Service
 * 
 * This module provides comprehensive feature engineering capabilities for the UFC Prediction Platform.
 * It includes rolling statistics calculation, contextual feature extraction, and odds-based feature engineering.
 */

// Rolling Statistics Calculator
export {
  MetricsCalculator,
  type FightStats,
  type RollingStats,
  type RollingStatsConfig,
  type TrendAnalysis
} from './metrics-calculator.js';

// Contextual Feature Extractor
export {
  ContextualFeatureExtractor,
  type ContextualData,
  type ContextualFeatures,
  type CampInfo,
  type InjuryReport,
  type WeightCutInfo,
  type LayoffInfo,
  type VenueExperience,
  type OpponentHistory,
  type CommonOpponent,
  type StyleMismatch,
  type SizeAdvantage,
  type FeatureExtractionConfig
} from './contextual-feature-extractor.js';

// Odds Feature Extractor
export {
  OddsFeatureExtractor,
  type OddsMovementData,
  type OddsFeatures,
  type MarketConsensus,
  type LineMovementMetrics,
  type BookmakerConfidence,
  type OddsFeatureConfig
} from './odds-feature-extractor.js';

// Import classes for internal use
import { MetricsCalculator, type RollingStatsConfig, type FightStats, type RollingStats } from './metrics-calculator.js';
import { ContextualFeatureExtractor, type FeatureExtractionConfig, type ContextualData, type ContextualFeatures } from './contextual-feature-extractor.js';
import { OddsFeatureExtractor, type OddsFeatureConfig, type OddsMovementData, type OddsFeatures } from './odds-feature-extractor.js';

/**
 * Feature Engineering Service Factory
 * 
 * Provides a convenient way to create and configure all feature engineering components
 */
export class FeatureEngineeringService {
  private metricsCalculator: MetricsCalculator;
  private contextualExtractor: ContextualFeatureExtractor;
  private oddsExtractor: OddsFeatureExtractor;

  constructor(
    metricsConfig?: RollingStatsConfig,
    contextualConfig?: FeatureExtractionConfig,
    oddsConfig?: OddsFeatureConfig
  ) {
    this.metricsCalculator = new MetricsCalculator(metricsConfig);
    this.contextualExtractor = new ContextualFeatureExtractor(contextualConfig);
    this.oddsExtractor = new OddsFeatureExtractor(oddsConfig);
  }

  /**
   * Get the metrics calculator instance
   */
  getMetricsCalculator(): MetricsCalculator {
    return this.metricsCalculator;
  }

  /**
   * Get the contextual feature extractor instance
   */
  getContextualExtractor(): ContextualFeatureExtractor {
    return this.contextualExtractor;
  }

  /**
   * Get the odds feature extractor instance
   */
  getOddsExtractor(): OddsFeatureExtractor {
    return this.oddsExtractor;
  }

  /**
   * Extract all features for a fight prediction
   */
  async extractAllFeatures(
    fightStats: FightStats[],
    contextualData: ContextualData,
    oddsData: OddsMovementData
  ): Promise<{
    rollingStats: RollingStats;
    contextualFeatures: ContextualFeatures;
    oddsFeatures: OddsFeatures;
  }> {
    const [rollingStats, contextualFeatures, oddsFeatures] = await Promise.all([
      Promise.resolve(this.metricsCalculator.calculateRollingStats(fightStats)),
      Promise.resolve(this.contextualExtractor.extractFeatures(contextualData)),
      Promise.resolve(this.oddsExtractor.extractFeatures(oddsData))
    ]);

    return {
      rollingStats,
      contextualFeatures,
      oddsFeatures
    };
  }
}

// Re-export types from shared package for convenience
export type { WeightClass, FightStance } from '@ufc-platform/shared';