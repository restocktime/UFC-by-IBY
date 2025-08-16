/**
 * NotificationDispatcher - Multi-channel notification delivery system
 * 
 * Handles delivery of notifications through various channels (email, push, SMS)
 * with templating, retry logic, and delivery tracking.
 */

import { EventEmitter } from 'events';
import { 
  ProcessedEvent, 
  DeliveryMethod, 
  NotificationPriority,
  UserPreferences 
} from '@ufc-platform/shared';

export interface NotificationChannel {
  type: DeliveryMethod;
  send(notification: NotificationPayload): Promise<DeliveryResult>;
  isAvailable(): Promise<boolean>;
}

export interface NotificationPayload {
  id: string;
  userId: string;
  subject: string;
  content: string;
  priority: NotificationPriority;
  metadata: Record<string, any>;
  templateData: Record<string, any>;
}

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveredAt?: Date;
  retryAfter?: number; // seconds
}

export interface DeliveryAttempt {
  id: string;
  notificationId: string;
  channel: DeliveryMethod;
  attempt: number;
  result: DeliveryResult;
  timestamp: Date;
}

export interface NotificationDispatcherConfig {
  maxRetries: number;
  retryDelayMs: number;
  batchSize: number;
  enableDeliveryTracking: boolean;
  defaultTemplates: Record<string, NotificationTemplate>;
}

export interface NotificationTemplate {
  subject: string;
  content: string;
  variables: string[];
}

export class NotificationDispatcher extends EventEmitter {
  private config: NotificationDispatcherConfig;
  private channels = new Map<DeliveryMethod, NotificationChannel>();
  private deliveryQueue: ProcessedEvent[] = [];
  private deliveryHistory = new Map<string, DeliveryAttempt[]>();
  private templates = new Map<string, NotificationTemplate>();
  private processing = false;

  constructor(config: NotificationDispatcherConfig) {
    super();
    this.config = config;
    this.loadDefaultTemplates();
  }

