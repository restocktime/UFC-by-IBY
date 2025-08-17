import { OddsAPIConnector, SportsbookFilter, OddsAggregationOptions } from '../ingestion/connectors/odds-api.connector.js';
import { OddsRepository } from '../repositories/odds.repository.js';
import { DatabaseManager } from '../database/manager.js';
import { EventEmitter } from 'events';

export interface AggregationConfig {
  updateInterval: number; // minutes
  enableRealTimeUpdates: boolean;
  prioritySportsbooks: string[];
  minSportsbooksRequired: number;
  arbitrageThreshold: number; // minimum profit percentage
}

export interface SportsbookCoverage {
  sportsbook: string;
  availability: number; // percentage of fights covered
  avgUpdateFrequency: number; // minutes
  reliability: number; // 0-1 score
  marketCoverage: {
    moneyline: boolean;
    method: boolean;
    rounds: boolean;
    props: boolean;
  };
}

export interface MarketAnalysis {
  fightId: string;
  totalSportsbooks: number;
  marketDepth: {
    moneyline: number;
    method: number;
    rounds: number;
  };
  consensus: {
    fighter1Probability: number;
    fighter2Probability: number;
    confidence: number;
  };
  bestOdds: {
    fighter1: { odds: number; sportsbook: string };
    fighter2: { odds: number; sportsbook: string };
  };
  arbitrageOpportunities: number;
  marketEfficiency: number; // 0-1 score
}

export class OddsAggregationService extends EventEmitter {
  private oddsConnector: OddsAPIConnector;
  private oddsRepository: OddsRepository;
  private config: AggregationConfig;
  private updateTimer?: NodeJS.Timeout;
  private sportsbookCoverage: Map<string, SportsbookCoverage> = new Map();

  constructor(
    config?: Partial<AggregationConfig>,
    aggregationOptions?: Partial<OddsAggregationOptions>
  ) {
    super();
    
    this.config = {
      updateInterval: 5, // 5 minutes
      enableRealTimeUpdates: true,
      prioritySportsbooks: ['draftkings', 'fanduel', 'betmgm', 'hardrockbet'],
      minSportsbooksRequired: 3,
      arbitrageThreshold: 1.5,
      ...config
    };

    const dbManager = DatabaseManager.getInstance();
    this.oddsRepository = new OddsRepository();
    
    // Configure odds connector with priority sportsbooks
    const connectorOptions: Partial<OddsAggregationOptions> = {
      sportsbooks: {
        prioritySportsbooks: this.config.prioritySportsbooks
      },
      markets: ['h2h', 'fight_result_method', 'fight_result_round'],
      regions: ['us', 'us2'],
      oddsFormat: 'american',
      ...aggregationOptions
    };

    this.oddsConnector = new OddsAPIConnector(
      this.oddsRepository,
      {
        minPercentageChange: 3,
        enableArbitrageDetection: true,
        minArbitrageProfit: this.config.arbitrageThreshold
      },
      connectorOptions
    );

    this.setupEventListeners();
  }

  public async startAggregation(): Promise<void> {
    try {
      console.log('Starting odds aggregation service...');
      
      // Initial sync
      await this.performFullSync();
      
      // Set up periodic updates if enabled
      if (this.config.enableRealTimeUpdates) {
        this.schedulePeriodicUpdates();
      }

      this.emit('aggregationStarted', {
        config: this.config,
        timestamp: new Date()
      });

    } catch (error: any) {
      console.error('Error starting odds aggregation:', error);
      this.emit('aggregationError', { error: error.message });
      throw error;
    }
  }

  public async stopAggregation(): Promise<void> {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }

