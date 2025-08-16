/**
 * EventQueue - Redis Streams-based event queue system
 * 
 * Provides reliable event queuing with persistence, consumer groups,
 * and automatic retry mechanisms.
 */

import Redis from 'ioredis';
import { NotificationEvent } from '@ufc-platform/shared';

export interface EventQueueConfig {
  redisUrl: string;
  streamName: string;
  consumerGroup: string;
  consumerName: string;
  maxRetries: number;
  retryDelayMs: number;
  batchSize: number;
  blockTimeMs: number;
}

export interface QueuedEvent {
  id: string;
  event: NotificationEvent;
  attempts: number;
  lastAttempt: Date;
  nextRetry?: Date;
}

export class EventQueue {
  private redis: Redis;
  private config: EventQueueConfig;
  private isConsuming = false;
  private consumerCallbacks = new Map<string, (event: NotificationEvent) => Promise<void>>();

  constructor(config: EventQueueConfig) {
    this.config = config;
    this.redis = new Redis(config.redisUrl);
  }

  /**
   * Initialize the event queue and consumer group
   */
  async initialize(): Promise<void> {
    try {
      // Create consumer group if it doesn't exist
      await this.redis.xgroup(
        'CREATE',
        this.config.streamName,
        this.config.consumerGroup,
        '$',
        'MKSTREAM'
      );
    } catch (error) {
      // Consumer group might already exist, which is fine
      if (!error.message.includes('BUSYGROUP')) {
        throw error;
      }
    }
  }

  /**
   * Add an event to the queue
   */
  async enqueue(event: NotificationEvent): Promise<string> {
    const eventData = {
      id: event.id,
      type: event.type,
      fightId: event.fightId || '',
      fighterId: event.fighterId || '',
      data: JSON.stringify(event.data),
      priority: event.priority,
      timestamp: event.timestamp.toISOString(),
      userId: event.userId || '',
      attempts: '0'
    };

    const messageId = await this.redis.xadd(
      this.config.streamName,
      '*',
      ...Object.entries(eventData).flat()
    );

    return messageId;
  }

  /**
   * Start consuming events from the queue
   */
  async startConsuming(): Promise<void> {
    if (this.isConsuming) {
      return;
    }

    this.isConsuming = true;
    
    // Process any pending messages first
    await this.processPendingMessages();
    
    // Start consuming new messages
    while (this.isConsuming) {
      try {
        await this.consumeBatch();
      } catch (error) {
        console.error('Error consuming events:', error);
        await this.sleep(this.config.retryDelayMs);
      }
    }
  }

  /**
   * Stop consuming events
   */
  stopConsuming(): void {
    this.isConsuming = false;
  }

  /**
   * Register a callback for processing events
   */
  onEvent(eventType: string, callback: (event: NotificationEvent) => Promise<void>): void {
    this.consumerCallbacks.set(eventType, callback);
  }

  /**
   * Remove event callback
   */
  removeEventCallback(eventType: string): void {
    this.consumerCallbacks.delete(eventType);
  }

  /**
   * Consume a batch of events
   */
  private async consumeBatch(): Promise<void> {
    const results = await this.redis.xreadgroup(
      'GROUP',
      this.config.consumerGroup,
      this.config.consumerName,
      'COUNT',
      this.config.batchSize,
      'BLOCK',
      this.config.blockTimeMs,
      'STREAMS',
      this.config.streamName,
      '>'
    );

    if (!results || results.length === 0) {
      return;
    }

    const [streamName, messages] = results[0];
    
    for (const [messageId, fields] of messages) {
      await this.processMessage(messageId, fields);
    }
  }

