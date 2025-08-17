import { SportsDataIOConnector } from '../ingestion/connectors/sports-data-io.connector.js';
import { OddsRepository } from '../repositories/odds.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import { FightRepository } from '../repositories/fight.repository.js';
import { Odds, DataIngestionResult, ValidationError } from '@ufc-platform/shared';

export interface SportsDataIOOdds {
  EventId: number;
  FightId: number;
  Sportsbook: string;
  Created: string;
  Updated: string;
  HomeTeamMoneyLine?: number;
  AwayTeamMoneyLine?: number;
  DrawMoneyLine?: number;
  HomeTeamSpread?: number;
  AwayTeamSpread?: number;
  HomeTeamSpreadPayout?: number;
  AwayTeamSpreadPayout?: number;
  OverUnder?: number;
  OverPayout?: number;
  UnderPayout?: number;
}

export interface OddsChangeAlert {
  fightId: string;
  sportsbook: string;
  previousOdds: {
    fighter1: number;
    fighter2: number;
  };
  newOdds: {
    fighter1: number;
    fighter2: number;
  };
  changePercentage: number;
  timestamp: Date;
  significance: 'minor' | 'moderate' | 'major';
}

export interface HistoricalOddsData {
  fightId: string;
  sportsbook: string;
  oddsHistory: Array<{
    timestamp: Date;
    fighter1Odds: number;
    fighter2Odds: number;
    volume?: number;
  }>;
  trends: {
    fighter1Trend: 'improving' | 'declining' | 'stable';
    fighter2Trend: 'improving' | 'declining' | 'stable';
    volatility: 'low' | 'medium' | 'high';
  };
}

export class UFC319OddsService {
  private sportsDataConnector: SportsDataIOConnector;
  private oddsRepository: OddsRepository;
  private eventRepository: EventRepository;
  private fightRepository: FightRepository;
  private oddsChangeThresholds = {
    minor: 0.05,    // 5% change
    moderate: 0.15, // 15% change
    major: 0.25     // 25% change
  };

  constructor() {
    this.oddsRepository = new OddsRepository();
    this.eventRepository = new EventRepository();
    this.fightRepository = new FightRepository();
    
    this.sportsDataConnector = new SportsDataIOConnector(
      undefined, // FighterRepository not needed for odds
      this.fightRepository,
      this.eventRepository
    );
  }

  /**
   * Connect to SportsData.io odds endpoint for UFC 319 (Event ID: 864)
   */
  public async integrateUFC319Odds(): Promise<DataIngestionResult> {
    const UFC_319_EVENT_ID = 864;
    
    try {
      console.log('Starting UFC 319 odds integration...');
      
      // Fetch odds data from SportsData.io
      const oddsData = await this.fetchEventOdds(UFC_319_EVENT_ID);
      
      // Parse and normalize odds data
      const normalizedOdds = await this.parseAndNormalizeOdds(oddsData, UFC_319_EVENT_ID);
      
      // Store odds in database
      const ingestionResult = await this.storeOddsData(normalizedOdds);
      
      console.log(`UFC 319 odds integration completed. Processed: ${ingestionResult.recordsProcessed}, Skipped: ${ingestionResult.recordsSkipped}`);
      
      return ingestionResult;

    } catch (error: any) {
      throw new Error(`UFC 319 odds integration failed: ${error.message}`);
    }
  }

  /**
   * Fetch odds data from SportsData.io for specific event
   */
  private async fetchEventOdds(eventId: number): Promise<SportsDataIOOdds[]> {
    try {
      // Use the existing connector to make the API call
      const response = await this.sportsDataConnector['makeRequest']<{ BettingMarkets?: SportsDataIOOdds[] }>({
        method: 'GET',
        url: `https://api.sportsdata.io/v3/mma/odds/json/GameOddsByEvent/${eventId}`
      });

      return response.data.BettingMarkets || [];

    } catch (error: any) {
      throw new Error(`Failed to fetch odds for event ${eventId}: ${error.message}`);
    }
  }

