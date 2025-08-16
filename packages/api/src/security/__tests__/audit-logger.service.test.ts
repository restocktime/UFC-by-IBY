import { Request, Response } from 'express';
import { vi } from 'vitest';
import { AuditLoggerService, AuditEvent, SecurityAlert } from '../audit-logger.service';

describe('AuditLoggerService', () => {
  let auditLogger: AuditLoggerService;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let consoleSpy: any;

  beforeEach(() => {
    auditLogger = new AuditLoggerService();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    mockRequest = {
      ip: '192.168.1.1',
      connection: { remoteAddress: '192.168.1.1' } as any,
      method: 'GET',
      path: '/test',
      query: {},
      params: {},
      get: vi.fn().mockReturnValue('Mozilla/5.0'),
    };
    
    mockResponse = {
      statusCode: 200,
      json: vi.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Event Logging', () => {
    it('should log audit event successfully', () => {
      const eventData = {
        userId: 'user123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: 'login',
        resource: 'authentication',
        method: 'POST',
        endpoint: '/auth/login',
        success: true,
        riskLevel: 'low' as const,
        category: 'authentication' as const,
      };

      auditLogger.logEvent(eventData);

      const logs = auditLogger.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject(eventData);
      expect(logs[0].id).toBeDefined();
      expect(logs[0].timestamp).toBeInstanceOf(Date);
    });

    it('should emit audit event', (done) => {
      const eventData = {
        userId: 'user123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: 'login',
        resource: 'authentication',
        method: 'POST',
        endpoint: '/auth/login',
        success: true,
        riskLevel: 'low' as const,
        category: 'authentication' as const,
      };

      auditLogger.on('auditEvent', (event: AuditEvent) => {
        expect(event).toMatchObject(eventData);
        done();
      });

      auditLogger.logEvent(eventData);
    });

    it('should log event to console', () => {
      const eventData = {
        userId: 'user123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: 'login',
        resource: 'authentication',
        method: 'POST',
        endpoint: '/auth/login',
        success: true,
        riskLevel: 'low' as const,
        category: 'authentication' as const,
      };

      auditLogger.logEvent(eventData);

      expect(consoleSpy).toHaveBeenCalledWith('Audit Event:', expect.objectContaining({
        action: 'login',
        resource: 'authentication',
        userId: 'user123',
        success: true,
        riskLevel: 'low',
      }));
    });
  });

  describe('Authentication Logging', () => {
    it('should log successful authentication', () => {
      auditLogger.logAuthentication(mockRequest as Request, true, 'user123', { method: 'password' });

      const logs = auditLogger.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('login_success');
      expect(logs[0].success).toBe(true);
      expect(logs[0].userId).toBe('user123');
      expect(logs[0].riskLevel).toBe('low');
    });

    it('should log failed authentication', () => {
      auditLogger.logAuthentication(mockRequest as Request, false, undefined, { error: 'invalid_credentials' });

      const logs = auditLogger.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('login_failure');
      expect(logs[0].success).toBe(false);
      expect(logs[0].userId).toBeUndefined();
      expect(logs[0].riskLevel).toBe('medium');
    });

    it('should track failed attempts and create security alert', () => {
      const ip = '192.168.1.1';
      
      // Make 5 failed attempts to trigger alert
      for (let i = 0; i < 5; i++) {
        auditLogger.logAuthentication(mockRequest as Request, false);
      }

      const alerts = auditLogger.getSecurityAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      
      const authAlert = alerts.find(alert => alert.type === 'authentication_failure');
      expect(authAlert).toBeDefined();
      expect(authAlert?.ipAddress).toBe(ip);
    });

    it('should clear failed attempts on successful login', () => {
      // Make failed attempts
      for (let i = 0; i < 3; i++) {
        auditLogger.logAuthentication(mockRequest as Request, false);
      }

      // Successful login should clear attempts
      auditLogger.logAuthentication(mockRequest as Request, true, 'user123');

      // Make another failed attempt - should not trigger alert immediately
      auditLogger.logAuthentication(mockRequest as Request, false);

      const alerts = auditLogger.getSecurityAlerts();
      const authAlerts = alerts.filter(alert => alert.type === 'authentication_failure');
      expect(authAlerts).toHaveLength(0);
    });
  });

  describe('Data Access Logging', () => {
    it('should log data access event', () => {
      auditLogger.logDataAccess(mockRequest as Request, 'user_profile', true, { userId: 'user123' });

      const logs = auditLogger.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('data_access');
      expect(logs[0].resource).toBe('user_profile');
      expect(logs[0].category).toBe('data_access');
    });

    it('should assess risk level for sensitive resources', () => {
      auditLogger.logDataAccess(mockRequest as Request, 'user_personal_info', true);

      const logs = auditLogger.getAuditLogs();
      expect(logs[0].riskLevel).toBe('medium');
    });
  });

  describe('Data Modification Logging', () => {
    it('should log data modification event', () => {
      auditLogger.logDataModification(
        mockRequest as Request,
        'user_profile',
        'update_profile',
        true,
        { fields: ['email', 'name'] }
      );

      const logs = auditLogger.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('update_profile');
      expect(logs[0].resource).toBe('user_profile');
      expect(logs[0].category).toBe('data_modification');
      expect(logs[0].riskLevel).toBe('high');
    });
  });

  describe('Security Alerts', () => {
    it('should create security alert', () => {
      const alertData = {
        type: 'suspicious_activity' as const,
        severity: 'high' as const,
        ipAddress: '192.168.1.1',
        description: 'Suspicious activity detected',
        details: { reason: 'multiple_failures' },
      };

      auditLogger.createSecurityAlert(alertData);

      const alerts = auditLogger.getSecurityAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject(alertData);
      expect(alerts[0].id).toBeDefined();
      expect(alerts[0].timestamp).toBeInstanceOf(Date);
      expect(alerts[0].resolved).toBe(false);
    });

    it('should emit security alert', (done) => {
      const alertData = {
        type: 'suspicious_activity' as const,
        severity: 'high' as const,
        ipAddress: '192.168.1.1',
        description: 'Suspicious activity detected',
        details: { reason: 'multiple_failures' },
      };

      auditLogger.on('securityAlert', (alert: SecurityAlert) => {
        expect(alert).toMatchObject(alertData);
        done();
      });

      auditLogger.createSecurityAlert(alertData);
    });

    it('should resolve security alert', () => {
      const alertData = {
        type: 'suspicious_activity' as const,
        severity: 'high' as const,
        ipAddress: '192.168.1.1',
        description: 'Suspicious activity detected',
        details: { reason: 'multiple_failures' },
      };

      auditLogger.createSecurityAlert(alertData);
      const alerts = auditLogger.getSecurityAlerts();
      const alertId = alerts[0].id;

      const resolved = auditLogger.resolveSecurityAlert(alertId);
      expect(resolved).toBe(true);

      const updatedAlerts = auditLogger.getSecurityAlerts();
      expect(updatedAlerts[0].resolved).toBe(true);
    });

    it('should return false for non-existent alert resolution', () => {
      const resolved = auditLogger.resolveSecurityAlert('non-existent-id');
      expect(resolved).toBe(false);
    });

    it('should filter alerts by resolved status', () => {
      // Create two alerts
      auditLogger.createSecurityAlert({
        type: 'suspicious_activity',
        severity: 'high',
        ipAddress: '192.168.1.1',
        description: 'Alert 1',
        details: {},
      });

      auditLogger.createSecurityAlert({
        type: 'rate_limit_exceeded',
        severity: 'medium',
        ipAddress: '192.168.1.2',
        description: 'Alert 2',
        details: {},
      });

      // Resolve one alert
      const alerts = auditLogger.getSecurityAlerts();
      auditLogger.resolveSecurityAlert(alerts[0].id);

      // Check filtering
      const unresolvedAlerts = auditLogger.getSecurityAlerts(false);
      const resolvedAlerts = auditLogger.getSecurityAlerts(true);

      expect(unresolvedAlerts).toHaveLength(1);
      expect(resolvedAlerts).toHaveLength(1);
      expect(unresolvedAlerts[0].resolved).toBe(false);
      expect(resolvedAlerts[0].resolved).toBe(true);
    });
  });

  describe('Audit Middleware', () => {
    it('should create audit middleware that logs requests', () => {
      const middleware = auditLogger.createAuditMiddleware();
      const mockNext = vi.fn();

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response
      (mockResponse.json as any)({ success: true });

      expect(mockNext).toHaveBeenCalled();
      
      const logs = auditLogger.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].method).toBe('GET');
      expect(logs[0].endpoint).toBe('/test');
    });

    it('should assess risk level based on status code', () => {
      const middleware = auditLogger.createAuditMiddleware();
      const mockNext = vi.fn();
      mockResponse.statusCode = 500;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      (mockResponse.json as any)({ error: 'Internal server error' });

      const logs = auditLogger.getAuditLogs();
      expect(logs[0].riskLevel).toBe('critical');
    });
  });

  describe('Log Filtering', () => {
    beforeEach(() => {
      // Create test logs
      auditLogger.logEvent({
        userId: 'user1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: 'login',
        resource: 'auth',
        method: 'POST',
        endpoint: '/auth/login',
        success: true,
        riskLevel: 'low',
        category: 'authentication',
      });

      auditLogger.logEvent({
        userId: 'user2',
        ipAddress: '192.168.1.2',
        userAgent: 'Chrome/90.0',
        action: 'read',
        resource: 'predictions',
        method: 'GET',
        endpoint: '/predictions',
        success: true,
        riskLevel: 'medium',
        category: 'data_access',
      });
    });

    it('should filter logs by userId', () => {
      const logs = auditLogger.getAuditLogs({ userId: 'user1' });
      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe('user1');
    });

    it('should filter logs by ipAddress', () => {
      const logs = auditLogger.getAuditLogs({ ipAddress: '192.168.1.2' });
      expect(logs).toHaveLength(1);
      expect(logs[0].ipAddress).toBe('192.168.1.2');
    });

    it('should filter logs by action', () => {
      const logs = auditLogger.getAuditLogs({ action: 'login' });
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('login');
    });

    it('should filter logs by resource', () => {
      const logs = auditLogger.getAuditLogs({ resource: 'predictions' });
      expect(logs).toHaveLength(1);
      expect(logs[0].resource).toBe('predictions');
    });

    it('should filter logs by category', () => {
      const logs = auditLogger.getAuditLogs({ category: 'authentication' });
      expect(logs).toHaveLength(1);
      expect(logs[0].category).toBe('authentication');
    });

    it('should filter logs by riskLevel', () => {
      const logs = auditLogger.getAuditLogs({ riskLevel: 'medium' });
      expect(logs).toHaveLength(1);
      expect(logs[0].riskLevel).toBe('medium');
    });

    it('should limit number of logs returned', () => {
      const logs = auditLogger.getAuditLogs({ limit: 1 });
      expect(logs).toHaveLength(1);
    });

    it('should filter logs by date range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      const logs = auditLogger.getAuditLogs({ 
        startDate: oneHourAgo,
        endDate: now,
      });
      
      expect(logs).toHaveLength(2); // Both logs should be within the range
    });
  });

  describe('Suspicious Activity Detection', () => {
    it('should detect suspicious activity from high-risk failures', () => {
      const eventData = {
        userId: 'user123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: 'unauthorized_access',
        resource: 'admin',
        method: 'POST',
        endpoint: '/admin/users',
        statusCode: 403,
        success: false,
        riskLevel: 'high' as const,
        category: 'authorization' as const,
      };

      // Generate 5 high-risk failures to trigger alert
      for (let i = 0; i < 5; i++) {
        auditLogger.logEvent(eventData);
      }

      const alerts = auditLogger.getSecurityAlerts();
      const suspiciousAlert = alerts.find(alert => alert.type === 'suspicious_activity');
      expect(suspiciousAlert).toBeDefined();
      expect(suspiciousAlert?.ipAddress).toBe('192.168.1.1');
    });

    it('should detect unauthorized access attempts', () => {
      const eventData = {
        userId: 'user123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: 'access_denied',
        resource: 'protected',
        method: 'GET',
        endpoint: '/protected',
        statusCode: 401,
        success: false,
        riskLevel: 'medium' as const,
        category: 'authorization' as const,
      };

      // Generate 10 unauthorized access attempts to trigger alert
      for (let i = 0; i < 10; i++) {
        auditLogger.logEvent(eventData);
      }

      const alerts = auditLogger.getSecurityAlerts();
      const unauthorizedAlert = alerts.find(alert => alert.type === 'unauthorized_access');
      expect(unauthorizedAlert).toBeDefined();
    });
  });
});