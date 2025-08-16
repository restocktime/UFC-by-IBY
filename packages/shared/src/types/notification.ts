/**
 * Notification system types for the UFC Prediction Platform
 */

import { AlertType, DeliveryMethod, NotificationPriority } from './core';

export interface NotificationEvent {
  id: string;
  type: AlertType;
  fightId?: string;
  fighterId?: string;
  data: any;
  priority: NotificationPriority;
  timestamp: Date;
  userId?: string;
}

export interface UserPreferences {
  userId: string;
  followedFighters: string[];
  weightClasses: string[];
  alertTypes: AlertType[];
  deliveryMethods: DeliveryMethod[];
  thresholds: AlertThresholds;
  enabled: boolean;
}

export interface AlertThresholds {
  oddsMovementPercentage: number;
  predictionConfidenceChange: number;
  minimumNotificationInterval: number; // minutes
}

export interface EventFilter {
  userId: string;
  eventTypes: AlertType[];
  fighterIds?: string[];
  weightClasses?: string[];
  minimumPriority: NotificationPriority;
}

export interface ProcessedEvent {
  originalEvent: NotificationEvent;
  targetUsers: string[];
  filteredData: any;
  deliveryMethods: DeliveryMethod[];
  scheduledTime?: Date;
}

export interface EventProcessingResult {
  eventId: string;
  processed: boolean;
  targetUserCount: number;
  errors: string[];
  processingTime: number;
}