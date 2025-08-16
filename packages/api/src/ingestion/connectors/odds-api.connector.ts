import { APIConnector } from '../base/api-connector.js';
import { 
  ValidationError, 
  DataIngestionResult,
  OddsSnapshot,
  MovementAlert,
  ArbitrageOpportunity
} from '@ufc-platform/shared';
import { sourceConfigManager } from '../config/source-configs.js';
import { OddsRepository } from '../../repositories/odds.repository.js';
import { MovementType } from '@ufc-platform/shared/types/core.js';

export interface TheOddsAPIEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: TheOddsAPIBookmaker[];
}

export interface TheOddsAPIBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: TheOddsAPIMarket[];
}

export interface TheOddsAPIMarket {
  key: string; // 'h2h', 'spreads', 'totals', etc.
  last_update: string;
  outcomes: TheOddsAPIOutcome[];
}

export interface TheOddsAPIOutcome {
  name: string;
  price: number;
  point?: number;
}

export interface TheOddsAPIUsage {
  requests_remaining: number;
  requests_used: number;
}

export interface OddsMovementDetectionOptions {
  minPercentageChange: number;
  timeWindowMinutes: number;
  enableArbitrageDetection: boolean;
  minArbitrageProfit: number;
}

export class OddsAPIConnector extends APIConnector {
  private oddsRepository: OddsRepository;
  private previousOdds: Map<string, OddsSnapshot> = new Map();
  private movementOptions: OddsMovementDetectionOptions;

  constructor(
    oddsRepository?: OddsRepository,
    movementOptions?: Partial<OddsMovementDetectionOptions>
  ) {
    const config = sourceConfigManager.getConfig('THE_ODDS_API');
    if (!config) {
      throw new Error('The Odds API configuration not found');
    }
    
    super('THE_ODDS_API', config);
    
    this.oddsRepository = oddsRepository || new OddsRepository();
    this.movementOptions = {
      minPercentageChange: 5,
      timeWindowMinutes: 15,
      enableArbitrageDetection: true,
      minArbitrageProfit: 2,
      ...movementOptions
    };
  }

  public async syncData(): Promise<DataIngestionResult> {
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalSkipped = 0;
    const allErrors: ValidationError[] = [];

    try {
      // Sync current MMA events and their odds
      const oddsResult = await this.syncMMAOdds();
      totalProcessed += oddsResult.recordsProcessed;
      totalSkipped += oddsResult.recordsSkipped;
      allErrors.push(...oddsResult.errors);

      const result = this.createIngestionResult(totalProcessed, totalSkipped, allErrors);
      result.processingTimeMs = Date.now() - startTime;
      
      this.emit('syncComplete', result);
      return result;

    } catch (error: any) {
      this.emit('syncError', { error: error.message, sourceId: this.sourceId });
      throw error;
    }
  }

