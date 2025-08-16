import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { SourceConfig, DataIngestionResult, ValidationError } from '@ufc-platform/shared';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitoringPeriodMs: number;
}

export interface RateLimiterState {
  requestsThisMinute: number;
  requestsThisHour: number;
  lastMinuteReset: number;
  lastHourReset: number;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export abstract class APIConnector extends EventEmitter {
  protected client: AxiosInstance;
  protected config: SourceConfig;
  protected rateLimiter: RateLimiterState;
  protected circuitBreaker: {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number;
    config: CircuitBreakerConfig;
  };

  constructor(
    protected sourceId: string,
    config: SourceConfig,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    super();
    this.config = config;
    
    // Initialize rate limiter
    this.rateLimiter = {
      requestsThisMinute: 0,
      requestsThisHour: 0,
      lastMinuteReset: Date.now(),
      lastHourReset: Date.now()
    };

    // Initialize circuit breaker
    this.circuitBreaker = {
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      lastFailureTime: 0,
      config: {
        failureThreshold: 5,
        resetTimeoutMs: 60000, // 1 minute
        monitoringPeriodMs: 300000, // 5 minutes
        ...circuitBreakerConfig
      }
    };

    // Initialize axios client
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'UFC-Prediction-Platform/1.0.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for rate limiting and auth
    this.client.interceptors.request.use(
      async (config) => {
        await this.checkRateLimit();
        this.checkCircuitBreaker();
        
        // Add API key if configured
        if (this.config.apiKey) {
          config.headers = config.headers || {};
          config.params = config.params || {};
          config.params.apiKey = this.config.apiKey;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        this.onSuccess();
        return response;
      },
      (error) => {
        this.onFailure(error);
        return Promise.reject(error);
      }
    );
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset minute counter if needed
    if (now - this.rateLimiter.lastMinuteReset >= 60000) {
      this.rateLimiter.requestsThisMinute = 0;
      this.rateLimiter.lastMinuteReset = now;
    }

    // Reset hour counter if needed
    if (now - this.rateLimiter.lastHourReset >= 3600000) {
      this.rateLimiter.requestsThisHour = 0;
      this.rateLimiter.lastHourReset = now;
    }

    // Check rate limits
    if (this.rateLimiter.requestsThisMinute >= this.config.rateLimit.requestsPerMinute) {
      const waitTime = 60000 - (now - this.rateLimiter.lastMinuteReset);
      this.emit('rateLimitHit', { type: 'minute', waitTime });
      await this.sleep(waitTime);
      return this.checkRateLimit();
    }

    if (this.rateLimiter.requestsThisHour >= this.config.rateLimit.requestsPerHour) {
      const waitTime = 3600000 - (now - this.rateLimiter.lastHourReset);
      this.emit('rateLimitHit', { type: 'hour', waitTime });
      await this.sleep(waitTime);
      return this.checkRateLimit();
    }

    // Increment counters
    this.rateLimiter.requestsThisMinute++;
    this.rateLimiter.requestsThisHour++;
  }

  private checkCircuitBreaker(): void {
    const now = Date.now();

    if (this.circuitBreaker.state === CircuitBreakerState.OPEN) {
      if (now - this.circuitBreaker.lastFailureTime >= this.circuitBreaker.config.resetTimeoutMs) {
        this.circuitBreaker.state = CircuitBreakerState.HALF_OPEN;
        this.emit('circuitBreakerStateChange', { state: CircuitBreakerState.HALF_OPEN });
      } else {
        throw new Error(`Circuit breaker is OPEN. Service unavailable for ${this.sourceId}`);
      }
    }
  }

  private onSuccess(): void {
    if (this.circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreaker.state = CircuitBreakerState.CLOSED;
      this.circuitBreaker.failureCount = 0;
      this.emit('circuitBreakerStateChange', { state: CircuitBreakerState.CLOSED });
    }
  }

  private onFailure(error: any): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreaker.config.failureThreshold) {
      this.circuitBreaker.state = CircuitBreakerState.OPEN;
      this.emit('circuitBreakerStateChange', { state: CircuitBreakerState.OPEN });
    }

    this.emit('requestError', { error, sourceId: this.sourceId });
  }

  protected async makeRequest<T = any>(
    config: AxiosRequestConfig,
    retryCount = 0
  ): Promise<AxiosResponse<T>> {
    try {
      const response = await this.client.request<T>(config);
      return response;
    } catch (error: any) {
      if (retryCount < this.config.retryConfig.maxRetries && this.shouldRetry(error)) {
        const backoffTime = this.calculateBackoff(retryCount);
        this.emit('retryAttempt', { 
          attempt: retryCount + 1, 
          maxRetries: this.config.retryConfig.maxRetries,
          backoffTime,
          error: error.message 
        });
        
        await this.sleep(backoffTime);
        return this.makeRequest<T>(config, retryCount + 1);
      }
      throw error;
    }
  }

  private shouldRetry(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx status codes
    if (!error.response) return true; // Network error
    if (error.code === 'ECONNABORTED') return true; // Timeout
    
    const status = error.response?.status;
    return status >= 500 || status === 429; // Server errors or rate limit
  }

  private calculateBackoff(retryCount: number): number {
    const baseDelay = 1000; // 1 second
    const backoff = baseDelay * Math.pow(this.config.retryConfig.backoffMultiplier, retryCount);
    const jitter = Math.random() * 0.1 * backoff; // Add 10% jitter
    
    return Math.min(
      backoff + jitter,
      this.config.retryConfig.maxBackoffMs
    );
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Abstract methods to be implemented by concrete connectors
  abstract validateData(data: any): ValidationError[];
  abstract transformData(data: any): any;
  abstract syncData(): Promise<DataIngestionResult>;

  // Utility methods for concrete implementations
  protected createValidationError(
    field: string, 
    message: string, 
    value: any, 
    severity: 'warning' | 'error' = 'error'
  ): ValidationError {
    return { field, message, value, severity };
  }

  protected createIngestionResult(
    recordsProcessed: number,
    recordsSkipped: number = 0,
    errors: ValidationError[] = []
  ): DataIngestionResult {
    return {
      sourceId: this.sourceId,
      recordsProcessed,
      recordsSkipped,
      errors,
      nextSyncTime: new Date(Date.now() + 300000), // 5 minutes from now
      processingTimeMs: 0 // Will be set by caller
    };
  }

  // Public methods for monitoring
  public getStatus() {
    return {
      sourceId: this.sourceId,
      circuitBreakerState: this.circuitBreaker.state,
      failureCount: this.circuitBreaker.failureCount,
      rateLimiter: { ...this.rateLimiter }
    };
  }

  public resetCircuitBreaker(): void {
    this.circuitBreaker.state = CircuitBreakerState.CLOSED;
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.lastFailureTime = 0;
    this.emit('circuitBreakerReset', { sourceId: this.sourceId });
  }
}