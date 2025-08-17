import { Request, Response } from 'express';
import { ProxyManagerService } from '../services/proxy-manager.service';
import { CacheManagerService } from '../services/cache-manager.service';
import { RequestQueueService } from '../services/request-queue.service';

export class ProxyHealthController {
  private proxyManager: ProxyManagerService;
  private cacheManager: CacheManagerService;
  private requestQueue: RequestQueueService;

  constructor() {
    this.proxyManager = ProxyManagerService.getInstance();
    this.cacheManager = CacheManagerService.getInstance();
    this.requestQueue = RequestQueueService.getInstance();
  }

  /**
   * Get comprehensive proxy infrastructure health status
   */
  public async getHealthStatus(req: Request, res: Response): Promise<void> {
    try {
      const [proxyStats, cacheHealth, queueStats] = await Promise.all([
        this.proxyManager.getProxyStats(),
        this.cacheManager.healthCheck(),
        this.getQueueHealthStatus()
      ]);

      const healthStatus = {
        timestamp: new Date().toISOString(),
        overall: this.calculateOverallHealth(proxyStats, cacheHealth, queueStats),
        proxy: {
          status: proxyStats.healthy > 0 ? 'healthy' : 'unhealthy',
          totalEndpoints: proxyStats.total,
          healthyEndpoints: proxyStats.healthy,
          unhealthyEndpoints: proxyStats.unhealthy,
          averageResponseTime: proxyStats.averageResponseTime,
          currentProxy: proxyStats.currentProxy ? {
            host: proxyStats.currentProxy.host,
            port: proxyStats.currentProxy.port,
            country: proxyStats.currentProxy.country,
            isHealthy: proxyStats.currentProxy.isHealthy,
            responseTime: proxyStats.currentProxy.responseTime,
            successCount: proxyStats.currentProxy.successCount,
            failureCount: proxyStats.currentProxy.failureCount
          } : null
        },
        cache: {
          redis: {
            status: cacheHealth.redis.status ? 'healthy' : 'unhealthy',
            responseTime: cacheHealth.redis.responseTime,
            error: cacheHealth.redis.error
          },
          local: {
            status: cacheHealth.local.status ? 'healthy' : 'unhealthy',
            keyCount: cacheHealth.local.keyCount,
            memoryUsage: cacheHealth.local.memoryUsage
          },
          stats: this.cacheManager.getStats()
        },
        requestQueue: queueStats
      };

      res.json(healthStatus);
    } catch (error) {
      console.error('Error getting health status:', error);
      res.status(500).json({
        error: 'Failed to get health status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get detailed proxy statistics
   */
  public async getProxyStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.proxyManager.getProxyStats();
      
      const detailedStats = {
        ...stats,
        endpoints: stats.endpoints.map(endpoint => ({
          host: endpoint.host,
          port: endpoint.port,
          country: endpoint.country,
          region: endpoint.region,
          isHealthy: endpoint.isHealthy,
          lastHealthCheck: new Date(endpoint.lastHealthCheck).toISOString(),
          responseTime: endpoint.responseTime,
          successCount: endpoint.successCount,
          failureCount: endpoint.failureCount,
          successRate: endpoint.successCount + endpoint.failureCount > 0 
            ? (endpoint.successCount / (endpoint.successCount + endpoint.failureCount) * 100).toFixed(2) + '%'
            : 'N/A'
        }))
      };

      res.json(detailedStats);
    } catch (error) {
      console.error('Error getting proxy stats:', error);
      res.status(500).json({
        error: 'Failed to get proxy statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Test connectivity of a specific proxy endpoint
   */
  public async testProxyConnectivity(req: Request, res: Response): Promise<void> {
    try {
      const { host, port } = req.params;
      
      if (!host || !port) {
        res.status(400).json({
          error: 'Missing required parameters',
          message: 'Host and port are required'
        });
        return;
      }

      const stats = this.proxyManager.getProxyStats();
      const endpoint = stats.endpoints.find(e => 
        e.host === host && e.port === parseInt(port, 10)
      );

      if (!endpoint) {
        res.status(404).json({
          error: 'Proxy endpoint not found',
          message: `No proxy endpoint found for ${host}:${port}`
        });
        return;
      }

      const healthStatus = await this.proxyManager.testProxyConnectivity(endpoint);
      
      res.json({
        endpoint: {
          host: endpoint.host,
          port: endpoint.port,
          country: endpoint.country
        },
        test: {
          status: healthStatus.status,
          responseTime: healthStatus.responseTime,
          error: healthStatus.error,
          timestamp: new Date(healthStatus.lastChecked).toISOString()
        }
      });
    } catch (error) {
      console.error('Error testing proxy connectivity:', error);
      res.status(500).json({
        error: 'Failed to test proxy connectivity',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get cache statistics and memory usage
   */
  public async getCacheStats(req: Request, res: Response): Promise<void> {
    try {
      const [stats, memoryInfo] = await Promise.all([
        this.cacheManager.getStats(),
        this.cacheManager.getMemoryInfo()
      ]);

      res.json({
        statistics: stats,
        memory: memoryInfo,
        performance: {
          hitRate: stats.hitRate.toFixed(2) + '%',
          averageResponseTime: stats.hits > 0 ? 'N/A' : 'N/A', // Would need to track this
          efficiency: stats.hits + stats.misses > 0 
            ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%'
            : 'N/A'
        }
      });
    } catch (error) {
      console.error('Error getting cache stats:', error);
      res.status(500).json({
        error: 'Failed to get cache statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get request queue statistics
   */
  public async getQueueStats(req: Request, res: Response): Promise<void> {
    try {
      const { apiSource } = req.query;
      
      if (apiSource && typeof apiSource === 'string') {
        const stats = this.requestQueue.getQueueStats(apiSource);
        const rateLimitStatus = this.requestQueue.getRateLimitStatus(apiSource);
        
        res.json({
          apiSource,
          statistics: stats,
          rateLimits: rateLimitStatus
        });
      } else {
        const allStats = this.requestQueue.getQueueStats() as Map<string, any>;
        const allRateLimits = this.requestQueue.getRateLimitStatus() as Map<string, any>;
        
        const response: any = {
          summary: {
            totalAPIs: allStats.size,
            totalPending: 0,
            totalProcessing: 0,
            totalCompleted: 0,
            totalFailed: 0
          },
          apiSources: {}
        };

        // Calculate summary and format response
        for (const [apiSource, stats] of allStats.entries()) {
          response.summary.totalPending += stats.pending;
          response.summary.totalProcessing += stats.processing;
          response.summary.totalCompleted += stats.completed;
          response.summary.totalFailed += stats.failed;
          
          response.apiSources[apiSource] = {
            statistics: stats,
            rateLimits: allRateLimits.get(apiSource)
          };
        }

        res.json(response);
      }
    } catch (error) {
      console.error('Error getting queue stats:', error);
      res.status(500).json({
        error: 'Failed to get queue statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clear cache by namespace or entirely
   */
  public async clearCache(req: Request, res: Response): Promise<void> {
    try {
      const { namespace } = req.body;
      
      const deletedCount = await this.cacheManager.clear(namespace);
      
      res.json({
        success: true,
        message: namespace 
          ? `Cleared ${deletedCount} keys from namespace: ${namespace}`
          : `Cleared entire cache (${deletedCount} operation)`,
        deletedCount,
        namespace: namespace || 'all'
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
      res.status(500).json({
        error: 'Failed to clear cache',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clear request queue for specific API source
   */
  public async clearQueue(req: Request, res: Response): Promise<void> {
    try {
      const { apiSource } = req.params;
      
      if (!apiSource) {
        res.status(400).json({
          error: 'Missing required parameter',
          message: 'API source is required'
        });
        return;
      }

      const clearedCount = this.requestQueue.clearQueue(apiSource);
      
      res.json({
        success: true,
        message: `Cleared ${clearedCount} pending requests from queue: ${apiSource}`,
        clearedCount,
        apiSource
      });
    } catch (error) {
      console.error('Error clearing queue:', error);
      res.status(500).json({
        error: 'Failed to clear queue',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Force proxy rotation
   */
  public async rotateProxy(req: Request, res: Response): Promise<void> {
    try {
      const currentProxy = this.proxyManager.getCurrentProxy();
      const bestProxy = this.proxyManager.getBestPerformingProxy();
      
      // This would trigger rotation in the proxy manager
      // For now, we'll just return the current and best proxy info
      
      res.json({
        success: true,
        message: 'Proxy rotation information',
        current: currentProxy ? {
          host: currentProxy.host,
          port: currentProxy.port,
          country: currentProxy.country,
          isHealthy: currentProxy.isHealthy,
          responseTime: currentProxy.responseTime
        } : null,
        recommended: bestProxy ? {
          host: bestProxy.host,
          port: bestProxy.port,
          country: bestProxy.country,
          isHealthy: bestProxy.isHealthy,
          responseTime: bestProxy.responseTime,
          successRate: bestProxy.successCount + bestProxy.failureCount > 0 
            ? ((bestProxy.successCount / (bestProxy.successCount + bestProxy.failureCount)) * 100).toFixed(2) + '%'
            : 'N/A'
        } : null
      });
    } catch (error) {
      console.error('Error rotating proxy:', error);
      res.status(500).json({
        error: 'Failed to rotate proxy',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private calculateOverallHealth(proxyStats: any, cacheHealth: any, queueStats: any): string {
    const proxyHealthy = proxyStats.healthy > 0;
    const cacheHealthy = cacheHealth.redis.status && cacheHealth.local.status;
    const queueHealthy = queueStats.overall === 'healthy';

    if (proxyHealthy && cacheHealthy && queueHealthy) {
      return 'healthy';
    } else if (proxyHealthy || cacheHealthy) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }

  private async getQueueHealthStatus(): Promise<any> {
    const allStats = this.requestQueue.getQueueStats() as Map<string, any>;
    const allRateLimits = this.requestQueue.getRateLimitStatus() as Map<string, any>;

    let totalPending = 0;
    let totalProcessing = 0;
    let totalFailed = 0;
    let hasIssues = false;

    for (const [apiSource, stats] of allStats.entries()) {
      totalPending += stats.pending;
      totalProcessing += stats.processing;
      totalFailed += stats.failed;

      // Check for potential issues
      if (stats.pending > 100 || stats.failed > stats.completed * 0.1) {
        hasIssues = true;
      }
    }

    return {
      overall: hasIssues ? 'degraded' : 'healthy',
      totalPending,
      totalProcessing,
      totalFailed,
      apiSourceCount: allStats.size,
      issues: hasIssues ? ['High pending count or failure rate detected'] : []
    };
  }
}