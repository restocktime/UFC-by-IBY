import { ProxyManagerService, ProxyEndpoint } from '../proxy-manager.service';
import { config } from '../../config';

// Mock the config
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
    }
  }
}));

// Mock axios
jest.mock('axios', () => ({
  get: jest.fn()
}));

describe('ProxyManagerService', () => {
  let proxyManager: ProxyManagerService;
  const mockAxios = require('axios');

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton instance
    (ProxyManagerService as any).instance = undefined;
    proxyManager = ProxyManagerService.getInstance();
  });

  afterEach(() => {
    proxyManager.destroy();
  });

  describe('Initialization', () => {
    it('should initialize with proxy endpoints from config', () => {
      const stats = proxyManager.getProxyStats();
      expect(stats.total).toBe(3);
      expect(stats.endpoints).toHaveLength(3);
      expect(stats.endpoints[0].host).toBe('test.proxy.com');
      expect(stats.endpoints[0].port).toBe(8001);
    });

    it('should return singleton instance', () => {
      const instance1 = ProxyManagerService.getInstance();
      const instance2 = ProxyManagerService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Proxy Selection', () => {
    it('should return current proxy', () => {
      const currentProxy = proxyManager.getCurrentProxy();
      expect(currentProxy).toBeTruthy();
      expect(currentProxy?.host).toBe('test.proxy.com');
      expect(currentProxy?.port).toBe(8001);
    });

    it('should return proxy agent', () => {
      const agent = proxyManager.getProxyAgent();
      expect(agent).toBeTruthy();
    });

    it('should return null when proxy is disabled', () => {
      // Mock disabled proxy
      (config.proxy.oxylabs as any).enabled = false;
      const disabledProxyManager = ProxyManagerService.getInstance();
      
      const currentProxy = disabledProxyManager.getCurrentProxy();
      expect(currentProxy).toBeNull();
      
      const agent = disabledProxyManager.getProxyAgent();
      expect(agent).toBeNull();
    });
  });

  describe('Geo-specific Proxy Selection', () => {
    it('should return geo-specific proxy when available', () => {
      // Set up a proxy with specific country
      const stats = proxyManager.getProxyStats();
      stats.endpoints[1].country = 'CA';
      stats.endpoints[1].isHealthy = true;

      const agent = proxyManager.getGeoSpecificProxy('CA');
      expect(agent).toBeTruthy();
    });

    it('should fallback to any healthy proxy when geo-specific not available', () => {
      const agent = proxyManager.getGeoSpecificProxy('UK');
      expect(agent).toBeTruthy();
    });
  });

  describe('Health Monitoring', () => {
    it('should perform health check on proxy endpoint', async () => {
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { origin: '1.2.3.4' }
      });

      const endpoint: ProxyEndpoint = {
        host: 'test.proxy.com',
        port: 8001,
        username: 'testuser',
        password: 'testpass',
        isHealthy: true,
        lastHealthCheck: 0,
        responseTime: 0,
        failureCount: 0,
        successCount: 0
      };

      const healthStatus = await proxyManager.testProxyConnectivity(endpoint);
      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.responseTime).toBeGreaterThan(0);
    });

    it('should mark proxy as unhealthy on failure', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Connection failed'));

      const endpoint: ProxyEndpoint = {
        host: 'test.proxy.com',
        port: 8001,
        username: 'testuser',
        password: 'testpass',
        isHealthy: true,
        lastHealthCheck: 0,
        responseTime: 0,
        failureCount: 0,
        successCount: 0
      };

      const healthStatus = await proxyManager.testProxyConnectivity(endpoint);
      expect(healthStatus.status).toBe('unhealthy');
      expect(healthStatus.error).toBe('Connection failed');
    });
  });

  describe('Failure Handling', () => {
    it('should mark proxy failure and rotate if needed', () => {
      const currentProxy = proxyManager.getCurrentProxy();
      expect(currentProxy).toBeTruthy();

      if (currentProxy) {
        // Mark multiple failures to trigger unhealthy status
        proxyManager.markProxyFailure(currentProxy);
        proxyManager.markProxyFailure(currentProxy);
        proxyManager.markProxyFailure(currentProxy);

        expect(currentProxy.isHealthy).toBe(false);
        expect(currentProxy.failureCount).toBe(3);
      }
    });

    it('should mark proxy success and restore health', () => {
      const currentProxy = proxyManager.getCurrentProxy();
      expect(currentProxy).toBeTruthy();

      if (currentProxy) {
        // First mark as failed
        currentProxy.isHealthy = false;
        currentProxy.failureCount = 3;

        // Then mark success
        proxyManager.markProxySuccess(currentProxy);

        expect(currentProxy.isHealthy).toBe(true);
        expect(currentProxy.failureCount).toBe(0);
        expect(currentProxy.successCount).toBe(1);
      }
    });
  });

  describe('Best Performing Proxy', () => {
    it('should return best performing proxy based on success rate and response time', () => {
      const stats = proxyManager.getProxyStats();
      
      // Set up different performance metrics
      stats.endpoints[0].successCount = 10;
      stats.endpoints[0].failureCount = 1;
      stats.endpoints[0].responseTime = 100;
      stats.endpoints[0].isHealthy = true;

      stats.endpoints[1].successCount = 8;
      stats.endpoints[1].failureCount = 2;
      stats.endpoints[1].responseTime = 50;
      stats.endpoints[1].isHealthy = true;

      stats.endpoints[2].successCount = 5;
      stats.endpoints[2].failureCount = 5;
      stats.endpoints[2].responseTime = 200;
      stats.endpoints[2].isHealthy = true;

      const bestProxy = proxyManager.getBestPerformingProxy();
      expect(bestProxy).toBeTruthy();
      // Should prefer higher success rate
      expect(bestProxy?.successCount).toBe(10);
    });

    it('should return null when no healthy proxies available', () => {
      const stats = proxyManager.getProxyStats();
      
      // Mark all proxies as unhealthy
      stats.endpoints.forEach(endpoint => {
        endpoint.isHealthy = false;
      });

      const bestProxy = proxyManager.getBestPerformingProxy();
      expect(bestProxy).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should return comprehensive proxy statistics', () => {
      const stats = proxyManager.getProxyStats();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('healthy');
      expect(stats).toHaveProperty('unhealthy');
      expect(stats).toHaveProperty('averageResponseTime');
      expect(stats).toHaveProperty('currentProxy');
      expect(stats).toHaveProperty('endpoints');
      
      expect(stats.total).toBe(3);
      expect(Array.isArray(stats.endpoints)).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on destroy', () => {
      const stats = proxyManager.getProxyStats();
      expect(stats.total).toBe(3);

      proxyManager.destroy();

      const statsAfterDestroy = proxyManager.getProxyStats();
      expect(statsAfterDestroy.total).toBe(0);
    });
  });
});