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

export interface SportsbookFilter {
  include?: string[];
  exclude?: string[];
  prioritySportsbooks?: string[];
}

export interface OddsAggregationOptions {
  sportsbooks?: SportsbookFilter;
  markets?: string[];
  regions?: string[];
  oddsFormat?: 'american' | 'decimal' | 'fractional';
  includeClosingOdds?: boolean;
}

export interface MarketCoverage {
  h2h: boolean;
  methodOfVictory: boolean;
  roundBetting: boolean;
  propBets: boolean;
  totalRounds: boolean;
  fightToGoDistance: boolean;
}

export interface PropBetMarket {
  key: string;
  name: string;
  outcomes: TheOddsAPIOutcome[];
}

export interface ExpandedMarketData {
  h2h?: TheOddsAPIMarket;
  methodOfVictory?: TheOddsAPIMarket;
  roundBetting?: TheOddsAPIMarket;
  totalRounds?: TheOddsAPIMarket;
  fightToGoDistance?: TheOddsAPIMarket;
  propBets?: PropBetMarket[];
}

export class OddsAPIConnector extends APIConnector {
  private oddsRepository: OddsRepository;
  private previousOdds: Map<string, OddsSnapshot> = new Map();
  private movementOptions: OddsMovementDetectionOptions;
  private aggregationOptions: OddsAggregationOptions;
  private supportedSportsbooks: Set<string> = new Set();

