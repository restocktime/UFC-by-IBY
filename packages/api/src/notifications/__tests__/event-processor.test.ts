/**
 * Unit tests for EventProcessor
 */

import { EventProcessor, EventProcessorConfig } from '../event-processor';
import { NotificationEvent, UserPreferences, AlertType, NotificationPriority } from '@ufc-platform/shared';

describe('EventProcessor', () => {
  let processor: EventProcessor;
  let config: EventProcessorConfig;

  beforeEach(() => {
    config = {
      maxConcurrentEvents: 100,
      eventRetentionHours: 24,
      processingTimeoutMs: 5000,
      enableMetrics: true
    };
    processor = new EventProcessor(config);
  });

  afterEach(() => {
    processor.reset();
  });

  describe('Event Processing', () => {
    it('should process events and emit eventProcessed', async () => {
      const event: NotificationEvent = {
        id: 'test-event-1',
        type: 'odds_movement',
        fightId: 'fight-123',
        data: { oldOdds: 150, newOdds: 120 },
        priority: 'medium',
        timestamp: new Date()
      };

      const userPrefs: UserPreferences = {
        userId: 'user-123',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 5,
          minimumNotificationInterval: 15
        },
        enabled: true
      };

      await processor.updateUserPreferences('user-123', userPrefs);

      const processedEvents: any[] = [];
      processor.on('eventProcessed', (processedEvent) => {
        processedEvents.push(processedEvent);
      });

      await processor.addEvent(event);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(processedEvents).toHaveLength(1);
      expect(processedEvents[0].originalEvent.id).toBe('test-event-1');
      expect(processedEvents[0].targetUsers).toContain('user-123');
    });

    it('should filter events based on user preferences', async () => {
      const event: NotificationEvent = {
        id: 'test-event-2',
        type: 'injury_report',
        fighterId: 'fighter-456',
        data: { severity: 'minor' },
        priority: 'low',
        timestamp: new Date()
      };

      const userPrefs: UserPreferences = {
        userId: 'user-123',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'], // User doesn't want injury reports
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 5,
          minimumNotificationInterval: 15
        },
        enabled: true
      };

      await processor.updateUserPreferences('user-123', userPrefs);

      const processedEvents: any[] = [];
      processor.on('eventProcessed', (processedEvent) => {
        processedEvents.push(processedEvent);
      });

      await processor.addEvent(event);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(processedEvents).toHaveLength(0);
    });

    it('should handle events with specific userId', async () => {
      const event: NotificationEvent = {
        id: 'test-event-3',
        type: 'fight_update',
        fightId: 'fight-789',
        userId: 'user-456', // Specific user
        data: { status: 'cancelled' },
        priority: 'high',
        timestamp: new Date()
      };

      const userPrefs: UserPreferences = {
        userId: 'user-456',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['fight_update'],
        deliveryMethods: ['push'],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 5,
          minimumNotificationInterval: 15
        },
        enabled: true
      };

      await processor.updateUserPreferences('user-456', userPrefs);

      const processedEvents: any[] = [];
      processor.on('eventProcessed', (processedEvent) => {
        processedEvents.push(processedEvent);
      });

      await processor.addEvent(event);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(processedEvents).toHaveLength(1);
      expect(processedEvents[0].targetUsers).toEqual(['user-456']);
    });

    it('should respect disabled user preferences', async () => {
      const event: NotificationEvent = {
        id: 'test-event-4',
        type: 'odds_movement',
        fightId: 'fight-123',
        data: { oldOdds: 150, newOdds: 120 },
        priority: 'medium',
        timestamp: new Date()
      };

      const userPrefs: UserPreferences = {
        userId: 'user-123',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 5,
          minimumNotificationInterval: 15
        },
        enabled: false // Disabled
      };

      await processor.updateUserPreferences('user-123', userPrefs);

      const processedEvents: any[] = [];
      processor.on('eventProcessed', (processedEvent) => {
        processedEvents.push(processedEvent);
      });

      await processor.addEvent(event);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(processedEvents).toHaveLength(0);
    });
  });

  describe('Event Filtering', () => {
    it('should filter events by fighter preferences', async () => {
      const event: NotificationEvent = {
        id: 'test-event-5',
        type: 'fight_update',
        fighterId: 'fighter-123',
        data: { update: 'weight_cut_issues' },
        priority: 'medium',
        timestamp: new Date()
      };

      const userPrefs: UserPreferences = {
        userId: 'user-123',
        followedFighters: ['fighter-456'], // Different fighter
        weightClasses: [],
        alertTypes: ['fight_update'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 5,
          minimumNotificationInterval: 15
        },
        enabled: true
      };

      await processor.updateUserPreferences('user-123', userPrefs);

      const processedEvents: any[] = [];
      processor.on('eventProcessed', (processedEvent) => {
        processedEvents.push(processedEvent);
      });

      await processor.addEvent(event);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(processedEvents).toHaveLength(0);
    });

    it('should include events for followed fighters', async () => {
      const event: NotificationEvent = {
        id: 'test-event-6',
        type: 'fight_update',
        fighterId: 'fighter-123',
        data: { update: 'weight_cut_issues' },
        priority: 'medium',
        timestamp: new Date()
      };

      const userPrefs: UserPreferences = {
        userId: 'user-123',
        followedFighters: ['fighter-123'], // Matching fighter
        weightClasses: [],
        alertTypes: ['fight_update'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 5,
          minimumNotificationInterval: 15
        },
        enabled: true
      };

      await processor.updateUserPreferences('user-123', userPrefs);

      const processedEvents: any[] = [];
      processor.on('eventProcessed', (processedEvent) => {
        processedEvents.push(processedEvent);
      });

      await processor.addEvent(event);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(processedEvents).toHaveLength(1);
    });
  });

  describe('Queue Management', () => {
    it('should throw error when queue is full', async () => {
      const smallConfig: EventProcessorConfig = {
        ...config,
        maxConcurrentEvents: 1
      };
      const smallProcessor = new EventProcessor(smallConfig);

      const event1: NotificationEvent = {
        id: 'test-event-1',
        type: 'odds_movement',
        data: {},
        priority: 'medium',
        timestamp: new Date()
      };

      const event2: NotificationEvent = {
        id: 'test-event-2',
        type: 'odds_movement',
        data: {},
        priority: 'medium',
        timestamp: new Date()
      };

      // Fill the queue to capacity
      (smallProcessor as any).eventQueue.push(event1);
      
      await expect(smallProcessor.addEvent(event2)).rejects.toThrow('Event queue is full');
    });

    it('should emit eventQueued when event is added', async () => {
      const event: NotificationEvent = {
        id: 'test-event-7',
        type: 'odds_movement',
        data: {},
        priority: 'medium',
        timestamp: new Date()
      };

      const queuedEvents: any[] = [];
      processor.on('eventQueued', (queuedEvent) => {
        queuedEvents.push(queuedEvent);
      });

      await processor.addEvent(event);

      expect(queuedEvents).toHaveLength(1);
      expect(queuedEvents[0].id).toBe('test-event-7');
    });
  });

  describe('User Preferences Management', () => {
    it('should update user preferences and emit event', async () => {
      const userPrefs: UserPreferences = {
        userId: 'user-123',
        followedFighters: ['fighter-123'],
        weightClasses: ['Lightweight'],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 5,
          minimumNotificationInterval: 15
        },
        enabled: true
      };

      const updates: any[] = [];
      processor.on('userPreferencesUpdated', (update) => {
        updates.push(update);
      });

      await processor.updateUserPreferences('user-123', userPrefs);

      expect(updates).toHaveLength(1);
      expect(updates[0].userId).toBe('user-123');
      expect(updates[0].preferences).toEqual(userPrefs);
    });

    it('should remove user preferences and emit event', async () => {
      const userPrefs: UserPreferences = {
        userId: 'user-123',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 5,
          minimumNotificationInterval: 15
        },
        enabled: true
      };

      await processor.updateUserPreferences('user-123', userPrefs);

      const removals: any[] = [];
      processor.on('userPreferencesRemoved', (removal) => {
        removals.push(removal);
      });

      await processor.removeUserPreferences('user-123');

      expect(removals).toHaveLength(1);
      expect(removals[0].userId).toBe('user-123');
    });
  });

  describe('Metrics', () => {
    it('should track processing metrics', async () => {
      const event: NotificationEvent = {
        id: 'test-event-8',
        type: 'odds_movement',
        userId: 'user-123', // Specify user to ensure processing
        data: {},
        priority: 'medium',
        timestamp: new Date()
      };

      const userPrefs: UserPreferences = {
        userId: 'user-123',
        followedFighters: [],
        weightClasses: [],
        alertTypes: ['odds_movement'],
        deliveryMethods: ['email'],
        thresholds: {
          oddsMovementPercentage: 10,
          predictionConfidenceChange: 5,
          minimumNotificationInterval: 15
        },
        enabled: true
      };

      await processor.updateUserPreferences('user-123', userPrefs);
      
      // Listen for processing completion
      const processingPromise = new Promise(resolve => {
        processor.once('eventProcessed', resolve);
      });
      
      await processor.addEvent(event);
      
      // Wait for processing to complete
      await processingPromise;

      const metrics = processor.getMetrics();
      expect(metrics.eventsProcessed).toBe(1);
      // Just check that processing time is a number, not necessarily > 0 since it could be very fast
      expect(typeof metrics.averageProcessingTime).toBe('number');
    });

    it('should reset metrics when reset is called', async () => {
      const event: NotificationEvent = {
        id: 'test-event-9',
        type: 'odds_movement',
        data: {},
        priority: 'medium',
        timestamp: new Date()
      };

      await processor.addEvent(event);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      processor.reset();

      const metrics = processor.getMetrics();
      expect(metrics.eventsProcessed).toBe(0);
      expect(metrics.eventsFiltered).toBe(0);
      expect(metrics.processingErrors).toBe(0);
      expect(metrics.averageProcessingTime).toBe(0);
    });
  });
});