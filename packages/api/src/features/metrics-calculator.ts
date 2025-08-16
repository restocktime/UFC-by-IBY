import { RollingAverage, FormIndicator } from '@ufc-platform/shared';

/**
 * Configuration for rolling statistics calculations
 */
export interface RollingStatsConfig {
  windowSize: number; // number of fights to include in rolling average
  minDataPoints: number; // minimum fights required for calculation
  trendThreshold: number; // percentage change threshold for trend detection
}

/**
 * Raw fight statistics for a single fight
 */
export interface FightStats {
  fightId: string;
  fighterId: string;
  date: Date;
  strikesLanded: number;
  strikesAttempted: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  takedownsDefended: number;
  takedownsAgainst: number;
  controlTime: number; // seconds
  fightDuration: number; // seconds
  result: 'win' | 'loss' | 'draw' | 'nc';
  performance: number; // 0-100 performance score
}

/**
 * Calculated rolling statistics
 */
export interface RollingStats {
  strikingAccuracy: RollingAverage;
  takedownAccuracy: RollingAverage;
  takedownDefense: RollingAverage;
  controlTimePerMinute: RollingAverage;
  fightFrequency: number; // fights per year
  winRate: RollingAverage;
}

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  metric: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercentage: number;
  confidence: number; // 0-1 confidence in trend
}

/**
 * MetricsCalculator class for computing rolling averages and trend analysis
 */
export class MetricsCalculator {
  private config: RollingStatsConfig;

  constructor(config: RollingStatsConfig = {
    windowSize: 5,
    minDataPoints: 3,
    trendThreshold: 10
  }) {
    this.config = config;
  }

  /**
   * Calculate rolling statistics for a fighter based on their fight history
   */
  calculateRollingStats(fightStats: FightStats[]): RollingStats {
    // Sort fights by date (most recent first)
    const sortedStats = [...fightStats].sort((a, b) => b.date.getTime() - a.date.getTime());
    
    // Take only the most recent fights within window size
    const recentStats = sortedStats.slice(0, this.config.windowSize);

    if (recentStats.length < this.config.minDataPoints) {
      throw new Error(`Insufficient data points. Need at least ${this.config.minDataPoints}, got ${recentStats.length}`);
    }

    return {
      strikingAccuracy: this.calculateStrikingAccuracy(recentStats),
      takedownAccuracy: this.calculateTakedownAccuracy(recentStats),
      takedownDefense: this.calculateTakedownDefense(recentStats),
      controlTimePerMinute: this.calculateControlTimePerMinute(recentStats),
      fightFrequency: this.calculateFightFrequency(sortedStats),
      winRate: this.calculateWinRate(recentStats)
    };
  }

  /**
   * Calculate striking accuracy rolling average
   */
  private calculateStrikingAccuracy(stats: FightStats[]): RollingAverage {
    const totalLanded = stats.reduce((sum, s) => sum + s.strikesLanded, 0);
    const totalAttempted = stats.reduce((sum, s) => sum + s.strikesAttempted, 0);
    
    const accuracy = totalAttempted > 0 ? (totalLanded / totalAttempted) * 100 : 0;
    const trend = this.calculateTrend(stats.map(s => 
      s.strikesAttempted > 0 ? (s.strikesLanded / s.strikesAttempted) * 100 : 0
    ));

    return {
      value: accuracy,
      period: stats.length,
      trend
    };
  }

  /**
   * Calculate takedown accuracy rolling average
   */
  private calculateTakedownAccuracy(stats: FightStats[]): RollingAverage {
    const totalLanded = stats.reduce((sum, s) => sum + s.takedownsLanded, 0);
    const totalAttempted = stats.reduce((sum, s) => sum + s.takedownsAttempted, 0);
    
    const accuracy = totalAttempted > 0 ? (totalLanded / totalAttempted) * 100 : 0;
    const trend = this.calculateTrend(stats.map(s => 
      s.takedownsAttempted > 0 ? (s.takedownsLanded / s.takedownsAttempted) * 100 : 0
    ));

    return {
      value: accuracy,
      period: stats.length,
      trend
    };
  }

  /**
   * Calculate takedown defense rolling average
   */
  private calculateTakedownDefense(stats: FightStats[]): RollingAverage {
    const totalDefended = stats.reduce((sum, s) => sum + s.takedownsDefended, 0);
    const totalAgainst = stats.reduce((sum, s) => sum + s.takedownsAgainst, 0);
    
    const defense = totalAgainst > 0 ? (totalDefended / totalAgainst) * 100 : 100;
    const trend = this.calculateTrend(stats.map(s => 
      s.takedownsAgainst > 0 ? (s.takedownsDefended / s.takedownsAgainst) * 100 : 100
    ));

    return {
      value: defense,
      period: stats.length,
      trend
    };
  }

