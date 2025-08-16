import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import { RedisConnection } from '../redis';

// Mock ioredis
vi.mock('ioredis', () => {
  return {
    default: vi.fn(),
  };
});

describe('RedisConnection', () => {
  let redisConnection: RedisConnection;
  let mockClient: any;

  beforeEach(() => {
    // Reset the singleton instance
    (RedisConnection as any).instance = undefined;
    redisConnection = RedisConnection.getInstance();

    // Create mock Redis client
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
      info: vi.fn().mockResolvedValue('redis_version:6.2.0'),
      get: vi.fn(),
      set: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
      expire: vi.fn(),
      hget: vi.fn(),
      hset: vi.fn(),
      hgetall: vi.fn(),
      sadd: vi.fn(),
      smembers: vi.fn(),
      zadd: vi.fn(),
      zrange: vi.fn(),
    };

    (Redis as any).mockImplementation(() => mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = RedisConnection.getInstance();
      const instance2 = RedisConnection.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('connect', () => {
    it('should connect to Redis successfully', async () => {
      await redisConnection.connect();

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: expect.any(String),
          port: expect.any(Number),
          lazyConnect: true,
        })
      );
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('should not reconnect if already connected', async () => {
      // Simulate successful connection
      mockClient.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') {
          callback();
        }
      });

      await redisConnection.connect();
      await redisConnection.connect();

      expect(mockClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockClient.connect.mockRejectedValue(error);

      await expect(redisConnection.connect()).rejects.toThrow('Connection failed');
    });

    it('should set up event handlers', async () => {
      await redisConnection.connect();

      expect(mockClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Redis', async () => {
      // Simulate connection
      mockClient.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') callback();
      });
      
      await redisConnection.connect();
      await redisConnection.disconnect();

      expect(mockClient.quit).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', async () => {
      await expect(redisConnection.disconnect()).resolves.not.toThrow();
    });
  });

  describe('getClient', () => {
    it('should return client instance when connected', async () => {
      // Simulate connection
      mockClient.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') callback();
      });

      await redisConnection.connect();
      const client = redisConnection.getClient();

      expect(client).toBe(mockClient);
    });

    it('should throw error when not connected', () => {
      expect(() => redisConnection.getClient()).toThrow('Redis not connected');
    });
  });

  describe('convenience methods', () => {
    beforeEach(async () => {
      // Simulate connection
      mockClient.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') callback();
      });
      await redisConnection.connect();
    });

    it('should call get method', async () => {
      mockClient.get.mockResolvedValue('value');
      const result = await redisConnection.get('key');

      expect(mockClient.get).toHaveBeenCalledWith('key');
      expect(result).toBe('value');
    });

    it('should call set method without TTL', async () => {
      await redisConnection.set('key', 'value');

      expect(mockClient.set).toHaveBeenCalledWith('key', 'value');
    });

    it('should call set method with TTL', async () => {
      await redisConnection.set('key', 'value', 3600);

      expect(mockClient.setex).toHaveBeenCalledWith('key', 3600, 'value');
    });

    it('should call del method', async () => {
      mockClient.del.mockResolvedValue(1);
      const result = await redisConnection.del('key');

      expect(mockClient.del).toHaveBeenCalledWith('key');
      expect(result).toBe(1);
    });

    it('should call hash methods', async () => {
      mockClient.hget.mockResolvedValue('value');
      mockClient.hset.mockResolvedValue(1);
      mockClient.hgetall.mockResolvedValue({ field: 'value' });

      await redisConnection.hget('key', 'field');
      await redisConnection.hset('key', 'field', 'value');
      await redisConnection.hgetall('key');

      expect(mockClient.hget).toHaveBeenCalledWith('key', 'field');
      expect(mockClient.hset).toHaveBeenCalledWith('key', 'field', 'value');
      expect(mockClient.hgetall).toHaveBeenCalledWith('key');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when connected', async () => {
      // Simulate connection
      mockClient.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') callback();
      });

      await redisConnection.connect();
      const health = await redisConnection.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details).toMatchObject({
        connected: true,
        ping: 'PONG',
      });
    });

    it('should return unhealthy status when not connected', async () => {
      const health = await redisConnection.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.error).toBe('Not connected to Redis');
    });

    it('should return unhealthy status on ping failure', async () => {
      // Simulate connection
      mockClient.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') callback();
      });

      await redisConnection.connect();
      mockClient.ping.mockRejectedValue(new Error('Ping failed'));

      const health = await redisConnection.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.error).toBe('Ping failed');
    });
  });

  describe('isHealthy', () => {
    it('should return true when connected', async () => {
      // Simulate connection
      mockClient.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'connect') callback();
      });

      await redisConnection.connect();
      expect(redisConnection.isHealthy()).toBe(true);
    });

    it('should return false when not connected', () => {
      expect(redisConnection.isHealthy()).toBe(false);
    });
  });
});