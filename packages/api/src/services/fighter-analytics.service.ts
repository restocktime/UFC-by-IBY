import { ESPNAPIConnector } from '../ingestion/connectors/espn-api.connector.js';
import { FighterRepository } from '../repositories/fighter.repository.js';
import { FightRepository } from '../repositories/fight.repository.js';
import { Fighter, PerformanceMetrics, TrendAnalysis, FormIndicator } from '@ufc-platform/shared';

export interface FighterPerformanceData {
  fighterId: string;
  fighterName: string;
  recentPerformance: RecentPerformanceMetrics;
  historicalTrends: HistoricalTrends;
  injuryReports: InjuryReport[];
  trainingCampInfo: TrainingCampInfo;
  predictionFactors: PredictionFactors;
  lastUpdated: Date;
}

export interface RecentPerformanceMetrics {
  last5Fights: FightPerformance[];
  winRate: number;
  finishRate: number;
  averageFightTime: number;
  strikingAccuracy: number;
  takedownAccuracy: number;
  takedownDefense: number;
  submissionRate: number;
  knockoutRate: number;
}

export interface FightPerformance {
  fightId: string;
  opponent: string;
  date: Date;
  result: 'win' | 'loss' | 'draw' | 'nc';
  method: string;
  round: number;
  time: string;
  performanceScore: number; // 0-100
  significantStrikes: { landed: number; attempted: number };
  takedowns: { landed: number; attempted: number };
  controlTime: number; // seconds
}

export interface HistoricalTrends {
  careerProgression: CareerPhase[];
  peakPerformancePeriod: DateRange;
  declineIndicators: string[];
  consistencyScore: number; // 0-100
  adaptabilityScore: number; // 0-100
  experienceLevel: 'novice' | 'developing' | 'veteran' | 'elite';
}

export interface CareerPhase {
  period: DateRange;
  phase: 'rising' | 'peak' | 'stable' | 'declining';
  keyMetrics: {
    winRate: number;
    finishRate: number;
    opponentQuality: number;
  };
  significantEvents: string[];
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface InjuryReport {
  type: string;
  severity: 'minor' | 'moderate' | 'major';
  reportedDate: Date;
  expectedRecovery?: Date;
  impactOnPerformance: number; // 0-100
  source: string;
}

export interface TrainingCampInfo {
  currentCamp: {
    name: string;
    location: string;
    headCoach: string;
    specialties: string[];
    reputation: number; // 0-100
  };
  campHistory: CampChange[];
  trainingPartners: TrainingPartner[];
  preparationQuality: number; // 0-100
}

export interface CampChange {
  date: Date;
  fromCamp: string;
  toCamp: string;
  reason?: string;
  performanceImpact: number; // -100 to 100
}

export interface TrainingPartner {
  name: string;
  skill: number; // 0-100
  style: string;
  relationship: 'sparring' | 'grappling' | 'coach' | 'mentor';
}

export interface PredictionFactors {
  formTrend: 'improving' | 'declining' | 'stable';
  motivationLevel: number; // 0-100
  styleMismatchVulnerabilities: string[];
  strengthsAgainstOpponentType: string[];
  mentalToughness: number; // 0-100
  cardiacCapacity: number; // 0-100
  injuryRisk: number; // 0-100
  ageFactorImpact: number; // -100 to 100
}

export class FighterAnalyticsService {
  private espnConnector: ESPNAPIConnector;
  private fighterRepository: FighterRepository;
  private fightRepository: FightRepository;

  constructor(
    espnConnector?: ESPNAPIConnector,
    fighterRepository?: FighterRepository,
    fightRepository?: FightRepository
  ) {
    this.espnConnector = espnConnector || new ESPNAPIConnector();
    this.fighterRepository = fighterRepository || new FighterRepository();
    this.fightRepository = fightRepository || new FightRepository();
  }