  /**
   * Process pending messages that weren't acknowledged
   */
  private async processPendingMessages(): Promise<void> {
    const pendingResults = await this.redis.xpending(
      this.config.streamName,
      this.config.consumerGroup,
      '-',
      '+',
      100
    );

    if (!pendingResults || pendingResults.length === 0) {
      return;
    }

    for (const pendingInfo of pendingResults) {
      const messageId = pendingInfo[0];
      const consumerName = pendingInfo[1];
      
      // Claim the message if it's from this consumer or has been idle too long
      if (consumerName === this.config.consumerName) {
        const claimedMessages = await this.redis.xclaim(
          this.config.streamName,
          this.config.consumerGroup,
          this.config.consumerName,
          60000, // 1 minute idle time
          messageId
        );

        for (const [claimedId, fields] of claimedMessages) {
          await this.processMessage(claimedId, fields);
        }
      }
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(messageId: string, fields: string[]): Promise<void> {
    try {
      const eventData = this.parseEventFields(fields);
      const event = this.reconstructEvent(eventData);
      
      // Find appropriate callback
      const callback = this.consumerCallbacks.get(event.type);
      if (!callback) {
        console.warn(`No callback registered for event type: ${event.type}`);
        await this.acknowledgeMessage(messageId);
        return;
      }

      // Process the event
      await callback(event);
      
      // Acknowledge successful processing
      await this.acknowledgeMessage(messageId);
      
    } catch (error) {
      console.error(`Error processing message ${messageId}:`, error);
      await this.handleProcessingError(messageId, fields, error);
    }
  }

  /**
   * Parse event fields from Redis stream message
   */
  private parseEventFields(fields: string[]): Record<string, string> {
    const eventData: Record<string, string> = {};
    
    for (let i = 0; i < fields.length; i += 2) {
      eventData[fields[i]] = fields[i + 1];
    }
    
    return eventData;
  }

  /**
   * Reconstruct NotificationEvent from parsed data
   */
  private reconstructEvent(eventData: Record<string, string>): NotificationEvent {
    return {
      id: eventData.id,
      type: eventData.type as any,
      fightId: eventData.fightId || undefined,
      fighterId: eventData.fighterId || undefined,
      data: JSON.parse(eventData.data),
      priority: eventData.priority as any,
      timestamp: new Date(eventData.timestamp),
      userId: eventData.userId || undefined
    };
  }

  /**
   * Acknowledge message processing
   */
  private async acknowledgeMessage(messageId: string): Promise<void> {
    await this.redis.xack(this.config.streamName, this.config.consumerGroup, messageId);
  }

  /**
   * Handle processing errors with retry logic
   */
  private async handleProcessingError(
    messageId: string, 
    fields: string[], 
    error: any
  ): Promise<void> {
    const eventData = this.parseEventFields(fields);
    const attempts = parseInt(eventData.attempts || '0') + 1;

    if (attempts >= this.config.maxRetries) {
      console.error(`Max retries exceeded for message ${messageId}, moving to dead letter queue`);
      await this.moveToDeadLetterQueue(messageId, eventData, error);
      await this.acknowledgeMessage(messageId);
    } else {
      // Update attempt count and schedule retry
      eventData.attempts = attempts.toString();
      eventData.lastError = error.message;
      
      // Re-queue with updated attempt count
      await this.redis.xadd(
        this.config.streamName,
        '*',
        ...Object.entries(eventData).flat()
      );
      
      await this.acknowledgeMessage(messageId);
    }
  }

  /**
   * Move failed message to dead letter queue
   */
  private async moveToDeadLetterQueue(
    messageId: string, 
    eventData: Record<string, string>, 
    error: any
  ): Promise<void> {
    const deadLetterStream = `${this.config.streamName}:dead-letter`;
    
    await this.redis.xadd(
      deadLetterStream,
      '*',
      'originalMessageId', messageId,
      'error', error.message,
      'timestamp', new Date().toISOString(),
      ...Object.entries(eventData).flat()
    );
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    streamLength: number;
    consumerGroupInfo: any;
    pendingCount: number;
  }> {
    const streamLength = await this.redis.xlen(this.config.streamName);
    
    const consumerGroupInfo = await this.redis.xinfo(
      'GROUPS',
      this.config.streamName
    );
    
    const pendingInfo = await this.redis.xpending(
      this.config.streamName,
      this.config.consumerGroup
    );
    
    return {
      streamLength,
      consumerGroupInfo,
      pendingCount: pendingInfo ? pendingInfo[0] : 0
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.stopConsuming();
    await this.redis.quit();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}