/**
 * FighterController - REST API endpoints for fighter profile data and statistics
 */

import { Request, Response } from 'express';
import { FighterRepository } from '../repositories/fighter.repository.js';
import { MetricsCalculator } from '../features/metrics-calculator.js';
import { DatabaseManager } from '../database/manager.js';

export interface FighterAnalytics {
  profile: any;
  metrics: any;
  trends: TrendAnalysis;
  recentPerformance: PerformanceData[];
  rankings: RankingData;
}

export interface TrendAnalysis {
  strikingAccuracyTrend: TrendData;
  takedownDefenseTrend: TrendData;
  finishRateTrend: TrendData;
  activityTrend: TrendData;
  overallTrend: 'improving' | 'declining' | 'stable';
}

export interface TrendData {
  direction: 'up' | 'down' | 'stable';
  percentage: number;
  dataPoints: Array<{ date: Date; value: number }>;
  significance: 'high' | 'medium' | 'low';
}

export interface PerformanceData {
  fightId: string;
  opponent: string;
  date: Date;
  result: 'win' | 'loss' | 'draw';
  method: string;
  round: number;
  metrics: {
    strikesLanded: number;
    strikesAttempted: number;
    takedownsLanded: number;
    takedownsAttempted: number;
    controlTime: number;
  };
}

export interface RankingData {
  current: {
    weightClass: string;
    rank?: number;
    p4pRank?: number;
  };
  history: Array<{
    date: Date;
    weightClass: string;
    rank: number;
    change: number;
  }>;
}

export interface FighterComparison {
  fighter1: FighterAnalytics;
  fighter2: FighterAnalytics;
  comparison: {
    advantages: {
      fighter1: string[];
      fighter2: string[];
    };
    keyDifferences: Array<{
      metric: string;
      fighter1Value: number;
      fighter2Value: number;
      significance: 'high' | 'medium' | 'low';
      description: string;
    }>;
    overallAssessment: string;
  };
}

export class FighterController {
  private fighterRepository: FighterRepository;
  private metricsCalculator: MetricsCalculator;

  constructor(dbManager: DatabaseManager) {
    this.fighterRepository = new FighterRepository(dbManager);
    this.metricsCalculator = new MetricsCalculator();
  }

  /**
   * Get fighter profile and basic statistics
   * GET /api/v1/fighters/:fighterId
   */
  async getFighterProfile(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId } = req.params;

      if (!fighterId || typeof fighterId !== 'string') {
        res.status(400).json({
          error: 'Invalid fighter ID',
          message: 'Fighter ID must be a valid string'
        });
        return;
      }

      const fighter = await this.fighterRepository.findById(fighterId);
      if (!fighter) {
        res.status(404).json({
          error: 'Fighter not found',
          message: `No fighter found with ID: ${fighterId}`
        });
        return;
      }

      // Get basic metrics
      const metrics = await this.metricsCalculator.calculateFighterMetrics(fighterId);

