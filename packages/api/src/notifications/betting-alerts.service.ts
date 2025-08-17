import { EventEmitter } from 'events';
import { liveUpdatesService, LiveUpdateEvent } from '../websocket/live-updates.service.js';
import { userPreferencesService } from './user-preferences-service.js';

export interface BettingAlert {
  id: string;
  userId: string;
  type: 'odds_movement' | 'value_bet' | 'arbitrage' | 'line_movement' | 'injury_report' | 'custom';
  fightId: string;
  conditions: AlertCondition[];
  isActive: boolean;
  createdAt: Date;
  triggeredAt?: Date;
  metadata?: {
    description?: string;
    targetOdds?: number;
    threshold?: number;
    sportsbooks?: string[];
  };
}

export interface AlertCondition {
  field: string; // 'odds', 'line', 'volume', 'movement_percentage'
  operator: 'greater_than' | 'less_than' | 'equals' | 'percentage_change' | 'crosses';
  value: number;
  timeframe?: number; // minutes
}

export interface BettingOpportunity {
  id: string;
  type: 'value_bet' | 'arbitrage' | 'line_shopping' | 'steam_move';
  fightId: string;
  description: string;
  expectedValue?: number;
  confidence: number;
  sportsbooks: SportsbookOpportunity[];
  expiresAt: Date;
  metadata: {
    calculatedAt: Date;
    dataSource: string;
    riskLevel: 'low' | 'medium' | 'high';
  };
}

export interface SportsbookOpportunity {
  name: string;
  odds: number;
  line?: number;
  url?: string;
  lastUpdated: Date;
}

export interface AlertTriggerEvent {
  alertId: string;
  userId: string;
  fightId: string;
  triggerData: any;
  opportunity?: BettingOpportunity;
  timestamp: Date;
}

export class BettingAlertsService extends EventEmitter {
  private alerts: Map<string, BettingAlert> = new Map();
  private opportunities: Map<string, BettingOpportunity> = new Map();
  private userAlerts: Map<string, Set<string>> = new Map(); // userId -> alertIds
  private alertHistory: Map<string, AlertTriggerEvent[]> = new Map();

  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * Create a new betting alert
   */
  public createAlert(alert: Omit<BettingAlert, 'id' | 'createdAt'>): string {
    const alertId = this.generateAlertId();
    
    const newAlert: BettingAlert = {
      ...alert,
      id: alertId,
      createdAt: new Date()
    };

    this.alerts.set(alertId, newAlert);

    // Add to user's alerts
    if (!this.userAlerts.has(alert.userId)) {
      this.userAlerts.set(alert.userId, new Set());
    }
    this.userAlerts.get(alert.userId)!.add(alertId);

    this.emit('alertCreated', { alertId, alert: newAlert });
    return alertId;
  }

  /**
   * Update existing alert
   */
  public updateAlert(alertId: string, updates: Partial<BettingAlert>): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    const updatedAlert = { ...alert, ...updates };
    this.alerts.set(alertId, updatedAlert);

