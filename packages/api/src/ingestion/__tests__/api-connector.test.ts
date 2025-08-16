import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import axios from 'axios';
import { APIConnector, CircuitBreakerState } from '../base/api-connector.js';
import { SourceConfig, ValidationError, DataIngestionResult } from '@ufc-prediction/shared';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

// Test implementation of APIConnector
class TestAPIConnector extends APIConnector {
  public testData: any[] = [];

  validateData(data: any): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!data.id) {
      errors.push(this.createValidationError('id', 'ID is required', data.id));
    }
    return errors;
  }

  transformData(data: any): any {
    return { ...data, transformed: true };
  }

  async syncData(): Promise<DataIngestionResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.makeRequest({
        method: 'GET',
        url: '/test-endpoint'
      });

      const errors = this.validateData(response.data);
      const transformedData = this.transformData(response.data);
      this.testData.push(transformedData);

      const result = this.createIngestionResult(1, 0, errors);
      result.processingTimeMs = Date.now() - startTime;
      return result;
    } catch (error) {
      const result = this.createIngestionResult(0, 0, [
        this.createValidationError('sync', 'Sync failed', error)
      ]);
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }
  }

  // Expose protected methods for testing
  public async testMakeRequest(config: any) {
    return this.makeRequest(config);
  }

  public testSleep(ms: number) {
    return this.sleep(ms);
  }
}

