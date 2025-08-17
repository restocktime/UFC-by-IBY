import { EventEmitter } from 'events';
import { webSocketService, WebSocketMessage } from './websocket.service.js';
import { dataIngestionService } from '../ingestion/data-ingestion.service.js';
import { oddsMovementDetector } from '../notifications/odds-movement-detector.js';

export interface LiveUpdateEvent {
  type: 'odds_update' | 'fight_update' | 'prediction_update' | 'data_sync' | 'system_alert';
  entityType: 'fight' | 'fighter' | 'event' | 'odds' | 'prediction';
  entityId: string;
  data: any;
  sourceId?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: {
    previousValue?: any;
    changeType?: 'created' | 'updated' | 'deleted';
    confidence?: number;
  };
}

export interface UpdateSubscription {
  clientId: string;
  filters: {
    eventTypes?: string[];
    entityTypes?: string[];
    entityIds?: string[];
    sourceIds?: string[];
    priority?: string[];
  };
  createdAt: Date;
}

export class LiveUpdatesService extends EventEmitter {
  private subscriptions: Map<string, UpdateSubscription> = new Map();
  private updateQueue: LiveUpdateEvent[] = [];
  private processingQueue = false;
  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly BATCH_SIZE = 10;

  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * Initialize live updates service
   */
  public initialize(): void {
    // Setup WebSocket topics
    this.setupWebSocketTopics();
    
    this.emit('serviceInitialized');
  }

  /**
   * Subscribe client to live updates
   */
  public subscribeClient(clientId: string, filters: UpdateSubscription['filters']): void {
    const subscription: UpdateSubscription = {
      clientId,
      filters,
      createdAt: new Date()
    };

    this.subscriptions.set(clientId, subscription);

    // Subscribe to WebSocket topics based on filters
    this.subscribeToWebSocketTopics(clientId, filters);

    this.emit('clientSubscribed', { clientId, filters });
  }

  /**
   * Unsubscribe client from live updates
   */
  public unsubscribeClient(clientId: string): void {
    this.subscriptions.delete(clientId);
    this.emit('clientUnsubscribed', { clientId });
  }

  /**
   * Publish live update event
   */
  public publishUpdate(event: LiveUpdateEvent): void {
    // Add to queue
    if (this.updateQueue.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest events if queue is full
      this.updateQueue.shift();
    }

    this.updateQueue.push(event);

    // Process queue if not already processing
    if (!this.processingQueue) {
      this.processUpdateQueue();
    }

    this.emit('updatePublished', event);
  }

