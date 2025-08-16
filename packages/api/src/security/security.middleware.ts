import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { RateLimiterService } from './rate-limiter.service';
import { AuditLoggerService } from './audit-logger.service';
import { EncryptionService } from './encryption.service';

export interface SecurityConfig {
  enableHelmet: boolean;
  enableRateLimit: boolean;
  enableAuditLog: boolean;
  enableCSRF: boolean;
  enableCORS: boolean;
  trustedProxies?: string[];
}

export class SecurityMiddleware {
  private rateLimiter: RateLimiterService;
  private auditLogger: AuditLoggerService;
  private encryption: EncryptionService;

  constructor(
    rateLimiter: RateLimiterService,
    auditLogger: AuditLoggerService,
    encryption: EncryptionService
  ) {
    this.rateLimiter = rateLimiter;
    this.auditLogger = auditLogger;
    this.encryption = encryption;
  }

  /**
   * Get comprehensive security middleware stack
   */
  getSecurityMiddleware(config: SecurityConfig = { 
    enableHelmet: true, 
    enableRateLimit: true, 
    enableAuditLog: true, 
    enableCSRF: false, 
    enableCORS: true 
  }) {
    const middlewares: any[] = [];

    // Helmet for security headers
    if (config.enableHelmet) {
      middlewares.push(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      }));
    }

    // CORS configuration
    if (config.enableCORS) {
      middlewares.push(this.createCORSMiddleware());
    }

    // Rate limiting
    if (config.enableRateLimit) {
      const limiters = this.rateLimiter.createAPILimiters();
      middlewares.push(limiters.general);
    }

    // Audit logging
    if (config.enableAuditLog) {
      middlewares.push(this.auditLogger.createAuditMiddleware());
    }

    // Security headers
    middlewares.push(this.createSecurityHeadersMiddleware());

    // Input sanitization
    middlewares.push(this.createInputSanitizationMiddleware());

    return middlewares;
  }

  /**
   * Get endpoint-specific security middleware
   */
  getEndpointSecurity() {
    const limiters = this.rateLimiter.createAPILimiters();
    
    return {
      auth: [limiters.auth, this.createAuthSecurityMiddleware()],
      registration: [limiters.registration, this.createRegistrationSecurityMiddleware()],
      predictions: [limiters.predictions, this.createPredictionSecurityMiddleware()],
      passwordReset: [limiters.passwordReset, this.createPasswordResetSecurityMiddleware()],
      admin: [this.createAdminSecurityMiddleware()],
    };
  }

  /**
   * Create CORS middleware
   */
  private createCORSMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
      const origin = req.headers.origin;

      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }

      next();
    };
  }

  /**
   * Create security headers middleware
   */
  private createSecurityHeadersMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Additional security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      // Remove server information
      res.removeHeader('X-Powered-By');
      
      next();
    };
  }

  /**
   * Create input sanitization middleware
   */
  private createInputSanitizationMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Sanitize query parameters
      if (req.query) {
        req.query = this.sanitizeObject(req.query);
      }

      // Sanitize request body
      if (req.body) {
        req.body = this.sanitizeObject(req.body);
      }

      // Sanitize parameters
      if (req.params) {
        req.params = this.sanitizeObject(req.params);
      }

      next();
    };
  }

  /**
   * Create authentication security middleware
   */
  private createAuthSecurityMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Log authentication attempt
      const originalJson = res.json;
      res.json = function(body: any) {
        const success = res.statusCode < 400;
        this.auditLogger.logAuthentication(req, success, body?.user?.id, body);
        return originalJson.call(this, body);
      }.bind(this);

      next();
    };
  }

  /**
   * Create registration security middleware
   */
  private createRegistrationSecurityMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Validate registration data
      if (req.body) {
        const { email, password } = req.body;
        
        if (email && !this.isValidEmail(email)) {
          res.status(400).json({
            success: false,
            error: 'Invalid email format',
          });
          return;
        }

        if (password && !this.isStrongPassword(password)) {
          res.status(400).json({
            success: false,
            error: 'Password does not meet security requirements',
          });
          return;
        }
      }

      next();
    };
  }

  /**
   * Create prediction security middleware
   */
  private createPredictionSecurityMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Log prediction access
      this.auditLogger.logDataAccess(req, 'predictions', true, {
        fightId: req.params.fightId,
        predictionType: req.query.type,
      });

      next();
    };
  }

  /**
   * Create password reset security middleware
   */
  private createPasswordResetSecurityMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Log password reset attempt
      this.auditLogger.logEvent({
        userId: req.body?.userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        action: 'password_reset_request',
        resource: 'authentication',
        method: req.method,
        endpoint: req.path,
        success: true,
        details: { email: this.encryption.maskSensitiveData(req.body?.email || '') },
        riskLevel: 'medium',
        category: 'authentication',
      });

      next();
    };
  }

  /**
   * Create admin security middleware
   */
  private createAdminSecurityMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Enhanced logging for admin actions
      this.auditLogger.logEvent({
        userId: (req as any).user?.id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        action: `admin_${req.method.toLowerCase()}`,
        resource: 'admin',
        method: req.method,
        endpoint: req.path,
        success: true,
        details: {
          query: req.query,
          params: req.params,
        },
        riskLevel: 'critical',
        category: 'authorization',
      });

      next();
    };
  }

  /**
   * Sanitize object recursively
   */
  private sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return this.sanitizeString(String(obj));
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[this.sanitizeString(key)] = this.sanitizeObject(value);
    }

    return sanitized;
  }

  /**
   * Sanitize string input
   */
  private sanitizeString(str: string): string {
    if (typeof str !== 'string') return str;
    
    // Remove potentially dangerous characters
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/[<>]/g, '') // Remove angle brackets
      .trim();
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  /**
   * Check password strength
   */
  private isStrongPassword(password: string): boolean {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongPasswordRegex.test(password);
  }
}