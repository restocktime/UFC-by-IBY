/**
 * Integration tests for the complete notification system
 */

import { vi } from 'vitest';
import { EventProcessor, EventProcessorConfig } from '../event-processor';
import { NotificationDispatcher, NotificationDispatcherConfig, NotificationChannel, NotificationPayload, DeliveryResult } from '../notification-dispatcher';
import { OddsMovementDetector, OddsMovementDetectorConfig, OddsSnapshot } from '../odds-movement-detector';
import { UserPreferencesService, UserPreferencesRepository } from '../user-preferences-service';
import { UserPreferences } from '@ufc-platform/shared';

// Mock notification channel
class MockEmailChannel implements NotificationChannel {
  type = 'email' as const;
  private deliveries: NotificationPayload[] = [];

  async send(notification: NotificationPayload): Promise<DeliveryResult> {
    this.deliveries.push(notification);
    return {
      success: true,
      messageId: `email-${Date.now()}`,
      deliveredAt: new Date()
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getDeliveries(): NotificationPayload[] {
    return this.deliveries;
  }

  clearDeliveries(): void {
    this.deliveries = [];
  }
}

// Mock user preferences repository
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
      if (prefs.alertTypes.includes(alertType) && prefs.enabled) {
        users.push(userId);
      }
    }
    return users;
  }

  async getUsersByFighter(fighterId: string): Promise<string[]> {
    const users: string[] = [];
    for (const [userId, prefs] of this.preferences) {
      if (prefs.followedFighters.includes(fighterId) && prefs.enabled) {
        users.push(userId);
      }
    }
    return users;
  }
}