  /**
   * Calculate control time per minute rolling average
   */
  private calculateControlTimePerMinute(stats: FightStats[]): RollingAverage {
    const avgControlTime = stats.reduce((sum, s) => {
      const fightMinutes = s.fightDuration / 60;
      return sum + (fightMinutes > 0 ? s.controlTime / fightMinutes : 0);
    }, 0) / stats.length;

    const trend = this.calculateTrend(stats.map(s => {
      const fightMinutes = s.fightDuration / 60;
      return fightMinutes > 0 ? s.controlTime / fightMinutes : 0;
    }));

    return {
      value: avgControlTime,
      period: stats.length,
      trend
    };
  }

  /**
   * Calculate fight frequency (fights per year)
   */
  private calculateFightFrequency(stats: FightStats[]): number {
    if (stats.length < 2) return 0;

    const sortedStats = [...stats].sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstFight = sortedStats[0].date;
    const lastFight = sortedStats[sortedStats.length - 1].date;
    
    const yearsDiff = (lastFight.getTime() - firstFight.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    
    return yearsDiff > 0 ? stats.length / yearsDiff : 0;
  }

  /**
   * Calculate win rate rolling average
   */
  private calculateWinRate(stats: FightStats[]): RollingAverage {
    const wins = stats.filter(s => s.result === 'win').length;
    const winRate = (wins / stats.length) * 100;
    
    const trend = this.calculateTrend(stats.map((s, index) => {
      const recentFights = stats.slice(0, index + 1);
      const recentWins = recentFights.filter(f => f.result === 'win').length;
      return (recentWins / recentFights.length) * 100;
    }));

    return {
      value: winRate,
      period: stats.length,
      trend
    };
  }

  /**
   * Calculate trend direction based on values over time
   * Note: values are expected to be in chronological order (oldest first)
   */
  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    // Reverse values to get chronological order (oldest first)
    const chronologicalValues = [...values].reverse();

    // Calculate linear regression slope
    const n = chronologicalValues.length;
    const sumX = (n * (n - 1)) / 2; // sum of indices 0, 1, 2, ...
    const sumY = chronologicalValues.reduce((sum, val) => sum + val, 0);
    const sumXY = chronologicalValues.reduce((sum, val, index) => sum + (index * val), 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6; // sum of squares of indices

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // Convert slope to percentage change
    const avgValue = sumY / n;
    const percentageChange = avgValue > 0 ? Math.abs(slope / avgValue) * 100 : 0;

    if (percentageChange < this.config.trendThreshold) {
      return 'stable';
    }

    return slope > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Perform detailed trend analysis on a specific metric
   */
  analyzeMetricTrend(values: number[], metricName: string): TrendAnalysis {
    if (values.length < 2) {
      return {
        metric: metricName,
        trend: 'stable',
        changePercentage: 0,
        confidence: 0
      };
    }

    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, index) => sum + (index * val), 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgValue = sumY / n;
    
    // Calculate R-squared for confidence
    const yMean = avgValue;
    const ssTotal = values.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
    const predictedValues = values.map((_, index) => avgValue + slope * (index - (n - 1) / 2));
    const ssRes = values.reduce((sum, val, index) => sum + Math.pow(val - predictedValues[index], 2), 0);
    const rSquared = ssTotal > 0 ? 1 - (ssRes / ssTotal) : 0;

    const percentageChange = avgValue > 0 ? Math.abs(slope / avgValue) * 100 : 0;
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (percentageChange >= this.config.trendThreshold) {
      trend = slope > 0 ? 'increasing' : 'decreasing';
    }

    return {
      metric: metricName,
      trend,
      changePercentage: percentageChange,
      confidence: Math.max(0, Math.min(1, rSquared))
    };
  }

  /**
   * Generate form indicators based on recent performance
   */
  generateFormIndicators(stats: FightStats[]): FormIndicator[] {
    return stats
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, this.config.windowSize)
      .map(stat => ({
        fightId: stat.fightId,
        date: stat.date,
        result: stat.result,
        performance: stat.performance
      }));
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RollingStatsConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): RollingStatsConfig {
    return { ...this.config };
  }
}