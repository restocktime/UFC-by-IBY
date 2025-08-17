import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config';

export interface ProxyEndpoint {
  host: string;
  port: number;
  username: string;
  password: string;
  country?: string;
  region?: string;
  isHealthy: boolean;
  lastHealthCheck: number;
  responseTime: number;
  failureCount: number;
  successCount: number;
}

export interface ProxyHealthStatus {
  endpoint: ProxyEndpoint;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: number;
  error?: string;
  lastChecked: number;
}

export class ProxyManagerService {
  private static instance: ProxyManagerService;
  private proxyEndpoints: ProxyEndpoint[] = [];
  private currentProxyIndex = 0;
  private healthCheckInterval?: NodeJS.Timeout;
  private rotationInterval?: NodeJS.Timeout;
  private readonly maxFailures = 3;
  private readonly healthCheckIntervalMs = 60000; // 1 minute
  private readonly rotationIntervalMs = config.proxy.oxylabs.rotationInterval;

  private constructor() {
    this.initializeProxyEndpoints();
    this.startHealthChecking();
    this.startProxyRotation();
  }

  public static getInstance(): ProxyManagerService {
    if (!ProxyManagerService.instance) {
      ProxyManagerService.instance = new ProxyManagerService();
    }
    return ProxyManagerService.instance;
  }

  private initializeProxyEndpoints(): void {
    if (!config.proxy.oxylabs.enabled) {
      console.log('Proxy system disabled');
      return;
    }

    const { username, password, host, ports, country } = config.proxy.oxylabs;

    this.proxyEndpoints = ports.map(port => ({
      host,
      port,
      username,
      password,
      country,
      isHealthy: true,
      lastHealthCheck: 0,
      responseTime: 0,
      failureCount: 0,
      successCount: 0
    }));

    console.log(`Initialized ${this.proxyEndpoints.length} proxy endpoints`);
  }

  private startHealthChecking(): void {
    if (!config.proxy.oxylabs.enabled) return;

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckIntervalMs);

