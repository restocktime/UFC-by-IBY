import { Request, Response } from 'express';
import { UserService, CreateUserRequest, LoginRequest, UserRole } from '../services/user.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

export class UserController {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  /**
   * Register a new user
   */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const userData: CreateUserRequest = req.body;
      
      if (!userData.email || !userData.username || !userData.password) {
        res.status(400).json({ error: 'Email, username, and password are required' });
        return;
      }

      const result = await this.userService.register(userData);
      
      res.status(201).json({
        message: 'User registered successfully',
        user: result.user,
        token: result.token
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      res.status(400).json({ error: message });
    }
  };

  /**
   * Login user
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const credentials: LoginRequest = req.body;
      
      if (!credentials.email || !credentials.password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const result = await this.userService.login(credentials);
      
      res.json({
        message: 'Login successful',
        user: result.user,
        token: result.token
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      res.status(401).json({ error: message });
    }
  };

  /**
   * Get current user profile
   */
  getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const user = await this.userService.getUserById(req.user.userId);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get profile';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Get user by ID (admin only)
   */
  getUserById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }

      const user = await this.userService.getUserById(userId);
      
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get user';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Update user role (admin only)
   */
  updateUserRole = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      
      if (!userId || !role) {
        res.status(400).json({ error: 'User ID and role are required' });
        return;
      }

      if (!Object.values(UserRole).includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      await this.userService.updateUserRole(userId, role);
      
      res.json({ message: 'User role updated successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update user role';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Deactivate user account (admin only)
   */
  deactivateUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }

      await this.userService.deactivateUser(userId);
      
      res.json({ message: 'User deactivated successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to deactivate user';
      res.status(500).json({ error: message });
    }
  };

  /**
   * Change password
   */
  changePassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Current password and new password are required' });
        return;
      }

      await this.userService.changePassword(req.user.userId, currentPassword, newPassword);
      
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change password';
      res.status(400).json({ error: message });
    }
  };

  /**
   * Verify token endpoint
   */
  verifyToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      res.json({ 
        valid: true, 
        user: {
          userId: req.user.userId,
          email: req.user.email,
          role: req.user.role
        }
      });
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}