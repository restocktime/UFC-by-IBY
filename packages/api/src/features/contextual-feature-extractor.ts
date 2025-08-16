import { WeightClass, FightStance } from '@ufc-platform/shared';

/**
 * Contextual information about a fighter's situation
 */
export interface ContextualData {
  fighterId: string;
  camp: CampInfo;
  injuryHistory: InjuryReport[];
  weightCutHistory: WeightCutInfo[];
  layoffInfo: LayoffInfo;
  venueExperience: VenueExperience;
  opponentHistory: OpponentHistory;
}

/**
 * Training camp information
 */
export interface CampInfo {
  name: string;
  location: string;
  headCoach: string;
  knownFor: string[]; // e.g., ['striking', 'wrestling', 'cardio']
  reputation: number; // 1-10 scale
  facilities: string[];
}

/**
 * Injury report information
 */
export interface InjuryReport {
  date: Date;
  type: 'acute' | 'chronic' | 'surgery';
  bodyPart: string;
  severity: 'minor' | 'moderate' | 'major';
  recoveryTime: number; // days
  impactOnPerformance: number; // 0-1 scale
}

/**
 * Weight cutting information
 */
export interface WeightCutInfo {
  fightDate: Date;
  targetWeight: number;
  actualWeight: number;
  cutAmount: number; // pounds cut
  difficulty: 'easy' | 'moderate' | 'difficult' | 'extreme';
  missedWeight: boolean;
  performanceImpact: number; // -1 to 1 scale
}

/**
 * Layoff information
 */
export interface LayoffInfo {
  daysSinceLastFight: number;
  reasonForLayoff: 'injury' | 'suspension' | 'personal' | 'lack_of_opponents' | 'other';
  activityLevel: 'inactive' | 'training' | 'sparring' | 'competing_other';
  rustFactor: number; // 0-1 scale, higher = more rust
}

/**
 * Venue experience
 */
export interface VenueExperience {
  country: string;
  altitude: number; // feet above sea level
  climate: 'temperate' | 'tropical' | 'arid' | 'cold';
  timeZoneChange: number; // hours difference from home
  previousFightsAtVenue: number;
  recordAtVenue: { wins: number; losses: number };
}

/**
 * Opponent history
 */
export interface OpponentHistory {
  commonOpponents: CommonOpponent[];
  styleMismatch: StyleMismatch;
  experienceGap: number; // years difference in pro experience
  sizeAdvantage: SizeAdvantage;
}

export interface CommonOpponent {
  opponentId: string;
  fighterResult: 'win' | 'loss' | 'draw';
  currentOpponentResult: 'win' | 'loss' | 'draw';
  fightDate: Date;
  method: string;
}

export interface StyleMismatch {
  strikingVsGrappling: number; // -1 to 1, negative favors grappler
  orthodoxVsSouthpaw: boolean;
  reachAdvantage: number; // inches
  paceMatch: number; // -1 to 1, how well paces match
}

export interface SizeAdvantage {
  heightDifference: number; // inches
  reachDifference: number; // inches
  weightDifference: number; // pounds (on fight night)
}

/**
 * Extracted contextual features ready for ML models
 */
export interface ContextualFeatures {
  // Camp features
  campReputation: number;
  campSpecialization: number[]; // one-hot encoded specializations
  
  // Injury features
  recentInjuryImpact: number;
  chronicInjuryBurden: number;
  injuryRecoveryStatus: number;
  
  // Weight cut features
  weightCutDifficulty: number;
  weightCutConsistency: number;
  missedWeightHistory: number;
  
  // Layoff features
  layoffDuration: number; // normalized
  rustFactor: number;
  activityDuringLayoff: number;
  
  // Venue features
  altitudeAdjustment: number;
  timeZoneImpact: number;
  venueExperience: number;
  
  // Opponent features
  commonOpponentAdvantage: number;
  styleMismatchScore: number;
  sizeAdvantageScore: number;
  experienceAdvantage: number;
}

/**
 * Configuration for feature extraction
 */
export interface FeatureExtractionConfig {
  injuryLookbackDays: number;
  weightCutLookbackFights: number;
  layoffThresholdDays: number;
  altitudeThresholdFeet: number;
  timeZoneThresholdHours: number;
}

/**
 * ContextualFeatureExtractor class for extracting ML-ready features from contextual data
 */
export class ContextualFeatureExtractor {
  private config: FeatureExtractionConfig;
  private campSpecializations: string[] = [
    'striking', 'wrestling', 'bjj', 'cardio', 'strength', 'mental'
  ];

