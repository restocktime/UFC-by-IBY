import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../manager';
import { MongoDBConnection } from '../mongodb';
import { InfluxDBConnection } from '../influxdb';
import { RedisConnection } from '../redis';

// Mock the database connections
vi.mock('../mongodb');
vi.mock('../influxdb');
vi.mock('../redis');

describe('DatabaseManager', () => {
  let databaseManager: DatabaseManager;
  let mockMongoDB: any;
  let mockInfluxDB: any;
  let mockRedis: any;

  beforeEach(() => {
    // Reset the singleton instance
    (DatabaseManager as any).instance = undefined;
    databaseManager = DatabaseManager.getInstance();

    // Create mock instances
    mockMongoDB = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', details: {} }),
      isHealthy: vi.fn().mockReturnValue(true),
    };

    mockInfluxDB = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', details: {} }),
      isHealthy: vi.fn().mockReturnValue(true),
    };

    mockRedis = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', details: {} }),
      isHealthy: vi.fn().mockReturnValue(true),
    };

    // Mock the getInstance methods
    (MongoDBConnection.getInstance as any).mockReturnValue(mockMongoDB);
    (InfluxDBConnection.getInstance as any).mockReturnValue(mockInfluxDB);
    (RedisConnection.getInstance as any).mockReturnValue(mockRedis);
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset NODE_ENV
    delete process.env.NODE_ENV;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = DatabaseManager.getInstance();
      const instance2 = DatabaseManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should initialize all database connections successfully', async () => {
      await databaseManager.initialize();

      expect(mockMongoDB.connect).toHaveBeenCalled();
      expect(mockInfluxDB.connect).toHaveBeenCalled();
      expect(mockRedis.connect).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      await databaseManager.initialize();
      await databaseManager.initialize();

      expect(mockMongoDB.connect).toHaveBeenCalledTimes(1);
      expect(mockInfluxDB.connect).toHaveBeenCalledTimes(1);
      expect(mockRedis.connect).toHaveBeenCalledTimes(1);
    });

    it('should throw error if MongoDB connection fails', async () => {
      mockMongoDB.connect.mockRejectedValue(new Error('MongoDB connection failed'));

      await expect(databaseManager.initialize()).rejects.toThrow('MongoDB connection failed');
    });

    it('should handle InfluxDB connection failure in development', async () => {
      process.env.NODE_ENV = 'development';
      mockInfluxDB.connect.mockRejectedValue(new Error('InfluxDB connection failed'));

      await expect(databaseManager.initialize()).resolves.not.toThrow();
    });

    it('should throw error if InfluxDB connection fails in production', async () => {
      process.env.NODE_ENV = 'production';
      mockInfluxDB.connect.mockRejectedValue(new Error('InfluxDB connection failed'));

      await expect(databaseManager.initialize()).rejects.toThrow('InfluxDB connection failed');
    });

    it('should handle Redis connection failure in development', async () => {
      process.env.NODE_ENV = 'development';
      mockRedis.connect.mockRejectedValue(new Error('Redis connection failed'));

      await expect(databaseManager.initialize()).resolves.not.toThrow();
    });

    it('should throw error if Redis connection fails in production', async () => {
      process.env.NODE_ENV = 'production';
      mockRedis.connect.mockRejectedValue(new Error('Redis connection failed'));

      await expect(databaseManager.initialize()).rejects.toThrow('Redis connection failed');
    });
  });

  describe('shutdown', () => {
    it('should shutdown all database connections', async () => {
      await databaseManager.initialize();
      await databaseManager.shutdown();

      expect(mockMongoDB.disconnect).toHaveBeenCalled();
      expect(mockInfluxDB.disconnect).toHaveBeenCalled();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully', async () => {
      await databaseManager.initialize();
      
      mockMongoDB.disconnect.mockRejectedValue(new Error('MongoDB disconnect failed'));
      mockInfluxDB.disconnect.mockRejectedValue(new Error('InfluxDB disconnect failed'));
      mockRedis.disconnect.mockRejectedValue(new Error('Redis disconnect failed'));

      await expect(databaseManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('getters', () => {
    it('should return database instances when initialized', async () => {
      await databaseManager.initialize();

      expect(databaseManager.getMongoDB()).toBe(mockMongoDB);
      expect(databaseManager.getInfluxDB()).toBe(mockInfluxDB);
      expect(databaseManager.getRedis()).toBe(mockRedis);
    });

    it('should throw error when not initialized', () => {
      expect(() => databaseManager.getMongoDB()).toThrow('DatabaseManager not initialized');
      expect(() => databaseManager.getInfluxDB()).toThrow('DatabaseManager not initialized');
      expect(() => databaseManager.getRedis()).toThrow('DatabaseManager not initialized');
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      await databaseManager.initialize();
    });

    it('should return healthy status when all services are healthy', async () => {
      const health = await databaseManager.healthCheck();

      expect(health.overall).toBe('healthy');
      expect(health.services.mongodb.status).toBe('healthy');
      expect(health.services.influxdb.status).toBe('healthy');
      expect(health.services.redis.status).toBe('healthy');
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    it('should return degraded status when some services are unhealthy', async () => {
      mockInfluxDB.healthCheck.mockResolvedValue({ status: 'unhealthy', details: { error: 'Connection lost' } });

      const health = await databaseManager.healthCheck();

      expect(health.overall).toBe('degraded');
      expect(health.services.mongodb.status).toBe('healthy');
      expect(health.services.influxdb.status).toBe('unhealthy');
      expect(health.services.redis.status).toBe('healthy');
    });

    it('should return unhealthy status when all services are unhealthy', async () => {
      mockMongoDB.healthCheck.mockResolvedValue({ status: 'unhealthy', details: { error: 'Connection lost' } });
      mockInfluxDB.healthCheck.mockResolvedValue({ status: 'unhealthy', details: { error: 'Connection lost' } });
      mockRedis.healthCheck.mockResolvedValue({ status: 'unhealthy', details: { error: 'Connection lost' } });

      const health = await databaseManager.healthCheck();

      expect(health.overall).toBe('unhealthy');
      expect(health.services.mongodb.status).toBe('unhealthy');
      expect(health.services.influxdb.status).toBe('unhealthy');
      expect(health.services.redis.status).toBe('unhealthy');
    });

    it('should handle health check failures', async () => {
      mockMongoDB.healthCheck.mockRejectedValue(new Error('Health check failed'));

      const health = await databaseManager.healthCheck();

      expect(health.services.mongodb.status).toBe('unhealthy');
      expect(health.services.mongodb.details.error).toBe('Health check failed');
    });
  });

  describe('isHealthy', () => {
    it('should return true when all services are healthy', async () => {
      await databaseManager.initialize();
      expect(databaseManager.isHealthy()).toBe(true);
    });

    it('should return false when not initialized', () => {
      expect(databaseManager.isHealthy()).toBe(false);
    });

    it('should return false when MongoDB is unhealthy', async () => {
      await databaseManager.initialize();
      mockMongoDB.isHealthy.mockReturnValue(false);

      expect(databaseManager.isHealthy()).toBe(false);
    });

    it('should return true in development when optional services are unhealthy', async () => {
      process.env.NODE_ENV = 'development';
      await databaseManager.initialize();
      
      mockInfluxDB.isHealthy.mockReturnValue(false);
      mockRedis.isHealthy.mockReturnValue(false);

      expect(databaseManager.isHealthy()).toBe(true);
    });

    it('should return false in production when optional services are unhealthy', async () => {
      process.env.NODE_ENV = 'production';
      await databaseManager.initialize();
      
      mockInfluxDB.isHealthy.mockReturnValue(false);

      expect(databaseManager.isHealthy()).toBe(false);
    });
  });

  describe('setupGracefulShutdown', () => {
    it('should set up process event listeners', () => {
      const originalOn = process.on;
      const mockOn = vi.fn();
      process.on = mockOn;

      databaseManager.setupGracefulShutdown();

      expect(mockOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));

      // Restore original process.on
      process.on = originalOn;
    });
  });
});