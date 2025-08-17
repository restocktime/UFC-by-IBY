/**
 * BettingAnalysisService - Advanced betting analysis and value identification
 */

import { EventEmitter } from 'events';
import { OddsData, FightData, PredictionResult } from '@ufc-platform/shared';

export interface ValueBetAnalysis {
  fightId: string;
  fighter: string;
  sportsbook: string;
  currentOdds: number;
  fairOdds: number;
  impliedProbability: number;
  trueProbability: number;
  expectedValue: number;
  confidence: number;
  kellyFraction: number;
  recommendedStake: number;
  riskLevel: 'low' | 'medium' | 'high';
  reasoning: string[];
  timestamp: Date;
}

export interface BankrollRecommendation {
  totalBankroll: number;
  recommendedUnit: number;
  maxBetSize: number;
  currentRisk: number;
  diversificationScore: number;
  recommendations: {
    conservative: BetSizeRecommendation;
    moderate: BetSizeRecommendation;
    aggressive: BetSizeRecommendation;
  };
}

export interface BetSizeRecommendation {
  unitSize: number;
  maxSingleBet: number;
  maxDailyRisk: number;
  description: string;
}

export interface ExpectedValueCalculation {
  winProbability: number;
  lossProbability: number;
  winPayout: number;
  lossAmount: number;
  expectedValue: number;
  expectedReturn: number;
  breakEvenOdds: number;
  marginOfSafety: number;
}

export interface BettingStrategy {
  id: string;
  name: string;
  description: string;
  type: 'value' | 'arbitrage' | 'momentum' | 'contrarian' | 'system';
  parameters: {
    minExpectedValue: number;
    maxRiskPerBet: number;
    minConfidence: number;
    maxOdds: number;
    minOdds: number;
    bankrollPercentage: number;
  };
  filters: BettingFilter[];
  isActive: boolean;
  performance: StrategyPerformance;
}

export interface BettingFilter {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'in' | 'not_in';
  value: any;
  description: string;
}

export interface StrategyPerformance {
  totalBets: number;
  winningBets: number;
  totalProfit: number;
  roi: number;
  averageOdds: number;
  averageStake: number;
  longestWinStreak: number;
  longestLoseStreak: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
}

export interface ArbitrageOpportunity {
  fightId: string;
  totalStake: number;
  guaranteedProfit: number;
  profitMargin: number;
  bets: ArbitrageBet[];
  expiresAt: Date;
  riskFactors: string[];
}

export interface ArbitrageBet {
  fighter: string;
  sportsbook: string;
  odds: number;
  stake: number;
  payout: number;
}

export interface MarketAnalysis {
  fightId: string;
  totalVolume: number;
  sharpMoney: number;
  publicMoney: number;
  lineMovement: LineMovement[];
  steamMoves: SteamMove[];
  reverseLineMovement: boolean;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  efficiency: number;
  liquidity: number;
  timestamp: Date;
}

export interface LineMovement {
  timestamp: Date;
  sportsbook: string;
  previousOdds: number;
  newOdds: number;
  movement: number;
  volume?: number;
  reason?: string;
}

export interface SteamMove {
  timestamp: Date;
  fighter: string;
  oddsChange: number;
  volumeSpike: number;
  sportsbooksAffected: string[];
  confidence: number;
}

export class BettingAnalysisService extends EventEmitter {
  private strategies: Map<string, BettingStrategy> = new Map();
  private analysisHistory: Map<string, ValueBetAnalysis[]> = new Map();
  private marketData: Map<string, MarketAnalysis> = new Map();

  constructor() {
    super();
    this.initializeDefaultStrategies();
  }

