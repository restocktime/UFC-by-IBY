import { AxiosError } from 'axios';

export interface APIError {
  code: string;
  message: string;
  statusCode?: number;
  retryable: boolean;
  details?: any;
}

export class APIErrorHandler {
  static handleError(error: any, context?: string): APIError {
    if (error.isAxiosError) {
      return this.handleAxiosError(error as AxiosError, context);
    }

    if (error instanceof Error) {
      return {
        code: 'UNKNOWN_ERROR',
        message: error.message,
        retryable: false,
        details: { context }
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      retryable: false,
      details: { error, context }
    };
  }

  private static handleAxiosError(error: AxiosError, context?: string): APIError {
    const statusCode = error.response?.status;
    const responseData = error.response?.data;

    // Network errors (no response)
    if (!error.response) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network error - unable to reach the API',
        retryable: true,
        details: { 
          message: error.message,
          context,
          code: error.code
        }
      };
    }

    // Handle specific HTTP status codes
    switch (statusCode) {
      case 400:
        return {
          code: 'BAD_REQUEST',
          message: 'Invalid request parameters',
          statusCode,
          retryable: false,
          details: { responseData, context }
        };

      case 401:
        return {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing API credentials',
          statusCode,
          retryable: false,
          details: { responseData, context }
        };

      case 403:
        return {
          code: 'FORBIDDEN',
          message: 'Access denied - insufficient permissions',
          statusCode,
          retryable: false,
          details: { responseData, context }
        };

      case 404:
        return {
          code: 'NOT_FOUND',
          message: 'Requested resource not found',
          statusCode,
          retryable: false,
          details: { responseData, context }
        };

      case 408:
        return {
          code: 'REQUEST_TIMEOUT',
          message: 'Request timeout',
          statusCode,
          retryable: true,
          details: { responseData, context }
        };

      case 409:
        return {
          code: 'CONFLICT',
          message: 'Request conflict',
          statusCode,
          retryable: true,
          details: { responseData, context }
        };

      case 422:
        return {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          statusCode,
          retryable: false,
          details: { responseData, context }
        };

      case 429:
        return {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded',
          statusCode,
          retryable: true,
          details: { 
            responseData, 
            context,
            retryAfter: error.response?.headers['retry-after']
          }
        };

      case 500:
        return {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
          statusCode,
          retryable: true,
          details: { responseData, context }
        };

      case 502:
        return {
          code: 'BAD_GATEWAY',
          message: 'Bad gateway',
          statusCode,
          retryable: true,
          details: { responseData, context }
        };

      case 503:
        return {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable',
          statusCode,
          retryable: true,
          details: { responseData, context }
        };

      case 504:
        return {
          code: 'GATEWAY_TIMEOUT',
          message: 'Gateway timeout',
          statusCode,
          retryable: true,
          details: { responseData, context }
        };

      default:
        return {
          code: statusCode && statusCode >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR',
          message: `HTTP ${statusCode}: ${error.message}`,
          statusCode,
          retryable: statusCode ? statusCode >= 500 : false,
          details: { responseData, context }
        };
    }
  }

  static isRetryableError(error: APIError): boolean {
    return error.retryable;
  }

  static getRetryDelay(error: APIError, attempt: number, baseDelay = 1000): number {
    // For rate limit errors, use the retry-after header if available
    if (error.code === 'RATE_LIMIT_EXCEEDED' && error.details?.retryAfter) {
      const retryAfter = parseInt(error.details.retryAfter, 10);
      if (!isNaN(retryAfter)) {
        return retryAfter * 1000; // Convert to milliseconds
      }
    }

    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  static formatErrorForLogging(error: APIError, context?: string): string {
    const parts = [
      `[${error.code}]`,
      error.message
    ];

    if (error.statusCode) {
      parts.push(`(HTTP ${error.statusCode})`);
    }

    if (context) {
      parts.push(`- Context: ${context}`);
    }

    if (error.details) {
      parts.push(`- Details: ${JSON.stringify(error.details, null, 2)}`);
    }

    return parts.join(' ');
  }

  static createCustomError(code: string, message: string, retryable = false, details?: any): APIError {
    return {
      code,
      message,
      retryable,
      details
    };
  }
}

// Specific error types for common API scenarios
export class APIErrors {
  static readonly INVALID_API_KEY = APIErrorHandler.createCustomError(
    'INVALID_API_KEY',
    'API key is invalid or missing',
    false
  );

  static readonly QUOTA_EXCEEDED = APIErrorHandler.createCustomError(
    'QUOTA_EXCEEDED',
    'API quota exceeded',
    false
  );

  static readonly SERVICE_MAINTENANCE = APIErrorHandler.createCustomError(
    'SERVICE_MAINTENANCE',
    'Service is under maintenance',
    true
  );

  static readonly DATA_NOT_AVAILABLE = APIErrorHandler.createCustomError(
    'DATA_NOT_AVAILABLE',
    'Requested data is not available',
    false
  );

  static readonly PROXY_ERROR = APIErrorHandler.createCustomError(
    'PROXY_ERROR',
    'Proxy connection failed',
    true
  );
}