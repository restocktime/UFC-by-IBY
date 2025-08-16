import Redis from 'ioredis';
import { databaseConfig } from './config';

export class RedisConnection {
  private static instance: RedisConnection;
  private client: Redis | null = null;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): RedisConnection {
    if (!RedisConnection.instance) {
      RedisConnection.instance = new RedisConnection();
    }
    return RedisConnection.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      const config = databaseConfig.redis;

      this.client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        retryDelayOnFailover: config.retryDelayOnFailover,
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        lazyConnect: config.lazyConnect,
        keepAlive: config.keepAlive,
        // Connection timeout
        connectTimeout: 10000,
        // Command timeout
        commandTimeout: 5000,
        // Retry strategy
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      // Set up event handlers
      this.client.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
      });

      this.client.on('error', (error) => {
        console.error('Redis connection error:', error);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.log('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('Redis reconnecting...');
      });

      this.client.on('ready', () => {
        console.log('Redis ready for commands');
        this.isConnected = true;
      });

      // Connect to Redis
      await this.client.connect();

    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      console.log('Redis disconnected');
    }
  }

  public getClient(): Redis {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not connected. Call connect() first.');
    }
    return this.client;
  }

  // Convenience methods for common operations
  public async get(key: string): Promise<string | null> {
    const client = this.getClient();
    return await client.get(key);
  }

  public async set(key: string, value: string, ttl?: number): Promise<void> {
    const client = this.getClient();
    if (ttl) {
      await client.setex(key, ttl, value);
    } else {
      await client.set(key, value);
    }
  }

  public async del(key: string): Promise<number> {
    const client = this.getClient();
    return await client.del(key);
  }

  public async exists(key: string): Promise<number> {
    const client = this.getClient();
    return await client.exists(key);
  }

  public async expire(key: string, seconds: number): Promise<number> {
    const client = this.getClient();
    return await client.expire(key, seconds);
  }

  public async hget(key: string, field: string): Promise<string | null> {
    const client = this.getClient();
    return await client.hget(key, field);
  }

  public async hset(key: string, field: string, value: string): Promise<number> {
    const client = this.getClient();
    return await client.hset(key, field, value);
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    const client = this.getClient();
    return await client.hgetall(key);
  }

  public async sadd(key: string, ...members: string[]): Promise<number> {
    const client = this.getClient();
    return await client.sadd(key, ...members);
  }

  public async smembers(key: string): Promise<string[]> {
    const client = this.getClient();
    return await client.smembers(key);
  }

  public async zadd(key: string, score: number, member: string): Promise<number> {
    const client = this.getClient();
    return await client.zadd(key, score, member);
  }

  public async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const client = this.getClient();
    return await client.zrange(key, start, stop);
  }

  public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      if (!this.client || !this.isConnected) {
        return {
          status: 'unhealthy',
          details: { error: 'Not connected to Redis' }
        };
      }

      // Test with ping
      const pong = await this.client.ping();
      
      // Get server info
      const info = await this.client.info('server');
      const memory = await this.client.info('memory');

      return {
        status: 'healthy',
        details: {
          connected: this.isConnected,
          ping: pong,
          host: databaseConfig.redis.host,
          port: databaseConfig.redis.port,
          db: databaseConfig.redis.db,
          serverInfo: info,
          memoryInfo: memory
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