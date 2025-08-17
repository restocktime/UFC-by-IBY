import { SourceConfig } from '@ufc-platform/shared';

export interface APISourceConfig extends SourceConfig {
  name: string;
  description: string;
  endpoints: Record<string, string>;
  authType: 'apikey' | 'bearer' | 'none';
  headers?: Record<string, string>;
}

export const API_SOURCES: Record<string, APISourceConfig> = {
  SPORTS_DATA_IO: {
    name: 'SportsDataIO',
    description: 'Professional sports data API for UFC fighter and fight information',
    baseUrl: 'https://api.sportsdata.io/v3/mma',
    authType: 'apikey',
    endpoints: {
      fighters: '/scores/json/Fighters',
      events: '/scores/json/Schedule/{season}',
      fights: '/scores/json/Event/{eventId}',
      fighterDetails: '/scores/json/Fighter/{fighterId}',
      results: '/scores/json/Event/{eventId}'
    },
    rateLimit: {
      requestsPerMinute: 100,
      requestsPerHour: 1000
    },
    retryConfig: {
      maxRetries: 3,
      backoffMultiplier: 2,
      maxBackoffMs: 30000
    },
    headers: {
      'Ocp-Apim-Subscription-Key': '' // Will be set from environment
    }
  },

  THE_ODDS_API: {
    name: 'The Odds API',
    description: 'Real-time sports betting odds from multiple sportsbooks',
    baseUrl: 'https://api.the-odds-api.com/v4',
    authType: 'apikey',
    endpoints: {
      sports: '/sports',
      odds: '/sports/mma_mixed_martial_arts/odds',
      events: '/sports/mma_mixed_martial_arts/events',
      eventOdds: '/sports/mma_mixed_martial_arts/events/{eventId}/odds',
      usage: '/sports/mma_mixed_martial_arts/odds/usage'
    },
    rateLimit: {
      requestsPerMinute: 50,
      requestsPerHour: 500
    },
    retryConfig: {
      maxRetries: 3,
      backoffMultiplier: 2,
      maxBackoffMs: 15000
    }
  },

  ESPN_API: {
    name: 'ESPN API',
    description: 'ESPN sports data for UFC events and fighter information',
    baseUrl: 'https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc',
    authType: 'none',
    endpoints: {
      scoreboard: '/scoreboard',
      events: '/events',
      fighters: '/athletes',
      rankings: '/athletes/rankings',
      eventSummary: '/summary',
      liveScoreboard: '/scoreboard'
    },
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1000
    },
    retryConfig: {
      maxRetries: 2,
      backoffMultiplier: 1.5,
      maxBackoffMs: 10000
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; UFC-Prediction-Platform/1.0.0)'
    }
  },

  UFC_STATS: {
    name: 'UFC Stats',
    description: 'Official UFC statistics website (web scraping)',
    baseUrl: 'http://ufcstats.com',
    authType: 'none',
    endpoints: {
      events: '/statistics/events/completed',
      fighters: '/statistics/fighters',
      fightDetails: '/fight-details/{fightId}',
      fighterDetails: '/fighter-details/{fighterId}'
    },
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500
    },
    retryConfig: {
      maxRetries: 5,
      backoffMultiplier: 2,
      maxBackoffMs: 60000
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }
};

export class SourceConfigManager {
  private configs: Map<string, APISourceConfig> = new Map();

  constructor() {
    // Load default configurations
    Object.entries(API_SOURCES).forEach(([key, config]) => {
      this.configs.set(key, { ...config });
    });
  }

  public getConfig(sourceId: string): APISourceConfig | undefined {
    return this.configs.get(sourceId);
  }

  public updateConfig(sourceId: string, updates: Partial<APISourceConfig>): void {
    const existing = this.configs.get(sourceId);
    if (existing) {
      this.configs.set(sourceId, { ...existing, ...updates });
    }
  }

  public addConfig(sourceId: string, config: APISourceConfig): void {
    this.configs.set(sourceId, config);
  }

  public removeConfig(sourceId: string): boolean {
    return this.configs.delete(sourceId);
  }

  public getAllConfigs(): Record<string, APISourceConfig> {
    const result: Record<string, APISourceConfig> = {};
    this.configs.forEach((config, key) => {
      result[key] = config;
    });
    return result;
  }

  public validateConfig(config: APISourceConfig): string[] {
    const errors: string[] = [];

    if (!config.name) errors.push('Name is required');
    if (!config.baseUrl) errors.push('Base URL is required');
    if (!config.rateLimit) errors.push('Rate limit configuration is required');
    if (!config.retryConfig) errors.push('Retry configuration is required');

    if (config.rateLimit) {
      if (config.rateLimit.requestsPerMinute <= 0) {
        errors.push('Requests per minute must be positive');
      }
      if (config.rateLimit.requestsPerHour <= 0) {
        errors.push('Requests per hour must be positive');
      }
    }

    if (config.retryConfig) {
      if (config.retryConfig.maxRetries < 0) {
        errors.push('Max retries cannot be negative');
      }
      if (config.retryConfig.backoffMultiplier <= 0) {
        errors.push('Backoff multiplier must be positive');
      }
      if (config.retryConfig.maxBackoffMs <= 0) {
        errors.push('Max backoff time must be positive');
      }
    }

    return errors;
  }

  public setApiKey(sourceId: string, apiKey: string): void {
    const config = this.configs.get(sourceId);
    if (config) {
      config.apiKey = apiKey;
      
      // Set specific header for SportsDataIO
      if (sourceId === 'SPORTS_DATA_IO' && config.headers) {
        config.headers['Ocp-Apim-Subscription-Key'] = apiKey;
      }
    }
  }

  public getEndpointUrl(sourceId: string, endpoint: string, params?: Record<string, string>): string {
    const config = this.configs.get(sourceId);
    if (!config || !config.endpoints[endpoint]) {
      throw new Error(`Endpoint '${endpoint}' not found for source '${sourceId}'`);
    }

    let url = config.baseUrl + config.endpoints[endpoint];
    
    // Replace path parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url = url.replace(`{${key}}`, encodeURIComponent(value));
      });
    }

    return url;
  }
}

// Singleton instance
export const sourceConfigManager = new SourceConfigManager();

// Initialize with environment variables
export function initializeConfigs(): void {
  // Set API keys from environment variables
  if (process.env.SPORTS_DATA_IO_API_KEY) {
    sourceConfigManager.setApiKey('SPORTS_DATA_IO', process.env.SPORTS_DATA_IO_API_KEY);
  }

  if (process.env.THE_ODDS_API_KEY) {
    sourceConfigManager.setApiKey('THE_ODDS_API', process.env.THE_ODDS_API_KEY);
  }

  // Update rate limits from environment if specified
  if (process.env.ODDS_API_RATE_LIMIT_PER_MINUTE) {
    const config = sourceConfigManager.getConfig('THE_ODDS_API');
    if (config) {
      config.rateLimit.requestsPerMinute = parseInt(process.env.ODDS_API_RATE_LIMIT_PER_MINUTE);
    }
  }
}