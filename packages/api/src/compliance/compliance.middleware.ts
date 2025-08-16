import { Request, Response, NextFunction } from 'express';
import { ComplianceService } from './compliance.service';

export interface ComplianceRequest extends Request {
  compliance?: {
    indicators: any[];
    canDisplay: boolean;
    pendingAcknowledgments: any[];
  };
}

export class ComplianceMiddleware {
  constructor(private complianceService: ComplianceService) {}

  /**
   * Middleware to add compliance indicators to responses
   */
  addComplianceIndicators = (contentType: 'prediction' | 'odds' | 'analysis') => {
    return (req: ComplianceRequest, res: Response, next: NextFunction): void => {
      try {
        const indicators = this.complianceService.generateComplianceIndicators(contentType);
        
        // Add compliance indicators to request for use in controllers
        req.compliance = {
          indicators,
          canDisplay: true,
          pendingAcknowledgments: [],
        };

        // Intercept JSON responses to add compliance data
        const originalJson = res.json;
        res.json = function(body: any) {
          if (body && typeof body === 'object') {
            body.compliance = {
              indicators,
              contentType,
              timestamp: new Date().toISOString(),
            };
          }
          return originalJson.call(this, body);
        };

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Middleware to validate user compliance before serving content
   */
  validateUserCompliance = (contentType: 'prediction' | 'odds' | 'analysis') => {
    return (req: ComplianceRequest, res: Response, next: NextFunction): void => {
      try {
        const userId = req.user?.id || req.params.userId || req.query.userId as string;
        const jurisdiction = req.query.jurisdiction as string;

        if (!userId) {
          // For anonymous users, still show compliance indicators
          const indicators = this.complianceService.generateComplianceIndicators(contentType);
          req.compliance = {
            indicators,
            canDisplay: contentType === 'analysis', // Only allow analysis for anonymous users
            pendingAcknowledgments: [],
          };
          next();
          return;
        }

        const validation = this.complianceService.validateContentCompliance(
          userId,
          contentType,
          jurisdiction
        );

        req.compliance = validation;

        if (!validation.canDisplay && validation.pendingAcknowledgments.length > 0) {
          res.status(403).json({
            success: false,
            error: 'Compliance acknowledgments required',
            data: {
              pendingAcknowledgments: validation.pendingAcknowledgments,
              indicators: validation.indicators,
            },
          });
          return;
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Middleware to add general compliance headers
   */
  addComplianceHeaders = (req: Request, res: Response, next: NextFunction): void => {
    // Add compliance-related headers
    res.setHeader('X-Content-Purpose', 'analysis-only');
    res.setHeader('X-Gambling-Disclaimer', 'not-gambling-service');
    res.setHeader('X-Content-Type', 'educational-analytical');
    
    next();
  };

  /**
   * Middleware to log compliance-related activities
   */
  logComplianceActivity = (req: Request, res: Response, next: NextFunction): void => {
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // Log compliance-sensitive endpoints
      const sensitiveEndpoints = ['/predictions', '/odds', '/betting'];
      const isSensitive = sensitiveEndpoints.some(endpoint => 
        req.path.includes(endpoint)
      );

      if (isSensitive) {
        console.log('Compliance Activity:', {
          timestamp: new Date().toISOString(),
          userId: req.user?.id || 'anonymous',
          endpoint: req.path,
          method: req.method,
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip,
          jurisdiction: req.query.jurisdiction,
        });
      }

      return originalJson.call(this, body);
    };

    next();
  };
}