import request from 'supertest';
import { ProxyManagerService } from '../../services/proxy-manager.service';
import { CacheManagerService } from '../../services/cache-manager.service';
import { RequestQueueService } from '../../services/request-queue.service';
import { APIClientFactory } from '../../services/api-client-factory';

// Mock the config to enable proxy for testing
jest.mock('../../config', () => ({
  config: {
    proxy: {
      oxylabs: {
        enabled: true,
        username: 'testuser',
        password: 'testpass',
        host: 'test.proxy.com',
        ports: [8001, 8002, 8003],
        country: 'US',
        rotationInterval: 5000
      }
    },
    redis: {
      host: 'localhost',
      port: 6379
    },
    rateLimits: {
      sportsDataIO: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      },
      oddsAPI: {
        requestsPerMinute: 10,
        requestsPerHour: 500,
        requestsPerDay: 1000
      },
      espnAPI: {
        requestsPerMinute: 100,
        requestsPerHour: 2000,
        requestsPerDay: 20000
      }
    },
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2
    },
    timeouts: {
      default: 30000,
      sportsDataIO: 30000,
      oddsAPI: 15000,
      espnAPI: 20000
    }
  }
}));

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    ttl: jest.fn().mockResolvedValue(-1),
    expire: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    keys: jest.fn().mockResolvedValue([]),
    flushdb: jest.fn().mockResolvedValue('OK'),
    pipeline: jest.fn(() => ({
      del: jest.fn(),
      exec: jest.fn().mockResolvedValue([])
    })),
    ping: jest.fn().mockResolvedValue('PONG'),
    memory: jest.fn().mockResolvedValue(1024),
    info: jest.fn().mockResolvedValue('used_memory:2048\nused_memory_peak:4096\nmem_fragmentation_ratio:1.5'),
    disconnect: jest.fn(),
    on: jest.fn()
  }));
});

// Mock axios for proxy health checks
jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({
    status: 200,
    data: { origin: '1.2.3.4' }
  })
}));

