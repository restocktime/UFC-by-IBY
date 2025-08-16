import { MovementType } from './core.js';
import { OddsSnapshot, MethodOdds, RoundOdds } from './fight.js';

/**
 * Odds and betting-related interfaces
 */

export interface OddsTimeSeries {
  timestamp: Date;
  fightId: string;
  sportsbook: string;
  odds: {
    moneyline: [number, number];
    method: MethodOdds;
    rounds: RoundOdds;
  };
  volume?: number;
  impliedProbability: [number, number];
}

export interface MovementAlert {
  fightId: string;
  movementType: MovementType;
  oldOdds: OddsSnapshot;
  newOdds: OddsSnapshot;
  percentageChange: number;
  timestamp: Date;
}

export interface ArbitrageOpportunity {
  fightId: string;
  sportsbooks: string[];
  profit: number; // percentage
  stakes: { [sportsbook: string]: number };
  expiresAt: Date;
}