    console.log('Odds aggregation service stopped');
    this.emit('aggregationStopped', { timestamp: new Date() });
  }

  public async performFullSync(): Promise<void> {
    try {
      console.log('Performing full odds sync across all sportsbooks...');
      
      // Get available sportsbooks
      const availableSportsbooks = await this.oddsConnector.getAvailableSportsbooks();
      console.log(`Found ${availableSportsbooks.length} available sportsbooks:`, availableSportsbooks);

      // Sync odds from all available sportsbooks
      const result = await this.oddsConnector.syncMultiSportsbookOdds();
      
      // Update sportsbook coverage metrics
      await this.updateSportsbookCoverage(availableSportsbooks);

      console.log(`Full sync completed: ${result.recordsProcessed} processed, ${result.recordsSkipped} skipped`);
      
      this.emit('fullSyncCompleted', {
        result,
        sportsbooksCount: availableSportsbooks.length,
        timestamp: new Date()
      });

    } catch (error: any) {
      console.error('Error during full sync:', error);
      this.emit('syncError', { error: error.message });
      throw error;
    }
  }

  public async syncSpecificFight(fightId: string): Promise<MarketAnalysis> {
    try {
      console.log(`Syncing odds for specific fight: ${fightId}`);
      
      // Sync odds for the specific fight
      await this.oddsConnector.syncMultiSportsbookOdds(fightId);
      
      // Generate market analysis
      const analysis = await this.generateMarketAnalysis(fightId);
      
      this.emit('fightSyncCompleted', {
        fightId,
        analysis,
        timestamp: new Date()
      });

      return analysis;

    } catch (error: any) {
      console.error(`Error syncing fight ${fightId}:`, error);
      throw error;
    }
  }

  public async generateMarketAnalysis(fightId: string): Promise<MarketAnalysis> {
    try {
      // Get latest odds from all sportsbooks for this fight
      const latestOdds = await this.oddsRepository.getLatestOdds(fightId);
      
      if (latestOdds.length === 0) {
        throw new Error(`No odds found for fight: ${fightId}`);
      }

      // Calculate market depth
      const marketDepth = this.calculateMarketDepth(latestOdds);
      
      // Calculate consensus probabilities
      const consensus = this.calculateConsensus(latestOdds);
      
      // Find best odds
      const bestOdds = this.findBestOdds(latestOdds);
      
      // Count arbitrage opportunities
      const arbitrageOpportunities = await this.countArbitrageOpportunities(fightId);
      
      // Calculate market efficiency
      const marketEfficiency = this.calculateMarketEfficiency(latestOdds);

      const analysis: MarketAnalysis = {
        fightId,
        totalSportsbooks: latestOdds.length,
        marketDepth,
        consensus,
        bestOdds,
        arbitrageOpportunities,
        marketEfficiency
      };

      return analysis;

    } catch (error: any) {
      console.error(`Error generating market analysis for ${fightId}:`, error);
      throw error;
    }
  }

  public async getSportsbookCoverage(): Promise<SportsbookCoverage[]> {
    return Array.from(this.sportsbookCoverage.values());
  }

  public async getArbitrageOpportunities(minProfit?: number): Promise<any[]> {
    try {
      const opportunities = await this.oddsRepository.getArbitrageOpportunities(
        undefined, 
        minProfit || this.config.arbitrageThreshold
      );
      
      return opportunities.filter(opp => 
        new Date(opp.expiresAt) > new Date()
      );
    } catch (error: any) {
      console.error('Error fetching arbitrage opportunities:', error);
      return [];
    }
  }

  public updateConfiguration(newConfig: Partial<AggregationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update connector configuration if sportsbooks changed
    if (newConfig.prioritySportsbooks) {
      this.oddsConnector.setSportsbookFilter({
        prioritySportsbooks: newConfig.prioritySportsbooks
      });
    }

    this.emit('configurationUpdated', { config: this.config });
  }

  private setupEventListeners(): void {
    this.oddsConnector.on('eventProcessed', (data) => {
      this.emit('oddsUpdated', data);
    });

    this.oddsConnector.on('arbitrageDetected', (data) => {
      this.emit('arbitrageDetected', data);
    });

    this.oddsConnector.on('oddsMovement', (data) => {
      this.emit('oddsMovement', data);
    });
  }

  private schedulePeriodicUpdates(): void {
    this.updateTimer = setInterval(async () => {
      try {
        await this.performFullSync();
      } catch (error: any) {
        console.error('Error during periodic update:', error);
        this.emit('periodicUpdateError', { error: error.message });
      }
    }, this.config.updateInterval * 60 * 1000);
  }

  private async updateSportsbookCoverage(availableSportsbooks: string[]): Promise<void> {
    for (const sportsbook of availableSportsbooks) {
      // This would typically involve analyzing historical data
      // For now, we'll create a basic coverage entry
      const coverage: SportsbookCoverage = {
        sportsbook: this.normalizeSportsbookName(sportsbook),
        availability: Math.random() * 30 + 70, // 70-100% (mock data)
        avgUpdateFrequency: Math.random() * 10 + 5, // 5-15 minutes
        reliability: Math.random() * 0.3 + 0.7, // 0.7-1.0
        marketCoverage: {
          moneyline: true,
          method: Math.random() > 0.3,
          rounds: Math.random() > 0.5,
          props: Math.random() > 0.7
        }
      };

      this.sportsbookCoverage.set(sportsbook, coverage);
    }
  }

  private calculateMarketDepth(odds: any[]): any {
    const moneylineCount = odds.filter(o => o.odds.moneyline[0] !== 0 && o.odds.moneyline[1] !== 0).length;
    const methodCount = odds.filter(o => 
      o.odds.method.ko !== 0 || o.odds.method.submission !== 0 || o.odds.method.decision !== 0
    ).length;
    const roundsCount = odds.filter(o => 
      o.odds.rounds.round1 !== 0 || o.odds.rounds.round2 !== 0 || o.odds.rounds.round3 !== 0
    ).length;

    return {
      moneyline: moneylineCount,
      method: methodCount,
      rounds: roundsCount
    };
  }

  private calculateConsensus(odds: any[]): any {
    if (odds.length === 0) {
      return { fighter1Probability: 0.5, fighter2Probability: 0.5, confidence: 0 };
    }

    const totalWeight = odds.length;
    const fighter1ProbSum = odds.reduce((sum, o) => sum + o.impliedProbability[0], 0);
    const fighter2ProbSum = odds.reduce((sum, o) => sum + o.impliedProbability[1], 0);

    const fighter1Probability = fighter1ProbSum / totalWeight;
    const fighter2Probability = fighter2ProbSum / totalWeight;

    // Calculate confidence based on standard deviation
    const fighter1Probs = odds.map(o => o.impliedProbability[0]);
    const mean = fighter1Probability;
    const variance = fighter1Probs.reduce((sum, prob) => 
      sum + Math.pow(prob - mean, 2), 0
    ) / fighter1Probs.length;
    const stdDev = Math.sqrt(variance);
    const confidence = Math.max(0.1, Math.min(1.0, 1 - (stdDev * 4)));

    return {
      fighter1Probability,
      fighter2Probability,
      confidence
    };
  }

  private findBestOdds(odds: any[]): any {
    let bestFighter1 = { odds: -Infinity, sportsbook: '' };
    let bestFighter2 = { odds: -Infinity, sportsbook: '' };

    for (const oddsData of odds) {
      if (oddsData.odds.moneyline[0] > bestFighter1.odds) {
        bestFighter1 = {
          odds: oddsData.odds.moneyline[0],
          sportsbook: oddsData.sportsbook
        };
      }
      if (oddsData.odds.moneyline[1] > bestFighter2.odds) {
        bestFighter2 = {
          odds: oddsData.odds.moneyline[1],
          sportsbook: oddsData.sportsbook
        };
      }
    }

    return {
      fighter1: bestFighter1,
      fighter2: bestFighter2
    };
  }

  private async countArbitrageOpportunities(fightId: string): Promise<number> {
    try {
      const opportunities = await this.oddsRepository.getArbitrageOpportunities(fightId);
      return opportunities.filter(opp => new Date(opp.expiresAt) > new Date()).length;
    } catch (error) {
      return 0;
    }
  }

  private calculateMarketEfficiency(odds: any[]): number {
    if (odds.length < 2) return 0.5;

    // Calculate spread between best and worst odds
    const fighter1Odds = odds.map(o => o.odds.moneyline[0]).filter(o => o !== 0);
    const fighter2Odds = odds.map(o => o.odds.moneyline[1]).filter(o => o !== 0);

    if (fighter1Odds.length === 0 || fighter2Odds.length === 0) return 0.5;

    const fighter1Spread = Math.max(...fighter1Odds) - Math.min(...fighter1Odds);
    const fighter2Spread = Math.max(...fighter2Odds) - Math.min(...fighter2Odds);
    const avgSpread = (fighter1Spread + fighter2Spread) / 2;

    // Normalize spread to efficiency score (lower spread = higher efficiency)
    const normalizedSpread = Math.min(1, avgSpread / 100);
    return Math.max(0, 1 - normalizedSpread);
  }

  private normalizeSportsbookName(bookmakerKey: string): string {
    const mapping: Record<string, string> = {
      'draftkings': 'DraftKings',
      'fanduel': 'FanDuel',
      'betmgm': 'BetMGM',
      'caesars': 'Caesars',
      'hardrockbet': 'Hard Rock Bet',
      'espnbet': 'ESPN BET',
      'betway': 'Betway',
      'wynnbet': 'WynnBET'
    };

    return mapping[bookmakerKey] || bookmakerKey;
  }
}