  /**
   * Get comprehensive fighter analytics
   */
  public async getFighterAnalytics(fighterId: string): Promise<FighterPerformanceData> {
    try {
      // Get fighter data
      const fighter = await this.fighterRepository.findById(fighterId);
      if (!fighter) {
        throw new Error(`Fighter not found: ${fighterId}`);
      }

      // Get fight history
      const fights = await this.fightRepository.search({
        fighterIds: [fighterId],
        limit: 50,
        sortBy: 'date',
        sortOrder: 'desc'
      });

      // Analyze recent performance
      const recentPerformance = this.analyzeRecentPerformance(fights.slice(0, 5));

      // Analyze historical trends
      const historicalTrends = this.analyzeHistoricalTrends(fights, fighter);

      // Get injury reports (mock data for now - would integrate with real sources)
      const injuryReports = await this.getInjuryReports(fighterId);

      // Get training camp info
      const trainingCampInfo = await this.getTrainingCampInfo(fighter);

      // Calculate prediction factors
      const predictionFactors = this.calculatePredictionFactors(
        fighter,
        recentPerformance,
        historicalTrends,
        injuryReports
      );

      return {
        fighterId,
        fighterName: fighter.name,
        recentPerformance,
        historicalTrends,
        injuryReports,
        trainingCampInfo,
        predictionFactors,
        lastUpdated: new Date()
      };

    } catch (error: any) {
      throw new Error(`Failed to get fighter analytics: ${error.message}`);
    }
  }

  /**
   * Analyze recent performance metrics
   */
  private analyzeRecentPerformance(recentFights: any[]): RecentPerformanceMetrics {
    if (recentFights.length === 0) {
      return this.getDefaultPerformanceMetrics();
    }

    const last5Fights = recentFights.map(fight => this.analyzeFightPerformance(fight));
    
    const wins = last5Fights.filter(f => f.result === 'win').length;
    const finishes = last5Fights.filter(f => 
      f.method.toLowerCase().includes('ko') || 
      f.method.toLowerCase().includes('submission')
    ).length;

    const totalFightTime = last5Fights.reduce((sum, fight) => {
      const timeInSeconds = this.convertFightTimeToSeconds(fight.time, fight.round);
      return sum + timeInSeconds;
    }, 0);

    const avgStrikingAccuracy = this.calculateAverageStrikingAccuracy(last5Fights);
    const avgTakedownStats = this.calculateAverageTakedownStats(last5Fights);

    return {
      last5Fights,
      winRate: (wins / last5Fights.length) * 100,
      finishRate: (finishes / last5Fights.length) * 100,
      averageFightTime: totalFightTime / last5Fights.length,
      strikingAccuracy: avgStrikingAccuracy,
      takedownAccuracy: avgTakedownStats.accuracy,
      takedownDefense: avgTakedownStats.defense,
      submissionRate: (last5Fights.filter(f => f.method.toLowerCase().includes('submission')).length / last5Fights.length) * 100,
      knockoutRate: (last5Fights.filter(f => f.method.toLowerCase().includes('ko')).length / last5Fights.length) * 100
    };
  }

  /**
   * Analyze historical trends
   */
  private analyzeHistoricalTrends(allFights: any[], fighter: Fighter): HistoricalTrends {
    const careerProgression = this.analyzeCareerProgression(allFights);
    const peakPeriod = this.identifyPeakPerformancePeriod(careerProgression);
    const declineIndicators = this.identifyDeclineIndicators(allFights, fighter);
    
    return {
      careerProgression,
      peakPerformancePeriod: peakPeriod,
      declineIndicators,
      consistencyScore: this.calculateConsistencyScore(allFights),
      adaptabilityScore: this.calculateAdaptabilityScore(allFights),
      experienceLevel: this.determineExperienceLevel(allFights.length, fighter.record)
    };
  }

  /**
   * Analyze career progression phases
   */
  private analyzeCareerProgression(fights: any[]): CareerPhase[] {
    if (fights.length < 3) {
      return [];
    }

    const phases: CareerPhase[] = [];
    const fightsByYear = this.groupFightsByYear(fights);
    
    Object.entries(fightsByYear).forEach(([year, yearFights]) => {
      const yearStart = new Date(parseInt(year), 0, 1);
      const yearEnd = new Date(parseInt(year), 11, 31);
      
      const wins = yearFights.filter(f => this.determineFightResult(f) === 'win').length;
      const finishes = yearFights.filter(f => this.isFightFinish(f)).length;
      
      const phase: CareerPhase = {
        period: { start: yearStart, end: yearEnd },
        phase: this.determineCareerPhase(wins, yearFights.length, finishes),
        keyMetrics: {
          winRate: (wins / yearFights.length) * 100,
          finishRate: (finishes / yearFights.length) * 100,
          opponentQuality: this.calculateOpponentQuality(yearFights)
        },
        significantEvents: this.identifySignificantEvents(yearFights)
      };
      
      phases.push(phase);
    });

    return phases;
  }

