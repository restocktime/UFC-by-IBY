/**
 * RealTimeFeatureEngineeringService - Dynamic feature extraction and engineering for live data
 */

import { EventEmitter } from 'events';
import { FightData, FighterData, OddsData } from '@ufc-platform/shared';
import { FightFeatures } from '../../ml/src/models/fight-outcome-predictor.js';

export interface FeatureSet {
  fightId: string;
  features: FightFeatures;
  metadata: FeatureMetadata;
  timestamp: Date;
}

export interface FeatureMetadata {
  dataQuality: number;
  completeness: number;
  sources: string[];
  confidence: number;
  staleness: number; // Minutes since last update
  version: string;
}

export interface DynamicFeature {
  name: string;
  value: number;
  importance: number;
  source: string;
  timestamp: Date;
  confidence: number;
}

export interface FeatureEngineering {
  baseFeatures: FightFeatures;
  dynamicFeatures: DynamicFeature[];
  derivedFeatures: DerivedFeature[];
  contextualFeatures: ContextualFeature[];
  temporalFeatures: TemporalFeature[];
}

export interface DerivedFeature {
  name: string;
  value: number;
  formula: string;
  dependencies: string[];
  confidence: number;
}

export interface ContextualFeature {
  name: string;
  value: number;
  context: string;
  relevance: number;
}

export interface TemporalFeature {
  name: string;
  value: number;
  timeWindow: string;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface FeatureImportanceUpdate {
  feature: string;
  oldImportance: number;
  newImportance: number;
  reason: string;
  timestamp: Date;
}

export interface FeatureQualityMetrics {
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  relevance: number;
  overall: number;
}

export class RealTimeFeatureEngineeringService extends EventEmitter {
  private featureCache: Map<string, FeatureSet> = new Map();
  private featureHistory: Map<string, FeatureSet[]> = new Map();
  private featureImportance: Map<string, number> = new Map();
  private qualityMetrics: Map<string, FeatureQualityMetrics> = new Map();
  private engineeringRules: Map<string, FeatureEngineeringRule> = new Map();

  constructor() {
    super();
    this.initializeFeatureImportance();
    this.initializeEngineeringRules();
  }