  /**
   * Register a notification channel
   */
  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.type, channel);
    this.emit('channelRegistered', { type: channel.type });
  }

  /**
   * Remove a notification channel
   */
  removeChannel(type: DeliveryMethod): void {
    this.channels.delete(type);
    this.emit('channelRemoved', { type });
  }

  /**
   * Add a processed event to the delivery queue
   */
  async dispatch(processedEvent: ProcessedEvent): Promise<void> {
    this.deliveryQueue.push(processedEvent);
    this.emit('eventQueued', processedEvent);

    if (!this.processing) {
      await this.processDeliveryQueue();
    }
  }

  /**
   * Process the delivery queue
   */
  private async processDeliveryQueue(): Promise<void> {
    if (this.processing) return;

    this.processing = true;

    try {
      while (this.deliveryQueue.length > 0) {
        const batch = this.deliveryQueue.splice(0, this.config.batchSize);
        await Promise.all(batch.map(event => this.deliverEvent(event)));
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Deliver a single event to all specified channels
   */
  private async deliverEvent(processedEvent: ProcessedEvent): Promise<void> {
    const { originalEvent, targetUsers, deliveryMethods, filteredData } = processedEvent;

    for (const userId of targetUsers) {
      for (const method of deliveryMethods) {
        await this.deliverToChannel(originalEvent.id, userId, method, filteredData);
      }
    }
  }

  /**
   * Deliver notification to a specific channel
   */
  private async deliverToChannel(
    eventId: string,
    userId: string,
    method: DeliveryMethod,
    data: any
  ): Promise<void> {
    const channel = this.channels.get(method);
    if (!channel) {
      this.emit('deliveryError', {
        eventId,
        userId,
        method,
        error: `Channel ${method} not registered`
      });
      return;
    }

    // Check if channel is available
    const isAvailable = await channel.isAvailable();
    if (!isAvailable) {
      this.emit('deliveryError', {
        eventId,
        userId,
        method,
        error: `Channel ${method} is not available`
      });
      return;
    }

    // Create notification payload
    const payload = await this.createNotificationPayload(eventId, userId, data);
    
    // Attempt delivery with retries
    await this.attemptDelivery(eventId, userId, channel, payload);
  }

  /**
   * Attempt delivery with retry logic
   */
  private async attemptDelivery(
    eventId: string,
    userId: string,
    channel: NotificationChannel,
    payload: NotificationPayload,
    attempt: number = 1
  ): Promise<void> {
    try {
      const result = await channel.send(payload);
      
      const deliveryAttempt: DeliveryAttempt = {
        id: `${eventId}-${userId}-${channel.type}-${attempt}`,
        notificationId: payload.id,
        channel: channel.type,
        attempt,
        result,
        timestamp: new Date()
      };

      this.recordDeliveryAttempt(deliveryAttempt);

      if (result.success) {
        this.emit('deliverySuccess', {
          eventId,
          userId,
          channel: channel.type,
          messageId: result.messageId,
          attempt
        });
      } else {
        await this.handleDeliveryFailure(eventId, userId, channel, payload, attempt, result);
      }

    } catch (error) {
      const failureResult: DeliveryResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      const deliveryAttempt: DeliveryAttempt = {
        id: `${eventId}-${userId}-${channel.type}-${attempt}`,
        notificationId: payload.id,
        channel: channel.type,
        attempt,
        result: failureResult,
        timestamp: new Date()
      };

      this.recordDeliveryAttempt(deliveryAttempt);
      await this.handleDeliveryFailure(eventId, userId, channel, payload, attempt, failureResult);
    }
  }

  /**
   * Handle delivery failure with retry logic
   */
  private async handleDeliveryFailure(
    eventId: string,
    userId: string,
    channel: NotificationChannel,
    payload: NotificationPayload,
    attempt: number,
    result: DeliveryResult
  ): Promise<void> {
    if (attempt >= this.config.maxRetries) {
      this.emit('deliveryFailed', {
        eventId,
        userId,
        channel: channel.type,
        error: result.error,
        finalAttempt: attempt
      });
      return;
    }

    // Calculate retry delay
    const retryDelay = result.retryAfter 
      ? result.retryAfter * 1000 
      : this.config.retryDelayMs * Math.pow(2, attempt - 1);

    // Schedule retry
    setTimeout(async () => {
      await this.attemptDelivery(eventId, userId, channel, payload, attempt + 1);
    }, retryDelay);

    this.emit('deliveryRetry', {
      eventId,
      userId,
      channel: channel.type,
      attempt,
      retryDelay
    });
  }

  /**
   * Create notification payload from event data
   */
  private async createNotificationPayload(
    eventId: string,
    userId: string,
    data: any
  ): Promise<NotificationPayload> {
    const template = this.getTemplate(data.type || 'default');
    
    return {
      id: `${eventId}-${userId}-${Date.now()}`,
      userId,
      subject: this.renderTemplate(template.subject, data),
      content: this.renderTemplate(template.content, data),
      priority: data.priority || 'medium',
      metadata: {
        eventId,
        eventType: data.type,
        timestamp: new Date().toISOString()
      },
      templateData: data
    };
  }

  /**
   * Get notification template
   */
  private getTemplate(type: string): NotificationTemplate {
    const template = this.templates.get(type) || this.templates.get('default');
    if (!template) {
      // Fallback template if none found
      return {
        subject: 'UFC Alert',
        content: 'You have a new notification',
        variables: []
      };
    }
    return template;
  }

  /**
   * Render template with data
   */
  private renderTemplate(template: string, data: any): string {
    let rendered = template;
    
    // Simple template variable replacement
    Object.keys(data).forEach(key => {
      const placeholder = `{{${key}}}`;
      const value = data[key];
      rendered = rendered.replace(new RegExp(placeholder, 'g'), String(value));
    });

    return rendered;
  }

  /**
   * Record delivery attempt
   */
  private recordDeliveryAttempt(attempt: DeliveryAttempt): void {
    if (!this.config.enableDeliveryTracking) return;

    const key = `${attempt.notificationId}-${attempt.channel}`;
    if (!this.deliveryHistory.has(key)) {
      this.deliveryHistory.set(key, []);
    }
    this.deliveryHistory.get(key)!.push(attempt);
  }

  /**
   * Get delivery history for a notification
   */
  getDeliveryHistory(notificationId: string, channel?: DeliveryMethod): DeliveryAttempt[] {
    if (channel) {
      const key = `${notificationId}-${channel}`;
      return this.deliveryHistory.get(key) || [];
    }

    // Return all attempts for this notification across all channels
    const allAttempts: DeliveryAttempt[] = [];
    for (const [key, attempts] of this.deliveryHistory) {
      if (key.startsWith(notificationId)) {
        allAttempts.push(...attempts);
      }
    }
    return allAttempts.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Add or update notification template
   */
  addTemplate(type: string, template: NotificationTemplate): void {
    this.templates.set(type, template);
    this.emit('templateAdded', { type, template });
  }

  /**
   * Remove notification template
   */
  removeTemplate(type: string): void {
    this.templates.delete(type);
    this.emit('templateRemoved', { type });
  }

  /**
   * Load default templates
   */
  private loadDefaultTemplates(): void {
    Object.entries(this.config.defaultTemplates).forEach(([type, template]) => {
      this.templates.set(type, template);
    });
  }

  /**
   * Get delivery statistics
   */
  getDeliveryStats(): {
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    retryCount: number;
    channelStats: Record<DeliveryMethod, { success: number; failed: number }>;
  } {
    let totalDeliveries = 0;
    let successfulDeliveries = 0;
    let failedDeliveries = 0;
    let retryCount = 0;
    const channelStats: Record<string, { success: number; failed: number }> = {};

    for (const attempts of this.deliveryHistory.values()) {
      for (const attempt of attempts) {
        totalDeliveries++;
        
        if (attempt.attempt > 1) {
          retryCount++;
        }

        if (!channelStats[attempt.channel]) {
          channelStats[attempt.channel] = { success: 0, failed: 0 };
        }

        if (attempt.result.success) {
          successfulDeliveries++;
          channelStats[attempt.channel].success++;
        } else {
          failedDeliveries++;
          channelStats[attempt.channel].failed++;
        }
      }
    }

    return {
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      retryCount,
      channelStats: channelStats as Record<DeliveryMethod, { success: number; failed: number }>
    };
  }

  /**
   * Clear delivery history
   */
  clearDeliveryHistory(): void {
    this.deliveryHistory.clear();
    this.emit('historyCleared');
  }

  /**
   * Get available channels
   */
  getAvailableChannels(): DeliveryMethod[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Check if all channels are healthy
   */
  async checkChannelHealth(): Promise<Record<DeliveryMethod, boolean>> {
    const health: Record<string, boolean> = {};
    
    for (const [type, channel] of this.channels) {
      try {
        health[type] = await channel.isAvailable();
      } catch (error) {
        health[type] = false;
      }
    }

    return health as Record<DeliveryMethod, boolean>;
  }
}