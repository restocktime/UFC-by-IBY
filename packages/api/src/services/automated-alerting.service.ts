import { PerformanceMonitoringService, AlertConfiguration } from './performance-monitoring.service';
import { DatabaseManager } from '../database';
import { EventEmitter } from 'events';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  query: string;
  threshold: number;
  operator: '>' | '<' | '=' | '>=' | '<=';
  timeWindow: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldownMinutes: number;
  actions: {
    email?: string[];
    webhook?: string;
    slack?: string;
    pagerduty?: string;
  };
}

export interface AlertEvent {
  ruleId: string;
  ruleName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AlertingMetrics {
  totalAlerts: number;
  alertsBySeverity: Record<string, number>;
  alertsByRule: Record<string, number>;
  averageResolutionTime: number;
  falsePositiveRate: number;
}

export class AutomatedAlertingService extends EventEmitter {
  private performanceService: PerformanceMonitoringService;
  private dbManager: DatabaseManager;
  private alertRules: Map<string, AlertRule> = new Map();
  private lastAlertTimes: Map<string, Date> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  constructor() {
    super();
    this.performanceService = new PerformanceMonitoringService();
    this.dbManager = DatabaseManager.getInstance();
    this.loadAlertRules();
  }

  // Alert Rule Management

  async createAlertRule(rule: AlertRule): Promise<void> {
    try {
      // Validate rule
      this.validateAlertRule(rule);

      // Store in memory
      this.alertRules.set(rule.id, rule);

      // Store in database
      const mongodb = this.dbManager.getMongoDB();
      const db = mongodb.getDb();
      const collection = db.collection('alert_rules');

      await collection.replaceOne(
        { id: rule.id },
        { ...rule, createdAt: new Date(), updatedAt: new Date() },
        { upsert: true }
      );

      console.log(`Alert rule created: ${rule.name}`);
      this.emit('ruleCreated', rule);
    } catch (error) {
      console.error('Error creating alert rule:', error);
      throw new Error(`Failed to create alert rule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateAlertRule(ruleId: string, updates: Partial<AlertRule>): Promise<void> {
    try {
      const existingRule = this.alertRules.get(ruleId);
      if (!existingRule) {
        throw new Error(`Alert rule not found: ${ruleId}`);
      }

      const updatedRule = { ...existingRule, ...updates, updatedAt: new Date() };
      this.validateAlertRule(updatedRule);

      // Update in memory
      this.alertRules.set(ruleId, updatedRule);

      // Update in database
      const mongodb = this.dbManager.getMongoDB();
      const db = mongodb.getDb();
      const collection = db.collection('alert_rules');

      await collection.updateOne(
        { id: ruleId },
        { $set: { ...updates, updatedAt: new Date() } }
      );

      console.log(`Alert rule updated: ${updatedRule.name}`);
      this.emit('ruleUpdated', updatedRule);
    } catch (error) {
      console.error('Error updating alert rule:', error);
      throw new Error(`Failed to update alert rule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteAlertRule(ruleId: string): Promise<void> {
    try {
      const rule = this.alertRules.get(ruleId);
      if (!rule) {
        throw new Error(`Alert rule not found: ${ruleId}`);
      }

      // Remove from memory
      this.alertRules.delete(ruleId);
      this.lastAlertTimes.delete(ruleId);

      // Remove from database
      const mongodb = this.dbManager.getMongoDB();
      const db = mongodb.getDb();
      const collection = db.collection('alert_rules');

      await collection.deleteOne({ id: ruleId });

      console.log(`Alert rule deleted: ${rule.name}`);
      this.emit('ruleDeleted', rule);
    } catch (error) {
      console.error('Error deleting alert rule:', error);
      throw new Error(`Failed to delete alert rule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAlertRules(): Promise<AlertRule[]> {
    return Array.from(this.alertRules.values());
  }

  async getAlertRule(ruleId: string): Promise<AlertRule | null> {
    return this.alertRules.get(ruleId) || null;
  }

  // Monitoring Control

  startMonitoring(intervalMinutes: number = 1): void {
    if (this.isMonitoring) {
      console.log('Monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(
      () => this.checkAllRules(),
      intervalMinutes * 60 * 1000
    );

    console.log(`Automated alerting started with ${intervalMinutes} minute interval`);
    this.emit('monitoringStarted', { intervalMinutes });
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) {
      console.log('Monitoring is not running');
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    console.log('Automated alerting stopped');
    this.emit('monitoringStopped');
  }

  isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  // Alert Processing

  private async checkAllRules(): Promise<void> {
    try {
      const enabledRules = Array.from(this.alertRules.values()).filter(rule => rule.enabled);
      
      for (const rule of enabledRules) {
        await this.checkRule(rule);
      }
    } catch (error) {
      console.error('Error checking alert rules:', error);
    }
  }

  private async checkRule(rule: AlertRule): Promise<void> {
    try {
      // Check cooldown period
      if (this.isInCooldown(rule.id, rule.cooldownMinutes)) {
        return;
      }

      // Execute rule query
      const value = await this.executeRuleQuery(rule);
      
      // Check if threshold is breached
      const isTriggered = this.evaluateThreshold(value, rule.threshold, rule.operator);
      
      if (isTriggered) {
        const alertEvent: AlertEvent = {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: this.generateAlertMessage(rule, value),
          value,
          threshold: rule.threshold,
          timestamp: new Date(),
          metadata: {
            query: rule.query,
            timeWindow: rule.timeWindow,
          },
        };

        await this.triggerAlert(alertEvent);
      }
    } catch (error) {
      console.error(`Error checking rule ${rule.name}:`, error);
    }
  }

  private async executeRuleQuery(rule: AlertRule): Promise<number> {
    try {
      const influxDB = this.dbManager.getInfluxDB();
      const queryApi = influxDB.getQueryApi();

      // Replace placeholders in query
      const query = rule.query.replace('${timeWindow}', rule.timeWindow);
      
      const results = await queryApi.collectRows(query);
      
      if (results.length === 0) {
        return 0;
      }

      // Return the first numeric value found
      const result = results[0];
      return result._value || result.value || 0;
    } catch (error) {
      console.error(`Error executing query for rule ${rule.name}:`, error);
      return 0;
    }
  }

  private evaluateThreshold(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case '>':
        return value > threshold;
      case '>=':
        return value >= threshold;
      case '<':
        return value < threshold;
      case '<=':
        return value <= threshold;
      case '=':
        return value === threshold;
      default:
        return false;
    }
  }

  private isInCooldown(ruleId: string, cooldownMinutes: number): boolean {
    const lastAlertTime = this.lastAlertTimes.get(ruleId);
    if (!lastAlertTime) {
      return false;
    }

    const now = new Date();
    const timeSinceLastAlert = now.getTime() - lastAlertTime.getTime();
    const cooldownMs = cooldownMinutes * 60 * 1000;
    
    return timeSinceLastAlert < cooldownMs;
  }

  private generateAlertMessage(rule: AlertRule, value: number): string {
    return `${rule.name}: Value ${value} ${rule.operator} ${rule.threshold}. ${rule.description}`;
  }

  private async triggerAlert(alertEvent: AlertEvent): Promise<void> {
    try {
      // Log alert to database
      await this.logAlert(alertEvent);

      // Update last alert time
      this.lastAlertTimes.set(alertEvent.ruleId, alertEvent.timestamp);

      // Execute alert actions
      const rule = this.alertRules.get(alertEvent.ruleId);
      if (rule) {
        await this.executeAlertActions(rule, alertEvent);
      }

      // Emit alert event
      this.emit('alertTriggered', alertEvent);

      console.log(`Alert triggered: ${alertEvent.ruleName} - ${alertEvent.message}`);
    } catch (error) {
      console.error('Error triggering alert:', error);
    }
  }

  private async logAlert(alertEvent: AlertEvent): Promise<void> {
    try {
      // Log to InfluxDB
      const influxDB = this.dbManager.getInfluxDB();
      const writeApi = influxDB.getWriteApi();
      
      const alertPoint = influxDB.createPoint('automated_alerts')
        .tag('ruleId', alertEvent.ruleId)
        .tag('ruleName', alertEvent.ruleName)
        .tag('severity', alertEvent.severity)
        .floatField('value', alertEvent.value)
        .floatField('threshold', alertEvent.threshold)
        .stringField('message', alertEvent.message)
        .timestamp(alertEvent.timestamp);

      await writeApi.writePoint(alertPoint);
      await writeApi.flush();

      // Log to MongoDB for historical tracking
      const mongodb = this.dbManager.getMongoDB();
      const db = mongodb.getDb();
      const collection = db.collection('alert_history');

      await collection.insertOne({
        ...alertEvent,
        acknowledged: false,
        resolved: false,
        createdAt: alertEvent.timestamp,
      });
    } catch (error) {
      console.error('Error logging alert:', error);
    }
  }

  private async executeAlertActions(rule: AlertRule, alertEvent: AlertEvent): Promise<void> {
    try {
      // Email notifications
      if (rule.actions.email && rule.actions.email.length > 0) {
        await this.sendEmailAlert(rule.actions.email, alertEvent);
      }

      // Webhook notifications
      if (rule.actions.webhook) {
        await this.sendWebhookAlert(rule.actions.webhook, alertEvent);
      }

      // Slack notifications
      if (rule.actions.slack) {
        await this.sendSlackAlert(rule.actions.slack, alertEvent);
      }

      // PagerDuty notifications (for critical alerts)
      if (rule.actions.pagerduty && alertEvent.severity === 'critical') {
        await this.sendPagerDutyAlert(rule.actions.pagerduty, alertEvent);
      }
    } catch (error) {
      console.error('Error executing alert actions:', error);
    }
  }

  // Alert Action Implementations (simplified)

  private async sendEmailAlert(recipients: string[], alertEvent: AlertEvent): Promise<void> {
    // Simplified email sending - in real implementation, use email service
    console.log(`Email alert sent to ${recipients.join(', ')}: ${alertEvent.message}`);
  }

  private async sendWebhookAlert(webhookUrl: string, alertEvent: AlertEvent): Promise<void> {
    try {
      // Simplified webhook - in real implementation, use HTTP client
      console.log(`Webhook alert sent to ${webhookUrl}: ${alertEvent.message}`);
    } catch (error) {
      console.error('Error sending webhook alert:', error);
    }
  }

  private async sendSlackAlert(slackChannel: string, alertEvent: AlertEvent): Promise<void> {
    // Simplified Slack notification - in real implementation, use Slack API
    console.log(`Slack alert sent to ${slackChannel}: ${alertEvent.message}`);
  }

  private async sendPagerDutyAlert(pagerDutyKey: string, alertEvent: AlertEvent): Promise<void> {
    // Simplified PagerDuty notification - in real implementation, use PagerDuty API
    console.log(`PagerDuty alert sent with key ${pagerDutyKey}: ${alertEvent.message}`);
  }

  // Alert Management

  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    try {
      const mongodb = this.dbManager.getMongoDB();
      const db = mongodb.getDb();
      const collection = db.collection('alert_history');

      await collection.updateOne(
        { _id: alertId },
        {
          $set: {
            acknowledged: true,
            acknowledgedBy,
            acknowledgedAt: new Date(),
          },
        }
      );

      console.log(`Alert acknowledged: ${alertId} by ${acknowledgedBy}`);
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      throw new Error(`Failed to acknowledge alert: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async resolveAlert(alertId: string, resolvedBy: string, resolution?: string): Promise<void> {
    try {
      const mongodb = this.dbManager.getMongoDB();
      const db = mongodb.getDb();
      const collection = db.collection('alert_history');

      await collection.updateOne(
        { _id: alertId },
        {
          $set: {
            resolved: true,
            resolvedBy,
            resolvedAt: new Date(),
            resolution: resolution || 'Manually resolved',
          },
        }
      );

      console.log(`Alert resolved: ${alertId} by ${resolvedBy}`);
    } catch (error) {
      console.error('Error resolving alert:', error);
      throw new Error(`Failed to resolve alert: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAlertingMetrics(timeWindow: string = '24h'): Promise<AlertingMetrics> {
    try {
      const mongodb = this.dbManager.getMongoDB();
      const db = mongodb.getDb();
      const collection = db.collection('alert_history');

      const startTime = new Date(Date.now() - this.parseTimeWindow(timeWindow));

      const pipeline = [
        {
          $match: {
            createdAt: { $gte: startTime },
          },
        },
        {
          $group: {
            _id: null,
            totalAlerts: { $sum: 1 },
            alertsBySeverity: {
              $push: '$severity',
            },
            alertsByRule: {
              $push: '$ruleId',
            },
            resolvedAlerts: {
              $sum: { $cond: ['$resolved', 1, 0] },
            },
            avgResolutionTime: {
              $avg: {
                $cond: [
                  '$resolved',
                  { $subtract: ['$resolvedAt', '$createdAt'] },
                  null,
                ],
              },
            },
          },
        },
      ];

      const results = await collection.aggregate(pipeline).toArray();
      
      if (results.length === 0) {
        return {
          totalAlerts: 0,
          alertsBySeverity: {},
          alertsByRule: {},
          averageResolutionTime: 0,
          falsePositiveRate: 0,
        };
      }

      const result = results[0];
      
      // Count alerts by severity
      const alertsBySeverity: Record<string, number> = {};
      result.alertsBySeverity.forEach((severity: string) => {
        alertsBySeverity[severity] = (alertsBySeverity[severity] || 0) + 1;
      });

      // Count alerts by rule
      const alertsByRule: Record<string, number> = {};
      result.alertsByRule.forEach((ruleId: string) => {
        alertsByRule[ruleId] = (alertsByRule[ruleId] || 0) + 1;
      });

      return {
        totalAlerts: result.totalAlerts,
        alertsBySeverity,
        alertsByRule,
        averageResolutionTime: result.avgResolutionTime || 0,
        falsePositiveRate: 0, // Would need additional logic to calculate
      };
    } catch (error) {
      console.error('Error getting alerting metrics:', error);
      throw new Error(`Failed to get alerting metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private Helper Methods

  private async loadAlertRules(): Promise<void> {
    try {
      const mongodb = this.dbManager.getMongoDB();
      const db = mongodb.getDb();
      const collection = db.collection('alert_rules');

      const rules = await collection.find({}).toArray();
      
      rules.forEach(rule => {
        this.alertRules.set(rule.id, rule);
      });

      console.log(`Loaded ${rules.length} alert rules`);
    } catch (error) {
      console.error('Error loading alert rules:', error);
    }
  }

  private validateAlertRule(rule: AlertRule): void {
    if (!rule.id || !rule.name || !rule.query) {
      throw new Error('Alert rule must have id, name, and query');
    }

    if (!['>', '<', '=', '>=', '<='].includes(rule.operator)) {
      throw new Error('Invalid operator. Must be one of: >, <, =, >=, <=');
    }

    if (!['low', 'medium', 'high', 'critical'].includes(rule.severity)) {
      throw new Error('Invalid severity. Must be one of: low, medium, high, critical');
    }

    if (rule.cooldownMinutes < 0) {
      throw new Error('Cooldown minutes must be non-negative');
    }
  }

  private parseTimeWindow(timeWindow: string): number {
    const value = parseInt(timeWindow.slice(0, -1));
    const unit = timeWindow.slice(-1);
    
    switch (unit) {
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      case 'w':
        return value * 7 * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000; // Default to 24 hours
    }
  }
}