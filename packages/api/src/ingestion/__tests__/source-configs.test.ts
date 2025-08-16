import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SourceConfigManager, API_SOURCES, initializeConfigs } from '../config/source-configs.js';

describe('SourceConfigManager', () => {
  let manager: SourceConfigManager;

  beforeEach(() => {
    manager = new SourceConfigManager();
  });

  describe('initialization', () => {
    it('should load default configurations', () => {
      const configs = manager.getAllConfigs();
      
      expect(configs).toHaveProperty('SPORTS_DATA_IO');
      expect(configs).toHaveProperty('THE_ODDS_API');
      expect(configs).toHaveProperty('ESPN_API');
      expect(configs).toHaveProperty('UFC_STATS');
    });

    it('should have correct default configuration for SportsDataIO', () => {
      const config = manager.getConfig('SPORTS_DATA_IO');
      
      expect(config).toBeDefined();
      expect(config!.name).toBe('SportsDataIO');
      expect(config!.baseUrl).toBe('https://api.sportsdata.io/v3/mma');
      expect(config!.authType).toBe('apikey');
      expect(config!.endpoints).toHaveProperty('fighters');
      expect(config!.endpoints).toHaveProperty('events');
      expect(config!.rateLimit.requestsPerMinute).toBe(100);
    });

    it('should have correct default configuration for The Odds API', () => {
      const config = manager.getConfig('THE_ODDS_API');
      
      expect(config).toBeDefined();
      expect(config!.name).toBe('The Odds API');
      expect(config!.baseUrl).toBe('https://api.the-odds-api.com/v4');
      expect(config!.authType).toBe('apikey');
      expect(config!.endpoints).toHaveProperty('odds');
      expect(config!.endpoints).toHaveProperty('events');
      expect(config!.rateLimit.requestsPerMinute).toBe(50);
    });
  });

  describe('configuration management', () => {
    it('should get existing configuration', () => {
      const config = manager.getConfig('SPORTS_DATA_IO');
      expect(config).toBeDefined();
      expect(config!.name).toBe('SportsDataIO');
    });

    it('should return undefined for non-existent configuration', () => {
      const config = manager.getConfig('NON_EXISTENT');
      expect(config).toBeUndefined();
    });

    it('should update existing configuration', () => {
      const updates = {
        rateLimit: {
          requestsPerMinute: 200,
          requestsPerHour: 2000
        }
      };

      manager.updateConfig('SPORTS_DATA_IO', updates);
      const config = manager.getConfig('SPORTS_DATA_IO');
      
      expect(config!.rateLimit.requestsPerMinute).toBe(200);
      expect(config!.rateLimit.requestsPerHour).toBe(2000);
      // Other properties should remain unchanged
      expect(config!.name).toBe('SportsDataIO');
    });

    it('should add new configuration', () => {
      const newConfig = {
        name: 'Test API',
        description: 'Test API for unit tests',
        baseUrl: 'https://api.test.com',
        authType: 'apikey' as const,
        endpoints: {
          test: '/test'
        },
        rateLimit: {
          requestsPerMinute: 10,
          requestsPerHour: 100
        },
        retryConfig: {
          maxRetries: 2,
          backoffMultiplier: 1.5,
          maxBackoffMs: 5000
        }
      };

      manager.addConfig('TEST_API', newConfig);
      const config = manager.getConfig('TEST_API');
      
      expect(config).toEqual(newConfig);
    });

    it('should remove configuration', () => {
      expect(manager.getConfig('SPORTS_DATA_IO')).toBeDefined();
      
      const removed = manager.removeConfig('SPORTS_DATA_IO');
      expect(removed).toBe(true);
      expect(manager.getConfig('SPORTS_DATA_IO')).toBeUndefined();
    });

    it('should return false when removing non-existent configuration', () => {
      const removed = manager.removeConfig('NON_EXISTENT');
      expect(removed).toBe(false);
    });
  });

  describe('API key management', () => {
    it('should set API key for configuration', () => {
      manager.setApiKey('THE_ODDS_API', 'test-api-key');
      const config = manager.getConfig('THE_ODDS_API');
      
      expect(config!.apiKey).toBe('test-api-key');
    });

    it('should set SportsDataIO header when setting API key', () => {
      manager.setApiKey('SPORTS_DATA_IO', 'sports-data-key');
      const config = manager.getConfig('SPORTS_DATA_IO');
      
      expect(config!.apiKey).toBe('sports-data-key');
      expect(config!.headers!['Ocp-Apim-Subscription-Key']).toBe('sports-data-key');
    });

    it('should handle setting API key for non-existent source', () => {
      // Should not throw error
      expect(() => {
        manager.setApiKey('NON_EXISTENT', 'test-key');
      }).not.toThrow();
    });
  });

  describe('endpoint URL generation', () => {
    it('should generate correct endpoint URL without parameters', () => {
      const url = manager.getEndpointUrl('THE_ODDS_API', 'odds');
      expect(url).toBe('https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds');
    });

    it('should generate correct endpoint URL with parameters', () => {
      const url = manager.getEndpointUrl('SPORTS_DATA_IO', 'fighterDetails', { fighterId: '123' });
      expect(url).toBe('https://api.sportsdata.io/v3/mma/scores/json/Fighter/123');
    });

    it('should handle multiple parameters', () => {
      // Add a test endpoint with multiple parameters
      const config = manager.getConfig('SPORTS_DATA_IO');
      config!.endpoints.testMultiple = '/test/{param1}/data/{param2}';
      
      const url = manager.getEndpointUrl('SPORTS_DATA_IO', 'testMultiple', { 
        param1: 'value1', 
        param2: 'value2' 
      });
      expect(url).toBe('https://api.sportsdata.io/v3/mma/test/value1/data/value2');
    });

    it('should URL encode parameters', () => {
      const config = manager.getConfig('SPORTS_DATA_IO');
      config!.endpoints.testEncoding = '/test/{param}';
      
      const url = manager.getEndpointUrl('SPORTS_DATA_IO', 'testEncoding', { 
        param: 'value with spaces & symbols' 
      });
      expect(url).toBe('https://api.sportsdata.io/v3/mma/test/value%20with%20spaces%20%26%20symbols');
    });

    it('should throw error for non-existent source', () => {
      expect(() => {
        manager.getEndpointUrl('NON_EXISTENT', 'test');
      }).toThrow("Endpoint 'test' not found for source 'NON_EXISTENT'");
    });

    it('should throw error for non-existent endpoint', () => {
      expect(() => {
        manager.getEndpointUrl('SPORTS_DATA_IO', 'nonExistentEndpoint');
      }).toThrow("Endpoint 'nonExistentEndpoint' not found for source 'SPORTS_DATA_IO'");
    });
  });

  describe('configuration validation', () => {
    it('should validate correct configuration', () => {
      const validConfig = {
        name: 'Valid API',
        description: 'A valid API configuration',
        baseUrl: 'https://api.valid.com',
        authType: 'apikey' as const,
        endpoints: {},
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerHour: 1000
        },
        retryConfig: {
          maxRetries: 3,
          backoffMultiplier: 2,
          maxBackoffMs: 30000
        }
      };

      const errors = manager.validateConfig(validConfig);
      expect(errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidConfig = {
        description: 'Missing required fields',
        authType: 'apikey' as const,
        endpoints: {}
      } as any;

      const errors = manager.validateConfig(invalidConfig);
      expect(errors).toContain('Name is required');
      expect(errors).toContain('Base URL is required');
      expect(errors).toContain('Rate limit configuration is required');
      expect(errors).toContain('Retry configuration is required');
    });

    it('should validate rate limit values', () => {
      const invalidConfig = {
        name: 'Invalid Rate Limits',
        baseUrl: 'https://api.test.com',
        authType: 'apikey' as const,
        endpoints: {},
        rateLimit: {
          requestsPerMinute: -1,
          requestsPerHour: 0
        },
        retryConfig: {
          maxRetries: 3,
          backoffMultiplier: 2,
          maxBackoffMs: 30000
        }
      };

      const errors = manager.validateConfig(invalidConfig);
      expect(errors).toContain('Requests per minute must be positive');
      expect(errors).toContain('Requests per hour must be positive');
    });

    it('should validate retry configuration values', () => {
      const invalidConfig = {
        name: 'Invalid Retry Config',
        baseUrl: 'https://api.test.com',
        authType: 'apikey' as const,
        endpoints: {},
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerHour: 1000
        },
        retryConfig: {
          maxRetries: -1,
          backoffMultiplier: 0,
          maxBackoffMs: -1000
        }
      };

      const errors = manager.validateConfig(invalidConfig);
      expect(errors).toContain('Max retries cannot be negative');
      expect(errors).toContain('Backoff multiplier must be positive');
      expect(errors).toContain('Max backoff time must be positive');
    });
  });
});