  /**
   * Parse and normalize odds data from multiple sportsbooks
   */
  private async parseAndNormalizeOdds(oddsData: SportsDataIOOdds[], eventId: number): Promise<Omit<Odds, 'id'>[]> {
    const normalizedOdds: Omit<Odds, 'id'>[] = [];
    
    for (const oddsEntry of oddsData) {
      try {
        // Validate odds data
        const validationErrors = this.validateOddsData(oddsEntry);
        if (validationErrors.length > 0) {
          console.warn(`Skipping invalid odds data for fight ${oddsEntry.FightId}:`, validationErrors);
          continue;
        }

        // Find the corresponding fight
        const fights = await this.fightRepository.search({ limit: 100 });
        const fight = fights.find(f => 
          f.eventId.includes(eventId.toString()) || 
          f.eventId.includes(`sportsdata_${eventId}`)
        );

        if (!fight) {
          console.warn(`Fight not found for odds data: ${oddsEntry.FightId}`);
          continue;
        }

        // Create normalized odds object
        const normalizedOdd: Omit<Odds, 'id'> = {
          fightId: fight.id,
          sportsbook: this.normalizeSportsbookName(oddsEntry.Sportsbook),
          type: 'moneyline',
          fighter1Odds: oddsEntry.HomeTeamMoneyLine || 0,
          fighter2Odds: oddsEntry.AwayTeamMoneyLine || 0,
          timestamp: new Date(oddsEntry.Updated || oddsEntry.Created),
          isLive: true,
          metadata: {
            source: 'SportsDataIO',
            eventId: eventId,
            originalFightId: oddsEntry.FightId,
            spread: {
              fighter1: oddsEntry.HomeTeamSpread,
              fighter2: oddsEntry.AwayTeamSpread,
              fighter1Payout: oddsEntry.HomeTeamSpreadPayout,
              fighter2Payout: oddsEntry.AwayTeamSpreadPayout
            },
            overUnder: {
              line: oddsEntry.OverUnder,
              overPayout: oddsEntry.OverPayout,
              underPayout: oddsEntry.UnderPayout
            }
          }
        };

        normalizedOdds.push(normalizedOdd);

      } catch (error: any) {
        console.error(`Error processing odds for fight ${oddsEntry.FightId}:`, error.message);
      }
    }

    return normalizedOdds;
  }

  /**
   * Store odds data in database
   */
  private async storeOddsData(oddsData: Omit<Odds, 'id'>[]): Promise<DataIngestionResult> {
    let processed = 0;
    let skipped = 0;
    const errors: ValidationError[] = [];

    for (const odds of oddsData) {
      try {
        // Check if odds already exist for this fight/sportsbook/timestamp
        const existingOdds = await this.oddsRepository.search({
          fightId: odds.fightId,
          sportsbook: odds.sportsbook,
          limit: 10
        });

        const isDuplicate = existingOdds.some(existing => 
          Math.abs(existing.timestamp.getTime() - odds.timestamp.getTime()) < 60000 && // Within 1 minute
          existing.fighter1Odds === odds.fighter1Odds &&
          existing.fighter2Odds === odds.fighter2Odds
        );

        if (isDuplicate) {
          skipped++;
          continue;
        }

        // Store new odds
        await this.oddsRepository.create(odds);
        processed++;

        // Check for significant odds changes and create alerts
        await this.checkForOddsChanges(odds, existingOdds);

      } catch (error: any) {
        errors.push({
          field: 'odds_storage',
          message: `Failed to store odds: ${error.message}`,
          value: odds,
          severity: 'error'
        });
        skipped++;
      }
    }

    return {
      recordsProcessed: processed,
      recordsSkipped: skipped,
      errors,
      processingTimeMs: 0,
      sourceId: 'SPORTS_DATA_IO_ODDS',
      timestamp: new Date()
    };
  }

