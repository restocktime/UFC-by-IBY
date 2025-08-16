import { WeightClass, FightStatus, FightMethod } from './core.js';

/**
 * Fight-related interfaces and types
 */

export interface FightResult {
  winnerId: string;
  method: FightMethod;
  round: number;
  time: string; // MM:SS format
  details?: string;
}

export interface MethodOdds {
  ko: number;
  submission: number;
  decision: number;
}

export interface RoundOdds {
  round1: number;
  round2: number;
  round3: number;
  round4?: number;
  round5?: number;
}

export interface OddsSnapshot {
  fightId: string;
  sportsbook: string;
  timestamp: Date;
  moneyline: { fighter1: number; fighter2: number };
  method: MethodOdds;
  rounds: RoundOdds;
}

export interface OddsHistory {
  snapshots: OddsSnapshot[];
  openingOdds: OddsSnapshot;
  closingOdds?: OddsSnapshot;
}

export interface PredictionHistory {
  timestamp: Date;
  modelVersion: string;
  prediction: any; // Will be defined in prediction types
}

export interface Fight {
  id: string;
  eventId: string;
  fighter1Id: string;
  fighter2Id: string;
  weightClass: WeightClass;
  titleFight: boolean;
  mainEvent: boolean;
  scheduledRounds: number;
  status: FightStatus;
  result?: FightResult;
  odds: OddsHistory[];
  predictions: PredictionHistory[];
}