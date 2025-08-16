/**
 * PushChannel - Push notification delivery channel
 */

import { NotificationChannel, NotificationPayload, DeliveryResult } from '../notification-dispatcher';

export interface PushConfig {
  fcmServerKey: string;
  apnsKeyId: string;
  apnsTeamId: string;
  apnsPrivateKey: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
}

export interface PushDevice {
  token: string;
  platform: 'ios' | 'android' | 'web';
  userId: string;
  active: boolean;
}

export class PushChannel implements NotificationChannel {
  type = 'push' as const;
  private config: PushConfig;
  private deviceResolver: (userId: string) => Promise<PushDevice[]>;

  constructor(
    config: PushConfig,
    deviceResolver: (userId: string) => Promise<PushDevice[]>
  ) {
    this.config = config;
    this.deviceResolver = deviceResolver;
  }

  async send(notification: NotificationPayload): Promise<DeliveryResult> {
    try {
      // Get user's push devices
      const devices = await this.deviceResolver(notification.userId);
      const activeDevices = devices.filter(device => device.active);

      if (activeDevices.length === 0) {
        return {
          success: false,
          error: 'No active push devices found for user'
        };
      }

      // Send to all devices
      const results = await Promise.allSettled(
        activeDevices.map(device => this.sendToDevice(device, notification))
      );

      // Check if at least one delivery succeeded
      const successCount = results.filter(result => 
        result.status === 'fulfilled' && result.value.success
      ).length;

      if (successCount > 0) {
        return {
          success: true,
          messageId: `push-${Date.now()}`,
          deliveredAt: new Date()
        };
      } else {
        return {
          success: false,
          error: 'Failed to deliver to any device',
          retryAfter: 30
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown push error',
        retryAfter: 60
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if push services are available
      return await this.checkPushServices();
    } catch (error) {
      return false;
    }
  }

  /**
   * Send push notification to a specific device
   */
  private async sendToDevice(device: PushDevice, notification: NotificationPayload): Promise<DeliveryResult> {
    const pushMessage = this.createPushMessage(device, notification);

    switch (device.platform) {
      case 'ios':
        return await this.sendApns(device.token, pushMessage);
      case 'android':
        return await this.sendFcm(device.token, pushMessage);
      case 'web':
        return await this.sendWebPush(device.token, pushMessage);
      default:
        return {
          success: false,
          error: `Unsupported platform: ${device.platform}`
        };
    }
  }

  /**
   * Create push message payload
   */
  private createPushMessage(device: PushDevice, notification: NotificationPayload) {
    const baseMessage = {
      title: notification.subject,
      body: this.truncateContent(notification.content, 200),
      data: {
        notificationId: notification.id,
        eventId: notification.metadata.eventId,
        eventType: notification.metadata.eventType,
        priority: notification.priority
      },
      badge: this.getPriorityBadge(notification.priority),
      sound: this.getPrioritySound(notification.priority),
      category: notification.metadata.eventType
    };

    // Platform-specific customizations
    switch (device.platform) {
      case 'ios':
        return {
          ...baseMessage,
          aps: {
            alert: {
              title: baseMessage.title,
              body: baseMessage.body
            },
            badge: baseMessage.badge,
            sound: baseMessage.sound,
            category: baseMessage.category,
            'thread-id': notification.metadata.eventType
          },
          data: baseMessage.data
        };

      case 'android':
        return {
          ...baseMessage,
          android: {
            priority: notification.priority === 'urgent' ? 'high' : 'normal',
            notification: {
              title: baseMessage.title,
              body: baseMessage.body,
              icon: 'ic_notification',
              color: '#FF6B35',
              tag: notification.metadata.eventType,
              click_action: 'FLUTTER_NOTIFICATION_CLICK'
            }
          },
          data: baseMessage.data
        };

      case 'web':
        return {
          ...baseMessage,
          icon: '/icons/notification-icon.png',
          image: this.getEventTypeImage(notification.metadata.eventType),
          actions: [
            {
              action: 'view',
              title: 'View Details'
            },
            {
              action: 'dismiss',
              title: 'Dismiss'
            }
          ],
          requireInteraction: notification.priority === 'urgent'
        };

      default:
        return baseMessage;
    }
  }

  /**
   * Send APNS notification (iOS)
   */
  private async sendApns(token: string, message: any): Promise<DeliveryResult> {
    try {
      // Mock implementation - would use node-apn or similar
      console.log('Sending APNS notification:', { token: token.substr(0, 10) + '...', title: message.aps.alert.title });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
      return {
        success: true,
        messageId: `apns-${Date.now()}`,
        deliveredAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'APNS error'
      };
    }
  }

  /**
   * Send FCM notification (Android)
   */
  private async sendFcm(token: string, message: any): Promise<DeliveryResult> {
    try {
      // Mock implementation - would use firebase-admin
      console.log('Sending FCM notification:', { token: token.substr(0, 10) + '...', title: message.title });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
      return {
        success: true,
        messageId: `fcm-${Date.now()}`,
        deliveredAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'FCM error'
      };
    }
  }

  /**
   * Send Web Push notification
   */
  private async sendWebPush(token: string, message: any): Promise<DeliveryResult> {
    try {
      // Mock implementation - would use web-push library
      console.log('Sending Web Push notification:', { token: token.substr(0, 10) + '...', title: message.title });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
      return {
        success: true,
        messageId: `webpush-${Date.now()}`,
        deliveredAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Web Push error'
      };
    }
  }

  /**
   * Truncate content to fit push notification limits
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.substr(0, maxLength - 3) + '...';
  }

  /**
   * Get badge count based on priority
   */
  private getPriorityBadge(priority: string): number {
    switch (priority) {
      case 'urgent': return 1;
      case 'high': return 1;
      default: return 0;
    }
  }

  /**
   * Get sound based on priority
   */
  private getPrioritySound(priority: string): string {
    switch (priority) {
      case 'urgent': return 'urgent.caf';
      case 'high': return 'high.caf';
      default: return 'default';
    }
  }

  /**
   * Get image for event type
   */
  private getEventTypeImage(eventType: string): string | undefined {
    const images = {
      odds_movement: '/images/odds-icon.png',
      fight_update: '/images/fight-icon.png',
      prediction_change: '/images/prediction-icon.png',
      injury_report: '/images/injury-icon.png'
    };
    return images[eventType];
  }

  /**
   * Check if push services are available
   */
  private async checkPushServices(): Promise<boolean> {
    // Mock implementation - would check FCM, APNS, and Web Push services
    return true;
  }
}