  /**
   * Implement odds change tracking and alerts
   */
  private async checkForOddsChanges(newOdds: Omit<Odds, 'id'>, existingOdds: Odds[]): Promise<void> {
    if (existingOdds.length === 0) return;

    // Get the most recent odds for comparison
    const latestOdds = existingOdds.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    // Calculate percentage changes
    const fighter1Change = Math.abs((newOdds.fighter1Odds - latestOdds.fighter1Odds) / latestOdds.fighter1Odds);
    const fighter2Change = Math.abs((newOdds.fighter2Odds - latestOdds.fighter2Odds) / latestOdds.fighter2Odds);
    const maxChange = Math.max(fighter1Change, fighter2Change);

    // Determine significance
    let significance: 'minor' | 'moderate' | 'major' = 'minor';
    if (maxChange >= this.oddsChangeThresholds.major) {
      significance = 'major';
    } else if (maxChange >= this.oddsChangeThresholds.moderate) {
      significance = 'moderate';
    }

    // Create alert if change is significant enough
    if (maxChange >= this.oddsChangeThresholds.minor) {
      const alert: OddsChangeAlert = {
        fightId: newOdds.fightId,
        sportsbook: newOdds.sportsbook,
        previousOdds: {
          fighter1: latestOdds.fighter1Odds,
          fighter2: latestOdds.fighter2Odds
        },
        newOdds: {
          fighter1: newOdds.fighter1Odds,
          fighter2: newOdds.fighter2Odds
        },
        changePercentage: maxChange,
        timestamp: newOdds.timestamp,
        significance
      };

      // Store alert (you could emit an event here for real-time notifications)
      console.log(`Odds change alert (${significance}):`, alert);
    }
  }

  /**
   * Store historical odds for trend analysis
   */
  public async getHistoricalOdds(fightId: string, sportsbook?: string): Promise<HistoricalOddsData[]> {
    try {
      const searchOptions: any = { fightId, limit: 1000 };
      if (sportsbook) {
        searchOptions.sportsbook = sportsbook;
      }

      const allOdds = await this.oddsRepository.search(searchOptions);
      
      // Group by sportsbook
      const oddsBySportsbook = allOdds.reduce((acc, odds) => {
        if (!acc[odds.sportsbook]) {
          acc[odds.sportsbook] = [];
        }
        acc[odds.sportsbook].push(odds);
        return acc;
      }, {} as Record<string, Odds[]>);

      // Create historical data for each sportsbook
      const historicalData: HistoricalOddsData[] = [];
      
      for (const [sportsbookName, odds] of Object.entries(oddsBySportsbook)) {
        const sortedOdds = odds.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        const oddsHistory = sortedOdds.map(odd => ({
          timestamp: odd.timestamp,
          fighter1Odds: odd.fighter1Odds,
          fighter2Odds: odd.fighter2Odds
        }));

        // Calculate trends
        const trends = this.calculateOddsTrends(sortedOdds);

        historicalData.push({
          fightId,
          sportsbook: sportsbookName,
          oddsHistory,
          trends
        });
      }

      return historicalData;

    } catch (error: any) {
      throw new Error(`Failed to get historical odds: ${error.message}`);
    }
  }

  /**
   * Calculate odds trends for analysis
   */
  private calculateOddsTrends(odds: Odds[]): HistoricalOddsData['trends'] {
    if (odds.length < 2) {
      return {
        fighter1Trend: 'stable',
        fighter2Trend: 'stable',
        volatility: 'low'
      };
    }

    const first = odds[0];
    const last = odds[odds.length - 1];

    // Calculate overall trend
    const fighter1Change = (last.fighter1Odds - first.fighter1Odds) / first.fighter1Odds;
    const fighter2Change = (last.fighter2Odds - first.fighter2Odds) / first.fighter2Odds;

    const fighter1Trend = Math.abs(fighter1Change) < 0.05 ? 'stable' : 
                         fighter1Change > 0 ? 'declining' : 'improving'; // Higher odds = less likely to win
    const fighter2Trend = Math.abs(fighter2Change) < 0.05 ? 'stable' : 
                         fighter2Change > 0 ? 'declining' : 'improving';

    // Calculate volatility based on variance
    const fighter1Variance = this.calculateVariance(odds.map(o => o.fighter1Odds));
    const fighter2Variance = this.calculateVariance(odds.map(o => o.fighter2Odds));
    const avgVariance = (fighter1Variance + fighter2Variance) / 2;

    const volatility = avgVariance < 100 ? 'low' : avgVariance < 500 ? 'medium' : 'high';

    return {
      fighter1Trend,
      fighter2Trend,
      volatility
    };
  }

