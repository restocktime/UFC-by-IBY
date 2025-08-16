/**
 * EventProcessor - Core event processing infrastructure for the notification system
 * 
 * Handles system events, applies user preferences filtering, and routes events
 * to appropriate notification channels.
 */

import { EventEmitter } from 'events';
import { 
  NotificationEvent, 
  UserPreferences, 
  EventFilter, 
  ProcessedEvent, 
  EventProcessingResult,
  NotificationPriority 
} from '@ufc-platform/shared';

export interface EventProcessorConfig {
  maxConcurrentEvents: number;
  eventRetentionHours: number;
  processingTimeoutMs: number;
  enableMetrics: boolean;
}

export class EventProcessor extends EventEmitter {
  private config: EventProcessorConfig;
  private eventQueue: NotificationEvent[] = [];
  private processing = false;
  private userPreferencesCache = new Map<string, UserPreferences>();
  private metrics = {
    eventsProcessed: 0,
    eventsFiltered: 0,
    processingErrors: 0,
    averageProcessingTime: 0
  };

  constructor(config: EventProcessorConfig) {
    super();
    this.config = config;
  }

  /**
   * Add an event to the processing queue
   */
  async addEvent(event: NotificationEvent): Promise<void> {
    if (this.eventQueue.length >= this.config.maxConcurrentEvents) {
      throw new Error('Event queue is full');
    }

    this.eventQueue.push(event);
    this.emit('eventQueued', event);

    if (!this.processing) {
      await this.processQueue();
    }
  }

  /**
   * Process all events in the queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    
    this.processing = true;
    
    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        if (event) {
          await this.processEvent(event);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a single event
   */
  private async processEvent(event: NotificationEvent): Promise<EventProcessingResult> {
    const startTime = Date.now();
    const result: EventProcessingResult = {
      eventId: event.id,
      processed: false,
      targetUserCount: 0,
      errors: [],
      processingTime: 0
    };

    try {
      // Apply event filters to determine target users
      const targetUsers = await this.getTargetUsers(event);
      
      if (targetUsers.length === 0) {
        this.metrics.eventsFiltered++;
        result.processed = true;
        result.processingTime = Date.now() - startTime;
        return result;
      }

      // Create processed event for each target user
      const processedEvents: ProcessedEvent[] = [];
      
      for (const userId of targetUsers) {
        const userPrefs = await this.getUserPreferences(userId);
        if (userPrefs && this.shouldNotifyUser(event, userPrefs)) {
          const processedEvent: ProcessedEvent = {
            originalEvent: event,
            targetUsers: [userId],
            filteredData: this.filterEventData(event, userPrefs),
            deliveryMethods: userPrefs.deliveryMethods,
            scheduledTime: this.calculateScheduledTime(event, userPrefs)
          };
          processedEvents.push(processedEvent);
        }
      }

      // Emit processed events for notification dispatcher
      for (const processedEvent of processedEvents) {
        this.emit('eventProcessed', processedEvent);
      }

      result.processed = true;
      result.targetUserCount = processedEvents.length;
      this.metrics.eventsProcessed++;

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      this.metrics.processingErrors++;
      this.emit('processingError', { event, error });
    }

    result.processingTime = Date.now() - startTime;
    this.updateAverageProcessingTime(result.processingTime);
    
    return result;
  }

  /**
   * Get target users for an event based on filters
   */
  private async getTargetUsers(event: NotificationEvent): Promise<string[]> {
    // If event has specific userId, return that user
    if (event.userId) {
      return [event.userId];
    }

    // Get all users who should receive this type of event
    const targetUsers: string[] = [];
    
    for (const [userId, preferences] of this.userPreferencesCache) {
      if (this.matchesEventFilter(event, this.createEventFilter(preferences))) {
        targetUsers.push(userId);
      }
    }

    return targetUsers;
  }

  /**
   * Check if event matches user's event filter
   */
  private matchesEventFilter(event: NotificationEvent, filter: EventFilter): boolean {
    // Check event type
    if (!filter.eventTypes.includes(event.type)) {
      return false;
    }

    // Check minimum priority
    const priorityLevels = { low: 0, medium: 1, high: 2, urgent: 3 };
    if (priorityLevels[event.priority] < priorityLevels[filter.minimumPriority]) {
      return false;
    }

    // Check fighter filter
    if (filter.fighterIds && event.fighterId && !filter.fighterIds.includes(event.fighterId)) {
      return false;
    }

    return true;
  }

  /**
   * Create event filter from user preferences
   */
  private createEventFilter(preferences: UserPreferences): EventFilter {
    return {
      userId: preferences.userId,
      eventTypes: preferences.alertTypes,
      fighterIds: preferences.followedFighters,
      weightClasses: preferences.weightClasses,
      minimumPriority: 'low' // Default minimum priority
    };
  }

  /**
   * Check if user should be notified based on preferences and rate limiting
   */
  private shouldNotifyUser(event: NotificationEvent, preferences: UserPreferences): boolean {
    if (!preferences.enabled) {
      return false;
    }

    // Check if user wants this type of alert
    if (!preferences.alertTypes.includes(event.type)) {
      return false;
    }

    // TODO: Implement rate limiting based on minimumNotificationInterval
    // This would check the last notification time for this user
    
    return true;
  }

  /**
   * Filter event data based on user preferences
   */
  private filterEventData(event: NotificationEvent, preferences: UserPreferences): any {
    // Create a filtered version of event data based on user preferences
    const filteredData = { ...event.data };
    
    // Add user-specific context
    filteredData.userPreferences = {
      deliveryMethods: preferences.deliveryMethods,
      thresholds: preferences.thresholds
    };

    return filteredData;
  }

  /**
   * Calculate when notification should be sent
   */
  private calculateScheduledTime(event: NotificationEvent, preferences: UserPreferences): Date | undefined {
    // For urgent events, send immediately
    if (event.priority === 'urgent') {
      return new Date();
    }

    // For other events, respect user's minimum notification interval
    // TODO: Implement logic to batch notifications based on user preferences
    return new Date();
  }

  /**
   * Update user preferences cache
   */
  async updateUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
    this.userPreferencesCache.set(userId, preferences);
    this.emit('userPreferencesUpdated', { userId, preferences });
  }

  /**
   * Get user preferences from cache or load from storage
   */
  private async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    return this.userPreferencesCache.get(userId) || null;
  }

  /**
   * Remove user from preferences cache
   */
  async removeUserPreferences(userId: string): Promise<void> {
    this.userPreferencesCache.delete(userId);
    this.emit('userPreferencesRemoved', { userId });
  }

  /**
   * Update average processing time metric
   */
  private updateAverageProcessingTime(processingTime: number): void {
    const totalEvents = this.metrics.eventsProcessed + this.metrics.processingErrors + this.metrics.eventsFiltered;
    if (totalEvents === 1) {
      this.metrics.averageProcessingTime = processingTime;
    } else if (totalEvents > 1) {
      this.metrics.averageProcessingTime = 
        (this.metrics.averageProcessingTime * (totalEvents - 1) + processingTime) / totalEvents;
    }
  }

  /**
   * Get processing metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Clear all cached data and reset metrics
   */
  reset(): void {
    this.eventQueue = [];
    this.userPreferencesCache.clear();
    this.metrics = {
      eventsProcessed: 0,
      eventsFiltered: 0,
      processingErrors: 0,
      averageProcessingTime: 0
    };
    this.processing = false;
  }
}