import { Request, Response } from 'express';
import { FighterAnalyticsService } from '../services/fighter-analytics.service.js';

export class FighterAnalyticsController {
  private analyticsService: FighterAnalyticsService;

  constructor(analyticsService?: FighterAnalyticsService) {
    this.analyticsService = analyticsService || new FighterAnalyticsService();
  }

  /**
   * GET /api/fighters/:fighterId/analytics
   * Get comprehensive analytics for a fighter
   */
  public async getFighterAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId } = req.params;

      if (!fighterId) {
        res.status(400).json({
          success: false,
          error: 'Fighter ID is required'
        });
        return;
      }

      const analytics = await this.analyticsService.getFighterAnalytics(fighterId);

      res.json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      if (error.message.includes('Fighter not found')) {
        res.status(404).json({
          success: false,
          error: 'Fighter not found',
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get fighter analytics',
          message: error.message
        });
      }
    }
  }

  /**
   * GET /api/fighters/:fighterId/performance
   * Get recent performance metrics for a fighter
   */
  public async getFighterPerformance(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId } = req.params;

      if (!fighterId) {
        res.status(400).json({
          success: false,
          error: 'Fighter ID is required'
        });
        return;
      }

      const analytics = await this.analyticsService.getFighterAnalytics(fighterId);

      res.json({
        success: true,
        data: {
          fighterId: analytics.fighterId,
          fighterName: analytics.fighterName,
          recentPerformance: analytics.recentPerformance,
          lastUpdated: analytics.lastUpdated
        }
      });
    } catch (error: any) {
      if (error.message.includes('Fighter not found')) {
        res.status(404).json({
          success: false,
          error: 'Fighter not found',
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get fighter performance',
          message: error.message
        });
      }
    }
  }

  /**
   * GET /api/fighters/:fighterId/trends
   * Get historical trends for a fighter
   */
  public async getFighterTrends(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId } = req.params;

      if (!fighterId) {
        res.status(400).json({
          success: false,
          error: 'Fighter ID is required'
        });
        return;
      }

      const analytics = await this.analyticsService.getFighterAnalytics(fighterId);

      res.json({
        success: true,
        data: {
          fighterId: analytics.fighterId,
          fighterName: analytics.fighterName,
          historicalTrends: analytics.historicalTrends,
          lastUpdated: analytics.lastUpdated
        }
      });
    } catch (error: any) {
      if (error.message.includes('Fighter not found')) {
        res.status(404).json({
          success: false,
          error: 'Fighter not found',
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get fighter trends',
          message: error.message
        });
      }
    }
  }

  /**
   * GET /api/fighters/:fighterId/prediction-factors
   * Get prediction factors for a fighter
   */
  public async getFighterPredictionFactors(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId } = req.params;

      if (!fighterId) {
        res.status(400).json({
          success: false,
          error: 'Fighter ID is required'
        });
        return;
      }

      const analytics = await this.analyticsService.getFighterAnalytics(fighterId);

      res.json({
        success: true,
        data: {
          fighterId: analytics.fighterId,
          fighterName: analytics.fighterName,
          predictionFactors: analytics.predictionFactors,
          injuryReports: analytics.injuryReports,
          lastUpdated: analytics.lastUpdated
        }
      });
    } catch (error: any) {
      if (error.message.includes('Fighter not found')) {
        res.status(404).json({
          success: false,
          error: 'Fighter not found',
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get fighter prediction factors',
          message: error.message
        });
      }
    }
  }

  /**
   * GET /api/fighters/:fighterId/training-camp
   * Get training camp information for a fighter
   */
  public async getFighterTrainingCamp(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId } = req.params;

      if (!fighterId) {
        res.status(400).json({
          success: false,
          error: 'Fighter ID is required'
        });
        return;
      }

      const analytics = await this.analyticsService.getFighterAnalytics(fighterId);

      res.json({
        success: true,
        data: {
          fighterId: analytics.fighterId,
          fighterName: analytics.fighterName,
          trainingCampInfo: analytics.trainingCampInfo,
          lastUpdated: analytics.lastUpdated
        }
      });
    } catch (error: any) {
      if (error.message.includes('Fighter not found')) {
        res.status(404).json({
          success: false,
          error: 'Fighter not found',
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get fighter training camp info',
          message: error.message
        });
      }
    }
  }

  /**
   * POST /api/fighters/compare
   * Compare two fighters for matchup analysis
   */
  public async compareFighters(req: Request, res: Response): Promise<void> {
    try {
      const { fighter1Id, fighter2Id } = req.body;

      if (!fighter1Id || !fighter2Id) {
        res.status(400).json({
          success: false,
          error: 'Both fighter1Id and fighter2Id are required'
        });
        return;
      }

      if (fighter1Id === fighter2Id) {
        res.status(400).json({
          success: false,
          error: 'Cannot compare a fighter with themselves'
        });
        return;
      }

      const comparison = await this.analyticsService.compareFighters(fighter1Id, fighter2Id);

      res.json({
        success: true,
        data: comparison
      });
    } catch (error: any) {
      if (error.message.includes('Fighter not found')) {
        res.status(404).json({
          success: false,
          error: 'One or both fighters not found',
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to compare fighters',
          message: error.message
        });
      }
    }
  }

  /**
   * GET /api/fighters/compare/:fighter1Id/:fighter2Id
   * Alternative endpoint for fighter comparison using URL parameters
   */
  public async compareFightersParams(req: Request, res: Response): Promise<void> {
    try {
      const { fighter1Id, fighter2Id } = req.params;

      if (!fighter1Id || !fighter2Id) {
        res.status(400).json({
          success: false,
          error: 'Both fighter IDs are required'
        });
        return;
      }

      if (fighter1Id === fighter2Id) {
        res.status(400).json({
          success: false,
          error: 'Cannot compare a fighter with themselves'
        });
        return;
      }

      const comparison = await this.analyticsService.compareFighters(fighter1Id, fighter2Id);

      res.json({
        success: true,
        data: comparison
      });
    } catch (error: any) {
      if (error.message.includes('Fighter not found')) {
        res.status(404).json({
          success: false,
          error: 'One or both fighters not found',
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to compare fighters',
          message: error.message
        });
      }
    }
  }

  /**
   * GET /api/fighters/:fighterId/matchup-preview/:opponentId
   * Get a quick matchup preview between two fighters
   */
  public async getMatchupPreview(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId, opponentId } = req.params;

      if (!fighterId || !opponentId) {
        res.status(400).json({
          success: false,
          error: 'Both fighter ID and opponent ID are required'
        });
        return;
      }

      const comparison = await this.analyticsService.compareFighters(fighterId, opponentId);

      // Return a simplified preview
      res.json({
        success: true,
        data: {
          fighter1: {
            id: comparison.fighter1.fighterId,
            name: comparison.fighter1.fighterName,
            formTrend: comparison.fighter1.predictionFactors.formTrend,
            winRate: comparison.fighter1.recentPerformance.winRate,
            finishRate: comparison.fighter1.recentPerformance.finishRate
          },
          fighter2: {
            id: comparison.fighter2.fighterId,
            name: comparison.fighter2.fighterName,
            formTrend: comparison.fighter2.predictionFactors.formTrend,
            winRate: comparison.fighter2.recentPerformance.winRate,
            finishRate: comparison.fighter2.recentPerformance.finishRate
          },
          matchupAnalysis: {
            keyFactors: comparison.matchupAnalysis.keyFactors,
            prediction: comparison.matchupAnalysis.prediction
          }
        }
      });
    } catch (error: any) {
      if (error.message.includes('Fighter not found')) {
        res.status(404).json({
          success: false,
          error: 'One or both fighters not found',
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get matchup preview',
          message: error.message
        });
      }
    }
  }

  /**
   * GET /api/fighters/:fighterId/injury-report
   * Get injury reports for a fighter
   */
  public async getFighterInjuryReport(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId } = req.params;

      if (!fighterId) {
        res.status(400).json({
          success: false,
          error: 'Fighter ID is required'
        });
        return;
      }

      const analytics = await this.analyticsService.getFighterAnalytics(fighterId);

      res.json({
        success: true,
        data: {
          fighterId: analytics.fighterId,
          fighterName: analytics.fighterName,
          injuryReports: analytics.injuryReports,
          injuryRisk: analytics.predictionFactors.injuryRisk,
          lastUpdated: analytics.lastUpdated
        }
      });
    } catch (error: any) {
      if (error.message.includes('Fighter not found')) {
        res.status(404).json({
          success: false,
          error: 'Fighter not found',
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get fighter injury report',
          message: error.message
        });
      }
    }
  }

  /**
   * GET /api/fighters/:fighterId/form-analysis
   * Get detailed form analysis for a fighter
   */
  public async getFighterFormAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId } = req.params;
      const { fights = 5 } = req.query;

      if (!fighterId) {
        res.status(400).json({
          success: false,
          error: 'Fighter ID is required'
        });
        return;
      }

      const analytics = await this.analyticsService.getFighterAnalytics(fighterId);

      // Get the requested number of recent fights
      const numFights = Math.min(parseInt(fights as string) || 5, 10);
      const recentFights = analytics.recentPerformance.last5Fights.slice(0, numFights);

      res.json({
        success: true,
        data: {
          fighterId: analytics.fighterId,
          fighterName: analytics.fighterName,
          formTrend: analytics.predictionFactors.formTrend,
          recentFights,
          performanceMetrics: {
            winRate: analytics.recentPerformance.winRate,
            finishRate: analytics.recentPerformance.finishRate,
            averageFightTime: analytics.recentPerformance.averageFightTime,
            strikingAccuracy: analytics.recentPerformance.strikingAccuracy
          },
          consistencyScore: analytics.historicalTrends.consistencyScore,
          lastUpdated: analytics.lastUpdated
        }
      });
    } catch (error: any) {
      if (error.message.includes('Fighter not found')) {
        res.status(404).json({
          success: false,
          error: 'Fighter not found',
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get fighter form analysis',
          message: error.message
        });
      }
    }
  }
}