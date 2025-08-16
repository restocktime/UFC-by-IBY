import { Request, Response, NextFunction } from 'express';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}

export interface RateLimitInfo {
  totalHits: number;
  totalHitsPerWindow: number;
  resetTime: Date;
  remaining: number;
}

export class RateLimiterService {
  private store: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Create rate limiting middleware
   */
  createLimiter(config: RateLimitConfig) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const key = config.keyGenerator ? config.keyGenerator(req) : this.getDefaultKey(req);
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Get or create rate limit entry
      let entry = this.store.get(key);
      
      if (!entry || entry.resetTime <= now) {
        entry = {
          count: 0,
          resetTime: now + config.windowMs,
        };
      }

      entry.count++;
      this.store.set(key, entry);

      // Check if limit exceeded
      if (entry.count > config.maxRequests) {
        if (config.onLimitReached) {
          config.onLimitReached(req, res);
        }

        res.status(429).json({
          success: false,
          error: 'Too many requests',
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        });
        return;
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - entry.count));
      res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

      next();
    };
  }

  /**
   * Create API-specific rate limiters
   */
  createAPILimiters() {
    return {
      // General API rate limit
      general: this.createLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000,
        keyGenerator: (req) => this.getIPKey(req),
      }),

      // Strict rate limit for prediction endpoints
      predictions: this.createLimiter({
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10,
        keyGenerator: (req) => this.getUserKey(req) || this.getIPKey(req),
      }),

      // Authentication endpoints
      auth: this.createLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5,
        keyGenerator: (req) => this.getIPKey(req),
        onLimitReached: (req, res) => {
          console.warn('Authentication rate limit exceeded:', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString(),
          });
        },
      }),

      // Registration endpoints
      registration: this.createLimiter({
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 3,
        keyGenerator: (req) => this.getIPKey(req),
      }),

      // Password reset endpoints
      passwordReset: this.createLimiter({
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 3,
        keyGenerator: (req) => this.getEmailKey(req) || this.getIPKey(req),
      }),
    };
  }

  /**
   * Get rate limit info for a key
   */
  getRateLimitInfo(key: string, config: RateLimitConfig): RateLimitInfo {
    const entry = this.store.get(key);
    const now = Date.now();

    if (!entry || entry.resetTime <= now) {
      return {
        totalHits: 0,
        totalHitsPerWindow: 0,
        resetTime: new Date(now + config.windowMs),
        remaining: config.maxRequests,
      };
    }

    return {
      totalHits: entry.count,
      totalHitsPerWindow: entry.count,
      resetTime: new Date(entry.resetTime),
      remaining: Math.max(0, config.maxRequests - entry.count),
    };
  }

  /**
   * Reset rate limit for a key
   */
  resetRateLimit(key: string): void {
    this.store.delete(key);
  }

  /**
   * Get default key from request
   */
  private getDefaultKey(req: Request): string {
    return this.getIPKey(req);
  }

  /**
   * Get IP-based key
   */
  private getIPKey(req: Request): string {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Get user-based key
   */
  private getUserKey(req: Request): string | null {
    const userId = (req as any).user?.id || req.headers['x-user-id'];
    return userId ? `user:${userId}` : null;
  }

  /**
   * Get email-based key
   */
  private getEmailKey(req: Request): string | null {
    const email = req.body?.email;
    return email ? `email:${email}` : null;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.store.forEach((entry, key) => {
      if (entry.resetTime <= now) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => {
      this.store.delete(key);
    });

    if (expiredKeys.length > 0) {
      console.log(`Cleaned up ${expiredKeys.length} expired rate limit entries`);
    }
  }

  /**
   * Destroy the service and clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}