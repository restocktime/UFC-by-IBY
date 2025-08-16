import { Request, Response, NextFunction } from 'express';
import { UserService, JWTPayload, UserRole } from '../services/user.service.js';

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

export class AuthMiddleware {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  /**
   * Middleware to authenticate JWT token
   */
  authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      const payload = await this.userService.verifyToken(token);
      req.user = payload;
      
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  /**
   * Middleware to require specific roles
   */
  requireRole = (roles: UserRole[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!roles.includes(req.user.role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to require admin role
   */
  requireAdmin = this.requireRole([UserRole.ADMIN]);

  /**
   * Middleware to require admin or analyst role
   */
  requireAnalyst = this.requireRole([UserRole.ADMIN, UserRole.ANALYST]);

  /**
   * Middleware to allow access to own resources or admin
   */
  requireOwnershipOrAdmin = (getUserIdFromParams: (req: Request) => string) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const resourceUserId = getUserIdFromParams(req);
      const isOwner = req.user.userId === resourceUserId;
      const isAdmin = req.user.role === UserRole.ADMIN;

      if (!isOwner && !isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      next();
    };
  };

  /**
   * Optional authentication - sets user if token is valid but doesn't require it
   */
  optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const payload = await this.userService.verifyToken(token);
        req.user = payload;
      }
      
      next();
    } catch (error) {
      // Continue without authentication if token is invalid
      next();
    }
  };
}