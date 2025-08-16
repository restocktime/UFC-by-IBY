import { EventEmitter } from 'events';
import { SourceConfig, DataIngestionResult, ValidationError } from '@ufc-platform/shared';

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol: 'http' | 'https' | 'socks4' | 'socks5';
}

export interface ScrapingConfig extends SourceConfig {
  userAgents: string[];
  proxies: ProxyConfig[];
  requestDelay: {
    min: number;
    max: number;
  };
  antiDetection: {
    randomizeHeaders: boolean;
    rotateProxies: boolean;
    respectRobotsTxt: boolean;
  };
}

export interface ScrapingSession {
  id: string;
  proxy?: ProxyConfig;
  userAgent: string;
  cookies: Record<string, string>;
  requestCount: number;
  lastRequestTime: number;
  blocked: boolean;
}

export abstract class ScrapingEngine extends EventEmitter {
  protected config: ScrapingConfig;
  protected sessions: Map<string, ScrapingSession>;
  protected currentSessionIndex: number;
  protected blockedProxies: Set<string>;

  constructor(
    protected sourceId: string,
    config: ScrapingConfig
  ) {
    super();
    this.config = config;
    this.sessions = new Map();
    this.currentSessionIndex = 0;
    this.blockedProxies = new Set();
    
    this.initializeSessions();
  }

  private initializeSessions(): void {
    // Create sessions for each proxy or at least one session without proxy
    const proxies = this.config.proxies.length > 0 ? this.config.proxies : [undefined];
    
    proxies.forEach((proxy, index) => {
      const sessionId = `session_${index}`;
      const session: ScrapingSession = {
        id: sessionId,
        proxy,
        userAgent: this.getRandomUserAgent(),
        cookies: {},
        requestCount: 0,
        lastRequestTime: 0,
        blocked: false
      };
      
      this.sessions.set(sessionId, session);
    });
  }

  protected getRandomUserAgent(): string {
    const userAgents = this.config.userAgents.length > 0 
      ? this.config.userAgents 
      : [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
    
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  protected getNextSession(): ScrapingSession | null {
    const availableSessions = Array.from(this.sessions.values())
      .filter(session => !session.blocked);
    
    if (availableSessions.length === 0) {
      this.emit('allSessionsBlocked', { sourceId: this.sourceId });
      return null;
    }

    // Round-robin selection of available sessions
    this.currentSessionIndex = (this.currentSessionIndex + 1) % availableSessions.length;
    return availableSessions[this.currentSessionIndex];
  }

  protected async waitForRateLimit(session: ScrapingSession): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - session.lastRequestTime;
    
    // Calculate delay based on configuration
    const minDelay = this.config.requestDelay.min;
    const maxDelay = this.config.requestDelay.max;
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    
    const requiredDelay = Math.max(0, randomDelay - timeSinceLastRequest);
    
    if (requiredDelay > 0) {
      this.emit('rateLimitWait', { 
        sessionId: session.id, 
        delay: requiredDelay,
        sourceId: this.sourceId 
      });
      await this.sleep(requiredDelay);
    }
    
    session.lastRequestTime = Date.now();
    session.requestCount++;
  }

  protected markSessionAsBlocked(sessionId: string, reason: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.blocked = true;
      if (session.proxy) {
        this.blockedProxies.add(`${session.proxy.host}:${session.proxy.port}`);
      }
      
      this.emit('sessionBlocked', { 
        sessionId, 
        reason, 
        proxy: session.proxy,
        sourceId: this.sourceId 
      });
    }
  }

  protected resetSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.blocked = false;
      session.cookies = {};
      session.requestCount = 0;
      session.userAgent = this.getRandomUserAgent();
      
      if (session.proxy) {
        this.blockedProxies.delete(`${session.proxy.host}:${session.proxy.port}`);
      }
      
      this.emit('sessionReset', { sessionId, sourceId: this.sourceId });
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected createValidationError(
    field: string, 
    message: string, 
    value: any, 
    severity: 'warning' | 'error' = 'error'
  ): ValidationError {
    return { field, message, value, severity };
  }

  protected createIngestionResult(
    recordsProcessed: number,
    recordsSkipped: number = 0,
    errors: ValidationError[] = []
  ): DataIngestionResult {
    return {
      sourceId: this.sourceId,
      recordsProcessed,
      recordsSkipped,
      errors,
      nextSyncTime: new Date(Date.now() + 300000), // 5 minutes from now
      processingTimeMs: 0 // Will be set by caller
    };
  }

  // Abstract methods to be implemented by concrete scrapers
  abstract validateData(data: any): ValidationError[];
  abstract transformData(data: any): any;
  abstract syncData(): Promise<DataIngestionResult>;

  // Public methods for monitoring
  public getStatus() {
    const sessionStats = Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      blocked: session.blocked,
      requestCount: session.requestCount,
      proxy: session.proxy ? `${session.proxy.host}:${session.proxy.port}` : 'none'
    }));

    return {
      sourceId: this.sourceId,
      totalSessions: this.sessions.size,
      blockedSessions: Array.from(this.sessions.values()).filter(s => s.blocked).length,
      blockedProxies: Array.from(this.blockedProxies),
      sessions: sessionStats
    };
  }

  public resetAllSessions(): void {
    this.sessions.forEach((_, sessionId) => {
      this.resetSession(sessionId);
    });
    this.blockedProxies.clear();
    this.emit('allSessionsReset', { sourceId: this.sourceId });
  }
}