describe('APIConnector', () => {
  let connector: TestAPIConnector;
  let mockAxiosInstance: any;
  const testConfig: SourceConfig = {
    baseUrl: 'https://api.test.com',
    apiKey: 'test-key',
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1000
    },
    retryConfig: {
      maxRetries: 3,
      backoffMultiplier: 2,
      maxBackoffMs: 30000
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAxiosInstance = {
      request: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    
    connector = new TestAPIConnector('test-source', testConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: testConfig.baseUrl,
        timeout: 30000,
        headers: {
          'User-Agent': 'UFC-Prediction-Platform/1.0.0',
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
    });

    it('should initialize rate limiter state', () => {
      const status = connector.getStatus();
      expect(status.rateLimiter.requestsThisMinute).toBe(0);
      expect(status.rateLimiter.requestsThisHour).toBe(0);
    });

    it('should initialize circuit breaker in closed state', () => {
      const status = connector.getStatus();
      expect(status.circuitBreakerState).toBe(CircuitBreakerState.CLOSED);
      expect(status.failureCount).toBe(0);
    });
  });

  describe('rate limiting', () => {
    it('should track requests per minute', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: { id: 'test' } });

      // Make multiple requests
      await connector.testMakeRequest({ method: 'GET', url: '/test' });
      await connector.testMakeRequest({ method: 'GET', url: '/test' });

      const status = connector.getStatus();
      expect(status.rateLimiter.requestsThisMinute).toBe(2);
    });

    it('should enforce rate limits', async () => {
      // Set a very low rate limit for testing
      const lowLimitConfig = {
        ...testConfig,
        rateLimit: { requestsPerMinute: 1, requestsPerHour: 10 }
      };
      
      const limitedConnector = new TestAPIConnector('limited-source', lowLimitConfig);
      mockAxiosInstance.request.mockResolvedValue({ data: { id: 'test' } });

      // First request should succeed
      await limitedConnector.testMakeRequest({ method: 'GET', url: '/test' });

      // Second request should be delayed
      const startTime = Date.now();
      await limitedConnector.testMakeRequest({ method: 'GET', url: '/test' });
      const endTime = Date.now();

      // Should have waited for rate limit reset
      expect(endTime - startTime).toBeGreaterThan(50); // Some delay occurred
    });
  });

  describe('circuit breaker', () => {
    it('should open circuit breaker after failure threshold', async () => {
      const error = new Error('Network error');
      mockAxiosInstance.request.mockRejectedValue(error);

      // Trigger failures to open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await connector.testMakeRequest({ method: 'GET', url: '/test' });
        } catch (e) {
          // Expected to fail
        }
      }

      const status = connector.getStatus();
      expect(status.circuitBreakerState).toBe(CircuitBreakerState.OPEN);
    });

    it('should prevent requests when circuit breaker is open', async () => {
      const error = new Error('Network error');
      mockAxiosInstance.request.mockRejectedValue(error);

      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await connector.testMakeRequest({ method: 'GET', url: '/test' });
        } catch (e) {
          // Expected to fail
        }
      }

      // Next request should fail immediately due to open circuit breaker
      await expect(
        connector.testMakeRequest({ method: 'GET', url: '/test' })
      ).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should reset circuit breaker manually', async () => {
      const error = new Error('Network error');
      mockAxiosInstance.request.mockRejectedValue(error);

      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await connector.testMakeRequest({ method: 'GET', url: '/test' });
        } catch (e) {
          // Expected to fail
        }
      }

      expect(connector.getStatus().circuitBreakerState).toBe(CircuitBreakerState.OPEN);

      // Reset circuit breaker
      connector.resetCircuitBreaker();
      expect(connector.getStatus().circuitBreakerState).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('retry logic', () => {
    it('should retry on network errors', async () => {
      const networkError = new Error('Network Error');
      networkError.code = 'ECONNABORTED';

      mockAxiosInstance.request
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: { id: 'test' } });

      const response = await connector.testMakeRequest({ method: 'GET', url: '/test' });
      
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(3);
      expect(response.data.id).toBe('test');
    });

    it('should retry on 5xx status codes', async () => {
      const serverError = {
        response: { status: 500 },
        message: 'Internal Server Error'
      };

      mockAxiosInstance.request
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ data: { id: 'test' } });

      const response = await connector.testMakeRequest({ method: 'GET', url: '/test' });
      
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);
      expect(response.data.id).toBe('test');
    });

    it('should not retry on 4xx status codes', async () => {
      const clientError = {
        response: { status: 404 },
        message: 'Not Found'
      };

      mockAxiosInstance.request.mockRejectedValue(clientError);

      await expect(
        connector.testMakeRequest({ method: 'GET', url: '/test' })
      ).rejects.toMatchObject(clientError);
      
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(1);
    });

    it('should respect max retry limit', async () => {
      const error = new Error('Network Error');
      mockAxiosInstance.request.mockRejectedValue(error);

      await expect(
        connector.testMakeRequest({ method: 'GET', url: '/test' })
      ).rejects.toThrow('Network Error');
      
      // Should have tried initial request + 3 retries = 4 total
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(4);
    });
  });

  describe('data validation and transformation', () => {
    it('should validate data correctly', () => {
      const validData = { id: 'test-id', name: 'Test' };
      const invalidData = { name: 'Test' }; // Missing id

      expect(connector.validateData(validData)).toHaveLength(0);
      expect(connector.validateData(invalidData)).toHaveLength(1);
      expect(connector.validateData(invalidData)[0].field).toBe('id');
    });

    it('should transform data correctly', () => {
      const data = { id: 'test', name: 'Test' };
      const transformed = connector.transformData(data);

      expect(transformed).toEqual({
        id: 'test',
        name: 'Test',
        transformed: true
      });
    });
  });

  describe('syncData integration', () => {
    it('should successfully sync valid data', async () => {
      const testData = { id: 'test-id', name: 'Test Fighter' };
      mockAxiosInstance.request.mockResolvedValue({ data: testData });

      const result = await connector.syncData();

      expect(result.sourceId).toBe('test-source');
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.processingTimeMs).toBeGreaterThan(0);
      expect(connector.testData).toHaveLength(1);
      expect(connector.testData[0].transformed).toBe(true);
    });

    it('should handle sync errors gracefully', async () => {
      const error = new Error('API Error');
      mockAxiosInstance.request.mockRejectedValue(error);

      const result = await connector.syncData();

      expect(result.sourceId).toBe('test-source');
      expect(result.recordsProcessed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('sync');
    });
  });

  describe('event emission', () => {
    it('should emit rate limit events', (done) => {
      const lowLimitConfig = {
        ...testConfig,
        rateLimit: { requestsPerMinute: 1, requestsPerHour: 10 }
      };
      
      const limitedConnector = new TestAPIConnector('limited-source', lowLimitConfig);
      mockAxiosInstance.request.mockResolvedValue({ data: { id: 'test' } });

      limitedConnector.on('rateLimitHit', (event) => {
        expect(event.type).toBe('minute');
        expect(event.waitTime).toBeGreaterThan(0);
        done();
      });

      // Make requests to trigger rate limit
      Promise.all([
        limitedConnector.testMakeRequest({ method: 'GET', url: '/test' }),
        limitedConnector.testMakeRequest({ method: 'GET', url: '/test' })
      ]);
    });

    it('should emit circuit breaker state changes', (done) => {
      const error = new Error('Network error');
      mockAxiosInstance.request.mockRejectedValue(error);

      connector.on('circuitBreakerStateChange', (event) => {
        if (event.state === CircuitBreakerState.OPEN) {
          expect(event.state).toBe(CircuitBreakerState.OPEN);
          done();
        }
      });

      // Trigger failures to open circuit breaker
      Promise.all(
        Array(5).fill(0).map(() => 
          connector.testMakeRequest({ method: 'GET', url: '/test' }).catch(() => {})
        )
      );
    });
  });

  describe('utility methods', () => {
    it('should create validation errors correctly', () => {
      const error = connector['createValidationError']('testField', 'Test message', 'testValue', 'warning');
      
      expect(error).toEqual({
        field: 'testField',
        message: 'Test message',
        value: 'testValue',
        severity: 'warning'
      });
    });

    it('should create ingestion results correctly', () => {
      const errors: ValidationError[] = [
        { field: 'test', message: 'Test error', value: null, severity: 'error' }
      ];
      
      const result = connector['createIngestionResult'](10, 2, errors);
      
      expect(result.sourceId).toBe('test-source');
      expect(result.recordsProcessed).toBe(10);
      expect(result.recordsSkipped).toBe(2);
      expect(result.errors).toEqual(errors);
      expect(result.nextSyncTime).toBeInstanceOf(Date);
    });

    it('should sleep for specified duration', async () => {
      const startTime = Date.now();
      await connector.testSleep(100);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // Allow some variance
    });
  });
});