  /**
   * Extract and engineer features for a fight in real-time
   */
  async extractFeatures(
    fightData: FightData,
    fighter1Data: FighterData,
    fighter2Data: FighterData,
    oddsData: OddsData[],
    contextData?: any
  ): Promise<FeatureEngineering> {
    const startTime = Date.now();

    try {
      // Extract base features
      const baseFeatures = await this.extractBaseFeatures(
        fightData,
        fighter1Data,
        fighter2Data,
        oddsData
      );

      // Generate dynamic features
      const dynamicFeatures = await this.generateDynamicFeatures(
        fightData,
        fighter1Data,
        fighter2Data,
        oddsData,
        contextData
      );

      // Create derived features
      const derivedFeatures = await this.createDerivedFeatures(
        baseFeatures,
        dynamicFeatures
      );

      // Extract contextual features
      const contextualFeatures = await this.extractContextualFeatures(
        fightData,
        contextData
      );

      // Generate temporal features
      const temporalFeatures = await this.generateTemporalFeatures(
        fightData.id,
        baseFeatures
      );

      // Calculate feature quality
      const metadata = this.calculateFeatureMetadata(
        baseFeatures,
        dynamicFeatures,
        oddsData
      );

      // Cache the feature set
      const featureSet: FeatureSet = {
        fightId: fightData.id,
        features: baseFeatures,
        metadata,
        timestamp: new Date()
      };

      this.cacheFeatureSet(featureSet);

      const engineering: FeatureEngineering = {
        baseFeatures,
        dynamicFeatures,
        derivedFeatures,
        contextualFeatures,
        temporalFeatures
      };

      this.emit('featuresExtracted', {
        fightId: fightData.id,
        engineering,
        processingTime: Date.now() - startTime
      });

      return engineering;

    } catch (error: any) {
      this.emit('featureExtractionError', {
        fightId: fightData.id,
        error: error.message,
        processingTime: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Update features with new live data
   */
  async updateFeatures(
    fightId: string,
    updateData: {
      oddsData?: OddsData[];
      fighterData?: Partial<FighterData>;
      contextData?: any;
    }
  ): Promise<FeatureEngineering | null> {
    const existingFeatureSet = this.featureCache.get(fightId);
    if (!existingFeatureSet) {
      return null;
    }

    // Update relevant features based on new data
    const updatedFeatures = await this.incrementalFeatureUpdate(
      existingFeatureSet,
      updateData
    );

    this.emit('featuresUpdated', {
      fightId,
      updatedFeatures,
      updateType: Object.keys(updateData)
    });

    return updatedFeatures;
  }

  /**
   * Extract base features from fight and fighter data
   */
  private async extractBaseFeatures(
    fightData: FightData,
    fighter1Data: FighterData,
    fighter2Data: FighterData,
    oddsData: OddsData[]
  ): Promise<FightFeatures> {
    // Fighter 1 features
    const fighter1Features = this.extractFighterFeatures(fighter1Data, 1);
    
    // Fighter 2 features
    const fighter2Features = this.extractFighterFeatures(fighter2Data, 2);

    // Comparative features
    const comparativeFeatures = this.calculateComparativeFeatures(
      fighter1Data,
      fighter2Data
    );

    // Contextual features
    const contextualFeatures = this.extractFightContextFeatures(fightData);

    // Odds features
    const oddsFeatures = this.extractOddsFeatures(oddsData);

    return {
      ...fighter1Features,
      ...fighter2Features,
      ...comparativeFeatures,
      ...contextualFeatures,
      ...oddsFeatures
    };
  }

  /**
   * Extract features for a specific fighter
   */
  private extractFighterFeatures(
    fighterData: FighterData,
    fighterNumber: 1 | 2
  ): Partial<FightFeatures> {
    const prefix = `fighter${fighterNumber}`;
    
    return {
      [`${prefix}StrikingAccuracy`]: fighterData.stats?.strikingAccuracy || 0,
      [`${prefix}TakedownDefense`]: fighterData.stats?.takedownDefense || 0,
      [`${prefix}WinStreak`]: this.calculateWinStreak(fighterData.record),
      [`${prefix}RecentForm`]: this.calculateRecentForm(fighterData.record),
      [`${prefix}Experience`]: fighterData.record?.totalFights || 0,
      [`${prefix}Age`]: this.calculateAge(fighterData.dateOfBirth),
      [`${prefix}Reach`]: fighterData.physicalStats?.reach || 0,
      [`${prefix}Height`]: fighterData.physicalStats?.height || 0,
      [`${prefix}Weight`]: fighterData.physicalStats?.weight || 0
    } as Partial<FightFeatures>;
  }

  /**
   * Calculate comparative features between fighters
   */
  private calculateComparativeFeatures(
    fighter1Data: FighterData,
    fighter2Data: FighterData
  ): Partial<FightFeatures> {
    const reach1 = fighter1Data.physicalStats?.reach || 0;
    const reach2 = fighter2Data.physicalStats?.reach || 0;
    const height1 = fighter1Data.physicalStats?.height || 0;
    const height2 = fighter2Data.physicalStats?.height || 0;
    const exp1 = fighter1Data.record?.totalFights || 0;
    const exp2 = fighter2Data.record?.totalFights || 0;
    const age1 = this.calculateAge(fighter1Data.dateOfBirth);
    const age2 = this.calculateAge(fighter2Data.dateOfBirth);

    return {
      reachAdvantage: reach1 - reach2,
      heightAdvantage: height1 - height2,
      experienceAdvantage: exp1 - exp2,
      ageAdvantage: age2 - age1 // Younger is advantage
    };
  }

  /**
   * Extract fight context features
   */
  private extractFightContextFeatures(fightData: FightData): Partial<FightFeatures> {
    return {
      titleFight: fightData.isTitleFight ? 1 : 0,
      mainEvent: fightData.isMainEvent ? 1 : 0,
      scheduledRounds: fightData.scheduledRounds || 3,
      daysSinceLastFight1: this.calculateDaysSinceLastFight(fightData.fighter1),
      daysSinceLastFight2: this.calculateDaysSinceLastFight(fightData.fighter2)
    };
  }

  /**
   * Extract odds-based features
   */
  private extractOddsFeatures(oddsData: OddsData[]): Partial<FightFeatures> {
    if (oddsData.length === 0) {
      return {
        impliedProbability1: 0.5,
        impliedProbability2: 0.5,
        oddsMovement: 0
      };
    }

    // Calculate average implied probabilities
    const fighter1Odds = oddsData.filter(o => o.fighter.includes('1') || o.type === 'fighter1');
    const fighter2Odds = oddsData.filter(o => o.fighter.includes('2') || o.type === 'fighter2');

    const avgOdds1 = fighter1Odds.length > 0 
      ? fighter1Odds.reduce((sum, o) => sum + o.odds, 0) / fighter1Odds.length
      : 2.0;
    
    const avgOdds2 = fighter2Odds.length > 0
      ? fighter2Odds.reduce((sum, o) => sum + o.odds, 0) / fighter2Odds.length
      : 2.0;

    const impliedProb1 = 1 / avgOdds1;
    const impliedProb2 = 1 / avgOdds2;

    // Normalize probabilities
    const total = impliedProb1 + impliedProb2;
    
    return {
      impliedProbability1: impliedProb1 / total,
      impliedProbability2: impliedProb2 / total,
      oddsMovement: this.calculateOddsMovement(oddsData)
    };
  }

  /**
   * Generate dynamic features based on real-time data
   */
  private async generateDynamicFeatures(
    fightData: FightData,
    fighter1Data: FighterData,
    fighter2Data: FighterData,
    oddsData: OddsData[],
    contextData?: any
  ): Promise<DynamicFeature[]> {
    const features: DynamicFeature[] = [];

    // Momentum features
    features.push(...this.calculateMomentumFeatures(fighter1Data, fighter2Data));

    // Market sentiment features
    features.push(...this.calculateMarketSentimentFeatures(oddsData));

    // Injury/condition features
    if (contextData?.injuries) {
      features.push(...this.calculateInjuryFeatures(contextData.injuries));
    }

    // Training camp features
    if (contextData?.trainingCamp) {
      features.push(...this.calculateTrainingCampFeatures(contextData.trainingCamp));
    }

    // Weather/venue features
    if (contextData?.venue) {
      features.push(...this.calculateVenueFeatures(contextData.venue));
    }

    return features;
  }

  /**
   * Create derived features from base and dynamic features
   */
  private async createDerivedFeatures(
    baseFeatures: FightFeatures,
    dynamicFeatures: DynamicFeature[]
  ): Promise<DerivedFeature[]> {
    const derived: DerivedFeature[] = [];

    // Composite skill scores
    derived.push({
      name: 'fighter1_composite_skill',
      value: (baseFeatures.fighter1StrikingAccuracy * 0.4) + 
             (baseFeatures.fighter1TakedownDefense * 0.3) + 
             (baseFeatures.fighter1RecentForm * 0.3),
      formula: 'striking_accuracy * 0.4 + takedown_defense * 0.3 + recent_form * 0.3',
      dependencies: ['fighter1StrikingAccuracy', 'fighter1TakedownDefense', 'fighter1RecentForm'],
      confidence: 0.85
    });

    derived.push({
      name: 'fighter2_composite_skill',
      value: (baseFeatures.fighter2StrikingAccuracy * 0.4) + 
             (baseFeatures.fighter2TakedownDefense * 0.3) + 
             (baseFeatures.fighter2RecentForm * 0.3),
      formula: 'striking_accuracy * 0.4 + takedown_defense * 0.3 + recent_form * 0.3',
      dependencies: ['fighter2StrikingAccuracy', 'fighter2TakedownDefense', 'fighter2RecentForm'],
      confidence: 0.85
    });

    // Experience-adjusted features
    const expFactor1 = Math.min(1.0, baseFeatures.fighter1Experience / 20);
    const expFactor2 = Math.min(1.0, baseFeatures.fighter2Experience / 20);

    derived.push({
      name: 'fighter1_experience_adjusted_skill',
      value: derived[0].value * expFactor1,
      formula: 'composite_skill * min(1.0, experience / 20)',
      dependencies: ['fighter1_composite_skill', 'fighter1Experience'],
      confidence: 0.80
    });

    // Physical advantage composite
    const physicalAdvantage = (
      Math.abs(baseFeatures.reachAdvantage) * 0.4 +
      Math.abs(baseFeatures.heightAdvantage) * 0.3 +
      Math.abs(baseFeatures.ageAdvantage) * 0.3
    );

    derived.push({
      name: 'physical_advantage_composite',
      value: physicalAdvantage,
      formula: 'abs(reach_advantage) * 0.4 + abs(height_advantage) * 0.3 + abs(age_advantage) * 0.3',
      dependencies: ['reachAdvantage', 'heightAdvantage', 'ageAdvantage'],
      confidence: 0.75
    });

    return derived;
  }

  /**
   * Extract contextual features from fight context
   */
  private async extractContextualFeatures(
    fightData: FightData,
    contextData?: any
  ): Promise<ContextualFeature[]> {
    const features: ContextualFeature[] = [];

    // Event importance
    features.push({
      name: 'event_importance',
      value: this.calculateEventImportance(fightData),
      context: 'event_context',
      relevance: 0.7
    });

    // Division competitiveness
    features.push({
      name: 'division_competitiveness',
      value: this.calculateDivisionCompetitiveness(fightData.weightClass),
      context: 'division_context',
      relevance: 0.6
    });

    // Historical matchup patterns
    if (contextData?.historicalMatchups) {
      features.push({
        name: 'historical_pattern_similarity',
        value: this.calculateHistoricalSimilarity(contextData.historicalMatchups),
        context: 'historical_context',
        relevance: 0.8
      });
    }

    return features;
  }

  /**
   * Generate temporal features based on historical data
   */
  private async generateTemporalFeatures(
    fightId: string,
    currentFeatures: FightFeatures
  ): Promise<TemporalFeature[]> {
    const features: TemporalFeature[] = [];
    const history = this.featureHistory.get(fightId) || [];

    if (history.length > 0) {
      // Feature trends over time
      const recentHistory = history.slice(-5); // Last 5 updates
      
      features.push({
        name: 'odds_trend_1h',
        value: this.calculateTrend(recentHistory, 'impliedProbability1', '1h'),
        timeWindow: '1h',
        trend: this.getTrendDirection(recentHistory, 'impliedProbability1')
      });

      features.push({
        name: 'market_momentum_30m',
        value: this.calculateMarketMomentum(recentHistory, '30m'),
        timeWindow: '30m',
        trend: this.getMarketTrendDirection(recentHistory)
      });
    }

    return features;
  }

  /**
   * Calculate feature metadata including quality metrics
   */
  private calculateFeatureMetadata(
    features: FightFeatures,
    dynamicFeatures: DynamicFeature[],
    oddsData: OddsData[]
  ): FeatureMetadata {
    const completeness = this.calculateCompleteness(features);
    const dataQuality = this.calculateDataQuality(features, dynamicFeatures);
    const confidence = this.calculateOverallConfidence(dynamicFeatures);
    const staleness = this.calculateStaleness(oddsData);

    return {
      dataQuality,
      completeness,
      sources: this.identifySources(dynamicFeatures),
      confidence,
      staleness,
      version: '1.0'
    };
  }

  /**
   * Cache feature set and maintain history
   */
  private cacheFeatureSet(featureSet: FeatureSet): void {
    this.featureCache.set(featureSet.fightId, featureSet);

    // Add to history
    if (!this.featureHistory.has(featureSet.fightId)) {
      this.featureHistory.set(featureSet.fightId, []);
    }
    
    const history = this.featureHistory.get(featureSet.fightId)!;
    history.push(featureSet);

    // Keep only recent history (last 100 updates)
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * Perform incremental feature updates
   */
  private async incrementalFeatureUpdate(
    existingFeatureSet: FeatureSet,
    updateData: {
      oddsData?: OddsData[];
      fighterData?: Partial<FighterData>;
      contextData?: any;
    }
  ): Promise<FeatureEngineering> {
    const updatedFeatures = { ...existingFeatureSet.features };

    // Update odds-based features
    if (updateData.oddsData) {
      const oddsFeatures = this.extractOddsFeatures(updateData.oddsData);
      Object.assign(updatedFeatures, oddsFeatures);
    }

    // Update fighter-specific features
    if (updateData.fighterData) {
      // Update relevant fighter features
      // This would be more sophisticated in practice
    }

    // Generate new dynamic features
    const dynamicFeatures: DynamicFeature[] = [];
    if (updateData.oddsData) {
      dynamicFeatures.push(...this.calculateMarketSentimentFeatures(updateData.oddsData));
    }

    // Create updated derived features
    const derivedFeatures = await this.createDerivedFeatures(updatedFeatures, dynamicFeatures);

    // Update cache
    const updatedFeatureSet: FeatureSet = {
      ...existingFeatureSet,
      features: updatedFeatures,
      timestamp: new Date()
    };
    
    this.cacheFeatureSet(updatedFeatureSet);

    return {
      baseFeatures: updatedFeatures,
      dynamicFeatures,
      derivedFeatures,
      contextualFeatures: [], // Would be updated if context changed
      temporalFeatures: await this.generateTemporalFeatures(existingFeatureSet.fightId, updatedFeatures)
    };
  }

  /**
   * Helper methods for feature calculations
   */

  private calculateWinStreak(record: any): number {
    // Placeholder - would analyze recent fight results
    return record?.wins || 0;
  }

  private calculateRecentForm(record: any): number {
    // Placeholder - would analyze performance in last 3-5 fights
    return 0.75;
  }

  private calculateAge(dateOfBirth: string): number {
    if (!dateOfBirth) return 30; // Default age
    const birth = new Date(dateOfBirth);
    const now = new Date();
    return Math.floor((now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }

  private calculateDaysSinceLastFight(fighter: any): number {
    // Placeholder - would calculate from last fight date
    return 90;
  }

  private calculateOddsMovement(oddsData: OddsData[]): number {
    // Placeholder - would calculate movement over time
    return 0;
  }

  private calculateMomentumFeatures(fighter1: FighterData, fighter2: FighterData): DynamicFeature[] {
    return [
      {
        name: 'fighter1_momentum',
        value: 0.75,
        importance: 0.6,
        source: 'recent_performance',
        timestamp: new Date(),
        confidence: 0.8
      }
    ];
  }

  private calculateMarketSentimentFeatures(oddsData: OddsData[]): DynamicFeature[] {
    return [
      {
        name: 'market_sentiment',
        value: 0.6,
        importance: 0.7,
        source: 'odds_movement',
        timestamp: new Date(),
        confidence: 0.75
      }
    ];
  }

  private calculateInjuryFeatures(injuries: any): DynamicFeature[] {
    return [];
  }

  private calculateTrainingCampFeatures(trainingCamp: any): DynamicFeature[] {
    return [];
  }

  private calculateVenueFeatures(venue: any): DynamicFeature[] {
    return [];
  }

  private calculateEventImportance(fightData: FightData): number {
    let importance = 0.5;
    if (fightData.isTitleFight) importance += 0.3;
    if (fightData.isMainEvent) importance += 0.2;
    return Math.min(1.0, importance);
  }

  private calculateDivisionCompetitiveness(weightClass: string): number {
    // Placeholder - would analyze division depth
    return 0.7;
  }

  private calculateHistoricalSimilarity(matchups: any): number {
    // Placeholder - would analyze similar historical matchups
    return 0.6;
  }

  private calculateTrend(history: FeatureSet[], feature: string, timeWindow: string): number {
    // Placeholder - would calculate trend over time window
    return 0.1;
  }

  private getTrendDirection(history: FeatureSet[], feature: string): 'increasing' | 'decreasing' | 'stable' {
    // Placeholder - would analyze trend direction
    return 'stable';
  }

  private calculateMarketMomentum(history: FeatureSet[], timeWindow: string): number {
    // Placeholder - would calculate market momentum
    return 0.05;
  }

  private getMarketTrendDirection(history: FeatureSet[]): 'increasing' | 'decreasing' | 'stable' {
    // Placeholder - would analyze market trend
    return 'stable';
  }

  private calculateCompleteness(features: FightFeatures): number {
    const totalFields = Object.keys(features).length;
    const nonZeroFields = Object.values(features).filter(v => v !== 0 && v !== null && v !== undefined).length;
    return nonZeroFields / totalFields;
  }

  private calculateDataQuality(features: FightFeatures, dynamicFeatures: DynamicFeature[]): number {
    // Weighted average of feature confidences
    const dynamicConfidence = dynamicFeatures.length > 0
      ? dynamicFeatures.reduce((sum, f) => sum + f.confidence, 0) / dynamicFeatures.length
      : 0.8;
    
    return dynamicConfidence;
  }

  private calculateOverallConfidence(dynamicFeatures: DynamicFeature[]): number {
    return dynamicFeatures.length > 0
      ? dynamicFeatures.reduce((sum, f) => sum + f.confidence, 0) / dynamicFeatures.length
      : 0.75;
  }

  private calculateStaleness(oddsData: OddsData[]): number {
    if (oddsData.length === 0) return 60; // 60 minutes if no odds data
    
    const mostRecent = Math.max(...oddsData.map(o => o.timestamp.getTime()));
    const now = Date.now();
    return (now - mostRecent) / (1000 * 60); // Minutes
  }

  private identifySources(dynamicFeatures: DynamicFeature[]): string[] {
    return [...new Set(dynamicFeatures.map(f => f.source))];
  }

  private initializeFeatureImportance(): void {
    // Initialize with default feature importance scores
    const defaultImportance = {
      'fighter1StrikingAccuracy': 0.15,
      'fighter2StrikingAccuracy': 0.15,
      'fighter1TakedownDefense': 0.12,
      'fighter2TakedownDefense': 0.12,
      'reachAdvantage': 0.08,
      'experienceAdvantage': 0.10,
      'impliedProbability1': 0.20,
      'impliedProbability2': 0.08
    };

    for (const [feature, importance] of Object.entries(defaultImportance)) {
      this.featureImportance.set(feature, importance);
    }
  }

  private initializeEngineeringRules(): void {
    // Initialize feature engineering rules
    // This would contain rules for creating derived features
  }

  /**
   * Get cached features for a fight
   */
  getCachedFeatures(fightId: string): FeatureSet | null {
    return this.featureCache.get(fightId) || null;
  }

  /**
   * Get feature importance scores
   */
  getFeatureImportance(): Map<string, number> {
    return new Map(this.featureImportance);
  }

  /**
   * Update feature importance based on model feedback
   */
  updateFeatureImportance(updates: FeatureImportanceUpdate[]): void {
    for (const update of updates) {
      this.featureImportance.set(update.feature, update.newImportance);
      
      this.emit('featureImportanceUpdated', update);
    }
  }
}

interface FeatureEngineeringRule {
  name: string;
  condition: (features: FightFeatures) => boolean;
  action: (features: FightFeatures) => DerivedFeature;
}

// Singleton instance
export const realTimeFeatureEngineeringService = new RealTimeFeatureEngineeringService();