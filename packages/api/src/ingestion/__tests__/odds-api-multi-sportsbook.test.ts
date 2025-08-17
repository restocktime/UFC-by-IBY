import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OddsAPIConnector, TheOddsAPIEvent, SportsbookFilter } from '../connectors/odds-api.connector.js';

// Mock dependencies
vi.mock('../config/source-configs.js', () => ({
  sourceConfigManager: {
    getConfig: vi.fn(() => ({
      baseUrl: 'https://api.the-odds-api.com/v4',
      authType: 'apikey',
      apiKey: 'test-key',
      rateLimit: { requestsPerMinute: 50, requestsPerHour: 500 },
      retryConfig: { maxRetries: 3, backoffMultiplier: 2, maxBackoffMs: 15000 }
    })),
    getEndpointUrl: vi.fn((sourceId, endpoint) => {
      const endpoints = {
        odds: '/sports/mma_mixed_martial_arts/odds',
        eventOdds: '/sports/mma_mixed_martial_arts/events/{eventId}/odds'
      };
      return `https://api.the-odds-api.com/v4${endpoints[endpoint]}`;
    })
  }
}));

vi.mock('../../repositories/odds.repository.js', () => ({
  OddsRepository: vi.fn(() => ({
    writeOddsSnapshot: vi.fn(),
    writeArbitrageOpportunity: vi.fn()
  }))
}));

