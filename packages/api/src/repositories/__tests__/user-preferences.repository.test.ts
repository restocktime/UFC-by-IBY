import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { MongoUserPreferencesRepository } from '../user-preferences.repository.js';
import { DatabaseManager } from '../../database/manager.js';
import { UserPreferences, AlertType } from '@ufc-platform/shared';

describe('MongoUserPreferencesRepository', () => {
  let repository: MongoUserPreferencesRepository;
  let mockDbManager: DatabaseManager;
  let mockCollection: any;
  let mockDb: any;

  const mockPreferences: UserPreferences = {
    userId: 'user-123',
    followedFighters: ['fighter-1', 'fighter-2'],
    weightClasses: ['lightweight', 'welterweight'],
    alertTypes: ['odds_movement', 'fight_update'],
    deliveryMethods: ['email', 'push'],
    thresholds: {
      oddsMovementPercentage: 15,
      predictionConfidenceChange: 10,
      injuryReportSeverity: 'major',
      minimumNotificationInterval: 30
    },
    timezone: 'America/New_York',
    enabled: true
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock database collection
    mockCollection = {
      findOne: vi.fn(),
      find: vi.fn().mockReturnThis(),
      toArray: vi.fn(),
      replaceOne: vi.fn(),
      deleteOne: vi.fn(),
      countDocuments: vi.fn(),
      aggregate: vi.fn().mockReturnThis(),
      bulkWrite: vi.fn()
    };

    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection)
    };

    mockDbManager = {
      getMongoDB: vi.fn().mockReturnValue({
        getDb: vi.fn().mockReturnValue(mockDb)
      })
    } as any;

    repository = new MongoUserPreferencesRepository(mockDbManager);
  });

  describe('getUserPreferences', () => {
    it('should return user preferences when found', async () => {
      mockCollection.findOne.mockResolvedValue(mockPreferences);

      const result = await repository.getUserPreferences('user-123');

      expect(result).toEqual(mockPreferences);
      expect(mockCollection.findOne).toHaveBeenCalledWith({ userId: 'user-123' });
    });

    it('should return null when user preferences not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await repository.getUserPreferences('nonexistent-user');

      expect(result).toBeNull();
    });
  });

  describe('saveUserPreferences', () => {
    it('should save user preferences with upsert', async () => {
      mockCollection.replaceOne.mockResolvedValue({ acknowledged: true });

      await repository.saveUserPreferences(mockPreferences);

      expect(mockCollection.replaceOne).toHaveBeenCalledWith(
        { userId: 'user-123' },
        mockPreferences,
        { upsert: true }
      );
    });
  });

  describe('deleteUserPreferences', () => {
    it('should delete user preferences', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await repository.deleteUserPreferences('user-123');

      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ userId: 'user-123' });
    });
  });

  describe('getUsersByAlertType', () => {
    it('should return users with specific alert type enabled', async () => {
      const mockUsers = [
        { userId: 'user-1', alertTypes: ['odds_movement'], enabled: true },
        { userId: 'user-2', alertTypes: ['odds_movement', 'fight_update'], enabled: true }
      ];
      mockCollection.toArray.mockResolvedValue(mockUsers);

      const result = await repository.getUsersByAlertType('odds_movement');

      expect(result).toEqual(['user-1', 'user-2']);
      expect(mockCollection.find).toHaveBeenCalledWith({
        enabled: true,
        alertTypes: 'odds_movement'
      });
    });

    it('should return empty array when no users found', async () => {
      mockCollection.toArray.mockResolvedValue([]);

      const result = await repository.getUsersByAlertType('odds_movement');

      expect(result).toEqual([]);
    });
  });

  describe('getUsersByFighter', () => {
    it('should return users following specific fighter', async () => {
      const mockUsers = [
        { userId: 'user-1', followedFighters: ['fighter-1'], enabled: true },
        { userId: 'user-2', followedFighters: ['fighter-1', 'fighter-2'], enabled: true }
      ];
      mockCollection.toArray.mockResolvedValue(mockUsers);

      const result = await repository.getUsersByFighter('fighter-1');

      expect(result).toEqual(['user-1', 'user-2']);
      expect(mockCollection.find).toHaveBeenCalledWith({
        enabled: true,
        followedFighters: 'fighter-1'
      });
    });
  });

  describe('getUsersByWeightClass', () => {
    it('should return users interested in specific weight class', async () => {
      const mockUsers = [
        { userId: 'user-1', weightClasses: ['lightweight'], enabled: true },
        { userId: 'user-2', weightClasses: ['lightweight', 'welterweight'], enabled: true }
      ];
      mockCollection.toArray.mockResolvedValue(mockUsers);

      const result = await repository.getUsersByWeightClass('lightweight');

      expect(result).toEqual(['user-1', 'user-2']);
      expect(mockCollection.find).toHaveBeenCalledWith({
        enabled: true,
        weightClasses: 'lightweight'
      });
    });
  });

  describe('getUsersByDeliveryMethod', () => {
    it('should return users with specific delivery method', async () => {
      const mockUsers = [
        { userId: 'user-1', deliveryMethods: ['email'], enabled: true },
        { userId: 'user-2', deliveryMethods: ['email', 'push'], enabled: true }
      ];
      mockCollection.toArray.mockResolvedValue(mockUsers);

      const result = await repository.getUsersByDeliveryMethod('email');

      expect(result).toEqual(['user-1', 'user-2']);
      expect(mockCollection.find).toHaveBeenCalledWith({
        enabled: true,
        deliveryMethods: 'email'
      });
    });
  });

  describe('getActiveUsers', () => {
    it('should return all active users', async () => {
      const mockUsers = [mockPreferences];
      mockCollection.toArray.mockResolvedValue(mockUsers);

      const result = await repository.getActiveUsers();

      expect(result).toEqual(mockUsers);
      expect(mockCollection.find).toHaveBeenCalledWith({ enabled: true });
    });
  });

  describe('bulkUpdatePreferences', () => {
    it('should perform bulk update operations', async () => {
      const updates = [
        { userId: 'user-1', preferences: { enabled: false } },
        { userId: 'user-2', preferences: { timezone: 'UTC' } }
      ];

      mockCollection.bulkWrite.mockResolvedValue({ acknowledged: true });

      await repository.bulkUpdatePreferences(updates);

      expect(mockCollection.bulkWrite).toHaveBeenCalledWith([
        {
          updateOne: {
            filter: { userId: 'user-1' },
            update: { $set: { enabled: false } }
          }
        },
        {
          updateOne: {
            filter: { userId: 'user-2' },
            update: { $set: { timezone: 'UTC' } }
          }
        }
      ]);
    });

    it('should handle empty updates array', async () => {
      await repository.bulkUpdatePreferences([]);

      expect(mockCollection.bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe('getPreferencesStats', () => {
    it('should return preferences statistics', async () => {
      const mockAlertStats = [
        { _id: 'odds_movement', count: 5 },
        { _id: 'fight_update', count: 3 }
      ];

      const mockDeliveryStats = [
        { _id: 'email', count: 8 },
        { _id: 'push', count: 2 }
      ];

      mockCollection.countDocuments
        .mockResolvedValueOnce(10) // total users
        .mockResolvedValueOnce(8); // active users

      mockCollection.toArray
        .mockResolvedValueOnce(mockAlertStats)
        .mockResolvedValueOnce(mockDeliveryStats);

      const result = await repository.getPreferencesStats();

      expect(result).toEqual({
        totalUsers: 10,
        activeUsers: 8,
        alertTypeDistribution: {
          odds_movement: 5,
          fight_update: 3
        },
        deliveryMethodDistribution: {
          email: 8,
          push: 2
        }
      });
    });

    it('should handle empty statistics', async () => {
      mockCollection.countDocuments
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      mockCollection.toArray
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await repository.getPreferencesStats();

      expect(result).toEqual({
        totalUsers: 0,
        activeUsers: 0,
        alertTypeDistribution: {},
        deliveryMethodDistribution: {}
      });
    });
  });
});