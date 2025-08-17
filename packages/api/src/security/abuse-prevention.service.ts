import { Request } from 'express';
import { AuditLoggerService } from './audit-logger.service';

export interface AbusePattern {
  id: string;
  name: string;
  description: string;
  detector: (req: Request, history: RequestHistory[]) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'log' | 'warn' | 'block' | 'ban';
  threshold: number;
  windowMs: number;
}

export interface RequestHistory {
  timestamp: Date;
  ip: string;
  userAgent: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  userId?: string;
  blocked: boolean;
}

export interface AbuseDetectionResult {
  isAbusive: boolean;
  patterns: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'log' | 'warn' | 'block' | 'ban';
  details: any;
}

export interface IPBanInfo {
  ip: string;
  bannedAt: Date;
  expiresAt: Date;
  reason: string;
  patterns: string[];
}

export class AbusePreventionService {
  private requestHistory: Map<string, RequestHistory[]> = new Map();
  private bannedIPs: Map<string, IPBanInfo> = new Map();
  private suspiciousIPs: Map<string, { score: number; lastActivity: Date }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  private abusePatterns: AbusePattern[] = [
    {
      id: 'rapid_requests',
      name: 'Rapid Request Pattern',
      description: 'Too many requests in a short time period',
      detector: (req, history) => {
        const recentRequests = history.filter(h => 
          Date.now() - h.timestamp.getTime() < 60000 // Last minute
        );
        return recentRequests.length > 100;
      },
      severity: 'high',
      action: 'block',
      threshold: 100,
      windowMs: 60000,
    },
    {
      id: 'endpoint_scanning',
      name: 'Endpoint Scanning',
      description: 'Systematic scanning of different endpoints',
      detector: (req, history) => {
        const recentRequests = history.filter(h => 
          Date.now() - h.timestamp.getTime() < 300000 // Last 5 minutes
        );
        const uniqueEndpoints = new Set(recentRequests.map(h => h.endpoint));
        return uniqueEndpoints.size > 20;
      },
      severity: 'medium',
      action: 'warn',
      threshold: 20,
      windowMs: 300000,
    },
    {
      id: 'failed_auth_attempts',
      name: 'Failed Authentication Attempts',
      description: 'Multiple failed authentication attempts',
      detector: (req, history) => {
        const authRequests = history.filter(h => 
          h.endpoint.includes('/auth') && 
          h.statusCode && h.statusCode >= 400 &&
          Date.now() - h.timestamp.getTime() < 900000 // Last 15 minutes
        );
        return authRequests.length > 10;
      },
      severity: 'high',
      action: 'block',
      threshold: 10,
      windowMs: 900000,
    },
    {
      id: 'user_agent_rotation',
      name: 'User Agent Rotation',
      description: 'Frequent changes in user agent string',
      detector: (req, history) => {
        const recentRequests = history.filter(h => 
          Date.now() - h.timestamp.getTime() < 600000 // Last 10 minutes
        );
        const uniqueUserAgents = new Set(recentRequests.map(h => h.userAgent));
        return uniqueUserAgents.size > 5 && recentRequests.length > 20;
      },
      severity: 'medium',
      action: 'warn',
      threshold: 5,
      windowMs: 600000,
    },
    {
      id: 'error_farming',
      name: 'Error Farming',
      description: 'Deliberately triggering errors to gather information',
      detector: (req, history) => {
        const errorRequests = history.filter(h => 
          h.statusCode && h.statusCode >= 400 &&
          Date.now() - h.timestamp.getTime() < 300000 // Last 5 minutes
        );
        return errorRequests.length > 50;
      },
      severity: 'high',
      action: 'block',
      threshold: 50,
      windowMs: 300000,
    },
    {
      id: 'data_scraping',
      name: 'Data Scraping Pattern',
      description: 'Systematic data extraction behavior',
      detector: (req, history) => {
        const dataRequests = history.filter(h => 
          h.method === 'GET' &&
          (h.endpoint.includes('/fighters') || h.endpoint.includes('/predictions') || h.endpoint.includes('/odds')) &&
          Date.now() - h.timestamp.getTime() < 1800000 // Last 30 minutes
        );
        return dataRequests.length > 200;
      },
      severity: 'medium',
      action: 'warn',
      threshold: 200,
      windowMs: 1800000,
    },
    {
      id: 'distributed_attack',
      name: 'Distributed Attack Pattern',
      description: 'Coordinated attack from multiple sources',
      detector: (req, history) => {
        // This would need cross-IP analysis, simplified for now
        const recentRequests = history.filter(h => 
          Date.now() - h.timestamp.getTime() < 300000 // Last 5 minutes
        );
        return recentRequests.length > 500;
      },
      severity: 'critical',
      action: 'ban',
      threshold: 500,
      windowMs: 300000,
    },
  ];

