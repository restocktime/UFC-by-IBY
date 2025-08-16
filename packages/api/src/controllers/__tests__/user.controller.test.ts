import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { Request, Response } from 'express';
import { UserController } from '../user.controller.js';
import { UserService, CreateUserRequest, LoginRequest, UserRole, AuthResult } from '../../services/user.service.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { User } from '@ufc-platform/shared';

describe('UserController', () => {
  let userController: UserController;
  let mockUserService: UserService;
  let mockReq: Partial<Request | AuthenticatedRequest>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockUserService = {
      register: vi.fn(),
      login: vi.fn(),
      getUserById: vi.fn(),
      updateUserRole: vi.fn(),
      deactivateUser: vi.fn(),
      changePassword: vi.fn()
    } as any;

    userController = new UserController(mockUserService);

    mockReq = {
      body: {},
      params: {},
      user: undefined
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
  });

  describe('register', () => {
    const validUserData: CreateUserRequest = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!'
    };

    const mockAuthResult: AuthResult = {
      user: {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        preferences: {
          userId: 'user-id',
          followedFighters: [],
          weightClasses: [],
          alertTypes: [],
          deliveryMethods: [],
          thresholds: {
            oddsMovementPercentage: 10,
            predictionConfidenceChange: 15,
            injuryReportSeverity: 'major'
          },
          timezone: 'UTC'
        },
        createdAt: new Date(),
        lastLoginAt: new Date(),
        isActive: true
      },
      token: 'jwt-token'
    };

    it('should register user successfully', async () => {
      mockReq.body = validUserData;
      (mockUserService.register as Mock).mockResolvedValue(mockAuthResult);

      await userController.register(mockReq as Request, mockRes as Response);

      expect(mockUserService.register).toHaveBeenCalledWith(validUserData);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'User registered successfully',
        user: mockAuthResult.user,
        token: mockAuthResult.token
      });
    });

    it('should return 400 if email is missing', async () => {
      mockReq.body = { username: 'testuser', password: 'Password123!' };

      await userController.register(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Email, username, and password are required'
      });
    });

    it('should return 400 if username is missing', async () => {
      mockReq.body = { email: 'test@example.com', password: 'Password123!' };

      await userController.register(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Email, username, and password are required'
      });
    });

    it('should return 400 if password is missing', async () => {
      mockReq.body = { email: 'test@example.com', username: 'testuser' };

      await userController.register(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Email, username, and password are required'
      });
    });

    it('should return 400 if registration fails', async () => {
      mockReq.body = validUserData;
      (mockUserService.register as Mock).mockRejectedValue(new Error('Email already exists'));

      await userController.register(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Email already exists'
      });
    });
  });

  describe('login', () => {
    const validCredentials: LoginRequest = {
      email: 'test@example.com',
      password: 'Password123!'
    };

    const mockAuthResult: AuthResult = {
      user: {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        preferences: {
          userId: 'user-id',
          followedFighters: [],
          weightClasses: [],
          alertTypes: [],
          deliveryMethods: [],
          thresholds: {
            oddsMovementPercentage: 10,
            predictionConfidenceChange: 15,
            injuryReportSeverity: 'major'
          },
          timezone: 'UTC'
        },
        createdAt: new Date(),
        lastLoginAt: new Date(),
        isActive: true
      },
      token: 'jwt-token'
    };

    it('should login user successfully', async () => {
      mockReq.body = validCredentials;
      (mockUserService.login as Mock).mockResolvedValue(mockAuthResult);

      await userController.login(mockReq as Request, mockRes as Response);

      expect(mockUserService.login).toHaveBeenCalledWith(validCredentials);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Login successful',
        user: mockAuthResult.user,
        token: mockAuthResult.token
      });
    });

    it('should return 400 if email is missing', async () => {
      mockReq.body = { password: 'Password123!' };

      await userController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Email and password are required'
      });
    });

    it('should return 400 if password is missing', async () => {
      mockReq.body = { email: 'test@example.com' };

      await userController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Email and password are required'
      });
    });

    it('should return 401 if login fails', async () => {
      mockReq.body = validCredentials;
      (mockUserService.login as Mock).mockRejectedValue(new Error('Invalid credentials'));

      await userController.login(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid credentials'
      });
    });
  });

  describe('getProfile', () => {
    const mockUser: Omit<User, 'password'> = {
      id: 'user-id',
      email: 'test@example.com',
      username: 'testuser',
      preferences: {
        userId: 'user-id',
        followedFighters: [],
        weightClasses: [],
        alertTypes: [],
        deliveryMethods: [],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 15,
          injuryReportSeverity: 'major'
        },
        timezone: 'UTC'
      },
      createdAt: new Date(),
      lastLoginAt: new Date(),
      isActive: true
    };

    it('should return user profile successfully', async () => {
      (mockReq as AuthenticatedRequest).user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };
      (mockUserService.getUserById as Mock).mockResolvedValue(mockUser);

      await userController.getProfile(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockUserService.getUserById).toHaveBeenCalledWith('user-id');
      expect(mockRes.json).toHaveBeenCalledWith({ user: mockUser });
    });

    it('should return 401 if user is not authenticated', async () => {
      (mockReq as AuthenticatedRequest).user = undefined;

      await userController.getProfile(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should return 404 if user not found', async () => {
      (mockReq as AuthenticatedRequest).user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };
      (mockUserService.getUserById as Mock).mockResolvedValue(null);

      await userController.getProfile(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User not found'
      });
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      (mockReq as AuthenticatedRequest).user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };
      mockReq.body = {
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword123!'
      };

      await userController.changePassword(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockUserService.changePassword).toHaveBeenCalledWith(
        'user-id',
        'CurrentPassword123!',
        'NewPassword123!'
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Password changed successfully'
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      (mockReq as AuthenticatedRequest).user = undefined;

      await userController.changePassword(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should return 400 if current password is missing', async () => {
      (mockReq as AuthenticatedRequest).user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };
      mockReq.body = { newPassword: 'NewPassword123!' };

      await userController.changePassword(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Current password and new password are required'
      });
    });

    it('should return 400 if new password is missing', async () => {
      (mockReq as AuthenticatedRequest).user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };
      mockReq.body = { currentPassword: 'CurrentPassword123!' };

      await userController.changePassword(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Current password and new password are required'
      });
    });

    it('should return 400 if password change fails', async () => {
      (mockReq as AuthenticatedRequest).user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };
      mockReq.body = {
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword123!'
      };
      (mockUserService.changePassword as Mock).mockRejectedValue(new Error('Current password is incorrect'));

      await userController.changePassword(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Current password is incorrect'
      });
    });
  });

  describe('verifyToken', () => {
    it('should verify token successfully', async () => {
      (mockReq as AuthenticatedRequest).user = {
        userId: 'user-id',
        email: 'test@example.com',
        role: UserRole.USER
      };

      await userController.verifyToken(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        valid: true,
        user: {
          userId: 'user-id',
          email: 'test@example.com',
          role: UserRole.USER
        }
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      (mockReq as AuthenticatedRequest).user = undefined;

      await userController.verifyToken(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid token'
      });
    });
  });
});