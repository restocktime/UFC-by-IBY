import { UserPreferences, AlertType } from '@ufc-platform/shared';
import { DatabaseManager } from '../database/manager.js';
import { UserPreferencesRepository } from '../notifications/user-preferences-service.js';

export class MongoUserPreferencesRepository implements UserPreferencesRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Get user preferences by user ID
   */
  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserPreferences>('user_preferences');
    return await collection.findOne({ userId });
  }

  /**
   * Save user preferences
   */
  async saveUserPreferences(preferences: UserPreferences): Promise<void> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserPreferences>('user_preferences');
    
    await collection.replaceOne(
      { userId: preferences.userId },
      preferences,
      { upsert: true }
    );
  }

  /**
   * Delete user preferences
   */
  async deleteUserPreferences(userId: string): Promise<void> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserPreferences>('user_preferences');
    await collection.deleteOne({ userId });
  }

  /**
   * Get users who have enabled a specific alert type
   */
  async getUsersByAlertType(alertType: AlertType): Promise<string[]> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserPreferences>('user_preferences');
    
    const users = await collection.find({
      enabled: true,
      alertTypes: alertType
    }).toArray();

    return users.map(user => user.userId);
  }

  /**
   * Get users who follow a specific fighter
   */
  async getUsersByFighter(fighterId: string): Promise<string[]> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserPreferences>('user_preferences');
    
    const users = await collection.find({
      enabled: true,
      followedFighters: fighterId
    }).toArray();

    return users.map(user => user.userId);
  }

  /**
   * Get users by weight class interest
   */
  async getUsersByWeightClass(weightClass: string): Promise<string[]> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserPreferences>('user_preferences');
    
    const users = await collection.find({
      enabled: true,
      weightClasses: weightClass
    }).toArray();

    return users.map(user => user.userId);
  }

  /**
   * Get users by delivery method
   */
  async getUsersByDeliveryMethod(deliveryMethod: string): Promise<string[]> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserPreferences>('user_preferences');
    
    const users = await collection.find({
      enabled: true,
      deliveryMethods: deliveryMethod
    }).toArray();

    return users.map(user => user.userId);
  }

  /**
   * Get all active users (for bulk operations)
   */
  async getActiveUsers(): Promise<UserPreferences[]> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserPreferences>('user_preferences');
    
    return await collection.find({ enabled: true }).toArray();
  }

  /**
   * Bulk update preferences for multiple users
   */
  async bulkUpdatePreferences(updates: Array<{ userId: string; preferences: Partial<UserPreferences> }>): Promise<void> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserPreferences>('user_preferences');
    
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { userId: update.userId },
        update: { $set: update.preferences }
      }
    }));

    if (bulkOps.length > 0) {
      await collection.bulkWrite(bulkOps);
    }
  }

  /**
   * Get preferences statistics
   */
  async getPreferencesStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    alertTypeDistribution: Record<AlertType, number>;
    deliveryMethodDistribution: Record<string, number>;
  }> {
    const db = this.dbManager.getMongoDB().getDb();
    const collection = db.collection<UserPreferences>('user_preferences');
    
    const [totalUsers, activeUsers, alertStats, deliveryStats] = await Promise.all([
      collection.countDocuments(),
      collection.countDocuments({ enabled: true }),
      collection.aggregate([
        { $match: { enabled: true } },
        { $unwind: '$alertTypes' },
        { $group: { _id: '$alertTypes', count: { $sum: 1 } } }
      ]).toArray(),
      collection.aggregate([
        { $match: { enabled: true } },
        { $unwind: '$deliveryMethods' },
        { $group: { _id: '$deliveryMethods', count: { $sum: 1 } } }
      ]).toArray()
    ]);

    const alertTypeDistribution = alertStats.reduce((acc, stat) => {
      acc[stat._id as AlertType] = stat.count;
      return acc;
    }, {} as Record<AlertType, number>);

    const deliveryMethodDistribution = deliveryStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalUsers,
      activeUsers,
      alertTypeDistribution,
      deliveryMethodDistribution
    };
  }
}