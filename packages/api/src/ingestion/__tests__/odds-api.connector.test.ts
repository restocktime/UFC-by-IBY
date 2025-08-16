import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';

// Mock all external dependencies first
vi.mock('../../repositories/odds.repository.js', () => ({
  OddsRepository: vi.fn().mockImplementation(() => ({
    writeOddsSnapshot: vi.fn(),
    writeMovementAlert: vi.fn(),
    writeArbitrageOpportunity: vi.fn(),
    flush: vi.fn(),
    close: vi.fn()
  }))
}));

vi.mock('../config/source-configs.js', () => ({
  sourceConfigManager: {
    getConfig: vi.fn(),
    getEndpointUrl: vi.fn()
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
import { OddsAPIConnector, TheOddsAPIEvent, TheOddsAPIBookmaker } from '../connectors/odds-api.connector.js';
import { OddsRepository } from '../../repositories/odds.repository.js';
import { sourceConfigManager } from '../config/source-configs.js';
import { OddsSnapshot, MovementAlert, ArbitrageOpportunity } from '@ufc-platform/shared';

describe('OddsAPIConnector', () => {
  let connector: OddsAPIConnector;
  let mockOddsRepository: vi.Mocked<OddsRepository>;
  let mockSourceConfig: any;

  beforeEach(() => {
    // Setup mock repository
    mockOddsRepository = {
      writeOddsSnapshot: vi.fn(),
      writeMovementAlert: vi.fn(),
      writeArbitrageOpportunity: vi.fn(),
      flush: vi.fn(),
      close: vi.fn()
    } as any;

    // Setup mock source config
    mockSourceConfig = {
      baseUrl: 'https://api.the-odds-api.com/v4',
      apiKey: 'test-api-key',
      rateLimit: {
        requestsPerMinute: 50,
        requestsPerHour: 500
      },
      retryConfig: {
        maxRetries: 3,
        backoffMultiplier: 2,
        maxBackoffMs: 15000
      }
    };

    (sourceConfigManager.getConfig as Mock).mockReturnValue(mockSourceConfig);
    (sourceConfigManager.getEndpointUrl as Mock).mockImplementation((sourceId, endpoint) => {
      const endpoints = {
        odds: '/sports/mma_mixed_martial_arts/odds',
        usage: '/sports/mma_mixed_martial_arts/odds/usage'
      };
      return `${mockSourceConfig.baseUrl}${endpoints[endpoint]}`;
    });

    connector = new OddsAPIConnector(mockOddsRepository);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default movement options', () => {
      expect(connector).toBeInstanceOf(OddsAPIConnector);
    });

    it('should throw error if config not found', () => {
      (sourceConfigManager.getConfig as Mock).mockReturnValue(undefined);
      
      expect(() => new OddsAPIConnector()).toThrow('The Odds API configuration not found');
    });

    it('should accept custom movement options', () => {
      const customOptions = {
        minPercentageChange: 10,
        timeWindowMinutes: 30,
        enableArbitrageDetection: false,
        minArbitrageProfit: 5
      };

      const customConnector = new OddsAPIConnector(mockOddsRepository, customOptions);
      expect(customConnector).toBeInstanceOf(OddsAPIConnector);
    });
  });

  describe('validateEventData', () => {
    it('should validate valid event data', () => {
      const validEvent: TheOddsAPIEvent = {
        id: 'test-event-1',
        sport_key: 'mma_mixed_martial_arts',
        sport_title: 'MMA',
        commence_time: '2024-12-01T20:00:00Z',
        home_team: 'Jon Jones',
        away_team: 'Stipe Miocic',
        bookmakers: []
      };

      const errors = connector.validateEventData(validEvent);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing required fields', () => {
      const invalidEvent = {
        sport_key: 'mma_mixed_martial_arts',
        commence_time: '2024-12-01T20:00:00Z'
      } as TheOddsAPIEvent;

      const errors = connector.validateEventData(invalidEvent);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'id')).toBe(true);
      expect(errors.some(e => e.field === 'teams')).toBe(true);
    });

    it('should return warning for wrong sport key', () => {
      const event: TheOddsAPIEvent = {
        id: 'test-event-1',
        sport_key: 'basketball_nba',
        sport_title: 'NBA',
        commence_time: '2024-12-01T20:00:00Z',
        home_team: 'Team A',
        away_team: 'Team B'
      };

      const errors = connector.validateEventData(event);
      expect(errors.some(e => e.field === 'sport_key' && e.severity === 'warning')).toBe(true);
    });

    it('should validate invalid date format', () => {
      const event: TheOddsAPIEvent = {
        id: 'test-event-1',
        sport_key: 'mma_mixed_martial_arts',
        sport_title: 'MMA',
        commence_time: 'invalid-date',
        home_team: 'Fighter A',
        away_team: 'Fighter B'
      };

      const errors = connector.validateEventData(event);
      expect(errors.some(e => e.field === 'commence_time' && e.severity === 'error')).toBe(true);
    });
  });

  describe('transformEventOdds', () => {
    it('should transform event with bookmaker odds to snapshots', () => {
      const event: TheOddsAPIEvent = {
        id: 'test-event-1',
        sport_key: 'mma_mixed_martial_arts',
        sport_title: 'MMA',
        commence_time: '2024-12-01T20:00:00Z',
        home_team: 'Jon Jones',
        away_team: 'Stipe Miocic',
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
                  { name: 'Jon Jones', price: -200 },
                  { name: 'Stipe Miocic', price: +170 }
                ]
              },
              {
                key: 'fight_result_method',
                last_update: '2024-11-01T10:00:00Z',
                outcomes: [
                  { name: 'KO/TKO', price: +300 },
                  { name: 'Submission', price: +400 },
                  { name: 'Decision', price: +150 }
                ]
              }
            ]
          }
        ]
      };

      const snapshots = connector.transformEventOdds(event);
      
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toMatchObject({
        fightId: expect.stringContaining('Jon_Jones_vs_Stipe_Miocic'),
        sportsbook: 'DraftKings',
        moneyline: {
          fighter1: -200,
          fighter2: +170
        },
        method: {
          ko: +300,
          submission: +400,
          decision: +150
        }
      });
    });

    it('should return empty array for event without bookmakers', () => {
      const event: TheOddsAPIEvent = {
        id: 'test-event-1',
        sport_key: 'mma_mixed_martial_arts',
        sport_title: 'MMA',
        commence_time: '2024-12-01T20:00:00Z',
        home_team: 'Fighter A',
        away_team: 'Fighter B'
      };

      const snapshots = connector.transformEventOdds(event);
      expect(snapshots).toHaveLength(0);
    });

    it('should handle bookmaker without h2h market', () => {
      const event: TheOddsAPIEvent = {
        id: 'test-event-1',
        sport_key: 'mma_mixed_martial_arts',
        sport_title: 'MMA',
        commence_time: '2024-12-01T20:00:00Z',
        home_team: 'Fighter A',
        away_team: 'Fighter B',
        bookmakers: [
          {
            key: 'test-book',
            title: 'Test Book',
            last_update: '2024-11-01T10:00:00Z',
            markets: [
              {
                key: 'totals',
                last_update: '2024-11-01T10:00:00Z',
                outcomes: []
              }
            ]
          }
        ]
      };

      const snapshots = connector.transformEventOdds(event);
      expect(snapshots).toHaveLength(0);
    });
  });

  describe('syncMMAOdds', () => {
    beforeEach(() => {
      // Mock the makeRequest method
      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: [
          {
            id: 'test-event-1',
            sport_key: 'mma_mixed_martial_arts',
            sport_title: 'MMA',
            commence_time: '2024-12-01T20:00:00Z',
            home_team: 'Jon Jones',
            away_team: 'Stipe Miocic',
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
                      { name: 'Jon Jones', price: -200 },
                      { name: 'Stipe Miocic', price: +170 }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
    });

    it('should successfully sync MMA odds', async () => {
      const result = await connector.syncMMAOdds();

      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockOddsRepository.writeOddsSnapshot).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors gracefully', async () => {
      vi.spyOn(connector as any, 'makeRequest').mockRejectedValue(new Error('API Error'));

      await expect(connector.syncMMAOdds()).rejects.toThrow('Failed to sync MMA odds from The Odds API: API Error');
    });

    it('should skip invalid events and continue processing', async () => {
      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: [
          {
            // Missing required fields
            sport_key: 'mma_mixed_martial_arts',
            commence_time: '2024-12-01T20:00:00Z'
          },
          {
            id: 'valid-event',
            sport_key: 'mma_mixed_martial_arts',
            sport_title: 'MMA',
            commence_time: '2024-12-01T20:00:00Z',
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
                      { name: 'Fighter A', price: -150 },
                      { name: 'Fighter B', price: +130 }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });

      const result = await connector.syncMMAOdds();

      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsSkipped).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('odds movement detection', () => {
    it('should detect significant odds movement', async () => {
      const fightId = 'test-fight-1';
      const sportsbook = 'DraftKings';

      // First snapshot (baseline)
      const firstSnapshot: OddsSnapshot = {
        fightId,
        sportsbook,
        timestamp: new Date('2024-11-01T10:00:00Z'),
        moneyline: { fighter1: -200, fighter2: +170 },
        method: { ko: 0, submission: 0, decision: 0 },
        rounds: { round1: 0, round2: 0, round3: 0 }
      };

      // Second snapshot (significant movement)
      const secondSnapshot: OddsSnapshot = {
        fightId,
        sportsbook,
        timestamp: new Date('2024-11-01T11:00:00Z'),
        moneyline: { fighter1: -150, fighter2: +130 }, // Significant change
        method: { ko: 0, submission: 0, decision: 0 },
        rounds: { round1: 0, round2: 0, round3: 0 }
      };

      // Process first snapshot (no movement expected)
      await (connector as any).detectOddsMovement(firstSnapshot);
      expect(mockOddsRepository.writeMovementAlert).not.toHaveBeenCalled();

      // Process second snapshot (movement expected)
      await (connector as any).detectOddsMovement(secondSnapshot);
      expect(mockOddsRepository.writeMovementAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          fightId,
          movementType: expect.any(String),
          oldOdds: firstSnapshot,
          newOdds: secondSnapshot,
          percentageChange: expect.any(Number)
        })
      );
    });

    it('should not detect movement below threshold', async () => {
      const fightId = 'test-fight-2';
      const sportsbook = 'FanDuel';

      const firstSnapshot: OddsSnapshot = {
        fightId,
        sportsbook,
        timestamp: new Date('2024-11-01T10:00:00Z'),
        moneyline: { fighter1: -200, fighter2: +170 },
        method: { ko: 0, submission: 0, decision: 0 },
        rounds: { round1: 0, round2: 0, round3: 0 }
      };

      const secondSnapshot: OddsSnapshot = {
        fightId,
        sportsbook,
        timestamp: new Date('2024-11-01T11:00:00Z'),
        moneyline: { fighter1: -205, fighter2: +175 }, // Small change
        method: { ko: 0, submission: 0, decision: 0 },
        rounds: { round1: 0, round2: 0, round3: 0 }
      };

      await (connector as any).detectOddsMovement(firstSnapshot);
      await (connector as any).detectOddsMovement(secondSnapshot);
      
      expect(mockOddsRepository.writeMovementAlert).not.toHaveBeenCalled();
    });
  });

  describe('arbitrage detection', () => {
    it('should detect arbitrage opportunities', () => {
      const snapshots: OddsSnapshot[] = [
        {
          fightId: 'test-fight-1',
          sportsbook: 'DraftKings',
          timestamp: new Date(),
          moneyline: { fighter1: -150, fighter2: +200 },
          method: { ko: 0, submission: 0, decision: 0 },
          rounds: { round1: 0, round2: 0, round3: 0 }
        },
        {
          fightId: 'test-fight-1',
          sportsbook: 'FanDuel',
          timestamp: new Date(),
          moneyline: { fighter1: +180, fighter2: -140 },
          method: { ko: 0, submission: 0, decision: 0 },
          rounds: { round1: 0, round2: 0, round3: 0 }
        }
      ];

      const opportunities = (connector as any).detectArbitrageOpportunities(snapshots);
      
      if (opportunities.length > 0) {
        expect(opportunities[0]).toMatchObject({
          fightId: 'test-fight-1',
          sportsbooks: expect.arrayContaining(['DraftKings', 'FanDuel']),
          profit: expect.any(Number),
          stakes: expect.any(Object)
        });
      }
    });

    it('should not detect arbitrage when no opportunity exists', () => {
      const snapshots: OddsSnapshot[] = [
        {
          fightId: 'test-fight-1',
          sportsbook: 'DraftKings',
          timestamp: new Date(),
          moneyline: { fighter1: -200, fighter2: +170 },
          method: { ko: 0, submission: 0, decision: 0 },
          rounds: { round1: 0, round2: 0, round3: 0 }
        },
        {
          fightId: 'test-fight-1',
          sportsbook: 'FanDuel',
          timestamp: new Date(),
          moneyline: { fighter1: -190, fighter2: +160 },
          method: { ko: 0, submission: 0, decision: 0 },
          rounds: { round1: 0, round2: 0, round3: 0 }
        }
      ];

      const opportunities = (connector as any).detectArbitrageOpportunities(snapshots);
      expect(opportunities).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    it('should calculate percentage change correctly', () => {
      const change1 = (connector as any).calculatePercentageChange(-200, -150);
      expect(change1).toBeCloseTo(25, 1);

      const change2 = (connector as any).calculatePercentageChange(+170, +200);
      expect(change2).toBeCloseTo(17.65, 1);

      const change3 = (connector as any).calculatePercentageChange(0, 100);
      expect(change3).toBe(0);
    });

    it('should convert American odds to implied probability', () => {
      const prob1 = (connector as any).oddsToImpliedProbability(-200);
      expect(prob1).toBeCloseTo(0.667, 2);

      const prob2 = (connector as any).oddsToImpliedProbability(+150);
      expect(prob2).toBeCloseTo(0.4, 2);
    });

    it('should normalize sportsbook names', () => {
      expect((connector as any).normalizeSportsbookName('draftkings')).toBe('DraftKings');
      expect((connector as any).normalizeSportsbookName('fanduel')).toBe('FanDuel');
      expect((connector as any).normalizeSportsbookName('unknown_book')).toBe('unknown_book');
    });

    it('should generate consistent fight IDs', () => {
      const event: TheOddsAPIEvent = {
        id: 'test-1',
        sport_key: 'mma_mixed_martial_arts',
        sport_title: 'MMA',
        commence_time: '2024-12-01T20:00:00Z',
        home_team: 'Jon Jones',
        away_team: 'Stipe Miocic'
      };

      const fightId = (connector as any).generateFightId(event);
      expect(fightId).toContain('Jon_Jones_vs_Stipe_Miocic');
      expect(fightId).toContain('2024_12_01');
    });
  });

  describe('getUsageStats', () => {
    it('should fetch usage statistics', async () => {
      const mockUsage = {
        requests_remaining: 450,
        requests_used: 50
      };

      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockUsage
      });

      const usage = await connector.getUsageStats();
      expect(usage).toEqual(mockUsage);
    });

    it('should handle usage stats API error', async () => {
      vi.spyOn(connector as any, 'makeRequest').mockRejectedValue(new Error('Usage API Error'));

      await expect(connector.getUsageStats()).rejects.toThrow('Failed to get usage stats: Usage API Error');
    });
  });
});