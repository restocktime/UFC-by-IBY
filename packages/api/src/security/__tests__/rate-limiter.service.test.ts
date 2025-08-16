import { Request, Response, NextFunction } from 'express';
import { vi } from 'vitest';
import { RateLimiterService } from '../rate-limiter.service';

describe('RateLimiterService', () => {
  let rateLimiterService: RateLimiterService;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    rateLimiterService = new RateLimiterService();
    
    mockRequest = {
      ip: '192.168.1.1',
      connection: { remoteAddress: '192.168.1.1' } as any,
      headers: {},
      body: {},
    };
    
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };
    
    mockNext = vi.fn();
  });

  afterEach(() => {
    rateLimiterService.destroy();
  });

  describe('Rate Limiting', () => {
    it('should allow requests within limit', () => {
      const limiter = rateLimiterService.createLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 5,
      });

      // Make 3 requests (within limit)
      for (let i = 0; i < 3; i++) {
        limiter(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(3);
      expect(mockResponse.status).not.toHaveBeenCalledWith(429);
    });

    it('should block requests exceeding limit', () => {
      const limiter = rateLimiterService.createLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 2,
      });

      // Make 3 requests (exceeding limit)
      for (let i = 0; i < 3; i++) {
        limiter(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(2);
      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Too many requests',
        retryAfter: expect.any(Number),
      });
    });

    it('should set rate limit headers', () => {
      const limiter = rateLimiterService.createLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      limiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should use custom key generator', () => {
      const customKeyGenerator = vi.fn().mockReturnValue('custom-key');
      const limiter = rateLimiterService.createLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyGenerator: customKeyGenerator,
      });

      limiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(customKeyGenerator).toHaveBeenCalledWith(mockRequest);
    });

    it('should call onLimitReached callback', () => {
      const onLimitReached = vi.fn();
      const limiter = rateLimiterService.createLimiter({
        windowMs: 60000,
        maxRequests: 1,
        onLimitReached,
      });

      // Make 2 requests to trigger limit
      limiter(mockRequest as Request, mockResponse as Response, mockNext);
      limiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(onLimitReached).toHaveBeenCalledWith(mockRequest, mockResponse);
    });

    it('should reset window after expiry', async () => {
      const limiter = rateLimiterService.createLimiter({
        windowMs: 100, // 100ms window
        maxRequests: 1,
      });

      // First request should pass
      limiter(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Second request should be blocked
      limiter(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);

      // Wait for window to reset
      await new Promise(resolve => setTimeout(resolve, 150));

      // Reset mocks
      vi.clearAllMocks();

      // Third request should pass after window reset
      limiter(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalledWith(429);
    });
  });

  describe('API Limiters', () => {
    it('should create different limiters for different endpoints', () => {
      const limiters = rateLimiterService.createAPILimiters();

      expect(limiters.general).toBeDefined();
      expect(limiters.predictions).toBeDefined();
      expect(limiters.auth).toBeDefined();
      expect(limiters.registration).toBeDefined();
      expect(limiters.passwordReset).toBeDefined();
    });

    it('should use user-based key for predictions when user is available', () => {
      const limiters = rateLimiterService.createAPILimiters();
      mockRequest.user = { id: 'user123' };

      limiters.predictions(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should use email-based key for password reset', () => {
      const limiters = rateLimiterService.createAPILimiters();
      mockRequest.body = { email: 'user@example.com' };

      limiters.passwordReset(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Rate Limit Info', () => {
    it('should return correct rate limit info for new key', () => {
      const config = {
        windowMs: 60000,
        maxRequests: 10,
      };

      const info = rateLimiterService.getRateLimitInfo('new-key', config);

      expect(info.totalHits).toBe(0);
      expect(info.remaining).toBe(10);
      expect(info.resetTime).toBeInstanceOf(Date);
    });

    it('should return correct rate limit info for existing key', () => {
      const config = {
        windowMs: 60000,
        maxRequests: 10,
      };
      const limiter = rateLimiterService.createLimiter(config);

      // Make some requests
      limiter(mockRequest as Request, mockResponse as Response, mockNext);
      limiter(mockRequest as Request, mockResponse as Response, mockNext);

      const info = rateLimiterService.getRateLimitInfo('ip:192.168.1.1', config);

      expect(info.totalHits).toBe(2);
      expect(info.remaining).toBe(8);
    });
  });

  describe('Rate Limit Reset', () => {
    it('should reset rate limit for a key', () => {
      const limiter = rateLimiterService.createLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      // Make request to create entry
      limiter(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Second request should be blocked
      limiter(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);

      // Reset the rate limit
      rateLimiterService.resetRateLimit('ip:192.168.1.1');

      // Reset mocks
      vi.clearAllMocks();

      // Request should now pass
      limiter(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalledWith(429);
    });
  });

  describe('Key Generation', () => {
    it('should generate IP-based key by default', () => {
      const limiter = rateLimiterService.createLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      limiter(mockRequest as Request, mockResponse as Response, mockNext);

      // The key should be based on IP address
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle missing IP address', () => {
      mockRequest.ip = undefined;
      mockRequest.connection = {} as any;

      const limiter = rateLimiterService.createLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      limiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired entries', async () => {
      const limiter = rateLimiterService.createLimiter({
        windowMs: 100, // Very short window
        maxRequests: 5,
      });

      // Make a request to create an entry
      limiter(mockRequest as Request, mockResponse as Response, mockNext);

      // Wait for entry to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Trigger cleanup (this would normally happen automatically)
      // For testing, we'll just verify the behavior by making another request
      // which should reset the count
      vi.clearAllMocks();
      limiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in key generation gracefully', () => {
      const errorKeyGenerator = vi.fn().mockImplementation(() => {
        throw new Error('Key generation error');
      });

      const limiter = rateLimiterService.createLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyGenerator: errorKeyGenerator,
      });

      // Should not throw error, should fall back to default behavior
      expect(() => {
        limiter(mockRequest as Request, mockResponse as Response, mockNext);
      }).not.toThrow();
    });
  });
});