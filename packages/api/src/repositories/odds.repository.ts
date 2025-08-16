import { Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { OddsTimeSeries, MovementAlert, ArbitrageOpportunity } from '@ufc-platform/shared/types/odds';
import { OddsSnapshot } from '@ufc-platform/shared/types/fight';
import { MovementType } from '@ufc-platform/shared/types/core';
import { DatabaseManager } from '../database';

export interface OddsQueryOptions {
  fightId?: string;
  sportsbook?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

export interface OddsMovementQuery {
  fightId: string;
  timeWindow?: string; // e.g., '1h', '24h', '7d'
  minPercentageChange?: number;
}

export interface OddsAggregationOptions {
  fightId: string;
  interval: string; // e.g., '5m', '1h', '1d'
  startTime?: Date;
  endTime?: Date;
}

export class OddsRepository {
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

  async writeOddsSnapshot(snapshot: OddsSnapshot): Promise<void> {
    try {
      const point = new Point('odds')
        .tag('fightId', snapshot.fightId)
        .tag('sportsbook', snapshot.sportsbook)
        .floatField('fighter1_moneyline', snapshot.moneyline.fighter1)
        .floatField('fighter2_moneyline', snapshot.moneyline.fighter2)
        .floatField('ko_odds', snapshot.method.ko)
        .floatField('submission_odds', snapshot.method.submission)
        .floatField('decision_odds', snapshot.method.decision)
        .floatField('round1_odds', snapshot.rounds.round1)
        .floatField('round2_odds', snapshot.rounds.round2)
        .floatField('round3_odds', snapshot.rounds.round3)
        .timestamp(snapshot.timestamp);

      // Add round 4 and 5 odds if they exist (for 5-round fights)
      if (snapshot.rounds.round4 !== undefined) {
        point.floatField('round4_odds', snapshot.rounds.round4);
      }
      if (snapshot.rounds.round5 !== undefined) {
        point.floatField('round5_odds', snapshot.rounds.round5);
      }

      await this.writeApi.writePoint(point);
      console.log(`Odds snapshot written for fight ${snapshot.fightId} from ${snapshot.sportsbook}`);
    } catch (error) {
      console.error('Error writing odds snapshot:', error);
      throw new Error(`Failed to write odds snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async writeOddsTimeSeries(timeSeries: OddsTimeSeries): Promise<void> {
    try {
      const impliedProb1 = timeSeries.impliedProbability[0];
      const impliedProb2 = timeSeries.impliedProbability[1];

      const point = new Point('odds_timeseries')
        .tag('fightId', timeSeries.fightId)
        .tag('sportsbook', timeSeries.sportsbook)
        .floatField('fighter1_moneyline', timeSeries.odds.moneyline[0])
        .floatField('fighter2_moneyline', timeSeries.odds.moneyline[1])
        .floatField('fighter1_implied_prob', impliedProb1)
        .floatField('fighter2_implied_prob', impliedProb2)
        .floatField('ko_odds', timeSeries.odds.method.ko)
        .floatField('submission_odds', timeSeries.odds.method.submission)
        .floatField('decision_odds', timeSeries.odds.method.decision)
        .floatField('round1_odds', timeSeries.odds.rounds.round1)
        .floatField('round2_odds', timeSeries.odds.rounds.round2)
        .floatField('round3_odds', timeSeries.odds.rounds.round3)
        .timestamp(timeSeries.timestamp);

      if (timeSeries.volume !== undefined) {
        point.floatField('volume', timeSeries.volume);
      }

      if (timeSeries.odds.rounds.round4 !== undefined) {
        point.floatField('round4_odds', timeSeries.odds.rounds.round4);
      }
      if (timeSeries.odds.rounds.round5 !== undefined) {
        point.floatField('round5_odds', timeSeries.odds.rounds.round5);
      }

      await this.writeApi.writePoint(point);
    } catch (error) {
      console.error('Error writing odds time series:', error);
      throw new Error(`Failed to write odds time series: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async writeMovementAlert(alert: MovementAlert): Promise<void> {
    try {
      const point = new Point('odds_movements')
        .tag('fightId', alert.fightId)
        .tag('movementType', alert.movementType)
        .tag('sportsbook', alert.newOdds.sportsbook)
        .floatField('percentage_change', alert.percentageChange)
        .floatField('old_fighter1_odds', alert.oldOdds.moneyline.fighter1)
        .floatField('old_fighter2_odds', alert.oldOdds.moneyline.fighter2)
        .floatField('new_fighter1_odds', alert.newOdds.moneyline.fighter1)
        .floatField('new_fighter2_odds', alert.newOdds.moneyline.fighter2)
        .timestamp(alert.timestamp);

      await this.writeApi.writePoint(point);
    } catch (error) {
      console.error('Error writing movement alert:', error);
      throw new Error(`Failed to write movement alert: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async writeArbitrageOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      const point = new Point('arbitrage_opportunities')
        .tag('fightId', opportunity.fightId)
        .stringField('sportsbooks', opportunity.sportsbooks.join(','))
        .floatField('profit_percentage', opportunity.profit)
        .stringField('stakes', JSON.stringify(opportunity.stakes))
        .timestamp(new Date());

      await this.writeApi.writePoint(point);
    } catch (error) {
      console.error('Error writing arbitrage opportunity:', error);
      throw new Error(`Failed to write arbitrage opportunity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Query Operations

  async getOddsHistory(options: OddsQueryOptions): Promise<OddsTimeSeries[]> {
    try {
      let query = `
        from(bucket: "${this.bucket}")
        |> range(start: ${options.startTime ? options.startTime.toISOString() : '-30d'}, stop: ${options.endTime ? options.endTime.toISOString() : 'now()'})
        |> filter(fn: (r) => r._measurement == "odds_timeseries")
      `;

      if (options.fightId) {
        query += `|> filter(fn: (r) => r.fightId == "${options.fightId}")`;
      }

      if (options.sportsbook) {
        query += `|> filter(fn: (r) => r.sportsbook == "${options.sportsbook}")`;
      }

      query += `
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"])
      `;

      if (options.limit) {
        query += `|> limit(n: ${options.limit})`;
      }

      const results = await this.queryApi.collectRows(query);
      
      return results.map(row => ({
        timestamp: new Date(row._time),
        fightId: row.fightId,
        sportsbook: row.sportsbook,
        odds: {
          moneyline: [row.fighter1_moneyline, row.fighter2_moneyline],
          method: {
            ko: row.ko_odds,
            submission: row.submission_odds,
            decision: row.decision_odds,
          },
          rounds: {
            round1: row.round1_odds,
            round2: row.round2_odds,
            round3: row.round3_odds,
            round4: row.round4_odds,
            round5: row.round5_odds,
          },
        },
        volume: row.volume,
        impliedProbability: [row.fighter1_implied_prob, row.fighter2_implied_prob],
      }));
    } catch (error) {
      console.error('Error querying odds history:', error);
      throw new Error(`Failed to query odds history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getLatestOdds(fightId: string, sportsbook?: string): Promise<OddsTimeSeries[]> {
    try {
      let query = `
        from(bucket: "${this.bucket}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "odds_timeseries")
        |> filter(fn: (r) => r.fightId == "${fightId}")
      `;

      if (sportsbook) {
        query += `|> filter(fn: (r) => r.sportsbook == "${sportsbook}")`;
      }

      query += `
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> group(columns: ["sportsbook"])
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 1)
        |> group()
      `;

      const results = await this.queryApi.collectRows(query);
      
      return results.map(row => ({
        timestamp: new Date(row._time),
        fightId: row.fightId,
        sportsbook: row.sportsbook,
        odds: {
          moneyline: [row.fighter1_moneyline, row.fighter2_moneyline],
          method: {
            ko: row.ko_odds,
            submission: row.submission_odds,
            decision: row.decision_odds,
          },
          rounds: {
            round1: row.round1_odds,
            round2: row.round2_odds,
            round3: row.round3_odds,
            round4: row.round4_odds,
            round5: row.round5_odds,
          },
        },
        volume: row.volume,
        impliedProbability: [row.fighter1_implied_prob, row.fighter2_implied_prob],
      }));
    } catch (error) {
      console.error('Error querying latest odds:', error);
      throw new Error(`Failed to query latest odds: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getOddsMovements(options: OddsMovementQuery): Promise<MovementAlert[]> {
    try {
      const timeWindow = options.timeWindow || '24h';
      const minChange = options.minPercentageChange || 5;

      const query = `
        from(bucket: "${this.bucket}")
        |> range(start: -${timeWindow})
        |> filter(fn: (r) => r._measurement == "odds_movements")
        |> filter(fn: (r) => r.fightId == "${options.fightId}")
        |> filter(fn: (r) => r._field == "percentage_change")
        |> filter(fn: (r) => r._value >= ${minChange} or r._value <= -${minChange})
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: true)
      `;

      const results = await this.queryApi.collectRows(query);
      
      return results.map(row => ({
        fightId: row.fightId,
        movementType: row.movementType as MovementType,
        oldOdds: {
          fightId: row.fightId,
          sportsbook: row.sportsbook,
          timestamp: new Date(row._time),
          moneyline: {
            fighter1: row.old_fighter1_odds,
            fighter2: row.old_fighter2_odds,
          },
          method: { ko: 0, submission: 0, decision: 0 },
          rounds: { round1: 0, round2: 0, round3: 0 },
        },
        newOdds: {
          fightId: row.fightId,
          sportsbook: row.sportsbook,
          timestamp: new Date(row._time),
          moneyline: {
            fighter1: row.new_fighter1_odds,
            fighter2: row.new_fighter2_odds,
          },
          method: { ko: 0, submission: 0, decision: 0 },
          rounds: { round1: 0, round2: 0, round3: 0 },
        },
        percentageChange: row.percentage_change,
        timestamp: new Date(row._time),
      }));
    } catch (error) {
      console.error('Error querying odds movements:', error);
      throw new Error(`Failed to query odds movements: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getOddsAggregation(options: OddsAggregationOptions): Promise<any[]> {
    try {
      const startTime = options.startTime ? options.startTime.toISOString() : '-7d';
      const endTime = options.endTime ? options.endTime.toISOString() : 'now()';

      const query = `
        from(bucket: "${this.bucket}")
        |> range(start: ${startTime}, stop: ${endTime})
        |> filter(fn: (r) => r._measurement == "odds_timeseries")
        |> filter(fn: (r) => r.fightId == "${options.fightId}")
        |> filter(fn: (r) => r._field == "fighter1_moneyline" or r._field == "fighter2_moneyline")
        |> aggregateWindow(every: ${options.interval}, fn: mean, createEmpty: false)
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"])
      `;

      const results = await this.queryApi.collectRows(query);
      
      return results.map(row => ({
        timestamp: new Date(row._time),
        fightId: row.fightId,
        sportsbook: row.sportsbook,
        avgFighter1Odds: row.fighter1_moneyline,
        avgFighter2Odds: row.fighter2_moneyline,
      }));
    } catch (error) {
      console.error('Error querying odds aggregation:', error);
      throw new Error(`Failed to query odds aggregation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getArbitrageOpportunities(fightId?: string, minProfit?: number): Promise<ArbitrageOpportunity[]> {
    try {
      let query = `
        from(bucket: "${this.bucket}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "arbitrage_opportunities")
      `;

      if (fightId) {
        query += `|> filter(fn: (r) => r.fightId == "${fightId}")`;
      }

      if (minProfit) {
        query += `|> filter(fn: (r) => r._field == "profit_percentage" and r._value >= ${minProfit})`;
      }

      query += `
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: true)
      `;

      const results = await this.queryApi.collectRows(query);
      
      return results.map(row => ({
        fightId: row.fightId,
        sportsbooks: row.sportsbooks.split(','),
        profit: row.profit_percentage,
        stakes: JSON.parse(row.stakes),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      }));
    } catch (error) {
      console.error('Error querying arbitrage opportunities:', error);
      throw new Error(`Failed to query arbitrage opportunities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Utility Operations

  async flush(): Promise<void> {
    try {
      await this.writeApi.flush();
    } catch (error) {
      console.error('Error flushing odds repository:', error);
      throw new Error(`Failed to flush odds repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async close(): Promise<void> {
    try {
      await this.writeApi.close();
    } catch (error) {
      console.error('Error closing odds repository:', error);
      throw new Error(`Failed to close odds repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}