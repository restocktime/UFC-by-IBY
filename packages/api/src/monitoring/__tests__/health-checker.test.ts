import { 
  HealthChecker, 
  DatabaseHealthCheck, 
  RedisHealthCheck, 
  ExternalAPIHealthCheck, 
  MemoryHealthCheck,
  HealthCheck,
  HealthCheckResult
} from '../health-checker';
import { vi } from 'vitest';

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker();
  });

  describe('register and unregister', () => {
    it('should register health checks', () => {
      const mockCheck: HealthCheck = {
        name: 'test-check',
        check: vi.fn().mockResolvedValue({
          status: 'healthy',
          timestamp: new Date(),
          duration: 100
        })
      };

      healthChecker.register(mockCheck);

      expect(healthChecker['checks'].has('test-check')).toBe(true);
    });

    it('should unregister health checks', () => {
      const mockCheck: HealthCheck = {
        name: 'test-check',
        check: vi.fn()
      };

      healthChecker.register(mockCheck);
      healthChecker.unregister('test-check');

      expect(healthChecker['checks'].has('test-check')).toBe(false);
    });
  });

  describe('checkHealth', () => {
    it('should run all registered health checks', async () => {
      const mockCheck1: HealthCheck = {
        name: 'check1',
        check: vi.fn().mockResolvedValue({
          status: 'healthy',
          timestamp: new Date(),
          duration: 50
        })
      };

      const mockCheck2: HealthCheck = {
        name: 'check2',
        check: vi.fn().mockResolvedValue({
          status: 'healthy',
          timestamp: new Date(),
          duration: 75
        })
      };

      healthChecker.register(mockCheck1);
      healthChecker.register(mockCheck2);

      const health = await healthChecker.checkHealth();

      expect(health.status).toBe('healthy');
      expect(health.checks).toHaveProperty('check1');
      expect(health.checks).toHaveProperty('check2');
      expect(health.summary.total).toBe(2);
      expect(health.summary.healthy).toBe(2);
      expect(health.summary.unhealthy).toBe(0);
    });

    it('should handle failed health checks', async () => {
      const mockCheck: HealthCheck = {
        name: 'failing-check',
        check: vi.fn().mockRejectedValue(new Error('Check failed'))
      };

      healthChecker.register(mockCheck);

      const health = await healthChecker.checkHealth();

      expect(health.status).toBe('degraded');
      expect(health.checks['failing-check'].status).toBe('unhealthy');
      expect(health.checks['failing-check'].error).toBe('Check failed');
    });

    it('should determine overall status based on critical checks', async () => {
      const criticalCheck: HealthCheck = {
        name: 'critical-check',
        critical: true,
        check: vi.fn().mockResolvedValue({
          status: 'unhealthy',
          timestamp: new Date(),
          duration: 100
        })
      };

      const normalCheck: HealthCheck = {
        name: 'normal-check',
        check: vi.fn().mockResolvedValue({
          status: 'healthy',
          timestamp: new Date(),
          duration: 50
        })
      };

      healthChecker.register(criticalCheck);
      healthChecker.register(normalCheck);

      const health = await healthChecker.checkHealth();

      expect(health.status).toBe('unhealthy');
    });

    it('should handle timeouts', async () => {
      const slowCheck: HealthCheck = {
        name: 'slow-check',
        timeout: 100,
        check: vi.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 200))
        )
      };

      healthChecker.register(slowCheck);

      const health = await healthChecker.checkHealth();

      expect(health.checks['slow-check'].status).toBe('unhealthy');
      expect(health.checks['slow-check'].error).toContain('timed out');
    });
  });

  describe('checkDependency', () => {
    it('should check specific dependency', async () => {
      const mockCheck: HealthCheck = {
        name: 'specific-check',
        check: vi.fn().mockResolvedValue({
          status: 'healthy',
          timestamp: new Date(),
          duration: 25
        })
      };

      healthChecker.register(mockCheck);

      const result = await healthChecker.checkDependency('specific-check');

      expect(result.status).toBe('healthy');
      expect(mockCheck.check).toHaveBeenCalled();
    });

    it('should throw error for non-existent check', async () => {
      await expect(
        healthChecker.checkDependency('non-existent')
      ).rejects.toThrow("Health check 'non-existent' not found");
    });
  });

  describe('getLastKnownHealth', () => {
    it('should return last known health status', async () => {
      const mockCheck: HealthCheck = {
        name: 'test-check',
        check: vi.fn().mockResolvedValue({
          status: 'healthy',
          timestamp: new Date(),
          duration: 100
        })
      };

      healthChecker.register(mockCheck);
      await healthChecker.checkHealth();

      const lastKnown = healthChecker.getLastKnownHealth();

      expect(lastKnown.checks).toHaveProperty('test-check');
      expect(lastKnown.status).toBe('healthy');
    });
  });
});

describe('DatabaseHealthCheck', () => {
  it('should report healthy when connection test passes', async () => {
    const connectionTest = vi.fn().mockResolvedValue(true);
    const dbCheck = new DatabaseHealthCheck(connectionTest);

    const result = await dbCheck.check();

    expect(result.status).toBe('healthy');
    expect(result.details?.connected).toBe(true);
    expect(connectionTest).toHaveBeenCalled();
  });

  it('should report unhealthy when connection test fails', async () => {
    const connectionTest = vi.fn().mockResolvedValue(false);
    const dbCheck = new DatabaseHealthCheck(connectionTest);

    const result = await dbCheck.check();

    expect(result.status).toBe('unhealthy');
    expect(result.details?.connected).toBe(false);
  });

  it('should handle connection test errors', async () => {
    const connectionTest = vi.fn().mockRejectedValue(new Error('Connection failed'));
    const dbCheck = new DatabaseHealthCheck(connectionTest);

    const result = await dbCheck.check();

    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('Connection failed');
  });
});

