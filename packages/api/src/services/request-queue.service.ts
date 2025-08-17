import { EventEmitter } from 'events';

export interface QueuedRequest {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  apiSource: string;
  endpoint: string;
  params?: any;
  headers?: Record<string, string>;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  scheduledAt?: number;
  executedAt?: number;
  completedAt?: number;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  averageWaitTime: number;
  averageProcessingTime: number;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  burstLimit: number;
}

export class RequestQueueService extends EventEmitter {
  private static instance: RequestQueueService;
  private queues: Map<string, QueuedRequest[]> = new Map();
  private processing: Map<string, QueuedRequest[]> = new Map();
  private rateLimitTrackers: Map<string, {
    requests: number[];
    lastReset: number;
    burstCount: number;
    burstResetTime: number;
  }> = new Map();
  private stats: Map<string, QueueStats> = new Map();
  private processingInterval?: NodeJS.Timeout;
  private readonly processingIntervalMs = 100; // Process queue every 100ms

  private constructor() {
    super();
    this.startProcessing();
  }

  public static getInstance(): RequestQueueService {
    if (!RequestQueueService.instance) {
      RequestQueueService.instance = new RequestQueueService();
    }
    return RequestQueueService.instance;
  }

  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      this.processQueues();
    }, this.processingIntervalMs);
  }

  private processQueues(): void {
    for (const [apiSource, queue] of this.queues.entries()) {
      if (queue.length === 0) continue;

      const canProcess = this.canProcessRequest(apiSource);
      if (!canProcess) continue;

      // Sort by priority and creation time
      queue.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Higher priority first
        }
        
        return a.createdAt - b.createdAt; // FIFO for same priority
      });

      const request = queue.shift();
      if (request) {
        this.executeRequest(request);
      }
    }
  }

  private canProcessRequest(apiSource: string): boolean {
    const tracker = this.rateLimitTrackers.get(apiSource);
    if (!tracker) return true;

    const now = Date.now();
    
    // Clean old requests (older than 1 hour)
    tracker.requests = tracker.requests.filter(time => now - time < 3600000);

    // Check burst limit
    if (tracker.burstCount >= this.getBurstLimit(apiSource)) {
      if (now - tracker.burstResetTime < 1000) { // 1 second burst window
        return false;
      } else {
        tracker.burstCount = 0;
        tracker.burstResetTime = now;
      }
    }

    // Check rate limits
    const config = this.getRateLimitConfig(apiSource);
    const recentRequests = tracker.requests.filter(time => now - time < 60000); // Last minute
    
    if (recentRequests.length >= config.requestsPerMinute) {
      return false;
    }

    const hourlyRequests = tracker.requests.filter(time => now - time < 3600000); // Last hour
    if (hourlyRequests.length >= config.requestsPerHour) {
      return false;
    }

    return true;
  }

  private async executeRequest(request: QueuedRequest): Promise<void> {
    const processingQueue = this.processing.get(request.apiSource) || [];
    processingQueue.push(request);
    this.processing.set(request.apiSource, processingQueue);

    request.executedAt = Date.now();
    this.updateRateLimit(request.apiSource);
    this.updateStats(request.apiSource, 'processing');

    try {
      // Emit event for actual API call execution
      this.emit('executeRequest', request);
      
      // The actual execution will be handled by the API client
      // This service just manages the queuing and rate limiting
      
    } catch (error) {
      this.handleRequestFailure(request, error);
    }
  }

  private updateRateLimit(apiSource: string): void {
    const tracker = this.rateLimitTrackers.get(apiSource) || {
      requests: [],
      lastReset: Date.now(),
      burstCount: 0,
      burstResetTime: Date.now()
    };

    tracker.requests.push(Date.now());
    tracker.burstCount++;
    
    this.rateLimitTrackers.set(apiSource, tracker);
  }

  private getRateLimitConfig(apiSource: string): RateLimitConfig {
    // Default rate limits - should be configurable per API source
    const configs: Record<string, RateLimitConfig> = {
      sportsDataIO: {
        requestsPerSecond: 1,
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        burstLimit: 5
      },
      oddsAPI: {
        requestsPerSecond: 0.5,
        requestsPerMinute: 10,
        requestsPerHour: 500,
        burstLimit: 2
      },
      espnAPI: {
        requestsPerSecond: 2,
        requestsPerMinute: 100,
        requestsPerHour: 2000,
        burstLimit: 10
      }
    };

    return configs[apiSource] || configs.sportsDataIO;
  }

  private getBurstLimit(apiSource: string): number {
    return this.getRateLimitConfig(apiSource).burstLimit;
  }

  private updateStats(apiSource: string, action: 'pending' | 'processing' | 'completed' | 'failed'): void {
    const stats = this.stats.get(apiSource) || {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      totalProcessed: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0
    };

    switch (action) {
      case 'pending':
        stats.pending++;
        break;
      case 'processing':
        stats.pending = Math.max(0, stats.pending - 1);
        stats.processing++;
        break;
      case 'completed':
        stats.processing = Math.max(0, stats.processing - 1);
        stats.completed++;
        stats.totalProcessed++;
        break;
      case 'failed':
        stats.processing = Math.max(0, stats.processing - 1);
        stats.failed++;
        stats.totalProcessed++;
        break;
    }

    this.stats.set(apiSource, stats);
  }

  private handleRequestFailure(request: QueuedRequest, error: any): void {
    request.retryCount++;
    
    if (request.retryCount < request.maxRetries) {
      // Re-queue for retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, request.retryCount), 30000); // Max 30 seconds
      request.scheduledAt = Date.now() + delay;
      
      const queue = this.queues.get(request.apiSource) || [];
      queue.push(request);
      this.queues.set(request.apiSource, queue);
      
      console.log(`Retrying request ${request.id} in ${delay}ms (attempt ${request.retryCount}/${request.maxRetries})`);
    } else {
      // Max retries exceeded
      request.reject(error);
      this.updateStats(request.apiSource, 'failed');
      this.removeFromProcessing(request);
    }
  }

  private removeFromProcessing(request: QueuedRequest): void {
    const processingQueue = this.processing.get(request.apiSource) || [];
    const index = processingQueue.findIndex(r => r.id === request.id);
    if (index !== -1) {
      processingQueue.splice(index, 1);
      this.processing.set(request.apiSource, processingQueue);
    }
  }

  public enqueue<T = any>(
    apiSource: string,
    endpoint: string,
    options: {
      priority?: 'low' | 'medium' | 'high' | 'critical';
      params?: any;
      headers?: Record<string, string>;
      maxRetries?: number;
      timeout?: number;
    } = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `${apiSource}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        priority: options.priority || 'medium',
        apiSource,
        endpoint,
        params: options.params,
        headers: options.headers,
        retryCount: 0,
        maxRetries: options.maxRetries || 3,
        createdAt: Date.now(),
        resolve,
        reject
      };

      const queue = this.queues.get(apiSource) || [];
      queue.push(request);
      this.queues.set(apiSource, queue);
      
      this.updateStats(apiSource, 'pending');
      
      // Set timeout if specified
      if (options.timeout) {
        setTimeout(() => {
          const stillInQueue = queue.includes(request);
          const stillProcessing = this.processing.get(apiSource)?.includes(request);
          
          if (stillInQueue || stillProcessing) {
            this.removeRequest(request);
            reject(new Error(`Request timeout after ${options.timeout}ms`));
          }
        }, options.timeout);
      }
    });
  }

  public completeRequest(requestId: string, result: any): void {
    // Find and complete the request
    for (const [apiSource, processingQueue] of this.processing.entries()) {
      const requestIndex = processingQueue.findIndex(r => r.id === requestId);
      if (requestIndex !== -1) {
        const request = processingQueue[requestIndex];
        request.completedAt = Date.now();
        request.resolve(result);
        
        processingQueue.splice(requestIndex, 1);
        this.processing.set(apiSource, processingQueue);
        this.updateStats(apiSource, 'completed');
        
        // Update average processing time
        this.updateAverageProcessingTime(apiSource, request);
        break;
      }
    }
  }

  public failRequest(requestId: string, error: any): void {
    // Find and fail the request
    for (const [apiSource, processingQueue] of this.processing.entries()) {
      const requestIndex = processingQueue.findIndex(r => r.id === requestId);
      if (requestIndex !== -1) {
        const request = processingQueue[requestIndex];
        this.handleRequestFailure(request, error);
        break;
      }
    }
  }

  private removeRequest(request: QueuedRequest): void {
    // Remove from queue
    const queue = this.queues.get(request.apiSource) || [];
    const queueIndex = queue.findIndex(r => r.id === request.id);
    if (queueIndex !== -1) {
      queue.splice(queueIndex, 1);
      this.queues.set(request.apiSource, queue);
    }

    // Remove from processing
    this.removeFromProcessing(request);
  }

  private updateAverageProcessingTime(apiSource: string, request: QueuedRequest): void {
    if (!request.executedAt || !request.completedAt) return;

    const processingTime = request.completedAt - request.executedAt;
    const stats = this.stats.get(apiSource);
    
    if (stats) {
      // Simple moving average
      const totalCompleted = stats.completed;
      stats.averageProcessingTime = 
        ((stats.averageProcessingTime * (totalCompleted - 1)) + processingTime) / totalCompleted;
    }
  }

  public getQueueStats(apiSource?: string): Map<string, QueueStats> | QueueStats {
    if (apiSource) {
      return this.stats.get(apiSource) || {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        totalProcessed: 0,
        averageWaitTime: 0,
        averageProcessingTime: 0
      };
    }
    
    return new Map(this.stats);
  }

  public getRateLimitStatus(apiSource?: string): Map<string, any> | any {
    if (apiSource) {
      const tracker = this.rateLimitTrackers.get(apiSource);
      const config = this.getRateLimitConfig(apiSource);
      
      if (!tracker) return null;

      const now = Date.now();
      const recentRequests = tracker.requests.filter(time => now - time < 60000);
      const hourlyRequests = tracker.requests.filter(time => now - time < 3600000);

      return {
        requestsInLastMinute: recentRequests.length,
        requestsInLastHour: hourlyRequests.length,
        burstCount: tracker.burstCount,
        limits: config,
        canMakeRequest: this.canProcessRequest(apiSource)
      };
    }

    const status = new Map();
    for (const apiSource of this.rateLimitTrackers.keys()) {
      status.set(apiSource, this.getRateLimitStatus(apiSource));
    }
    return status;
  }

  public clearQueue(apiSource: string): number {
    const queue = this.queues.get(apiSource) || [];
    const count = queue.length;
    
    // Reject all pending requests
    queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    
    this.queues.set(apiSource, []);
    
    // Reset stats
    const stats = this.stats.get(apiSource);
    if (stats) {
      stats.pending = 0;
    }
    
    return count;
  }

  public pauseQueue(apiSource: string): void {
    // Implementation would involve adding a paused state
    // For now, we can clear the processing interval for this source
    console.log(`Queue paused for ${apiSource}`);
  }

  public resumeQueue(apiSource: string): void {
    // Implementation would involve resuming processing
    console.log(`Queue resumed for ${apiSource}`);
  }

  public destroy(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    // Reject all pending requests
    for (const queue of this.queues.values()) {
      queue.forEach(request => {
        request.reject(new Error('Service destroyed'));
      });
    }
    
    this.queues.clear();
    this.processing.clear();
    this.rateLimitTrackers.clear();
    this.stats.clear();
  }
}