    this.emit('alertUpdated', { alertId, alert: updatedAlert });
    return true;
  }

  /**
   * Delete alert
   */
  public deleteAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    // Remove from user's alerts
    this.userAlerts.get(alert.userId)?.delete(alertId);
    
    // Remove alert
    this.alerts.delete(alertId);
    
    // Remove history
    this.alertHistory.delete(alertId);

    this.emit('alertDeleted', { alertId });
    return true;
  }

  /**
   * Get user's alerts
   */
  public getUserAlerts(userId: string): BettingAlert[] {
    const userAlertIds = this.userAlerts.get(userId);
    if (!userAlertIds) return [];

    return Array.from(userAlertIds)
      .map(id => this.alerts.get(id))
      .filter(alert => alert !== undefined) as BettingAlert[];
  }

  /**
   * Get alert by ID
   */
  public getAlert(alertId: string): BettingAlert | undefined {
    return this.alerts.get(alertId);
  }

  /**
   * Check if odds update triggers any alerts
   */
  public checkOddsAlerts(oddsUpdate: any): void {
    const { fightId, sportsbook, currentOdds, previousOdds } = oddsUpdate;

    // Find alerts for this fight
    const fightAlerts = Array.from(this.alerts.values())
      .filter(alert => alert.fightId === fightId && alert.isActive);

    for (const alert of fightAlerts) {
      if (this.evaluateAlert(alert, oddsUpdate)) {
        this.triggerAlert(alert, oddsUpdate);
      }
    }
  }

  /**
   * Evaluate if alert conditions are met
   */
  private evaluateAlert(alert: BettingAlert, data: any): boolean {
    return alert.conditions.every(condition => {
      return this.evaluateCondition(condition, data);
    });
  }

  /**
   * Evaluate single alert condition
   */
  private evaluateCondition(condition: AlertCondition, data: any): boolean {
    const fieldValue = this.getFieldValue(condition.field, data);
    
    switch (condition.operator) {
      case 'greater_than':
        return fieldValue > condition.value;
      
      case 'less_than':
        return fieldValue < condition.value;
      
      case 'equals':
        return fieldValue === condition.value;
      
      case 'percentage_change':
        const previousValue = this.getPreviousFieldValue(condition.field, data);
        if (previousValue === null) return false;
        const changePercent = ((fieldValue - previousValue) / previousValue) * 100;
        return Math.abs(changePercent) >= condition.value;
      
      case 'crosses':
        const prevValue = this.getPreviousFieldValue(condition.field, data);
        if (prevValue === null) return false;
        return (prevValue < condition.value && fieldValue >= condition.value) ||
               (prevValue > condition.value && fieldValue <= condition.value);
      
      default:
        return false;
    }
  }

  /**
   * Get field value from data
   */
  private getFieldValue(field: string, data: any): number {
    switch (field) {
      case 'odds':
        return data.currentOdds || 0;
      case 'line':
        return data.currentLine || 0;
      case 'volume':
        return data.volume || 0;
      case 'movement_percentage':
        const current = data.currentOdds || 0;
        const previous = data.previousOdds || current;
        return previous !== 0 ? ((current - previous) / previous) * 100 : 0;
      default:
        return 0;
    }
  }

  /**
   * Get previous field value from data
   */
  private getPreviousFieldValue(field: string, data: any): number | null {
    switch (field) {
      case 'odds':
        return data.previousOdds || null;
      case 'line':
        return data.previousLine || null;
      default:
        return null;
    }
  }

  /**
   * Trigger alert
   */
  private triggerAlert(alert: BettingAlert, triggerData: any): void {
    const triggerEvent: AlertTriggerEvent = {
      alertId: alert.id,
      userId: alert.userId,
      fightId: alert.fightId,
      triggerData,
      timestamp: new Date()
    };

    // Add to history
    if (!this.alertHistory.has(alert.id)) {
      this.alertHistory.set(alert.id, []);
    }
    this.alertHistory.get(alert.id)!.push(triggerEvent);

    // Update alert
    alert.triggeredAt = new Date();
    this.alerts.set(alert.id, alert);

    // Send live update
    const liveUpdate: LiveUpdateEvent = {
      type: 'odds_update',
      entityType: 'odds',
      entityId: alert.fightId,
      data: {
        alertId: alert.id,
        alertType: alert.type,
        triggerData,
        message: this.generateAlertMessage(alert, triggerData)
      },
      priority: 'high',
      metadata: {
        changeType: 'updated'
      }
    };

    liveUpdatesService.publishUpdate(liveUpdate);

    // Send notification through user preferences
    this.sendAlertNotification(alert, triggerEvent);

    this.emit('alertTriggered', triggerEvent);
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(alert: BettingAlert, triggerData: any): string {
    switch (alert.type) {
      case 'odds_movement':
        return `Odds moved for fight ${alert.fightId}: ${triggerData.previousOdds} → ${triggerData.currentOdds}`;
      
      case 'value_bet':
        return `Value betting opportunity detected for fight ${alert.fightId}`;
      
      case 'arbitrage':
        return `Arbitrage opportunity found for fight ${alert.fightId}`;
      
      case 'line_movement':
        return `Line moved for fight ${alert.fightId}`;
      
      default:
        return `Alert triggered for fight ${alert.fightId}`;
    }
  }

  /**
   * Send alert notification
   */
  private async sendAlertNotification(alert: BettingAlert, triggerEvent: AlertTriggerEvent): Promise<void> {
    try {
      const userPrefs = await userPreferencesService.getUserPreferences(alert.userId);
      
      if (userPrefs?.notifications?.enabled) {
        const message = this.generateAlertMessage(alert, triggerEvent.triggerData);
        
        // Send through preferred channels
        for (const channel of userPrefs.notifications.channels) {
          if (channel.enabled) {
            await userPreferencesService.sendNotification(alert.userId, {
              type: 'betting_alert',
              title: `Betting Alert: ${alert.type}`,
              message,
              data: triggerEvent,
              channel: channel.type
            });
          }
        }
      }
    } catch (error) {
      this.emit('notificationError', { alertId: alert.id, error });
    }
  }

  /**
   * Create betting opportunity
   */
  public createOpportunity(opportunity: Omit<BettingOpportunity, 'id'>): string {
    const opportunityId = this.generateOpportunityId();
    
    const newOpportunity: BettingOpportunity = {
      ...opportunity,
      id: opportunityId
    };

    this.opportunities.set(opportunityId, newOpportunity);

    // Publish as live update
    const liveUpdate: LiveUpdateEvent = {
      type: 'odds_update',
      entityType: 'odds',
      entityId: opportunity.fightId,
      data: {
        opportunityId,
        opportunity: newOpportunity
      },
      priority: opportunity.confidence > 0.8 ? 'urgent' : 'high'
    };

    liveUpdatesService.publishUpdate(liveUpdate);

    this.emit('opportunityCreated', { opportunityId, opportunity: newOpportunity });
    return opportunityId;
  }

  /**
   * Get active opportunities
   */
  public getActiveOpportunities(): BettingOpportunity[] {
    const now = new Date();
    return Array.from(this.opportunities.values())
      .filter(opp => opp.expiresAt > now);
  }

  /**
   * Get opportunities for fight
   */
  public getFightOpportunities(fightId: string): BettingOpportunity[] {
    return Array.from(this.opportunities.values())
      .filter(opp => opp.fightId === fightId && opp.expiresAt > new Date());
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen to odds movement events
    liveUpdatesService.on('updatePublished', (event: LiveUpdateEvent) => {
      if (event.type === 'odds_update') {
        this.checkOddsAlerts(event.data);
      }
    });

    // Clean up expired opportunities
    setInterval(() => {
      this.cleanupExpiredOpportunities();
    }, 60000); // Every minute
  }

  /**
   * Clean up expired opportunities
   */
  private cleanupExpiredOpportunities(): void {
    const now = new Date();
    let removedCount = 0;

    for (const [id, opportunity] of this.opportunities) {
      if (opportunity.expiresAt <= now) {
        this.opportunities.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.emit('opportunitiesCleanup', { removedCount });
    }
  }

  /**
   * Get alert statistics
   */
  public getAlertStats(): any {
    const totalAlerts = this.alerts.size;
    const activeAlerts = Array.from(this.alerts.values()).filter(a => a.isActive).length;
    const totalOpportunities = this.opportunities.size;
    
    const alertsByType = new Map<string, number>();
    for (const alert of this.alerts.values()) {
      alertsByType.set(alert.type, (alertsByType.get(alert.type) || 0) + 1);
    }

    return {
      totalAlerts,
      activeAlerts,
      totalOpportunities,
      alertsByType: Object.fromEntries(alertsByType),
      totalUsers: this.userAlerts.size
    };
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate opportunity ID
   */
  private generateOpportunityId(): string {
    return `opp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const bettingAlertsService = new BettingAlertsService();