import { Request } from 'express';
import { AbusePreventionService } from '../abuse-prevention.service';
import { AuditLoggerService } from '../audit-logger.service';

describe('AbusePreventionService', () => {
  let abusePreventionService: AbusePreventionService;
  let auditLogger: AuditLoggerService;

  beforeEach(() => {
    auditLogger = new AuditLoggerService();
    abusePreventionService = new AbusePreventionService(auditLogger);
  });

  afterEach(() => {
    abusePreventionService.destroy();
    auditLogger.destroy?.();
  });

  const createMockRequest = (overrides: Partial<Request> = {}): Request => {
    return {
      method: 'GET',
      path: '/api/test',
      originalUrl: '/api/test',
      url: '/api/test',
      headers: {
        'user-agent': 'test-agent',
      },
      query: {},
      body: {},
      params: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      get: (header: string) => overrides.headers?.[header.toLowerCase()] || 'test-agent',
      ...overrides,
    } as Request;
  };

  describe('analyzeRequest', () => {
    it('should analyze normal request without detecting abuse', () => {
      const req = createMockRequest();
      const result = abusePreventionService.analyzeRequest(req);

      expect(result.isAbusive).toBe(false);
      expect(result.patterns).toHaveLength(0);
      expect(result.severity).toBe('low');
      expect(result.action).toBe('log');
    });

    it('should detect rapid request pattern', () => {
      const req = createMockRequest();
      
      // Simulate 101 rapid requests
      for (let i = 0; i < 101; i++) {
        abusePreventionService.analyzeRequest(req);
      }
      
      const result = abusePreventionService.analyzeRequest(req);

      expect(result.isAbusive).toBe(true);
      expect(result.patterns).toContain('rapid_requests');
      expect(result.severity).toBe('high');
      expect(result.action).toBe('block');
    });

    it('should detect endpoint scanning pattern', () => {
      const baseReq = createMockRequest();
      
      // Simulate scanning 21 different endpoints
      for (let i = 0; i < 21; i++) {
        const req = { ...baseReq, path: `/api/endpoint${i}` };
        abusePreventionService.analyzeRequest(req as Request);
      }
      
      const result = abusePreventionService.analyzeRequest(baseReq);

      expect(result.isAbusive).toBe(true);
      expect(result.patterns).toContain('endpoint_scanning');
      expect(result.severity).toBe('medium');
      expect(result.action).toBe('warn');
    });

    it('should detect failed authentication attempts', () => {
      const req = createMockRequest({ path: '/auth/login' });
      
      // Simulate 11 failed auth attempts
      for (let i = 0; i < 11; i++) {
        const mockReq = { ...req };
        // Mock the request history to include status codes
        const result = abusePreventionService.analyzeRequest(mockReq as Request);
        // Manually add failed requests to history for testing
        (abusePreventionService as any).requestHistory.get('127.0.0.1')?.forEach((h: any) => {
          if (h.endpoint.includes('/auth')) {
            h.statusCode = 401;
          }
        });
      }
      
      const result = abusePreventionService.analyzeRequest(req);

      expect(result.isAbusive).toBe(true);
      expect(result.patterns).toContain('failed_auth_attempts');
    });

    it('should detect user agent rotation', () => {
      const baseReq = createMockRequest();
      
      // Simulate requests with different user agents
      for (let i = 0; i < 25; i++) {
        const userAgent = `agent-${i % 6}`; // 6 different agents
        const req = {
          ...baseReq,
          headers: { 'user-agent': userAgent },
          get: (header: string) => header.toLowerCase() === 'user-agent' ? userAgent : 'default'
        };
        abusePreventionService.analyzeRequest(req as Request);
      }
      
      const result = abusePreventionService.analyzeRequest(baseReq);

      expect(result.isAbusive).toBe(true);
      expect(result.patterns).toContain('user_agent_rotation');
    });

    it('should detect data scraping pattern', () => {
      const req = createMockRequest({ path: '/api/fighters', method: 'GET' });
      
      // Simulate 201 data requests
      for (let i = 0; i < 201; i++) {
        abusePreventionService.analyzeRequest(req);
      }
      
      const result = abusePreventionService.analyzeRequest(req);

      expect(result.isAbusive).toBe(true);
      expect(result.patterns).toContain('data_scraping');
    });

    it('should return blocked status for banned IP', () => {
      const req = createMockRequest();
      
      // Ban the IP first
      abusePreventionService.banIP('127.0.0.1', 'test ban');
      
      const result = abusePreventionService.analyzeRequest(req);

      expect(result.isAbusive).toBe(true);
      expect(result.patterns).toContain('ip_banned');
      expect(result.severity).toBe('critical');
      expect(result.action).toBe('block');
    });
  });

  describe('IP banning', () => {
    it('should ban IP address', () => {
      const ip = '192.168.1.1';
      const reason = 'test ban';
      
      abusePreventionService.banIP(ip, reason);
      
      expect(abusePreventionService.isIPBanned(ip)).toBe(true);
      
      const bannedIPs = abusePreventionService.getBannedIPs();
      expect(bannedIPs).toHaveLength(1);
      expect(bannedIPs[0].ip).toBe(ip);
      expect(bannedIPs[0].reason).toBe(reason);
    });

    it('should unban IP address', () => {
      const ip = '192.168.1.2';
      
      abusePreventionService.banIP(ip, 'test ban');
      expect(abusePreventionService.isIPBanned(ip)).toBe(true);
      
      const unbanned = abusePreventionService.unbanIP(ip);
      expect(unbanned).toBe(true);
      expect(abusePreventionService.isIPBanned(ip)).toBe(false);
    });

    it('should handle unbanning non-existent IP', () => {
      const unbanned = abusePreventionService.unbanIP('non.existent.ip');
      expect(unbanned).toBe(false);
    });

    it('should automatically expire bans', () => {
      const ip = '192.168.1.3';
      
      // Ban for 1ms (will expire immediately)
      abusePreventionService.banIP(ip, 'test ban', 1);
      
      // Wait a bit and check if ban expired
      setTimeout(() => {
        expect(abusePreventionService.isIPBanned(ip)).toBe(false);
      }, 10);
    });

    it('should ban IP with custom duration', () => {
      const ip = '192.168.1.4';
      const duration = 60000; // 1 minute
      
      abusePreventionService.banIP(ip, 'test ban', duration);
      
      const bannedIPs = abusePreventionService.getBannedIPs();
      const banInfo = bannedIPs.find(b => b.ip === ip);
      
      expect(banInfo).toBeDefined();
      expect(banInfo!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 50000);
    });
  });

  describe('suspicious IP tracking', () => {
    it('should track suspicious IPs', () => {
      const req = createMockRequest();
      
      // Generate some abusive patterns to increase suspicious score
      for (let i = 0; i < 10; i++) {
        abusePreventionService.analyzeRequest(req);
      }
      
      const suspiciousIPs = abusePreventionService.getSuspiciousIPs();
      expect(suspiciousIPs.length).toBeGreaterThan(0);
      
      const suspiciousIP = suspiciousIPs.find(s => s.ip === '127.0.0.1');
      expect(suspiciousIP).toBeDefined();
      expect(suspiciousIP!.score).toBeGreaterThan(0);
    });

    it('should auto-ban IP with high suspicious score', () => {
      const req = createMockRequest();
      
      // Manually set high suspicious score
      (abusePreventionService as any).suspiciousIPs.set('127.0.0.1', {
        score: 60, // Above the auto-ban threshold of 50
        lastActivity: new Date()
      });
      
      // Trigger analysis to check auto-ban
      (abusePreventionService as any).updateSuspiciousScore('127.0.0.1', 1);
      
      expect(abusePreventionService.isIPBanned('127.0.0.1')).toBe(true);
    });
  });

  describe('abuse pattern management', () => {
    it('should add custom abuse pattern', () => {
      const customPattern = {
        id: 'custom_pattern',
        name: 'Custom Pattern',
        description: 'Custom test pattern',
        detector: () => true,
        severity: 'medium' as const,
        action: 'warn' as const,
        threshold: 5,
        windowMs: 60000,
      };
      
      abusePreventionService.addAbusePattern(customPattern);
      
      const req = createMockRequest();
      const result = abusePreventionService.analyzeRequest(req);
      
      expect(result.isAbusive).toBe(true);
      expect(result.patterns).toContain('custom_pattern');
    });

    it('should remove abuse pattern', () => {
      const customPattern = {
        id: 'removable_pattern',
        name: 'Removable Pattern',
        description: 'Pattern to be removed',
        detector: () => true,
        severity: 'low' as const,
        action: 'log' as const,
        threshold: 1,
        windowMs: 60000,
      };
      
      abusePreventionService.addAbusePattern(customPattern);
      
      let req = createMockRequest();
      let result = abusePreventionService.analyzeRequest(req);
      expect(result.patterns).toContain('removable_pattern');
      
      const removed = abusePreventionService.removeAbusePattern('removable_pattern');
      expect(removed).toBe(true);
      
      req = createMockRequest({ ip: '192.168.1.100' }); // Different IP to avoid history
      result = abusePreventionService.analyzeRequest(req);
      expect(result.patterns).not.toContain('removable_pattern');
    });

    it('should handle removing non-existent pattern', () => {
      const removed = abusePreventionService.removeAbusePattern('non_existent');
      expect(removed).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should return abuse prevention statistics', () => {
      const req = createMockRequest();
      
      // Generate some activity
      abusePreventionService.analyzeRequest(req);
      abusePreventionService.banIP('192.168.1.10', 'test');
      
      const stats = abusePreventionService.getStatistics();
      
      expect(stats).toHaveProperty('totalRequestHistory');
      expect(stats).toHaveProperty('bannedIPCount');
      expect(stats).toHaveProperty('suspiciousIPCount');
      expect(stats).toHaveProperty('activePatterns');
      
      expect(typeof stats.totalRequestHistory).toBe('number');
      expect(typeof stats.bannedIPCount).toBe('number');
      expect(typeof stats.suspiciousIPCount).toBe('number');
      expect(typeof stats.activePatterns).toBe('number');
      
      expect(stats.bannedIPCount).toBeGreaterThan(0);
      expect(stats.activePatterns).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should clean up old data', (done) => {
      const req = createMockRequest();
      
      // Generate some requests
      for (let i = 0; i < 5; i++) {
        abusePreventionService.analyzeRequest(req);
      }
      
      // Manually trigger cleanup (normally happens automatically)
      (abusePreventionService as any).cleanup();
      
      // Verify cleanup doesn't break functionality
      const result = abusePreventionService.analyzeRequest(req);
      expect(result).toBeDefined();
      
      done();
    });
  });
});