import { Request } from 'express';
import { EventEmitter } from 'events';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent: string;
  action: string;
  resource: string;
  method: string;
  endpoint: string;
  statusCode?: number;
  success: boolean;
  details?: any;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  category: 'authentication' | 'authorization' | 'data_access' | 'data_modification' | 'system' | 'compliance';
}

export interface SecurityAlert {
  id: string;
  timestamp: Date;
  type: 'suspicious_activity' | 'rate_limit_exceeded' | 'authentication_failure' | 'unauthorized_access' | 'data_breach_attempt';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ipAddress: string;
  description: string;
  details: any;
  resolved: boolean;
}

export class AuditLoggerService extends EventEmitter {
  private auditLogs: AuditEvent[] = [];
  private securityAlerts: SecurityAlert[] = [];
  private suspiciousIPs: Map<string, { count: number; lastSeen: Date }> = new Map();
  private failedAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();

  constructor() {
    super();
    this.setupCleanupInterval();
  }

  /**
   * Log an audit event
   */
  logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): void {
    const auditEvent: AuditEvent = {
      id: this.generateId(),
      timestamp: new Date(),
      ...event,
    };

    this.auditLogs.push(auditEvent);
    this.emit('auditEvent', auditEvent);

    // Check for suspicious activity
    this.checkSuspiciousActivity(auditEvent);

    // Log to console for development (in production, this would go to a proper logging system)
    console.log('Audit Event:', {
      id: auditEvent.id,
      action: auditEvent.action,
      resource: auditEvent.resource,
      userId: auditEvent.userId || 'anonymous',
      success: auditEvent.success,
      riskLevel: auditEvent.riskLevel,
    });
  }

  /**
   * Create audit middleware for Express
   */
  createAuditMiddleware() {
    return (req: Request, res: any, next: any): void => {
      const startTime = Date.now();
      
      // Capture original res.json to log response
      const originalJson = res.json;
      res.json = function(body: any) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Log the audit event
        const auditEvent = {
          userId: (req as any).user?.id,
          sessionId: (req as any).sessionId,
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          action: this.getActionFromMethod(req.method),
          resource: this.getResourceFromPath(req.path),
          method: req.method,
          endpoint: req.path,
          statusCode: res.statusCode,
          success: res.statusCode < 400,
          details: {
            duration,
            query: req.query,
            params: req.params,
            bodySize: req.get('Content-Length') || 0,
          },
          riskLevel: this.assessRiskLevel(req, res.statusCode),
          category: this.categorizeRequest(req.path),
        };

        this.logEvent(auditEvent);
        return originalJson.call(this, body);
      }.bind(this);

      next();
    };
  }

  /**
   * Log authentication events
   */
  logAuthentication(req: Request, success: boolean, userId?: string, details?: any): void {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    
    this.logEvent({
      userId,
      ipAddress,
      userAgent: req.get('User-Agent') || 'unknown',
      action: success ? 'login_success' : 'login_failure',
      resource: 'authentication',
      method: req.method,
      endpoint: req.path,
      success,
      details,
      riskLevel: success ? 'low' : 'medium',
      category: 'authentication',
    });

    // Track failed attempts
    if (!success) {
      this.trackFailedAttempt(ipAddress);
    } else {
      this.clearFailedAttempts(ipAddress);
    }
  }

  /**
   * Log data access events
   */
  logDataAccess(req: Request, resource: string, success: boolean, details?: any): void {
    this.logEvent({
      userId: (req as any).user?.id,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      action: 'data_access',
      resource,
      method: req.method,
      endpoint: req.path,
      success,
      details,
      riskLevel: this.assessDataAccessRisk(resource, req.method),
      category: 'data_access',
    });
  }

  /**
   * Log data modification events
   */
  logDataModification(req: Request, resource: string, action: string, success: boolean, details?: any): void {
    this.logEvent({
      userId: (req as any).user?.id,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      action,
      resource,
      method: req.method,
      endpoint: req.path,
      success,
      details,
      riskLevel: 'high', // Data modifications are always high risk
      category: 'data_modification',
    });
  }

  /**
   * Create security alert
   */
  createSecurityAlert(alert: Omit<SecurityAlert, 'id' | 'timestamp' | 'resolved'>): void {
    const securityAlert: SecurityAlert = {
      id: this.generateId(),
      timestamp: new Date(),
      resolved: false,
      ...alert,
    };

    this.securityAlerts.push(securityAlert);
    this.emit('securityAlert', securityAlert);

    console.warn('Security Alert:', {
      type: securityAlert.type,
      severity: securityAlert.severity,
      description: securityAlert.description,
      ipAddress: securityAlert.ipAddress,
    });
  }

  /**
   * Get audit logs with filtering
   */
  getAuditLogs(filters?: {
    userId?: string;
    ipAddress?: string;
    action?: string;
    resource?: string;
    category?: string;
    riskLevel?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): AuditEvent[] {
    let logs = [...this.auditLogs];

    if (filters) {
      if (filters.userId) {
        logs = logs.filter(log => log.userId === filters.userId);
      }
      if (filters.ipAddress) {
        logs = logs.filter(log => log.ipAddress === filters.ipAddress);
      }
      if (filters.action) {
        logs = logs.filter(log => log.action === filters.action);
      }
      if (filters.resource) {
        logs = logs.filter(log => log.resource === filters.resource);
      }
      if (filters.category) {
        logs = logs.filter(log => log.category === filters.category);
      }
      if (filters.riskLevel) {
        logs = logs.filter(log => log.riskLevel === filters.riskLevel);
      }
      if (filters.startDate) {
        logs = logs.filter(log => log.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        logs = logs.filter(log => log.timestamp <= filters.endDate!);
      }
    }

    // Sort by timestamp (newest first)
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters?.limit) {
      logs = logs.slice(0, filters.limit);
    }

    return logs;
  }

  /**
   * Get security alerts
   */
  getSecurityAlerts(resolved?: boolean): SecurityAlert[] {
    let alerts = [...this.securityAlerts];
    
    if (resolved !== undefined) {
      alerts = alerts.filter(alert => alert.resolved === resolved);
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Resolve security alert
   */
  resolveSecurityAlert(alertId: string): boolean {
    const alert = this.securityAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  /**
   * Check for suspicious activity patterns
   */
  private checkSuspiciousActivity(event: AuditEvent): void {
    // Track suspicious IPs
    if (!event.success && event.riskLevel === 'high') {
      const ipData = this.suspiciousIPs.get(event.ipAddress) || { count: 0, lastSeen: new Date() };
      ipData.count++;
      ipData.lastSeen = new Date();
      this.suspiciousIPs.set(event.ipAddress, ipData);

      if (ipData.count >= 5) {
        this.createSecurityAlert({
          type: 'suspicious_activity',
          severity: 'high',
          ipAddress: event.ipAddress,
          userId: event.userId,
          description: `Suspicious activity detected from IP ${event.ipAddress}`,
          details: { failureCount: ipData.count, event },
        });
      }
    }

    // Check for unauthorized access attempts
    if (event.statusCode === 401 || event.statusCode === 403) {
      const attempts = this.failedAttempts.get(event.ipAddress) || { count: 0, lastAttempt: new Date() };
      if (attempts.count >= 10) {
        this.createSecurityAlert({
          type: 'unauthorized_access',
          severity: 'medium',
          ipAddress: event.ipAddress,
          userId: event.userId,
          description: `Multiple unauthorized access attempts from IP ${event.ipAddress}`,
          details: { attemptCount: attempts.count, event },
        });
      }
    }
  }

  /**
   * Track failed authentication attempts
   */
  private trackFailedAttempt(ipAddress: string): void {
    const attempts = this.failedAttempts.get(ipAddress) || { count: 0, lastAttempt: new Date() };
    attempts.count++;
    attempts.lastAttempt = new Date();
    this.failedAttempts.set(ipAddress, attempts);

    if (attempts.count >= 5) {
      this.createSecurityAlert({
        type: 'authentication_failure',
        severity: 'medium',
        ipAddress,
        description: `Multiple failed authentication attempts from IP ${ipAddress}`,
        details: { attemptCount: attempts.count },
      });
    }
  }

  /**
   * Clear failed attempts for IP
   */
  private clearFailedAttempts(ipAddress: string): void {
    this.failedAttempts.delete(ipAddress);
  }

  /**
   * Assess risk level based on request
   */
  private assessRiskLevel(req: Request, statusCode: number): 'low' | 'medium' | 'high' | 'critical' {
    if (statusCode >= 500) return 'critical';
    if (statusCode >= 400) return 'high';
    
    const sensitiveEndpoints = ['/auth', '/admin', '/users', '/predictions'];
    if (sensitiveEndpoints.some(endpoint => req.path.includes(endpoint))) {
      return req.method === 'GET' ? 'medium' : 'high';
    }
    
    return 'low';
  }

  /**
   * Assess data access risk
   */
  private assessDataAccessRisk(resource: string, method: string): 'low' | 'medium' | 'high' | 'critical' {
    const sensitiveResources = ['user', 'payment', 'personal'];
    if (sensitiveResources.some(res => resource.includes(res))) {
      return method === 'GET' ? 'medium' : 'high';
    }
    return 'low';
  }

  /**
   * Get action from HTTP method
   */
  private getActionFromMethod(method: string): string {
    const actionMap: { [key: string]: string } = {
      GET: 'read',
      POST: 'create',
      PUT: 'update',
      PATCH: 'update',
      DELETE: 'delete',
    };
    return actionMap[method] || method.toLowerCase();
  }

  /**
   * Get resource from request path
   */
  private getResourceFromPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[0] || 'unknown';
  }

  /**
   * Categorize request based on path
   */
  private categorizeRequest(path: string): AuditEvent['category'] {
    if (path.includes('/auth')) return 'authentication';
    if (path.includes('/admin')) return 'authorization';
    if (path.includes('/compliance')) return 'compliance';
    if (path.includes('/users') || path.includes('/profile')) return 'data_access';
    return 'system';
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Setup cleanup interval for old logs
   */
  private setupCleanupInterval(): void {
    // Clean up logs older than 30 days every 24 hours
    setInterval(() => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      this.auditLogs = this.auditLogs.filter(log => log.timestamp > thirtyDaysAgo);
      this.securityAlerts = this.securityAlerts.filter(alert => alert.timestamp > thirtyDaysAgo);
      
      // Clean up tracking maps
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      this.suspiciousIPs.forEach((data, ip) => {
        if (data.lastSeen < oneDayAgo) {
          this.suspiciousIPs.delete(ip);
        }
      });
      
      this.failedAttempts.forEach((data, ip) => {
        if (data.lastAttempt < oneDayAgo) {
          this.failedAttempts.delete(ip);
        }
      });
    }, 24 * 60 * 60 * 1000); // 24 hours
  }
}