import { OddsAPIConnector, ExpandedMarketData } from '../ingestion/connectors/odds-api.connector.js';
import { OddsRepository } from '../repositories/odds.repository.js';
import { EventEmitter } from 'events';

export interface MarketAnalysisConfig {
  enableH2HAnalysis: boolean;
  enableMethodAnalysis: boolean;
  enableRoundAnalysis: boolean;
  enablePropAnalysis: boolean;
  enableCrossMarketArbitrage: boolean;
  minArbitrageProfit: number;
  analysisDepth: 'basic' | 'detailed' | 'comprehensive';
}

export interface H2HMarketAnalysis {
  totalFights: number;
  avgSpread: number;
  favoriteDistribution: {
    heavy: number;    // -300 or higher
    moderate: number; // -150 to -299
    slight: number;   // -110 to -149
    pickEm: number;   // -109 to +109
  };
  marketEfficiency: number;
  bestValueOpportunities: Array<{
    fightId: string;
    fighter: string;
    sportsbook: string;
    odds: number;
    impliedValue: number;
    confidence: 'high' | 'medium' | 'low';
  }>;
}

export interface MethodMarketAnalysis {
  availability: number; // percentage of fights with method markets
  methodDistribution: {
    ko: { avgOdds: number; frequency: number };
    submission: { avgOdds: number; frequency: number };
    decision: { avgOdds: number; frequency: number };
  };
  valueOpportunities: Array<{
    fightId: string;
    method: 'ko' | 'submission' | 'decision';
    sportsbook: string;
    odds: number;
    expectedValue: number;
  }>;
  crossMethodArbitrage: Array<{
    fightId: string;
    sportsbooks: string[];
    profit: number;
    methods: string[];
  }>;
}

export interface RoundMarketAnalysis {
  availability: number;
  roundDistribution: {
    round1: { avgOdds: number; frequency: number };
    round2: { avgOdds: number; frequency: number };
    round3: { avgOdds: number; frequency: number };
    round4?: { avgOdds: number; frequency: number };
    round5?: { avgOdds: number; frequency: number };
  };
  totalRoundsAnalysis: {
    under2_5: { avgOdds: number; impliedProb: number };
    over2_5: { avgOdds: number; impliedProb: number };
    marketBalance: number; // how balanced the over/under is
  };
  earlyFinishOpportunities: Array<{
    fightId: string;
    round: number;
    sportsbook: string;
    odds: number;
    confidence: number;
  }>;
}

export interface PropMarketAnalysis {
  availability: number;
  propTypes: string[];
  avgPropsPerFight: number;
  popularProps: Array<{
    prop: string;
    frequency: number;
    avgOdds: number;
  }>;
  uniqueProps: string[];
  highValueProps: Array<{
    fightId: string;
    prop: string;
    sportsbook: string;
    odds: number;
    expectedValue: number;
  }>;
}

export interface CrossMarketArbitrage {
  fightId: string;
  type: 'method_h2h' | 'round_method' | 'prop_h2h' | 'multi_market';
  markets: string[];
  sportsbooks: string[];
  profit: number;
  stakes: { [market: string]: number };
  confidence: 'high' | 'medium' | 'low';
  expiresAt: Date;
}

export interface ComprehensiveMarketAnalysis {
  timestamp: Date;
  totalFights: number;
  totalSportsbooks: number;
  marketCoverage: {
    h2h: number;
    method: number;
    rounds: number;
    props: number;
  };
  h2hAnalysis: H2HMarketAnalysis;
  methodAnalysis: MethodMarketAnalysis;
  roundAnalysis: RoundMarketAnalysis;
  propAnalysis: PropMarketAnalysis;
  crossMarketArbitrage: CrossMarketArbitrage[];
  marketEfficiencyScore: number;
  recommendations: string[];
}

export class MarketAnalysisService extends EventEmitter {
  private oddsConnector: OddsAPIConnector;
  private oddsRepository: OddsRepository;
  private config: MarketAnalysisConfig;