  /**
   * Process update queue
   */
  private async processUpdateQueue(): Promise<void> {
    if (this.processingQueue || this.updateQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    try {
      while (this.updateQueue.length > 0) {
        const batch = this.updateQueue.splice(0, this.BATCH_SIZE);
        await this.processBatch(batch);
      }
    } catch (error) {
      this.emit('queueProcessingError', error);
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Process batch of updates
   */
  private async processBatch(events: LiveUpdateEvent[]): Promise<void> {
    for (const event of events) {
      await this.processUpdate(event);
    }
  }

  /**
   * Process single update event
   */
  private async processUpdate(event: LiveUpdateEvent): Promise<void> {
    try {
      // Find matching subscriptions
      const matchingClients = this.findMatchingClients(event);

      if (matchingClients.length === 0) {
        return;
      }

      // Create WebSocket message
      const message: Omit<WebSocketMessage, 'timestamp'> = {
        type: 'live_update',
        data: {
          event: event.type,
          entityType: event.entityType,
          entityId: event.entityId,
          data: event.data,
          sourceId: event.sourceId,
          priority: event.priority,
          metadata: event.metadata
        }
      };

      // Send to matching clients
      let sentCount = 0;
      for (const clientId of matchingClients) {
        if (webSocketService.sendToClient(clientId, {
          ...message,
          timestamp: new Date(),
          clientId
        })) {
          sentCount++;
        }
      }

      this.emit('updateSent', {
        event,
        sentCount,
        totalMatching: matchingClients.length
      });

    } catch (error) {
      this.emit('updateProcessingError', { event, error });
    }
  }

  /**
   * Find clients that match the update event
   */
  private findMatchingClients(event: LiveUpdateEvent): string[] {
    const matchingClients: string[] = [];

    for (const [clientId, subscription] of this.subscriptions) {
      if (this.doesEventMatchSubscription(event, subscription)) {
        matchingClients.push(clientId);
      }
    }

    return matchingClients;
  }

  /**
   * Check if event matches subscription filters
   */
  private doesEventMatchSubscription(event: LiveUpdateEvent, subscription: UpdateSubscription): boolean {
    const { filters } = subscription;

    // Check event types
    if (filters.eventTypes && filters.eventTypes.length > 0) {
      if (!filters.eventTypes.includes(event.type)) {
        return false;
      }
    }

    // Check entity types
    if (filters.entityTypes && filters.entityTypes.length > 0) {
      if (!filters.entityTypes.includes(event.entityType)) {
        return false;
      }
    }

    // Check entity IDs
    if (filters.entityIds && filters.entityIds.length > 0) {
      if (!filters.entityIds.includes(event.entityId)) {
        return false;
      }
    }

    // Check source IDs
    if (filters.sourceIds && filters.sourceIds.length > 0) {
      if (!event.sourceId || !filters.sourceIds.includes(event.sourceId)) {
        return false;
      }
    }

    // Check priority
    if (filters.priority && filters.priority.length > 0) {
      if (!filters.priority.includes(event.priority)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Setup WebSocket topics
   */
  private setupWebSocketTopics(): void {
    // Define standard topics
    const topics = [
      'odds_updates',
      'fight_updates',
      'prediction_updates',
      'data_sync',
      'system_alerts'
    ];

    // Topics are created automatically when clients subscribe
    this.emit('topicsSetup', { topics });
  }

  /**
   * Subscribe client to WebSocket topics based on filters
   */
  private subscribeToWebSocketTopics(clientId: string, filters: UpdateSubscription['filters']): void {
    const topics: string[] = [];

    // Map event types to topics
    if (!filters.eventTypes || filters.eventTypes.includes('odds_update')) {
      topics.push('odds_updates');
    }
    if (!filters.eventTypes || filters.eventTypes.includes('fight_update')) {
      topics.push('fight_updates');
    }
    if (!filters.eventTypes || filters.eventTypes.includes('prediction_update')) {
      topics.push('prediction_updates');
    }
    if (!filters.eventTypes || filters.eventTypes.includes('data_sync')) {
      topics.push('data_sync');
    }
    if (!filters.eventTypes || filters.eventTypes.includes('system_alert')) {
      topics.push('system_alerts');
    }

    // Send subscription messages to client
    for (const topic of topics) {
      webSocketService.sendToClient(clientId, {
        type: 'auto_subscribe',
        data: { topic, filters },
        timestamp: new Date()
      });
    }
  }

  /**
   * Setup event listeners for data sources
   */
  private setupEventListeners(): void {
    // Listen to data ingestion events
    dataIngestionService.on('dataProcessingCompleted', (event) => {
      this.publishUpdate({
        type: 'data_sync',
        entityType: 'event',
        entityId: event.sourceId,
        data: {
          sourceId: event.sourceId,
          processedCount: event.processedCount,
          processingTime: event.processingTimeMs,
          averageQuality: event.averageQualityScore
        },
        sourceId: event.sourceId,
        priority: 'low'
      });
    });

    dataIngestionService.on('dataProcessingError', (event) => {
      this.publishUpdate({
        type: 'system_alert',
        entityType: 'event',
        entityId: event.sourceId,
        data: {
          error: event.error,
          sourceId: event.sourceId
        },
        sourceId: event.sourceId,
        priority: 'high'
      });
    });

    // Listen to odds movement events
    oddsMovementDetector.on('significantMovement', (event) => {
      this.publishUpdate({
        type: 'odds_update',
        entityType: 'odds',
        entityId: event.fightId,
        data: {
          fightId: event.fightId,
          sportsbook: event.sportsbook,
          previousOdds: event.previousOdds,
          currentOdds: event.currentOdds,
          movement: event.movement,
          movementType: event.movementType
        },
        priority: 'high',
        metadata: {
          previousValue: event.previousOdds,
          changeType: 'updated',
          confidence: event.confidence
        }
      });
    });

    // Listen to WebSocket client events
    webSocketService.on('clientConnected', (event) => {
      this.emit('clientConnected', event);
    });

    webSocketService.on('clientDisconnected', (event) => {
      this.unsubscribeClient(event.clientId);
      this.emit('clientDisconnected', event);
    });
  }

  /**
   * Get subscription statistics
   */
  public getSubscriptionStats(): any {
    const stats = {
      totalSubscriptions: this.subscriptions.size,
      queueSize: this.updateQueue.length,
      processingQueue: this.processingQueue,
      subscriptionsByType: new Map<string, number>(),
      subscriptionsByPriority: new Map<string, number>()
    };

    // Analyze subscriptions
    for (const subscription of this.subscriptions.values()) {
      // Count by event types
      if (subscription.filters.eventTypes) {
        for (const eventType of subscription.filters.eventTypes) {
          stats.subscriptionsByType.set(
            eventType,
            (stats.subscriptionsByType.get(eventType) || 0) + 1
          );
        }
      }

      // Count by priority
      if (subscription.filters.priority) {
        for (const priority of subscription.filters.priority) {
          stats.subscriptionsByPriority.set(
            priority,
            (stats.subscriptionsByPriority.get(priority) || 0) + 1
          );
        }
      }
    }

    return stats;
  }

  /**
   * Clear update queue
   */
  public clearQueue(): void {
    this.updateQueue = [];
    this.emit('queueCleared');
  }

  /**
   * Get queue status
   */
  public getQueueStatus(): any {
    return {
      size: this.updateQueue.length,
      maxSize: this.MAX_QUEUE_SIZE,
      processing: this.processingQueue,
      batchSize: this.BATCH_SIZE
    };
  }
}

// Singleton instance
export const liveUpdatesService = new LiveUpdatesService();