/**
 * SmsChannel - SMS notification delivery channel
 */

import { NotificationChannel, NotificationPayload, DeliveryResult } from '../notification-dispatcher';

export interface SmsConfig {
  provider: 'twilio' | 'aws-sns' | 'nexmo';
  accountSid?: string;
  authToken?: string;
  fromNumber: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface PhoneNumber {
  number: string;
  countryCode: string;
  verified: boolean;
}

export class SmsChannel implements NotificationChannel {
  type = 'sms' as const;
  private config: SmsConfig;
  private phoneResolver: (userId: string) => Promise<PhoneNumber | null>;

  constructor(
    config: SmsConfig,
    phoneResolver: (userId: string) => Promise<PhoneNumber | null>
  ) {
    this.config = config;
    this.phoneResolver = phoneResolver;
  }

  async send(notification: NotificationPayload): Promise<DeliveryResult> {
    try {
      // Get user phone number
      const phoneNumber = await this.phoneResolver(notification.userId);
      if (!phoneNumber) {
        return {
          success: false,
          error: 'User phone number not found'
        };
      }

      if (!phoneNumber.verified) {
        return {
          success: false,
          error: 'User phone number not verified'
        };
      }

      // Create SMS message
      const smsMessage = this.createSmsMessage(notification);
      
      // Send SMS based on provider
      const result = await this.sendSms(phoneNumber.number, smsMessage);
      
      return result;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SMS error',
        retryAfter: 120 // Retry after 2 minutes for SMS
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if SMS service is available
      return await this.checkSmsService();
    } catch (error) {
      return false;
    }
  }

  /**
   * Create SMS message content
   */
  private createSmsMessage(notification: NotificationPayload): string {
    // SMS has character limits, so we need to be concise
    const maxLength = 160; // Standard SMS length
    
    let message = `UFC Alert: ${notification.subject}`;
    
    // Add content if there's space
    const remainingSpace = maxLength - message.length - 10; // Leave some buffer
    if (remainingSpace > 20) {
      const truncatedContent = this.truncateContent(notification.content, remainingSpace);
      if (truncatedContent) {
        message += `\n${truncatedContent}`;
      }
    }

    // Add event type indicator
    const eventTypeEmojis = {
      odds_movement: '📊',
      fight_update: '🥊',
      prediction_change: '🔮',
      injury_report: '🏥'
    };
    
    const emoji = eventTypeEmojis[notification.metadata.eventType];
    if (emoji) {
      message = `${emoji} ${message}`;
    }

    return message;
  }

  /**
   * Send SMS via configured provider
   */
  private async sendSms(phoneNumber: string, message: string): Promise<DeliveryResult> {
    switch (this.config.provider) {
      case 'twilio':
        return await this.sendTwilioSms(phoneNumber, message);
      case 'aws-sns':
        return await this.sendAwsSnsSms(phoneNumber, message);
      case 'nexmo':
        return await this.sendNexmoSms(phoneNumber, message);
      default:
        return {
          success: false,
          error: `Unsupported SMS provider: ${this.config.provider}`
        };
    }
  }

  /**
   * Send SMS via Twilio
   */
  private async sendTwilioSms(phoneNumber: string, message: string): Promise<DeliveryResult> {
    try {
      // Mock implementation - would use Twilio SDK
      console.log('Sending Twilio SMS:', { 
        to: phoneNumber, 
        from: this.config.fromNumber,
        body: message.substr(0, 50) + '...'
      });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 200));
      
      return {
        success: true,
        messageId: `twilio-${Date.now()}`,
        deliveredAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Twilio SMS error'
      };
    }
  }

  /**
   * Send SMS via AWS SNS
   */
  private async sendAwsSnsSms(phoneNumber: string, message: string): Promise<DeliveryResult> {
    try {
      // Mock implementation - would use AWS SDK
      console.log('Sending AWS SNS SMS:', { 
        phoneNumber, 
        message: message.substr(0, 50) + '...'
      });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 150));
      
      return {
        success: true,
        messageId: `aws-sns-${Date.now()}`,
        deliveredAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'AWS SNS error'
      };
    }
  }

  /**
   * Send SMS via Nexmo (Vonage)
   */
  private async sendNexmoSms(phoneNumber: string, message: string): Promise<DeliveryResult> {
    try {
      // Mock implementation - would use Nexmo SDK
      console.log('Sending Nexmo SMS:', { 
        to: phoneNumber,
        from: this.config.fromNumber,
        text: message.substr(0, 50) + '...'
      });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 180));
      
      return {
        success: true,
        messageId: `nexmo-${Date.now()}`,
        deliveredAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Nexmo SMS error'
      };
    }
  }

  /**
   * Truncate content for SMS
   */
  private truncateContent(content: string, maxLength: number): string {
    // Remove HTML tags and extra whitespace
    const cleanContent = content
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleanContent.length <= maxLength) return cleanContent;
    return cleanContent.substr(0, maxLength - 3) + '...';
  }

  /**
   * Check if SMS service is available
   */
  private async checkSmsService(): Promise<boolean> {
    // Mock implementation - would check provider service status
    return true;
  }

  /**
   * Format phone number for international SMS
   */
  private formatPhoneNumber(phoneNumber: PhoneNumber): string {
    // Ensure phone number is in E.164 format
    let formatted = phoneNumber.number;
    
    if (!formatted.startsWith('+')) {
      formatted = `+${phoneNumber.countryCode}${formatted}`;
    }
    
    return formatted;
  }
}