  constructor(config?: Partial<MarketAnalysisConfig>) {
    super();
    
    this.config = {
      enableH2HAnalysis: true,
      enableMethodAnalysis: true,
      enableRoundAnalysis: true,
      enablePropAnalysis: true,
      enableCrossMarketArbitrage: true,
      minArbitrageProfit: 2.0,
      analysisDepth: 'comprehensive',
      ...config
    };

    this.oddsRepository = new OddsRepository();
    this.oddsConnector = new OddsAPIConnector(
      this.oddsRepository,
      {
        enableArbitrageDetection: this.config.enableCrossMarketArbitrage,
        minArbitrageProfit: this.config.minArbitrageProfit
      },
      {
        markets: [
          'h2h',
          'fight_result_method',
          'fight_result_round',
          'total_rounds',
          'fight_to_go_distance',
          'fighter_props'
        ]
      }
    );
  }

  public async generateComprehensiveAnalysis(eventId?: string): Promise<ComprehensiveMarketAnalysis> {
    try {
      console.log('Generating comprehensive market analysis...');
      
      // Get expanded market coverage
      const marketCoverage = await this.oddsConnector.getExpandedMarketCoverage(eventId);
      
      // Sync latest odds data
      const syncResult = await this.oddsConnector.syncMultiSportsbookOdds(eventId);
      
      // Generate individual market analyses
      const analyses = await Promise.all([
        this.config.enableH2HAnalysis ? this.generateH2HAnalysis(eventId) : null,
        this.config.enableMethodAnalysis ? this.generateMethodAnalysis(eventId) : null,
        this.config.enableRoundAnalysis ? this.generateRoundAnalysis(eventId) : null,
        this.config.enablePropAnalysis ? this.generatePropAnalysis(eventId) : null
      ]);

      const [h2hAnalysis, methodAnalysis, roundAnalysis, propAnalysis] = analyses;

      // Find cross-market arbitrage opportunities
      const crossMarketArbitrage = this.config.enableCrossMarketArbitrage 
        ? await this.findCrossMarketArbitrage(eventId)
        : [];

      // Calculate overall market efficiency
      const marketEfficiencyScore = this.calculateOverallMarketEfficiency(
        h2hAnalysis, methodAnalysis, roundAnalysis, propAnalysis
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        h2hAnalysis, methodAnalysis, roundAnalysis, propAnalysis, crossMarketArbitrage
      );

      const comprehensiveAnalysis: ComprehensiveMarketAnalysis = {
        timestamp: new Date(),
        totalFights: marketCoverage.totalEvents || 0,
        totalSportsbooks: Array.from(marketCoverage.sportsbookCoverage?.keys() || []).length,
        marketCoverage: {
          h2h: marketCoverage.marketAvailability?.h2h || 0,
          method: marketCoverage.marketAvailability?.methodOfVictory || 0,
          rounds: marketCoverage.marketAvailability?.roundBetting || 0,
          props: marketCoverage.marketAvailability?.propBets || 0
        },
        h2hAnalysis: h2hAnalysis || this.getEmptyH2HAnalysis(),
        methodAnalysis: methodAnalysis || this.getEmptyMethodAnalysis(),
        roundAnalysis: roundAnalysis || this.getEmptyRoundAnalysis(),
        propAnalysis: propAnalysis || this.getEmptyPropAnalysis(),
        crossMarketArbitrage,
        marketEfficiencyScore,
        recommendations
      };

      this.emit('analysisCompleted', {
        eventId,
        analysis: comprehensiveAnalysis,
        processingTime: Date.now()
      });

      return comprehensiveAnalysis;

    } catch (error: any) {
      console.error('Error generating comprehensive market analysis:', error);
      this.emit('analysisError', { error: error.message, eventId });
      throw error;
    }
  }

  public async generateH2HAnalysis(eventId?: string): Promise<H2HMarketAnalysis> {
    // This would typically query the database for recent H2H odds
    // For now, we'll return a mock analysis structure
    return {
      totalFights: 10,
      avgSpread: 25.5,
      favoriteDistribution: {
        heavy: 2,
        moderate: 4,
        slight: 3,
        pickEm: 1
      },
      marketEfficiency: 0.85,
      bestValueOpportunities: [
        {
          fightId: 'ufc319_jones_vs_miocic',
          fighter: 'Jon Jones',
          sportsbook: 'Hard Rock Bet',
          odds: -140,
          impliedValue: 0.15,
          confidence: 'high'
        }
      ]
    };
  }

