/**
 * OddsController - REST API endpoints for current and historical odds data
 */

import { Request, Response } from 'express';
import { OddsRepository } from '../repositories/odds.repository.js';
import { DatabaseManager } from '../database/manager.js';

export interface OddsMovement {
  id: string;
  fightId: string;
  sportsbook: string;
  timestamp: Date;
  oldOdds: OddsSnapshot;
  newOdds: OddsSnapshot;
  percentageChange: number;
  movementType: 'significant' | 'reverse' | 'steam' | 'minor';
  significance: 'high' | 'medium' | 'low';
}

export interface OddsSnapshot {
  timestamp: Date;
  sportsbook: string;
  moneyline: {
    fighter1: number;
    fighter2: number;
  };
  method?: {
    ko: number;
    submission: number;
    decision: number;
  };
  rounds?: {
    under2_5: number;
    over2_5: number;
  };
  impliedProbability: {
    fighter1: number;
    fighter2: number;
  };
}

export interface ArbitrageOpportunity {
  id: string;
  fightId: string;
  timestamp: Date;
  profitMargin: number;
  sportsbooks: Array<{
    name: string;
    fighter: 'fighter1' | 'fighter2';
    odds: number;
    stake: number;
  }>;
  totalStake: number;
  guaranteedProfit: number;
  expiresAt: Date;
}

export interface MarketAnalysis {
  fightId: string;
  consensus: {
    fighter1Probability: number;
    fighter2Probability: number;
    confidence: number;
  };
  marketEfficiency: {
    score: number; // 0-1, higher is more efficient
    spread: number;
    volatility: number;
  };
  valueOpportunities: Array<{
    sportsbook: string;
    fighter: 'fighter1' | 'fighter2';
    odds: number;
    impliedProbability: number;
    expectedValue: number;
    confidence: 'high' | 'medium' | 'low';
  }>;
  movements: OddsMovement[];
  arbitrage: ArbitrageOpportunity[];
}

export class OddsController {
  private oddsRepository: OddsRepository;

  constructor(dbManager: DatabaseManager) {
    this.oddsRepository = new OddsRepository(dbManager);
  }

