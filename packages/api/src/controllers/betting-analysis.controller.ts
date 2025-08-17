/**
 * BettingAnalysisController - REST API endpoints for betting analysis functionality
 */

import { Request, Response } from 'express';
import { bettingAnalysisService } from '../services/betting-analysis.service.js';
import { realTimeFeatureEngineeringService } from '../features/real-time-feature-engineering.service.js';

export class BettingAnalysisController {
  /**
   * Analyze value betting opportunities for a fight
   * POST /api/v1/betting/analyze/value
   */
  async analyzeValueBets(req: Request, res: Response): Promise<void> {
    try {
      const { fightData, oddsData, prediction } = req.body;

      if (!fightData || !oddsData || !prediction) {
        res.status(400).json({
          error: 'Missing required fields: fightData, oddsData, prediction'
        });
        return;
      }

      const valueBets = await bettingAnalysisService.analyzeValueBets(
        fightData,
        oddsData,
        prediction
      );

      res.json({
        success: true,
        data: {
          fightId: fightData.id,
          valueBets,
          count: valueBets.length,
          timestamp: new Date()
        }
      });

    } catch (error: any) {
      console.error('Error analyzing value bets:', error);
      res.status(500).json({
        error: 'Failed to analyze value bets',
        message: error.message
      });
    }
  }

  /**
   * Generate bankroll management recommendations
   * POST /api/v1/betting/bankroll/recommendations
   */
  async getBankrollRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const { totalBankroll, riskTolerance = 'moderate' } = req.body;

      if (!totalBankroll || totalBankroll <= 0) {
        res.status(400).json({
          error: 'Invalid totalBankroll. Must be a positive number.'
        });
        return;
      }

      if (!['conservative', 'moderate', 'aggressive'].includes(riskTolerance)) {
        res.status(400).json({
          error: 'Invalid riskTolerance. Must be conservative, moderate, or aggressive.'
        });
        return;
      }

      const recommendations = bettingAnalysisService.generateBankrollRecommendations(
        totalBankroll,
        riskTolerance
      );

