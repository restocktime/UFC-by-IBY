import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ScrapingEngine, ScrapingConfig, ProxyConfig } from '../base/scraping-engine.js';
import { ValidationError, DataIngestionResult } from '@ufc-platform/shared';

// Mock implementation for testing
class MockScrapingEngine extends ScrapingEngine {
  public validateData(data: any): ValidationError[] {
    if (!data || !data.name) {
      return [this.createValidationError('name', 'Name is required', data, 'error')];
    }
    return [];
  }

  public transformData(data: any): any {
    return { ...data, transformed: true };
  }

  public async syncData(): Promise<DataIngestionResult> {
    return this.createIngestionResult(1, 0, []);
  }

  // Expose protected methods for testing
  public testGetNextSession() {
    return this.getNextSession();
  }

  public testWaitForRateLimit(session: any) {
    return this.waitForRateLimit(session);
  }

  public testMarkSessionAsBlocked(sessionId: string, reason: string) {
    return this.markSessionAsBlocked(sessionId, reason);
  }

  public testResetSession(sessionId: string) {
    return this.resetSession(sessionId);
  }

  public testSleep(ms: number) {
    return this.sleep(ms);
  }
}

describe('ScrapingEngine', () => {
  let engine: MockScrapingEngine;
  let mockConfig: ScrapingConfig;

  beforeEach(() => {
    mockConfig = {
      baseUrl: 'https://example.com',
      apiKey: undefined,
      rateLimit: {
        requestsPerMinute: 10,
        requestsPerHour: 100
      },
      retryConfig: {
        maxRetries: 3,
        backoffMultiplier: 2,
        maxBackoffMs: 10000
      },
      userAgents: [
        'Mozilla/5.0 (Test Browser)',
        'Mozilla/5.0 (Another Test Browser)'
      ],
      proxies: [
        {
          host: 'proxy1.example.com',
          port: 8080,
          protocol: 'http'
        },
        {
          host: 'proxy2.example.com',
          port: 8080,
          protocol: 'https',
          username: 'user',
          password: 'pass'
        }
      ],
      requestDelay: {
        min: 1000,
        max: 3000
      },
      antiDetection: {
        randomizeHeaders: true,
        rotateProxies: true,
        respectRobotsTxt: true
      }
    };

    engine = new MockScrapingEngine('TEST_SCRAPER', mockConfig);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(engine.getStatus().sourceId).toBe('TEST_SCRAPER');
      expect(engine.getStatus().totalSessions).toBe(2); // Two proxies configured
    });

    it('should create sessions for each proxy', () => {
      const status = engine.getStatus();
      expect(status.sessions).toHaveLength(2);
      expect(status.sessions[0].proxy).toBe('proxy1.example.com:8080');
      expect(status.sessions[1].proxy).toBe('proxy2.example.com:8080');
    });

    it('should create at least one session when no proxies configured', () => {
      const configWithoutProxies = { ...mockConfig, proxies: [] };
      const engineWithoutProxies = new MockScrapingEngine('TEST_NO_PROXY', configWithoutProxies);
      
      const status = engineWithoutProxies.getStatus();
      expect(status.totalSessions).toBe(1);
      expect(status.sessions[0].proxy).toBe('none');
    });
  });

  describe('Session Management', () => {
    it('should rotate sessions in round-robin fashion', () => {
      const session1 = engine.testGetNextSession();
      const session2 = engine.testGetNextSession();
      const session3 = engine.testGetNextSession();

      expect(session1?.id).toBe('session_1'); // First call increments index
      expect(session2?.id).toBe('session_0');
      expect(session3?.id).toBe('session_1'); // Should wrap around
    });

    it('should skip blocked sessions', () => {
      // Block the first session
      engine.testMarkSessionAsBlocked('session_0', 'Test block');
      
      const session1 = engine.testGetNextSession();
      const session2 = engine.testGetNextSession();

      expect(session1?.id).toBe('session_1');
      expect(session2?.id).toBe('session_1'); // Should keep using the only available session
    });

    it('should return null when all sessions are blocked', () => {
      engine.testMarkSessionAsBlocked('session_0', 'Test block 1');
      engine.testMarkSessionAsBlocked('session_1', 'Test block 2');
      
      const session = engine.testGetNextSession();
      expect(session).toBeNull();
    });

    it('should emit events when sessions are blocked', () => {
      const blockSpy = vi.fn();
      engine.on('sessionBlocked', blockSpy);

      engine.testMarkSessionAsBlocked('session_0', 'Test reason');

      expect(blockSpy).toHaveBeenCalledWith({
        sessionId: 'session_0',
        reason: 'Test reason',
        proxy: mockConfig.proxies[0],
        sourceId: 'TEST_SCRAPER'
      });
    });

    it('should reset sessions correctly', () => {
      // Block a session first
      engine.testMarkSessionAsBlocked('session_0', 'Test block');
      expect(engine.getStatus().blockedSessions).toBe(1);

      // Reset the session
      engine.testResetSession('session_0');
      expect(engine.getStatus().blockedSessions).toBe(0);
    });

    it('should reset all sessions', () => {
      // Block both sessions
      engine.testMarkSessionAsBlocked('session_0', 'Test block 1');
      engine.testMarkSessionAsBlocked('session_1', 'Test block 2');
      expect(engine.getStatus().blockedSessions).toBe(2);

      // Reset all sessions
      engine.resetAllSessions();
      expect(engine.getStatus().blockedSessions).toBe(0);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should respect minimum delay between requests', async () => {
      const session = engine.testGetNextSession()!;

      // First request should not wait (no previous request time)
      await engine.testWaitForRateLimit(session);
      expect(session.requestCount).toBe(1);

      // Second request should wait for the minimum delay
      const waitPromise = engine.testWaitForRateLimit(session);
      
      // Fast-forward past the maximum delay to ensure completion
      vi.advanceTimersByTime(5000);
      await waitPromise;
      
      expect(session.requestCount).toBe(2);
    }, 10000);

    it('should add random jitter to delays', async () => {
      const session = engine.testGetNextSession()!;
      
      // Mock Math.random to return predictable values
      const originalRandom = Math.random;
      Math.random = vi.fn().mockReturnValue(0.5);

      await engine.testWaitForRateLimit(session);
      const firstTime = session.lastRequestTime;

      // Fast-forward time and wait for rate limit
      vi.advanceTimersByTime(5000);
      await engine.testWaitForRateLimit(session);
      const secondTime = session.lastRequestTime;

      expect(secondTime).toBeGreaterThan(firstTime);
      expect(session.requestCount).toBe(2);

      Math.random = originalRandom;
    }, 10000);

    it('should track request counts per session', async () => {
      const session = engine.testGetNextSession()!;
      expect(session.requestCount).toBe(0);

      await engine.testWaitForRateLimit(session);
      expect(session.requestCount).toBe(1);

      // Fast-forward time for second request
      vi.advanceTimersByTime(5000);
      await engine.testWaitForRateLimit(session);
      expect(session.requestCount).toBe(2);
    }, 10000);
  });

  describe('User Agent Rotation', () => {
    it('should select random user agents', () => {
      // Create multiple engines to test randomness
      const userAgents = new Set();
      
      for (let i = 0; i < 10; i++) {
        const testEngine = new MockScrapingEngine(`TEST_${i}`, mockConfig);
        const session = testEngine.testGetNextSession();
        if (session) {
          userAgents.add(session.userAgent);
        }
      }

      // Should have selected from the configured user agents
      userAgents.forEach(ua => {
        expect(mockConfig.userAgents).toContain(ua);
      });
    });

    it('should use default user agents when none configured', () => {
      const configWithoutUA = { ...mockConfig, userAgents: [] };
      const testEngine = new MockScrapingEngine('TEST_DEFAULT_UA', configWithoutUA);
      
      const session = testEngine.testGetNextSession();
      expect(session?.userAgent).toContain('Mozilla/5.0');
    });
  });

  describe('Validation and Transformation', () => {
    it('should validate data correctly', () => {
      const validData = { name: 'Test Fighter' };
      const invalidData = { nickname: 'Test' };

      const validErrors = engine.validateData(validData);
      const invalidErrors = engine.validateData(invalidData);

      expect(validErrors).toHaveLength(0);
      expect(invalidErrors).toHaveLength(1);
      expect(invalidErrors[0].field).toBe('name');
      expect(invalidErrors[0].severity).toBe('error');
    });

    it('should transform data correctly', () => {
      const inputData = { name: 'Test Fighter', age: 25 };
      const transformed = engine.transformData(inputData);

      expect(transformed).toEqual({
        name: 'Test Fighter',
        age: 25,
        transformed: true
      });
    });

    it('should create validation errors with correct format', () => {
      const error = engine['createValidationError']('testField', 'Test message', 'testValue', 'warning');

      expect(error).toEqual({
        field: 'testField',
        message: 'Test message',
        value: 'testValue',
        severity: 'warning'
      });
    });

    it('should create ingestion results with correct format', () => {
      const errors: ValidationError[] = [
        { field: 'test', message: 'Test error', value: 'test', severity: 'error' }
      ];
      
      const result = engine['createIngestionResult'](10, 2, errors);

      expect(result).toEqual({
        sourceId: 'TEST_SCRAPER',
        recordsProcessed: 10,
        recordsSkipped: 2,
        errors,
        nextSyncTime: expect.any(Date),
        processingTimeMs: 0
      });
    });
  });

  describe('Status and Monitoring', () => {
    it('should provide accurate status information', () => {
      const status = engine.getStatus();

      expect(status).toEqual({
        sourceId: 'TEST_SCRAPER',
        totalSessions: 2,
        blockedSessions: 0,
        blockedProxies: [],
        sessions: [
          {
            id: 'session_0',
            blocked: false,
            requestCount: 0,
            proxy: 'proxy1.example.com:8080'
          },
          {
            id: 'session_1',
            blocked: false,
            requestCount: 0,
            proxy: 'proxy2.example.com:8080'
          }
        ]
      });
    });

    it('should track blocked proxies', () => {
      engine.testMarkSessionAsBlocked('session_0', 'Test block');
      
      const status = engine.getStatus();
      expect(status.blockedProxies).toContain('proxy1.example.com:8080');
      expect(status.blockedSessions).toBe(1);
    });
  });

  describe('Event Emission', () => {
    it('should emit rateLimitWait events', async () => {
      vi.useFakeTimers();
      
      const rateLimitSpy = vi.fn();
      engine.on('rateLimitWait', rateLimitSpy);

      const session = engine.testGetNextSession()!;
      
      // First request to set lastRequestTime
      await engine.testWaitForRateLimit(session);
      
      // Second request should trigger rate limit wait
      const waitPromise = engine.testWaitForRateLimit(session);
      
      // Let the promise start
      await Promise.resolve();
      
      expect(rateLimitSpy).toHaveBeenCalledWith({
        sessionId: session.id,
        delay: expect.any(Number),
        sourceId: 'TEST_SCRAPER'
      });

      vi.advanceTimersByTime(5000);
      await waitPromise;
    });

    it('should emit sessionReset events', () => {
      const resetSpy = vi.fn();
      engine.on('sessionReset', resetSpy);

      engine.testResetSession('session_0');

      expect(resetSpy).toHaveBeenCalledWith({
        sessionId: 'session_0',
        sourceId: 'TEST_SCRAPER'
      });
    });

    it('should emit allSessionsBlocked events', () => {
      const allBlockedSpy = vi.fn();
      engine.on('allSessionsBlocked', allBlockedSpy);

      // Block all sessions
      engine.testMarkSessionAsBlocked('session_0', 'Test block 1');
      engine.testMarkSessionAsBlocked('session_1', 'Test block 2');

      // Try to get next session
      engine.testGetNextSession();

      expect(allBlockedSpy).toHaveBeenCalledWith({
        sourceId: 'TEST_SCRAPER'
      });
    });

    it('should emit allSessionsReset events', () => {
      const allResetSpy = vi.fn();
      engine.on('allSessionsReset', allResetSpy);

      engine.resetAllSessions();

      expect(allResetSpy).toHaveBeenCalledWith({
        sourceId: 'TEST_SCRAPER'
      });
    });
  });

  describe('Sleep Utility', () => {
    it('should sleep for the specified duration', async () => {
      vi.useFakeTimers();
      
      const sleepPromise = engine.testSleep(1000);
      
      // Should not resolve immediately
      let resolved = false;
      sleepPromise.then(() => { resolved = true; });
      await Promise.resolve();
      expect(resolved).toBe(false);

      // Should resolve after the specified time
      vi.advanceTimersByTime(1000);
      await sleepPromise;
      expect(resolved).toBe(true);
    });
  });

  describe('Abstract Method Implementation', () => {
    it('should implement syncData method', async () => {
      const result = await engine.syncData();
      
      expect(result).toEqual({
        sourceId: 'TEST_SCRAPER',
        recordsProcessed: 1,
        recordsSkipped: 0,
        errors: [],
        nextSyncTime: expect.any(Date),
        processingTimeMs: 0
      });
    });
  });
});