import { MongoDBConnection } from './mongodb';
import { InfluxDBConnection } from './influxdb';
import { RedisConnection } from './redis';

export interface DatabaseHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    mongodb: { status: 'healthy' | 'unhealthy'; details: any };
    influxdb: { status: 'healthy' | 'unhealthy'; details: any };
    redis: { status: 'healthy' | 'unhealthy'; details: any };
  };
  timestamp: Date;
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private mongodb: MongoDBConnection;
  private influxdb: InfluxDBConnection;
  private redis: RedisConnection;
  private isInitialized = false;

  private constructor() {
    this.mongodb = MongoDBConnection.getInstance();
    this.influxdb = InfluxDBConnection.getInstance();
    this.redis = RedisConnection.getInstance();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('Initializing database connections...');

    const connectionPromises = [
      this.connectMongoDB(),
      this.connectInfluxDB(),
      this.connectRedis(),
    ];

    try {
      await Promise.all(connectionPromises);
      this.isInitialized = true;
      console.log('All database connections initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database connections:', error);
      throw error;
    }
  }

  private async connectMongoDB(): Promise<void> {
    try {
      await this.mongodb.connect();
    } catch (error) {
      console.error('MongoDB connection failed:', error);
      throw new Error(`MongoDB connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async connectInfluxDB(): Promise<void> {
    try {
      await this.influxdb.connect();
    } catch (error) {
      console.error('InfluxDB connection failed:', error);
      // InfluxDB might be optional in development
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`InfluxDB connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } else {
        console.warn('InfluxDB connection failed in development mode, continuing...');
      }
    }
  }

  private async connectRedis(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      console.error('Redis connection failed:', error);
      // Redis might be optional in development
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Redis connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } else {
        console.warn('Redis connection failed in development mode, continuing...');
      }
    }
  }

  public async shutdown(): Promise<void> {
    console.log('Shutting down database connections...');

    const disconnectionPromises = [
      this.mongodb.disconnect().catch(err => console.error('MongoDB disconnect error:', err)),
      this.influxdb.disconnect().catch(err => console.error('InfluxDB disconnect error:', err)),
      this.redis.disconnect().catch(err => console.error('Redis disconnect error:', err)),
    ];

    await Promise.allSettled(disconnectionPromises);
    this.isInitialized = false;
    console.log('Database connections shut down');
  }

  public getMongoDB(): MongoDBConnection {
    if (!this.isInitialized) {
      throw new Error('DatabaseManager not initialized. Call initialize() first.');
    }
    return this.mongodb;
  }

  public getInfluxDB(): InfluxDBConnection {
    if (!this.isInitialized) {
      throw new Error('DatabaseManager not initialized. Call initialize() first.');
    }
    return this.influxdb;
  }

  public getRedis(): RedisConnection {
    if (!this.isInitialized) {
      throw new Error('DatabaseManager not initialized. Call initialize() first.');
    }
    return this.redis;
  }

  public async healthCheck(): Promise<DatabaseHealthStatus> {
    const [mongoHealth, influxHealth, redisHealth] = await Promise.allSettled([
      this.mongodb.healthCheck(),
      this.influxdb.healthCheck(),
      this.redis.healthCheck(),
    ]);

    const services = {
      mongodb: mongoHealth.status === 'fulfilled' ? mongoHealth.value : { status: 'unhealthy' as const, details: { error: 'Health check failed' } },
      influxdb: influxHealth.status === 'fulfilled' ? influxHealth.value : { status: 'unhealthy' as const, details: { error: 'Health check failed' } },
      redis: redisHealth.status === 'fulfilled' ? redisHealth.value : { status: 'unhealthy' as const, details: { error: 'Health check failed' } },
    };

    // Determine overall health
    const healthyServices = Object.values(services).filter(service => service.status === 'healthy').length;
    const totalServices = Object.keys(services).length;

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyServices === totalServices) {
      overall = 'healthy';
    } else if (healthyServices > 0) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    return {
      overall,
      services,
      timestamp: new Date(),
    };
  }

  public isHealthy(): boolean {
    return this.isInitialized && 
           this.mongodb.isHealthy() && 
           (this.influxdb.isHealthy() || process.env.NODE_ENV !== 'production') &&
           (this.redis.isHealthy() || process.env.NODE_ENV !== 'production');
  }

  // Graceful shutdown handler
  public setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      try {
        await this.shutdown();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
  }
}