  /**
   * Get injury reports for a fighter
   */
  private async getInjuryReports(fighterId: string): Promise<InjuryReport[]> {
    // This would integrate with real injury report sources
    // For now, return mock data based on fight patterns
    
    const mockInjuries: InjuryReport[] = [
      {
        type: 'Knee injury',
        severity: 'moderate',
        reportedDate: new Date('2024-01-15'),
        expectedRecovery: new Date('2024-03-15'),
        impactOnPerformance: 25,
        source: 'ESPN MMA'
      }
    ];

    return mockInjuries;
  }

  /**
   * Get training camp information
   */
  private async getTrainingCampInfo(fighter: Fighter): Promise<TrainingCampInfo> {
    // This would integrate with real training camp data sources
    // For now, use the camp info from fighter data and enhance it
    
    return {
      currentCamp: {
        name: fighter.camp.name,
        location: fighter.camp.location,
        headCoach: fighter.camp.headCoach,
        specialties: ['Striking', 'Wrestling', 'BJJ'], // Would be determined from data
        reputation: 85 // Would be calculated from camp success rate
      },
      campHistory: [], // Would track camp changes over time
      trainingPartners: [], // Would list known training partners
      preparationQuality: 80 // Would be calculated from various factors
    };
  }

  /**
   * Calculate prediction factors
   */
  private calculatePredictionFactors(
    fighter: Fighter,
    recentPerformance: RecentPerformanceMetrics,
    historicalTrends: HistoricalTrends,
    injuryReports: InjuryReport[]
  ): PredictionFactors {
    const formTrend = this.determineFormTrend(recentPerformance);
    const motivationLevel = this.calculateMotivationLevel(fighter, recentPerformance);
    const injuryRisk = this.calculateInjuryRisk(injuryReports, fighter.trends.injuryHistory);
    const ageImpact = this.calculateAgeFactorImpact(fighter);

    return {
      formTrend,
      motivationLevel,
      styleMismatchVulnerabilities: this.identifyStyleVulnerabilities(recentPerformance),
      strengthsAgainstOpponentType: this.identifyStrengths(recentPerformance),
      mentalToughness: this.calculateMentalToughness(recentPerformance, historicalTrends),
      cardiacCapacity: this.calculateCardiacCapacity(recentPerformance),
      injuryRisk,
      ageFactorImpact: ageImpact
    };
  }

  /**
   * Analyze individual fight performance
   */
  private analyzeFightPerformance(fight: any): FightPerformance {
    return {
      fightId: fight.id,
      opponent: 'Opponent Name', // Would extract from fight data
      date: fight.date || new Date(),
      result: this.determineFightResult(fight),
      method: fight.result?.method || 'Decision',
      round: fight.result?.round || 3,
      time: fight.result?.time || '5:00',
      performanceScore: this.calculatePerformanceScore(fight),
      significantStrikes: { landed: 0, attempted: 0 }, // Would extract from fight stats
      takedowns: { landed: 0, attempted: 0 }, // Would extract from fight stats
      controlTime: 0 // Would extract from fight stats
    };
  }

  /**
   * Helper methods
   */
  private getDefaultPerformanceMetrics(): RecentPerformanceMetrics {
    return {
      last5Fights: [],
      winRate: 0,
      finishRate: 0,
      averageFightTime: 0,
      strikingAccuracy: 0,
      takedownAccuracy: 0,
      takedownDefense: 0,
      submissionRate: 0,
      knockoutRate: 0
    };
  }

  private convertFightTimeToSeconds(time: string, round: number): number {
    const [minutes, seconds] = time.split(':').map(Number);
    const roundTime = ((round - 1) * 300) + (minutes * 60) + seconds;
    return roundTime;
  }

  private calculateAverageStrikingAccuracy(fights: FightPerformance[]): number {
    if (fights.length === 0) return 0;
    
    const totalAccuracy = fights.reduce((sum, fight) => {
      const accuracy = fight.significantStrikes.attempted > 0 
        ? (fight.significantStrikes.landed / fight.significantStrikes.attempted) * 100
        : 0;
      return sum + accuracy;
    }, 0);
    
    return totalAccuracy / fights.length;
  }

