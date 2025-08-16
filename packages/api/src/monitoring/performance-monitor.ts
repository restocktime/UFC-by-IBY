import { metrics } from './metrics-collector';

export interface PerformanceMetrics {
  requestCount: number;
  errorCount: number;
  responseTime: number;
  activeConnections: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: number;
}

export interface BusinessMetrics {
  dataIngestionRate: number;
  predictionAccuracy: number;
  userEngagement: number;
  dataFreshness: number;
  alertsGenerated: number;
}

export class PerformanceMonitor {
  private startTime: Date;
  private requestCounter = metrics.counter('http_requests_total', 'Total HTTP requests', ['method', 'status', 'endpoint']);
  private requestDuration = metrics.histogram('http_request_duration_seconds', 'HTTP request duration', [0.1, 0.5, 1, 2, 5], ['method', 'endpoint']);
  private activeConnections = metrics.gauge('http_active_connections', 'Active HTTP connections');
  private memoryUsage = metrics.gauge('memory_usage_bytes', 'Memory usage in bytes', ['type']);
  private cpuUsage = metrics.gauge('cpu_usage_percent', 'CPU usage percentage');
  
  // Business metrics
  private dataIngestionRate = metrics.gauge('data_ingestion_rate', 'Data ingestion rate per minute');
  private predictionAccuracy = metrics.gauge('prediction_accuracy_percent', 'Prediction accuracy percentage');
  private userEngagement = metrics.gauge('user_engagement_score', 'User engagement score');
  private dataFreshness = metrics.gauge('data_freshness_minutes', 'Data freshness in minutes');
  private alertsGenerated = metrics.counter('alerts_generated_total', 'Total alerts generated', ['type', 'severity']);

  constructor() {
    this.startTime = new Date();
    this.startSystemMetricsCollection();
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(method: string, endpoint: string, statusCode: number, duration: number): void {
    const status = Math.floor(statusCode / 100) + 'xx';
    
    this.requestCounter.increment(1, { method, status, endpoint });
    this.requestDuration.observe(duration / 1000, { method, endpoint }); // Convert to seconds
  }

  /**
   * Record active connection change
   */
  recordActiveConnections(count: number): void {
    this.activeConnections.set(count);
  }

  /**
   * Record business metrics
   */
  recordDataIngestion(recordsPerMinute: number): void {
    this.dataIngestionRate.set(recordsPerMinute);
  }

  recordPredictionAccuracy(accuracy: number): void {
    this.predictionAccuracy.set(accuracy * 100); // Convert to percentage
  }

  recordUserEngagement(score: number): void {
    this.userEngagement.set(score);
  }

  recordDataFreshness(ageInMinutes: number): void {
    this.dataFreshness.set(ageInMinutes);
  }

  recordAlert(type: string, severity: string): void {
    this.alertsGenerated.increment(1, { type, severity });
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage();
    
    return {
      requestCount: this.requestCounter.value,
      errorCount: this.getErrorCount(),
      responseTime: this.getAverageResponseTime(),
      activeConnections: this.activeConnections.value,
      memoryUsage: memUsage,
      cpuUsage: this.getCpuUsage()
    };
  }

  /**
   * Get current business metrics
   */
  getCurrentBusinessMetrics(): BusinessMetrics {
    return {
      dataIngestionRate: this.dataIngestionRate.value,
      predictionAccuracy: this.predictionAccuracy.value,
      userEngagement: this.userEngagement.value,
      dataFreshness: this.dataFreshness.value,
      alertsGenerated: this.alertsGenerated.value
    };
  }

  /**
   * Get uptime in seconds
   */
  getUptime(): number {
    return (Date.now() - this.startTime.getTime()) / 1000;
  }

  /**
   * Create middleware for Express to automatically track requests
   */
  createExpressMiddleware() {
    return (req: any, res: any, next: any) => {
      const startTime = Date.now();
      
      // Increment active connections
      this.activeConnections.increment();

      // Track when response finishes
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const endpoint = this.sanitizeEndpoint(req.route?.path || req.path);
        
        this.recordHttpRequest(req.method, endpoint, res.statusCode, duration);
        this.activeConnections.decrement();
      });

      next();
    };
  }

  /**
   * Start collecting system metrics periodically
   */
  private startSystemMetricsCollection(): void {
    setInterval(() => {
      this.collectSystemMetrics();
    }, 10000); // Collect every 10 seconds
  }

  private collectSystemMetrics(): void {
    // Memory metrics
    const memUsage = process.memoryUsage();
    this.memoryUsage.set(memUsage.heapUsed, { type: 'heap_used' });
    this.memoryUsage.set(memUsage.heapTotal, { type: 'heap_total' });
    this.memoryUsage.set(memUsage.rss, { type: 'rss' });
    this.memoryUsage.set(memUsage.external, { type: 'external' });

    // CPU metrics (simplified)
    const cpuUsage = this.getCpuUsage();
    this.cpuUsage.set(cpuUsage);
  }

  private getErrorCount(): number {
    // Count 4xx and 5xx responses
    const allMetrics = metrics.getAllMetrics();
    const requestMetric = allMetrics.get('http_requests_total');
    
    if (!requestMetric) return 0;
    
    // This is a simplified implementation
    // In a real scenario, you'd track error counts separately
    return 0;
  }

  private getAverageResponseTime(): number {
    const allMetrics = metrics.getAllMetrics();
    const durationMetric = allMetrics.get('http_request_duration_seconds');
    
    if (!durationMetric) return 0;
    
    return durationMetric.value * 1000; // Convert to milliseconds
  }

  private getCpuUsage(): number {
    // Simplified CPU usage calculation
    // In production, you'd use more sophisticated methods
    const usage = process.cpuUsage();
    return (usage.user + usage.system) / 1000000; // Convert to percentage approximation
  }

  private sanitizeEndpoint(path: string): string {
    // Replace dynamic segments with placeholders
    return path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
      .replace(/\/[a-f0-9]{24}/g, '/:objectId');
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();