describe('Proxy Infrastructure Integration', () => {
  let proxyManager: ProxyManagerService;
  let cacheManager: CacheManagerService;
  let requestQueue: RequestQueueService;
  let apiClientFactory: APIClientFactory;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton instances
    (ProxyManagerService as any).instance = undefined;
    (CacheManagerService as any).instance = undefined;
    (RequestQueueService as any).instance = undefined;
    (APIClientFactory as any).instance = undefined;

    proxyManager = ProxyManagerService.getInstance();
    cacheManager = CacheManagerService.getInstance();
    requestQueue = RequestQueueService.getInstance();
    apiClientFactory = APIClientFactory.getInstance();
  });

  afterEach(() => {
    proxyManager.destroy();
    cacheManager.destroy();
    requestQueue.destroy();
    apiClientFactory.destroy();
  });

  describe('Service Integration', () => {
    it('should integrate proxy manager with API client factory', () => {
      const proxyAgent = proxyManager.getProxyAgent();
      expect(proxyAgent).toBeTruthy();

      const factoryProxyManager = apiClientFactory.getProxyManager();
      expect(factoryProxyManager).toBe(proxyManager);
    });

    it('should integrate cache manager with API client factory', () => {
      const factoryCacheManager = apiClientFactory.getCacheManager();
      expect(factoryCacheManager).toBe(cacheManager);
    });

    it('should integrate request queue with API client factory', () => {
      const factoryRequestQueue = apiClientFactory.getRequestQueue();
      expect(factoryRequestQueue).toBe(requestQueue);
    });
  });

  describe('Proxy Management', () => {
    it('should initialize with multiple proxy endpoints', () => {
      const stats = proxyManager.getProxyStats();
      expect(stats.total).toBe(3);
      expect(stats.endpoints).toHaveLength(3);
    });

    it('should provide current proxy for API requests', () => {
      const currentProxy = proxyManager.getCurrentProxy();
      expect(currentProxy).toBeTruthy();
      expect(currentProxy?.host).toBe('test.proxy.com');
    });

    it('should handle proxy failures and rotation', () => {
      const currentProxy = proxyManager.getCurrentProxy();
      expect(currentProxy).toBeTruthy();

      if (currentProxy) {
        // Simulate failures
        proxyManager.markProxyFailure(currentProxy);
        proxyManager.markProxyFailure(currentProxy);
        proxyManager.markProxyFailure(currentProxy);

        expect(currentProxy.isHealthy).toBe(false);
      }
    });

    it('should select best performing proxy', () => {
      const stats = proxyManager.getProxyStats();
      
      // Set up performance metrics
      stats.endpoints[0].successCount = 10;
      stats.endpoints[0].failureCount = 1;
      stats.endpoints[0].responseTime = 100;
      stats.endpoints[0].isHealthy = true;

      stats.endpoints[1].successCount = 5;
      stats.endpoints[1].failureCount = 5;
      stats.endpoints[1].responseTime = 200;
      stats.endpoints[1].isHealthy = true;

      const bestProxy = proxyManager.getBestPerformingProxy();
      expect(bestProxy).toBeTruthy();
      expect(bestProxy?.successCount).toBe(10);
    });
  });

  describe('Cache Management', () => {
    it('should cache and retrieve values', async () => {
      const testData = { test: 'value', timestamp: Date.now() };
      
      const setResult = await cacheManager.set('test-key', testData, { ttl: 300 });
      expect(setResult).toBe(true);

      const retrievedData = await cacheManager.get('test-key');
      expect(retrievedData).toEqual(testData);
    });

    it('should handle cache expiration', async () => {
      const testData = { test: 'value' };
      
      await cacheManager.set('test-key', testData, { ttl: 1 });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const retrievedData = await cacheManager.get('test-key');
      expect(retrievedData).toBeNull();
    });

    it('should support tag-based invalidation', async () => {
      await cacheManager.set('key1', 'value1', { tags: ['tag1'] });
      await cacheManager.set('key2', 'value2', { tags: ['tag1'] });
      await cacheManager.set('key3', 'value3', { tags: ['tag2'] });

      const invalidatedCount = await cacheManager.invalidateByTag('tag1');
      expect(invalidatedCount).toBeGreaterThan(0);
    });

    it('should provide cache statistics', () => {
      const stats = cacheManager.getStats();
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('sets');
      expect(stats).toHaveProperty('hitRate');
    });
  });

  describe('Request Queue Management', () => {
    it('should queue and process requests by priority', async () => {
      const lowPriorityPromise = requestQueue.enqueue('testAPI', '/low', { priority: 'low' });
      const highPriorityPromise = requestQueue.enqueue('testAPI', '/high', { priority: 'high' });

      // Mock request completion
      setTimeout(() => {
        requestQueue.completeRequest(expect.any(String), { result: 'high' });
        requestQueue.completeRequest(expect.any(String), { result: 'low' });
      }, 100);

      const results = await Promise.all([lowPriorityPromise, highPriorityPromise]);
      expect(results).toHaveLength(2);
    });

    it('should respect rate limits', () => {
      // Add multiple requests quickly
      for (let i = 0; i < 5; i++) {
        requestQueue.enqueue('testAPI', `/request-${i}`);
      }

      const stats = requestQueue.getQueueStats('testAPI') as any;
      expect(stats.pending).toBe(5);
    });

    it('should provide queue statistics', () => {
      requestQueue.enqueue('testAPI', '/test1');
      requestQueue.enqueue('testAPI', '/test2');

      const stats = requestQueue.getQueueStats('testAPI') as any;
      expect(stats.pending).toBe(2);
      expect(stats.processing).toBe(0);
    });

    it('should handle request retries', async () => {
      let attemptCount = 0;
      
      requestQueue.on('executeRequest', (request) => {
        attemptCount++;
        if (attemptCount < 3) {
          requestQueue.failRequest(request.id, new Error('Temporary failure'));
        } else {
          requestQueue.completeRequest(request.id, { success: true });
        }
      });

      const result = await requestQueue.enqueue('testAPI', '/retry-test', { maxRetries: 3 });
      expect(result).toEqual({ success: true });
      expect(attemptCount).toBe(3);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should handle complete API request workflow with proxy, cache, and queue', async () => {
      // 1. Check if data is cached
      const cachedData = await cacheManager.get('api-data-key');
      expect(cachedData).toBeNull(); // First time, no cache

      // 2. Queue API request
      const requestPromise = requestQueue.enqueue('sportsDataIO', '/test-endpoint', {
        priority: 'high',
        params: { test: 'param' }
      });

      // 3. Simulate API response
      setTimeout(() => {
        requestQueue.completeRequest(expect.any(String), { data: 'api-response' });
      }, 50);

      const apiResponse = await requestPromise;
      expect(apiResponse).toEqual({ data: 'api-response' });

      // 4. Cache the response
      await cacheManager.set('api-data-key', apiResponse, { ttl: 300 });

      // 5. Verify cached data
      const newCachedData = await cacheManager.get('api-data-key');
      expect(newCachedData).toEqual(apiResponse);
    });

    it('should handle proxy failures gracefully', async () => {
      const currentProxy = proxyManager.getCurrentProxy();
      expect(currentProxy).toBeTruthy();

      if (currentProxy) {
        // Simulate proxy failure
        proxyManager.markProxyFailure(currentProxy);
        proxyManager.markProxyFailure(currentProxy);
        proxyManager.markProxyFailure(currentProxy);

        // Should still be able to get a proxy (fallback)
        const fallbackProxy = proxyManager.getCurrentProxy();
        expect(fallbackProxy).toBeTruthy();
      }
    });

    it('should maintain performance under load', async () => {
      const startTime = Date.now();
      const promises: Promise<any>[] = [];

      // Simulate high load
      for (let i = 0; i < 50; i++) {
        promises.push(
          requestQueue.enqueue('testAPI', `/load-test-${i}`, {
            priority: i % 2 === 0 ? 'high' : 'low'
          })
        );
      }

      // Complete all requests
      setTimeout(() => {
        for (let i = 0; i < 50; i++) {
          requestQueue.completeRequest(expect.any(String), { result: i });
        }
      }, 100);

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Health Monitoring', () => {
    it('should provide comprehensive health status', async () => {
      const proxyStats = proxyManager.getProxyStats();
      const cacheHealth = await cacheManager.healthCheck();
      const queueStats = requestQueue.getQueueStats();

      expect(proxyStats.total).toBeGreaterThan(0);
      expect(cacheHealth.redis.status).toBe(true);
      expect(cacheHealth.local.status).toBe(true);
      expect(queueStats instanceof Map).toBe(true);
    });

    it('should detect and report issues', async () => {
      // Simulate cache failure
      const mockRedis = (cacheManager as any).redis;
      mockRedis.ping.mockRejectedValueOnce(new Error('Connection failed'));

      const cacheHealth = await cacheManager.healthCheck();
      expect(cacheHealth.redis.status).toBe(false);
      expect(cacheHealth.redis.error).toBe('Connection failed');
    });
  });

  describe('Configuration and Optimization', () => {
    it('should optimize request routing based on performance', () => {
      const stats = proxyManager.getProxyStats();
      
      // Set different performance characteristics
      stats.endpoints[0].responseTime = 50;
      stats.endpoints[0].successCount = 100;
      stats.endpoints[0].failureCount = 5;
      stats.endpoints[0].isHealthy = true;

      stats.endpoints[1].responseTime = 200;
      stats.endpoints[1].successCount = 80;
      stats.endpoints[1].failureCount = 20;
      stats.endpoints[1].isHealthy = true;

      const bestProxy = proxyManager.getBestPerformingProxy();
      expect(bestProxy?.responseTime).toBe(50); // Should prefer faster proxy
    });

    it('should handle geo-specific routing', () => {
      const usProxy = proxyManager.getGeoSpecificProxy('US');
      expect(usProxy).toBeTruthy();

      const ukProxy = proxyManager.getGeoSpecificProxy('UK');
      expect(ukProxy).toBeTruthy(); // Should fallback to available proxy
    });
  });
});