  private calculateAverageTakedownStats(fights: FightPerformance[]): { accuracy: number; defense: number } {
    if (fights.length === 0) return { accuracy: 0, defense: 0 };
    
    // Mock calculation - would use real fight stats
    return {
      accuracy: 65,
      defense: 75
    };
  }

  private groupFightsByYear(fights: any[]): Record<string, any[]> {
    return fights.reduce((groups, fight) => {
      const year = new Date(fight.date).getFullYear().toString();
      if (!groups[year]) groups[year] = [];
      groups[year].push(fight);
      return groups;
    }, {} as Record<string, any[]>);
  }

  private determineCareerPhase(wins: number, totalFights: number, finishes: number): 'rising' | 'peak' | 'stable' | 'declining' {
    const winRate = (wins / totalFights) * 100;
    const finishRate = (finishes / totalFights) * 100;
    
    if (winRate >= 80 && finishRate >= 50) return 'peak';
    if (winRate >= 70 && finishRate >= 30) return 'rising';
    if (winRate >= 50) return 'stable';
    return 'declining';
  }

  private calculateOpponentQuality(fights: any[]): number {
    // Mock calculation - would analyze opponent rankings and records
    return 75;
  }

  private identifySignificantEvents(fights: any[]): string[] {
    const events: string[] = [];
    
    // Look for title fights, main events, etc.
    fights.forEach(fight => {
      if (fight.titleFight) events.push('Title Fight');
      if (fight.mainEvent) events.push('Main Event');
    });
    
    return events;
  }

  private identifyPeakPerformancePeriod(phases: CareerPhase[]): DateRange {
    const peakPhase = phases.find(p => p.phase === 'peak') || phases[0];
    return peakPhase?.period || { start: new Date(), end: new Date() };
  }

  private identifyDeclineIndicators(fights: any[], fighter: Fighter): string[] {
    const indicators: string[] = [];
    
    // Check for recent losses
    const recentFights = fights.slice(0, 3);
    const recentLosses = recentFights.filter(f => this.determineFightResult(f) === 'loss').length;
    
    if (recentLosses >= 2) indicators.push('Multiple recent losses');
    
    // Check age factor
    const age = this.calculateAge(fighter);
    if (age > 35) indicators.push('Advanced age');
    
    return indicators;
  }

  private calculateConsistencyScore(fights: any[]): number {
    // Mock calculation - would analyze performance variance
    return 75;
  }

  private calculateAdaptabilityScore(fights: any[]): number {
    // Mock calculation - would analyze performance against different styles
    return 80;
  }

  private determineExperienceLevel(fightCount: number, record: any): 'novice' | 'developing' | 'veteran' | 'elite' {
    if (fightCount < 5) return 'novice';
    if (fightCount < 15) return 'developing';
    if (fightCount < 25) return 'veteran';
    return 'elite';
  }

  private determineFightResult(fight: any): 'win' | 'loss' | 'draw' | 'nc' {
    // Mock implementation - would determine based on fight result and fighter ID
    return 'win';
  }

  private isFightFinish(fight: any): boolean {
    const method = fight.result?.method?.toLowerCase() || '';
    return method.includes('ko') || method.includes('submission');
  }

  private calculatePerformanceScore(fight: any): number {
    // Mock calculation - would analyze various performance metrics
    return 75;
  }

  private determineFormTrend(recentPerformance: RecentPerformanceMetrics): 'improving' | 'declining' | 'stable' {
    if (recentPerformance.winRate >= 80) return 'improving';
    if (recentPerformance.winRate <= 40) return 'declining';
    return 'stable';
  }

  private calculateMotivationLevel(fighter: Fighter, recentPerformance: RecentPerformanceMetrics): number {
    // Mock calculation based on recent performance and career stage
    return 85;
  }

  private calculateInjuryRisk(injuryReports: InjuryReport[], injuryHistory: string[]): number {
    const recentInjuries = injuryReports.filter(
      injury => new Date().getTime() - injury.reportedDate.getTime() < 365 * 24 * 60 * 60 * 1000
    );
    
    return Math.min(100, recentInjuries.length * 20 + injuryHistory.length * 10);
  }

