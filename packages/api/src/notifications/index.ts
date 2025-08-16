/**
 * Notification System - Event Processing Infrastructure
 * 
 * Exports all notification system components for the UFC Prediction Platform
 */

export { EventProcessor, EventProcessorConfig } from './event-processor';
export { EventQueue, EventQueueConfig, QueuedEvent } from './event-queue';
export { 
  NotificationDispatcher, 
  NotificationDispatcherConfig,
  NotificationChannel,
  NotificationPayload,
  DeliveryResult,
  NotificationTemplate
} from './notification-dispatcher';
export { 
  UserPreferencesService, 
  UserPreferencesRepository,
  PreferenceValidationResult 
} from './user-preferences-service';
export {
  OddsMovementDetector,
  OddsMovementDetectorConfig,
  OddsSnapshot,
  OddsMovement,
  MovementThresholds
} from './odds-movement-detector';

// Notification channels
export { EmailChannel, EmailConfig, EmailAddress } from './channels/email-channel';
export { PushChannel, PushConfig, PushDevice } from './channels/push-channel';
export { SmsChannel, SmsConfig, PhoneNumber } from './channels/sms-channel';