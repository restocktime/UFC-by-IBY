import { Request, Response } from 'express';
import { AuditLoggerService } from './audit-logger.service';
import { RateLimiterService } from './rate-limiter.service';
import { EncryptionService } from './encryption.service';

export class SecurityController {
  constructor(
    private auditLogger: AuditLoggerService,
    private rateLimiter: RateLimiterService,
    private encryption: EncryptionService
  ) {}

  /**
   * Get audit logs
   */
  getAuditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        userId,
        ipAddress,
        action,
        resource,
        category,
        riskLevel,
        startDate,
        endDate,
        limit = 100,
      } = req.query;

      const filters: any = {};
      if (userId) filters.userId = userId as string;
      if (ipAddress) filters.ipAddress = ipAddress as string;
      if (action) filters.action = action as string;
      if (resource) filters.resource = resource as string;
      if (category) filters.category = category as string;
      if (riskLevel) filters.riskLevel = riskLevel as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (limit) filters.limit = parseInt(limit as string, 10);

      const logs = this.auditLogger.getAuditLogs(filters);

      res.json({
        success: true,
        data: logs,
        total: logs.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve audit logs',
      });
    }
  };

  /**
   * Get security alerts
   */
  getSecurityAlerts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { resolved } = req.query;
      const resolvedFilter = resolved === 'true' ? true : resolved === 'false' ? false : undefined;
      
      const alerts = this.auditLogger.getSecurityAlerts(resolvedFilter);

      res.json({
        success: true,
        data: alerts,
        total: alerts.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve security alerts',
      });
    }
  };

  /**
   * Resolve security alert
   */
  resolveSecurityAlert = async (req: Request, res: Response): Promise<void> => {
    try {
      const { alertId } = req.params;
      
      const resolved = this.auditLogger.resolveSecurityAlert(alertId);
      
      if (resolved) {
        // Log the resolution
        this.auditLogger.logEvent({
          userId: (req as any).user?.id,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          action: 'resolve_security_alert',
          resource: 'security',
          method: req.method,
          endpoint: req.path,
          success: true,
          details: { alertId },
          riskLevel: 'medium',
          category: 'system',
        });

        res.json({
          success: true,
          message: 'Security alert resolved successfully',
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Security alert not found',
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to resolve security alert',
      });
    }
  };

  /**
   * Get rate limit status for a user/IP
   */
  getRateLimitStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { key, type = 'general' } = req.query;
      
      if (!key) {
        res.status(400).json({
          success: false,
          error: 'Key parameter is required',
        });
        return;
      }

      // This would need to be implemented based on the rate limiter's internal structure
      // For now, return a placeholder response
      res.json({
        success: true,
        data: {
          key: key as string,
          type: type as string,
          remaining: 100, // Placeholder
          resetTime: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get rate limit status',
      });
    }
  };

  /**
   * Reset rate limit for a key
   */
  resetRateLimit = async (req: Request, res: Response): Promise<void> => {
    try {
      const { key } = req.body;
      
      if (!key) {
        res.status(400).json({
          success: false,
          error: 'Key is required',
        });
        return;
      }

      this.rateLimiter.resetRateLimit(key);

      // Log the rate limit reset
      this.auditLogger.logEvent({
        userId: (req as any).user?.id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        action: 'reset_rate_limit',
        resource: 'security',
        method: req.method,
        endpoint: req.path,
        success: true,
        details: { key: this.encryption.maskSensitiveData(key) },
        riskLevel: 'medium',
        category: 'system',
      });

      res.json({
        success: true,
        message: 'Rate limit reset successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to reset rate limit',
      });
    }
  };

  /**
   * Get security metrics
   */
  getSecurityMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const { timeframe = '24h' } = req.query;
      
      let startDate: Date;
      const now = new Date();
      
      switch (timeframe) {
        case '1h':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      const logs = this.auditLogger.getAuditLogs({ startDate });
      const alerts = this.auditLogger.getSecurityAlerts(false); // Unresolved alerts

      // Calculate metrics
      const totalRequests = logs.length;
      const failedRequests = logs.filter(log => !log.success).length;
      const highRiskEvents = logs.filter(log => log.riskLevel === 'high' || log.riskLevel === 'critical').length;
      const authenticationEvents = logs.filter(log => log.category === 'authentication').length;
      const failedAuthentications = logs.filter(log => 
        log.category === 'authentication' && !log.success
      ).length;

      // Group by risk level
      const riskLevelCounts = logs.reduce((acc, log) => {
        acc[log.riskLevel] = (acc[log.riskLevel] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Group by category
      const categoryCounts = logs.reduce((acc, log) => {
        acc[log.category] = (acc[log.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      res.json({
        success: true,
        data: {
          timeframe,
          period: {
            start: startDate.toISOString(),
            end: now.toISOString(),
          },
          metrics: {
            totalRequests,
            failedRequests,
            successRate: totalRequests > 0 ? ((totalRequests - failedRequests) / totalRequests * 100).toFixed(2) : '100.00',
            highRiskEvents,
            authenticationEvents,
            failedAuthentications,
            authenticationSuccessRate: authenticationEvents > 0 ? 
              ((authenticationEvents - failedAuthentications) / authenticationEvents * 100).toFixed(2) : '100.00',
            activeAlerts: alerts.length,
          },
          breakdown: {
            riskLevels: riskLevelCounts,
            categories: categoryCounts,
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get security metrics',
      });
    }
  };

  /**
   * Export audit logs (for compliance)
   */
  exportAuditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        startDate,
        endDate,
        format = 'json',
      } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const logs = this.auditLogger.getAuditLogs(filters);

      // Log the export action
      this.auditLogger.logEvent({
        userId: (req as any).user?.id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        action: 'export_audit_logs',
        resource: 'security',
        method: req.method,
        endpoint: req.path,
        success: true,
        details: { 
          recordCount: logs.length,
          format,
          dateRange: { startDate, endDate },
        },
        riskLevel: 'high',
        category: 'data_access',
      });

      if (format === 'csv') {
        // Convert to CSV format
        const csvHeaders = 'ID,Timestamp,User ID,IP Address,Action,Resource,Method,Endpoint,Success,Risk Level,Category\n';
        const csvRows = logs.map(log => 
          `${log.id},${log.timestamp.toISOString()},${log.userId || ''},${log.ipAddress},${log.action},${log.resource},${log.method},${log.endpoint},${log.success},${log.riskLevel},${log.category}`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
        res.send(csvHeaders + csvRows);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.json"`);
        res.json({
          exportDate: new Date().toISOString(),
          recordCount: logs.length,
          filters,
          data: logs,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to export audit logs',
      });
    }
  };
}