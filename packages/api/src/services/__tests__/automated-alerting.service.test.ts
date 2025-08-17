import { AutomatedAlertingService, AlertRule, AlertEvent } from '../automated-alerting.service';
import { DatabaseManager } from '../../database';

// Mock dependencies
jest.mock('../../database');

describe('AutomatedAlertingService', () => {
  let service: AutomatedAlertingService;
  let mockDbManager: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock DatabaseManager
    mockDbManager = {
      getInstance: jest.fn(),
      getInfluxDB: jest.fn(),
      getMongoDB: jest.fn(),
    } as any;

    // Mock InfluxDB
    const mockInfluxDB = {
      getWriteApi: jest.fn().mockReturnValue({
        writePoint: jest.fn(),
        flush: jest.fn(),
      }),
      getQueryApi: jest.fn().mockReturnValue({
        collectRows: jest.fn(),
      }),
      createPoint: jest.fn().mockReturnValue({
        tag: jest.fn().mockReturnThis(),
        stringField: jest.fn().mockReturnThis(),
        floatField: jest.fn().mockReturnThis(),
        timestamp: jest.fn().mockReturnThis(),
      }),
    };

    mockDbManager.getInfluxDB.mockReturnValue(mockInfluxDB as any);

    // Mock MongoDB
    const mockMongoDB = {
      getDb: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
          }),
          replaceOne: jest.fn(),
          updateOne: jest.fn(),
          deleteOne: jest.fn(),
          insertOne: jest.fn(),
          aggregate: jest.fn().mockReturnValue({
            toArray: jest.fn(),
          }),
        }),
      }),
    };

    mockDbManager.getMongoDB.mockReturnValue(mockMongoDB as any);

    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDbManager);

    // Create service instance
    service = new AutomatedAlertingService();
  });

  describe('createAlertRule', () => {
    it('should create alert rule successfully', async () => {
      const rule: AlertRule = {
        id: 'rule1',
        name: 'High CPU Usage',
        description: 'Alert when CPU usage exceeds 80%',
        query: 'from(bucket: "ufc-data") |> range(start: -${timeWindow}) |> filter(fn: (r) => r._measurement == "system_health") |> mean()',
        threshold: 80,
        operator: '>',
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 15,
        actions: {
          email: ['admin@example.com'],
        },
      };

      const mockCollection = {
        replaceOne: jest.fn().mockResolvedValue({ upsertedId: 'rule1' }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await service.createAlertRule(rule);

      expect(mockCollection.replaceOne).toHaveBeenCalledWith(
        { id: rule.id },
        expect.objectContaining({
          ...rule,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
        { upsert: true }
      );
    });

    it('should validate alert rule before creating', async () => {
      const invalidRule: AlertRule = {
        id: '',
        name: '',
        description: 'Invalid rule',
        query: '',
        threshold: 80,
        operator: 'invalid' as any,
        timeWindow: '5m',
        severity: 'invalid' as any,
        enabled: true,
        cooldownMinutes: -5,
        actions: {},
      };

      await expect(service.createAlertRule(invalidRule))
        .rejects.toThrow('Alert rule must have id, name, and query');
    });

    it('should handle creation errors', async () => {
      const rule: AlertRule = {
        id: 'rule1',
        name: 'Test Rule',
        description: 'Test',
        query: 'test query',
        threshold: 80,
        operator: '>',
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 15,
        actions: {},
      };

      const mockCollection = {
        replaceOne: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await expect(service.createAlertRule(rule))
        .rejects.toThrow('Failed to create alert rule');
    });
  });

  describe('updateAlertRule', () => {
    it('should update alert rule successfully', async () => {
      const ruleId = 'rule1';
      const updates = {
        threshold: 90,
        severity: 'critical' as const,
      };

      // Mock existing rule
      const existingRule: AlertRule = {
        id: ruleId,
        name: 'Test Rule',
        description: 'Test',
        query: 'test query',
        threshold: 80,
        operator: '>',
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 15,
        actions: {},
      };

      // Set up the rule in service
      await service.createAlertRule(existingRule);

      const mockCollection = {
        replaceOne: jest.fn(),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await service.updateAlertRule(ruleId, updates);

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { id: ruleId },
        { $set: expect.objectContaining({ ...updates, updatedAt: expect.any(Date) }) }
      );
    });

    it('should handle non-existent rule', async () => {
      const ruleId = 'nonexistent';
      const updates = { threshold: 90 };

      await expect(service.updateAlertRule(ruleId, updates))
        .rejects.toThrow('Alert rule not found: nonexistent');
    });

    it('should handle update errors', async () => {
      const ruleId = 'rule1';
      const updates = { threshold: 90 };

      // Create rule first
      const rule: AlertRule = {
        id: ruleId,
        name: 'Test Rule',
        description: 'Test',
        query: 'test query',
        threshold: 80,
        operator: '>',
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 15,
        actions: {},
      };

      await service.createAlertRule(rule);

      const mockCollection = {
        replaceOne: jest.fn(),
        updateOne: jest.fn().mockRejectedValue(new Error('Update failed')),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await expect(service.updateAlertRule(ruleId, updates))
        .rejects.toThrow('Failed to update alert rule');
    });
  });

  describe('deleteAlertRule', () => {
    it('should delete alert rule successfully', async () => {
      const ruleId = 'rule1';

      // Create rule first
      const rule: AlertRule = {
        id: ruleId,
        name: 'Test Rule',
        description: 'Test',
        query: 'test query',
        threshold: 80,
        operator: '>',
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 15,
        actions: {},
      };

      await service.createAlertRule(rule);

      const mockCollection = {
        replaceOne: jest.fn(),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await service.deleteAlertRule(ruleId);

      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ id: ruleId });
    });

    it('should handle non-existent rule deletion', async () => {
      const ruleId = 'nonexistent';

      await expect(service.deleteAlertRule(ruleId))
        .rejects.toThrow('Alert rule not found: nonexistent');
    });

    it('should handle deletion errors', async () => {
      const ruleId = 'rule1';

      // Create rule first
      const rule: AlertRule = {
        id: ruleId,
        name: 'Test Rule',
        description: 'Test',
        query: 'test query',
        threshold: 80,
        operator: '>',
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 15,
        actions: {},
      };

      await service.createAlertRule(rule);

      const mockCollection = {
        replaceOne: jest.fn(),
        deleteOne: jest.fn().mockRejectedValue(new Error('Delete failed')),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await expect(service.deleteAlertRule(ruleId))
        .rejects.toThrow('Failed to delete alert rule');
    });
  });

  describe('getAlertRules', () => {
    it('should return all alert rules', async () => {
      const rule1: AlertRule = {
        id: 'rule1',
        name: 'Rule 1',
        description: 'Test rule 1',
        query: 'test query 1',
        threshold: 80,
        operator: '>',
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 15,
        actions: {},
      };

      const rule2: AlertRule = {
        id: 'rule2',
        name: 'Rule 2',
        description: 'Test rule 2',
        query: 'test query 2',
        threshold: 90,
        operator: '<',
        timeWindow: '10m',
        severity: 'medium',
        enabled: false,
        cooldownMinutes: 30,
        actions: {},
      };

      await service.createAlertRule(rule1);
      await service.createAlertRule(rule2);

      const rules = await service.getAlertRules();

      expect(rules).toHaveLength(2);
      expect(rules.find(r => r.id === 'rule1')).toBeDefined();
      expect(rules.find(r => r.id === 'rule2')).toBeDefined();
    });
  });

  describe('getAlertRule', () => {
    it('should return specific alert rule', async () => {
      const rule: AlertRule = {
        id: 'rule1',
        name: 'Test Rule',
        description: 'Test',
        query: 'test query',
        threshold: 80,
        operator: '>',
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 15,
        actions: {},
      };

      await service.createAlertRule(rule);

      const retrievedRule = await service.getAlertRule('rule1');

      expect(retrievedRule).toBeDefined();
      expect(retrievedRule?.id).toBe('rule1');
      expect(retrievedRule?.name).toBe('Test Rule');
    });

    it('should return null for non-existent rule', async () => {
      const rule = await service.getAlertRule('nonexistent');
      expect(rule).toBeNull();
    });
  });

  describe('monitoring control', () => {
    it('should start monitoring successfully', () => {
      expect(service.isMonitoringActive()).toBe(false);

      service.startMonitoring(1);

      expect(service.isMonitoringActive()).toBe(true);
    });

    it('should stop monitoring successfully', () => {
      service.startMonitoring(1);
      expect(service.isMonitoringActive()).toBe(true);

      service.stopMonitoring();

      expect(service.isMonitoringActive()).toBe(false);
    });

    it('should not start monitoring if already running', () => {
      service.startMonitoring(1);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      service.startMonitoring(1);

      expect(consoleSpy).toHaveBeenCalledWith('Monitoring is already running');
      consoleSpy.mockRestore();
    });

    it('should not stop monitoring if not running', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      service.stopMonitoring();

      expect(consoleSpy).toHaveBeenCalledWith('Monitoring is not running');
      consoleSpy.mockRestore();
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge alert successfully', async () => {
      const alertId = 'alert123';
      const acknowledgedBy = 'admin@example.com';

      const mockCollection = {
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await service.acknowledgeAlert(alertId, acknowledgedBy);

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: alertId },
        {
          $set: {
            acknowledged: true,
            acknowledgedBy,
            acknowledgedAt: expect.any(Date),
          },
        }
      );
    });

    it('should handle acknowledge errors', async () => {
      const alertId = 'alert123';
      const acknowledgedBy = 'admin@example.com';

      const mockCollection = {
        updateOne: jest.fn().mockRejectedValue(new Error('Update failed')),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await expect(service.acknowledgeAlert(alertId, acknowledgedBy))
        .rejects.toThrow('Failed to acknowledge alert');
    });
  });

  describe('resolveAlert', () => {
    it('should resolve alert successfully', async () => {
      const alertId = 'alert123';
      const resolvedBy = 'admin@example.com';
      const resolution = 'Fixed the underlying issue';

      const mockCollection = {
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await service.resolveAlert(alertId, resolvedBy, resolution);

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: alertId },
        {
          $set: {
            resolved: true,
            resolvedBy,
            resolvedAt: expect.any(Date),
            resolution,
          },
        }
      );
    });

    it('should resolve alert with default resolution', async () => {
      const alertId = 'alert123';
      const resolvedBy = 'admin@example.com';

      const mockCollection = {
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await service.resolveAlert(alertId, resolvedBy);

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: alertId },
        {
          $set: {
            resolved: true,
            resolvedBy,
            resolvedAt: expect.any(Date),
            resolution: 'Manually resolved',
          },
        }
      );
    });

    it('should handle resolve errors', async () => {
      const alertId = 'alert123';
      const resolvedBy = 'admin@example.com';

      const mockCollection = {
        updateOne: jest.fn().mockRejectedValue(new Error('Update failed')),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await expect(service.resolveAlert(alertId, resolvedBy))
        .rejects.toThrow('Failed to resolve alert');
    });
  });

  describe('getAlertingMetrics', () => {
    it('should get alerting metrics successfully', async () => {
      const mockCollection = {
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            {
              _id: null,
              totalAlerts: 100,
              alertsBySeverity: ['high', 'medium', 'high', 'low'],
              alertsByRule: ['rule1', 'rule2', 'rule1'],
              resolvedAlerts: 80,
              avgResolutionTime: 3600000, // 1 hour in ms
            },
          ]),
        }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      const metrics = await service.getAlertingMetrics('24h');

      expect(metrics.totalAlerts).toBe(100);
      expect(metrics.alertsBySeverity).toEqual({
        high: 2,
        medium: 1,
        low: 1,
      });
      expect(metrics.alertsByRule).toEqual({
        rule1: 2,
        rule2: 1,
      });
      expect(metrics.averageResolutionTime).toBe(3600000);
    });

    it('should return default metrics when no data available', async () => {
      const mockCollection = {
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      const metrics = await service.getAlertingMetrics('24h');

      expect(metrics.totalAlerts).toBe(0);
      expect(metrics.alertsBySeverity).toEqual({});
      expect(metrics.alertsByRule).toEqual({});
      expect(metrics.averageResolutionTime).toBe(0);
      expect(metrics.falsePositiveRate).toBe(0);
    });

    it('should handle metrics query errors', async () => {
      const mockCollection = {
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockRejectedValue(new Error('Query failed')),
        }),
      };

      mockDbManager.getMongoDB().getDb().collection.mockReturnValue(mockCollection as any);

      await expect(service.getAlertingMetrics('24h'))
        .rejects.toThrow('Failed to get alerting metrics');
    });
  });

  describe('event emission', () => {
    it('should emit events for rule lifecycle', async () => {
      const ruleCreatedSpy = jest.fn();
      const ruleUpdatedSpy = jest.fn();
      const ruleDeletedSpy = jest.fn();

      service.on('ruleCreated', ruleCreatedSpy);
      service.on('ruleUpdated', ruleUpdatedSpy);
      service.on('ruleDeleted', ruleDeletedSpy);

      const rule: AlertRule = {
        id: 'rule1',
        name: 'Test Rule',
        description: 'Test',
        query: 'test query',
        threshold: 80,
        operator: '>',
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        cooldownMinutes: 15,
        actions: {},
      };

      // Create rule
      await service.createAlertRule(rule);
      expect(ruleCreatedSpy).toHaveBeenCalledWith(rule);

      // Update rule
      await service.updateAlertRule('rule1', { threshold: 90 });
      expect(ruleUpdatedSpy).toHaveBeenCalled();

      // Delete rule
      await service.deleteAlertRule('rule1');
      expect(ruleDeletedSpy).toHaveBeenCalled();
    });

    it('should emit monitoring events', () => {
      const monitoringStartedSpy = jest.fn();
      const monitoringStoppedSpy = jest.fn();

      service.on('monitoringStarted', monitoringStartedSpy);
      service.on('monitoringStopped', monitoringStoppedSpy);

      service.startMonitoring(2);
      expect(monitoringStartedSpy).toHaveBeenCalledWith({ intervalMinutes: 2 });

      service.stopMonitoring();
      expect(monitoringStoppedSpy).toHaveBeenCalled();
    });
  });
});