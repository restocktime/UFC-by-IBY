import { User, UserPreferences } from '@ufc-platform/shared';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { DatabaseManager } from '../database/manager.js';

export interface CreateUserRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResult {
  user: Omit<User, 'password'>;
  token: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  ANALYST = 'analyst'
}

export interface UserWithPassword extends User {
  password: string;
  role: UserRole;
}

export class UserService {
  private dbManager: DatabaseManager;
  private jwtSecret: string;
  private saltRounds = 12;

  constructor(dbManager: DatabaseManager, jwtSecret: string) {
    this.dbManager = dbManager;
    this.jwtSecret = jwtSecret;
  }

  /**
   * Register a new user with email and password
   */
  async register(userData: CreateUserRequest): Promise<AuthResult> {
    const { email, username, password } = userData;

    // Validate input
    this.validateEmail(email);
    this.validatePassword(password);
    this.validateUsername(username);

    // Check if user already exists
    const existingUser = await this.findUserByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const existingUsername = await this.findUserByUsername(username);
    if (existingUsername) {
      throw new Error('Username is already taken');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, this.saltRounds);

    // Create default preferences
    const defaultPreferences: UserPreferences = {
      userId: '', // Will be set after user creation
      followedFighters: [],
      weightClasses: [],
      alertTypes: [],
      deliveryMethods: [],
      thresholds: {
        oddsMovementPercentage: 10,
        predictionConfidenceChange: 15,
        injuryReportSeverity: 'major',
        minimumNotificationInterval: 30
      },
      timezone: 'UTC',
      enabled: true
    };

    // Create user
    const newUser: UserWithPassword = {
      id: this.generateUserId(),
      email,
      username,
      password: hashedPassword,
      role: UserRole.USER,
      preferences: defaultPreferences,
      createdAt: new Date(),
      lastLoginAt: new Date(),
      isActive: true
    };

    // Set userId in preferences
    newUser.preferences.userId = newUser.id;

    // Save to database
    await this.saveUser(newUser);

    // Generate JWT token
    const token = this.generateToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser;
    return {
      user: userWithoutPassword,
      token
    };
  }

  /**
   * Authenticate user with email and password
   */
  async login(credentials: LoginRequest): Promise<AuthResult> {
    const { email, password } = credentials;

    // Find user by email
    const user = await this.findUserByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await this.updateLastLogin(user.id);

    // Generate JWT token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return {
      user: userWithoutPassword,
      token
    };
  }

  /**
   * Verify JWT token and return user data
   */
  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
      
      // Verify user still exists and is active
      const user = await this.findUserById(decoded.userId);
      if (!user || !user.isActive) {
        throw new Error('Invalid token');
      }

      return decoded;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Get user by ID (without password)
   */
  async getUserById(userId: string): Promise<Omit<User, 'password'> | null> {
    const user = await this.findUserById(userId);
    if (!user) {
      return null;
    }

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Update user role (admin only)
   */
  async updateUserRole(userId: string, role: UserRole): Promise<void> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await this.updateUser(userId, { role });
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(userId: string): Promise<void> {
    await this.updateUser(userId, { isActive: false });
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    this.validatePassword(newPassword);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, this.saltRounds);

    // Update password
    await this.updateUser(userId, { password: hashedPassword });
  }

  // Private helper methods

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '7d' });
  }

  private validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
  }

  private validatePassword(password: string): void {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    if (!/(?=.*[a-z])/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }
    if (!/(?=.*\d)/.test(password)) {
      throw new Error('Password must contain at least one number');
    }
    if (!/(?=.*[@$!%*?&])/.test(password)) {
      throw new Error('Password must contain at least one special character (@$!%*?&)');
    }
  }

  private validateUsername(username: string): void {
    if (username.length < 3 || username.length > 30) {
      throw new Error('Username must be between 3 and 30 characters');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Username can only contain letters, numbers, and underscores');
    }
  }

  // Database operations

  private async findUserByEmail(email: string): Promise<UserWithPassword | null> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserWithPassword>('users');
    return await collection.findOne({ email });
  }

  private async findUserByUsername(username: string): Promise<UserWithPassword | null> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserWithPassword>('users');
    return await collection.findOne({ username });
  }

  private async findUserById(userId: string): Promise<UserWithPassword | null> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserWithPassword>('users');
    return await collection.findOne({ id: userId });
  }

  private async saveUser(user: UserWithPassword): Promise<void> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserWithPassword>('users');
    await collection.insertOne(user);
  }

  private async updateUser(userId: string, updates: Partial<UserWithPassword>): Promise<void> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserWithPassword>('users');
    await collection.updateOne({ id: userId }, { $set: updates });
  }

  private async updateLastLogin(userId: string): Promise<void> {
    await this.updateUser(userId, { lastLoginAt: new Date() });
  }
}