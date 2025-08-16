/**
 * Unit tests for UserPreferencesService
 */

import { vi } from 'vitest';
import { UserPreferencesService, UserPreferencesRepository } from '../user-preferences-service';
import { UserPreferences } from '@ufc-platform/shared';

// Mock repository
class MockUserPreferencesRepository implements UserPreferencesRepository {
  private preferences = new Map<string, UserPreferences>();

  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    return this.preferences.get(userId) || null;
  }

  async saveUserPreferences(preferences: UserPreferences): Promise<void> {
    this.preferences.set(preferences.userId, preferences);
  }

  async deleteUserPreferences(userId: string): Promise<void> {
    this.preferences.delete(userId);
  }

  async getUsersByAlertType(alertType: any): Promise<string[]> {
    const users: string[] = [];
    for (const [userId, prefs] of this.preferences) {
      if (prefs.alertTypes.includes(alertType)) {
        users.push(userId);
      }
    }
    return users;
  }

  async getUsersByFighter(fighterId: string): Promise<string[]> {
    const users: string[] = [];
    for (const [userId, prefs] of this.preferences) {
      if (prefs.followedFighters.includes(fighterId)) {
        users.push(userId);
      }
    }
    return users;
  }
}

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;
  let repository: MockUserPreferencesRepository;

  beforeEach(() => {
    repository = new MockUserPreferencesRepository();
    service = new UserPreferencesService(repository);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Preference Management', () => {
    it('should create default preferences', () => {
      const defaults = service.createDefaultPreferences('user-1');

      expect(defaults).toEqual({
        userId: 'user-1',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement', 'fight_update'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 15,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      });
    });

    it('should get user preferences from repository', async () => {
      const preferences: UserPreferences = {
        userId: 'user-1',
        followedFighters: ['fighter-1'],
        weightClasses: ['Lightweight'],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email', 'push'],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 5,
          minimumNotificationInterval: 15
        },
        enabled: true
      };

      await repository.saveUserPreferences(preferences);

      const retrieved = await service.getUserPreferences('user-1');
      expect(retrieved).toEqual(preferences);
    });

    it('should return null for non-existent user', async () => {
      const preferences = await service.getUserPreferences('non-existent');
      expect(preferences).toBeNull();
    });

    it('should update user preferences', async () => {
      const preferences: UserPreferences = {
        userId: 'user-1',
        followedFighters: ['fighter-1'],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 20,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      };

      const updateEvents: any[] = [];
      service.on('preferencesUpdated', (event) => updateEvents.push(event));

      await service.updateUserPreferences(preferences);

      expect(updateEvents).toHaveLength(1);
      expect(updateEvents[0]).toEqual(preferences);

      const retrieved = await service.getUserPreferences('user-1');
      expect(retrieved).toEqual(preferences);
    });

    it('should delete user preferences', async () => {
      const preferences = service.createDefaultPreferences('user-1');
      await service.updateUserPreferences(preferences);

      const deleteEvents: any[] = [];
      service.on('preferencesDeleted', (event) => deleteEvents.push(event));

      await service.deleteUserPreferences('user-1');

      expect(deleteEvents).toHaveLength(1);
      expect(deleteEvents[0].userId).toBe('user-1');

      const retrieved = await service.getUserPreferences('user-1');
      expect(retrieved).toBeNull();
    });
  });

  describe('Preference Validation', () => {
    it('should validate valid preferences', () => {
      const preferences: UserPreferences = {
        userId: 'user-1',
        followedFighters: ['fighter-1'],
        weightClasses: ['Lightweight'],
        alertTypes: ['odds_movement', 'fight_update'],
        deliveryMethods: ['email', 'push'],
        thresholds: {
          oddsMovementPercentage: 15,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      };

      const validation = service.validatePreferences(preferences);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid user ID', () => {
      const preferences = {
        userId: '',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 15,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      } as UserPreferences;

      const validation = service.validatePreferences(preferences);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('User ID is required and must be a string');
    });

    it('should reject invalid alert types', () => {
      const preferences = {
        userId: 'user-1',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['invalid_type'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 15,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      } as UserPreferences;

      const validation = service.validatePreferences(preferences);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Invalid alert type: invalid_type');
    });

    it('should reject invalid delivery methods', () => {
      const preferences = {
        userId: 'user-1',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['invalid_method'],
        thresholds: {
          oddsMovementPercentage: 15,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      } as UserPreferences;

      const validation = service.validatePreferences(preferences);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Invalid delivery method: invalid_method');
    });

    it('should reject invalid threshold values', () => {
      const preferences: UserPreferences = {
        userId: 'user-1',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 150, // Invalid: > 100
          predictionConfidenceChange: -5, // Invalid: < 1
          minimumNotificationInterval: 0 // Invalid: < 1
        },
        enabled: true
      };

      const validation = service.validatePreferences(preferences);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Odds movement percentage must be between 1 and 100');
      expect(validation.errors).toContain('Prediction confidence change must be between 1 and 100');
      expect(validation.errors).toContain('Minimum notification interval must be at least 1 minute');
    });

    it('should require delivery method when enabled', () => {
      const preferences: UserPreferences = {
        userId: 'user-1',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: [], // Empty when enabled
        thresholds: {
          oddsMovementPercentage: 15,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      };

      const validation = service.validatePreferences(preferences);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('At least one delivery method is required when notifications are enabled');
    });

    it('should throw error when updating invalid preferences', async () => {
      const invalidPreferences = {
        userId: '',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['invalid_type'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 15,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      } as UserPreferences;

      await expect(service.updateUserPreferences(invalidPreferences))
        .rejects.toThrow('Invalid preferences');
    });
  });

  describe('Fighter Following', () => {
    it('should add fighter to followed list', async () => {
      const preferences = service.createDefaultPreferences('user-1');
      await service.updateUserPreferences(preferences);

      await service.followFighter('user-1', 'fighter-1');

      const updated = await service.getUserPreferences('user-1');
      expect(updated?.followedFighters).toContain('fighter-1');
    });

    it('should not add duplicate fighters', async () => {
      const preferences = service.createDefaultPreferences('user-1');
      preferences.followedFighters = ['fighter-1'];
      await service.updateUserPreferences(preferences);

      await service.followFighter('user-1', 'fighter-1');

      const updated = await service.getUserPreferences('user-1');
      expect(updated?.followedFighters).toEqual(['fighter-1']);
    });

    it('should remove fighter from followed list', async () => {
      const preferences = service.createDefaultPreferences('user-1');
      preferences.followedFighters = ['fighter-1', 'fighter-2'];
      await service.updateUserPreferences(preferences);

      await service.unfollowFighter('user-1', 'fighter-1');

      const updated = await service.getUserPreferences('user-1');
      expect(updated?.followedFighters).toEqual(['fighter-2']);
    });

    it('should handle unfollowing non-existent fighter', async () => {
      const preferences = service.createDefaultPreferences('user-1');
      await service.updateUserPreferences(preferences);

      await service.unfollowFighter('user-1', 'non-existent');

      const updated = await service.getUserPreferences('user-1');
      expect(updated?.followedFighters).toEqual([]);
    });

    it('should throw error when following fighter for non-existent user', async () => {
      await expect(service.followFighter('non-existent', 'fighter-1'))
        .rejects.toThrow('User preferences not found');
    });
  });

  describe('Threshold Management', () => {
    it('should update user thresholds', async () => {
      const preferences = service.createDefaultPreferences('user-1');
      await service.updateUserPreferences(preferences);

      await service.updateThresholds('user-1', {
        oddsMovementPercentage: 25,
        minimumNotificationInterval: 60
      });

      const updated = await service.getUserPreferences('user-1');
      expect(updated?.thresholds.oddsMovementPercentage).toBe(25);
      expect(updated?.thresholds.minimumNotificationInterval).toBe(60);
      expect(updated?.thresholds.predictionConfidenceChange).toBe(10); // Unchanged
    });

    it('should enable/disable notifications', async () => {
      const preferences = service.createDefaultPreferences('user-1');
      await service.updateUserPreferences(preferences);

      await service.setNotificationsEnabled('user-1', false);

      const updated = await service.getUserPreferences('user-1');
      expect(updated?.enabled).toBe(false);
    });
  });

  describe('User Queries', () => {
    it('should get users by alert type', async () => {
      const user1Prefs = service.createDefaultPreferences('user-1');
      user1Prefs.alertTypes = ['odds_movement', 'fight_update'];

      const user2Prefs = service.createDefaultPreferences('user-2');
      user2Prefs.alertTypes = ['injury_report'];

      const user3Prefs = service.createDefaultPreferences('user-3');
      user3Prefs.alertTypes = ['odds_movement'];

      await service.updateUserPreferences(user1Prefs);
      await service.updateUserPreferences(user2Prefs);
      await service.updateUserPreferences(user3Prefs);

      const oddsUsers = await service.getUsersForAlertType('odds_movement');
      expect(oddsUsers).toEqual(['user-1', 'user-3']);

      const injuryUsers = await service.getUsersForAlertType('injury_report');
      expect(injuryUsers).toEqual(['user-2']);
    });

    it('should get users following fighter', async () => {
      const user1Prefs = service.createDefaultPreferences('user-1');
      user1Prefs.followedFighters = ['fighter-1', 'fighter-2'];

      const user2Prefs = service.createDefaultPreferences('user-2');
      user2Prefs.followedFighters = ['fighter-2'];

      const user3Prefs = service.createDefaultPreferences('user-3');
      user3Prefs.followedFighters = [];

      await service.updateUserPreferences(user1Prefs);
      await service.updateUserPreferences(user2Prefs);
      await service.updateUserPreferences(user3Prefs);

      const fighter1Followers = await service.getUsersFollowingFighter('fighter-1');
      expect(fighter1Followers).toEqual(['user-1']);

      const fighter2Followers = await service.getUsersFollowingFighter('fighter-2');
      expect(fighter2Followers).toEqual(['user-1', 'user-2']);
    });
  });

  describe('Caching', () => {
    it('should cache preferences after first load', async () => {
      const preferences = service.createDefaultPreferences('user-1');
      await repository.saveUserPreferences(preferences);

      // Spy on repository method
      const getSpy = vi.spyOn(repository, 'getUserPreferences');

      // First call should hit repository
      await service.getUserPreferences('user-1');
      expect(getSpy).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await service.getUserPreferences('user-1');
      expect(getSpy).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should clear cache', async () => {
      const preferences = service.createDefaultPreferences('user-1');
      await service.updateUserPreferences(preferences);

      // Load into cache
      await service.getUserPreferences('user-1');

      service.clearCache();

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should provide cache statistics', () => {
      const stats = service.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
    });
  });
});