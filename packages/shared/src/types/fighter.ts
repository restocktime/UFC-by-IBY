import { WeightClass, FightStance } from './core.js';

/**
 * Fighter-related interfaces and types
 */

export interface PhysicalStats {
  height: number; // inches
  weight: number; // lbs
  reach: number; // inches
  legReach: number; // inches
  stance: FightStance;
}

export interface FightRecord {
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
}

export interface Rankings {
  weightClass: WeightClass;
  rank?: number;
  p4pRank?: number;
}

export interface Camp {
  name: string;
  location: string;
  headCoach: string;
}

export interface SocialMedia {
  instagram?: string;
  twitter?: string;
}

export interface RollingAverage {
  value: number;
  period: number; // number of fights
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface FormIndicator {
  fightId: string;
  date: Date;
  result: 'win' | 'loss' | 'draw' | 'nc';
  performance: number; // 0-100 performance score
}

export interface PerformanceMetrics {
  strikingAccuracy: RollingAverage;
  takedownDefense: RollingAverage;
  fightFrequency: number; // fights per year
  winStreak: number;
  recentForm: FormIndicator[];
}

export interface TrendAnalysis {
  performanceTrend: 'improving' | 'declining' | 'stable';
  activityLevel: 'active' | 'inactive' | 'semi_active';
  injuryHistory: string[];
  lastFightDate: Date;
}

export interface Fighter {
  id: string;
  name: string;
  nickname?: string;
  physicalStats: PhysicalStats;
  record: FightRecord;
  rankings: Rankings;
  camp: Camp;
  socialMedia: SocialMedia;
  calculatedMetrics: PerformanceMetrics;
  trends: TrendAnalysis;
  lastUpdated: Date;
}