    // Perform initial health check
    setTimeout(() => this.performHealthChecks(), 1000);
  }

  private startProxyRotation(): void {
    if (!config.proxy.oxylabs.enabled || this.rotationIntervalMs <= 0) return;

    this.rotationInterval = setInterval(() => {
      this.rotateToNextHealthyProxy();
    }, this.rotationIntervalMs);
  }

  private async performHealthChecks(): Promise<void> {
    const healthPromises = this.proxyEndpoints.map(endpoint => 
      this.checkProxyHealth(endpoint)
    );

    const results = await Promise.allSettled(healthPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        this.updateProxyHealth(this.proxyEndpoints[index], result.value);
      } else {
        this.updateProxyHealth(this.proxyEndpoints[index], {
          endpoint: this.proxyEndpoints[index],
          status: 'unhealthy',
          error: result.reason?.message || 'Health check failed',
          lastChecked: Date.now()
        });
      }
    });

    // Log health status
    const healthyCount = this.proxyEndpoints.filter(p => p.isHealthy).length;
    console.log(`Proxy health check completed: ${healthyCount}/${this.proxyEndpoints.length} healthy`);
  }

  private async checkProxyHealth(endpoint: ProxyEndpoint): Promise<ProxyHealthStatus> {
    const startTime = Date.now();
    const proxyUrl = `http://${endpoint.username}:${endpoint.password}@${endpoint.host}:${endpoint.port}`;
    const agent = new HttpsProxyAgent(proxyUrl);

    try {
      const axios = require('axios');
      const response = await axios.get('https://httpbin.org/ip', {
        httpsAgent: agent,
        timeout: 10000,
        headers: {
          'User-Agent': 'UFC-Prediction-Platform/1.0'
        }
      });

      const responseTime = Date.now() - startTime;

      if (response.status === 200) {
        return {
          endpoint,
          status: 'healthy',
          responseTime,
          lastChecked: Date.now()
        };
      } else {
        return {
          endpoint,
          status: 'unhealthy',
          error: `HTTP ${response.status}`,
          lastChecked: Date.now()
        };
      }
    } catch (error) {
      return {
        endpoint,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: Date.now()
      };
    }
  }

  private updateProxyHealth(endpoint: ProxyEndpoint, healthStatus: ProxyHealthStatus): void {
    endpoint.lastHealthCheck = healthStatus.lastChecked;
    
    if (healthStatus.status === 'healthy') {
      endpoint.isHealthy = true;
      endpoint.responseTime = healthStatus.responseTime || 0;
      endpoint.successCount++;
      endpoint.failureCount = 0; // Reset failure count on success
    } else {
      endpoint.failureCount++;
      if (endpoint.failureCount >= this.maxFailures) {
        endpoint.isHealthy = false;
      }
    }
  }

  private rotateToNextHealthyProxy(): void {
    const healthyProxies = this.proxyEndpoints.filter(p => p.isHealthy);
    
    if (healthyProxies.length === 0) {
      console.warn('No healthy proxies available, using first proxy anyway');
      this.currentProxyIndex = 0;
      return;
    }

    // Find next healthy proxy
    let attempts = 0;
    do {
      this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyEndpoints.length;
      attempts++;
    } while (!this.proxyEndpoints[this.currentProxyIndex].isHealthy && attempts < this.proxyEndpoints.length);

    const currentProxy = this.proxyEndpoints[this.currentProxyIndex];
    console.log(`Rotated to proxy: ${currentProxy.host}:${currentProxy.port} (healthy: ${currentProxy.isHealthy})`);
  }

  public getCurrentProxy(): ProxyEndpoint | null {
    if (!config.proxy.oxylabs.enabled || this.proxyEndpoints.length === 0) {
      return null;
    }

    return this.proxyEndpoints[this.currentProxyIndex];
  }

  public getProxyAgent(): HttpsProxyAgent | null {
    const proxy = this.getCurrentProxy();
    if (!proxy) return null;

    const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    return new HttpsProxyAgent(proxyUrl);
  }

  public getGeoSpecificProxy(country?: string, region?: string): HttpsProxyAgent | null {
    if (!config.proxy.oxylabs.enabled) return null;

    // Find proxy matching geo requirements
    let targetProxy = this.proxyEndpoints.find(p => 
      p.isHealthy && 
      (!country || p.country === country) &&
      (!region || p.region === region)
    );

    // Fallback to any healthy proxy
    if (!targetProxy) {
      targetProxy = this.proxyEndpoints.find(p => p.isHealthy);
    }

    // Fallback to current proxy
    if (!targetProxy) {
      targetProxy = this.getCurrentProxy();
    }

    if (!targetProxy) return null;

    const proxyUrl = `http://${targetProxy.username}:${targetProxy.password}@${targetProxy.host}:${targetProxy.port}`;
    return new HttpsProxyAgent(proxyUrl);
  }

  public getBestPerformingProxy(): ProxyEndpoint | null {
    const healthyProxies = this.proxyEndpoints.filter(p => p.isHealthy);
    
    if (healthyProxies.length === 0) return null;

    // Sort by response time (ascending) and success rate
    return healthyProxies.sort((a, b) => {
      const aSuccessRate = a.successCount / (a.successCount + a.failureCount) || 0;
      const bSuccessRate = b.successCount / (b.successCount + b.failureCount) || 0;
      
      // Prioritize success rate, then response time
      if (Math.abs(aSuccessRate - bSuccessRate) > 0.1) {
        return bSuccessRate - aSuccessRate;
      }
      
      return a.responseTime - b.responseTime;
    })[0];
  }

  public getProxyStats(): {
    total: number;
    healthy: number;
    unhealthy: number;
    averageResponseTime: number;
    currentProxy: ProxyEndpoint | null;
    endpoints: ProxyEndpoint[];
  } {
    const healthy = this.proxyEndpoints.filter(p => p.isHealthy);
    const unhealthy = this.proxyEndpoints.filter(p => !p.isHealthy);
    const avgResponseTime = healthy.length > 0 
      ? healthy.reduce((sum, p) => sum + p.responseTime, 0) / healthy.length 
      : 0;

    return {
      total: this.proxyEndpoints.length,
      healthy: healthy.length,
      unhealthy: unhealthy.length,
      averageResponseTime: Math.round(avgResponseTime),
      currentProxy: this.getCurrentProxy(),
      endpoints: [...this.proxyEndpoints]
    };
  }

  public async testProxyConnectivity(endpoint?: ProxyEndpoint): Promise<ProxyHealthStatus> {
    const targetEndpoint = endpoint || this.getCurrentProxy();
    if (!targetEndpoint) {
      throw new Error('No proxy endpoint available for testing');
    }

    return this.checkProxyHealth(targetEndpoint);
  }

  public markProxyFailure(endpoint: ProxyEndpoint): void {
    endpoint.failureCount++;
    if (endpoint.failureCount >= this.maxFailures) {
      endpoint.isHealthy = false;
      console.warn(`Proxy ${endpoint.host}:${endpoint.port} marked as unhealthy after ${endpoint.failureCount} failures`);
      
      // Rotate to next healthy proxy if current proxy failed
      if (endpoint === this.getCurrentProxy()) {
        this.rotateToNextHealthyProxy();
      }
    }
  }

  public markProxySuccess(endpoint: ProxyEndpoint): void {
    endpoint.successCount++;
    endpoint.failureCount = 0; // Reset failure count on success
    if (!endpoint.isHealthy) {
      endpoint.isHealthy = true;
      console.log(`Proxy ${endpoint.host}:${endpoint.port} restored to healthy status`);
    }
  }

  public destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
    }
    this.proxyEndpoints = [];
  }
}