  constructor(
    oddsRepository?: OddsRepository,
    movementOptions?: Partial<OddsMovementDetectionOptions>,
    aggregationOptions?: Partial<OddsAggregationOptions>
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
    
    this.aggregationOptions = {
      markets: [
        'h2h',                    // Head-to-head moneyline
        'fight_result_method',    // Method of victory
        'fight_result_round',     // Round betting
        'fight_result_time',      // Fight duration/time
        'fight_to_go_distance',   // Will fight go the distance
        'total_rounds',           // Over/under total rounds
        'fighter_props'           // Fighter-specific props
      ],
      regions: ['us', 'us2', 'uk', 'au', 'eu'],
      oddsFormat: 'american',
      includeClosingOdds: true,
      ...aggregationOptions
    };

    // Initialize supported sportsbooks
    this.initializeSupportedSportsbooks();
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
      const params = this.buildRequestParams();
      
      const response = await this.makeRequest<TheOddsAPIEvent[]>({
        method: 'GET',
        url,
        params
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
          // Filter bookmakers based on configuration
          const filteredEvent = this.filterEventBookmakers(eventData);
          
          // Process odds for each bookmaker
          const oddsSnapshots = this.transformEventOdds(filteredEvent);
          
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
            bookmakers: filteredEvent.bookmakers?.length || 0,
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

  public async syncMultiSportsbookOdds(eventId?: string): Promise<DataIngestionResult> {
    try {
      let url = sourceConfigManager.getEndpointUrl('THE_ODDS_API', 'odds');
      const params = this.buildRequestParams();
      
      // If specific event ID is provided, use event-specific endpoint
      if (eventId) {
        url = sourceConfigManager.getEndpointUrl('THE_ODDS_API', 'eventOdds', { eventId });
      }

      const response = await this.makeRequest<TheOddsAPIEvent[]>({
        method: 'GET',
        url,
        params
      });

      const events = Array.isArray(response.data) ? response.data : [response.data];
      const aggregatedResults = await this.aggregateMultiSportsbookOdds(events);
      
      let processed = 0;
      let skipped = 0;
      const errors: ValidationError[] = [];

      for (const result of aggregatedResults) {
        try {
          // Store aggregated odds data
          await this.storeAggregatedOdds(result);
          
          // Detect cross-sportsbook arbitrage opportunities
          const arbitrageOpps = await this.detectCrossSportsbookArbitrage(result);
          for (const opp of arbitrageOpps) {
            await this.oddsRepository.writeArbitrageOpportunity(opp);
          }
          
          processed++;
        } catch (error: any) {
          errors.push(this.createValidationError(
            'aggregation_error',
            `Failed to process aggregated odds: ${error.message}`,
            result,
            'error'
          ));
          skipped++;
        }
      }

      return this.createIngestionResult(processed, skipped, errors);

    } catch (error: any) {
      throw new Error(`Failed to sync multi-sportsbook odds: ${error.message}`);
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

  private initializeSupportedSportsbooks(): void {
    // Major US sportsbooks with focus on Hard Rock Bets and others
    const sportsbooks = [
      'draftkings', 'fanduel', 'betmgm', 'caesars', 'pointsbet', 
      'betrivers', 'unibet', 'williamhill_us', 'bovada', 'mybookie',
      'hardrockbet', 'espnbet', 'betway', 'wynnbet', 'barstool',
      'superbook', 'twinspires', 'foxbet', 'tipico', 'betfred'
    ];
    
    sportsbooks.forEach(book => this.supportedSportsbooks.add(book));
  }

  private buildRequestParams(): Record<string, string> {
    const params: Record<string, string> = {
      regions: this.aggregationOptions.regions?.join(',') || 'us,us2,uk,au,eu',
      markets: this.aggregationOptions.markets?.join(',') || 'h2h,fight_result_method,fight_result_round',
      oddsFormat: this.aggregationOptions.oddsFormat || 'american',
      dateFormat: 'iso'
    };

    // Add sportsbook filters if specified
    if (this.aggregationOptions.sportsbooks?.include) {
      params.bookmakers = this.aggregationOptions.sportsbooks.include.join(',');
    }

    return params;
  }

  private filterEventBookmakers(event: TheOddsAPIEvent): TheOddsAPIEvent {
    if (!event.bookmakers || !this.aggregationOptions.sportsbooks) {
      return event;
    }

    let filteredBookmakers = event.bookmakers;

    // Apply include filter
    if (this.aggregationOptions.sportsbooks.include) {
      filteredBookmakers = filteredBookmakers.filter(bookmaker =>
        this.aggregationOptions.sportsbooks!.include!.includes(bookmaker.key)
      );
    }

    // Apply exclude filter
    if (this.aggregationOptions.sportsbooks.exclude) {
      filteredBookmakers = filteredBookmakers.filter(bookmaker =>
        !this.aggregationOptions.sportsbooks!.exclude!.includes(bookmaker.key)
      );
    }

    // Prioritize certain sportsbooks (move to front)
    if (this.aggregationOptions.sportsbooks.prioritySportsbooks) {
      const priorityBooks = filteredBookmakers.filter(bookmaker =>
        this.aggregationOptions.sportsbooks!.prioritySportsbooks!.includes(bookmaker.key)
      );
      const otherBooks = filteredBookmakers.filter(bookmaker =>
        !this.aggregationOptions.sportsbooks!.prioritySportsbooks!.includes(bookmaker.key)
      );
      filteredBookmakers = [...priorityBooks, ...otherBooks];
    }

    return {
      ...event,
      bookmakers: filteredBookmakers
    };
  }

  private async aggregateMultiSportsbookOdds(events: TheOddsAPIEvent[]): Promise<any[]> {
    const aggregatedResults = [];

    for (const event of events) {
      if (!event.bookmakers || event.bookmakers.length === 0) {
        continue;
      }

      const fightId = this.generateFightId(event);
      const aggregation = {
        fightId,
        eventId: event.id,
        fighters: [event.home_team, event.away_team],
        commenceTime: new Date(event.commence_time),
        sportsbooks: {},
        bestOdds: {
          fighter1: { odds: -Infinity, sportsbook: '' },
          fighter2: { odds: -Infinity, sportsbook: '' }
        },
        consensus: {
          fighter1Probability: 0,
          fighter2Probability: 0,
          confidence: 0
        },
        marketDepth: {
          totalSportsbooks: event.bookmakers.length,
          marketsAvailable: new Set<string>(),
          avgSpread: 0
        }
      };

      // Process each sportsbook
      for (const bookmaker of event.bookmakers) {
        const sportsbookData = this.processSportsbookData(bookmaker, event);
        if (sportsbookData) {
          aggregation.sportsbooks[bookmaker.key] = sportsbookData;
          
          // Track available markets
          bookmaker.markets.forEach(market => 
            aggregation.marketDepth.marketsAvailable.add(market.key)
          );

          // Update best odds
          if (sportsbookData.moneyline.fighter1 > aggregation.bestOdds.fighter1.odds) {
            aggregation.bestOdds.fighter1 = {
              odds: sportsbookData.moneyline.fighter1,
              sportsbook: bookmaker.key
            };
          }
          if (sportsbookData.moneyline.fighter2 > aggregation.bestOdds.fighter2.odds) {
            aggregation.bestOdds.fighter2 = {
              odds: sportsbookData.moneyline.fighter2,
              sportsbook: bookmaker.key
            };
          }
        }
      }

      // Calculate consensus probabilities
      this.calculateConsensusOdds(aggregation);
      
      // Calculate market efficiency metrics
      this.calculateMarketEfficiency(aggregation);

      aggregatedResults.push(aggregation);
    }

    return aggregatedResults;
  }

  private processSportsbookData(bookmaker: TheOddsAPIBookmaker, event: TheOddsAPIEvent): any | null {
    const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
    if (!h2hMarket || h2hMarket.outcomes.length !== 2) {
      return null;
    }

    const fighter1Odds = h2hMarket.outcomes.find(o => o.name === event.home_team)?.price || 0;
    const fighter2Odds = h2hMarket.outcomes.find(o => o.name === event.away_team)?.price || 0;

    // Get method and round markets
    const methodMarket = bookmaker.markets.find(m => m.key === 'fight_result_method');
    const roundMarket = bookmaker.markets.find(m => m.key === 'fight_result_round');

    return {
      name: this.normalizeSportsbookName(bookmaker.key),
      lastUpdate: new Date(bookmaker.last_update),
      moneyline: {
        fighter1: fighter1Odds,
        fighter2: fighter2Odds
      },
      impliedProbability: {
        fighter1: this.oddsToImpliedProbability(fighter1Odds),
        fighter2: this.oddsToImpliedProbability(fighter2Odds)
      },
      method: this.extractMethodOdds(methodMarket),
      rounds: this.extractRoundOdds(roundMarket),
      marketCount: bookmaker.markets.length
    };
  }

  private extractMethodOdds(methodMarket?: TheOddsAPIMarket): any {
    if (!methodMarket) {
      return { ko: 0, submission: 0, decision: 0 };
    }

    return {
      ko: methodMarket.outcomes.find(o => 
        o.name.toLowerCase().includes('ko') || 
        o.name.toLowerCase().includes('knockout') ||
        o.name.toLowerCase().includes('tko')
      )?.price || 0,
      submission: methodMarket.outcomes.find(o => 
        o.name.toLowerCase().includes('submission') ||
        o.name.toLowerCase().includes('sub')
      )?.price || 0,
      decision: methodMarket.outcomes.find(o => 
        o.name.toLowerCase().includes('decision') ||
        o.name.toLowerCase().includes('points')
      )?.price || 0
    };
  }

  private extractRoundOdds(roundMarket?: TheOddsAPIMarket): any {
    if (!roundMarket) {
      return { round1: 0, round2: 0, round3: 0 };
    }

    return {
      round1: roundMarket.outcomes.find(o => 
        o.name.includes('Round 1') || o.name.includes('1st')
      )?.price || 0,
      round2: roundMarket.outcomes.find(o => 
        o.name.includes('Round 2') || o.name.includes('2nd')
      )?.price || 0,
      round3: roundMarket.outcomes.find(o => 
        o.name.includes('Round 3') || o.name.includes('3rd')
      )?.price || 0,
      round4: roundMarket.outcomes.find(o => 
        o.name.includes('Round 4') || o.name.includes('4th')
      )?.price,
      round5: roundMarket.outcomes.find(o => 
        o.name.includes('Round 5') || o.name.includes('5th')
      )?.price
    };
  }

  private calculateConsensusOdds(aggregation: any): void {
    const sportsbooks = Object.values(aggregation.sportsbooks) as any[];
    if (sportsbooks.length === 0) return;

    // Calculate weighted average probabilities
    const totalWeight = sportsbooks.length;
    const fighter1ProbSum = sportsbooks.reduce((sum, book) => 
      sum + book.impliedProbability.fighter1, 0
    );
    const fighter2ProbSum = sportsbooks.reduce((sum, book) => 
      sum + book.impliedProbability.fighter2, 0
    );

    aggregation.consensus.fighter1Probability = fighter1ProbSum / totalWeight;
    aggregation.consensus.fighter2Probability = fighter2ProbSum / totalWeight;

    // Calculate confidence based on standard deviation
    const fighter1Probs = sportsbooks.map(book => book.impliedProbability.fighter1);
    const mean = aggregation.consensus.fighter1Probability;
    const variance = fighter1Probs.reduce((sum, prob) => 
      sum + Math.pow(prob - mean, 2), 0
    ) / fighter1Probs.length;
    const stdDev = Math.sqrt(variance);

    // Lower standard deviation = higher confidence
    aggregation.consensus.confidence = Math.max(0.1, Math.min(1.0, 1 - (stdDev * 4)));
  }

  private calculateMarketEfficiency(aggregation: any): void {
    const sportsbooks = Object.values(aggregation.sportsbooks) as any[];
    if (sportsbooks.length < 2) return;

    // Calculate spread between best and worst odds
    const fighter1Odds = sportsbooks.map(book => book.moneyline.fighter1);
    const fighter2Odds = sportsbooks.map(book => book.moneyline.fighter2);

    const fighter1Spread = Math.max(...fighter1Odds) - Math.min(...fighter1Odds);
    const fighter2Spread = Math.max(...fighter2Odds) - Math.min(...fighter2Odds);

    aggregation.marketDepth.avgSpread = (fighter1Spread + fighter2Spread) / 2;
    aggregation.marketDepth.marketsAvailable = Array.from(aggregation.marketDepth.marketsAvailable);
  }

  private async storeAggregatedOdds(aggregation: any): Promise<void> {
    // Store individual sportsbook snapshots
    for (const [sportsbookKey, sportsbookData] of Object.entries(aggregation.sportsbooks) as any[]) {
      const snapshot: OddsSnapshot = {
        fightId: aggregation.fightId,
        sportsbook: sportsbookData.name,
        timestamp: sportsbookData.lastUpdate,
        moneyline: sportsbookData.moneyline,
        method: sportsbookData.method,
        rounds: sportsbookData.rounds
      };

      await this.oddsRepository.writeOddsSnapshot(snapshot);
    }

    // Store aggregated market data (could be extended to store in a separate collection)
    this.emit('aggregatedOddsProcessed', {
      fightId: aggregation.fightId,
      sportsbooksCount: aggregation.marketDepth.totalSportsbooks,
      consensus: aggregation.consensus,
      bestOdds: aggregation.bestOdds
    });
  }

  private async detectCrossSportsbookArbitrage(aggregation: any): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    
    if (aggregation.marketDepth.totalSportsbooks < 2) {
      return opportunities;
    }

    // Use the best odds from the aggregation
    const bestFighter1Odds = aggregation.bestOdds.fighter1.odds;
    const bestFighter1Book = aggregation.bestOdds.fighter1.sportsbook;
    const bestFighter2Odds = aggregation.bestOdds.fighter2.odds;
    const bestFighter2Book = aggregation.bestOdds.fighter2.sportsbook;

    // Calculate arbitrage profit
    const impliedProb1 = this.oddsToImpliedProbability(bestFighter1Odds);
    const impliedProb2 = this.oddsToImpliedProbability(bestFighter2Odds);
    const totalImpliedProb = impliedProb1 + impliedProb2;

    if (totalImpliedProb < 1 && bestFighter1Book !== bestFighter2Book) {
      const profit = ((1 / totalImpliedProb) - 1) * 100;
      
      if (profit >= this.movementOptions.minArbitrageProfit) {
        const totalStake = 1000; // Example stake
        const stake1 = totalStake * (impliedProb1 / totalImpliedProb);
        const stake2 = totalStake * (impliedProb2 / totalImpliedProb);

        opportunities.push({
          fightId: aggregation.fightId,
          sportsbooks: [bestFighter1Book, bestFighter2Book],
          profit,
          stakes: {
            [bestFighter1Book]: stake1,
            [bestFighter2Book]: stake2
          },
          expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        });

        this.emit('arbitrageDetected', {
          fightId: aggregation.fightId,
          profit,
          sportsbooks: [bestFighter1Book, bestFighter2Book]
        });
      }
    }

    return opportunities;
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
      'mybookie': 'MyBookie',
      'hardrockbet': 'Hard Rock Bet',
      'espnbet': 'ESPN BET',
      'betway': 'Betway',
      'wynnbet': 'WynnBET',
      'barstool': 'Barstool Sportsbook',
      'superbook': 'SuperBook',
      'twinspires': 'TwinSpires',
      'foxbet': 'FOX Bet',
      'tipico': 'Tipico',
      'betfred': 'Betfred'
    };

    return mapping[bookmakerKey] || bookmakerKey;
  }

  // Public methods for configuration
  public setSportsbookFilter(filter: SportsbookFilter): void {
    this.aggregationOptions.sportsbooks = filter;
  }

  public setMarkets(markets: string[]): void {
    this.aggregationOptions.markets = markets;
  }

  public async getExpandedMarketCoverage(eventId?: string): Promise<any> {
    try {
      let url = sourceConfigManager.getEndpointUrl('THE_ODDS_API', 'odds');
      const params = {
        ...this.buildRequestParams(),
        markets: this.aggregationOptions.markets?.join(',') || 'h2h'
      };
      
      if (eventId) {
        url = sourceConfigManager.getEndpointUrl('THE_ODDS_API', 'eventOdds', { eventId });
      }

      const response = await this.makeRequest<TheOddsAPIEvent[]>({
        method: 'GET',
        url,
        params
      });

      const events = Array.isArray(response.data) ? response.data : [response.data];
      return this.analyzeMarketCoverage(events);

    } catch (error: any) {
      throw new Error(`Failed to get expanded market coverage: ${error.message}`);
    }
  }

  public analyzeMarketCoverage(events: TheOddsAPIEvent[]): any {
    const coverage = {
      totalEvents: events.length,
      marketAvailability: {
        h2h: 0,
        methodOfVictory: 0,
        roundBetting: 0,
        totalRounds: 0,
        fightToGoDistance: 0,
        propBets: 0
      },
      sportsbookCoverage: new Map<string, MarketCoverage>(),
      marketDepth: {
        avgMarketsPerEvent: 0,
        avgSportsbooksPerMarket: 0,
        mostCoveredMarkets: [],
        leastCoveredMarkets: []
      }
    };

    let totalMarkets = 0;

    for (const event of events) {
      if (!event.bookmakers) continue;

      const eventMarkets = new Set<string>();

      for (const bookmaker of event.bookmakers) {
        const bookmakerCoverage: MarketCoverage = {
          h2h: false,
          methodOfVictory: false,
          roundBetting: false,
          propBets: false,
          totalRounds: false,
          fightToGoDistance: false
        };

        for (const market of bookmaker.markets) {
          eventMarkets.add(market.key);
          totalMarkets++;

          // Categorize markets
          switch (market.key) {
            case 'h2h':
              bookmakerCoverage.h2h = true;
              coverage.marketAvailability.h2h++;
              break;
            case 'fight_result_method':
              bookmakerCoverage.methodOfVictory = true;
              coverage.marketAvailability.methodOfVictory++;
              break;
            case 'fight_result_round':
              bookmakerCoverage.roundBetting = true;
              coverage.marketAvailability.roundBetting++;
              break;
            case 'total_rounds':
              bookmakerCoverage.totalRounds = true;
              coverage.marketAvailability.totalRounds++;
              break;
            case 'fight_to_go_distance':
              bookmakerCoverage.fightToGoDistance = true;
              coverage.marketAvailability.fightToGoDistance++;
              break;
            default:
              if (market.key.includes('prop') || market.key.includes('fighter_')) {
                bookmakerCoverage.propBets = true;
                coverage.marketAvailability.propBets++;
              }
              break;
          }
        }

        coverage.sportsbookCoverage.set(bookmaker.key, bookmakerCoverage);
      }
    }

    // Calculate market depth metrics
    coverage.marketDepth.avgMarketsPerEvent = totalMarkets / events.length;
    
    // Convert market availability to percentages
    const totalPossibleMarkets = events.length * Array.from(coverage.sportsbookCoverage.keys()).length;
    
    Object.keys(coverage.marketAvailability).forEach(market => {
      coverage.marketAvailability[market] = 
        (coverage.marketAvailability[market] / totalPossibleMarkets) * 100;
    });

    return coverage;
  }

  public extractExpandedMarketData(bookmaker: TheOddsAPIBookmaker): ExpandedMarketData {
    const marketData: ExpandedMarketData = {};

    for (const market of bookmaker.markets) {
      switch (market.key) {
        case 'h2h':
          marketData.h2h = market;
          break;
        case 'fight_result_method':
          marketData.methodOfVictory = market;
          break;
        case 'fight_result_round':
          marketData.roundBetting = market;
          break;
        case 'total_rounds':
          marketData.totalRounds = market;
          break;
        case 'fight_to_go_distance':
          marketData.fightToGoDistance = market;
          break;
        default:
          // Handle prop bets and other markets
          if (market.key.includes('prop') || market.key.includes('fighter_') || 
              market.key.includes('performance') || market.key.includes('special')) {
            if (!marketData.propBets) {
              marketData.propBets = [];
            }
            marketData.propBets.push({
              key: market.key,
              name: this.formatMarketName(market.key),
              outcomes: market.outcomes
            });
          }
          break;
      }
    }

    return marketData;
  }

  public generateMarketSpecificAnalysis(events: TheOddsAPIEvent[]): any {
    const analysis = {
      h2hAnalysis: this.analyzeH2HMarket(events),
      methodAnalysis: this.analyzeMethodMarket(events),
      roundAnalysis: this.analyzeRoundMarket(events),
      propAnalysis: this.analyzePropMarkets(events),
      crossMarketArbitrage: this.findCrossMarketArbitrage(events)
    };

    return analysis;
  }

  private analyzeH2HMarket(events: TheOddsAPIEvent[]): any {
    const analysis = {
      totalFights: events.length,
      avgSpread: 0,
      favoriteDistribution: { heavy: 0, moderate: 0, slight: 0, pickEm: 0 },
      marketEfficiency: 0,
      bestValueOpportunities: []
    };

    let totalSpread = 0;
    let validFights = 0;

    for (const event of events) {
      if (!event.bookmakers) continue;

      const h2hOdds = [];
      
      for (const bookmaker of event.bookmakers) {
        const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
        if (h2hMarket && h2hMarket.outcomes.length === 2) {
          const fighter1Odds = h2hMarket.outcomes.find(o => o.name === event.home_team)?.price || 0;
          const fighter2Odds = h2hMarket.outcomes.find(o => o.name === event.away_team)?.price || 0;
          
          if (fighter1Odds !== 0 && fighter2Odds !== 0) {
            h2hOdds.push({ fighter1: fighter1Odds, fighter2: fighter2Odds, sportsbook: bookmaker.key });
          }
        }
      }

      if (h2hOdds.length > 0) {
        validFights++;
        
        // Calculate spread for this fight
        const fighter1Odds = h2hOdds.map(o => o.fighter1);
        const fighter2Odds = h2hOdds.map(o => o.fighter2);
        const spread1 = Math.max(...fighter1Odds) - Math.min(...fighter1Odds);
        const spread2 = Math.max(...fighter2Odds) - Math.min(...fighter2Odds);
        totalSpread += (spread1 + spread2) / 2;

        // Categorize favorite level (using average odds)
        const avgFighter1Odds = fighter1Odds.reduce((sum, o) => sum + o, 0) / fighter1Odds.length;
        const avgFighter2Odds = fighter2Odds.reduce((sum, o) => sum + o, 0) / fighter2Odds.length;
        
        const favoriteOdds = Math.min(Math.abs(avgFighter1Odds), Math.abs(avgFighter2Odds));
        
        if (favoriteOdds >= 300) analysis.favoriteDistribution.heavy++;
        else if (favoriteOdds >= 150) analysis.favoriteDistribution.moderate++;
        else if (favoriteOdds >= 110) analysis.favoriteDistribution.slight++;
        else analysis.favoriteDistribution.pickEm++;
      }
    }

    analysis.avgSpread = validFights > 0 ? totalSpread / validFights : 0;
    analysis.marketEfficiency = Math.max(0, 1 - (analysis.avgSpread / 100));

    return analysis;
  }

  private analyzeMethodMarket(events: TheOddsAPIEvent[]): any {
    const analysis = {
      availability: 0,
      avgKOOdds: 0,
      avgSubmissionOdds: 0,
      avgDecisionOdds: 0,
      methodDistribution: { ko: 0, submission: 0, decision: 0 },
      bestValueMethods: []
    };

    let methodMarkets = 0;
    let totalKO = 0, totalSub = 0, totalDec = 0;
    let koCount = 0, subCount = 0, decCount = 0;

    for (const event of events) {
      if (!event.bookmakers) continue;

      for (const bookmaker of event.bookmakers) {
        const methodMarket = bookmaker.markets.find(m => m.key === 'fight_result_method');
        if (methodMarket) {
          methodMarkets++;
          
          const koOdds = methodMarket.outcomes.find(o => 
            o.name.toLowerCase().includes('ko') || 
            o.name.toLowerCase().includes('knockout') ||
            o.name.toLowerCase().includes('tko')
          )?.price;
          
          const subOdds = methodMarket.outcomes.find(o => 
            o.name.toLowerCase().includes('submission')
          )?.price;
          
          const decOdds = methodMarket.outcomes.find(o => 
            o.name.toLowerCase().includes('decision')
          )?.price;

          if (koOdds) { totalKO += koOdds; koCount++; }
          if (subOdds) { totalSub += subOdds; subCount++; }
          if (decOdds) { totalDec += decOdds; decCount++; }
        }
      }
    }

    const totalBookmakers = events.reduce((sum, e) => sum + (e.bookmakers?.length || 0), 0);
    analysis.availability = totalBookmakers > 0 ? (methodMarkets / totalBookmakers) * 100 : 0;
    
    analysis.avgKOOdds = koCount > 0 ? totalKO / koCount : 0;
    analysis.avgSubmissionOdds = subCount > 0 ? totalSub / subCount : 0;
    analysis.avgDecisionOdds = decCount > 0 ? totalDec / decCount : 0;

    return analysis;
  }

  private analyzeRoundMarket(events: TheOddsAPIEvent[]): any {
    const analysis = {
      availability: 0,
      roundDistribution: { round1: 0, round2: 0, round3: 0, round4: 0, round5: 0 },
      avgRoundOdds: { round1: 0, round2: 0, round3: 0, round4: 0, round5: 0 },
      totalRoundsAnalysis: { under2_5: 0, over2_5: 0 }
    };

    let roundMarkets = 0;
    const roundTotals = { round1: 0, round2: 0, round3: 0, round4: 0, round5: 0 };
    const roundCounts = { round1: 0, round2: 0, round3: 0, round4: 0, round5: 0 };

    for (const event of events) {
      if (!event.bookmakers) continue;

      for (const bookmaker of event.bookmakers) {
        const roundMarket = bookmaker.markets.find(m => m.key === 'fight_result_round');
        if (roundMarket) {
          roundMarkets++;
          
          for (let i = 1; i <= 5; i++) {
            const roundOdds = roundMarket.outcomes.find(o => 
              o.name.includes(`Round ${i}`) || o.name.includes(`${i}st`) || 
              o.name.includes(`${i}nd`) || o.name.includes(`${i}rd`) || o.name.includes(`${i}th`)
            )?.price;
            
            if (roundOdds) {
              roundTotals[`round${i}`] += roundOdds;
              roundCounts[`round${i}`]++;
            }
          }
        }

        // Analyze total rounds market
        const totalRoundsMarket = bookmaker.markets.find(m => m.key === 'total_rounds');
        if (totalRoundsMarket) {
          const under2_5 = totalRoundsMarket.outcomes.find(o => 
            o.name.toLowerCase().includes('under') && o.name.includes('2.5')
          )?.price;
          const over2_5 = totalRoundsMarket.outcomes.find(o => 
            o.name.toLowerCase().includes('over') && o.name.includes('2.5')
          )?.price;

          if (under2_5) analysis.totalRoundsAnalysis.under2_5 += under2_5;
          if (over2_5) analysis.totalRoundsAnalysis.over2_5 += over2_5;
        }
      }
    }

    const totalBookmakers = events.reduce((sum, e) => sum + (e.bookmakers?.length || 0), 0);
    analysis.availability = totalBookmakers > 0 ? (roundMarkets / totalBookmakers) * 100 : 0;

    // Calculate average odds for each round
    for (let i = 1; i <= 5; i++) {
      const roundKey = `round${i}`;
      analysis.avgRoundOdds[roundKey] = roundCounts[roundKey] > 0 ? 
        roundTotals[roundKey] / roundCounts[roundKey] : 0;
    }

    return analysis;
  }

  private analyzePropMarkets(events: TheOddsAPIEvent[]): any {
    const analysis = {
      availability: 0,
      propTypes: new Set<string>(),
      avgPropsPerFight: 0,
      popularProps: [],
      uniqueProps: []
    };

    let totalProps = 0;
    const propCounts = new Map<string, number>();

    for (const event of events) {
      if (!event.bookmakers) continue;

      for (const bookmaker of event.bookmakers) {
        for (const market of bookmaker.markets) {
          if (market.key.includes('prop') || market.key.includes('fighter_') || 
              market.key.includes('performance') || market.key.includes('special')) {
            totalProps++;
            analysis.propTypes.add(market.key);
            
            const count = propCounts.get(market.key) || 0;
            propCounts.set(market.key, count + 1);
          }
        }
      }
    }

    analysis.avgPropsPerFight = events.length > 0 ? totalProps / events.length : 0;
    
    // Sort props by popularity
    const sortedProps = Array.from(propCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([prop, count]) => ({ prop, count }));

    analysis.popularProps = sortedProps.slice(0, 5);
    analysis.uniqueProps = sortedProps.filter(p => p.count === 1).map(p => p.prop);

    return analysis;
  }

  private findCrossMarketArbitrage(events: TheOddsAPIEvent[]): any[] {
    const opportunities = [];

    for (const event of events) {
      if (!event.bookmakers) continue;

      // Look for arbitrage between different market types
      // For example: Method + Round betting vs H2H
      const h2hOdds = this.extractH2HOdds(event);
      const methodOdds = this.extractMethodOdds(event);
      const roundOdds = this.extractRoundOdds(event);

      // Check for inconsistencies that create arbitrage opportunities
      if (h2hOdds.length > 0 && methodOdds.length > 0) {
        const crossMarketArb = this.calculateCrossMarketArbitrage(h2hOdds, methodOdds, roundOdds);
        if (crossMarketArb.length > 0) {
          opportunities.push(...crossMarketArb.map(arb => ({
            ...arb,
            fightId: this.generateFightId(event),
            eventId: event.id
          })));
        }
      }
    }

    return opportunities;
  }

  private extractH2HOdds(event: TheOddsAPIEvent): any[] {
    const odds = [];
    
    for (const bookmaker of event.bookmakers || []) {
      const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
      if (h2hMarket && h2hMarket.outcomes.length === 2) {
        const fighter1Odds = h2hMarket.outcomes.find(o => o.name === event.home_team)?.price;
        const fighter2Odds = h2hMarket.outcomes.find(o => o.name === event.away_team)?.price;
        
        if (fighter1Odds && fighter2Odds) {
          odds.push({
            sportsbook: bookmaker.key,
            fighter1: fighter1Odds,
            fighter2: fighter2Odds
          });
        }
      }
    }
    
    return odds;
  }

  private extractMethodOdds(event: TheOddsAPIEvent): any[] {
    const odds = [];
    
    for (const bookmaker of event.bookmakers || []) {
      const methodMarket = bookmaker.markets.find(m => m.key === 'fight_result_method');
      if (methodMarket) {
        odds.push({
          sportsbook: bookmaker.key,
          ko: methodMarket.outcomes.find(o => 
            o.name.toLowerCase().includes('ko') || o.name.toLowerCase().includes('knockout')
          )?.price || 0,
          submission: methodMarket.outcomes.find(o => 
            o.name.toLowerCase().includes('submission')
          )?.price || 0,
          decision: methodMarket.outcomes.find(o => 
            o.name.toLowerCase().includes('decision')
          )?.price || 0
        });
      }
    }
    
    return odds;
  }

  private extractRoundOdds(event: TheOddsAPIEvent): any[] {
    const odds = [];
    
    for (const bookmaker of event.bookmakers || []) {
      const roundMarket = bookmaker.markets.find(m => m.key === 'fight_result_round');
      if (roundMarket) {
        const roundData = {};
        for (let i = 1; i <= 5; i++) {
          const roundOdds = roundMarket.outcomes.find(o => 
            o.name.includes(`Round ${i}`) || o.name.includes(`${i}st`) || 
            o.name.includes(`${i}nd`) || o.name.includes(`${i}rd`) || o.name.includes(`${i}th`)
          )?.price;
          
          if (roundOdds) {
            roundData[`round${i}`] = roundOdds;
          }
        }
        
        if (Object.keys(roundData).length > 0) {
          odds.push({
            sportsbook: bookmaker.key,
            ...roundData
          });
        }
      }
    }
    
    return odds;
  }

  private calculateCrossMarketArbitrage(h2hOdds: any[], methodOdds: any[], roundOdds: any[]): any[] {
    const opportunities = [];

    // This is a simplified example - in practice, you'd need complex calculations
    // to find true cross-market arbitrage opportunities
    
    // Example: Check if method odds are inconsistent with h2h odds
    for (const h2h of h2hOdds) {
      for (const method of methodOdds) {
        if (h2h.sportsbook !== method.sportsbook) {
          // Calculate implied probabilities and look for inconsistencies
          const h2hImplied1 = this.oddsToImpliedProbability(h2h.fighter1);
          const h2hImplied2 = this.oddsToImpliedProbability(h2h.fighter2);
          
          const methodImpliedTotal = 
            this.oddsToImpliedProbability(method.ko) +
            this.oddsToImpliedProbability(method.submission) +
            this.oddsToImpliedProbability(method.decision);

          // If method probabilities don't align with h2h, there might be an opportunity
          if (Math.abs((h2hImplied1 + h2hImplied2) - methodImpliedTotal) > 0.1) {
            opportunities.push({
              type: 'cross_market',
              h2hSportsbook: h2h.sportsbook,
              methodSportsbook: method.sportsbook,
              discrepancy: Math.abs((h2hImplied1 + h2hImplied2) - methodImpliedTotal),
              potentialProfit: 'TBD' // Would need detailed calculation
            });
          }
        }
      }
    }

    return opportunities;
  }

  private formatMarketName(marketKey: string): string {
    const nameMapping: Record<string, string> = {
      'fighter_knockdowns': 'Fighter Knockdowns',
      'fighter_takedowns': 'Fighter Takedowns',
      'fight_performance_bonus': 'Performance Bonus',
      'fighter_significant_strikes': 'Significant Strikes',
      'fight_finish_time': 'Fight Finish Time',
      'fighter_control_time': 'Control Time'
    };

    return nameMapping[marketKey] || marketKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  public getSupportedSportsbooks(): string[] {
    return Array.from(this.supportedSportsbooks);
  }

  public async getAvailableSportsbooks(): Promise<string[]> {
    try {
      // Make a test request to see which sportsbooks are currently available
      const url = sourceConfigManager.getEndpointUrl('THE_ODDS_API', 'odds');
      const response = await this.makeRequest<TheOddsAPIEvent[]>({
        method: 'GET',
        url,
        params: {
          regions: 'us',
          markets: 'h2h',
          oddsFormat: 'american',
          dateFormat: 'iso'
        }
      });

      const availableSportsbooks = new Set<string>();
      response.data.forEach(event => {
        event.bookmakers?.forEach(bookmaker => {
          availableSportsbooks.add(bookmaker.key);
        });
      });

      return Array.from(availableSportsbooks);
    } catch (error: any) {
      console.error('Error fetching available sportsbooks:', error);
      return Array.from(this.supportedSportsbooks);
    }
  }
}