  /**
   * Analyze value betting opportunities
   */
  async analyzeValueBets(
    fightData: FightData,
    oddsData: OddsData[],
    prediction: PredictionResult
  ): Promise<ValueBetAnalysis[]> {
    const valueBets: ValueBetAnalysis[] = [];

    for (const odds of oddsData) {
      // Calculate true probability from prediction
      const trueProbability = this.getTrueProbability(prediction, odds.fighter);
      
      // Calculate implied probability from odds
      const impliedProbability = this.calculateImpliedProbability(odds.odds);
      
      // Calculate expected value
      const expectedValueCalc = this.calculateExpectedValue(
        trueProbability,
        odds.odds
      );
      const expectedValue = expectedValueCalc.expectedValue;

      // Only consider positive expected value bets
      if (expectedValue > 0) {
        const fairOdds = this.calculateFairOdds(trueProbability);
        const kellyFraction = this.calculateKellyFraction(
          trueProbability,
          odds.odds
        );

        const analysis: ValueBetAnalysis = {
          fightId: fightData.id,
          fighter: odds.fighter,
          sportsbook: odds.sportsbook,
          currentOdds: odds.odds,
          fairOdds,
          impliedProbability,
          trueProbability,
          expectedValue,
          confidence: prediction.confidence,
          kellyFraction,
          recommendedStake: this.calculateRecommendedStake(kellyFraction),
          riskLevel: this.assessRiskLevel(expectedValue, kellyFraction, prediction.confidence),
          reasoning: this.generateReasoning(
            expectedValue,
            trueProbability,
            impliedProbability,
            prediction
          ),
          timestamp: new Date()
        };

        valueBets.push(analysis);
      }
    }

    // Store analysis history
    if (!this.analysisHistory.has(fightData.id)) {
      this.analysisHistory.set(fightData.id, []);
    }
    this.analysisHistory.get(fightData.id)!.push(...valueBets);

    this.emit('valueBetsAnalyzed', {
      fightId: fightData.id,
      valueBets,
      count: valueBets.length
    });

    return valueBets;
  }

  /**
   * Generate bankroll management recommendations
   */
  generateBankrollRecommendations(
    totalBankroll: number,
    riskTolerance: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
  ): BankrollRecommendation {
    const baseUnit = totalBankroll * 0.01; // 1% base unit

    const recommendations = {
      conservative: {
        unitSize: baseUnit * 0.5,
        maxSingleBet: totalBankroll * 0.02,
        maxDailyRisk: totalBankroll * 0.05,
        description: 'Low risk, steady growth approach'
      },
      moderate: {
        unitSize: baseUnit,
        maxSingleBet: totalBankroll * 0.05,
        maxDailyRisk: totalBankroll * 0.10,
        description: 'Balanced risk-reward approach'
      },
      aggressive: {
        unitSize: baseUnit * 2,
        maxSingleBet: totalBankroll * 0.10,
        maxDailyRisk: totalBankroll * 0.20,
        description: 'Higher risk, higher reward approach'
      }
    };

    const currentRisk = this.calculateCurrentRisk(totalBankroll);
    const diversificationScore = this.calculateDiversificationScore();

    return {
      totalBankroll,
      recommendedUnit: recommendations[riskTolerance].unitSize,
      maxBetSize: recommendations[riskTolerance].maxSingleBet,
      currentRisk,
      diversificationScore,
      recommendations
    };
  }

  /**
   * Calculate expected value for a bet
   */
  calculateExpectedValue(
    trueProbability: number,
    odds: number
  ): ExpectedValueCalculation {
    const winProbability = trueProbability;
    const lossProbability = 1 - trueProbability;
    const winPayout = odds - 1; // Net profit on $1 bet
    const lossAmount = -1; // Loss on $1 bet

    const expectedValue = (winProbability * winPayout) + (lossProbability * lossAmount);
    const expectedReturn = expectedValue * 100; // As percentage
    const breakEvenOdds = 1 / trueProbability;
    const marginOfSafety = (odds - breakEvenOdds) / breakEvenOdds;

    return {
      winProbability,
      lossProbability,
      winPayout,
      lossAmount,
      expectedValue,
      expectedReturn,
      breakEvenOdds,
      marginOfSafety
    };
  }

  /**
   * Create custom betting strategy
   */
  createStrategy(strategy: Omit<BettingStrategy, 'id' | 'performance'>): string {
    const strategyId = this.generateStrategyId();
    
    const newStrategy: BettingStrategy = {
      ...strategy,
      id: strategyId,
      performance: {
        totalBets: 0,
        winningBets: 0,
        totalProfit: 0,
        roi: 0,
        averageOdds: 0,
        averageStake: 0,
        longestWinStreak: 0,
        longestLoseStreak: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        profitFactor: 0
      }
    };

    this.strategies.set(strategyId, newStrategy);

    this.emit('strategyCreated', {
      strategyId,
      strategy: newStrategy
    });

    return strategyId;
  }

