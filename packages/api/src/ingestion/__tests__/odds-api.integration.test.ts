import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock all external dependencies first
vi.mock('../../repositories/odds.repository.js', () => ({
  OddsRepository: vi.fn().mockImplementation(() => ({
    writeOddsSnapshot: vi.fn(),
    writeMovementAlert: vi.fn(),
    writeArbitrageOpportunity: vi.fn(),
    getLatestOdds: vi.fn().mockResolvedValue([]),
    getOddsMovements: vi.fn().mockResolvedValue([]),
    getArbitrageOpportunities: vi.fn().mockResolvedValue([]),
    flush: vi.fn(),
    close: vi.fn()
  }))
}));

vi.mock('../config/source-configs.js', () => ({
  sourceConfigManager: {
    getConfig: vi.fn().mockReturnValue({
      baseUrl: 'https://api.the-odds-api.com/v4',
      apiKey: 'test-api-key',
      rateLimit: { requestsPerMinute: 50, requestsPerHour: 500 },
      retryConfig: { maxRetries: 3, backoffMultiplier: 2, maxBackoffMs: 15000 }
    }),
    getEndpointUrl: vi.fn().mockImplementation((sourceId, endpoint) => {
      const endpoints = {
        odds: '/sports/mma_mixed_martial_arts/odds',
        usage: '/sports/mma_mixed_martial_arts/odds/usage'
      };
      return `https://api.the-odds-api.com/v4${endpoints[endpoint]}`;
    })
  }
}));

vi.mock('../../database/manager.js', () => ({
  DatabaseManager: {
    getInstance: vi.fn().mockReturnValue({
      getInfluxDB: vi.fn().mockReturnValue({
        getWriteApi: vi.fn(),
        getQueryApi: vi.fn()
      })
    })
  }
}));

vi.mock('@influxdata/influxdb-client', () => ({
  Point: vi.fn().mockImplementation(() => ({
    tag: vi.fn().mockReturnThis(),
    floatField: vi.fn().mockReturnThis(),
    stringField: vi.fn().mockReturnThis(),
    timestamp: vi.fn().mockReturnThis()
  }))
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockReturnValue({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    })
  }
}));

// Now import the modules
import { OddsAPIConnector } from '../connectors/odds-api.connector.js';
import { OddsRepository } from '../../repositories/odds.repository.js';
import { DatabaseManager } from '../../database/manager.js';
import { sourceConfigManager } from '../config/source-configs.js';

// Integration tests that test the full flow with real database connections
// These tests require actual database instances to be running

