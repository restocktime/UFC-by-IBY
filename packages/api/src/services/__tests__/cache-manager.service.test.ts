import { CacheManagerService } from '../cache-manager.service';
import Redis from 'ioredis';

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    ttl: jest.fn(),
    expire: jest.fn(),
    sadd: jest.fn(),
    smembers: jest.fn(),
    keys: jest.fn(),
    flushdb: jest.fn(),
    pipeline: jest.fn(() => ({
      del: jest.fn(),
      exec: jest.fn()
    })),
    ping: jest.fn(),
    memory: jest.fn(),
    info: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn()
  }));
});

describe('CacheManagerService', () => {
  let cacheManager: CacheManagerService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton instance
    (CacheManagerService as any).instance = undefined;
    cacheManager = CacheManagerService.getInstance();
    mockRedis = (cacheManager as any).redis;
  });

  afterEach(() => {
    cacheManager.destroy();
  });

  describe('Initialization', () => {
    it('should create singleton instance', () => {
      const instance1 = CacheManagerService.getInstance();
      const instance2 = CacheManagerService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should initialize Redis connection', () => {
      expect(Redis).toHaveBeenCalledWith(expect.objectContaining({
        host: expect.any(String),
        port: expect.any(Number)
      }));
    });
  });

  describe('Cache Operations', () => {
    describe('get', () => {
      it('should return cached value from local cache', async () => {
        const testValue = { test: 'data' };
        
        // Set up local cache entry
        const localCache = (cacheManager as any).localCache;
        localCache.set('test-key', {
          value: testValue,
          timestamp: Date.now(),
          ttl: 300,
          tags: [],
          size: JSON.stringify(testValue).length
        });

        const result = await cacheManager.get('test-key');
        expect(result).toEqual(testValue);
        expect(mockRedis.get).not.toHaveBeenCalled();
      });

      it('should return cached value from Redis when not in local cache', async () => {
        const testValue = { test: 'data' };
        mockRedis.get.mockResolvedValueOnce(JSON.stringify(testValue));

        const result = await cacheManager.get('test-key');
        expect(result).toEqual(testValue);
        expect(mockRedis.get).toHaveBeenCalledWith('test-key');
      });

      it('should return null when key not found', async () => {
        mockRedis.get.mockResolvedValueOnce(null);

        const result = await cacheManager.get('nonexistent-key');
        expect(result).toBeNull();
      });

      it('should handle Redis errors gracefully', async () => {
        mockRedis.get.mockRejectedValueOnce(new Error('Redis error'));

        const result = await cacheManager.get('test-key');
        expect(result).toBeNull();
      });

      it('should use namespace in cache key', async () => {
        mockRedis.get.mockResolvedValueOnce(null);

        await cacheManager.get('test-key', 'test-namespace');
        expect(mockRedis.get).toHaveBeenCalledWith('test-namespace:test-key');
      });
    });

    describe('set', () => {
      it('should store value in Redis with TTL', async () => {
        const testValue = { test: 'data' };
        mockRedis.setex.mockResolvedValueOnce('OK');

        const result = await cacheManager.set('test-key', testValue, { ttl: 300 });
        expect(result).toBe(true);
        expect(mockRedis.setex).toHaveBeenCalledWith(
          'test-key',
          300,
          JSON.stringify(testValue)
        );
      });

      it('should store value without TTL', async () => {
        const testValue = { test: 'data' };
        mockRedis.set.mockResolvedValueOnce('OK');

        const result = await cacheManager.set('test-key', testValue, { ttl: 0 });
        expect(result).toBe(true);
        expect(mockRedis.set).toHaveBeenCalledWith(
          'test-key',
          JSON.stringify(testValue)
        );
      });

      it('should handle cache tags', async () => {
        const testValue = { test: 'data' };
        mockRedis.setex.mockResolvedValueOnce('OK');
        mockRedis.sadd.mockResolvedValueOnce(1);
        mockRedis.expire.mockResolvedValueOnce(1);

        const result = await cacheManager.set('test-key', testValue, {
          ttl: 300,
          tags: ['tag1', 'tag2']
        });

        expect(result).toBe(true);
        expect(mockRedis.sadd).toHaveBeenCalledWith('tag:tag1', 'test-key');
        expect(mockRedis.sadd).toHaveBeenCalledWith('tag:tag2', 'test-key');
      });

      it('should store in local cache for small values', async () => {
        const testValue = { test: 'data' };
        mockRedis.setex.mockResolvedValueOnce('OK');

        await cacheManager.set('test-key', testValue, { ttl: 300 });

        const localCache = (cacheManager as any).localCache;
        expect(localCache.has('test-key')).toBe(true);
      });

      it('should handle Redis errors', async () => {
        const testValue = { test: 'data' };
        mockRedis.setex.mockRejectedValueOnce(new Error('Redis error'));

        const result = await cacheManager.set('test-key', testValue);
        expect(result).toBe(false);
      });
    });

    describe('delete', () => {
      it('should delete from both local and Redis cache', async () => {
        mockRedis.del.mockResolvedValueOnce(1);

        const result = await cacheManager.delete('test-key');
        expect(result).toBe(true);
        expect(mockRedis.del).toHaveBeenCalledWith('test-key');
      });

      it('should return false when key not found', async () => {
        mockRedis.del.mockResolvedValueOnce(0);

        const result = await cacheManager.delete('nonexistent-key');
        expect(result).toBe(false);
      });
    });

    describe('exists', () => {
      it('should check local cache first', async () => {
        const localCache = (cacheManager as any).localCache;
        localCache.set('test-key', {
          value: 'test',
          timestamp: Date.now(),
          ttl: 300,
          tags: [],
          size: 4
        });

        const result = await cacheManager.exists('test-key');
        expect(result).toBe(true);
        expect(mockRedis.exists).not.toHaveBeenCalled();
      });

      it('should check Redis when not in local cache', async () => {
        mockRedis.exists.mockResolvedValueOnce(1);

        const result = await cacheManager.exists('test-key');
        expect(result).toBe(true);
        expect(mockRedis.exists).toHaveBeenCalledWith('test-key');
      });
    });

    describe('getTTL', () => {
      it('should return TTL from Redis', async () => {
        mockRedis.ttl.mockResolvedValueOnce(300);

        const result = await cacheManager.getTTL('test-key');
        expect(result).toBe(300);
        expect(mockRedis.ttl).toHaveBeenCalledWith('test-key');
      });

      it('should return -1 on error', async () => {
        mockRedis.ttl.mockRejectedValueOnce(new Error('Redis error'));

        const result = await cacheManager.getTTL('test-key');
        expect(result).toBe(-1);
      });
    });

    describe('extend', () => {
      it('should extend TTL for existing key', async () => {
        mockRedis.ttl.mockResolvedValueOnce(100);
        mockRedis.expire.mockResolvedValueOnce(1);

        const result = await cacheManager.extend('test-key', 200);
        expect(result).toBe(true);
        expect(mockRedis.expire).toHaveBeenCalledWith('test-key', 300);
      });

      it('should return false for non-existent key', async () => {
        mockRedis.ttl.mockResolvedValueOnce(-2);

        const result = await cacheManager.extend('test-key', 200);
        expect(result).toBe(false);
      });
    });
  });

  describe('Tag-based Invalidation', () => {
    it('should invalidate all keys with specific tag', async () => {
      const keys = ['key1', 'key2', 'key3'];
      mockRedis.smembers.mockResolvedValueOnce(keys);
      
      const mockPipeline = {
        del: jest.fn(),
        exec: jest.fn().mockResolvedValueOnce([
          [null, 1], [null, 1], [null, 1], [null, 1]
        ])
      };
      mockRedis.pipeline.mockReturnValueOnce(mockPipeline as any);

      const result = await cacheManager.invalidateByTag('test-tag');
      expect(result).toBe(4); // 3 keys + 1 tag key
      expect(mockRedis.smembers).toHaveBeenCalledWith('tag:test-tag');
    });
  });

  describe('Namespace Operations', () => {
    it('should clear specific namespace', async () => {
      const keys = ['ns:key1', 'ns:key2'];
      mockRedis.keys.mockResolvedValueOnce(keys);
      mockRedis.del.mockResolvedValueOnce(2);

      const result = await cacheManager.clear('ns');
      expect(result).toBe(2);
      expect(mockRedis.keys).toHaveBeenCalledWith('ns:*');
    });

    it('should clear all cache', async () => {
      mockRedis.flushdb.mockResolvedValueOnce('OK');

      const result = await cacheManager.clear();
      expect(result).toBe(1);
      expect(mockRedis.flushdb).toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should return cache statistics', () => {
      const stats = cacheManager.getStats();
      
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('sets');
      expect(stats).toHaveProperty('deletes');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats).toHaveProperty('keyCount');
    });

    it('should calculate hit rate correctly', async () => {
      // Simulate cache hits and misses
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ test: 'data' }));
      await cacheManager.get('key1');

      mockRedis.get.mockResolvedValueOnce(null);
      await cacheManager.get('key2');

      const stats = cacheManager.getStats();
      expect(stats.hitRate).toBe(50); // 1 hit, 1 miss = 50%
    });
  });

  describe('Memory Information', () => {
    it('should return memory information', async () => {
      mockRedis.memory.mockResolvedValueOnce(1024);
      mockRedis.info.mockResolvedValueOnce(
        'used_memory:2048\nused_memory_peak:4096\nmem_fragmentation_ratio:1.5'
      );

      const memInfo = await cacheManager.getMemoryInfo();
      
      expect(memInfo).toHaveProperty('redis');
      expect(memInfo).toHaveProperty('local');
      expect(memInfo.redis.used).toBe(2048);
      expect(memInfo.redis.peak).toBe(4096);
      expect(memInfo.redis.fragmentation).toBe(1.5);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when Redis is available', async () => {
      mockRedis.ping.mockResolvedValueOnce('PONG');

      const health = await cacheManager.healthCheck();
      
      expect(health.redis.status).toBe(true);
      expect(health.redis.responseTime).toBeGreaterThan(0);
      expect(health.local.status).toBe(true);
    });

    it('should return unhealthy status when Redis is unavailable', async () => {
      mockRedis.ping.mockRejectedValueOnce(new Error('Connection failed'));

      const health = await cacheManager.healthCheck();
      
      expect(health.redis.status).toBe(false);
      expect(health.redis.error).toBe('Connection failed');
      expect(health.local.status).toBe(true);
    });
  });

  describe('Local Cache Management', () => {
    it('should evict old entries when cache is full', async () => {
      const localCache = (cacheManager as any).localCache;
      const maxSize = (cacheManager as any).maxLocalCacheSize;

      // Fill cache beyond max size
      for (let i = 0; i < maxSize + 100; i++) {
        localCache.set(`key${i}`, {
          value: `value${i}`,
          timestamp: Date.now() - (maxSize - i) * 1000, // Older entries have earlier timestamps
          ttl: 300,
          tags: [],
          size: 10
        });
      }

      // Trigger eviction
      (cacheManager as any).evictLocalCache();

      expect(localCache.size).toBeLessThanOrEqual(maxSize);
    });

    it('should remove expired entries from local cache', async () => {
      const localCache = (cacheManager as any).localCache;
      
      // Add expired entry
      localCache.set('expired-key', {
        value: 'test',
        timestamp: Date.now() - 400000, // 400 seconds ago
        ttl: 300, // 5 minutes TTL
        tags: [],
        size: 4
      });

      mockRedis.get.mockResolvedValueOnce(null);
      
      const result = await cacheManager.get('expired-key');
      expect(result).toBeNull();
      expect(localCache.has('expired-key')).toBe(false);
    });
  });
});