  /**
   * Get current odds for a fight
   * GET /api/v1/odds/:fightId/current
   */
  async getCurrentOdds(req: Request, res: Response): Promise<void> {
    try {
      const { fightId } = req.params;
      const { sportsbooks } = req.query;

      if (!fightId || typeof fightId !== 'string') {
        res.status(400).json({
          error: 'Invalid fight ID',
          message: 'Fight ID must be a valid string'
        });
        return;
      }

      const sportsbookFilter = sportsbooks 
        ? (sportsbooks as string).split(',').map(s => s.trim())
        : undefined;

      const currentOdds = await this.oddsRepository.getLatestOdds(fightId, sportsbookFilter);

      if (currentOdds.length === 0) {
        res.status(404).json({
          error: 'No odds found',
          message: `No current odds found for fight: ${fightId}`
        });
        return;
      }

      res.json({
        fightId,
        odds: currentOdds,
        timestamp: new Date(),
        count: currentOdds.length
      });

    } catch (error) {
      console.error('Error retrieving current odds:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve current odds'
      });
    }
  }

  /**
   * Get historical odds for a fight
   * GET /api/v1/odds/:fightId/history
   */
  async getOddsHistory(req: Request, res: Response): Promise<void> {
    try {
      const { fightId } = req.params;
      const { 
        sportsbook,
        startDate,
        endDate,
        interval = '1h',
        limit = '100'
      } = req.query;

      if (!fightId || typeof fightId !== 'string') {
        res.status(400).json({
          error: 'Invalid fight ID',
          message: 'Fight ID must be a valid string'
        });
        return;
      }

      const limitNum = parseInt(limit as string, 10);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
        res.status(400).json({
          error: 'Invalid limit',
          message: 'Limit must be between 1 and 1000'
        });
        return;
      }

      const validIntervals = ['5m', '15m', '30m', '1h', '4h', '12h', '1d'];
      if (!validIntervals.includes(interval as string)) {
        res.status(400).json({
          error: 'Invalid interval',
          message: `Valid intervals: ${validIntervals.join(', ')}`
        });
        return;
      }

      const filters = {
        sportsbook: sportsbook as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        interval: interval as string,
        limit: limitNum
      };

      const history = await this.oddsRepository.getOddsHistory(fightId, filters);

      res.json({
        fightId,
        history,
        filters,
        timestamp: new Date(),
        count: history.length
      });

    } catch (error) {
      console.error('Error retrieving odds history:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve odds history'
      });
    }
  }

  /**
   * Get odds movements for a fight
   * GET /api/v1/odds/:fightId/movements
   */
  async getOddsMovements(req: Request, res: Response): Promise<void> {
    try {
      const { fightId } = req.params;
      const { 
        minChange = '2',
        timeRange = '24',
        movementType,
        sportsbook
      } = req.query;

      if (!fightId || typeof fightId !== 'string') {
        res.status(400).json({
          error: 'Invalid fight ID',
          message: 'Fight ID must be a valid string'
        });
        return;
      }

      const minChangeNum = parseFloat(minChange as string);
      const timeRangeNum = parseInt(timeRange as string, 10);

      if (isNaN(minChangeNum) || minChangeNum < 0 || minChangeNum > 50) {
        res.status(400).json({
          error: 'Invalid minimum change',
          message: 'Minimum change must be between 0 and 50 percent'
        });
        return;
      }

      if (isNaN(timeRangeNum) || timeRangeNum < 1 || timeRangeNum > 168) {
        res.status(400).json({
          error: 'Invalid time range',
          message: 'Time range must be between 1 and 168 hours'
        });
        return;
      }

      const validMovementTypes = ['significant', 'reverse', 'steam', 'minor'];
      if (movementType && !validMovementTypes.includes(movementType as string)) {
        res.status(400).json({
          error: 'Invalid movement type',
          message: `Valid movement types: ${validMovementTypes.join(', ')}`
        });
        return;
      }

      const filters = {
        minChange: minChangeNum,
        timeRange: timeRangeNum,
        movementType: movementType as string,
        sportsbook: sportsbook as string
      };

      const movements = await this.detectOddsMovements(fightId, filters);

      res.json({
        fightId,
        movements,
        filters,
        timestamp: new Date(),
        count: movements.length
      });

    } catch (error) {
      console.error('Error detecting odds movements:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to detect odds movements'
      });
    }
  }

  /**
   * Get market analysis for a fight
   * GET /api/v1/odds/:fightId/analysis
   */
  async getMarketAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { fightId } = req.params;
      const { includeArbitrage = 'true' } = req.query;

      if (!fightId || typeof fightId !== 'string') {
        res.status(400).json({
          error: 'Invalid fight ID',
          message: 'Fight ID must be a valid string'
        });
        return;
      }

      const analysis = await this.generateMarketAnalysis(fightId, includeArbitrage === 'true');

      if (!analysis) {
        res.status(404).json({
          error: 'No market data found',
          message: `No market data available for fight: ${fightId}`
        });
        return;
      }

      res.json({
        analysis,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error generating market analysis:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to generate market analysis'
      });
    }
  }

  /**
   * Get arbitrage opportunities
   * GET /api/v1/odds/arbitrage
   */
  async getArbitrageOpportunities(req: Request, res: Response): Promise<void> {
    try {
      const { 
        minProfit = '1',
        maxStake = '1000',
        active = 'true',
        limit = '20'
      } = req.query;

      const minProfitNum = parseFloat(minProfit as string);
      const maxStakeNum = parseFloat(maxStake as string);
      const limitNum = parseInt(limit as string, 10);

      if (isNaN(minProfitNum) || minProfitNum < 0 || minProfitNum > 20) {
        res.status(400).json({
          error: 'Invalid minimum profit',
          message: 'Minimum profit must be between 0 and 20 percent'
        });
        return;
      }

      if (isNaN(maxStakeNum) || maxStakeNum < 10 || maxStakeNum > 10000) {
        res.status(400).json({
          error: 'Invalid maximum stake',
          message: 'Maximum stake must be between 10 and 10000'
        });
        return;
      }

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        res.status(400).json({
          error: 'Invalid limit',
          message: 'Limit must be between 1 and 100'
        });
        return;
      }

      const filters = {
        minProfit: minProfitNum,
        maxStake: maxStakeNum,
        active: active === 'true',
        limit: limitNum
      };

      const opportunities = await this.findArbitrageOpportunities(filters);

      res.json({
        opportunities,
        filters,
        timestamp: new Date(),
        count: opportunities.length
      });

    } catch (error) {
      console.error('Error finding arbitrage opportunities:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to find arbitrage opportunities'
      });
    }
  }

  /**
   * Get odds comparison across sportsbooks
   * GET /api/v1/odds/:fightId/compare
   */
  async compareOdds(req: Request, res: Response): Promise<void> {
    try {
      const { fightId } = req.params;
      const { sportsbooks } = req.query;

      if (!fightId || typeof fightId !== 'string') {
        res.status(400).json({
          error: 'Invalid fight ID',
          message: 'Fight ID must be a valid string'
        });
        return;
      }

      const sportsbookList = sportsbooks 
        ? (sportsbooks as string).split(',').map(s => s.trim())
        : undefined;

      const comparison = await this.generateOddsComparison(fightId, sportsbookList);

      if (!comparison) {
        res.status(404).json({
          error: 'No odds found',
          message: `No odds available for comparison for fight: ${fightId}`
        });
        return;
      }

      res.json({
        fightId,
        comparison,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error comparing odds:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to compare odds'
      });
    }
  }

  /**
   * Detect odds movements for a fight
   */
  private async detectOddsMovements(fightId: string, filters: any): Promise<OddsMovement[]> {
    // Simplified implementation - would analyze actual odds history
    const movements: OddsMovement[] = [];

    // Generate sample movements
    const sportsbooks = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars'];
    
    for (let i = 0; i < Math.min(5, Math.random() * 8); i++) {
      const sportsbook = sportsbooks[Math.floor(Math.random() * sportsbooks.length)];
      const percentageChange = (Math.random() - 0.5) * 20; // -10% to +10%
      
      if (Math.abs(percentageChange) >= filters.minChange) {
        const timestamp = new Date();
        timestamp.setHours(timestamp.getHours() - Math.random() * filters.timeRange);

        movements.push({
          id: `movement-${fightId}-${i}`,
          fightId,
          sportsbook,
          timestamp,
          oldOdds: {
            timestamp: new Date(timestamp.getTime() - 60000),
            sportsbook,
            moneyline: { fighter1: -150, fighter2: +130 },
            impliedProbability: { fighter1: 0.6, fighter2: 0.43 }
          },
          newOdds: {
            timestamp,
            sportsbook,
            moneyline: { fighter1: -140, fighter2: +120 },
            impliedProbability: { fighter1: 0.58, fighter2: 0.45 }
          },
          percentageChange: Math.abs(percentageChange),
          movementType: Math.abs(percentageChange) > 5 ? 'significant' : 'minor',
          significance: Math.abs(percentageChange) > 8 ? 'high' : Math.abs(percentageChange) > 4 ? 'medium' : 'low'
        });
      }
    }

    return movements.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Generate market analysis for a fight
   */
  private async generateMarketAnalysis(fightId: string, includeArbitrage: boolean): Promise<MarketAnalysis | null> {
    try {
      // Get current odds from multiple sportsbooks
      const currentOdds = await this.oddsRepository.getLatestOdds(fightId);
      
      if (currentOdds.length === 0) {
        return null;
      }

      // Calculate consensus probabilities
      const totalWeight = currentOdds.length;
      const fighter1ProbSum = currentOdds.reduce((sum, odds) => sum + odds.impliedProbability.fighter1, 0);
      const fighter2ProbSum = currentOdds.reduce((sum, odds) => sum + odds.impliedProbability.fighter2, 0);

      const consensus = {
        fighter1Probability: fighter1ProbSum / totalWeight,
        fighter2Probability: fighter2ProbSum / totalWeight,
        confidence: this.calculateConsensusConfidence(currentOdds)
      };

      // Calculate market efficiency
      const marketEfficiency = this.calculateMarketEfficiency(currentOdds);

      // Find value opportunities
      const valueOpportunities = this.findValueOpportunities(currentOdds, consensus);

      // Get recent movements
      const movements = await this.detectOddsMovements(fightId, {
        minChange: 2,
        timeRange: 24,
        movementType: undefined,
        sportsbook: undefined
      });

      // Find arbitrage opportunities if requested
      const arbitrage = includeArbitrage 
        ? await this.findArbitrageOpportunities({ minProfit: 1, maxStake: 1000, active: true, limit: 10 })
        : [];

      return {
        fightId,
        consensus,
        marketEfficiency,
        valueOpportunities,
        movements,
        arbitrage: arbitrage.filter(arb => arb.fightId === fightId)
      };

    } catch (error) {
      console.error('Error generating market analysis:', error);
      return null;
    }
  }

  /**
   * Calculate consensus confidence
   */
  private calculateConsensusConfidence(odds: any[]): number {
    if (odds.length < 2) return 0.5;

    // Calculate standard deviation of implied probabilities
    const fighter1Probs = odds.map(o => o.impliedProbability.fighter1);
    const mean = fighter1Probs.reduce((sum, p) => sum + p, 0) / fighter1Probs.length;
    const variance = fighter1Probs.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / fighter1Probs.length;
    const stdDev = Math.sqrt(variance);

    // Lower standard deviation = higher confidence
    return Math.max(0.1, Math.min(1.0, 1 - (stdDev * 4)));
  }

  /**
   * Calculate market efficiency metrics
   */
  private calculateMarketEfficiency(odds: any[]): any {
    if (odds.length < 2) {
      return { score: 0.5, spread: 0, volatility: 0 };
    }

    // Calculate spread (difference between best and worst odds)
    const fighter1Odds = odds.map(o => o.moneyline.fighter1);
    const maxOdds = Math.max(...fighter1Odds);
    const minOdds = Math.min(...fighter1Odds);
    const spread = Math.abs(maxOdds - minOdds);

    // Calculate volatility (standard deviation of odds)
    const mean = fighter1Odds.reduce((sum, o) => sum + o, 0) / fighter1Odds.length;
    const variance = fighter1Odds.reduce((sum, o) => sum + Math.pow(o - mean, 2), 0) / fighter1Odds.length;
    const volatility = Math.sqrt(variance);

    // Efficiency score (lower spread and volatility = higher efficiency)
    const normalizedSpread = Math.min(1, spread / 100);
    const normalizedVolatility = Math.min(1, volatility / 50);
    const score = Math.max(0, 1 - (normalizedSpread + normalizedVolatility) / 2);

    return { score, spread, volatility };
  }

  /**
   * Find value opportunities
   */
  private findValueOpportunities(odds: any[], consensus: any): any[] {
    const opportunities = [];

    for (const oddsData of odds) {
      // Check fighter 1
      const fighter1ExpectedValue = this.calculateExpectedValue(
        oddsData.moneyline.fighter1,
        consensus.fighter1Probability
      );

      if (fighter1ExpectedValue > 0.05) { // 5% edge
        opportunities.push({
          sportsbook: oddsData.sportsbook,
          fighter: 'fighter1',
          odds: oddsData.moneyline.fighter1,
          impliedProbability: oddsData.impliedProbability.fighter1,
          expectedValue: fighter1ExpectedValue,
          confidence: fighter1ExpectedValue > 0.15 ? 'high' : fighter1ExpectedValue > 0.08 ? 'medium' : 'low'
        });
      }

      // Check fighter 2
      const fighter2ExpectedValue = this.calculateExpectedValue(
        oddsData.moneyline.fighter2,
        consensus.fighter2Probability
      );

      if (fighter2ExpectedValue > 0.05) {
        opportunities.push({
          sportsbook: oddsData.sportsbook,
          fighter: 'fighter2',
          odds: oddsData.moneyline.fighter2,
          impliedProbability: oddsData.impliedProbability.fighter2,
          expectedValue: fighter2ExpectedValue,
          confidence: fighter2ExpectedValue > 0.15 ? 'high' : fighter2ExpectedValue > 0.08 ? 'medium' : 'low'
        });
      }
    }

    return opportunities.sort((a, b) => b.expectedValue - a.expectedValue);
  }

  /**
   * Calculate expected value
   */
  private calculateExpectedValue(odds: number, trueProbability: number): number {
    const impliedProbability = odds > 0 
      ? 100 / (odds + 100)
      : Math.abs(odds) / (Math.abs(odds) + 100);

    const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
    
    return (trueProbability * payout) - (1 - trueProbability) - impliedProbability;
  }

  /**
   * Find arbitrage opportunities
   */
  private async findArbitrageOpportunities(filters: any): Promise<ArbitrageOpportunity[]> {
    // Simplified implementation - would analyze all current odds
    const opportunities: ArbitrageOpportunity[] = [];

    // Generate sample arbitrage opportunities
    for (let i = 0; i < Math.min(filters.limit, 3); i++) {
      const profitMargin = Math.random() * 5 + 1; // 1-6% profit
      
      if (profitMargin >= filters.minProfit) {
        const totalStake = Math.random() * (filters.maxStake - 100) + 100;
        const guaranteedProfit = totalStake * (profitMargin / 100);

        opportunities.push({
          id: `arbitrage-${i}`,
          fightId: `fight-${i}`,
          timestamp: new Date(),
          profitMargin,
          sportsbooks: [
            {
              name: 'DraftKings',
              fighter: 'fighter1',
              odds: -120,
              stake: totalStake * 0.55
            },
            {
              name: 'FanDuel',
              fighter: 'fighter2',
              odds: +150,
              stake: totalStake * 0.45
            }
          ],
          totalStake,
          guaranteedProfit,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
        });
      }
    }

    return opportunities.sort((a, b) => b.profitMargin - a.profitMargin);
  }

  /**
   * Generate odds comparison
   */
  private async generateOddsComparison(fightId: string, sportsbooks?: string[]): Promise<any> {
    const currentOdds = await this.oddsRepository.getLatestOdds(fightId, sportsbooks);
    
    if (currentOdds.length === 0) {
      return null;
    }

    // Find best odds for each fighter
    const fighter1BestOdds = currentOdds.reduce((best, current) => 
      current.moneyline.fighter1 > best.moneyline.fighter1 ? current : best
    );

    const fighter2BestOdds = currentOdds.reduce((best, current) => 
      current.moneyline.fighter2 > best.moneyline.fighter2 ? current : best
    );

    // Calculate market summary
    const fighter1Odds = currentOdds.map(o => o.moneyline.fighter1);
    const fighter2Odds = currentOdds.map(o => o.moneyline.fighter2);

    return {
      summary: {
        totalSportsbooks: currentOdds.length,
        fighter1: {
          bestOdds: fighter1BestOdds.moneyline.fighter1,
          bestSportsbook: fighter1BestOdds.sportsbook,
          averageOdds: fighter1Odds.reduce((sum, o) => sum + o, 0) / fighter1Odds.length,
          range: {
            min: Math.min(...fighter1Odds),
            max: Math.max(...fighter1Odds)
          }
        },
        fighter2: {
          bestOdds: fighter2BestOdds.moneyline.fighter2,
          bestSportsbook: fighter2BestOdds.sportsbook,
          averageOdds: fighter2Odds.reduce((sum, o) => sum + o, 0) / fighter2Odds.length,
          range: {
            min: Math.min(...fighter2Odds),
            max: Math.max(...fighter2Odds)
          }
        }
      },
      sportsbooks: currentOdds.map(odds => ({
        name: odds.sportsbook,
        timestamp: odds.timestamp,
        moneyline: odds.moneyline,
        impliedProbability: odds.impliedProbability
      }))
    };
  }
}