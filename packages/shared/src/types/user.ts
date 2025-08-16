import { WeightClass, AlertType, DeliveryMethod } from './core.js';

/**
 * User and notification interfaces
 */

export interface AlertThresholds {
  oddsMovementPercentage: number;
  predictionConfidenceChange: number;
  injuryReportSeverity: 'minor' | 'major' | 'all';
  minimumNotificationInterval: number; // minutes
}

export interface UserPreferences {
  userId: string;
  followedFighters: string[];
  weightClasses: WeightClass[];
  alertTypes: AlertType[];
  deliveryMethods: DeliveryMethod[];
  thresholds: AlertThresholds;
  timezone: string;
  enabled: boolean;
}

export interface NotificationEvent {
  id: string;
  type: AlertType;
  fightId?: string;
  fighterId?: string;
  data: any;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
  processed: boolean;
}

export interface User {
  id: string;
  email: string;
  username: string;
  preferences: UserPreferences;
  createdAt: Date;
  lastLoginAt: Date;
  isActive: boolean;
}