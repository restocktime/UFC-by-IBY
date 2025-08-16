import { Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { DatabaseManager } from '../database';

export interface PerformanceMetric {
  fighterId: string;
  fightId: string;
  timestamp: Date;
  metrics: {
    strikesLandedPerMinute: number;
    strikingAccuracy: number;
    takedownAccuracy: number;
    takedownDefense: number;
    submissionAttempts: number;
    controlTime: number;
    significantStrikes: number;
    totalStrikes: number;
    knockdowns: number;
    reversals: number;
  };
  opponent: string;
  weightClass: string;
  result: 'win' | 'loss' | 'draw' | 'nc';
}

export interface MetricsQueryOptions {
  fighterId?: string;
  fightId?: string;
  startTime?: Date;
  endTime?: Date;
  weightClass?: string;
  limit?: number;
}

export interface TrendAnalysisOptions {
  fighterId: string;
  metric: string;
  timeWindow: string; // e.g., '6m', '1y', '2y'
  interval?: string; // e.g., '1w', '1m'
}

export interface PerformanceTrend {
  timestamp: Date;
  value: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercentage: number;
}

export class MetricsRepository {
  private writeApi: WriteApi;
  private queryApi: QueryApi;
  private bucket: string;

  constructor() {
    const dbManager = DatabaseManager.getInstance();
    const influxDB = dbManager.getInfluxDB();
    
    this.writeApi = influxDB.getWriteApi();
    this.queryApi = influxDB.getQueryApi();
    this.bucket = 'ufc-data'; // Should match config
  }

  // Write Operations

  async writePerformanceMetrics(metrics: PerformanceMetric): Promise<void> {
    try {
      const point = new Point('fighter_performance')
        .tag('fighterId', metrics.fighterId)
        .tag('fightId', metrics.fightId)
        .tag('opponent', metrics.opponent)
        .tag('weightClass', metrics.weightClass)
        .tag('result', metrics.result)
        .floatField('strikes_landed_per_minute', metrics.metrics.strikesLandedPerMinute)
        .floatField('striking_accuracy', metrics.metrics.strikingAccuracy)
        .floatField('takedown_accuracy', metrics.metrics.takedownAccuracy)
        .floatField('takedown_defense', metrics.metrics.takedownDefense)
        .intField('submission_attempts', metrics.metrics.submissionAttempts)
        .floatField('control_time', metrics.metrics.controlTime)
        .intField('significant_strikes', metrics.metrics.significantStrikes)
        .intField('total_strikes', metrics.metrics.totalStrikes)
        .intField('knockdowns', metrics.metrics.knockdowns)
        .intField('reversals', metrics.metrics.reversals)
        .timestamp(metrics.timestamp);

      await this.writeApi.writePoint(point);
      console.log(`Performance metrics written for fighter ${metrics.fighterId} in fight ${metrics.fightId}`);
    } catch (error) {
      console.error('Error writing performance metrics:', error);
      throw new Error(`Failed to write performance metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async writeBulkMetrics(metricsArray: PerformanceMetric[]): Promise<void> {
    try {
      const points = metricsArray.map(metrics => 
        new Point('fighter_performance')
          .tag('fighterId', metrics.fighterId)
          .tag('fightId', metrics.fightId)
          .tag('opponent', metrics.opponent)
          .tag('weightClass', metrics.weightClass)
          .tag('result', metrics.result)
          .floatField('strikes_landed_per_minute', metrics.metrics.strikesLandedPerMinute)
          .floatField('striking_accuracy', metrics.metrics.strikingAccuracy)
          .floatField('takedown_accuracy', metrics.metrics.takedownAccuracy)
          .floatField('takedown_defense', metrics.metrics.takedownDefense)
          .intField('submission_attempts', metrics.metrics.submissionAttempts)
          .floatField('control_time', metrics.metrics.controlTime)
          .intField('significant_strikes', metrics.metrics.significantStrikes)
          .intField('total_strikes', metrics.metrics.totalStrikes)
          .intField('knockdowns', metrics.metrics.knockdowns)
          .intField('reversals', metrics.metrics.reversals)
          .timestamp(metrics.timestamp)
      );

      await this.writeApi.writePoints(points);
      console.log(`Bulk performance metrics written for ${metricsArray.length} records`);
    } catch (error) {
      console.error('Error writing bulk performance metrics:', error);
      throw new Error(`Failed to write bulk performance metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Query Operations

  async getFighterMetrics(options: MetricsQueryOptions): Promise<PerformanceMetric[]> {
    try {
      let query = `
        from(bucket: "${this.bucket}")
        |> range(start: ${options.startTime ? options.startTime.toISOString() : '-2y'}, stop: ${options.endTime ? options.endTime.toISOString() : 'now()'})
        |> filter(fn: (r) => r._measurement == "fighter_performance")
      `;

      if (options.fighterId) {
        query += `|> filter(fn: (r) => r.fighterId == "${options.fighterId}")`;
      }

      if (options.fightId) {
        query += `|> filter(fn: (r) => r.fightId == "${options.fightId}")`;
      }

      if (options.weightClass) {
        query += `|> filter(fn: (r) => r.weightClass == "${options.weightClass}")`;
      }

      query += `
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: true)
      `;

      if (options.limit) {
        query += `|> limit(n: ${options.limit})`;
      }

      const results = await this.queryApi.collectRows(query);
      
      return results.map(row => ({
        fighterId: row.fighterId,
        fightId: row.fightId,
        timestamp: new Date(row._time),
        metrics: {
          strikesLandedPerMinute: row.strikes_landed_per_minute || 0,
          strikingAccuracy: row.striking_accuracy || 0,
          takedownAccuracy: row.takedown_accuracy || 0,
          takedownDefense: row.takedown_defense || 0,
          submissionAttempts: row.submission_attempts || 0,
          controlTime: row.control_time || 0,
          significantStrikes: row.significant_strikes || 0,
          totalStrikes: row.total_strikes || 0,
          knockdowns: row.knockdowns || 0,
          reversals: row.reversals || 0,
        },
        opponent: row.opponent,
        weightClass: row.weightClass,
        result: row.result as 'win' | 'loss' | 'draw' | 'nc',
      }));
    } catch (error) {
      console.error('Error querying fighter metrics:', error);
      throw new Error(`Failed to query fighter metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getFighterAverages(fighterId: string, timeWindow: string = '1y'): Promise<any> {
    try {
      const query = `
        from(bucket: "${this.bucket}")
        |> range(start: -${timeWindow})
        |> filter(fn: (r) => r._measurement == "fighter_performance")
        |> filter(fn: (r) => r.fighterId == "${fighterId}")
        |> filter(fn: (r) => r._field == "striking_accuracy" or 
                             r._field == "takedown_accuracy" or 
                             r._field == "takedown_defense" or 
                             r._field == "strikes_landed_per_minute" or
                             r._field == "control_time")
        |> group(columns: ["_field"])
        |> mean()
        |> pivot(rowKey:["_field"], columnKey: ["_field"], valueColumn: "_value")
      `;

      const results = await this.queryApi.collectRows(query);
      
      if (results.length === 0) {
        return null;
      }

      const row = results[0];
      return {
        fighterId,
        timeWindow,
        averages: {
          strikingAccuracy: row.striking_accuracy || 0,
          takedownAccuracy: row.takedown_accuracy || 0,
          takedownDefense: row.takedown_defense || 0,
          strikesLandedPerMinute: row.strikes_landed_per_minute || 0,
          controlTime: row.control_time || 0,
        },
      };
    } catch (error) {
      console.error('Error querying fighter averages:', error);
      throw new Error(`Failed to query fighter averages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPerformanceTrend(options: TrendAnalysisOptions): Promise<PerformanceTrend[]> {
    try {
      const interval = options.interval || '1m';
      
      const query = `
        from(bucket: "${this.bucket}")
        |> range(start: -${options.timeWindow})
        |> filter(fn: (r) => r._measurement == "fighter_performance")
        |> filter(fn: (r) => r.fighterId == "${options.fighterId}")
        |> filter(fn: (r) => r._field == "${options.metric}")
        |> aggregateWindow(every: ${interval}, fn: mean, createEmpty: false)
        |> sort(columns: ["_time"])
        |> derivative(unit: 1m, nonNegative: false)
      `;

      const results = await this.queryApi.collectRows(query);
      
      return results.map((row, index) => {
        const value = row._value || 0;
        const prevValue = index > 0 ? (results[index - 1]._value || 0) : value;
        const changePercentage = prevValue !== 0 ? ((value - prevValue) / prevValue) * 100 : 0;
        
        let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
        if (Math.abs(changePercentage) > 5) {
          trend = changePercentage > 0 ? 'increasing' : 'decreasing';
        }

        return {
          timestamp: new Date(row._time),
          value,
          trend,
          changePercentage,
        };
      });
    } catch (error) {
      console.error('Error querying performance trend:', error);
      throw new Error(`Failed to query performance trend: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getRollingAverages(fighterId: string, metric: string, windowSize: number = 5): Promise<any[]> {
    try {
      const query = `
        from(bucket: "${this.bucket}")
        |> range(start: -2y)
        |> filter(fn: (r) => r._measurement == "fighter_performance")
        |> filter(fn: (r) => r.fighterId == "${fighterId}")
        |> filter(fn: (r) => r._field == "${metric}")
        |> sort(columns: ["_time"])
        |> movingAverage(n: ${windowSize})
      `;

      const results = await this.queryApi.collectRows(query);
      
      return results.map(row => ({
        timestamp: new Date(row._time),
        fightId: row.fightId,
        value: row._value,
        rollingAverage: row._value, // movingAverage already applied
      }));
    } catch (error) {
      console.error('Error querying rolling averages:', error);
      throw new Error(`Failed to query rolling averages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async compareMetrics(fighter1Id: string, fighter2Id: string, metric: string, timeWindow: string = '1y'): Promise<any> {
    try {
      const query = `
        from(bucket: "${this.bucket}")
        |> range(start: -${timeWindow})
        |> filter(fn: (r) => r._measurement == "fighter_performance")
        |> filter(fn: (r) => r.fighterId == "${fighter1Id}" or r.fighterId == "${fighter2Id}")
        |> filter(fn: (r) => r._field == "${metric}")
        |> group(columns: ["fighterId"])
        |> mean()
        |> pivot(rowKey:["fighterId"], columnKey: ["fighterId"], valueColumn: "_value")
      `;

      const results = await this.queryApi.collectRows(query);
      
      if (results.length === 0) {
        return null;
      }

      const row = results[0];
      const fighter1Avg = row[fighter1Id] || 0;
      const fighter2Avg = row[fighter2Id] || 0;
      
      return {
        metric,
        timeWindow,
        fighter1: {
          fighterId: fighter1Id,
          average: fighter1Avg,
        },
        fighter2: {
          fighterId: fighter2Id,
          average: fighter2Avg,
        },
        difference: fighter1Avg - fighter2Avg,
        percentageDifference: fighter2Avg !== 0 ? ((fighter1Avg - fighter2Avg) / fighter2Avg) * 100 : 0,
      };
    } catch (error) {
      console.error('Error comparing metrics:', error);
      throw new Error(`Failed to compare metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getMetricDistribution(metric: string, weightClass?: string, timeWindow: string = '1y'): Promise<any> {
    try {
      let query = `
        from(bucket: "${this.bucket}")
        |> range(start: -${timeWindow})
        |> filter(fn: (r) => r._measurement == "fighter_performance")
        |> filter(fn: (r) => r._field == "${metric}")
      `;

      if (weightClass) {
        query += `|> filter(fn: (r) => r.weightClass == "${weightClass}")`;
      }

      query += `
        |> group()
        |> quantile(q: 0.25, method: "estimate_tdigest")
        |> set(key: "percentile", value: "25th")
        |> union(tables: [
          from(bucket: "${this.bucket}")
          |> range(start: -${timeWindow})
          |> filter(fn: (r) => r._measurement == "fighter_performance")
          |> filter(fn: (r) => r._field == "${metric}")
          ${weightClass ? `|> filter(fn: (r) => r.weightClass == "${weightClass}")` : ''}
          |> group()
          |> quantile(q: 0.5, method: "estimate_tdigest")
          |> set(key: "percentile", value: "50th"),
          
          from(bucket: "${this.bucket}")
          |> range(start: -${timeWindow})
          |> filter(fn: (r) => r._measurement == "fighter_performance")
          |> filter(fn: (r) => r._field == "${metric}")
          ${weightClass ? `|> filter(fn: (r) => r.weightClass == "${weightClass}")` : ''}
          |> group()
          |> quantile(q: 0.75, method: "estimate_tdigest")
          |> set(key: "percentile", value: "75th")
        ])
      `;

      const results = await this.queryApi.collectRows(query);
      
      const distribution: any = {
        metric,
        weightClass: weightClass || 'all',
        timeWindow,
      };

      results.forEach(row => {
        distribution[row.percentile] = row._value;
      });

      return distribution;
    } catch (error) {
      console.error('Error querying metric distribution:', error);
      throw new Error(`Failed to query metric distribution: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Utility Operations

  async flush(): Promise<void> {
    try {
      await this.writeApi.flush();
    } catch (error) {
      console.error('Error flushing metrics repository:', error);
      throw new Error(`Failed to flush metrics repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async close(): Promise<void> {
    try {
      await this.writeApi.close();
    } catch (error) {
      console.error('Error closing metrics repository:', error);
      throw new Error(`Failed to close metrics repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}