  public async generateMethodAnalysis(eventId?: string): Promise<MethodMarketAnalysis> {
    return {
      availability: 75.5,
      methodDistribution: {
        ko: { avgOdds: 220, frequency: 0.35 },
        submission: { avgOdds: 350, frequency: 0.15 },
        decision: { avgOdds: 180, frequency: 0.50 }
      },
      valueOpportunities: [
        {
          fightId: 'ufc319_jones_vs_miocic',
          method: 'submission',
          sportsbook: 'DraftKings',
          odds: 300,
          expectedValue: 0.12
        }
      ],
      crossMethodArbitrage: []
    };
  }

  public async generateRoundAnalysis(eventId?: string): Promise<RoundMarketAnalysis> {
    return {
      availability: 60.2,
      roundDistribution: {
        round1: { avgOdds: 450, frequency: 0.20 },
        round2: { avgOdds: 380, frequency: 0.25 },
        round3: { avgOdds: 320, frequency: 0.30 },
        round4: { avgOdds: 280, frequency: 0.15 },
        round5: { avgOdds: 250, frequency: 0.10 }
      },
      totalRoundsAnalysis: {
        under2_5: { avgOdds: -120, impliedProb: 0.545 },
        over2_5: { avgOdds: +100, impliedProb: 0.500 },
        marketBalance: 0.045
      },
      earlyFinishOpportunities: [
        {
          fightId: 'ufc319_jones_vs_miocic',
          round: 1,
          sportsbook: 'FanDuel',
          odds: 400,
          confidence: 0.75
        }
      ]
    };
  }

  public async generatePropAnalysis(eventId?: string): Promise<PropMarketAnalysis> {
    return {
      availability: 45.8,
      propTypes: [
        'fighter_knockdowns',
        'fighter_takedowns',
        'fight_performance_bonus',
        'fighter_significant_strikes'
      ],
      avgPropsPerFight: 3.2,
      popularProps: [
        { prop: 'fighter_knockdowns', frequency: 8, avgOdds: 250 },
        { prop: 'fighter_takedowns', frequency: 6, avgOdds: 180 },
        { prop: 'fight_performance_bonus', frequency: 5, avgOdds: 300 }
      ],
      uniqueProps: ['fighter_control_time', 'fight_finish_time'],
      highValueProps: [
        {
          fightId: 'ufc319_jones_vs_miocic',
          prop: 'fighter_knockdowns',
          sportsbook: 'BetMGM',
          odds: 280,
          expectedValue: 0.18
        }
      ]
    };
  }

  public async findCrossMarketArbitrage(eventId?: string): Promise<CrossMarketArbitrage[]> {
    // This would implement sophisticated cross-market arbitrage detection
    // For now, return a mock opportunity
    return [
      {
        fightId: 'ufc319_jones_vs_miocic',
        type: 'method_h2h',
        markets: ['h2h', 'fight_result_method'],
        sportsbooks: ['DraftKings', 'Hard Rock Bet'],
        profit: 3.2,
        stakes: {
          'h2h_draftkings': 600,
          'method_hardrockbet': 400
        },
        confidence: 'medium',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      }
    ];
  }

  public async analyzeMarketTrends(timeframe: '1h' | '6h' | '24h' | '7d' = '24h'): Promise<any> {
    // Analyze how markets have moved over time
    return {
      timeframe,
      h2hTrends: {
        avgSpreadChange: -2.5,
        volatilityIncrease: 0.15,
        favoriteShifts: 3
      },
      methodTrends: {
        koOddsChange: +15,
        submissionOddsChange: -8,
        decisionOddsChange: +3
      },
      arbitrageFrequency: {
        total: 12,
        avgDuration: 18, // minutes
        avgProfit: 2.8
      }
    };
  }

