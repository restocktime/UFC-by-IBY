export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  duration: number;
  details?: any;
  error?: string;
}

export interface HealthCheck {
  name: string;
  check(): Promise<HealthCheckResult>;
  timeout?: number;
  critical?: boolean;
}

export interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  uptime: number;
  version: string;
  checks: Record<string, HealthCheckResult>;
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}

export class HealthChecker {
  private checks: Map<string, HealthCheck> = new Map();
  private lastResults: Map<string, HealthCheckResult> = new Map();

  /**
   * Register a health check
   */
  register(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): void {
    this.checks.delete(name);
    this.lastResults.delete(name);
  }

  /**
   * Run all health checks
   */
  async checkHealth(): Promise<SystemHealth> {
    const startTime = Date.now();
    const results: Record<string, HealthCheckResult> = {};
    const promises: Promise<void>[] = [];

    // Run all checks concurrently
    for (const [name, check] of this.checks) {
      const promise = this.runSingleCheck(name, check)
        .then(result => {
          results[name] = result;
          this.lastResults.set(name, result);
        })
        .catch(error => {
          const errorResult: HealthCheckResult = {
            status: 'unhealthy',
            timestamp: new Date(),
            duration: 0,
            error: error.message
          };
          results[name] = errorResult;
          this.lastResults.set(name, errorResult);
        });

      promises.push(promise);
    }

    await Promise.all(promises);

    // Calculate overall status
    const summary = this.calculateSummary(results);
    const overallStatus = this.determineOverallStatus(results);

    return {
      status: overallStatus,
      timestamp: new Date(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      checks: results,
      summary
    };
  }

  /**
   * Get the last known health status
   */
  getLastKnownHealth(): SystemHealth {
    const results: Record<string, HealthCheckResult> = {};
    
    for (const [name, result] of this.lastResults) {
      results[name] = result;
    }

    const summary = this.calculateSummary(results);
    const overallStatus = this.determineOverallStatus(results);

    return {
      status: overallStatus,
      timestamp: new Date(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      checks: results,
      summary
    };
  }

  /**
   * Check if a specific dependency is healthy
   */
  async checkDependency(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }

    return this.runSingleCheck(name, check);
  }

  private async runSingleCheck(name: string, check: HealthCheck): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timeout = check.timeout || 5000; // Default 5 second timeout

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Health check '${name}' timed out after ${timeout}ms`)), timeout);
      });

      const result = await Promise.race([
        check.check(),
        timeoutPromise
      ]);

      result.duration = Date.now() - startTime;
      return result;

    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private calculateSummary(results: Record<string, HealthCheckResult>) {
    const total = Object.keys(results).length;
    let healthy = 0;
    let unhealthy = 0;
    let degraded = 0;

    for (const result of Object.values(results)) {
      switch (result.status) {
        case 'healthy':
          healthy++;
          break;
        case 'unhealthy':
          unhealthy++;
          break;
        case 'degraded':
          degraded++;
          break;
      }
    }

    return { total, healthy, unhealthy, degraded };
  }

  private determineOverallStatus(results: Record<string, HealthCheckResult>): 'healthy' | 'unhealthy' | 'degraded' {
    const criticalChecks = Array.from(this.checks.values()).filter(check => check.critical);
    
    // Check critical dependencies first
    for (const check of criticalChecks) {
      const result = results[check.name];
      if (result && result.status === 'unhealthy') {
        return 'unhealthy';
      }
    }

    // Check all results
    const statuses = Object.values(results).map(r => r.status);
    
    if (statuses.includes('unhealthy')) {
      return 'degraded'; // Non-critical unhealthy checks result in degraded status
    }
    
    if (statuses.includes('degraded')) {
      return 'degraded';
    }
    
    return 'healthy';
  }
}

// Predefined health checks
export class DatabaseHealthCheck implements HealthCheck {
  name = 'database';
  timeout = 5000;
  critical = true;

  constructor(private connectionTest: () => Promise<boolean>) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const isConnected = await this.connectionTest();
      
      return {
        status: isConnected ? 'healthy' : 'unhealthy',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        details: { connected: isConnected }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Database connection failed'
      };
    }
  }
}

export class RedisHealthCheck implements HealthCheck {
  name = 'redis';
  timeout = 3000;
  critical = false;

  constructor(private pingTest: () => Promise<boolean>) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const isReachable = await this.pingTest();
      
      return {
        status: isReachable ? 'healthy' : 'degraded',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        details: { reachable: isReachable }
      };
    } catch (error) {
      return {
        status: 'degraded',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Redis connection failed'
      };
    }
  }
}

export class ExternalAPIHealthCheck implements HealthCheck {
  timeout = 10000;
  critical = false;

  constructor(
    public name: string,
    private apiTest: () => Promise<{ status: number; responseTime: number }>
  ) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const result = await this.apiTest();
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (result.status >= 500) {
        status = 'unhealthy';
      } else if (result.status >= 400 || result.responseTime > 5000) {
        status = 'degraded';
      }
      
      return {
        status,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        details: {
          httpStatus: result.status,
          responseTime: result.responseTime
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'API request failed'
      };
    }
  }
}

export class MemoryHealthCheck implements HealthCheck {
  name = 'memory';
  timeout = 1000;
  critical = false;

  constructor(private maxHeapUsagePercent: number = 90) {}

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const memUsage = process.memoryUsage();
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (heapUsagePercent > this.maxHeapUsagePercent) {
      status = 'unhealthy';
    } else if (heapUsagePercent > this.maxHeapUsagePercent * 0.8) {
      status = 'degraded';
    }
    
    return {
      status,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      details: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
        rss: memUsage.rss
      }
    };
  }
}

// Global health checker instance
export const healthChecker = new HealthChecker();