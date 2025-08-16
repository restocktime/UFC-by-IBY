import { InfluxDB, Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { databaseConfig } from './config';

export class InfluxDBConnection {
  private static instance: InfluxDBConnection;
  private client: InfluxDB | null = null;
  private writeApi: WriteApi | null = null;
  private queryApi: QueryApi | null = null;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): InfluxDBConnection {
    if (!InfluxDBConnection.instance) {
      InfluxDBConnection.instance = new InfluxDBConnection();
    }
    return InfluxDBConnection.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      const { url, token, org, bucket, timeout } = databaseConfig.influxdb;

      if (!token) {
        throw new Error('InfluxDB token is required');
      }

      this.client = new InfluxDB({
        url,
        token,
        timeout,
      });

      // Initialize write and query APIs
      this.writeApi = this.client.getWriteApi(org, bucket, 'ms');
      this.queryApi = this.client.getQueryApi(org);

      // Configure write API
      this.writeApi.useDefaultTags({ service: 'ufc-platform' });

      // Test connection
      await this.healthCheck();
      this.isConnected = true;

      console.log('InfluxDB connected successfully');

    } catch (error) {
      console.error('Failed to connect to InfluxDB:', error);
      this.isConnected = false;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.writeApi) {
      try {
        await this.writeApi.close();
      } catch (error) {
        console.error('Error closing InfluxDB write API:', error);
      }
    }

    this.client = null;
    this.writeApi = null;
    this.queryApi = null;
    this.isConnected = false;
    console.log('InfluxDB disconnected');
  }

  public getWriteApi(): WriteApi {
    if (!this.writeApi || !this.isConnected) {
      throw new Error('InfluxDB not connected. Call connect() first.');
    }
    return this.writeApi;
  }

  public getQueryApi(): QueryApi {
    if (!this.queryApi || !this.isConnected) {
      throw new Error('InfluxDB not connected. Call connect() first.');
    }
    return this.queryApi;
  }

  public createPoint(measurement: string): Point {
    return new Point(measurement);
  }

  public async writePoint(point: Point): Promise<void> {
    const writeApi = this.getWriteApi();
    writeApi.writePoint(point);
  }

  public async writePoints(points: Point[]): Promise<void> {
    const writeApi = this.getWriteApi();
    writeApi.writePoints(points);
  }

  public async flush(): Promise<void> {
    if (this.writeApi) {
      await this.writeApi.flush();
    }
  }

  public async query(fluxQuery: string): Promise<any[]> {
    const queryApi = this.getQueryApi();
    const results: any[] = [];

    return new Promise((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next: (row, tableMeta) => {
          const record = tableMeta.toObject(row);
          results.push(record);
        },
        error: (error) => {
          console.error('InfluxDB query error:', error);
          reject(error);
        },
        complete: () => {
          resolve(results);
        },
      });
    });
  }

  public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      if (!this.client || !this.isConnected) {
        return {
          status: 'unhealthy',
          details: { error: 'Not connected to InfluxDB' }
        };
      }

      // Test with a simple query
      const testQuery = `
        from(bucket: "${databaseConfig.influxdb.bucket}")
        |> range(start: -1m)
        |> limit(n: 1)
      `;

      await this.query(testQuery);

      return {
        status: 'healthy',
        details: {
          connected: this.isConnected,
          url: databaseConfig.influxdb.url,
          org: databaseConfig.influxdb.org,
          bucket: databaseConfig.influxdb.bucket
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  public isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }
}