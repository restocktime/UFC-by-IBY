/**
 * EmailChannel - Email notification delivery channel
 */

import { NotificationChannel, NotificationPayload, DeliveryResult } from '../notification-dispatcher';

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  fromAddress: string;
  fromName: string;
  useTLS: boolean;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export class EmailChannel implements NotificationChannel {
  type = 'email' as const;
  private config: EmailConfig;
  private userEmailResolver: (userId: string) => Promise<EmailAddress | null>;

  constructor(
    config: EmailConfig,
    userEmailResolver: (userId: string) => Promise<EmailAddress | null>
  ) {
    this.config = config;
    this.userEmailResolver = userEmailResolver;
  }

  async send(notification: NotificationPayload): Promise<DeliveryResult> {
    try {
      // Get user email address
      const userEmail = await this.userEmailResolver(notification.userId);
      if (!userEmail) {
        return {
          success: false,
          error: 'User email address not found'
        };
      }

      // Create email message
      const emailMessage = {
        from: {
          address: this.config.fromAddress,
          name: this.config.fromName
        },
        to: {
          address: userEmail.email,
          name: userEmail.name
        },
        subject: notification.subject,
        html: this.formatEmailContent(notification),
        text: this.stripHtml(notification.content),
        headers: {
          'X-Notification-ID': notification.id,
          'X-Event-ID': notification.metadata.eventId,
          'X-Priority': notification.priority
        }
      };

      // Send email (mock implementation - would use actual SMTP client)
      const messageId = await this.sendEmail(emailMessage);

      return {
        success: true,
        messageId,
        deliveredAt: new Date()
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown email error',
        retryAfter: 60 // Retry after 60 seconds
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check SMTP connection (mock implementation)
      return await this.checkSmtpConnection();
    } catch (error) {
      return false;
    }
  }

  /**
   * Format email content with HTML template
   */
  private formatEmailContent(notification: NotificationPayload): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${notification.subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background-color: #f4f4f4; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .footer { background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 12px; }
            .priority-high { border-left: 4px solid #ff6b6b; }
            .priority-urgent { border-left: 4px solid #ff3838; background-color: #fff5f5; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>UFC Prediction Platform</h1>
          </div>
          <div class="content priority-${notification.priority}">
            <h2>${notification.subject}</h2>
            <div>${notification.content}</div>
            ${this.formatMetadata(notification.metadata)}
          </div>
          <div class="footer">
            <p>This is an automated notification from UFC Prediction Platform.</p>
            <p>Event ID: ${notification.metadata.eventId} | Notification ID: ${notification.id}</p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Format metadata for display
   */
  private formatMetadata(metadata: Record<string, any>): string {
    if (metadata.eventType) {
      const eventTypeLabels = {
        odds_movement: 'Odds Movement',
        fight_update: 'Fight Update',
        prediction_change: 'Prediction Change',
        injury_report: 'Injury Report'
      };
      
      return `<p><strong>Alert Type:</strong> ${eventTypeLabels[metadata.eventType] || metadata.eventType}</p>`;
    }
    return '';
  }

  /**
   * Strip HTML tags from content
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Send email via SMTP (mock implementation)
   */
  private async sendEmail(message: any): Promise<string> {
    // Mock implementation - would use nodemailer or similar
    console.log('Sending email:', {
      to: message.to.address,
      subject: message.subject
    });
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return mock message ID
    return `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check SMTP connection (mock implementation)
   */
  private async checkSmtpConnection(): Promise<boolean> {
    // Mock implementation - would test actual SMTP connection
    return true;
  }
}