  constructor(config: FeatureExtractionConfig = {
    injuryLookbackDays: 365,
    weightCutLookbackFights: 5,
    layoffThresholdDays: 180,
    altitudeThresholdFeet: 3000,
    timeZoneThresholdHours: 3
  }) {
    this.config = config;
  }

  /**
   * Extract all contextual features for a fighter
   */
  extractFeatures(contextualData: ContextualData): ContextualFeatures {
    return {
      // Camp features
      campReputation: this.extractCampReputation(contextualData.camp),
      campSpecialization: this.extractCampSpecialization(contextualData.camp),
      
      // Injury features
      recentInjuryImpact: this.extractRecentInjuryImpact(contextualData.injuryHistory),
      chronicInjuryBurden: this.extractChronicInjuryBurden(contextualData.injuryHistory),
      injuryRecoveryStatus: this.extractInjuryRecoveryStatus(contextualData.injuryHistory),
      
      // Weight cut features
      weightCutDifficulty: this.extractWeightCutDifficulty(contextualData.weightCutHistory),
      weightCutConsistency: this.extractWeightCutConsistency(contextualData.weightCutHistory),
      missedWeightHistory: this.extractMissedWeightHistory(contextualData.weightCutHistory),
      
      // Layoff features
      layoffDuration: this.extractLayoffDuration(contextualData.layoffInfo),
      rustFactor: contextualData.layoffInfo.rustFactor,
      activityDuringLayoff: this.extractActivityDuringLayoff(contextualData.layoffInfo),
      
      // Venue features
      altitudeAdjustment: this.extractAltitudeAdjustment(contextualData.venueExperience),
      timeZoneImpact: this.extractTimeZoneImpact(contextualData.venueExperience),
      venueExperience: this.extractVenueExperience(contextualData.venueExperience),
      
      // Opponent features
      commonOpponentAdvantage: this.extractCommonOpponentAdvantage(contextualData.opponentHistory),
      styleMismatchScore: this.extractStyleMismatchScore(contextualData.opponentHistory),
      sizeAdvantageScore: this.extractSizeAdvantageScore(contextualData.opponentHistory),
      experienceAdvantage: this.extractExperienceAdvantage(contextualData.opponentHistory)
    };
  }

  /**
   * Extract camp reputation feature (normalized 0-1)
   */
  private extractCampReputation(camp: CampInfo): number {
    return camp.reputation / 10;
  }

  /**
   * Extract camp specialization as one-hot encoded array
   */
  private extractCampSpecialization(camp: CampInfo): number[] {
    return this.campSpecializations.map(spec => 
      camp.knownFor.includes(spec) ? 1 : 0
    );
  }

