/**
 * Core entity types for the UFC Prediction Platform
 */

export type WeightClass = 
  | 'Flyweight' 
  | 'Bantamweight' 
  | 'Featherweight' 
  | 'Lightweight' 
  | 'Welterweight' 
  | 'Middleweight' 
  | 'Light Heavyweight' 
  | 'Heavyweight' 
  | 'Women\'s Strawweight' 
  | 'Women\'s Flyweight' 
  | 'Women\'s Bantamweight' 
  | 'Women\'s Featherweight';

export type FightStance = 'Orthodox' | 'Southpaw' | 'Switch';

export type FightStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type FightMethod = 
  | 'KO/TKO' 
  | 'Submission' 
  | 'Decision' 
  | 'DQ' 
  | 'No Contest';

export type AlertType = 
  | 'odds_movement' 
  | 'fight_update' 
  | 'prediction_change' 
  | 'injury_report';

export type DeliveryMethod = 'email' | 'push' | 'sms';

export type DataSourceType = 'api' | 'scraper' | 'feed';

export type DataSourceStatus = 'active' | 'error' | 'rate_limited';

export type MovementType = 'significant' | 'reverse' | 'steam';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';