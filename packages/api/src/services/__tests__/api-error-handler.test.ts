import { APIErrorHandler, APIErrors } from '../api-error-handler';
import { AxiosError } from 'axios';

describe('APIErrorHandler', () => {
  describe('handleError', () => {
    it('should handle Axios errors', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 404,
          data: { message: 'Not found' }
        },
        message: 'Request failed with status code 404'
      } as AxiosError;

      const result = APIErrorHandler.handleError(axiosError, 'test context');

      expect(result.code).toBe('NOT_FOUND');
      expect(result.message).toBe('Requested resource not found');
      expect(result.statusCode).toBe(404);
      expect(result.retryable).toBe(false);
      expect(result.details.context).toBe('test context');
    });

    it('should handle regular Error objects', () => {
      const error = new Error('Something went wrong');

      const result = APIErrorHandler.handleError(error, 'test context');

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('Something went wrong');
      expect(result.retryable).toBe(false);
      expect(result.details.context).toBe('test context');
    });

    it('should handle unknown error types', () => {
      const error = 'string error';

      const result = APIErrorHandler.handleError(error, 'test context');

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('An unknown error occurred');
      expect(result.retryable).toBe(false);
      expect(result.details.error).toBe('string error');
    });
  });

  describe('Axios Error Handling', () => {
    it('should handle network errors (no response)', () => {
      const axiosError = {
        isAxiosError: true,
        response: undefined,
        message: 'Network Error',
        code: 'ECONNREFUSED'
      } as AxiosError;

      const result = APIErrorHandler.handleError(axiosError);

      expect(result.code).toBe('NETWORK_ERROR');
      expect(result.message).toBe('Network error - unable to reach the API');
      expect(result.retryable).toBe(true);
      expect(result.details.code).toBe('ECONNREFUSED');
    });

    it('should handle 400 Bad Request', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: 'Invalid parameters' }
        }
      } as AxiosError;

      const result = APIErrorHandler.handleError(axiosError);

      expect(result.code).toBe('BAD_REQUEST');
      expect(result.statusCode).toBe(400);
      expect(result.retryable).toBe(false);
    });

    it('should handle 401 Unauthorized', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: 'Invalid API key' }
        }
      } as AxiosError;

      const result = APIErrorHandler.handleError(axiosError);

      expect(result.code).toBe('UNAUTHORIZED');
      expect(result.statusCode).toBe(401);
      expect(result.retryable).toBe(false);
    });

    it('should handle 403 Forbidden', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: { error: 'Access denied' }
        }
      } as AxiosError;

      const result = APIErrorHandler.handleError(axiosError);

      expect(result.code).toBe('FORBIDDEN');
      expect(result.statusCode).toBe(403);
      expect(result.retryable).toBe(false);
    });

    it('should handle 429 Rate Limit Exceeded', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 429,
          data: { error: 'Rate limit exceeded' },
          headers: { 'retry-after': '60' }
        }
      } as AxiosError;

      const result = APIErrorHandler.handleError(axiosError);

      expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(result.statusCode).toBe(429);
      expect(result.retryable).toBe(true);
      expect(result.details.retryAfter).toBe('60');
    });

    it('should handle 500 Internal Server Error', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: 'Internal server error' }
        }
      } as AxiosError;

      const result = APIErrorHandler.handleError(axiosError);

      expect(result.code).toBe('INTERNAL_SERVER_ERROR');
      expect(result.statusCode).toBe(500);
      expect(result.retryable).toBe(true);
    });

    it('should handle 502 Bad Gateway', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 502,
          data: { error: 'Bad gateway' }
        }
      } as AxiosError;

      const result = APIErrorHandler.handleError(axiosError);

      expect(result.code).toBe('BAD_GATEWAY');
      expect(result.statusCode).toBe(502);
      expect(result.retryable).toBe(true);
    });

    it('should handle 503 Service Unavailable', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 503,
          data: { error: 'Service unavailable' }
        }
      } as AxiosError;

      const result = APIErrorHandler.handleError(axiosError);

      expect(result.code).toBe('SERVICE_UNAVAILABLE');
      expect(result.statusCode).toBe(503);
      expect(result.retryable).toBe(true);
    });

    it('should handle unknown status codes', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 418,
          data: { error: "I'm a teapot" }
        },
        message: 'Request failed with status code 418'
      } as AxiosError;

      const result = APIErrorHandler.handleError(axiosError);

      expect(result.code).toBe('CLIENT_ERROR');
      expect(result.message).toBe('HTTP 418: Request failed with status code 418');
      expect(result.statusCode).toBe(418);
      expect(result.retryable).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for retryable errors', () => {
      const error = { code: 'NETWORK_ERROR', message: 'Network error', retryable: true };
      expect(APIErrorHandler.isRetryableError(error)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const error = { code: 'BAD_REQUEST', message: 'Bad request', retryable: false };
      expect(APIErrorHandler.isRetryableError(error)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should use retry-after header for rate limit errors', () => {
      const error = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded',
        retryable: true,
        details: { retryAfter: '30' }
      };

      const delay = APIErrorHandler.getRetryDelay(error, 1);
      expect(delay).toBe(30000); // 30 seconds in milliseconds
    });

    it('should use exponential backoff for other errors', () => {
      const error = {
        code: 'NETWORK_ERROR',
        message: 'Network error',
        retryable: true
      };

      const delay1 = APIErrorHandler.getRetryDelay(error, 1, 1000);
      const delay2 = APIErrorHandler.getRetryDelay(error, 2, 1000);
      const delay3 = APIErrorHandler.getRetryDelay(error, 3, 1000);

      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThan(1100); // With 10% jitter
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThan(2200);
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThan(4400);
    });

    it('should cap delay at maximum value', () => {
      const error = {
        code: 'NETWORK_ERROR',
        message: 'Network error',
        retryable: true
      };

      const delay = APIErrorHandler.getRetryDelay(error, 10, 1000);
      expect(delay).toBeLessThanOrEqual(30000); // Max 30 seconds
    });
  });

  describe('formatErrorForLogging', () => {
    it('should format error with all details', () => {
      const error = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded',
        statusCode: 429,
        retryable: true,
        details: { retryAfter: '60' }
      };

      const formatted = APIErrorHandler.formatErrorForLogging(error, 'API call');

      expect(formatted).toContain('[RATE_LIMIT_EXCEEDED]');
      expect(formatted).toContain('Rate limit exceeded');
      expect(formatted).toContain('(HTTP 429)');
      expect(formatted).toContain('Context: API call');
      expect(formatted).toContain('Details:');
    });

    it('should format error without optional fields', () => {
      const error = {
        code: 'NETWORK_ERROR',
        message: 'Network error',
        retryable: true
      };

      const formatted = APIErrorHandler.formatErrorForLogging(error);

      expect(formatted).toContain('[NETWORK_ERROR]');
      expect(formatted).toContain('Network error');
      expect(formatted).not.toContain('HTTP');
      expect(formatted).not.toContain('Context:');
    });
  });

  describe('createCustomError', () => {
    it('should create custom error with all parameters', () => {
      const error = APIErrorHandler.createCustomError(
        'CUSTOM_ERROR',
        'Custom error message',
        true,
        { customField: 'value' }
      );

      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.message).toBe('Custom error message');
      expect(error.retryable).toBe(true);
      expect(error.details.customField).toBe('value');
    });

    it('should create custom error with default values', () => {
      const error = APIErrorHandler.createCustomError('SIMPLE_ERROR', 'Simple message');

      expect(error.code).toBe('SIMPLE_ERROR');
      expect(error.message).toBe('Simple message');
      expect(error.retryable).toBe(false);
      expect(error.details).toBeUndefined();
    });
  });

  describe('Predefined Errors', () => {
    it('should have INVALID_API_KEY error', () => {
      expect(APIErrors.INVALID_API_KEY.code).toBe('INVALID_API_KEY');
      expect(APIErrors.INVALID_API_KEY.retryable).toBe(false);
    });

    it('should have QUOTA_EXCEEDED error', () => {
      expect(APIErrors.QUOTA_EXCEEDED.code).toBe('QUOTA_EXCEEDED');
      expect(APIErrors.QUOTA_EXCEEDED.retryable).toBe(false);
    });

    it('should have SERVICE_MAINTENANCE error', () => {
      expect(APIErrors.SERVICE_MAINTENANCE.code).toBe('SERVICE_MAINTENANCE');
      expect(APIErrors.SERVICE_MAINTENANCE.retryable).toBe(true);
    });

    it('should have DATA_NOT_AVAILABLE error', () => {
      expect(APIErrors.DATA_NOT_AVAILABLE.code).toBe('DATA_NOT_AVAILABLE');
      expect(APIErrors.DATA_NOT_AVAILABLE.retryable).toBe(false);
    });

    it('should have PROXY_ERROR error', () => {
      expect(APIErrors.PROXY_ERROR.code).toBe('PROXY_ERROR');
      expect(APIErrors.PROXY_ERROR.retryable).toBe(true);
    });
  });
});