describe('initializeConfigs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should set API keys from environment variables', () => {
    process.env.SPORTS_DATA_IO_API_KEY = 'sports-data-test-key';
    process.env.THE_ODDS_API_KEY = 'odds-api-test-key';

    const manager = new SourceConfigManager();
    initializeConfigs();

    const sportsDataConfig = manager.getConfig('SPORTS_DATA_IO');
    const oddsApiConfig = manager.getConfig('THE_ODDS_API');

    expect(sportsDataConfig!.apiKey).toBe('sports-data-test-key');
    expect(oddsApiConfig!.apiKey).toBe('odds-api-test-key');
  });

  it('should update rate limits from environment variables', () => {
    process.env.ODDS_API_RATE_LIMIT_PER_MINUTE = '100';

    const manager = new SourceConfigManager();
    initializeConfigs();

    const config = manager.getConfig('THE_ODDS_API');
    expect(config!.rateLimit.requestsPerMinute).toBe(100);
  });

  it('should handle missing environment variables gracefully', () => {
    // Remove all relevant environment variables
    delete process.env.SPORTS_DATA_IO_API_KEY;
    delete process.env.THE_ODDS_API_KEY;
    delete process.env.ODDS_API_RATE_LIMIT_PER_MINUTE;

    expect(() => {
      initializeConfigs();
    }).not.toThrow();
  });
});

