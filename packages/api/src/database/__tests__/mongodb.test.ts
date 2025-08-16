import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoDBConnection } from '../mongodb';

// Mock MongoDB
vi.mock('mongodb', () => ({
  MongoClient: vi.fn(),
}));

describe('MongoDBConnection', () => {
  let mongoConnection: MongoDBConnection;
  let mockClient: any;
  let mockDb: any;

  beforeEach(() => {
    // Reset the singleton instance
    (MongoDBConnection as any).instance = undefined;
    mongoConnection = MongoDBConnection.getInstance();

    // Create mock objects
    mockDb = {
      admin: vi.fn().mockReturnValue({
        ping: vi.fn().mockResolvedValue({}),
        serverStatus: vi.fn().mockResolvedValue({
          host: 'localhost:27017',
          version: '6.0.0',
          uptime: 12345,
          connections: { current: 5, available: 995 }
        })
      })
    };

    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      db: vi.fn().mockReturnValue(mockDb),
      on: vi.fn(),
    };

    (MongoClient as any).mockImplementation(() => mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = MongoDBConnection.getInstance();
      const instance2 = MongoDBConnection.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('connect', () => {
    it('should connect to MongoDB successfully', async () => {
      await mongoConnection.connect();

      expect(MongoClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxPoolSize: expect.any(Number),
          minPoolSize: expect.any(Number),
        })
      );
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.db).toHaveBeenCalled();
    });

    it('should not reconnect if already connected', async () => {
      await mongoConnection.connect();
      await mongoConnection.connect();

      expect(mockClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockClient.connect.mockRejectedValue(error);

      await expect(mongoConnection.connect()).rejects.toThrow('Connection failed');
    });

    it('should set up event handlers', async () => {
      await mongoConnection.connect();

      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('reconnect', expect.any(Function));
    });
  });

  describe('disconnect', () => {
    it('should disconnect from MongoDB', async () => {
      await mongoConnection.connect();
      await mongoConnection.disconnect();

      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', async () => {
      await expect(mongoConnection.disconnect()).resolves.not.toThrow();
    });
  });

  describe('getDb', () => {
    it('should return database instance when connected', async () => {
      await mongoConnection.connect();
      const db = mongoConnection.getDb();

      expect(db).toBe(mockDb);
    });

    it('should throw error when not connected', () => {
      expect(() => mongoConnection.getDb()).toThrow('MongoDB not connected');
    });
  });

  describe('getClient', () => {
    it('should return client instance when connected', async () => {
      await mongoConnection.connect();
      const client = mongoConnection.getClient();

      expect(client).toBe(mockClient);
    });

    it('should throw error when not connected', () => {
      expect(() => mongoConnection.getClient()).toThrow('MongoDB not connected');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when connected', async () => {
      await mongoConnection.connect();
      const health = await mongoConnection.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details).toMatchObject({
        connected: true,
        host: 'localhost:27017',
        version: '6.0.0',
      });
    });

    it('should return unhealthy status when not connected', async () => {
      const health = await mongoConnection.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.error).toBe('Not connected to MongoDB');
    });

    it('should return unhealthy status on ping failure', async () => {
      await mongoConnection.connect();
      mockDb.admin().ping.mockRejectedValue(new Error('Ping failed'));

      const health = await mongoConnection.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.error).toBe('Ping failed');
    });
  });

  describe('isHealthy', () => {
    it('should return true when connected', async () => {
      await mongoConnection.connect();
      expect(mongoConnection.isHealthy()).toBe(true);
    });

    it('should return false when not connected', () => {
      expect(mongoConnection.isHealthy()).toBe(false);
    });
  });
});