      res.json({
        profile: fighter,
        metrics,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving fighter profile:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve fighter profile'
      });
    }
  }

  /**
   * Get comprehensive fighter analytics
   * GET /api/v1/fighters/:fighterId/analytics
   */
  async getFighterAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId } = req.params;
      const { timeRange = '365' } = req.query; // Days

      const timeRangeDays = parseInt(timeRange as string, 10);
      if (isNaN(timeRangeDays) || timeRangeDays < 1 || timeRangeDays > 3650) {
        res.status(400).json({
          error: 'Invalid time range',
          message: 'Time range must be between 1 and 3650 days'
        });
        return;
      }

      const fighter = await this.fighterRepository.findById(fighterId);
      if (!fighter) {
        res.status(404).json({
          error: 'Fighter not found',
          message: `No fighter found with ID: ${fighterId}`
        });
        return;
      }

      const analytics = await this.generateFighterAnalytics(fighterId, timeRangeDays);

      res.json({
        analytics,
        timeRange: timeRangeDays,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error generating fighter analytics:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to generate fighter analytics'
      });
    }
  }

  /**
   * Compare two fighters side-by-side
   * GET /api/v1/fighters/compare/:fighter1Id/:fighter2Id
   */
  async compareFighters(req: Request, res: Response): Promise<void> {
    try {
      const { fighter1Id, fighter2Id } = req.params;
      const { timeRange = '365' } = req.query;

      if (fighter1Id === fighter2Id) {
        res.status(400).json({
          error: 'Invalid comparison',
          message: 'Cannot compare a fighter with themselves'
        });
        return;
      }

      const timeRangeDays = parseInt(timeRange as string, 10);
      if (isNaN(timeRangeDays) || timeRangeDays < 1 || timeRangeDays > 3650) {
        res.status(400).json({
          error: 'Invalid time range',
          message: 'Time range must be between 1 and 3650 days'
        });
        return;
      }

      const [fighter1, fighter2] = await Promise.all([
        this.fighterRepository.findById(fighter1Id),
        this.fighterRepository.findById(fighter2Id)
      ]);

      if (!fighter1) {
        res.status(404).json({
          error: 'Fighter not found',
          message: `Fighter 1 not found with ID: ${fighter1Id}`
        });
        return;
      }

      if (!fighter2) {
        res.status(404).json({
          error: 'Fighter not found',
          message: `Fighter 2 not found with ID: ${fighter2Id}`
        });
        return;
      }

      const comparison = await this.generateFighterComparison(fighter1Id, fighter2Id, timeRangeDays);

      res.json({
        comparison,
        timeRange: timeRangeDays,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error comparing fighters:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to compare fighters'
      });
    }
  }

  /**
   * Get fighter performance trends
   * GET /api/v1/fighters/:fighterId/trends
   */
  async getFighterTrends(req: Request, res: Response): Promise<void> {
    try {
      const { fighterId } = req.params;
      const { 
        timeRange = '365',
        metrics = 'strikingAccuracy,takedownDefense,finishRate'
      } = req.query;

      const timeRangeDays = parseInt(timeRange as string, 10);
      if (isNaN(timeRangeDays) || timeRangeDays < 30 || timeRangeDays > 3650) {
        res.status(400).json({
          error: 'Invalid time range',
          message: 'Time range must be between 30 and 3650 days for trend analysis'
        });
        return;
      }

      const requestedMetrics = (metrics as string).split(',').map(m => m.trim());
      const validMetrics = ['strikingAccuracy', 'takedownDefense', 'finishRate', 'activity'];
      const invalidMetrics = requestedMetrics.filter(m => !validMetrics.includes(m));

      if (invalidMetrics.length > 0) {
        res.status(400).json({
          error: 'Invalid metrics',
          message: `Invalid metrics: ${invalidMetrics.join(', ')}. Valid metrics: ${validMetrics.join(', ')}`
        });
        return;
      }

      const fighter = await this.fighterRepository.findById(fighterId);
      if (!fighter) {
        res.status(404).json({
          error: 'Fighter not found',
          message: `No fighter found with ID: ${fighterId}`
        });
        return;
      }

      const trends = await this.calculateTrends(fighterId, timeRangeDays, requestedMetrics);

      res.json({
        trends,
        timeRange: timeRangeDays,
        metrics: requestedMetrics,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error calculating fighter trends:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to calculate fighter trends'
      });
    }
  }

  /**
   * Search fighters by name or criteria
   * GET /api/v1/fighters/search
   */
  async searchFighters(req: Request, res: Response): Promise<void> {
    try {
      const { 
        q = '',
        weightClass,
        minRank,
        maxRank,
        active = 'true',
        limit = '20',
        offset = '0'
      } = req.query;

      const limitNum = parseInt(limit as string, 10);
      const offsetNum = parseInt(offset as string, 10);

      if (isNaN(limitNum) || isNaN(offsetNum) || limitNum < 1 || limitNum > 100 || offsetNum < 0) {
        res.status(400).json({
          error: 'Invalid pagination parameters',
          message: 'Limit must be between 1 and 100, offset must be non-negative'
        });
        return;
      }

      const searchCriteria = {
        query: q as string,
        weightClass: weightClass as string,
        minRank: minRank ? parseInt(minRank as string, 10) : undefined,
        maxRank: maxRank ? parseInt(maxRank as string, 10) : undefined,
        active: active === 'true',
        limit: limitNum,
        offset: offsetNum
      };

      const results = await this.fighterRepository.search(searchCriteria);

      res.json({
        fighters: results.fighters,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: results.total,
          hasMore: offsetNum + limitNum < results.total
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error searching fighters:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to search fighters'
      });
    }
  }

  /**
   * Get fighter rankings in weight class
   * GET /api/v1/fighters/rankings/:weightClass
   */
  async getWeightClassRankings(req: Request, res: Response): Promise<void> {
    try {
      const { weightClass } = req.params;
      const { limit = '15' } = req.query;

      const limitNum = parseInt(limit as string, 10);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
        res.status(400).json({
          error: 'Invalid limit',
          message: 'Limit must be between 1 and 50'
        });
        return;
      }

      const validWeightClasses = [
        'Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight', 
        'Welterweight', 'Middleweight', 'Light Heavyweight', 'Heavyweight',
        'Womens Strawweight', 'Womens Flyweight', 'Womens Bantamweight', 'Womens Featherweight'
      ];

      if (!validWeightClasses.includes(weightClass)) {
        res.status(400).json({
          error: 'Invalid weight class',
          message: `Valid weight classes: ${validWeightClasses.join(', ')}`
        });
        return;
      }

      const rankings = await this.fighterRepository.getRankings(weightClass, limitNum);

      res.json({
        weightClass,
        rankings,
        lastUpdated: new Date(),
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving rankings:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve rankings'
      });
    }
  }

  /**
   * Generate comprehensive fighter analytics
   */
  private async generateFighterAnalytics(fighterId: string, timeRangeDays: number): Promise<FighterAnalytics> {
    const [profile, metrics, trends, recentPerformance, rankings] = await Promise.all([
      this.fighterRepository.findById(fighterId),
      this.metricsCalculator.calculateFighterMetrics(fighterId),
      this.calculateTrends(fighterId, timeRangeDays, ['strikingAccuracy', 'takedownDefense', 'finishRate', 'activity']),
      this.getRecentPerformance(fighterId, 5), // Last 5 fights
      this.getRankingData(fighterId)
    ]);

    return {
      profile,
      metrics,
      trends,
      recentPerformance,
      rankings
    };
  }

  /**
   * Generate fighter comparison
   */
  private async generateFighterComparison(fighter1Id: string, fighter2Id: string, timeRangeDays: number): Promise<FighterComparison> {
    const [fighter1Analytics, fighter2Analytics] = await Promise.all([
      this.generateFighterAnalytics(fighter1Id, timeRangeDays),
      this.generateFighterAnalytics(fighter2Id, timeRangeDays)
    ]);

    const comparison = this.analyzeComparison(fighter1Analytics, fighter2Analytics);

    return {
      fighter1: fighter1Analytics,
      fighter2: fighter2Analytics,
      comparison
    };
  }

  /**
   * Analyze comparison between two fighters
   */
  private analyzeComparison(fighter1: FighterAnalytics, fighter2: FighterAnalytics): any {
    const keyDifferences = [];
    const fighter1Advantages = [];
    const fighter2Advantages = [];

    // Compare striking accuracy
    const strikingDiff = fighter1.metrics.strikingAccuracy - fighter2.metrics.strikingAccuracy;
    if (Math.abs(strikingDiff) > 0.05) {
      keyDifferences.push({
        metric: 'Striking Accuracy',
        fighter1Value: fighter1.metrics.strikingAccuracy,
        fighter2Value: fighter2.metrics.strikingAccuracy,
        significance: Math.abs(strikingDiff) > 0.15 ? 'high' : 'medium',
        description: `${Math.abs(strikingDiff * 100).toFixed(1)}% difference in striking accuracy`
      });

      if (strikingDiff > 0) {
        fighter1Advantages.push('Superior striking accuracy');
      } else {
        fighter2Advantages.push('Superior striking accuracy');
      }
    }

    // Compare takedown defense
    const takedownDiff = fighter1.metrics.takedownDefense - fighter2.metrics.takedownDefense;
    if (Math.abs(takedownDiff) > 0.05) {
      keyDifferences.push({
        metric: 'Takedown Defense',
        fighter1Value: fighter1.metrics.takedownDefense,
        fighter2Value: fighter2.metrics.takedownDefense,
        significance: Math.abs(takedownDiff) > 0.15 ? 'high' : 'medium',
        description: `${Math.abs(takedownDiff * 100).toFixed(1)}% difference in takedown defense`
      });

      if (takedownDiff > 0) {
        fighter1Advantages.push('Better takedown defense');
      } else {
        fighter2Advantages.push('Better takedown defense');
      }
    }

    // Compare experience
    const exp1 = fighter1.profile.record.wins + fighter1.profile.record.losses;
    const exp2 = fighter2.profile.record.wins + fighter2.profile.record.losses;
    const expDiff = exp1 - exp2;

    if (Math.abs(expDiff) > 3) {
      keyDifferences.push({
        metric: 'Experience',
        fighter1Value: exp1,
        fighter2Value: exp2,
        significance: Math.abs(expDiff) > 10 ? 'high' : 'medium',
        description: `${Math.abs(expDiff)} fight difference in experience`
      });

      if (expDiff > 0) {
        fighter1Advantages.push('More experienced');
      } else {
        fighter2Advantages.push('More experienced');
      }
    }

    // Compare physical attributes
    const reachDiff = fighter1.profile.physicalStats.reach - fighter2.profile.physicalStats.reach;
    if (Math.abs(reachDiff) > 2) {
      keyDifferences.push({
        metric: 'Reach',
        fighter1Value: fighter1.profile.physicalStats.reach,
        fighter2Value: fighter2.profile.physicalStats.reach,
        significance: Math.abs(reachDiff) > 4 ? 'high' : 'medium',
        description: `${Math.abs(reachDiff)} inch reach advantage`
      });

      if (reachDiff > 0) {
        fighter1Advantages.push('Reach advantage');
      } else {
        fighter2Advantages.push('Reach advantage');
      }
    }

    // Overall assessment
    let overallAssessment = 'Both fighters are evenly matched with different strengths.';
    if (fighter1Advantages.length > fighter2Advantages.length + 1) {
      overallAssessment = `${fighter1.profile.name} appears to have the overall advantage.`;
    } else if (fighter2Advantages.length > fighter1Advantages.length + 1) {
      overallAssessment = `${fighter2.profile.name} appears to have the overall advantage.`;
    }

    return {
      advantages: {
        fighter1: fighter1Advantages,
        fighter2: fighter2Advantages
      },
      keyDifferences,
      overallAssessment
    };
  }

  /**
   * Calculate performance trends
   */
  private async calculateTrends(fighterId: string, timeRangeDays: number, metrics: string[]): Promise<TrendAnalysis> {
    // Simplified trend calculation - in real implementation would analyze fight history
    const trends: any = {};

    for (const metric of metrics) {
      trends[`${metric}Trend`] = {
        direction: Math.random() > 0.5 ? 'up' : 'down',
        percentage: Math.random() * 20 - 10, // -10% to +10%
        dataPoints: this.generateTrendDataPoints(timeRangeDays),
        significance: Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low'
      };
    }

    // Determine overall trend
    const upTrends = Object.values(trends).filter((t: any) => t.direction === 'up').length;
    const downTrends = Object.values(trends).filter((t: any) => t.direction === 'down').length;

    let overallTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (upTrends > downTrends + 1) {
      overallTrend = 'improving';
    } else if (downTrends > upTrends + 1) {
      overallTrend = 'declining';
    }

    return {
      ...trends,
      overallTrend
    };
  }

  /**
   * Generate trend data points
   */
  private generateTrendDataPoints(timeRangeDays: number): Array<{ date: Date; value: number }> {
    const dataPoints = [];
    const numPoints = Math.min(10, Math.floor(timeRangeDays / 30)); // One point per month, max 10

    for (let i = 0; i < numPoints; i++) {
      const daysAgo = (timeRangeDays / numPoints) * i;
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);

      dataPoints.push({
        date,
        value: Math.random() * 0.4 + 0.4 // 0.4 to 0.8
      });
    }

    return dataPoints.reverse(); // Chronological order
  }

  /**
   * Get recent performance data
   */
  private async getRecentPerformance(fighterId: string, numFights: number): Promise<PerformanceData[]> {
    // Simplified implementation - would query fight history from database
    const performances: PerformanceData[] = [];

    for (let i = 0; i < numFights; i++) {
      const daysAgo = (i + 1) * 90; // Fights every ~3 months
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);

      performances.push({
        fightId: `fight-${fighterId}-${i}`,
        opponent: `Opponent ${i + 1}`,
        date,
        result: Math.random() > 0.3 ? 'win' : 'loss',
        method: Math.random() > 0.6 ? 'Decision' : Math.random() > 0.5 ? 'KO/TKO' : 'Submission',
        round: Math.floor(Math.random() * 3) + 1,
        metrics: {
          strikesLanded: Math.floor(Math.random() * 100) + 20,
          strikesAttempted: Math.floor(Math.random() * 150) + 50,
          takedownsLanded: Math.floor(Math.random() * 5),
          takedownsAttempted: Math.floor(Math.random() * 8),
          controlTime: Math.floor(Math.random() * 300) // seconds
        }
      });
    }

    return performances;
  }

  /**
   * Get ranking data
   */
  private async getRankingData(fighterId: string): Promise<RankingData> {
    // Simplified implementation - would query ranking history from database
    return {
      current: {
        weightClass: 'Lightweight',
        rank: Math.floor(Math.random() * 15) + 1,
        p4pRank: Math.random() > 0.8 ? Math.floor(Math.random() * 15) + 1 : undefined
      },
      history: [
        {
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          weightClass: 'Lightweight',
          rank: Math.floor(Math.random() * 15) + 1,
          change: Math.floor(Math.random() * 6) - 3 // -3 to +3
        }
      ]
    };
  }
}