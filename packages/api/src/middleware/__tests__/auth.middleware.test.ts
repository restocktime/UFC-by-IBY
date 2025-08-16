import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { AuthMiddleware, AuthenticatedRequest } from '../auth.middleware.js';
import { UserService, UserRole, JWTPayload } from '../../services/user.service.js';

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let mockUserService: UserService;
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockUserService = {
      verifyToken: vi.fn()
    } as any;

    authMiddleware = new AuthMiddleware(mockUserService);

    mockReq = {
      headers: {},
      params: {},
      user: undefined
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    mockNext = vi.fn();
  });

  describe('authenticate', () => {
    it('should authenticate valid token successfully', async () => {
      const mockPayload: JWTPayload = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };

      mockReq.headers = {
        authorization: 'Bearer valid-token'
      };

      (mockUserService.verifyToken as Mock).mockResolvedValue(mockPayload);

      await authMiddleware.authenticate(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockUserService.verifyToken).toHaveBeenCalledWith('valid-token');
      expect(mockReq.user).toEqual(mockPayload);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 401 if no authorization header', async () => {
      mockReq.headers = {};

      await authMiddleware.authenticate(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if authorization header does not start with Bearer', async () => {
      mockReq.headers = {
        authorization: 'Basic invalid-format'
      };

      await authMiddleware.authenticate(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if token verification fails', async () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-token'
      };

      (mockUserService.verifyToken as Mock).mockRejectedValue(new Error('Invalid token'));

      await authMiddleware.authenticate(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow access for user with required role', () => {
      mockReq.user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.ADMIN
      };

      const middleware = authMiddleware.requireRole([UserRole.ADMIN]);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow access for user with one of multiple required roles', () => {
      mockReq.user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.ANALYST
      };

      const middleware = authMiddleware.requireRole([UserRole.ADMIN, UserRole.ANALYST]);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 401 if user is not authenticated', () => {
      mockReq.user = undefined;

      const middleware = authMiddleware.requireRole([UserRole.ADMIN]);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 if user does not have required role', () => {
      mockReq.user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };

      const middleware = authMiddleware.requireRole([UserRole.ADMIN]);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should allow access for admin user', () => {
      mockReq.user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.ADMIN
      };

      authMiddleware.requireAdmin(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should deny access for non-admin user', () => {
      mockReq.user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };

      authMiddleware.requireAdmin(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireAnalyst', () => {
    it('should allow access for admin user', () => {
      mockReq.user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.ADMIN
      };

      authMiddleware.requireAnalyst(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow access for analyst user', () => {
      mockReq.user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.ANALYST
      };

      authMiddleware.requireAnalyst(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should deny access for regular user', () => {
      mockReq.user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };

      authMiddleware.requireAnalyst(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireOwnershipOrAdmin', () => {
    const getUserIdFromParams = (req: Request) => req.params.userId;

    it('should allow access for resource owner', () => {
      mockReq.user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };
      mockReq.params = { userId: 'user-id' };

      const middleware = authMiddleware.requireOwnershipOrAdmin(getUserIdFromParams);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow access for admin user', () => {
      mockReq.user = {
        userId: 'admin-id',
        email: 'admin@example.com',
        role: UserRole.ADMIN
      };
      mockReq.params = { userId: 'other-user-id' };

      const middleware = authMiddleware.requireOwnershipOrAdmin(getUserIdFromParams);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should deny access for non-owner non-admin', () => {
      mockReq.user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };
      mockReq.params = { userId: 'other-user-id' };

      const middleware = authMiddleware.requireOwnershipOrAdmin(getUserIdFromParams);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if user is not authenticated', () => {
      mockReq.user = undefined;
      mockReq.params = { userId: 'user-id' };

      const middleware = authMiddleware.requireOwnershipOrAdmin(getUserIdFromParams);
      middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should set user if valid token provided', async () => {
      const mockPayload: JWTPayload = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };

      mockReq.headers = {
        authorization: 'Bearer valid-token'
      };

      (mockUserService.verifyToken as Mock).mockResolvedValue(mockPayload);

      await authMiddleware.optionalAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockUserService.verifyToken).toHaveBeenCalledWith('valid-token');
      expect(mockReq.user).toEqual(mockPayload);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should continue without user if no token provided', async () => {
      mockReq.headers = {};

      await authMiddleware.optionalAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockUserService.verifyToken).not.toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should continue without user if token is invalid', async () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-token'
      };

      (mockUserService.verifyToken as Mock).mockRejectedValue(new Error('Invalid token'));

      await authMiddleware.optionalAuth(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockUserService.verifyToken).toHaveBeenCalledWith('invalid-token');
      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});