  constructor(private auditLogger: AuditLoggerService) {
    // Clean up old data every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000);
  }

  /**
   * Analyze request for abuse patterns
   */
  analyzeRequest(req: Request): AbuseDetectionResult {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check if IP is banned
    if (this.isIPBanned(ip)) {
      return {
        isAbusive: true,
        patterns: ['ip_banned'],
        severity: 'critical',
        action: 'block',
        details: { reason: 'IP is currently banned' },
      };
    }

    // Record request in history
    this.recordRequest(req);

    // Get request history for this IP
    const history = this.getRequestHistory(ip);

    // Check against abuse patterns
    const detectedPatterns: string[] = [];
    let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let recommendedAction: 'log' | 'warn' | 'block' | 'ban' = 'log';

    for (const pattern of this.abusePatterns) {
      if (pattern.detector(req, history)) {
        detectedPatterns.push(pattern.id);
        
        // Update max severity and recommended action
        if (this.getSeverityLevel(pattern.severity) > this.getSeverityLevel(maxSeverity)) {
          maxSeverity = pattern.severity;
          recommendedAction = pattern.action;
        }
      }
    }

    // Update suspicious IP score
    if (detectedPatterns.length > 0) {
      this.updateSuspiciousScore(ip, detectedPatterns.length);
    }

    const isAbusive = detectedPatterns.length > 0;

    // Log abuse detection
    if (isAbusive) {
      this.auditLogger.logEvent({
        ipAddress: ip,
        userAgent: req.get('User-Agent') || 'unknown',
        action: 'abuse_pattern_detected',
        resource: 'security',
        method: req.method,
        endpoint: req.path,
        success: false,
        details: {
          patterns: detectedPatterns,
          severity: maxSeverity,
          action: recommendedAction,
          requestCount: history.length,
        },
        riskLevel: maxSeverity,
        category: 'system',
      });

      // Create security alert for high severity patterns
      if (maxSeverity === 'high' || maxSeverity === 'critical') {
        this.auditLogger.createSecurityAlert({
          type: 'suspicious_activity',
          severity: maxSeverity,
          ipAddress: ip,
          description: `Abuse patterns detected: ${detectedPatterns.join(', ')}`,
          details: {
            patterns: detectedPatterns,
            requestCount: history.length,
            userAgent: req.get('User-Agent'),
          },
        });
      }
    }

    return {
      isAbusive,
      patterns: detectedPatterns,
      severity: maxSeverity,
      action: recommendedAction,
      details: {
        requestCount: history.length,
        suspiciousScore: this.suspiciousIPs.get(ip)?.score || 0,
      },
    };
  }

  /**
   * Ban IP address
   */
  banIP(ip: string, reason: string, durationMs: number = 24 * 60 * 60 * 1000): void {
    const banInfo: IPBanInfo = {
      ip,
      bannedAt: new Date(),
      expiresAt: new Date(Date.now() + durationMs),
      reason,
      patterns: [],
    };

    this.bannedIPs.set(ip, banInfo);

    this.auditLogger.logEvent({
      ipAddress: ip,
      userAgent: 'system',
      action: 'ip_banned',
      resource: 'security',
      method: 'POST',
      endpoint: '/security/ban',
      success: true,
      details: {
        reason,
        duration: durationMs,
        expiresAt: banInfo.expiresAt,
      },
      riskLevel: 'critical',
      category: 'system',
    });

    console.log(`IP banned: ${ip} - Reason: ${reason} - Duration: ${durationMs}ms`);
  }

  /**
   * Unban IP address
   */
  unbanIP(ip: string): boolean {
    const banned = this.bannedIPs.delete(ip);
    
    if (banned) {
      this.auditLogger.logEvent({
        ipAddress: ip,
        userAgent: 'system',
        action: 'ip_unbanned',
        resource: 'security',
        method: 'DELETE',
        endpoint: '/security/ban',
        success: true,
        details: { ip },
        riskLevel: 'medium',
        category: 'system',
      });

      console.log(`IP unbanned: ${ip}`);
    }

    return banned;
  }

  /**
   * Check if IP is banned
   */
  isIPBanned(ip: string): boolean {
    const banInfo = this.bannedIPs.get(ip);
    if (!banInfo) {
      return false;
    }

    // Check if ban has expired
    if (banInfo.expiresAt < new Date()) {
      this.bannedIPs.delete(ip);
      return false;
    }

    return true;
  }

  /**
   * Get banned IPs
   */
  getBannedIPs(): IPBanInfo[] {
    return Array.from(this.bannedIPs.values());
  }

  /**
   * Get suspicious IPs
   */
  getSuspiciousIPs(): Array<{ ip: string; score: number; lastActivity: Date }> {
    return Array.from(this.suspiciousIPs.entries()).map(([ip, data]) => ({
      ip,
      ...data,
    }));
  }