      res.json({
        success: true,
        data: recommendations
      });

    } catch (error: any) {
      console.error('Error generating bankroll recommendations:', error);
      res.status(500).json({
        error: 'Failed to generate bankroll recommendations',
        message: error.message
      });
    }
  }

  /**
   * Calculate expected value for a bet
   * POST /api/v1/betting/calculate/expected-value
   */
  async calculateExpectedValue(req: Request, res: Response): Promise<void> {
    try {
      const { trueProbability, odds } = req.body;

      if (typeof trueProbability !== 'number' || trueProbability < 0 || trueProbability > 1) {
        res.status(400).json({
          error: 'Invalid trueProbability. Must be a number between 0 and 1.'
        });
        return;
      }

      if (typeof odds !== 'number' || odds <= 1) {
        res.status(400).json({
          error: 'Invalid odds. Must be a number greater than 1.'
        });
        return;
      }

      const calculation = bettingAnalysisService.calculateExpectedValue(
        trueProbability,
        odds
      );

      res.json({
        success: true,
        data: calculation
      });

    } catch (error: any) {
      console.error('Error calculating expected value:', error);
      res.status(500).json({
        error: 'Failed to calculate expected value',
        message: error.message
      });
    }
  }

  /**
   * Create a custom betting strategy
   * POST /api/v1/betting/strategies
   */
  async createStrategy(req: Request, res: Response): Promise<void> {
    try {
      const strategy = req.body;

      // Validate required fields
      const requiredFields = ['name', 'description', 'type', 'parameters'];
      for (const field of requiredFields) {
        if (!strategy[field]) {
          res.status(400).json({
            error: `Missing required field: ${field}`
          });
          return;
        }
      }

      const strategyId = bettingAnalysisService.createStrategy(strategy);

      res.status(201).json({
        success: true,
        data: {
          strategyId,
          message: 'Strategy created successfully'
        }
      });

    } catch (error: any) {
      console.error('Error creating strategy:', error);
      res.status(500).json({
        error: 'Failed to create strategy',
        message: error.message
      });
    }
  }

  /**
   * Apply betting strategies to find opportunities
   * POST /api/v1/betting/strategies/apply
   */
  async applyStrategies(req: Request, res: Response): Promise<void> {
    try {
      const { fightData, oddsData, prediction } = req.body;

      if (!fightData || !oddsData || !prediction) {
        res.status(400).json({
          error: 'Missing required fields: fightData, oddsData, prediction'
        });
        return;
      }

      const results = await bettingAnalysisService.applyStrategies(
        fightData,
        oddsData,
        prediction
      );

      res.json({
        success: true,
        data: {
          fightId: fightData.id,
          strategyResults: results,
          totalOpportunities: results.reduce((sum, r) => sum + r.opportunities.length, 0),
          timestamp: new Date()
        }
      });

    } catch (error: any) {
      console.error('Error applying strategies:', error);
      res.status(500).json({
        error: 'Failed to apply strategies',
        message: error.message
      });
    }
  }

  /**
   * Detect arbitrage opportunities
   * POST /api/v1/betting/analyze/arbitrage
   */
  async detectArbitrage(req: Request, res: Response): Promise<void> {
    try {
      const { fightData, oddsData } = req.body;

      if (!fightData || !oddsData) {
        res.status(400).json({
          error: 'Missing required fields: fightData, oddsData'
        });
        return;
      }

      const opportunities = bettingAnalysisService.detectArbitrageOpportunities(
        fightData,
        oddsData
      );

      res.json({
        success: true,
        data: {
          fightId: fightData.id,
          arbitrageOpportunities: opportunities,
          count: opportunities.length,
          timestamp: new Date()
        }
      });

    } catch (error: any) {
      console.error('Error detecting arbitrage:', error);
      res.status(500).json({
        error: 'Failed to detect arbitrage opportunities',
        message: error.message
      });
    }
  }

  /**
   * Get active betting strategies
   * GET /api/v1/betting/strategies
   */
  async getActiveStrategies(req: Request, res: Response): Promise<void> {
    try {
      const strategies = bettingAnalysisService.getActiveStrategies();

      res.json({
        success: true,
        data: {
          strategies,
          count: strategies.length
        }
      });

    } catch (error: any) {
      console.error('Error getting active strategies:', error);
      res.status(500).json({
        error: 'Failed to get active strategies',
        message: error.message
      });
    }
  }

  /**
   * Get strategy performance
   * GET /api/v1/betting/strategies/:strategyId/performance
   */
  async getStrategyPerformance(req: Request, res: Response): Promise<void> {
    try {
      const { strategyId } = req.params;

      if (!strategyId) {
        res.status(400).json({
          error: 'Missing strategyId parameter'
        });
        return;
      }

      const performance = bettingAnalysisService.getStrategyPerformance(strategyId);

      if (!performance) {
        res.status(404).json({
          error: 'Strategy not found'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          strategyId,
          performance
        }
      });

    } catch (error: any) {
      console.error('Error getting strategy performance:', error);
      res.status(500).json({
        error: 'Failed to get strategy performance',
        message: error.message
      });
    }
  }

  /**
   * Update strategy performance with bet result
   * POST /api/v1/betting/strategies/:strategyId/performance
   */
  async updateStrategyPerformance(req: Request, res: Response): Promise<void> {
    try {
      const { strategyId } = req.params;
      const { won, stake, payout, odds } = req.body;

      if (!strategyId) {
        res.status(400).json({
          error: 'Missing strategyId parameter'
        });
        return;
      }

      const requiredFields = ['won', 'stake', 'payout', 'odds'];
      for (const field of requiredFields) {
        if (req.body[field] === undefined) {
          res.status(400).json({
            error: `Missing required field: ${field}`
          });
          return;
        }
      }

      bettingAnalysisService.updateStrategyPerformance(strategyId, {
        won: Boolean(won),
        stake: Number(stake),
        payout: Number(payout),
        odds: Number(odds)
      });

      res.json({
        success: true,
        data: {
          message: 'Strategy performance updated successfully'
        }
      });

    } catch (error: any) {
      console.error('Error updating strategy performance:', error);
      res.status(500).json({
        error: 'Failed to update strategy performance',
        message: error.message
      });
    }
  }

  /**
   * Extract and engineer features for betting analysis
   * POST /api/v1/betting/features/extract
   */
  async extractFeatures(req: Request, res: Response): Promise<void> {
    try {
      const { fightData, fighter1Data, fighter2Data, oddsData, contextData } = req.body;

      if (!fightData || !fighter1Data || !fighter2Data || !oddsData) {
        res.status(400).json({
          error: 'Missing required fields: fightData, fighter1Data, fighter2Data, oddsData'
        });
        return;
      }

      const engineering = await realTimeFeatureEngineeringService.extractFeatures(
        fightData,
        fighter1Data,
        fighter2Data,
        oddsData,
        contextData
      );

      res.json({
        success: true,
        data: {
          fightId: fightData.id,
          engineering,
          timestamp: new Date()
        }
      });

    } catch (error: any) {
      console.error('Error extracting features:', error);
      res.status(500).json({
        error: 'Failed to extract features',
        message: error.message
      });
    }
  }

  /**
   * Get cached features for a fight
   * GET /api/v1/betting/features/:fightId
   */
  async getCachedFeatures(req: Request, res: Response): Promise<void> {
    try {
      const { fightId } = req.params;

      if (!fightId) {
        res.status(400).json({
          error: 'Missing fightId parameter'
        });
        return;
      }

      const features = realTimeFeatureEngineeringService.getCachedFeatures(fightId);

      if (!features) {
        res.status(404).json({
          error: 'Features not found for this fight'
        });
        return;
      }

      res.json({
        success: true,
        data: features
      });

    } catch (error: any) {
      console.error('Error getting cached features:', error);
      res.status(500).json({
        error: 'Failed to get cached features',
        message: error.message
      });
    }
  }

  /**
   * Get feature importance scores
   * GET /api/v1/betting/features/importance
   */
  async getFeatureImportance(req: Request, res: Response): Promise<void> {
    try {
      const importance = realTimeFeatureEngineeringService.getFeatureImportance();

      res.json({
        success: true,
        data: {
          featureImportance: Object.fromEntries(importance),
          count: importance.size
        }
      });

    } catch (error: any) {
      console.error('Error getting feature importance:', error);
      res.status(500).json({
        error: 'Failed to get feature importance',
        message: error.message
      });
    }
  }

  /**
   * Analyze market efficiency and movements
   * POST /api/v1/betting/analyze/market
   */
  async analyzeMarket(req: Request, res: Response): Promise<void> {
    try {
      const { fightId, oddsHistory } = req.body;

      if (!fightId || !oddsHistory) {
        res.status(400).json({
          error: 'Missing required fields: fightId, oddsHistory'
        });
        return;
      }

      const analysis = bettingAnalysisService.analyzeMarket(fightId, oddsHistory);

      res.json({
        success: true,
        data: analysis
      });

    } catch (error: any) {
      console.error('Error analyzing market:', error);
      res.status(500).json({
        error: 'Failed to analyze market',
        message: error.message
      });
    }
  }
}

// Export singleton instance
export const bettingAnalysisController = new BettingAnalysisController();