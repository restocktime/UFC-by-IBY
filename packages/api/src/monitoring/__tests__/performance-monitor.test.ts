import { PerformanceMonitor } from '../performance-monitor';
import { metrics } from '../metrics-collector';
import { vi } from 'vitest';

// Mock the metrics collector
vi.mock('../metrics-collector', () => ({
  metrics: {
    counter: vi.fn(),
    gauge: vi.fn(),
    histogram: vi.fn()
  }
}));

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;
  let mockCounter: any;
  let mockGauge: any;
  let mockHistogram: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock metric instances
    mockCounter = {
      increment: vi.fn(),
      value: 0
    };
    
    mockGauge = {
      set: vi.fn(),
      increment: vi.fn(),
      decrement: vi.fn(),
      value: 0
    };
    
    mockHistogram = {
      observe: vi.fn(),
      value: 0
    };

    // Setup metrics mock returns
    (metrics.counter as any).mockReturnValue(mockCounter);
    (metrics.gauge as any).mockReturnValue(mockGauge);
    (metrics.histogram as any).mockReturnValue(mockHistogram);
    
    // Mock getAllMetrics method
    (metrics as any).getAllMetrics = vi.fn().mockReturnValue(new Map([
      ['http_requests_total', mockCounter],
      ['http_request_duration_seconds', mockHistogram]
    ]));

    monitor = new PerformanceMonitor();
  });

  describe('HTTP request tracking', () => {
    it('should record HTTP request metrics', () => {
      monitor.recordHttpRequest('GET', '/api/fighters', 200, 150);

      expect(mockCounter.increment).toHaveBeenCalledWith(1, {
        method: 'GET',
        status: '2xx',
        endpoint: '/api/fighters'
      });

      expect(mockHistogram.observe).toHaveBeenCalledWith(0.15, {
        method: 'GET',
        endpoint: '/api/fighters'
      });
    });

    it('should categorize status codes correctly', () => {
      monitor.recordHttpRequest('POST', '/api/predictions', 404, 100);

      expect(mockCounter.increment).toHaveBeenCalledWith(1, {
        method: 'POST',
        status: '4xx',
        endpoint: '/api/predictions'
      });
    });

    it('should handle 5xx status codes', () => {
      monitor.recordHttpRequest('GET', '/api/data', 500, 200);

      expect(mockCounter.increment).toHaveBeenCalledWith(1, {
        method: 'GET',
        status: '5xx',
        endpoint: '/api/data'
      });
    });
  });

  describe('Active connections tracking', () => {
    it('should record active connection count', () => {
      monitor.recordActiveConnections(25);

      expect(mockGauge.set).toHaveBeenCalledWith(25);
    });
  });

  describe('Business metrics tracking', () => {
    it('should record data ingestion rate', () => {
      monitor.recordDataIngestion(150);

      expect(mockGauge.set).toHaveBeenCalledWith(150);
    });

    it('should record prediction accuracy', () => {
      monitor.recordPredictionAccuracy(0.85);

      expect(mockGauge.set).toHaveBeenCalledWith(85); // Converted to percentage
    });

    it('should record user engagement', () => {
      monitor.recordUserEngagement(7.5);

      expect(mockGauge.set).toHaveBeenCalledWith(7.5);
    });

    it('should record data freshness', () => {
      monitor.recordDataFreshness(30);

      expect(mockGauge.set).toHaveBeenCalledWith(30);
    });

    it('should record alerts', () => {
      monitor.recordAlert('quality_degradation', 'high');

      expect(mockCounter.increment).toHaveBeenCalledWith(1, {
        type: 'quality_degradation',
        severity: 'high'
      });
    });
  });

  describe('getCurrentMetrics', () => {
    it('should return current performance metrics', () => {
      mockCounter.value = 100;
      mockGauge.value = 5;
      mockHistogram.value = 0.25;

      const metrics = monitor.getCurrentMetrics();

      expect(metrics).toMatchObject({
        requestCount: 100,
        activeConnections: 5,
        responseTime: 250 // Converted from seconds to milliseconds
      });

      expect(metrics.memoryUsage).toBeDefined();
      expect(typeof metrics.cpuUsage).toBe('number');
    });
  });

  describe('getCurrentBusinessMetrics', () => {
    it('should return current business metrics', () => {
      // The PerformanceMonitor creates separate gauge instances for each metric
      // Since we're mocking the metrics.gauge method to return the same mockGauge,
      // all gauges will have the same value
      mockGauge.value = 30; // This will be the value for all gauges
      mockCounter.value = 5; // alertsGenerated

      const businessMetrics = monitor.getCurrentBusinessMetrics();

      expect(businessMetrics).toMatchObject({
        dataIngestionRate: 30,
        predictionAccuracy: 30,
        userEngagement: 30,
        dataFreshness: 30,
        alertsGenerated: 5
      });
    });
  });

  describe('getUptime', () => {
    it('should return uptime in seconds', () => {
      const uptime = monitor.getUptime();

      expect(typeof uptime).toBe('number');
      expect(uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Express middleware', () => {
    it('should create middleware that tracks requests', () => {
      const middleware = monitor.createExpressMiddleware();

      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3); // req, res, next
    });

    it('should increment active connections on request start', () => {
      const middleware = monitor.createExpressMiddleware();
      const mockReq = { method: 'GET', path: '/test' };
      const mockRes = { 
        on: vi.fn(),
        statusCode: 200
      };
      const mockNext = vi.fn();

      middleware(mockReq, mockRes, mockNext);

      expect(mockGauge.increment).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should track request completion', () => {
      const middleware = monitor.createExpressMiddleware();
      const mockReq = { 
        method: 'POST', 
        path: '/api/test',
        route: { path: '/api/test' }
      };
      const mockRes = { 
        on: vi.fn(),
        statusCode: 201
      };
      const mockNext = vi.fn();

      middleware(mockReq, mockRes, mockNext);

      // Simulate response finish
      const finishCallback = mockRes.on.mock.calls.find(call => call[0] === 'finish')[1];
      finishCallback();

      expect(mockCounter.increment).toHaveBeenCalledWith(1, {
        method: 'POST',
        status: '2xx',
        endpoint: '/api/test'
      });

      expect(mockGauge.decrement).toHaveBeenCalled();
    });
  });

  describe('endpoint sanitization', () => {
    it('should sanitize dynamic segments in endpoints', () => {
      // Test through the middleware since sanitizeEndpoint is private
      const middleware = monitor.createExpressMiddleware();
      const mockReq = { 
        method: 'GET', 
        path: '/api/fighters/123/stats',
        route: { path: '/api/fighters/:id/stats' }
      };
      const mockRes = { 
        on: vi.fn(),
        statusCode: 200
      };
      const mockNext = vi.fn();

      middleware(mockReq, mockRes, mockNext);

      // Simulate response finish
      const finishCallback = mockRes.on.mock.calls.find(call => call[0] === 'finish')[1];
      finishCallback();

      expect(mockCounter.increment).toHaveBeenCalledWith(1, {
        method: 'GET',
        status: '2xx',
        endpoint: '/api/fighters/:id/stats'
      });
    });
  });
});