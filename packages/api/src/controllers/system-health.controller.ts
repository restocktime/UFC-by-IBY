import { Request, Response } from 'express';
import { PerformanceMonitoringService } from '../services/performance-monitoring.service';
import { DatabaseManager } from '../database';

export class SystemHealthController {
  private performanceService: PerformanceMonitoringService;
  private dbManager: DatabaseManager;

  constructor() {
    this.performanceService = new PerformanceMonitoringService();
    this.dbManager = DatabaseManager.getInstance();
  }

  // Health Check Endpoints

  async getHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const healthStatus = await this.dbManager.healthCheck();
      
      res.status(healthStatus.overall === 'healthy' ? 200 : 503).json({
        status: healthStatus.overall,
        timestamp: healthStatus.timestamp,
        services: healthStatus.services,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version,
      });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    }
  }

  async getDetailedHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const [
        dbHealth,
        systemHealth,
        performanceDashboard,
      ] = await Promise.all([
        this.dbManager.healthCheck(),
        this.performanceService.getSystemHealthStatus(),
        this.performanceService.getPerformanceDashboard(),
      ]);

      res.json({
        overall: dbHealth.overall,
        timestamp: new Date(),
        database: {
          ...dbHealth.services,
          details: systemHealth,
        },
        performance: performanceDashboard,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
      });
    } catch (error) {
      console.error('Detailed health check failed:', error);
      res.status(500).json({
        error: 'Failed to get detailed health status',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Performance Monitoring Endpoints

  async getPerformanceDashboard(req: Request, res: Response): Promise<void> {
    try {
      const dashboard = await this.performanceService.getPerformanceDashboard();
      res.json(dashboard);
    } catch (error) {
      console.error('Error getting performance dashboard:', error);
      res.status(500).json({
        error: 'Failed to get performance dashboard',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getPredictionAccuracy(req: Request, res: Response): Promise<void> {
    try {
      const { timeWindow = '30d' } = req.query;
      
      const [accuracyOverTime, accuracyByWeightClass] = await Promise.all([
        this.performanceService.getPredictionAccuracyOverTime(timeWindow as string),
        this.performanceService.getPredictionAccuracyByWeightClass(timeWindow as string),
      ]);

      res.json({
        timeWindow,
        accuracyOverTime,
        accuracyByWeightClass,
      });
    } catch (error) {
      console.error('Error getting prediction accuracy:', error);
      res.status(500).json({
        error: 'Failed to get prediction accuracy',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getAPIPerformance(req: Request, res: Response): Promise<void> {
    try {
      const { timeWindow = '24h' } = req.query;
      
      const [metrics, slowestEndpoints] = await Promise.all([
        this.performanceService.getAPIPerformanceMetrics(timeWindow as string),
        this.performanceService.getSlowestEndpoints(10, timeWindow as string),
      ]);

      res.json({
        timeWindow,
        metrics,
        slowestEndpoints,
      });
    } catch (error) {
      console.error('Error getting API performance:', error);
      res.status(500).json({
        error: 'Failed to get API performance',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Alert Management Endpoints

  async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const { timeWindow = '24h', severity } = req.query;
      
      // Get recent alerts from InfluxDB
      const influxDB = this.dbManager.getInfluxDB();
      const queryApi = influxDB.getQueryApi();

      let query = `
        from(bucket: "ufc-data")
        |> range(start: -${timeWindow})
        |> filter(fn: (r) => r._measurement == "alerts")
      `;

      if (severity) {
        query += `|> filter(fn: (r) => r.severity == "${severity}")`;
      }

      query += `
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 100)
      `;

      const results = await queryApi.collectRows(query);
      
      const alerts = results.map(row => ({
        alertId: row.alertId,
        alertName: row.alertName,
        severity: row.severity,
        message: row.message,
        timestamp: new Date(row._time),
      }));

      res.json({
        timeWindow,
        severity: severity || 'all',
        alerts,
        total: alerts.length,
      });
    } catch (error) {
      console.error('Error getting alerts:', error);
      res.status(500).json({
        error: 'Failed to get alerts',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async configureAlert(req: Request, res: Response): Promise<void> {
    try {
      const alertConfig = req.body;
      
      // Validate alert configuration
      if (!alertConfig.id || !alertConfig.name || !alertConfig.type) {
        res.status(400).json({
          error: 'Invalid alert configuration',
          message: 'Missing required fields: id, name, type',
        });
        return;
      }

      await this.performanceService.configureAlert(alertConfig);
      
      res.json({
        message: 'Alert configuration saved successfully',
        alertId: alertConfig.id,
      });
    } catch (error) {
      console.error('Error configuring alert:', error);
      res.status(500).json({
        error: 'Failed to configure alert',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // System Metrics Endpoints

  async getSystemMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { timeWindow = '1h' } = req.query;
      
      // Get system metrics from InfluxDB
      const influxDB = this.dbManager.getInfluxDB();
      const queryApi = influxDB.getQueryApi();

      const query = `
        from(bucket: "ufc-data")
        |> range(start: -${timeWindow})
        |> filter(fn: (r) => r._measurement == "system_health")
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"])
      `;

      const results = await queryApi.collectRows(query);
      
      const metrics = results.map(row => ({
        timestamp: new Date(row._time),
        component: row.component,
        database: row.database,
        cpu: {
          usage: row.usage,
          load: [row.load_1m, row.load_5m, row.load_15m],
        },
        memory: {
          used: row.used,
          total: row.total,
          percentage: row.percentage,
        },
        responseTime: row.responseTime,
        status: row.status,
      }));

      res.json({
        timeWindow,
        metrics,
        current: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        },
      });
    } catch (error) {
      console.error('Error getting system metrics:', error);
      res.status(500).json({
        error: 'Failed to get system metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Database Performance Endpoints

  async getDatabasePerformance(req: Request, res: Response): Promise<void> {
    try {
      const { timeWindow = '1h' } = req.query;
      
      const [dbHealth, systemHealth] = await Promise.all([
        this.dbManager.healthCheck(),
        this.performanceService.getSystemHealthStatus(),
      ]);

      // Get database performance metrics from InfluxDB
      const influxDB = this.dbManager.getInfluxDB();
      const queryApi = influxDB.getQueryApi();

      const query = `
        from(bucket: "ufc-data")
        |> range(start: -${timeWindow})
        |> filter(fn: (r) => r._measurement == "system_health")
        |> filter(fn: (r) => r.component == "database")
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"])
      `;

      const performanceHistory = await queryApi.collectRows(query);

      res.json({
        timeWindow,
        current: {
          health: dbHealth,
          details: systemHealth,
        },
        history: performanceHistory.map(row => ({
          timestamp: new Date(row._time),
          database: row.database,
          status: row.status,
          responseTime: row.responseTime,
        })),
      });
    } catch (error) {
      console.error('Error getting database performance:', error);
      res.status(500).json({
        error: 'Failed to get database performance',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Utility Endpoints

  async triggerHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      // Force a comprehensive health check
      const healthStatus = await this.dbManager.healthCheck();
      
      // Log the health check
      const influxDB = this.dbManager.getInfluxDB();
      const writeApi = influxDB.getWriteApi();
      
      const healthPoint = influxDB.createPoint('health_checks')
        .tag('type', 'manual')
        .stringField('status', healthStatus.overall)
        .intField('services_healthy', Object.values(healthStatus.services).filter(s => s.status === 'healthy').length)
        .intField('services_total', Object.keys(healthStatus.services).length)
        .timestamp(new Date());

      await writeApi.writePoint(healthPoint);
      await writeApi.flush();

      res.json({
        message: 'Health check completed',
        status: healthStatus.overall,
        timestamp: new Date(),
        services: healthStatus.services,
      });
    } catch (error) {
      console.error('Error triggering health check:', error);
      res.status(500).json({
        error: 'Failed to trigger health check',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getSystemInfo(req: Request, res: Response): Promise<void> {
    try {
      const systemInfo = {
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime(),
          pid: process.pid,
        },
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date(),
      };

      res.json(systemInfo);
    } catch (error) {
      console.error('Error getting system info:', error);
      res.status(500).json({
        error: 'Failed to get system info',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}