  private calculateAgeFactorImpact(fighter: Fighter): number {
    const age = this.calculateAge(fighter);
    
    if (age < 25) return 10; // Young and improving
    if (age < 30) return 5;  // Prime years
    if (age < 35) return 0;  // Still competitive
    if (age < 40) return -15; // Decline starting
    return -30; // Significant decline
  }

  private identifyStyleVulnerabilities(recentPerformance: RecentPerformanceMetrics): string[] {
    const vulnerabilities: string[] = [];
    
    if (recentPerformance.takedownDefense < 70) {
      vulnerabilities.push('Takedown defense');
    }
    
    if (recentPerformance.strikingAccuracy < 40) {
      vulnerabilities.push('Striking accuracy');
    }
    
    return vulnerabilities;
  }

  private identifyStrengths(recentPerformance: RecentPerformanceMetrics): string[] {
    const strengths: string[] = [];
    
    if (recentPerformance.finishRate > 60) {
      strengths.push('Finishing ability');
    }
    
    if (recentPerformance.takedownAccuracy > 70) {
      strengths.push('Wrestling');
    }
    
    return strengths;
  }

  private calculateMentalToughness(recentPerformance: RecentPerformanceMetrics, historicalTrends: HistoricalTrends): number {
    // Mock calculation based on comeback victories, performance under pressure
    return 80;
  }

  private calculateCardiacCapacity(recentPerformance: RecentPerformanceMetrics): number {
    // Mock calculation based on late-round performance
    return 85;
  }

  private calculateAge(fighter: Fighter): number {
    // Mock calculation - would use actual birth date
    return 28;
  }

  /**
   * Compare two fighters for matchup analysis
   */
  public async compareFighters(fighter1Id: string, fighter2Id: string): Promise<{
    fighter1: FighterPerformanceData;
    fighter2: FighterPerformanceData;
    matchupAnalysis: MatchupAnalysis;
  }> {
    const [fighter1Analytics, fighter2Analytics] = await Promise.all([
      this.getFighterAnalytics(fighter1Id),
      this.getFighterAnalytics(fighter2Id)
    ]);

    const matchupAnalysis = this.analyzeMatchup(fighter1Analytics, fighter2Analytics);

    return {
      fighter1: fighter1Analytics,
      fighter2: fighter2Analytics,
      matchupAnalysis
    };
  }

  /**
   * Analyze matchup between two fighters
   */
  private analyzeMatchup(fighter1: FighterPerformanceData, fighter2: FighterPerformanceData): MatchupAnalysis {
    return {
      styleMismatch: this.analyzeStyleMismatch(fighter1, fighter2),
      advantageAreas: this.identifyAdvantageAreas(fighter1, fighter2),
      keyFactors: this.identifyKeyMatchupFactors(fighter1, fighter2),
      prediction: this.generateMatchupPrediction(fighter1, fighter2)
    };
  }

  private analyzeStyleMismatch(fighter1: FighterPerformanceData, fighter2: FighterPerformanceData): any {
    // Mock implementation
    return {
      striking: 'Even',
      grappling: 'Fighter 1 advantage',
      cardio: 'Fighter 2 advantage'
    };
  }

  private identifyAdvantageAreas(fighter1: FighterPerformanceData, fighter2: FighterPerformanceData): any {
    // Mock implementation
    return {
      fighter1Advantages: ['Wrestling', 'Experience'],
      fighter2Advantages: ['Striking', 'Youth']
    };
  }

  private identifyKeyMatchupFactors(fighter1: FighterPerformanceData, fighter2: FighterPerformanceData): string[] {
    return [
      'Striking vs Wrestling',
      'Experience vs Youth',
      'Cardio capacity'
    ];
  }

  private generateMatchupPrediction(fighter1: FighterPerformanceData, fighter2: FighterPerformanceData): any {
    return {
      favoredFighter: fighter1.fighterName,
      confidence: 65,
      method: 'Decision',
      reasoning: 'Superior wrestling and experience'
    };
  }
}

interface MatchupAnalysis {
  styleMismatch: any;
  advantageAreas: any;
  keyFactors: string[];
  prediction: any;
}