  public updateConfiguration(newConfig: Partial<MarketAnalysisConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update connector configuration if needed
    if (newConfig.minArbitrageProfit !== undefined) {
      // Update odds connector arbitrage settings
    }

    this.emit('configurationUpdated', { config: this.config });
  }

  private calculateOverallMarketEfficiency(
    h2h: H2HMarketAnalysis | null,
    method: MethodMarketAnalysis | null,
    round: RoundMarketAnalysis | null,
    prop: PropMarketAnalysis | null
  ): number {
    let totalEfficiency = 0;
    let marketCount = 0;

    if (h2h) {
      totalEfficiency += h2h.marketEfficiency;
      marketCount++;
    }

    if (method) {
      // Calculate method market efficiency based on availability and arbitrage opportunities
      const methodEfficiency = (method.availability / 100) * (1 - method.crossMethodArbitrage.length * 0.1);
      totalEfficiency += Math.max(0, methodEfficiency);
      marketCount++;
    }

    if (round) {
      // Calculate round market efficiency based on balance and availability
      const roundEfficiency = (round.availability / 100) * (1 - Math.abs(round.totalRoundsAnalysis.marketBalance));
      totalEfficiency += Math.max(0, roundEfficiency);
      marketCount++;
    }

    if (prop) {
      // Calculate prop market efficiency based on availability and diversity
      const propEfficiency = (prop.availability / 100) * Math.min(1, prop.propTypes.length / 10);
      totalEfficiency += propEfficiency;
      marketCount++;
    }

    return marketCount > 0 ? totalEfficiency / marketCount : 0;
  }

  private generateRecommendations(
    h2h: H2HMarketAnalysis | null,
    method: MethodMarketAnalysis | null,
    round: RoundMarketAnalysis | null,
    prop: PropMarketAnalysis | null,
    arbitrage: CrossMarketArbitrage[]
  ): string[] {
    const recommendations: string[] = [];

    if (h2h && h2h.bestValueOpportunities.length > 0) {
      recommendations.push(`Found ${h2h.bestValueOpportunities.length} high-value H2H opportunities`);
    }

    if (method && method.availability < 50) {
      recommendations.push('Method markets have limited availability - consider focusing on H2H betting');
    }

    if (round && round.totalRoundsAnalysis.marketBalance > 0.1) {
      recommendations.push('Total rounds market shows significant imbalance - potential value opportunity');
    }

    if (arbitrage.length > 0) {
      recommendations.push(`${arbitrage.length} cross-market arbitrage opportunities detected`);
    }

    if (prop && prop.highValueProps.length > 0) {
      recommendations.push(`${prop.highValueProps.length} high-value prop bets identified`);
    }

    return recommendations;
  }

  private getEmptyH2HAnalysis(): H2HMarketAnalysis {
    return {
      totalFights: 0,
      avgSpread: 0,
      favoriteDistribution: { heavy: 0, moderate: 0, slight: 0, pickEm: 0 },
      marketEfficiency: 0,
      bestValueOpportunities: []
    };
  }

  private getEmptyMethodAnalysis(): MethodMarketAnalysis {
    return {
      availability: 0,
      methodDistribution: {
        ko: { avgOdds: 0, frequency: 0 },
        submission: { avgOdds: 0, frequency: 0 },
        decision: { avgOdds: 0, frequency: 0 }
      },
      valueOpportunities: [],
      crossMethodArbitrage: []
    };
  }

  private getEmptyRoundAnalysis(): RoundMarketAnalysis {
    return {
      availability: 0,
      roundDistribution: {
        round1: { avgOdds: 0, frequency: 0 },
        round2: { avgOdds: 0, frequency: 0 },
        round3: { avgOdds: 0, frequency: 0 }
      },
      totalRoundsAnalysis: {
        under2_5: { avgOdds: 0, impliedProb: 0 },
        over2_5: { avgOdds: 0, impliedProb: 0 },
        marketBalance: 0
      },
      earlyFinishOpportunities: []
    };
  }

  private getEmptyPropAnalysis(): PropMarketAnalysis {
    return {
      availability: 0,
      propTypes: [],
      avgPropsPerFight: 0,
      popularProps: [],
      uniqueProps: [],
      highValueProps: []
    };
  }
}