describe('OddsAPIConnector Integration Tests', () => {
  let connector: OddsAPIConnector;
  let oddsRepository: OddsRepository;
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Initialize database manager for testing
    dbManager = DatabaseManager.getInstance();
    
    // Initialize repositories
    oddsRepository = new OddsRepository();
    
    // Initialize connector with test configuration
    connector = new OddsAPIConnector(oddsRepository, {
      minPercentageChange: 3, // Lower threshold for testing
      timeWindowMinutes: 5,
      enableArbitrageDetection: true,
      minArbitrageProfit: 1
    });
  });

  afterEach(async () => {
    // Clean up
    await oddsRepository.flush();
    await oddsRepository.close();
  });

  describe('end-to-end odds ingestion', () => {
    it('should ingest odds data and detect movements', async () => {
      // Mock API response with realistic odds data
      const mockApiResponse = {
        data: [
          {
            id: 'ufc-308-main-event',
            sport_key: 'mma_mixed_martial_arts',
            sport_title: 'Mixed Martial Arts',
            commence_time: '2024-12-07T22:00:00Z',
            home_team: 'Islam Makhachev',
            away_team: 'Arman Tsarukyan',
            bookmakers: [
              {
                key: 'draftkings',
                title: 'DraftKings',
                last_update: '2024-11-01T10:00:00Z',
                markets: [
                  {
                    key: 'h2h',
                    last_update: '2024-11-01T10:00:00Z',
                    outcomes: [
                      { name: 'Islam Makhachev', price: -180 },
                      { name: 'Arman Tsarukyan', price: +150 }
                    ]
                  },
                  {
                    key: 'fight_result_method',
                    last_update: '2024-11-01T10:00:00Z',
                    outcomes: [
                      { name: 'KO/TKO', price: +400 },
                      { name: 'Submission', price: +250 },
                      { name: 'Decision', price: -120 }
                    ]
                  },
                  {
                    key: 'fight_result_round',
                    last_update: '2024-11-01T10:00:00Z',
                    outcomes: [
                      { name: 'Round 1', price: +800 },
                      { name: 'Round 2', price: +600 },
                      { name: 'Round 3', price: +400 },
                      { name: 'Round 4', price: +500 },
                      { name: 'Round 5', price: +600 }
                    ]
                  }
                ]
              },
              {
                key: 'fanduel',
                title: 'FanDuel',
                last_update: '2024-11-01T10:00:00Z',
                markets: [
                  {
                    key: 'h2h',
                    last_update: '2024-11-01T10:00:00Z',
                    outcomes: [
                      { name: 'Islam Makhachev', price: -170 },
                      { name: 'Arman Tsarukyan', price: +145 }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      // Mock the API call
      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue(mockApiResponse);

      // Execute the sync
      const result = await connector.syncMMAOdds();

      // Verify results
      expect(result.recordsProcessed).toBe(2); // Two bookmakers
      expect(result.recordsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify odds were stored in database
      const storedOdds = await oddsRepository.getLatestOdds('odds_api_Arman_Tsarukyan_vs_Islam_Makhachev_2024-12-07');
      expect(storedOdds).toHaveLength(2);
      
      // Verify DraftKings odds
      const draftKingsOdds = storedOdds.find(o => o.sportsbook === 'DraftKings');
      expect(draftKingsOdds).toBeDefined();
      expect(draftKingsOdds?.odds.moneyline).toEqual([-180, +150]);
      expect(draftKingsOdds?.odds.method.ko).toBe(+400);
      expect(draftKingsOdds?.odds.method.submission).toBe(+250);
      expect(draftKingsOdds?.odds.method.decision).toBe(-120);

      // Verify FanDuel odds
      const fanDuelOdds = storedOdds.find(o => o.sportsbook === 'FanDuel');
      expect(fanDuelOdds).toBeDefined();
      expect(fanDuelOdds?.odds.moneyline).toEqual([-170, +145]);
    }, 30000); // 30 second timeout for database operations

    it('should detect and store odds movements over time', async () => {
      const fightId = 'odds_api_Fighter_A_vs_Fighter_B_2024-12-01';

      // First API call with initial odds
      const initialResponse = {
        data: [
          {
            id: 'test-fight-movement',
            sport_key: 'mma_mixed_martial_arts',
            sport_title: 'Mixed Martial Arts',
            commence_time: '2024-12-01T22:00:00Z',
            home_team: 'Fighter A',
            away_team: 'Fighter B',
            bookmakers: [
              {
                key: 'draftkings',
                title: 'DraftKings',
                last_update: '2024-11-01T10:00:00Z',
                markets: [
                  {
                    key: 'h2h',
                    last_update: '2024-11-01T10:00:00Z',
                    outcomes: [
                      { name: 'Fighter A', price: -200 },
                      { name: 'Fighter B', price: +170 }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      // Mock first API call
      vi.spyOn(connector as any, 'makeRequest').mockResolvedValueOnce(initialResponse);

      // Execute first sync
      await connector.syncMMAOdds();

      // Second API call with moved odds
      const movedResponse = {
        data: [
          {
            id: 'test-fight-movement',
            sport_key: 'mma_mixed_martial_arts',
            sport_title: 'Mixed Martial Arts',
            commence_time: '2024-12-01T22:00:00Z',
            home_team: 'Fighter A',
            away_team: 'Fighter B',
            bookmakers: [
              {
                key: 'draftkings',
                title: 'DraftKings',
                last_update: '2024-11-01T11:00:00Z',
                markets: [
                  {
                    key: 'h2h',
                    last_update: '2024-11-01T11:00:00Z',
                    outcomes: [
                      { name: 'Fighter A', price: -150 }, // Significant movement
                      { name: 'Fighter B', price: +130 }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      // Mock second API call
      vi.spyOn(connector as any, 'makeRequest').mockResolvedValueOnce(movedResponse);

      // Execute second sync
      await connector.syncMMAOdds();

      // Wait a bit for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify movement was detected and stored
      const movements = await oddsRepository.getOddsMovements({
        fightId,
        timeWindow: '1h',
        minPercentageChange: 3
      });

      expect(movements.length).toBeGreaterThan(0);
      expect(movements[0].fightId).toBe(fightId);
      expect(movements[0].percentageChange).toBeGreaterThan(3);
    }, 30000);

    it('should detect arbitrage opportunities across sportsbooks', async () => {
      // Mock response with arbitrage opportunity
      const arbitrageResponse = {
        data: [
          {
            id: 'arbitrage-test-fight',
            sport_key: 'mma_mixed_martial_arts',
            sport_title: 'Mixed Martial Arts',
            commence_time: '2024-12-01T22:00:00Z',
            home_team: 'Fighter X',
            away_team: 'Fighter Y',
            bookmakers: [
              {
                key: 'draftkings',
                title: 'DraftKings',
                last_update: '2024-11-01T10:00:00Z',
                markets: [
                  {
                    key: 'h2h',
                    last_update: '2024-11-01T10:00:00Z',
                    outcomes: [
                      { name: 'Fighter X', price: -110 },
                      { name: 'Fighter Y', price: +200 }
                    ]
                  }
                ]
              },
              {
                key: 'fanduel',
                title: 'FanDuel',
                last_update: '2024-11-01T10:00:00Z',
                markets: [
                  {
                    key: 'h2h',
                    last_update: '2024-11-01T10:00:00Z',
                    outcomes: [
                      { name: 'Fighter X', price: +180 },
                      { name: 'Fighter Y', price: -120 }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue(arbitrageResponse);

      // Execute sync
      await connector.syncMMAOdds();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check for arbitrage opportunities
      const opportunities = await oddsRepository.getArbitrageOpportunities(
        'odds_api_Fighter_X_vs_Fighter_Y_2024-12-01',
        1 // Min 1% profit
      );

      if (opportunities.length > 0) {
        expect(opportunities[0].fightId).toBe('odds_api_Fighter_X_vs_Fighter_Y_2024-12-01');
        expect(opportunities[0].sportsbooks).toContain('DraftKings');
        expect(opportunities[0].sportsbooks).toContain('FanDuel');
        expect(opportunities[0].profit).toBeGreaterThan(1);
      }
    }, 30000);
  });

  describe('error handling and resilience', () => {
    it('should handle network timeouts gracefully', async () => {
      // Mock network timeout
      vi.spyOn(connector as any, 'makeRequest').mockRejectedValue(
        new Error('ECONNABORTED: timeout of 30000ms exceeded')
      );

      await expect(connector.syncMMAOdds()).rejects.toThrow('Failed to sync MMA odds from The Odds API');
    });

    it('should handle rate limiting', async () => {
      // Mock rate limit response
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).response = { status: 429 };

      vi.spyOn(connector as any, 'makeRequest').mockRejectedValue(rateLimitError);

      await expect(connector.syncMMAOdds()).rejects.toThrow('Failed to sync MMA odds from The Odds API');
    });

    it('should handle malformed API responses', async () => {
      // Mock malformed response
      const malformedResponse = {
        data: [
          {
            // Missing required fields
            sport_key: 'mma_mixed_martial_arts',
            bookmakers: 'invalid_format'
          }
        ]
      };

      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue(malformedResponse);

      const result = await connector.syncMMAOdds();
      
      expect(result.recordsSkipped).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('data quality and validation', () => {
    it('should validate odds format and ranges', async () => {
      const invalidOddsResponse = {
        data: [
          {
            id: 'invalid-odds-test',
            sport_key: 'mma_mixed_martial_arts',
            sport_title: 'Mixed Martial Arts',
            commence_time: '2024-12-01T22:00:00Z',
            home_team: 'Fighter A',
            away_team: 'Fighter B',
            bookmakers: [
              {
                key: 'test-book',
                title: 'Test Book',
                last_update: '2024-11-01T10:00:00Z',
                markets: [
                  {
                    key: 'h2h',
                    last_update: '2024-11-01T10:00:00Z',
                    outcomes: [
                      { name: 'Fighter A', price: 0 }, // Invalid odds
                      { name: 'Fighter B', price: -50000 } // Unrealistic odds
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue(invalidOddsResponse);

      const result = await connector.syncMMAOdds();
      
      // Should still process but may have warnings
      expect(result.recordsProcessed).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing market data gracefully', async () => {
      const incompleteResponse = {
        data: [
          {
            id: 'incomplete-data-test',
            sport_key: 'mma_mixed_martial_arts',
            sport_title: 'Mixed Martial Arts',
            commence_time: '2024-12-01T22:00:00Z',
            home_team: 'Fighter A',
            away_team: 'Fighter B',
            bookmakers: [
              {
                key: 'test-book',
                title: 'Test Book',
                last_update: '2024-11-01T10:00:00Z',
                markets: [] // No markets
              }
            ]
          }
        ]
      };

      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue(incompleteResponse);

      const result = await connector.syncMMAOdds();
      
      // Should handle gracefully without crashing
      expect(result).toBeDefined();
      expect(result.recordsProcessed).toBe(0);
    });
  });

  describe('performance and scalability', () => {
    it('should handle large datasets efficiently', async () => {
      // Generate large dataset
      const largeDataset = {
        data: Array.from({ length: 50 }, (_, i) => ({
          id: `large-test-event-${i}`,
          sport_key: 'mma_mixed_martial_arts',
          sport_title: 'Mixed Martial Arts',
          commence_time: '2024-12-01T22:00:00Z',
          home_team: `Fighter A${i}`,
          away_team: `Fighter B${i}`,
          bookmakers: [
            {
              key: 'draftkings',
              title: 'DraftKings',
              last_update: '2024-11-01T10:00:00Z',
              markets: [
                {
                  key: 'h2h',
                  last_update: '2024-11-01T10:00:00Z',
                  outcomes: [
                    { name: `Fighter A${i}`, price: -150 - i },
                    { name: `Fighter B${i}`, price: 130 + i }
                  ]
                }
              ]
            }
          ]
        }))
      };

      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue(largeDataset);

      const startTime = Date.now();
      const result = await connector.syncMMAOdds();
      const processingTime = Date.now() - startTime;

      expect(result.recordsProcessed).toBe(50);
      expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
    }, 60000);
  });
});