  public async syncMMAOdds(): Promise<DataIngestionResult> {
    try {
      const url = sourceConfigManager.getEndpointUrl('THE_ODDS_API', 'odds');
      const response = await this.makeRequest<TheOddsAPIEvent[]>({
        method: 'GET',
        url,
        params: {
          regions: 'us,us2,uk,au,eu',
          markets: 'h2h,fight_result_method,fight_result_round',
          oddsFormat: 'american',
          dateFormat: 'iso'
        }
      });

      const events = response.data;
      let processed = 0;
      let skipped = 0;
      const errors: ValidationError[] = [];

      for (const eventData of events) {
        const validationErrors = this.validateEventData(eventData);
        if (validationErrors.length > 0) {
          errors.push(...validationErrors);
          if (validationErrors.some(e => e.severity === 'error')) {
            skipped++;
            continue;
          }
        }

        try {
          // Process odds for each bookmaker
          const oddsSnapshots = this.transformEventOdds(eventData);
          
          for (const snapshot of oddsSnapshots) {
            // Store odds snapshot
            await this.oddsRepository.writeOddsSnapshot(snapshot);
            
            // Check for significant movements
            await this.detectOddsMovement(snapshot);
            
            processed++;
          }

          // Check for arbitrage opportunities across bookmakers
          if (this.movementOptions.enableArbitrageDetection && oddsSnapshots.length > 1) {
            const arbitrageOpps = this.detectArbitrageOpportunities(oddsSnapshots);
            for (const opp of arbitrageOpps) {
              await this.oddsRepository.writeArbitrageOpportunity(opp);
            }
          }

          this.emit('eventProcessed', { 
            eventId: eventData.id, 
            bookmakers: eventData.bookmakers?.length || 0,
            oddsSnapshots: oddsSnapshots.length 
          });

        } catch (error: any) {
          errors.push(this.createValidationError(
            'odds_processing',
            `Failed to process odds for event ${eventData.id}: ${error.message}`,
            eventData,
            'error'
          ));
          skipped++;
        }
      }

      return this.createIngestionResult(processed, skipped, errors);

    } catch (error: any) {
      throw new Error(`Failed to sync MMA odds from The Odds API: ${error.message}`);
    }
  }

