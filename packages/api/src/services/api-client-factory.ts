import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config';
import { ProxyManagerService } from './proxy-manager.service';
import { CacheManagerService } from './cache-manager.service';
import { RequestQueueService } from './request-queue.service';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

interface RateLimitTracker {
  requests: number;
  resetTime: number;
  dailyRequests: number;
  dailyResetTime: number;
}

interface APIClientOptions {
  baseURL: string;
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
  rateLimitConfig?: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  headers?: Record<string, string>;
  useProxy?: boolean;
}

export class APIClientFactory {
  private static instance: APIClientFactory;
  private clients: Map<string, AxiosInstance> = new Map();
  private rateLimitTrackers: Map<string, RateLimitTracker> = new Map();
  private proxyManager: ProxyManagerService;
  private cacheManager: CacheManagerService;
  private requestQueue: RequestQueueService;

  private constructor() {
    this.proxyManager = ProxyManagerService.getInstance();
    this.cacheManager = CacheManagerService.getInstance();
    this.requestQueue = RequestQueueService.getInstance();
    this.setupRequestQueueHandlers();
  }

  public static getInstance(): APIClientFactory {
    if (!APIClientFactory.instance) {
      APIClientFactory.instance = new APIClientFactory();
    }
    return APIClientFactory.instance;
  }

  private setupRequestQueueHandlers(): void {
    this.requestQueue.on('executeRequest', async (request) => {
      try {
        const client = this.clients.get(request.apiSource);
        if (!client) {
          throw new Error(`No client found for API source: ${request.apiSource}`);
        }

        const response = await client.request({
          method: 'GET',
          url: request.endpoint,
          params: request.params,
          headers: request.headers
        });

        this.requestQueue.completeRequest(request.id, response.data);
      } catch (error) {
        this.requestQueue.failRequest(request.id, error);
      }
    });
  }

