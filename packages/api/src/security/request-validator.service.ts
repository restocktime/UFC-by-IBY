import { Request, Response, NextFunction } from 'express';
import { AuditLoggerService } from './audit-logger.service';
import { EncryptionService } from './encryption.service';
import * as crypto from 'crypto';

export interface RequestValidationConfig {
  enableSignatureValidation: boolean;
  enableTimestampValidation: boolean;
  enableNonceValidation: boolean;
  timestampToleranceMs: number;
  requiredHeaders: string[];
  allowedMethods: string[];
  maxBodySize: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export class RequestValidatorService {
  private nonceCache: Set<string> = new Set();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private auditLogger: AuditLoggerService,
    private encryption: EncryptionService
  ) {
    // Clean up old nonces every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupNonces();
    }, 5 * 60 * 1000);
  }

  /**
   * Create request validation middleware
   */
  createValidationMiddleware(config: RequestValidationConfig) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const validation = this.validateRequest(req, config);
      
      if (!validation.isValid) {
        this.auditLogger.logEvent({
          userId: (req as any).user?.id,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          action: 'request_validation_failed',
          resource: 'security',
          method: req.method,
          endpoint: req.path,
          success: false,
          details: {
            errors: validation.errors,
            headers: this.sanitizeHeaders(req.headers),
          },
          riskLevel: validation.riskLevel,
          category: 'system',
        });

        res.status(400).json({
          success: false,
          error: 'Request validation failed',
          details: validation.errors,
        });
        return;
      }

      // Log successful validation for high-risk requests
      if (validation.riskLevel === 'high' || validation.riskLevel === 'critical') {
        this.auditLogger.logEvent({
          userId: (req as any).user?.id,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          action: 'request_validation_success',
          resource: 'security',
          method: req.method,
          endpoint: req.path,
          success: true,
          details: {
            riskLevel: validation.riskLevel,
          },
          riskLevel: validation.riskLevel,
          category: 'system',
        });
      }

      next();
    };
  }

  /**
   * Validate incoming request
   */
  validateRequest(req: Request, config: RequestValidationConfig): ValidationResult {
    const errors: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Validate HTTP method
    if (config.allowedMethods.length > 0 && !config.allowedMethods.includes(req.method)) {
      errors.push(`HTTP method ${req.method} not allowed`);
      riskLevel = 'medium';
    }

    // Validate required headers
    for (const header of config.requiredHeaders) {
      if (!req.headers[header.toLowerCase()]) {
        errors.push(`Required header missing: ${header}`);
        riskLevel = 'medium';
      }
    }

    // Validate content length
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > config.maxBodySize) {
      errors.push(`Request body too large: ${contentLength} bytes (max: ${config.maxBodySize})`);
      riskLevel = 'high';
    }

    // Validate timestamp if enabled
    if (config.enableTimestampValidation) {
      const timestampValidation = this.validateTimestamp(req, config.timestampToleranceMs);
      if (!timestampValidation.isValid) {
        errors.push(...timestampValidation.errors);
        riskLevel = Math.max(riskLevel === 'low' ? 0 : riskLevel === 'medium' ? 1 : riskLevel === 'high' ? 2 : 3, 
                           timestampValidation.riskLevel === 'low' ? 0 : timestampValidation.riskLevel === 'medium' ? 1 : timestampValidation.riskLevel === 'high' ? 2 : 3) === 0 ? 'low' : 
                           Math.max(riskLevel === 'low' ? 0 : riskLevel === 'medium' ? 1 : riskLevel === 'high' ? 2 : 3, 
                           timestampValidation.riskLevel === 'low' ? 0 : timestampValidation.riskLevel === 'medium' ? 1 : timestampValidation.riskLevel === 'high' ? 2 : 3) === 1 ? 'medium' :
                           Math.max(riskLevel === 'low' ? 0 : riskLevel === 'medium' ? 1 : riskLevel === 'high' ? 2 : 3, 
                           timestampValidation.riskLevel === 'low' ? 0 : timestampValidation.riskLevel === 'medium' ? 1 : timestampValidation.riskLevel === 'high' ? 2 : 3) === 2 ? 'high' : 'critical';
      }
    }

    // Validate nonce if enabled
    if (config.enableNonceValidation) {
      const nonceValidation = this.validateNonce(req);
      if (!nonceValidation.isValid) {
        errors.push(...nonceValidation.errors);
        riskLevel = Math.max(riskLevel === 'low' ? 0 : riskLevel === 'medium' ? 1 : riskLevel === 'high' ? 2 : 3, 
                           nonceValidation.riskLevel === 'low' ? 0 : nonceValidation.riskLevel === 'medium' ? 1 : nonceValidation.riskLevel === 'high' ? 2 : 3) === 0 ? 'low' : 
                           Math.max(riskLevel === 'low' ? 0 : riskLevel === 'medium' ? 1 : riskLevel === 'high' ? 2 : 3, 
                           nonceValidation.riskLevel === 'low' ? 0 : nonceValidation.riskLevel === 'medium' ? 1 : nonceValidation.riskLevel === 'high' ? 2 : 3) === 1 ? 'medium' :
                           Math.max(riskLevel === 'low' ? 0 : riskLevel === 'medium' ? 1 : riskLevel === 'high' ? 2 : 3, 
                           nonceValidation.riskLevel === 'low' ? 0 : nonceValidation.riskLevel === 'medium' ? 1 : nonceValidation.riskLevel === 'high' ? 2 : 3) === 2 ? 'high' : 'critical';
      }
    }

    // Validate request signature if enabled
    if (config.enableSignatureValidation) {
      const signatureValidation = this.validateSignature(req);
      if (!signatureValidation.isValid) {
        errors.push(...signatureValidation.errors);
        riskLevel = 'critical'; // Signature validation failure is always critical
      }
    }

    // Additional security checks
    const securityValidation = this.performSecurityChecks(req);
    if (!securityValidation.isValid) {
      errors.push(...securityValidation.errors);
      riskLevel = Math.max(riskLevel === 'low' ? 0 : riskLevel === 'medium' ? 1 : riskLevel === 'high' ? 2 : 3, 
                         securityValidation.riskLevel === 'low' ? 0 : securityValidation.riskLevel === 'medium' ? 1 : securityValidation.riskLevel === 'high' ? 2 : 3) === 0 ? 'low' : 
                         Math.max(riskLevel === 'low' ? 0 : riskLevel === 'medium' ? 1 : riskLevel === 'high' ? 2 : 3, 
                         securityValidation.riskLevel === 'low' ? 0 : securityValidation.riskLevel === 'medium' ? 1 : securityValidation.riskLevel === 'high' ? 2 : 3) === 1 ? 'medium' :
                         Math.max(riskLevel === 'low' ? 0 : riskLevel === 'medium' ? 1 : riskLevel === 'high' ? 2 : 3, 
                         securityValidation.riskLevel === 'low' ? 0 : securityValidation.riskLevel === 'medium' ? 1 : securityValidation.riskLevel === 'high' ? 2 : 3) === 2 ? 'high' : 'critical';
    }

    return {
      isValid: errors.length === 0,
      errors,
      riskLevel,
    };
  }

  /**
   * Validate request timestamp
   */
  private validateTimestamp(req: Request, toleranceMs: number): ValidationResult {
    const errors: string[] = [];
    const timestamp = req.headers['x-timestamp'] as string;

    if (!timestamp) {
      return {
        isValid: false,
        errors: ['Missing timestamp header (x-timestamp)'],
        riskLevel: 'medium',
      };
    }

    const requestTime = parseInt(timestamp, 10);
    if (isNaN(requestTime)) {
      return {
        isValid: false,
        errors: ['Invalid timestamp format'],
        riskLevel: 'medium',
      };
    }

    const now = Date.now();
    const timeDiff = Math.abs(now - requestTime);

    if (timeDiff > toleranceMs) {
      return {
        isValid: false,
        errors: [`Request timestamp outside tolerance: ${timeDiff}ms (max: ${toleranceMs}ms)`],
        riskLevel: 'high',
      };
    }

    return {
      isValid: true,
      errors: [],
      riskLevel: 'low',
    };
  }

  /**
   * Validate request nonce
   */
  private validateNonce(req: Request): ValidationResult {
    const nonce = req.headers['x-nonce'] as string;

    if (!nonce) {
      return {
        isValid: false,
        errors: ['Missing nonce header (x-nonce)'],
        riskLevel: 'medium',
      };
    }

    if (nonce.length < 16) {
      return {
        isValid: false,
        errors: ['Nonce too short (minimum 16 characters)'],
        riskLevel: 'medium',
      };
    }

    if (this.nonceCache.has(nonce)) {
      return {
        isValid: false,
        errors: ['Nonce already used (replay attack detected)'],
        riskLevel: 'critical',
      };
    }

    // Add nonce to cache
    this.nonceCache.add(nonce);

    return {
      isValid: true,
      errors: [],
      riskLevel: 'low',
    };
  }

  /**
   * Validate request signature
   */
  private validateSignature(req: Request): ValidationResult {
    const signature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;

    if (!signature) {
      return {
        isValid: false,
        errors: ['Missing signature header (x-signature)'],
        riskLevel: 'critical',
      };
    }

    if (!timestamp) {
      return {
        isValid: false,
        errors: ['Missing timestamp for signature validation'],
        riskLevel: 'critical',
      };
    }

    try {
      // Create signature payload
      const method = req.method;
      const path = req.path;
      const body = req.body ? JSON.stringify(req.body) : '';
      const payload = `${method}|${path}|${body}|${timestamp}`;

      // Get signing key (in production, this should be from secure storage)
      const signingKey = process.env.API_SIGNING_KEY || 'default-signing-key';
      
      // Calculate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', signingKey)
        .update(payload)
        .digest('hex');

      // Compare signatures using timing-safe comparison
      const providedSignature = signature.replace('sha256=', '');
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );

      if (!isValid) {
        return {
          isValid: false,
          errors: ['Invalid request signature'],
          riskLevel: 'critical',
        };
      }

      return {
        isValid: true,
        errors: [],
        riskLevel: 'low',
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Signature validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        riskLevel: 'critical',
      };
    }
  }

  /**
   * Perform additional security checks
   */
  private performSecurityChecks(req: Request): ValidationResult {
    const errors: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Check for suspicious user agents
    const userAgent = req.get('User-Agent') || '';
    const suspiciousAgents = ['curl', 'wget', 'python-requests', 'bot', 'crawler', 'scanner'];
    
    if (suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
      errors.push(`Suspicious user agent detected: ${userAgent}`);
      riskLevel = 'medium';
    }

    // Check for SQL injection patterns in query parameters
    const queryString = JSON.stringify(req.query);
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(\'|\"|;|--|\*|\/\*|\*\/)/,
      /(\bOR\b|\bAND\b).*(\=|\<|\>)/i,
    ];

    if (sqlPatterns.some(pattern => pattern.test(queryString))) {
      errors.push('Potential SQL injection attempt detected in query parameters');
      riskLevel = 'high';
    }

    // Check for XSS patterns in request body
    if (req.body && typeof req.body === 'object') {
      const bodyString = JSON.stringify(req.body);
      const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      ];

      if (xssPatterns.some(pattern => pattern.test(bodyString))) {
        errors.push('Potential XSS attempt detected in request body');
        riskLevel = 'high';
      }
    }

    // Check for path traversal attempts
    const pathTraversalPatterns = [
      /\.\.\//,
      /\.\.\\/,
      /%2e%2e%2f/i,
      /%2e%2e%5c/i,
    ];

    const fullPath = req.originalUrl || req.url;
    if (pathTraversalPatterns.some(pattern => pattern.test(fullPath))) {
      errors.push('Potential path traversal attempt detected');
      riskLevel = 'high';
    }

    // Check for excessive header count (potential header pollution)
    const headerCount = Object.keys(req.headers).length;
    if (headerCount > 50) {
      errors.push(`Excessive header count: ${headerCount} (potential header pollution)`);
      riskLevel = 'medium';
    }

    // Check for suspicious IP patterns (if behind proxy)
    const xForwardedFor = req.headers['x-forwarded-for'] as string;
    if (xForwardedFor) {
      const ips = xForwardedFor.split(',').map(ip => ip.trim());
      if (ips.length > 10) {
        errors.push('Suspicious X-Forwarded-For header with too many IPs');
        riskLevel = 'medium';
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      riskLevel,
    };
  }

  /**
   * Generate request signature for outgoing requests
   */
  generateRequestSignature(method: string, path: string, body: string, timestamp: string): string {
    const signingKey = process.env.API_SIGNING_KEY || 'default-signing-key';
    const payload = `${method}|${path}|${body}|${timestamp}`;
    
    return crypto
      .createHmac('sha256', signingKey)
      .update(payload)
      .digest('hex');
  }

  /**
   * Generate secure nonce
   */
  generateNonce(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Sanitize headers for logging
   */
  private sanitizeHeaders(headers: any): any {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-signature'];
    const sanitized: any = {};

    Object.keys(headers).forEach(key => {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = this.encryption.maskSensitiveData(headers[key]);
      } else {
        sanitized[key] = headers[key];
      }
    });

    return sanitized;
  }

  /**
   * Clean up old nonces
   */
  private cleanupNonces(): void {
    // In a production environment, you'd want to implement a more sophisticated
    // cleanup mechanism, possibly with TTL-based storage like Redis
    if (this.nonceCache.size > 10000) {
      this.nonceCache.clear();
      console.log('Nonce cache cleared due to size limit');
    }
  }

  /**
   * Get validation statistics
   */
  getValidationStatistics(): {
    nonceCacheSize: number;
    cleanupIntervalActive: boolean;
  } {
    return {
      nonceCacheSize: this.nonceCache.size,
      cleanupIntervalActive: !!this.cleanupInterval,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.nonceCache.clear();
  }
}