  public async getUsageStats(): Promise<TheOddsAPIUsage> {
    try {
      const url = sourceConfigManager.getEndpointUrl('THE_ODDS_API', 'usage');
      const response = await this.makeRequest<TheOddsAPIUsage>({
        method: 'GET',
        url
      });

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get usage stats: ${error.message}`);
    }
  }

  public validateData(data: any): ValidationError[] {
    if (Array.isArray(data)) {
      const errors: ValidationError[] = [];
      data.forEach((item, index) => {
        errors.push(...this.validateEventData(item).map(e => ({
          ...e,
          field: `[${index}].${e.field}`
        })));
      });
      return errors;
    }

    return this.validateEventData(data);
  }

  public validateEventData(event: TheOddsAPIEvent): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!event.id) {
      errors.push(this.createValidationError('id', 'Event ID is required', event.id, 'error'));
    }

    if (!event.sport_key || event.sport_key !== 'mma_mixed_martial_arts') {
      errors.push(this.createValidationError('sport_key', 'Invalid sport key, expected mma_mixed_martial_arts', event.sport_key, 'warning'));
    }

    if (!event.commence_time) {
      errors.push(this.createValidationError('commence_time', 'Event commence time is required', event.commence_time, 'error'));
    } else {
      const commenceDate = new Date(event.commence_time);
      if (isNaN(commenceDate.getTime())) {
        errors.push(this.createValidationError('commence_time', 'Invalid commence time format', event.commence_time, 'error'));
      }
    }

    if (!event.home_team || !event.away_team) {
      errors.push(this.createValidationError('teams', 'Both home and away teams are required', { home: event.home_team, away: event.away_team }, 'error'));
    }

    // Validate bookmakers if present
    if (event.bookmakers) {
      if (Array.isArray(event.bookmakers)) {
        event.bookmakers.forEach((bookmaker, index) => {
          if (!bookmaker.key || !bookmaker.title) {
            errors.push(this.createValidationError(`bookmakers[${index}]`, 'Bookmaker key and title are required', bookmaker, 'error'));
          }

          if (!bookmaker.markets || bookmaker.markets.length === 0) {
            errors.push(this.createValidationError(`bookmakers[${index}].markets`, 'Bookmaker must have at least one market', bookmaker.markets, 'warning'));
          }
        });
      } else {
        errors.push(this.createValidationError('bookmakers', 'Bookmakers must be an array', event.bookmakers, 'error'));
      }
    }

    return errors;
  }

  public transformData(data: any): any {
    if (Array.isArray(data)) {
      return data.map(event => this.transformEventOdds(event)).flat();
    }

    return this.transformEventOdds(data);
  }

  public transformEventOdds(event: TheOddsAPIEvent): OddsSnapshot[] {
    const snapshots: OddsSnapshot[] = [];
    const now = new Date();

    if (!event.bookmakers) {
      return snapshots;
    }

    for (const bookmaker of event.bookmakers) {
      try {
        const snapshot = this.createOddsSnapshot(event, bookmaker, now);
        if (snapshot) {
          snapshots.push(snapshot);
        }
      } catch (error: any) {
        this.emit('transformError', { 
          eventId: event.id, 
          bookmaker: bookmaker.key, 
          error: error.message 
        });
      }
    }

    return snapshots;
  }

  private createOddsSnapshot(event: TheOddsAPIEvent, bookmaker: TheOddsAPIBookmaker, timestamp: Date): OddsSnapshot | null {
    // Find head-to-head market for moneyline odds
    const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
    if (!h2hMarket || h2hMarket.outcomes.length !== 2) {
      return null;
    }

    // Find method and round markets
    const methodMarket = bookmaker.markets.find(m => m.key === 'fight_result_method');
    const roundMarket = bookmaker.markets.find(m => m.key === 'fight_result_round');

    // Extract moneyline odds
    const fighter1Odds = h2hMarket.outcomes.find(o => o.name === event.home_team)?.price || 0;
    const fighter2Odds = h2hMarket.outcomes.find(o => o.name === event.away_team)?.price || 0;

    // Extract method odds (with defaults)
    const methodOdds = {
      ko: methodMarket?.outcomes.find(o => o.name.toLowerCase().includes('ko') || o.name.toLowerCase().includes('knockout'))?.price || 0,
      submission: methodMarket?.outcomes.find(o => o.name.toLowerCase().includes('submission'))?.price || 0,
      decision: methodMarket?.outcomes.find(o => o.name.toLowerCase().includes('decision'))?.price || 0
    };

    // Extract round odds (with defaults)
    const roundOdds = {
      round1: roundMarket?.outcomes.find(o => o.name.includes('Round 1') || o.name.includes('1st'))?.price || 0,
      round2: roundMarket?.outcomes.find(o => o.name.includes('Round 2') || o.name.includes('2nd'))?.price || 0,
      round3: roundMarket?.outcomes.find(o => o.name.includes('Round 3') || o.name.includes('3rd'))?.price || 0,
      round4: roundMarket?.outcomes.find(o => o.name.includes('Round 4') || o.name.includes('4th'))?.price,
      round5: roundMarket?.outcomes.find(o => o.name.includes('Round 5') || o.name.includes('5th'))?.price
    };

    return {
      fightId: this.generateFightId(event),
      sportsbook: this.normalizeSportsbookName(bookmaker.key),
      timestamp,
      moneyline: {
        fighter1: fighter1Odds,
        fighter2: fighter2Odds
      },
      method: methodOdds,
      rounds: roundOdds
    };
  }

  private async detectOddsMovement(currentSnapshot: OddsSnapshot): Promise<void> {
    const key = `${currentSnapshot.fightId}_${currentSnapshot.sportsbook}`;
    const previousSnapshot = this.previousOdds.get(key);

    if (!previousSnapshot) {
      // Store as baseline for future comparisons
      this.previousOdds.set(key, currentSnapshot);
      return;
    }

    // Calculate percentage changes
    const fighter1Change = this.calculatePercentageChange(
      previousSnapshot.moneyline.fighter1,
      currentSnapshot.moneyline.fighter1
    );

    const fighter2Change = this.calculatePercentageChange(
      previousSnapshot.moneyline.fighter2,
      currentSnapshot.moneyline.fighter2
    );

    const maxChange = Math.max(Math.abs(fighter1Change), Math.abs(fighter2Change));

    // Check if movement is significant
    if (maxChange >= this.movementOptions.minPercentageChange) {
      const movementType = this.determineMovementType(fighter1Change, fighter2Change, maxChange);
      
      const alert: MovementAlert = {
        fightId: currentSnapshot.fightId,
        movementType,
        oldOdds: previousSnapshot,
        newOdds: currentSnapshot,
        percentageChange: maxChange,
        timestamp: currentSnapshot.timestamp
      };

      await this.oddsRepository.writeMovementAlert(alert);
      
      this.emit('oddsMovement', {
        fightId: currentSnapshot.fightId,
        sportsbook: currentSnapshot.sportsbook,
        movementType,
        percentageChange: maxChange
      });
    }

    // Update stored odds
    this.previousOdds.set(key, currentSnapshot);
  }

  private detectArbitrageOpportunities(snapshots: OddsSnapshot[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    if (snapshots.length < 2) {
      return opportunities;
    }

    const fightId = snapshots[0].fightId;

    // Find best odds for each fighter across all sportsbooks
    let bestFighter1Odds = -Infinity;
    let bestFighter1Book = '';
    let bestFighter2Odds = -Infinity;
    let bestFighter2Book = '';

    for (const snapshot of snapshots) {
      if (snapshot.moneyline.fighter1 > bestFighter1Odds) {
        bestFighter1Odds = snapshot.moneyline.fighter1;
        bestFighter1Book = snapshot.sportsbook;
      }
      if (snapshot.moneyline.fighter2 > bestFighter2Odds) {
        bestFighter2Odds = snapshot.moneyline.fighter2;
        bestFighter2Book = snapshot.sportsbook;
      }
    }

    // Calculate arbitrage profit
    const impliedProb1 = this.oddsToImpliedProbability(bestFighter1Odds);
    const impliedProb2 = this.oddsToImpliedProbability(bestFighter2Odds);
    const totalImpliedProb = impliedProb1 + impliedProb2;

    if (totalImpliedProb < 1) {
      const profit = ((1 / totalImpliedProb) - 1) * 100;
      
      if (profit >= this.movementOptions.minArbitrageProfit) {
        const totalStake = 1000; // Example stake
        const stake1 = totalStake * (impliedProb1 / totalImpliedProb);
        const stake2 = totalStake * (impliedProb2 / totalImpliedProb);

        opportunities.push({
          fightId,
          sportsbooks: [bestFighter1Book, bestFighter2Book],
          profit,
          stakes: {
            [bestFighter1Book]: stake1,
            [bestFighter2Book]: stake2
          },
          expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        });
      }
    }

    return opportunities;
  }

  private calculatePercentageChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return 0;
    return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
  }

  private determineMovementType(fighter1Change: number, fighter2Change: number, maxChange: number): MovementType {
    // Steam move: significant movement in same direction
    if (Math.sign(fighter1Change) === Math.sign(fighter2Change) && maxChange >= 10) {
      return 'steam';
    }
    
    // Reverse move: movement in opposite directions
    if (Math.sign(fighter1Change) !== Math.sign(fighter2Change)) {
      return 'reverse';
    }
    
    // Default to significant
    return 'significant';
  }

  private oddsToImpliedProbability(americanOdds: number): number {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  }

  private generateFightId(event: TheOddsAPIEvent): string {
    // Create a consistent fight ID from the event data
    const fighters = [event.home_team, event.away_team].sort();
    const dateStr = new Date(event.commence_time).toISOString().split('T')[0];
    return `odds_api_${fighters.join('_vs_')}_${dateStr}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private normalizeSportsbookName(bookmakerKey: string): string {
    const mapping: Record<string, string> = {
      'draftkings': 'DraftKings',
      'fanduel': 'FanDuel',
      'betmgm': 'BetMGM',
      'caesars': 'Caesars',
      'pointsbet': 'PointsBet',
      'betrivers': 'BetRivers',
      'unibet': 'Unibet',
      'williamhill_us': 'William Hill',
      'bovada': 'Bovada',
      'mybookie': 'MyBookie'
    };

    return mapping[bookmakerKey] || bookmakerKey;
  }
}