  /**
   * Extract recent injury impact (0-1 scale)
   */
  private extractRecentInjuryImpact(injuries: InjuryReport[]): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.injuryLookbackDays);
    
    const recentInjuries = injuries.filter(injury => injury.date >= cutoffDate);
    
    if (recentInjuries.length === 0) return 0;
    
    // Weight by recency and severity
    const totalImpact = recentInjuries.reduce((sum, injury) => {
      const daysSince = (Date.now() - injury.date.getTime()) / (1000 * 60 * 60 * 24);
      const recencyWeight = Math.max(0, 1 - (daysSince / this.config.injuryLookbackDays));
      return sum + (injury.impactOnPerformance * recencyWeight);
    }, 0);
    
    return Math.min(1, totalImpact / recentInjuries.length);
  }

  /**
   * Extract chronic injury burden (0-1 scale)
   */
  private extractChronicInjuryBurden(injuries: InjuryReport[]): number {
    const chronicInjuries = injuries.filter(injury => injury.type === 'chronic');
    
    if (chronicInjuries.length === 0) return 0;
    
    const avgImpact = chronicInjuries.reduce((sum, injury) => 
      sum + injury.impactOnPerformance, 0) / chronicInjuries.length;
    
    // Scale by number of chronic injuries
    const scalingFactor = Math.min(1, chronicInjuries.length / 3);
    
    return avgImpact * scalingFactor;
  }

  /**
   * Extract injury recovery status (0-1 scale, 1 = fully recovered)
   */
  private extractInjuryRecoveryStatus(injuries: InjuryReport[]): number {
    const recentInjuries = injuries
      .filter(injury => injury.type !== 'chronic')
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 3); // Last 3 injuries
    
    if (recentInjuries.length === 0) return 1;
    
    const recoveryScores = recentInjuries.map(injury => {
      const daysSince = (Date.now() - injury.date.getTime()) / (1000 * 60 * 60 * 24);
      const expectedRecovery = injury.recoveryTime;
      
      if (daysSince >= expectedRecovery * 2) return 1; // Fully recovered
      if (daysSince >= expectedRecovery) return 0.8; // Mostly recovered
      if (daysSince >= expectedRecovery * 0.5) return 0.5; // Partially recovered
      return 0.2; // Still recovering
    });
    
    return recoveryScores.reduce((sum, score) => sum + score, 0) / recoveryScores.length;
  }

  /**
   * Extract weight cut difficulty (0-1 scale)
   */
  private extractWeightCutDifficulty(weightCuts: WeightCutInfo[]): number {
    const recentCuts = weightCuts
      .sort((a, b) => b.fightDate.getTime() - a.fightDate.getTime())
      .slice(0, this.config.weightCutLookbackFights);
    
    if (recentCuts.length === 0) return 0;
    
    const difficultyMap = { easy: 0.2, moderate: 0.5, difficult: 0.8, extreme: 1.0 };
    
    const avgDifficulty = recentCuts.reduce((sum, cut) => 
      sum + difficultyMap[cut.difficulty], 0) / recentCuts.length;
    
    return avgDifficulty;
  }

  /**
   * Extract weight cut consistency (0-1 scale, 1 = very consistent)
   */
  private extractWeightCutConsistency(weightCuts: WeightCutInfo[]): number {
    const recentCuts = weightCuts
      .sort((a, b) => b.fightDate.getTime() - a.fightDate.getTime())
      .slice(0, this.config.weightCutLookbackFights);
    
    if (recentCuts.length < 2) return 1;
    
    const cutAmounts = recentCuts.map(cut => cut.cutAmount);
    const mean = cutAmounts.reduce((sum, amount) => sum + amount, 0) / cutAmounts.length;
    const variance = cutAmounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / cutAmounts.length;
    const stdDev = Math.sqrt(variance);
    
    // Lower standard deviation = higher consistency
    const consistencyScore = Math.max(0, 1 - (stdDev / mean));
    
    return consistencyScore;
  }

  /**
   * Extract missed weight history (0-1 scale)
   */
  private extractMissedWeightHistory(weightCuts: WeightCutInfo[]): number {
    const recentCuts = weightCuts
      .sort((a, b) => b.fightDate.getTime() - a.fightDate.getTime())
      .slice(0, this.config.weightCutLookbackFights);
    
    if (recentCuts.length === 0) return 0;
    
    const missedCount = recentCuts.filter(cut => cut.missedWeight).length;
    
    return missedCount / recentCuts.length;
  }

  /**
   * Extract normalized layoff duration (0-1 scale)
   */
  private extractLayoffDuration(layoffInfo: LayoffInfo): number {
    const maxLayoff = 730; // 2 years in days
    return Math.min(1, layoffInfo.daysSinceLastFight / maxLayoff);
  }

  /**
   * Extract activity during layoff (0-1 scale)
   */
  private extractActivityDuringLayoff(layoffInfo: LayoffInfo): number {
    const activityMap = {
      inactive: 0,
      training: 0.3,
      sparring: 0.6,
      competing_other: 0.8
    };
    
    return activityMap[layoffInfo.activityLevel];
  }

  /**
   * Extract altitude adjustment factor (0-1 scale, 1 = no adjustment needed)
   */
  private extractAltitudeAdjustment(venue: VenueExperience): number {
    if (venue.altitude < this.config.altitudeThresholdFeet) return 1;
    
    // Higher altitude = more adjustment needed
    const adjustmentFactor = Math.min(1, venue.altitude / 8000); // 8000 ft = max impact
    
    // Experience at venue reduces impact
    const experienceBonus = Math.min(0.3, venue.previousFightsAtVenue * 0.1);
    
    return Math.max(0, 1 - adjustmentFactor + experienceBonus);
  }

  /**
   * Extract time zone impact (0-1 scale, 1 = no impact)
   */
  private extractTimeZoneImpact(venue: VenueExperience): number {
    const timeZoneChange = Math.abs(venue.timeZoneChange);
    
    if (timeZoneChange < this.config.timeZoneThresholdHours) return 1;
    
    // Jet lag impact increases with time zone difference
    const jetLagImpact = Math.min(1, timeZoneChange / 12); // 12 hours = max impact
    
    return 1 - jetLagImpact;
  }

  /**
   * Extract venue experience (0-1 scale)
   */
  private extractVenueExperience(venue: VenueExperience): number {
    if (venue.previousFightsAtVenue === 0) return 0;
    
    const winRate = venue.recordAtVenue.wins / 
      (venue.recordAtVenue.wins + venue.recordAtVenue.losses);
    
    // Combine experience count with success rate
    const experienceScore = Math.min(1, venue.previousFightsAtVenue / 5);
    
    return (experienceScore + winRate) / 2;
  }

  /**
   * Extract common opponent advantage (-1 to 1 scale)
   */
  private extractCommonOpponentAdvantage(opponentHistory: OpponentHistory): number {
    const { commonOpponents } = opponentHistory;
    
    if (commonOpponents.length === 0) return 0;
    
    let advantageSum = 0;
    
    commonOpponents.forEach(common => {
      if (common.fighterResult === 'win' && common.currentOpponentResult === 'loss') {
        advantageSum += 1; // Fighter beat someone opponent lost to
      } else if (common.fighterResult === 'loss' && common.currentOpponentResult === 'win') {
        advantageSum -= 1; // Fighter lost to someone opponent beat
      }
      // Draws and same results = neutral (0)
    });
    
    return Math.max(-1, Math.min(1, advantageSum / commonOpponents.length));
  }

  /**
   * Extract style mismatch score (-1 to 1 scale)
   */
  private extractStyleMismatchScore(opponentHistory: OpponentHistory): number {
    const { styleMismatch } = opponentHistory;
    
    let score = 0;
    
    // Striking vs grappling advantage
    score += styleMismatch.strikingVsGrappling * 0.4;
    
    // Orthodox vs southpaw (slight advantage to southpaw due to rarity)
    if (styleMismatch.orthodoxVsSouthpaw) {
      score += 0.1;
    }
    
    // Reach advantage
    const reachAdvantage = Math.max(-1, Math.min(1, styleMismatch.reachAdvantage / 6));
    score += reachAdvantage * 0.3;
    
    // Pace match (better match = slight advantage)
    score += styleMismatch.paceMatch * 0.2;
    
    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Extract size advantage score (-1 to 1 scale)
   */
  private extractSizeAdvantageScore(opponentHistory: OpponentHistory): number {
    const { sizeAdvantage } = opponentHistory;
    
    let score = 0;
    
    // Height advantage (normalized by 6 inches)
    score += Math.max(-1, Math.min(1, sizeAdvantage.heightDifference / 6)) * 0.3;
    
    // Reach advantage (normalized by 6 inches)
    score += Math.max(-1, Math.min(1, sizeAdvantage.reachDifference / 6)) * 0.4;
    
    // Weight advantage (normalized by 15 pounds)
    score += Math.max(-1, Math.min(1, sizeAdvantage.weightDifference / 15)) * 0.3;
    
    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Extract experience advantage (-1 to 1 scale)
   */
  private extractExperienceAdvantage(opponentHistory: OpponentHistory): number {
    const experienceGap = opponentHistory.experienceGap;
    
    // Normalize by 10 years (significant experience gap)
    return Math.max(-1, Math.min(1, experienceGap / 10));
  }

  /**
   * Encode categorical variables
   */
  encodeCategorical(value: string, categories: string[]): number[] {
    return categories.map(category => category === value ? 1 : 0);
  }

  /**
   * Encode weight class
   */
  encodeWeightClass(weightClass: WeightClass): number[] {
    const weightClasses: WeightClass[] = [
      'Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight',
      'Welterweight', 'Middleweight', 'Light Heavyweight', 'Heavyweight',
      'Women\'s Strawweight', 'Women\'s Flyweight', 'Women\'s Bantamweight', 'Women\'s Featherweight'
    ];
    
    return this.encodeCategorical(weightClass, weightClasses);
  }

  /**
   * Encode fight stance
   */
  encodeStance(stance: FightStance): number[] {
    const stances: FightStance[] = ['Orthodox', 'Southpaw', 'Switch'];
    return this.encodeCategorical(stance, stances);
  }

  /**
   * Calculate layoff impact based on reason and duration
   */
  calculateLayoffImpact(layoffInfo: LayoffInfo): number {
    const baseDuration = this.extractLayoffDuration(layoffInfo);
    
    // Adjust based on reason for layoff
    const reasonMultipliers = {
      injury: 1.2, // Injury layoffs have higher impact
      suspension: 1.1,
      personal: 0.9,
      lack_of_opponents: 0.8,
      other: 1.0
    };
    
    const reasonMultiplier = reasonMultipliers[layoffInfo.reasonForLayoff];
    
    return Math.min(1, baseDuration * reasonMultiplier);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<FeatureExtractionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): FeatureExtractionConfig {
    return { ...this.config };
  }
}