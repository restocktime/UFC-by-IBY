import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserService, CreateUserRequest, LoginRequest, UserRole, UserWithPassword } from '../user.service.js';
import { DatabaseManager } from '../../database/manager.js';

// Mock dependencies
vi.mock('bcrypt');
vi.mock('jsonwebtoken');

const mockBcrypt = bcrypt as {
  hash: Mock;
  compare: Mock;
};

const mockJwt = jwt as {
  sign: Mock;
  verify: Mock;
};

describe('UserService', () => {
  let userService: UserService;
  let mockDbManager: DatabaseManager;
  let mockCollection: any;
  let mockDb: any;

  const jwtSecret = 'test-secret';

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock database collection
    mockCollection = {
      findOne: vi.fn(),
      insertOne: vi.fn(),
      updateOne: vi.fn()
    };

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection)
    };

    mockDbManager = {
      getMongoDb: vi.fn().mockResolvedValue(mockDb)
    } as any;

    userService = new UserService(mockDbManager, jwtSecret);
  });

  describe('register', () => {
    const validUserData: CreateUserRequest = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!'
    };

    it('should register a new user successfully', async () => {
      // Mock no existing user
      mockCollection.findOne.mockResolvedValue(null);
      
      // Mock password hashing
      mockBcrypt.hash.mockResolvedValue('hashed-password');
      
      // Mock JWT generation
      mockJwt.sign.mockReturnValue('jwt-token');

      const result = await userService.register(validUserData);

      expect(result.user.email).toBe(validUserData.email);
      expect(result.user.username).toBe(validUserData.username);
      expect(result.token).toBe('jwt-token');
      expect(result.user).not.toHaveProperty('password');
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });

    it('should throw error if email already exists', async () => {
      const existingUser = { id: 'existing-id', email: validUserData.email };
      mockCollection.findOne.mockResolvedValueOnce(existingUser);

      await expect(userService.register(validUserData)).rejects.toThrow('User with this email already exists');
    });

    it('should throw error if username already exists', async () => {
      mockCollection.findOne
        .mockResolvedValueOnce(null) // No user with email
        .mockResolvedValueOnce({ id: 'existing-id', username: validUserData.username }); // User with username exists

      await expect(userService.register(validUserData)).rejects.toThrow('Username is already taken');
    });

    it('should validate email format', async () => {
      const invalidEmailData = { ...validUserData, email: 'invalid-email' };

      await expect(userService.register(invalidEmailData)).rejects.toThrow('Invalid email format');
    });

    it('should validate password requirements', async () => {
      const weakPasswordData = { ...validUserData, password: 'weak' };

      await expect(userService.register(weakPasswordData)).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should validate password contains lowercase', async () => {
      const noLowercaseData = { ...validUserData, password: 'PASSWORD123!' };

      await expect(userService.register(noLowercaseData)).rejects.toThrow('Password must contain at least one lowercase letter');
    });

    it('should validate password contains uppercase', async () => {
      const noUppercaseData = { ...validUserData, password: 'password123!' };

      await expect(userService.register(noUppercaseData)).rejects.toThrow('Password must contain at least one uppercase letter');
    });

    it('should validate password contains number', async () => {
      const noNumberData = { ...validUserData, password: 'Password!' };

      await expect(userService.register(noNumberData)).rejects.toThrow('Password must contain at least one number');
    });

    it('should validate password contains special character', async () => {
      const noSpecialData = { ...validUserData, password: 'Password123' };

      await expect(userService.register(noSpecialData)).rejects.toThrow('Password must contain at least one special character');
    });

    it('should validate username length', async () => {
      const shortUsernameData = { ...validUserData, username: 'ab' };

      await expect(userService.register(shortUsernameData)).rejects.toThrow('Username must be between 3 and 30 characters');
    });

    it('should validate username characters', async () => {
      const invalidUsernameData = { ...validUserData, username: 'test-user!' };

      await expect(userService.register(invalidUsernameData)).rejects.toThrow('Username can only contain letters, numbers, and underscores');
    });
  });

  describe('login', () => {
    const loginData: LoginRequest = {
      email: 'test@example.com',
      password: 'Password123!'
    };

    const mockUser: UserWithPassword = {
      id: 'user-id',
      email: 'test@example.com',
      username: 'testuser',
      password: 'hashed-password',
      role: UserRole.USER,
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

    it('should login user successfully', async () => {
      mockCollection.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true);
      mockJwt.sign.mockReturnValue('jwt-token');

      const result = await userService.login(loginData);

      expect(result.user.email).toBe(loginData.email);
      expect(result.token).toBe('jwt-token');
      expect(result.user).not.toHaveProperty('password');
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { id: mockUser.id },
        { $set: { lastLoginAt: expect.any(Date) } }
      );
    });

    it('should throw error if user not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      await expect(userService.login(loginData)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error if user is inactive', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockCollection.findOne.mockResolvedValue(inactiveUser);

      await expect(userService.login(loginData)).rejects.toThrow('Account is deactivated');
    });

    it('should throw error if password is invalid', async () => {
      mockCollection.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(false);

      await expect(userService.login(loginData)).rejects.toThrow('Invalid email or password');
    });
  });

  describe('verifyToken', () => {
    const mockPayload = {
      userId: 'user-id',
      email: 'test@example.com',
      role: UserRole.USER
    };

    const mockUser: UserWithPassword = {
      id: 'user-id',
      email: 'test@example.com',
      username: 'testuser',
      password: 'hashed-password',
      role: UserRole.USER,
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

    it('should verify valid token successfully', async () => {
      mockJwt.verify.mockReturnValue(mockPayload);
      mockCollection.findOne.mockResolvedValue(mockUser);

      const result = await userService.verifyToken('valid-token');

      expect(result).toEqual(mockPayload);
      expect(mockJwt.verify).toHaveBeenCalledWith('valid-token', jwtSecret);
    });

    it('should throw error for invalid token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(userService.verifyToken('invalid-token')).rejects.toThrow('Invalid token');
    });

    it('should throw error if user not found', async () => {
      mockJwt.verify.mockReturnValue(mockPayload);
      mockCollection.findOne.mockResolvedValue(null);

      await expect(userService.verifyToken('valid-token')).rejects.toThrow('Invalid token');
    });

    it('should throw error if user is inactive', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockJwt.verify.mockReturnValue(mockPayload);
      mockCollection.findOne.mockResolvedValue(inactiveUser);

      await expect(userService.verifyToken('valid-token')).rejects.toThrow('Invalid token');
    });
  });

  describe('changePassword', () => {
    const userId = 'user-id';
    const currentPassword = 'CurrentPassword123!';
    const newPassword = 'NewPassword123!';

    const mockUser: UserWithPassword = {
      id: userId,
      email: 'test@example.com',
      username: 'testuser',
      password: 'hashed-current-password',
      role: UserRole.USER,
      preferences: {
        userId,
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

    it('should change password successfully', async () => {
      mockCollection.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true);
      mockBcrypt.hash.mockResolvedValue('hashed-new-password');

      await userService.changePassword(userId, currentPassword, newPassword);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(currentPassword, mockUser.password);
      expect(mockBcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { id: userId },
        { $set: { password: 'hashed-new-password' } }
      );
    });

    it('should throw error if user not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      await expect(userService.changePassword(userId, currentPassword, newPassword)).rejects.toThrow('User not found');
    });

    it('should throw error if current password is incorrect', async () => {
      mockCollection.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(false);

      await expect(userService.changePassword(userId, currentPassword, newPassword)).rejects.toThrow('Current password is incorrect');
    });

    it('should validate new password requirements', async () => {
      mockCollection.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true);

      await expect(userService.changePassword(userId, currentPassword, 'weak')).rejects.toThrow('Password must be at least 8 characters long');
    });
  });

  describe('updateUserRole', () => {
    const userId = 'user-id';
    const mockUser: UserWithPassword = {
      id: userId,
      email: 'test@example.com',
      username: 'testuser',
      password: 'hashed-password',
      role: UserRole.USER,
      preferences: {
        userId,
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

    it('should update user role successfully', async () => {
      mockCollection.findOne.mockResolvedValue(mockUser);

      await userService.updateUserRole(userId, UserRole.ANALYST);

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { id: userId },
        { $set: { role: UserRole.ANALYST } }
      );
    });

    it('should throw error if user not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      await expect(userService.updateUserRole(userId, UserRole.ANALYST)).rejects.toThrow('User not found');
    });
  });

  describe('deactivateUser', () => {
    const userId = 'user-id';

    it('should deactivate user successfully', async () => {
      await userService.deactivateUser(userId);

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { id: userId },
        { $set: { isActive: false } }
      );
    });
  });

  describe('getUserById', () => {
    const userId = 'user-id';
    const mockUser: UserWithPassword = {
      id: userId,
      email: 'test@example.com',
      username: 'testuser',
      password: 'hashed-password',
      role: UserRole.USER,
      preferences: {
        userId,
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

    it('should return user without password', async () => {
      mockCollection.findOne.mockResolvedValue(mockUser);

      const result = await userService.getUserById(userId);

      expect(result).toBeDefined();
      expect(result?.email).toBe(mockUser.email);
      expect(result).not.toHaveProperty('password');
    });

    it('should return null if user not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await userService.getUserById(userId);

      expect(result).toBeNull();
    });
  });
});