describe('API_SOURCES constants', () => {
  it('should have all required sources defined', () => {
    expect(API_SOURCES).toHaveProperty('SPORTS_DATA_IO');
    expect(API_SOURCES).toHaveProperty('THE_ODDS_API');
    expect(API_SOURCES).toHaveProperty('ESPN_API');
    expect(API_SOURCES).toHaveProperty('UFC_STATS');
  });

  it('should have consistent structure across all sources', () => {
    Object.values(API_SOURCES).forEach(source => {
      expect(source).toHaveProperty('name');
      expect(source).toHaveProperty('description');
      expect(source).toHaveProperty('baseUrl');
      expect(source).toHaveProperty('authType');
      expect(source).toHaveProperty('endpoints');
      expect(source).toHaveProperty('rateLimit');
      expect(source).toHaveProperty('retryConfig');
      
      expect(source.rateLimit).toHaveProperty('requestsPerMinute');
      expect(source.rateLimit).toHaveProperty('requestsPerHour');
      
      expect(source.retryConfig).toHaveProperty('maxRetries');
      expect(source.retryConfig).toHaveProperty('backoffMultiplier');
      expect(source.retryConfig).toHaveProperty('maxBackoffMs');
    });
  });

  it('should have valid URLs', () => {
    Object.values(API_SOURCES).forEach(source => {
      expect(() => new URL(source.baseUrl)).not.toThrow();
    });
  });

  it('should have reasonable rate limits', () => {
    Object.values(API_SOURCES).forEach(source => {
      expect(source.rateLimit.requestsPerMinute).toBeGreaterThan(0);
      expect(source.rateLimit.requestsPerHour).toBeGreaterThan(0);
      expect(source.rateLimit.requestsPerHour).toBeGreaterThanOrEqual(source.rateLimit.requestsPerMinute);
    });
  });
});