describe('Notification System Integration', () => {
  let eventProcessor: EventProcessor;
  let notificationDispatcher: NotificationDispatcher;
  let oddsDetector: OddsMovementDetector;
  let userPreferencesService: UserPreferencesService;
  let mockEmailChannel: MockEmailChannel;
  let mockRepository: MockUserPreferencesRepository;

  beforeEach(async () => {
    // Set up user preferences service
    mockRepository = new MockUserPreferencesRepository();
    userPreferencesService = new UserPreferencesService(mockRepository);

    // Set up event processor
    const eventProcessorConfig: EventProcessorConfig = {
      maxConcurrentEvents: 100,
      eventRetentionHours: 24,
      processingTimeoutMs: 5000,
      enableMetrics: true
    };
    eventProcessor = new EventProcessor(eventProcessorConfig);

    // Set up notification dispatcher
    const dispatcherConfig: NotificationDispatcherConfig = {
      maxRetries: 3,
      retryDelayMs: 100,
      batchSize: 5,
      enableDeliveryTracking: true,
      defaultTemplates: {
        odds_movement: {
          subject: 'Odds Movement Alert',
          content: 'Odds moved for {{fightName}}: {{oldOdds}} → {{newOdds}} ({{percentageChange}}%)',
          variables: ['fightName', 'oldOdds', 'newOdds', 'percentageChange']
        }
      }
    };
    notificationDispatcher = new NotificationDispatcher(dispatcherConfig);

    // Set up email channel
    mockEmailChannel = new MockEmailChannel();
    notificationDispatcher.registerChannel(mockEmailChannel);

    // Set up odds movement detector
    const oddsDetectorConfig: OddsMovementDetectorConfig = {
      thresholds: {
        significantPercentage: 10,
        reversePercentage: 15,
        steamPercentage: 25,
        minimumTimeBetweenAlerts: 1, // 1 minute for testing
        minimumOddsValue: 100
      },
      enabledSportsbooks: ['DraftKings', 'FanDuel'],
      enableRealTimeDetection: false,
      batchProcessingInterval: 1000
    };
    oddsDetector = new OddsMovementDetector(oddsDetectorConfig);

    // Connect the components
    setupIntegration();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockEmailChannel.clearDeliveries();
    eventProcessor.reset();
    oddsDetector.clearHistory();
    userPreferencesService.clearCache();
  });

  function setupIntegration() {
    // Connect odds detector to event processor
    oddsDetector.on('alertTriggered', async (alertEvent) => {
      await eventProcessor.addEvent(alertEvent);
    });

    // Connect event processor to notification dispatcher
    eventProcessor.on('eventProcessed', async (processedEvent) => {
      await notificationDispatcher.dispatch(processedEvent);
    });
  }

  describe('End-to-End Odds Movement Alerts', () => {
    it('should deliver odds movement alert to subscribed users', async () => {
      // Set up user preferences
      const user1Prefs: UserPreferences = {
        userId: 'user-1',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 5,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      };

      const user2Prefs: UserPreferences = {
        userId: 'user-2',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['fight_update'], // Different alert type
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 5,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      };

      await userPreferencesService.updateUserPreferences(user1Prefs);
      await userPreferencesService.updateUserPreferences(user2Prefs);

      // Update event processor with user preferences
      await eventProcessor.updateUserPreferences('user-1', user1Prefs);
      await eventProcessor.updateUserPreferences('user-2', user2Prefs);

      // Simulate odds movement
      const snapshot1: OddsSnapshot = {
        fightId: 'fight-123',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      await oddsDetector.addOddsSnapshot(snapshot1);

      const snapshot2: OddsSnapshot = {
        fightId: 'fight-123',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -180, fighter2: 150 } // Significant movement
      };

      await oddsDetector.addOddsSnapshot(snapshot2);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that email was delivered to user-1 only
      const deliveries = mockEmailChannel.getDeliveries();
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].userId).toBe('user-1');
      expect(deliveries[0].subject).toBe('Odds Movement Alert');
    });

    it('should respect user thresholds for odds movement', async () => {
      // User with high threshold
      const userPrefs: UserPreferences = {
        userId: 'user-1',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 25, // High threshold
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      };

      await userPreferencesService.updateUserPreferences(userPrefs);
      await eventProcessor.updateUserPreferences('user-1', userPrefs);

      // Small odds movement (below user threshold)
      const snapshot1: OddsSnapshot = {
        fightId: 'fight-123',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      await oddsDetector.addOddsSnapshot(snapshot1);

      const snapshot2: OddsSnapshot = {
        fightId: 'fight-123',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -165, fighter2: 135 } // 10% movement, below user's 25% threshold
      };

      await oddsDetector.addOddsSnapshot(snapshot2);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not deliver notification due to user threshold
      const deliveries = mockEmailChannel.getDeliveries();
      expect(deliveries).toHaveLength(0);
    });

    it('should handle disabled users correctly', async () => {
      // Disabled user
      const userPrefs: UserPreferences = {
        userId: 'user-1',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 5,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: false // Disabled
      };

      await userPreferencesService.updateUserPreferences(userPrefs);
      await eventProcessor.updateUserPreferences('user-1', userPrefs);

      // Significant odds movement
      const snapshot1: OddsSnapshot = {
        fightId: 'fight-123',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      await oddsDetector.addOddsSnapshot(snapshot1);

      const snapshot2: OddsSnapshot = {
        fightId: 'fight-123',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -200, fighter2: 170 } // Large movement
      };

      await oddsDetector.addOddsSnapshot(snapshot2);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not deliver to disabled user
      const deliveries = mockEmailChannel.getDeliveries();
      expect(deliveries).toHaveLength(0);
    });

    it('should deliver to multiple users with different preferences', async () => {
      // User 1: Wants all odds movements
      const user1Prefs: UserPreferences = {
        userId: 'user-1',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 5,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      };

      // User 2: Only wants steam movements (high threshold)
      const user2Prefs: UserPreferences = {
        userId: 'user-2',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 25, // Only steam movements
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      };

      await userPreferencesService.updateUserPreferences(user1Prefs);
      await userPreferencesService.updateUserPreferences(user2Prefs);
      await eventProcessor.updateUserPreferences('user-1', user1Prefs);
      await eventProcessor.updateUserPreferences('user-2', user2Prefs);

      // Steam movement (should notify both users)
      const snapshot1: OddsSnapshot = {
        fightId: 'fight-123',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      await oddsDetector.addOddsSnapshot(snapshot1);

      const snapshot2: OddsSnapshot = {
        fightId: 'fight-123',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -200, fighter2: 170 } // 33% movement (steam)
      };

      await oddsDetector.addOddsSnapshot(snapshot2);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const deliveries = mockEmailChannel.getDeliveries();
      expect(deliveries).toHaveLength(2);
      expect(deliveries.map(d => d.userId).sort()).toEqual(['user-1', 'user-2']);
    });
  });

  describe('Fighter-Specific Alerts', () => {
    it('should deliver alerts to users following specific fighters', async () => {
      // User following specific fighter
      const userPrefs: UserPreferences = {
        userId: 'user-1',
        followedFighters: ['fighter-456'],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 5,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      };

      await userPreferencesService.updateUserPreferences(userPrefs);
      await eventProcessor.updateUserPreferences('user-1', userPrefs);

      // Create odds movement event for the followed fighter
      const alertEvent = {
        id: 'alert-1',
        type: 'odds_movement' as const,
        fightId: 'fight-123',
        fighterId: 'fighter-456', // Followed fighter
        data: {
          movementType: 'significant',
          sportsbook: 'DraftKings',
          oldOdds: { fighter1: -150, fighter2: 120 },
          newOdds: { fighter1: -180, fighter2: 150 }
        },
        priority: 'medium' as const,
        timestamp: new Date()
      };

      await eventProcessor.addEvent(alertEvent);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const deliveries = mockEmailChannel.getDeliveries();
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].userId).toBe('user-1');
    });

    it('should not deliver alerts for non-followed fighters', async () => {
      // User following specific fighter
      const userPrefs: UserPreferences = {
        userId: 'user-1',
        followedFighters: ['fighter-123'], // Different fighter
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 5,
          predictionConfidenceChange: 10,
          minimumNotificationInterval: 30
        },
        enabled: true
      };

      await userPreferencesService.updateUserPreferences(userPrefs);
      await eventProcessor.updateUserPreferences('user-1', userPrefs);

      // Create odds movement event for different fighter
      const alertEvent = {
        id: 'alert-1',
        type: 'odds_movement' as const,
        fightId: 'fight-123',
        fighterId: 'fighter-456', // Not followed
        data: {
          movementType: 'significant',
          sportsbook: 'DraftKings',
          oldOdds: { fighter1: -150, fighter2: 120 },
          newOdds: { fighter1: -180, fighter2: 150 }
        },
        priority: 'medium' as const,
        timestamp: new Date()
      };

      await eventProcessor.addEvent(alertEvent);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const deliveries = mockEmailChannel.getDeliveries();
      expect(deliveries).toHaveLength(0);
    });
  });

  describe('System Performance', () => {
    it('should handle multiple simultaneous odds movements', async () => {
      // Set up multiple users
      for (let i = 1; i <= 5; i++) {
        const userPrefs: UserPreferences = {
          userId: `user-${i}`,
          followedFighters: [],
          weightClasses: [],
          alertTypes: ['odds_movement'],
          deliveryMethods: ['email'],
          thresholds: {
            oddsMovementPercentage: 5,
            predictionConfidenceChange: 10,
            minimumNotificationInterval: 30
          },
          enabled: true
        };

        await userPreferencesService.updateUserPreferences(userPrefs);
        await eventProcessor.updateUserPreferences(`user-${i}`, userPrefs);
      }

      // Create multiple odds movements
      const movements = [];
      for (let i = 1; i <= 3; i++) {
        const snapshot1: OddsSnapshot = {
          fightId: `fight-${i}`,
          sportsbook: 'DraftKings',
          timestamp: new Date(),
          moneyline: { fighter1: -150, fighter2: 120 }
        };

        const snapshot2: OddsSnapshot = {
          fightId: `fight-${i}`,
          sportsbook: 'DraftKings',
          timestamp: new Date(Date.now() + 1000),
          moneyline: { fighter1: -180, fighter2: 150 }
        };

        movements.push(
          oddsDetector.addOddsSnapshot(snapshot1),
          oddsDetector.addOddsSnapshot(snapshot2)
        );
      }

      await Promise.all(movements);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const deliveries = mockEmailChannel.getDeliveries();
      expect(deliveries.length).toBe(15); // 3 fights × 5 users = 15 notifications
    });
  });
});