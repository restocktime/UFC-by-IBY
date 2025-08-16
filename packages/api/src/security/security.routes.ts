import { Router } from 'express';
import { SecurityController } from './security.controller';
import { AuditLoggerService } from './audit-logger.service';
import { RateLimiterService } from './rate-limiter.service';
import { EncryptionService } from './encryption.service';

const router = Router();

// Initialize services
const auditLogger = new AuditLoggerService();
const rateLimiter = new RateLimiterService();
const encryption = new EncryptionService();
const securityController = new SecurityController(auditLogger, rateLimiter, encryption);

// Audit logs endpoints
router.get('/audit-logs', securityController.getAuditLogs);
router.get('/audit-logs/export', securityController.exportAuditLogs);

// Security alerts endpoints
router.get('/alerts', securityController.getSecurityAlerts);
router.patch('/alerts/:alertId/resolve', securityController.resolveSecurityAlert);

// Rate limiting endpoints
router.get('/rate-limit/status', securityController.getRateLimitStatus);
router.post('/rate-limit/reset', securityController.resetRateLimit);

// Security metrics
router.get('/metrics', securityController.getSecurityMetrics);

export { 
  router as securityRoutes, 
  auditLogger, 
  rateLimiter, 
  encryption 
};