  /**
   * Apply betting strategies to find opportunities
   */
  async applyStrategies(
    fightData: FightData,
    oddsData: OddsData[],
    prediction: PredictionResult
  ): Promise<Array<{ strategy: BettingStrategy; opportunities: ValueBetAnalysis[] }>> {
    const results: Array<{ strategy: BettingStrategy; opportunities: ValueBetAnalysis[] }> = [];

    for (const strategy of this.strategies.values()) {
      if (!strategy.isActive) continue;

      const opportunities = await this.evaluateStrategy(
        strategy,
        fightData,
        oddsData,
        prediction
      );

      if (opportunities.length > 0) {
        results.push({ strategy, opportunities });
      }
    }

    return results;
  }

  /**
   * Detect arbitrage opportunities
   */
  detectArbitrageOpportunities(
    fightData: FightData,
    oddsData: OddsData[]
  ): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    // Group odds by fighter
    const fighter1Odds = oddsData.filter(o => 
      o.fighter === fightData.fighter1.name || 
      o.fighter.includes('One') || 
      o.fighter.includes('1')
    );
    const fighter2Odds = oddsData.filter(o => 
      o.fighter === fightData.fighter2.name || 
      o.fighter.includes('Two') || 
      o.fighter.includes('2')
    );

    if (fighter1Odds.length === 0 || fighter2Odds.length === 0) {
      return opportunities;
    }

    // Find best odds for each fighter
    const bestFighter1 = fighter1Odds.reduce((best, current) => 
      current.odds > best.odds ? current : best
    );
    const bestFighter2 = fighter2Odds.reduce((best, current) => 
      current.odds > best.odds ? current : best
    );

    // Calculate arbitrage
    const impliedProb1 = 1 / bestFighter1.odds;
    const impliedProb2 = 1 / bestFighter2.odds;
    const totalImpliedProb = impliedProb1 + impliedProb2;

    if (totalImpliedProb < 1) {
      // Arbitrage opportunity exists
      const totalStake = 100; // Example stake
      const stake1 = (totalStake * impliedProb1) / totalImpliedProb;
      const stake2 = (totalStake * impliedProb2) / totalImpliedProb;
      const guaranteedProfit = Math.min(
        stake1 * bestFighter1.odds - totalStake,
        stake2 * bestFighter2.odds - totalStake
      );

      if (guaranteedProfit > 0) {
        opportunities.push({
          fightId: fightData.id,
          totalStake,
          guaranteedProfit,
          profitMargin: (guaranteedProfit / totalStake) * 100,
          bets: [
            {
              fighter: fightData.fighter1.name,
              sportsbook: bestFighter1.sportsbook,
              odds: bestFighter1.odds,
              stake: stake1,
              payout: stake1 * bestFighter1.odds
            },
            {
              fighter: fightData.fighter2.name,
              sportsbook: bestFighter2.sportsbook,
              odds: bestFighter2.odds,
              stake: stake2,
              payout: stake2 * bestFighter2.odds
            }
          ],
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          riskFactors: this.assessArbitrageRisks(bestFighter1, bestFighter2)
        });
      }
    }

