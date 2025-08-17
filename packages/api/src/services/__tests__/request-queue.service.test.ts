import { RequestQueueService, QueuedRequest } from '../request-queue.service';

describe('RequestQueueService', () => {
  let requestQueue: RequestQueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Reset singleton instance
    (RequestQueueService as any).instance = undefined;
    requestQueue = RequestQueueService.getInstance();
  });

  afterEach(() => {
    requestQueue.destroy();
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should create singleton instance', () => {
      const instance1 = RequestQueueService.getInstance();
      const instance2 = RequestQueueService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should start processing interval', () => {
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 100);
    });
  });

  describe('Request Enqueueing', () => {
    it('should enqueue request with default priority', async () => {
      const promise = requestQueue.enqueue('testAPI', '/test-endpoint');
      
      const stats = requestQueue.getQueueStats('testAPI') as any;
      expect(stats.pending).toBe(1);
      
      // Complete the request to avoid hanging promise
      requestQueue.completeRequest(expect.any(String), { success: true });
    });

    it('should enqueue request with custom options', async () => {
      const promise = requestQueue.enqueue('testAPI', '/test-endpoint', {
        priority: 'high',
        params: { test: 'value' },
        headers: { 'Custom-Header': 'test' },
        maxRetries: 5
      });
      
      const stats = requestQueue.getQueueStats('testAPI') as any;
      expect(stats.pending).toBe(1);
    });

    it('should handle request timeout', async () => {
      const promise = requestQueue.enqueue('testAPI', '/test-endpoint', {
        timeout: 1000
      });

      // Advance time to trigger timeout
      jest.advanceTimersByTime(1100);

      await expect(promise).rejects.toThrow('Request timeout after 1000ms');
    });
  });

  describe('Priority Handling', () => {
    it('should process high priority requests first', () => {
      // Enqueue requests with different priorities
      requestQueue.enqueue('testAPI', '/low', { priority: 'low' });
      requestQueue.enqueue('testAPI', '/high', { priority: 'high' });
      requestQueue.enqueue('testAPI', '/medium', { priority: 'medium' });
      requestQueue.enqueue('testAPI', '/critical', { priority: 'critical' });

      // Get the queue to check order
      const queues = (requestQueue as any).queues;
      const testQueue = queues.get('testAPI') || [];
      
      // Trigger processing to sort the queue
      (requestQueue as any).processQueues();
      
      // Check that critical is first, then high, medium, low
      expect(testQueue[0].priority).toBe('critical');
      expect(testQueue[1].priority).toBe('high');
      expect(testQueue[2].priority).toBe('medium');
      expect(testQueue[3].priority).toBe('low');
    });

    it('should use FIFO for same priority requests', () => {
      const now = Date.now();
      
      // Enqueue multiple requests with same priority
      requestQueue.enqueue('testAPI', '/first', { priority: 'medium' });
      requestQueue.enqueue('testAPI', '/second', { priority: 'medium' });
      requestQueue.enqueue('testAPI', '/third', { priority: 'medium' });

      const queues = (requestQueue as any).queues;
      const testQueue = queues.get('testAPI') || [];
      
      // Check creation time order
      expect(testQueue[0].createdAt).toBeLessThanOrEqual(testQueue[1].createdAt);
      expect(testQueue[1].createdAt).toBeLessThanOrEqual(testQueue[2].createdAt);
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', () => {
      // Mock rate limit config
      const originalGetRateLimitConfig = (requestQueue as any).getRateLimitConfig;
      (requestQueue as any).getRateLimitConfig = jest.fn().mockReturnValue({
        requestsPerSecond: 1,
        requestsPerMinute: 2,
        requestsPerHour: 10,
        burstLimit: 1
      });

      // Initialize rate limit tracker
      const rateLimitTrackers = (requestQueue as any).rateLimitTrackers;
      rateLimitTrackers.set('testAPI', {
        requests: [Date.now() - 30000, Date.now() - 10000], // 2 requests in last minute
        lastReset: Date.now(),
        burstCount: 1,
        burstResetTime: Date.now()
      });

      const canProcess = (requestQueue as any).canProcessRequest('testAPI');
      expect(canProcess).toBe(false);

      // Restore original method
      (requestQueue as any).getRateLimitConfig = originalGetRateLimitConfig;
    });

    it('should allow requests when under rate limit', () => {
      const canProcess = (requestQueue as any).canProcessRequest('newAPI');
      expect(canProcess).toBe(true);
    });

    it('should update rate limit tracker on request execution', () => {
      const rateLimitTrackers = (requestQueue as any).rateLimitTrackers;
      
      (requestQueue as any).updateRateLimit('testAPI');
      
      const tracker = rateLimitTrackers.get('testAPI');
      expect(tracker).toBeTruthy();
      expect(tracker.requests.length).toBe(1);
      expect(tracker.burstCount).toBe(1);
    });
  });

  describe('Request Completion', () => {
    it('should complete request successfully', async () => {
      let requestId: string;
      
      // Mock the executeRequest event to capture request ID
      requestQueue.on('executeRequest', (request: QueuedRequest) => {
        requestId = request.id;
        // Simulate async completion
        setTimeout(() => {
          requestQueue.completeRequest(request.id, { success: true });
        }, 10);
      });

      const promise = requestQueue.enqueue('testAPI', '/test-endpoint');
      
      // Advance time to trigger processing
      jest.advanceTimersByTime(200);
      
      const result = await promise;
      expect(result).toEqual({ success: true });
      
      const stats = requestQueue.getQueueStats('testAPI') as any;
      expect(stats.completed).toBe(1);
    });

    it('should handle request failure with retries', async () => {
      let requestId: string;
      let attemptCount = 0;
      
      requestQueue.on('executeRequest', (request: QueuedRequest) => {
        requestId = request.id;
        attemptCount++;
        
        if (attemptCount < 3) {
          // Fail first 2 attempts
          setTimeout(() => {
            requestQueue.failRequest(request.id, new Error('Temporary failure'));
          }, 10);
        } else {
          // Succeed on 3rd attempt
          setTimeout(() => {
            requestQueue.completeRequest(request.id, { success: true });
          }, 10);
        }
      });

      const promise = requestQueue.enqueue('testAPI', '/test-endpoint', {
        maxRetries: 3
      });
      
      // Advance time to allow retries
      jest.advanceTimersByTime(5000);
      
      const result = await promise;
      expect(result).toEqual({ success: true });
      expect(attemptCount).toBe(3);
    });

    it('should reject after max retries exceeded', async () => {
      let requestId: string;
      
      requestQueue.on('executeRequest', (request: QueuedRequest) => {
        requestId = request.id;
        // Always fail
        setTimeout(() => {
          requestQueue.failRequest(request.id, new Error('Persistent failure'));
        }, 10);
      });

      const promise = requestQueue.enqueue('testAPI', '/test-endpoint', {
        maxRetries: 2
      });
      
      // Advance time to allow all retries
      jest.advanceTimersByTime(10000);
      
      await expect(promise).rejects.toThrow('Persistent failure');
      
      const stats = requestQueue.getQueueStats('testAPI') as any;
      expect(stats.failed).toBe(1);
    });
  });

  describe('Queue Management', () => {
    it('should return queue statistics', () => {
      requestQueue.enqueue('testAPI', '/test1');
      requestQueue.enqueue('testAPI', '/test2');
      requestQueue.enqueue('otherAPI', '/test3');

      const allStats = requestQueue.getQueueStats();
      expect(allStats instanceof Map).toBe(true);
      expect(allStats.size).toBe(2);

      const testAPIStats = requestQueue.getQueueStats('testAPI') as any;
      expect(testAPIStats.pending).toBe(2);
    });

    it('should return rate limit status', () => {
      // Add some requests to create rate limit data
      (requestQueue as any).updateRateLimit('testAPI');
      (requestQueue as any).updateRateLimit('testAPI');

      const rateLimitStatus = requestQueue.getRateLimitStatus('testAPI');
      expect(rateLimitStatus).toHaveProperty('requestsInLastMinute');
      expect(rateLimitStatus).toHaveProperty('requestsInLastHour');
      expect(rateLimitStatus).toHaveProperty('burstCount');
      expect(rateLimitStatus).toHaveProperty('limits');
      expect(rateLimitStatus).toHaveProperty('canMakeRequest');
    });

    it('should clear queue', () => {
      requestQueue.enqueue('testAPI', '/test1');
      requestQueue.enqueue('testAPI', '/test2');

      const clearedCount = requestQueue.clearQueue('testAPI');
      expect(clearedCount).toBe(2);

      const stats = requestQueue.getQueueStats('testAPI') as any;
      expect(stats.pending).toBe(0);
    });

    it('should pause and resume queue', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      requestQueue.pauseQueue('testAPI');
      expect(consoleSpy).toHaveBeenCalledWith('Queue paused for testAPI');

      requestQueue.resumeQueue('testAPI');
      expect(consoleSpy).toHaveBeenCalledWith('Queue resumed for testAPI');

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing request ID in completion', () => {
      expect(() => {
        requestQueue.completeRequest('nonexistent-id', { result: 'test' });
      }).not.toThrow();
    });

    it('should handle missing request ID in failure', () => {
      expect(() => {
        requestQueue.failRequest('nonexistent-id', new Error('Test error'));
      }).not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on destroy', () => {
      requestQueue.enqueue('testAPI', '/test1');
      requestQueue.enqueue('testAPI', '/test2');

      const queues = (requestQueue as any).queues;
      const processing = (requestQueue as any).processing;
      
      expect(queues.size).toBeGreaterThan(0);

      requestQueue.destroy();

      expect(queues.size).toBe(0);
      expect(processing.size).toBe(0);
      expect(clearInterval).toHaveBeenCalled();
    });

    it('should reject pending requests on destroy', async () => {
      const promise = requestQueue.enqueue('testAPI', '/test-endpoint');

      requestQueue.destroy();

      await expect(promise).rejects.toThrow('Service destroyed');
    });
  });

  describe('Processing Loop', () => {
    it('should process queues at regular intervals', () => {
      const processQueuesSpy = jest.spyOn(requestQueue as any, 'processQueues');

      // Advance time to trigger processing
      jest.advanceTimersByTime(200);

      expect(processQueuesSpy).toHaveBeenCalledTimes(2); // Called twice in 200ms with 100ms interval
    });

    it('should skip empty queues during processing', () => {
      const canProcessSpy = jest.spyOn(requestQueue as any, 'canProcessRequest');

      // Process with no queued requests
      (requestQueue as any).processQueues();

      expect(canProcessSpy).not.toHaveBeenCalled();
    });
  });
});