  /**
   * Record request in history
   */
  private recordRequest(req: Request): void {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const history = this.requestHistory.get(ip) || [];

    const requestRecord: RequestHistory = {
      timestamp: new Date(),
      ip,
      userAgent: req.get('User-Agent') || 'unknown',
      endpoint: req.path,
      method: req.method,
      userId: (req as any).user?.id,
      blocked: false,
    };

    history.push(requestRecord);

    // Keep only recent history (last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentHistory = history.filter(h => h.timestamp > twoHoursAgo);

    this.requestHistory.set(ip, recentHistory);
  }

  /**
   * Get request history for IP
   */
  private getRequestHistory(ip: string): RequestHistory[] {
    return this.requestHistory.get(ip) || [];
  }

  /**
   * Update suspicious score for IP
   */
  private updateSuspiciousScore(ip: string, increment: number): void {
    const current = this.suspiciousIPs.get(ip) || { score: 0, lastActivity: new Date() };
    current.score += increment;
    current.lastActivity = new Date();
    
    this.suspiciousIPs.set(ip, current);

    // Auto-ban if score gets too high
    if (current.score >= 50) {
      this.banIP(ip, 'Automatic ban due to high suspicious activity score', 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Get severity level as number for comparison
   */
  private getSeverityLevel(severity: 'low' | 'medium' | 'high' | 'critical'): number {
    const levels = { low: 1, medium: 2, high: 3, critical: 4 };
    return levels[severity];
  }

  /**
   * Clean up old data
   */
  private cleanup(): void {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Clean up request history
    let cleanedRequests = 0;
    this.requestHistory.forEach((history, ip) => {
      const recentHistory = history.filter(h => h.timestamp > twoHoursAgo);
      if (recentHistory.length === 0) {
        this.requestHistory.delete(ip);
      } else {
        this.requestHistory.set(ip, recentHistory);
      }
      cleanedRequests += history.length - recentHistory.length;
    });

    // Clean up expired bans
    let expiredBans = 0;
    this.bannedIPs.forEach((banInfo, ip) => {
      if (banInfo.expiresAt < now) {
        this.bannedIPs.delete(ip);
        expiredBans++;
      }
    });

    // Clean up old suspicious IPs
    let cleanedSuspicious = 0;
    this.suspiciousIPs.forEach((data, ip) => {
      if (data.lastActivity < oneDayAgo) {
        this.suspiciousIPs.delete(ip);
        cleanedSuspicious++;
      }
    });

    if (cleanedRequests > 0 || expiredBans > 0 || cleanedSuspicious > 0) {
      console.log(`Abuse prevention cleanup: ${cleanedRequests} requests, ${expiredBans} expired bans, ${cleanedSuspicious} suspicious IPs`);
    }
  }

  /**
   * Get abuse prevention statistics
   */
  getStatistics(): {
    totalRequestHistory: number;
    bannedIPCount: number;
    suspiciousIPCount: number;
    activePatterns: number;
  } {
    let totalRequests = 0;
    this.requestHistory.forEach(history => {
      totalRequests += history.length;
    });

    return {
      totalRequestHistory: totalRequests,
      bannedIPCount: this.bannedIPs.size,
      suspiciousIPCount: this.suspiciousIPs.size,
      activePatterns: this.abusePatterns.length,
    };
  }

  /**
   * Add custom abuse pattern
   */
  addAbusePattern(pattern: AbusePattern): void {
    this.abusePatterns.push(pattern);
    
    this.auditLogger.logEvent({
      action: 'abuse_pattern_added',
      resource: 'security',
      method: 'POST',
      endpoint: '/security/patterns',
      success: true,
      details: {
        patternId: pattern.id,
        patternName: pattern.name,
        severity: pattern.severity,
      },
      riskLevel: 'medium',
      category: 'system',
      ipAddress: 'system',
      userAgent: 'abuse-prevention-service',
    });
  }

  /**
   * Remove abuse pattern
   */
  removeAbusePattern(patternId: string): boolean {
    const index = this.abusePatterns.findIndex(p => p.id === patternId);
    if (index !== -1) {
      this.abusePatterns.splice(index, 1);
      
      this.auditLogger.logEvent({
        action: 'abuse_pattern_removed',
        resource: 'security',
        method: 'DELETE',
        endpoint: '/security/patterns',
        success: true,
        details: { patternId },
        riskLevel: 'medium',
        category: 'system',
        ipAddress: 'system',
        userAgent: 'abuse-prevention-service',
      });

      return true;
    }
    return false;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.requestHistory.clear();
    this.bannedIPs.clear();
    this.suspiciousIPs.clear();
  }
}