describe('RedisHealthCheck', () => {
  it('should report healthy when ping test passes', async () => {
    const pingTest = vi.fn().mockResolvedValue(true);
    const redisCheck = new RedisHealthCheck(pingTest);

    const result = await redisCheck.check();

    expect(result.status).toBe('healthy');
    expect(result.details?.reachable).toBe(true);
  });

  it('should report degraded when ping test fails', async () => {
    const pingTest = vi.fn().mockResolvedValue(false);
    const redisCheck = new RedisHealthCheck(pingTest);

    const result = await redisCheck.check();

    expect(result.status).toBe('degraded');
    expect(result.details?.reachable).toBe(false);
  });

  it('should handle ping test errors as degraded', async () => {
    const pingTest = vi.fn().mockRejectedValue(new Error('Ping failed'));
    const redisCheck = new RedisHealthCheck(pingTest);

    const result = await redisCheck.check();

    expect(result.status).toBe('degraded');
    expect(result.error).toBe('Ping failed');
  });
});

describe('ExternalAPIHealthCheck', () => {
  it('should report healthy for successful API response', async () => {
    const apiTest = vi.fn().mockResolvedValue({ status: 200, responseTime: 150 });
    const apiCheck = new ExternalAPIHealthCheck('external-api', apiTest);

    const result = await apiCheck.check();

    expect(result.status).toBe('healthy');
    expect(result.details?.httpStatus).toBe(200);
    expect(result.details?.responseTime).toBe(150);
  });

  it('should report degraded for 4xx responses', async () => {
    const apiTest = vi.fn().mockResolvedValue({ status: 404, responseTime: 100 });
    const apiCheck = new ExternalAPIHealthCheck('external-api', apiTest);

    const result = await apiCheck.check();

    expect(result.status).toBe('degraded');
    expect(result.details?.httpStatus).toBe(404);
  });

  it('should report unhealthy for 5xx responses', async () => {
    const apiTest = vi.fn().mockResolvedValue({ status: 500, responseTime: 200 });
    const apiCheck = new ExternalAPIHealthCheck('external-api', apiTest);

    const result = await apiCheck.check();

    expect(result.status).toBe('unhealthy');
    expect(result.details?.httpStatus).toBe(500);
  });

  it('should report degraded for slow responses', async () => {
    const apiTest = vi.fn().mockResolvedValue({ status: 200, responseTime: 6000 });
    const apiCheck = new ExternalAPIHealthCheck('external-api', apiTest);

    const result = await apiCheck.check();

    expect(result.status).toBe('degraded');
    expect(result.details?.responseTime).toBe(6000);
  });

  it('should handle API test errors', async () => {
    const apiTest = vi.fn().mockRejectedValue(new Error('Network error'));
    const apiCheck = new ExternalAPIHealthCheck('external-api', apiTest);

    const result = await apiCheck.check();

    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('Network error');
  });
});

describe('MemoryHealthCheck', () => {
  let originalMemoryUsage: typeof process.memoryUsage;

  beforeEach(() => {
    originalMemoryUsage = process.memoryUsage;
  });

  afterEach(() => {
    process.memoryUsage = originalMemoryUsage;
  });

  it('should report healthy for normal memory usage', async () => {
    process.memoryUsage = vi.fn().mockReturnValue({
      heapUsed: 50 * 1024 * 1024,  // 50MB
      heapTotal: 100 * 1024 * 1024, // 100MB
      rss: 120 * 1024 * 1024,
      external: 5 * 1024 * 1024
    });

    const memoryCheck = new MemoryHealthCheck(90); // 90% threshold

    const result = await memoryCheck.check();

    expect(result.status).toBe('healthy');
    expect(result.details?.heapUsagePercent).toBe(50);
  });

  it('should report degraded for high memory usage', async () => {
    process.memoryUsage = vi.fn().mockReturnValue({
      heapUsed: 75 * 1024 * 1024,  // 75MB
      heapTotal: 100 * 1024 * 1024, // 100MB (75% usage)
      rss: 120 * 1024 * 1024,
      external: 5 * 1024 * 1024
    });

    const memoryCheck = new MemoryHealthCheck(90); // 90% threshold, 80% degraded

    const result = await memoryCheck.check();

    expect(result.status).toBe('degraded');
    expect(result.details?.heapUsagePercent).toBe(75);
  });

  it('should report unhealthy for critical memory usage', async () => {
    process.memoryUsage = vi.fn().mockReturnValue({
      heapUsed: 95 * 1024 * 1024,  // 95MB
      heapTotal: 100 * 1024 * 1024, // 100MB (95% usage)
      rss: 120 * 1024 * 1024,
      external: 5 * 1024 * 1024
    });

    const memoryCheck = new MemoryHealthCheck(90); // 90% threshold

    const result = await memoryCheck.check();

    expect(result.status).toBe('unhealthy');
    expect(result.details?.heapUsagePercent).toBe(95);
  });
});