  /**
   * Calculate variance for volatility analysis
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Validate odds data
   */
  private validateOddsData(odds: SportsDataIOOdds): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!odds.FightId) {
      errors.push({
        field: 'FightId',
        message: 'Fight ID is required',
        value: odds.FightId,
        severity: 'error'
      });
    }

    if (!odds.Sportsbook) {
      errors.push({
        field: 'Sportsbook',
        message: 'Sportsbook is required',
        value: odds.Sportsbook,
        severity: 'error'
      });
    }

    if (!odds.HomeTeamMoneyLine && !odds.AwayTeamMoneyLine) {
      errors.push({
        field: 'moneyline',
        message: 'At least one moneyline odds value is required',
        value: { home: odds.HomeTeamMoneyLine, away: odds.AwayTeamMoneyLine },
        severity: 'error'
      });
    }

    return errors;
  }

  /**
   * Normalize sportsbook names for consistency
   */
  private normalizeSportsbookName(sportsbook: string): string {
    const mapping: Record<string, string> = {
      'DraftKings': 'DraftKings',
      'FanDuel': 'FanDuel',
      'BetMGM': 'BetMGM',
      'Caesars': 'Caesars',
      'PointsBet': 'PointsBet',
      'BetRivers': 'BetRivers',
      'WynnBET': 'WynnBET',
      'Barstool': 'Barstool',
      'Hard Rock': 'Hard Rock Bet'
    };

    return mapping[sportsbook] || sportsbook;
  }

  /**
   * Get live odds for all UFC 319 fights
   */
  public async getLiveUFC319Odds(): Promise<{
    eventId: string;
    fights: Array<{
      fightId: string;
      fighter1Name: string;
      fighter2Name: string;
      odds: Odds[];
      bestOdds: {
        fighter1: { sportsbook: string; odds: number };
        fighter2: { sportsbook: string; odds: number };
      };
      lastUpdated: Date;
    }>;
  }> {
    try {
      // Get UFC 319 event
      const events = await this.eventRepository.search({ limit: 100 });
      const ufc319Event = events.find(e => e.name.includes('UFC 319') || e.name.includes('319'));
      
      if (!ufc319Event) {
        throw new Error('UFC 319 event not found');
      }

      // Get all fights for the event
      const fights = await this.fightRepository.search({ 
        eventId: ufc319Event.id,
        limit: 50 
      });

      const fightOddsData = [];

      for (const fight of fights) {
        // Get latest odds for this fight
        const odds = await this.oddsRepository.search({
          fightId: fight.id,
          limit: 100
        });

        // Find best odds for each fighter
        const fighter1BestOdds = odds.reduce((best, current) => 
          current.fighter1Odds > best.odds ? { sportsbook: current.sportsbook, odds: current.fighter1Odds } : best,
          { sportsbook: '', odds: 0 }
        );

        const fighter2BestOdds = odds.reduce((best, current) => 
          current.fighter2Odds > best.odds ? { sportsbook: current.sportsbook, odds: current.fighter2Odds } : best,
          { sportsbook: '', odds: 0 }
        );

        const lastUpdated = odds.length > 0 ? 
          new Date(Math.max(...odds.map(o => o.timestamp.getTime()))) : 
          new Date();

        fightOddsData.push({
          fightId: fight.id,
          fighter1Name: `Fighter ${fight.fighter1Id}`, // Would need to fetch actual names
          fighter2Name: `Fighter ${fight.fighter2Id}`,
          odds,
          bestOdds: {
            fighter1: fighter1BestOdds,
            fighter2: fighter2BestOdds
          },
          lastUpdated
        });
      }

      return {
        eventId: ufc319Event.id,
        fights: fightOddsData
      };

    } catch (error: any) {
      throw new Error(`Failed to get live UFC 319 odds: ${error.message}`);
    }
  }
}