  public createClient(name: string, options: APIClientOptions): AxiosInstance {
    const defaultRetryConfig: RetryConfig = {
      maxRetries: config.retry.maxRetries,
      baseDelay: config.retry.baseDelay,
      maxDelay: config.retry.maxDelay,
      backoffMultiplier: config.retry.backoffMultiplier
    };

    const retryConfig = { ...defaultRetryConfig, ...options.retryConfig };
    const timeout = options.timeout || config.timeouts.default;

    const client = axios.create({
      baseURL: options.baseURL,
      timeout,
      headers: {
        'User-Agent': 'UFC-Prediction-Platform/1.0',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        ...options.headers
      }
    });

    // Initialize rate limit tracker
    if (options.rateLimitConfig) {
      this.rateLimitTrackers.set(name, {
        requests: 0,
        resetTime: Date.now() + 60000,
        dailyRequests: 0,
        dailyResetTime: Date.now() + 86400000 // 24 hours
      });
    }

    // Request interceptor
    client.interceptors.request.use(
      async (config) => {
        // Check rate limits
        if (options.rateLimitConfig) {
          await this.checkRateLimit(name, options.rateLimitConfig);
        }

        // Add proxy if enabled
        if (options.useProxy) {
          const proxyAgent = this.proxyManager.getProxyAgent();
          if (proxyAgent) {
            config.httpsAgent = proxyAgent;
          }
        }

        // Add retry count to config
        if (!config.metadata) {
          config.metadata = {};
        }
        config.metadata.retryCount = 0;

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor with retry logic
    client.interceptors.response.use(
      (response) => {
        // Update rate limit tracker on successful response
        if (options.rateLimitConfig) {
          this.updateRateLimit(name);
        }
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & { metadata?: { retryCount: number } };
        
        if (!originalRequest || !originalRequest.metadata) {
          return Promise.reject(error);
        }

        const shouldRetry = this.shouldRetry(error, originalRequest.metadata.retryCount, retryConfig);
        
        if (shouldRetry) {
          originalRequest.metadata.retryCount++;
          
          // Calculate delay with exponential backoff
          const delay = Math.min(
            retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, originalRequest.metadata.retryCount - 1),
            retryConfig.maxDelay
          );

          console.log(`Retrying request to ${originalRequest.url} (attempt ${originalRequest.metadata.retryCount}/${retryConfig.maxRetries}) after ${delay}ms delay`);
          
          await this.delay(delay);
          
          // Handle rate limit errors
          if (error.response?.status === 429) {
            await this.handleRateLimit(name, error);
          }

          return client.request(originalRequest);
        }

        return Promise.reject(error);
      }
    );

    this.clients.set(name, client);
    return client;
  }

  private shouldRetry(error: AxiosError, retryCount: number, retryConfig: RetryConfig): boolean {
    if (retryCount >= retryConfig.maxRetries) {
      return false;
    }

    // Retry on network errors
    if (!error.response) {
      return true;
    }

    const status = error.response.status;

    // Retry on server errors (5xx)
    if (status >= 500) {
      return true;
    }

    // Retry on rate limit errors (429)
    if (status === 429) {
      return true;
    }

    // Retry on specific client errors that might be temporary
    if (status === 408 || status === 409 || status === 423 || status === 424) {
      return true;
    }

    return false;
  }

  private async checkRateLimit(clientName: string, rateLimitConfig: { requestsPerMinute: number; requestsPerHour: number; requestsPerDay: number }): Promise<void> {
    const tracker = this.rateLimitTrackers.get(clientName);
    if (!tracker) return;

    const now = Date.now();

    // Reset daily counter if day has passed
    if (now > tracker.dailyResetTime) {
      tracker.dailyRequests = 0;
      tracker.dailyResetTime = now + 86400000; // Next day
    }

    // Reset minute counter if minute has passed
    if (now > tracker.resetTime) {
      tracker.requests = 0;
      tracker.resetTime = now + 60000; // Next minute
    }

    // Check daily limit
    if (tracker.dailyRequests >= rateLimitConfig.requestsPerDay) {
      const waitTime = tracker.dailyResetTime - now;
      console.log(`Daily rate limit reached for ${clientName}, waiting ${Math.round(waitTime / 1000)}s`);
      await this.delay(waitTime);
      tracker.dailyRequests = 0;
      tracker.dailyResetTime = Date.now() + 86400000;
    }

    // Check minute limit
    if (tracker.requests >= rateLimitConfig.requestsPerMinute) {
      const waitTime = tracker.resetTime - now;
      console.log(`Rate limit reached for ${clientName}, waiting ${Math.round(waitTime / 1000)}s`);
      await this.delay(waitTime);
      tracker.requests = 0;
      tracker.resetTime = Date.now() + 60000;
    }
  }

  private updateRateLimit(clientName: string): void {
    const tracker = this.rateLimitTrackers.get(clientName);
    if (tracker) {
      tracker.requests++;
      tracker.dailyRequests++;
    }
  }

  private async handleRateLimit(clientName: string, error: AxiosError): Promise<void> {
    const retryAfter = error.response?.headers['retry-after'];
    let waitTime = 60000; // Default 1 minute

    if (retryAfter) {
      // Parse retry-after header (can be in seconds or HTTP date)
      const retryAfterNum = parseInt(retryAfter, 10);
      if (!isNaN(retryAfterNum)) {
        waitTime = retryAfterNum * 1000; // Convert to milliseconds
      } else {
        const retryDate = new Date(retryAfter);
        if (!isNaN(retryDate.getTime())) {
          waitTime = Math.max(0, retryDate.getTime() - Date.now());
        }
      }
    }

    console.log(`Rate limit hit for ${clientName}, waiting ${Math.round(waitTime / 1000)}s`);
    await this.delay(waitTime);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getClient(name: string): AxiosInstance | undefined {
    return this.clients.get(name);
  }

  public async healthCheck(): Promise<{ [key: string]: { status: boolean; responseTime?: number; error?: string } }> {
    const results: { [key: string]: { status: boolean; responseTime?: number; error?: string } } = {};

    for (const [name, client] of this.clients.entries()) {
      const startTime = Date.now();
      try {
        await client.get('/health', { timeout: 5000 });
        results[name] = {
          status: true,
          responseTime: Date.now() - startTime
        };
      } catch (error) {
        results[name] = {
          status: false,
          responseTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    return results;
  }

  public getRateLimitStatus(): { [key: string]: RateLimitTracker } {
    const status: { [key: string]: RateLimitTracker } = {};
    for (const [name, tracker] of this.rateLimitTrackers.entries()) {
      status[name] = { ...tracker };
    }
    return status;
  }

  public getProxyManager(): ProxyManagerService {
    return this.proxyManager;
  }

  public getCacheManager(): CacheManagerService {
    return this.cacheManager;
  }

  public getRequestQueue(): RequestQueueService {
    return this.requestQueue;
  }

  public destroy(): void {
    this.proxyManager.destroy();
    this.cacheManager.destroy();
    this.requestQueue.destroy();
    this.clients.clear();
    this.rateLimitTrackers.clear();
  }
}