    return opportunities;
  }

  /**
   * Analyze market efficiency and movements
   */
  analyzeMarket(fightId: string, oddsHistory: OddsData[]): MarketAnalysis {
    const lineMovements = this.calculateLineMovements(oddsHistory);
    const steamMoves = this.detectSteamMoves(lineMovements);
    const efficiency = this.calculateMarketEfficiency(oddsHistory);
    const liquidity = this.calculateLiquidity(oddsHistory);

    const analysis: MarketAnalysis = {
      fightId,
      totalVolume: this.calculateTotalVolume(oddsHistory),
      sharpMoney: this.estimateSharpMoney(lineMovements),
      publicMoney: this.estimatePublicMoney(oddsHistory),
      lineMovement: lineMovements,
      steamMoves,
      reverseLineMovement: this.detectReverseLineMovement(lineMovements),
      marketSentiment: this.analyzeSentiment(lineMovements),
      efficiency,
      liquidity,
      timestamp: new Date()
    };

    this.marketData.set(fightId, analysis);

    this.emit('marketAnalyzed', {
      fightId,
      analysis
    });

    return analysis;
  }

  /**
   * Get strategy performance
   */
  getStrategyPerformance(strategyId: string): StrategyPerformance | null {
    const strategy = this.strategies.get(strategyId);
    return strategy ? strategy.performance : null;
  }

  /**
   * Update strategy performance
   */
  updateStrategyPerformance(
    strategyId: string,
    betResult: {
      won: boolean;
      stake: number;
      payout: number;
      odds: number;
    }
  ): void {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) return;

    const perf = strategy.performance;
    perf.totalBets++;
    
    if (betResult.won) {
      perf.winningBets++;
      perf.totalProfit += (betResult.payout - betResult.stake);
    } else {
      perf.totalProfit -= betResult.stake;
    }

    // Update averages
    perf.averageOdds = ((perf.averageOdds * (perf.totalBets - 1)) + betResult.odds) / perf.totalBets;
    perf.averageStake = ((perf.averageStake * (perf.totalBets - 1)) + betResult.stake) / perf.totalBets;
    
    // Calculate ROI
    const totalStaked = perf.averageStake * perf.totalBets;
    perf.roi = totalStaked > 0 ? (perf.totalProfit / totalStaked) * 100 : 0;

    // Update strategy
    this.strategies.set(strategyId, strategy);

    this.emit('strategyPerformanceUpdated', {
      strategyId,
      performance: perf
    });
  }

  /**
   * Get all active strategies
   */
  getActiveStrategies(): BettingStrategy[] {
    return Array.from(this.strategies.values()).filter(s => s.isActive);
  }

  /**
   * Get analysis history for a fight
   */
  getAnalysisHistory(fightId: string): ValueBetAnalysis[] {
    return this.analysisHistory.get(fightId) || [];
  }

  /**
   * Private helper methods
   */

  private getTrueProbability(prediction: PredictionResult, fighter: string): number {
    // Map fighter name to probability
    // This is a simplified mapping - in practice would need more sophisticated matching
    if (fighter.includes('One') || fighter.includes('1')) {
      return prediction.winnerProbability.fighter1;
    } else {
      return prediction.winnerProbability.fighter2;
    }
  }

  private calculateImpliedProbability(odds: number): number {
    return 1 / odds;
  }

  private calculateFairOdds(probability: number): number {
    return 1 / probability;
  }

  private calculateKellyFraction(probability: number, odds: number): number {
    const b = odds - 1; // Net odds
    const p = probability;
    const q = 1 - probability;
    
    return (b * p - q) / b;
  }

  private calculateRecommendedStake(kellyFraction: number): number {
    // Use fractional Kelly for safety
    return Math.max(0, Math.min(0.25, kellyFraction * 0.25));
  }

  private assessRiskLevel(
    expectedValue: number,
    kellyFraction: number,
    confidence: number
  ): 'low' | 'medium' | 'high' {
    if (expectedValue > 0.15 && kellyFraction > 0.1 && confidence > 0.8) {
      return 'low';
    } else if (expectedValue > 0.05 && confidence > 0.6) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  private generateReasoning(
    expectedValue: number,
    trueProbability: number,
    impliedProbability: number,
    prediction: PredictionResult
  ): string[] {
    const reasoning: string[] = [];

    if (expectedValue > 0.1) {
      reasoning.push(`High expected value of ${(expectedValue * 100).toFixed(1)}%`);
    }

    if (trueProbability > impliedProbability + 0.1) {
      reasoning.push(`Market undervaluing fighter by ${((trueProbability - impliedProbability) * 100).toFixed(1)}%`);
    }

    if (prediction.confidence > 0.8) {
      reasoning.push(`High model confidence of ${(prediction.confidence * 100).toFixed(1)}%`);
    }

    return reasoning;
  }

  private calculateCurrentRisk(bankroll: number): number {
    // Placeholder - would calculate based on current open bets
    return 0.05; // 5% current risk
  }

  private calculateDiversificationScore(): number {
    // Placeholder - would calculate based on bet distribution
    return 0.75; // 75% diversification score
  }

  private async evaluateStrategy(
    strategy: BettingStrategy,
    fightData: FightData,
    oddsData: OddsData[],
    prediction: PredictionResult
  ): Promise<ValueBetAnalysis[]> {
    // Get all value bets for this fight
    const allValueBets = await this.analyzeValueBets(fightData, oddsData, prediction);

    // Filter based on strategy parameters and filters
    return allValueBets.filter(bet => {
      // Check strategy parameters
      if (bet.expectedValue < strategy.parameters.minExpectedValue) return false;
      if (bet.confidence < strategy.parameters.minConfidence) return false;
      if (bet.currentOdds > strategy.parameters.maxOdds) return false;
      if (bet.currentOdds < strategy.parameters.minOdds) return false;

      // Check custom filters
      return strategy.filters.every(filter => this.evaluateFilter(filter, bet, fightData));
    });
  }

  private evaluateFilter(filter: BettingFilter, bet: ValueBetAnalysis, fightData: FightData): boolean {
    const value = this.getFilterValue(filter.field, bet, fightData);
    
    switch (filter.operator) {
      case 'gt': return value > filter.value;
      case 'lt': return value < filter.value;
      case 'eq': return value === filter.value;
      case 'gte': return value >= filter.value;
      case 'lte': return value <= filter.value;
      case 'in': return Array.isArray(filter.value) && filter.value.includes(value);
      case 'not_in': return Array.isArray(filter.value) && !filter.value.includes(value);
      default: return true;
    }
  }

  private getFilterValue(field: string, bet: ValueBetAnalysis, fightData: FightData): any {
    switch (field) {
      case 'expectedValue': return bet.expectedValue;
      case 'confidence': return bet.confidence;
      case 'odds': return bet.currentOdds;
      case 'sportsbook': return bet.sportsbook;
      case 'fighter': return bet.fighter;
      case 'riskLevel': return bet.riskLevel;
      default: return null;
    }
  }

  private assessArbitrageRisks(odds1: OddsData, odds2: OddsData): string[] {
    const risks: string[] = [];

    if (odds1.sportsbook === odds2.sportsbook) {
      risks.push('Same sportsbook - may void bets');
    }

    if (odds1.odds > 10 || odds2.odds > 10) {
      risks.push('High odds - potential for line errors');
    }

    return risks;
  }

  private calculateLineMovements(oddsHistory: OddsData[]): LineMovement[] {
    const movements: LineMovement[] = [];
    
    // Group by sportsbook and fighter
    const grouped = new Map<string, OddsData[]>();
    
    for (const odds of oddsHistory) {
      const key = `${odds.sportsbook}_${odds.fighter}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(odds);
    }

    // Calculate movements for each group
    for (const [key, odds] of grouped) {
      const sorted = odds.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        
        if (prev.odds !== curr.odds) {
          movements.push({
            timestamp: curr.timestamp,
            sportsbook: curr.sportsbook,
            previousOdds: prev.odds,
            newOdds: curr.odds,
            movement: curr.odds - prev.odds
          });
        }
      }
    }

    return movements;
  }

  private detectSteamMoves(movements: LineMovement[]): SteamMove[] {
    // Placeholder implementation
    return [];
  }

  private calculateMarketEfficiency(oddsHistory: OddsData[]): number {
    // Placeholder - would calculate based on odds convergence
    return 0.85;
  }

  private calculateLiquidity(oddsHistory: OddsData[]): number {
    // Placeholder - would calculate based on volume and spread
    return 0.75;
  }

  private calculateTotalVolume(oddsHistory: OddsData[]): number {
    // Placeholder - would sum actual volume data
    return 100000;
  }

  private estimateSharpMoney(movements: LineMovement[]): number {
    // Placeholder - would analyze movement patterns
    return 60000;
  }

  private estimatePublicMoney(oddsHistory: OddsData[]): number {
    // Placeholder - would analyze public betting patterns
    return 40000;
  }

  private detectReverseLineMovement(movements: LineMovement[]): boolean {
    // Placeholder - would detect when line moves against public money
    return false;
  }

  private analyzeSentiment(movements: LineMovement[]): 'bullish' | 'bearish' | 'neutral' {
    // Placeholder - would analyze overall movement direction
    return 'neutral';
  }

  private initializeDefaultStrategies(): void {
    // Value betting strategy
    this.createStrategy({
      name: 'Value Betting',
      description: 'Identify bets with positive expected value',
      type: 'value',
      parameters: {
        minExpectedValue: 0.05,
        maxRiskPerBet: 0.02,
        minConfidence: 0.65,
        maxOdds: 5.0,
        minOdds: 1.5,
        bankrollPercentage: 0.01
      },
      filters: [
        {
          field: 'riskLevel',
          operator: 'in',
          value: ['low', 'medium'],
          description: 'Only low to medium risk bets'
        }
      ],
      isActive: true
    });

    // Conservative strategy
    this.createStrategy({
      name: 'Conservative',
      description: 'Low risk, steady returns',
      type: 'value',
      parameters: {
        minExpectedValue: 0.08,
        maxRiskPerBet: 0.01,
        minConfidence: 0.75,
        maxOdds: 3.0,
        minOdds: 1.8,
        bankrollPercentage: 0.005
      },
      filters: [
        {
          field: 'riskLevel',
          operator: 'eq',
          value: 'low',
          description: 'Only low risk bets'
        }
      ],
      isActive: true
    });
  }

  private generateStrategyId(): string {
    return `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const bettingAnalysisService = new BettingAnalysisService();