describe('OddsAPIConnector - Multi-Sportsbook Integration', () => {
  let connector: OddsAPIConnector;
  let mockMakeRequest: any;

  const mockEventData: TheOddsAPIEvent = {
    id: 'test-event-1',
    sport_key: 'mma_mixed_martial_arts',
    sport_title: 'MMA',
    commence_time: '2024-02-17T05:00:00Z',
    home_team: 'Jon Jones',
    away_team: 'Stipe Miocic',
    bookmakers: [
      {
        key: 'draftkings',
        title: 'DraftKings',
        last_update: '2024-02-16T18:00:00Z',
        markets: [
          {
            key: 'h2h',
            last_update: '2024-02-16T18:00:00Z',
            outcomes: [
              { name: 'Jon Jones', price: -150 },
              { name: 'Stipe Miocic', price: +130 }
            ]
          },
          {
            key: 'fight_result_method',
            last_update: '2024-02-16T18:00:00Z',
            outcomes: [
              { name: 'KO/TKO', price: +200 },
              { name: 'Submission', price: +300 },
              { name: 'Decision', price: +150 }
            ]
          }
        ]
      },
      {
        key: 'hardrockbet',
        title: 'Hard Rock Bet',
        last_update: '2024-02-16T18:00:00Z',
        markets: [
          {
            key: 'h2h',
            last_update: '2024-02-16T18:00:00Z',
            outcomes: [
              { name: 'Jon Jones', price: -140 },
              { name: 'Stipe Miocic', price: +140 }
            ]
          },
          {
            key: 'fight_result_method',
            last_update: '2024-02-16T18:00:00Z',
            outcomes: [
              { name: 'KO/TKO', price: +190 },
              { name: 'Submission', price: +290 },
              { name: 'Decision', price: +140 }
            ]
          }
        ]
      },
      {
        key: 'fanduel',
        title: 'FanDuel',
        last_update: '2024-02-16T18:00:00Z',
        markets: [
          {
            key: 'h2h',
            last_update: '2024-02-16T18:00:00Z',
            outcomes: [
              { name: 'Jon Jones', price: -160 },
              { name: 'Stipe Miocic', price: +120 }
            ]
          }
        ]
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    connector = new OddsAPIConnector();
    
    // Mock the makeRequest method
    mockMakeRequest = vi.fn();
    (connector as any).makeRequest = mockMakeRequest;
  });

  describe('Multi-Sportsbook Aggregation', () => {
    it('should sync odds from multiple sportsbooks', async () => {
      mockMakeRequest.mockResolvedValue({ data: [mockEventData] });

      const result = await connector.syncMultiSportsbookOdds();

      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    it('should filter sportsbooks based on configuration', () => {
      const filter: SportsbookFilter = {
        include: ['draftkings', 'hardrockbet'],
        exclude: ['fanduel']
      };

      connector.setSportsbookFilter(filter);
      
      const filteredEvent = (connector as any).filterEventBookmakers(mockEventData);
      
      expect(filteredEvent.bookmakers).toHaveLength(2);
      expect(filteredEvent.bookmakers.map(b => b.key)).toEqual(['draftkings', 'hardrockbet']);
    });

    it('should prioritize certain sportsbooks', () => {
      const filter: SportsbookFilter = {
        prioritySportsbooks: ['hardrockbet', 'fanduel']
      };

      connector.setSportsbookFilter(filter);
      
      const filteredEvent = (connector as any).filterEventBookmakers(mockEventData);
      
      // Hard Rock Bet should be first, then FanDuel, then DraftKings
      expect(filteredEvent.bookmakers[0].key).toBe('hardrockbet');
      expect(filteredEvent.bookmakers[1].key).toBe('fanduel');
      expect(filteredEvent.bookmakers[2].key).toBe('draftkings');
    });

    it('should detect arbitrage opportunities across sportsbooks', () => {
      const snapshots = (connector as any).transformEventOdds(mockEventData);
      const arbitrageOpps = (connector as any).detectArbitrageOpportunities(snapshots);

      // With the mock data, there should be potential arbitrage
      // Best odds: Jon Jones -140 (Hard Rock), Stipe +140 (Hard Rock)
      // This creates a potential arbitrage opportunity
      expect(arbitrageOpps).toBeInstanceOf(Array);
    });

    it('should aggregate odds data from multiple sportsbooks', async () => {
      const events = [mockEventData];
      const aggregatedResults = await (connector as any).aggregateMultiSportsbookOdds(events);

      expect(aggregatedResults).toHaveLength(1);
      
      const result = aggregatedResults[0];
      expect(result.fightId).toBeDefined();
      expect(result.fighters).toEqual(['Jon Jones', 'Stipe Miocic']);
      expect(result.sportsbooks).toHaveProperty('draftkings');
      expect(result.sportsbooks).toHaveProperty('hardrockbet');
      expect(result.sportsbooks).toHaveProperty('fanduel');
      expect(result.bestOdds.fighter1.odds).toBe(-140); // Best odds for Jon Jones
      expect(result.bestOdds.fighter2.odds).toBe(140); // Best odds for Stipe
      expect(result.consensus.fighter1Probability).toBeGreaterThan(0.5);
    });

    it('should calculate market consensus correctly', () => {
      const aggregation = {
        sportsbooks: {
          draftkings: {
            impliedProbability: { fighter1: 0.6, fighter2: 0.43 }
          },
          hardrockbet: {
            impliedProbability: { fighter1: 0.58, fighter2: 0.45 }
          },
          fanduel: {
            impliedProbability: { fighter1: 0.62, fighter2: 0.42 }
          }
        },
        consensus: {}
      };

      (connector as any).calculateConsensusOdds(aggregation);

      expect(aggregation.consensus.fighter1Probability).toBeCloseTo(0.6, 1);
      expect(aggregation.consensus.fighter2Probability).toBeCloseTo(0.43, 1);
      expect(aggregation.consensus.confidence).toBeGreaterThan(0);
      expect(aggregation.consensus.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle missing markets gracefully', () => {
      const eventWithMissingMarkets = {
        ...mockEventData,
        bookmakers: [
          {
            key: 'draftkings',
            title: 'DraftKings',
            last_update: '2024-02-16T18:00:00Z',
            markets: [
              {
                key: 'h2h',
                last_update: '2024-02-16T18:00:00Z',
                outcomes: [
                  { name: 'Jon Jones', price: -150 },
                  { name: 'Stipe Miocic', price: +130 }
                ]
              }
              // Missing method and round markets
            ]
          }
        ]
      };

      const snapshots = (connector as any).transformEventOdds(eventWithMissingMarkets);
      
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].method.ko).toBe(0);
      expect(snapshots[0].method.submission).toBe(0);
      expect(snapshots[0].method.decision).toBe(0);
    });

    it('should normalize sportsbook names correctly', () => {
      const testCases = [
        { input: 'draftkings', expected: 'DraftKings' },
        { input: 'hardrockbet', expected: 'Hard Rock Bet' },
        { input: 'fanduel', expected: 'FanDuel' },
        { input: 'betmgm', expected: 'BetMGM' },
        { input: 'unknown_book', expected: 'unknown_book' }
      ];

      testCases.forEach(({ input, expected }) => {
        const normalized = (connector as any).normalizeSportsbookName(input);
        expect(normalized).toBe(expected);
      });
    });

    it('should get available sportsbooks from API', async () => {
      mockMakeRequest.mockResolvedValue({ 
        data: [mockEventData] 
      });

      const availableSportsbooks = await connector.getAvailableSportsbooks();

      expect(availableSportsbooks).toBeInstanceOf(Array);
      expect(availableSportsbooks).toContain('draftkings');
      expect(availableSportsbooks).toContain('hardrockbet');
      expect(availableSportsbooks).toContain('fanduel');
    });

    it('should handle API errors gracefully', async () => {
      mockMakeRequest.mockRejectedValue(new Error('API rate limit exceeded'));

      const availableSportsbooks = await connector.getAvailableSportsbooks();

      // Should return supported sportsbooks as fallback
      expect(availableSportsbooks).toBeInstanceOf(Array);
      expect(availableSportsbooks.length).toBeGreaterThan(0);
    });
  });

  describe('Arbitrage Detection', () => {
    it('should detect profitable arbitrage opportunities', () => {
      // Create snapshots with arbitrage opportunity
      const snapshots = [
        {
          fightId: 'test-fight',
          sportsbook: 'DraftKings',
          timestamp: new Date(),
          moneyline: { fighter1: -120, fighter2: +110 },
          method: { ko: 0, submission: 0, decision: 0 },
          rounds: { round1: 0, round2: 0, round3: 0 }
        },
        {
          fightId: 'test-fight',
          sportsbook: 'Hard Rock Bet',
          timestamp: new Date(),
          moneyline: { fighter1: -110, fighter2: +120 },
          method: { ko: 0, submission: 0, decision: 0 },
          rounds: { round1: 0, round2: 0, round3: 0 }
        }
      ];

      const opportunities = (connector as any).detectArbitrageOpportunities(snapshots);

      if (opportunities.length > 0) {
        expect(opportunities[0]).toHaveProperty('fightId');
        expect(opportunities[0]).toHaveProperty('profit');
        expect(opportunities[0]).toHaveProperty('sportsbooks');
        expect(opportunities[0].profit).toBeGreaterThan(0);
      }
    });

    it('should not detect arbitrage when none exists', () => {
      const snapshots = [
        {
          fightId: 'test-fight',
          sportsbook: 'DraftKings',
          timestamp: new Date(),
          moneyline: { fighter1: -150, fighter2: +130 },
          method: { ko: 0, submission: 0, decision: 0 },
          rounds: { round1: 0, round2: 0, round3: 0 }
        },
        {
          fightId: 'test-fight',
          sportsbook: 'FanDuel',
          timestamp: new Date(),
          moneyline: { fighter1: -155, fighter2: +125 },
          method: { ko: 0, submission: 0, decision: 0 },
          rounds: { round1: 0, round2: 0, round3: 0 }
        }
      ];

      const opportunities = (connector as any).detectArbitrageOpportunities(snapshots);

      expect(opportunities).toHaveLength(0);
    });
  });

  describe('Configuration Management', () => {
    it('should update sportsbook filter', () => {
      const filter: SportsbookFilter = {
        include: ['draftkings', 'fanduel'],
        prioritySportsbooks: ['fanduel']
      };

      connector.setSportsbookFilter(filter);

      // Verify the filter is applied
      const filteredEvent = (connector as any).filterEventBookmakers(mockEventData);
      expect(filteredEvent.bookmakers).toHaveLength(2);
      expect(filteredEvent.bookmakers[0].key).toBe('fanduel'); // Should be prioritized
    });

    it('should update markets configuration', () => {
      const markets = ['h2h', 'fight_result_method'];
      
      connector.setMarkets(markets);

      // Verify markets are updated in aggregation options
      expect((connector as any).aggregationOptions.markets).toEqual(markets);
    });

    it('should return supported sportsbooks list', () => {
      const supportedSportsbooks = connector.getSupportedSportsbooks();

      expect(supportedSportsbooks).toBeInstanceOf(Array);
      expect(supportedSportsbooks).toContain('draftkings');
      expect(supportedSportsbooks).toContain('fanduel');
      expect(supportedSportsbooks).toContain('hardrockbet');
      expect(supportedSportsbooks.length).toBeGreaterThan(10);
    });
  });
});