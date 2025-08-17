import { APIClientFactory } from '../api-client-factory';
import { config } from '../../config';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock the config
jest.mock('../../config', () => ({
  config: {
    proxy: {
      oxylabs: {
        enabled: false,
        username: 'test_user',
        password: 'test_pass',
        host: 'test.proxy.com',
        ports: [8001, 8002],
        country: 'US',
        rotationInterval: 5000
      }
    },
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2
    },
    timeouts: {
      default: 30000
    }
  }
}));

describe('APIClientFactory', () => {
  let factory: APIClientFactory;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    factory = APIClientFactory.getInstance();
    mockAdapter = new MockAdapter(axios);
  });

  afterEach(() => {
    mockAdapter.restore();
    factory.destroy();
    jest.clearAllMocks();
  });

  describe('Client Creation', () => {
    it('should create a client with basic configuration', () => {
      const client = factory.createClient('test', {
        baseURL: 'https://api.test.com',
        timeout: 5000
      });

      expect(client).toBeDefined();
      expect(client.defaults.baseURL).toBe('https://api.test.com');
      expect(client.defaults.timeout).toBe(5000);
    });

    it('should create a client with rate limiting configuration', () => {
      const client = factory.createClient('test-rate-limited', {
        baseURL: 'https://api.test.com',
        rateLimitConfig: {
          requestsPerMinute: 10,
          requestsPerHour: 100,
          requestsPerDay: 1000
        }
      });

      expect(client).toBeDefined();
    });

    it('should create a client with custom headers', () => {
      const customHeaders = {
        'Custom-Header': 'test-value',
        'Authorization': 'Bearer token'
      };

      const client = factory.createClient('test-headers', {
        baseURL: 'https://api.test.com',
        headers: customHeaders
      });

      expect(client.defaults.headers['Custom-Header']).toBe('test-value');
      expect(client.defaults.headers['Authorization']).toBe('Bearer token');
    });
  });

  describe('Rate Limiting', () => {
    it('should track rate limits correctly', async () => {
      const client = factory.createClient('rate-test', {
        baseURL: 'https://api.test.com',
        rateLimitConfig: {
          requestsPerMinute: 2,
          requestsPerHour: 10,
          requestsPerDay: 100
        }
      });

      mockAdapter.onGet('/test').reply(200, { success: true });

      // Make first request
      await client.get('/test');
      
      // Make second request
      await client.get('/test');

      const rateLimitStatus = factory.getRateLimitStatus();
      expect(rateLimitStatus['rate-test']).toBeDefined();
      expect(rateLimitStatus['rate-test'].requests).toBe(2);
    });

    it('should handle rate limit exceeded scenarios', async () => {
      const client = factory.createClient('rate-limit-test', {
        baseURL: 'https://api.test.com',
        rateLimitConfig: {
          requestsPerMinute: 1,
          requestsPerHour: 10,
          requestsPerDay: 100
        }
      });

      mockAdapter.onGet('/test').reply(200, { success: true });

      // Make first request (should succeed)
      await client.get('/test');

      // Mock the delay function to avoid waiting in tests
      const originalDelay = (factory as any).delay;
      (factory as any).delay = jest.fn().mockResolvedValue(undefined);

      // Make second request (should be rate limited but then succeed)
      await client.get('/test');

      expect((factory as any).delay).toHaveBeenCalled();

      // Restore original delay function
      (factory as any).delay = originalDelay;
    });
  });

  describe('Retry Logic', () => {
    it('should retry on 5xx errors', async () => {
      const client = factory.createClient('retry-test', {
        baseURL: 'https://api.test.com',
        retryConfig: {
          maxRetries: 2,
          baseDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2
        }
      });

      // First call fails with 500, second succeeds
      mockAdapter
        .onGet('/test')
        .replyOnce(500, { error: 'Server Error' })
        .onGet('/test')
        .replyOnce(200, { success: true });

      const response = await client.get('/test');
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should retry on network errors', async () => {
      const client = factory.createClient('network-retry-test', {
        baseURL: 'https://api.test.com',
        retryConfig: {
          maxRetries: 2,
          baseDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2
        }
      });

      // First call fails with network error, second succeeds
      mockAdapter
        .onGet('/test')
        .networkErrorOnce()
        .onGet('/test')
        .replyOnce(200, { success: true });

      const response = await client.get('/test');
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should not retry on 4xx errors (except specific ones)', async () => {
      const client = factory.createClient('no-retry-test', {
        baseURL: 'https://api.test.com',
        retryConfig: {
          maxRetries: 2,
          baseDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2
        }
      });

      mockAdapter.onGet('/test').reply(404, { error: 'Not Found' });

      try {
        await client.get('/test');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    it('should respect max retry limit', async () => {
      const client = factory.createClient('max-retry-test', {
        baseURL: 'https://api.test.com',
        retryConfig: {
          maxRetries: 2,
          baseDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2
        }
      });

      // Always return 500 error
      mockAdapter.onGet('/test').reply(500, { error: 'Server Error' });

      try {
        await client.get('/test');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(500);
      }
    });
  });

  describe('Health Check', () => {
    it('should perform health checks on all clients', async () => {
      const client1 = factory.createClient('health-test-1', {
        baseURL: 'https://api1.test.com'
      });

      const client2 = factory.createClient('health-test-2', {
        baseURL: 'https://api2.test.com'
      });

      mockAdapter
        .onGet('https://api1.test.com/health').reply(200, { status: 'ok' })
        .onGet('https://api2.test.com/health').reply(500, { error: 'Server Error' });

      const healthStatus = await factory.healthCheck();

      expect(healthStatus['health-test-1'].status).toBe(true);
      expect(healthStatus['health-test-1'].responseTime).toBeGreaterThan(0);
      expect(healthStatus['health-test-2'].status).toBe(false);
      expect(healthStatus['health-test-2'].error).toBeDefined();
    });
  });

  describe('Proxy Configuration', () => {
    it('should handle proxy configuration when enabled', () => {
      // Mock proxy enabled
      (config.proxy.oxylabs as any).enabled = true;

      const client = factory.createClient('proxy-test', {
        baseURL: 'https://api.test.com',
        useProxy: true
      });

      expect(client).toBeDefined();
      
      // Reset proxy config
      (config.proxy.oxylabs as any).enabled = false;
    });

    it('should not use proxy when disabled', () => {
      const client = factory.createClient('no-proxy-test', {
        baseURL: 'https://api.test.com',
        useProxy: false
      });

      expect(client).toBeDefined();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const factory1 = APIClientFactory.getInstance();
      const factory2 = APIClientFactory.getInstance();

      expect(factory1).toBe(factory2);
    });
  });

  describe('Client Retrieval', () => {
    it('should retrieve existing clients', () => {
      const client = factory.createClient('retrieval-test', {
        baseURL: 'https://api.test.com'
      });

      const retrievedClient = factory.getClient('retrieval-test');
      expect(retrievedClient).toBe(client);
    });

    it('should return undefined for non-existent clients', () => {
      const retrievedClient = factory.getClient('non-existent');
      expect(retrievedClient).toBeUndefined();
    });
  });
});