/**
 * UserPreferencesService - Manages user notification preferences
 */

import { EventEmitter } from 'events';
import { UserPreferences, AlertType, DeliveryMethod } from '@ufc-platform/shared';

export interface UserPreferencesRepository {
  getUserPreferences(userId: string): Promise<UserPreferences | null>;
  saveUserPreferences(preferences: UserPreferences): Promise<void>;
  deleteUserPreferences(userId: string): Promise<void>;
  getUsersByAlertType(alertType: AlertType): Promise<string[]>;
  getUsersByFighter(fighterId: string): Promise<string[]>;
}

export interface PreferenceValidationResult {
  valid: boolean;
  errors: string[];
}

export class UserPreferencesService extends EventEmitter {
  private repository: UserPreferencesRepository;
  private cache = new Map<string, UserPreferences>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(repository: UserPreferencesRepository) {
    super();
    this.repository = repository;
  }

  /**
   * Get user preferences with caching
   */
  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    // Check cache first
    const cached = this.getCachedPreferences(userId);
    if (cached) {
      return cached;
    }

    // Load from repository
    const preferences = await this.repository.getUserPreferences(userId);
    
    if (preferences) {
      this.setCachedPreferences(userId, preferences);
    }

    return preferences;
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(preferences: UserPreferences): Promise<void> {
    // Validate preferences
    const validation = this.validatePreferences(preferences);
    if (!validation.valid) {
      throw new Error(`Invalid preferences: ${validation.errors.join(', ')}`);
    }

    // Save to repository
    await this.repository.saveUserPreferences(preferences);

    // Update cache
    this.setCachedPreferences(preferences.userId, preferences);

    // Emit event
    this.emit('preferencesUpdated', preferences);
  }

  /**
   * Delete user preferences
   */
  async deleteUserPreferences(userId: string): Promise<void> {
    await this.repository.deleteUserPreferences(userId);
    
    // Remove from cache
    this.cache.delete(userId);
    this.cacheExpiry.delete(userId);

    this.emit('preferencesDeleted', { userId });
  }

  /**
   * Get users who want alerts for specific alert type
   */
  async getUsersForAlertType(alertType: AlertType): Promise<string[]> {
    return await this.repository.getUsersByAlertType(alertType);
  }

  /**
   * Get users who follow a specific fighter
   */
  async getUsersFollowingFighter(fighterId: string): Promise<string[]> {
    return await this.repository.getUsersByFighter(fighterId);
  }

  /**
   * Create default preferences for new user
   */
  createDefaultPreferences(userId: string): UserPreferences {
    return {
      userId,
      followedFighters: [],
      weightClasses: [],
      alertTypes: ['odds_movement', 'fight_update'],
      deliveryMethods: ['email'],
      thresholds: {
        oddsMovementPercentage: 15,
        predictionConfidenceChange: 10,
        injuryReportSeverity: 'major',
        minimumNotificationInterval: 30
      },
      timezone: 'UTC',
      enabled: true
    };
  }

  /**
   * Validate user preferences
   */
  validatePreferences(preferences: UserPreferences): PreferenceValidationResult {
    const errors: string[] = [];

    // Validate user ID
    if (!preferences.userId || typeof preferences.userId !== 'string') {
      errors.push('User ID is required and must be a string');
    }

    // Validate alert types
    const validAlertTypes: AlertType[] = ['odds_movement', 'fight_update', 'prediction_change', 'injury_report'];
    for (const alertType of preferences.alertTypes) {
      if (!validAlertTypes.includes(alertType)) {
        errors.push(`Invalid alert type: ${alertType}`);
      }
    }

    // Validate delivery methods
    const validDeliveryMethods: DeliveryMethod[] = ['email', 'push', 'sms'];
    for (const method of preferences.deliveryMethods) {
      if (!validDeliveryMethods.includes(method)) {
        errors.push(`Invalid delivery method: ${method}`);
      }
    }

    // Validate thresholds
    if (preferences.thresholds.oddsMovementPercentage < 1 || preferences.thresholds.oddsMovementPercentage > 100) {
      errors.push('Odds movement percentage must be between 1 and 100');
    }

    if (preferences.thresholds.predictionConfidenceChange < 1 || preferences.thresholds.predictionConfidenceChange > 100) {
      errors.push('Prediction confidence change must be between 1 and 100');
    }

    if (preferences.thresholds.minimumNotificationInterval < 1) {
      errors.push('Minimum notification interval must be at least 1 minute');
    }

    // Validate arrays
    if (!Array.isArray(preferences.followedFighters)) {
      errors.push('Followed fighters must be an array');
    }

    if (!Array.isArray(preferences.weightClasses)) {
      errors.push('Weight classes must be an array');
    }

    if (!Array.isArray(preferences.alertTypes)) {
      errors.push('Alert types must be an array');
    }

    if (!Array.isArray(preferences.deliveryMethods)) {
      errors.push('Delivery methods must be an array');
    }

    // Must have at least one delivery method if enabled
    if (preferences.enabled && preferences.deliveryMethods.length === 0) {
      errors.push('At least one delivery method is required when notifications are enabled');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Add fighter to user's followed list
   */
  async followFighter(userId: string, fighterId: string): Promise<void> {
    const preferences = await this.getUserPreferences(userId);
    if (!preferences) {
      throw new Error('User preferences not found');
    }

    if (!preferences.followedFighters.includes(fighterId)) {
      preferences.followedFighters.push(fighterId);
      await this.updateUserPreferences(preferences);
    }
  }

  /**
   * Remove fighter from user's followed list
   */
  async unfollowFighter(userId: string, fighterId: string): Promise<void> {
    const preferences = await this.getUserPreferences(userId);
    if (!preferences) {
      throw new Error('User preferences not found');
    }

    const index = preferences.followedFighters.indexOf(fighterId);
    if (index > -1) {
      preferences.followedFighters.splice(index, 1);
      await this.updateUserPreferences(preferences);
    }
  }

  /**
   * Update user's alert thresholds
   */
  async updateThresholds(
    userId: string, 
    thresholds: Partial<UserPreferences['thresholds']>
  ): Promise<void> {
    const preferences = await this.getUserPreferences(userId);
    if (!preferences) {
      throw new Error('User preferences not found');
    }

    preferences.thresholds = { ...preferences.thresholds, ...thresholds };
    await this.updateUserPreferences(preferences);
  }

  /**
   * Enable/disable notifications for user
   */
  async setNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
    const preferences = await this.getUserPreferences(userId);
    if (!preferences) {
      throw new Error('User preferences not found');
    }

    preferences.enabled = enabled;
    await this.updateUserPreferences(preferences);
  }

  /**
   * Get cached preferences if not expired
   */
  private getCachedPreferences(userId: string): UserPreferences | null {
    const expiry = this.cacheExpiry.get(userId);
    if (!expiry || Date.now() > expiry) {
      this.cache.delete(userId);
      this.cacheExpiry.delete(userId);
      return null;
    }

    return this.cache.get(userId) || null;
  }

  /**
   * Set cached preferences with expiry
   */
  private setCachedPreferences(userId: string, preferences: UserPreferences): void {
    this.cache.set(userId, preferences);
    this.cacheExpiry.set(userId, Date.now() + this.CACHE_TTL);
  }

  /**
   * Clear all cached preferences
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    // This would track hit/miss rates in a real implementation
    return {
      size: this.cache.size,
      hitRate: 0.85 // Mock hit rate
    };
  }
}