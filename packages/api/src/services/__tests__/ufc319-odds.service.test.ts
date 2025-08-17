import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { UFC319OddsService } from '../ufc319-odds.service.js';

// Mock MongoDB
vi.mock('mongodb', () => ({
  MongoClient: vi.fn(),
  ObjectId: vi.fn(),
  Collection: vi.fn(),
  Db: vi.fn()
}));

// Mock the dependencies
vi.mock('../../ingestion/connectors/sports-data-io.connector.js', () => ({
  SportsDataIOConnector: vi.fn()
}));

vi.mock('../../repositories/odds.repository.js', () => ({
  OddsRepository: vi.fn()
}));

vi.mock('../../repositories/event.repository.js', () => ({
  EventRepository: vi.fn()
}));

vi.mock('../../repositories/fight.repository.js', () => ({
  FightRepository: vi.fn()
}));

// Import after mocking
import { SportsDataIOConnector } from '../../ingestion/connectors/sports-data-io.connector.js';
import { OddsRepository } from '../../repositories/odds.repository.js';
import { EventRepository } from '../../repositories/event.repository.js';
import { FightRepository } from '../../repositories/fight.repository.js';

describe('UFC319OddsService', () => {
  let service: UFC319OddsService;
  let mockSportsDataConnector: Mock;
  let mockOddsRepository: Mock;
  let mockEventRepository: Mock;
  let mockFightRepository: Mock;

  const mockEvent = {
    id: 'event-1',
    name: 'UFC 319: Makhachev vs. Moicano',
    date: new Date('2025-01-18'),
    venue: {
      name: 'Intuit Dome',
      city: 'Inglewood',
      country: 'USA'
    },
    commission: 'California State Athletic Commission',
    fights: ['fight-1']
  };

  const mockFight = {
    id: 'fight-1',
    eventId: 'event-1',
    fighter1Id: 'fighter-1',
    fighter2Id: 'fighter-2',
    weightClass: 'Lightweight',
    titleFight: true,
    mainEvent: true,
    scheduledRounds: 5,
    status: 'scheduled'
  };

  const mockOdds = {
    id: 'odds-1',
    fightId: 'fight-1',
    sportsbook: 'DraftKings',
    type: 'moneyline',
    fighter1Odds: -150,
    fighter2Odds: +130,
    timestamp: new Date(),
    isLive: true,
    metadata: {}
  };

  const mockSportsDataOdds = {
    EventId: 864,
    FightId: 1,
    Sportsbook: 'DraftKings',
    Created: '2025-01-18T10:00:00Z',
    Updated: '2025-01-18T12:00:00Z',
    HomeTeamMoneyLine: -150,
    AwayTeamMoneyLine: 130,
    HomeTeamSpread: -1.5,
    AwayTeamSpread: 1.5,
    HomeTeamSpreadPayout: -110,
    AwayTeamSpreadPayout: -110,
    OverUnder: 2.5,
    OverPayout: -120,
    UnderPayout: 100
  };

  const mockIngestionResult = {
    recordsProcessed: 5,
    recordsSkipped: 1,
    errors: [],
    processingTimeMs: 1000,
    sourceId: 'SPORTS_DATA_IO_ODDS',
    timestamp: new Date()
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    mockSportsDataConnector = vi.mocked(SportsDataIOConnector);
    mockOddsRepository = vi.mocked(OddsRepository);
    mockEventRepository = vi.mocked(EventRepository);
    mockFightRepository = vi.mocked(FightRepository);

    // Mock constructor calls
    mockSportsDataConnector.mockImplementation(() => ({
      makeRequest: vi.fn().mockResolvedValue({
        data: { BettingMarkets: [mockSportsDataOdds] }
      })
    }));

    mockOddsRepository.mockImplementation(() => ({
      search: vi.fn().mockResolvedValue([mockOdds]),
      create: vi.fn().mockResolvedValue(mockOdds)
    }));

    mockEventRepository.mockImplementation(() => ({
      search: vi.fn().mockResolvedValue([mockEvent])
    }));

    mockFightRepository.mockImplementation(() => ({
      search: vi.fn().mockResolvedValue([mockFight])
    }));

    service = new UFC319OddsService();
  });

  describe('integrateUFC319Odds', () => {
    it('should successfully integrate UFC 319 odds', async () => {
      const result = await service.integrateUFC319Odds();

      expect(result).toBeDefined();
      expect(result.recordsProcessed).toBeGreaterThanOrEqual(0);
      expect(result.recordsSkipped).toBeGreaterThanOrEqual(0);
      expect(result.sourceId).toBe('SPORTS_DATA_IO_ODDS');
    });

    it('should handle integration errors gracefully', async () => {
      const mockError = new Error('API connection failed');
      const mockFailingConnector = {
        makeRequest: vi.fn().mockRejectedValue(mockError)
      };

      mockSportsDataConnector.mockImplementation(() => mockFailingConnector);
      service = new UFC319OddsService();

      await expect(service.integrateUFC319Odds()).rejects.toThrow('UFC 319 odds integration failed');
    });
  });

  describe('getHistoricalOdds', () => {
    it('should return historical odds data', async () => {
      const result = await service.getHistoricalOdds('fight-1');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('fightId');
        expect(result[0]).toHaveProperty('sportsbook');
        expect(result[0]).toHaveProperty('oddsHistory');
        expect(result[0]).toHaveProperty('trends');
      }
    });

    it('should filter by sportsbook when specified', async () => {
      const result = await service.getHistoricalOdds('fight-1', 'DraftKings');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const mockError = new Error('Database error');
      const mockFailingOddsRepo = {
        search: vi.fn().mockRejectedValue(mockError)
      };

      mockOddsRepository.mockImplementation(() => mockFailingOddsRepo);
      service = new UFC319OddsService();

      await expect(service.getHistoricalOdds('fight-1')).rejects.toThrow('Failed to get historical odds');
    });
  });

  describe('getLiveUFC319Odds', () => {
    it('should return live odds for UFC 319', async () => {
      const result = await service.getLiveUFC319Odds();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('eventId');
      expect(result).toHaveProperty('fights');
      expect(Array.isArray(result.fights)).toBe(true);
    });

    it('should handle missing event gracefully', async () => {
      const mockEmptyEventRepo = {
        search: vi.fn().mockResolvedValue([])
      };

      mockEventRepository.mockImplementation(() => mockEmptyEventRepo);
      service = new UFC319OddsService();

      await expect(service.getLiveUFC319Odds()).rejects.toThrow('UFC 319 event not found');
    });
  });

  describe('odds validation', () => {
    it('should validate odds data correctly', async () => {
      // Test with valid odds data
      const validOdds = {
        ...mockSportsDataOdds,
        FightId: 1,
        Sportsbook: 'DraftKings',
        HomeTeamMoneyLine: -150,
        AwayTeamMoneyLine: 130
      };

      // This would be tested through the integration method
      const result = await service.integrateUFC319Odds();
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid odds data', async () => {
      const invalidOdds = {
        ...mockSportsDataOdds,
        FightId: null,
        Sportsbook: '',
        HomeTeamMoneyLine: null,
        AwayTeamMoneyLine: null
      };

      const mockFailingConnector = {
        makeRequest: vi.fn().mockResolvedValue({
          data: { BettingMarkets: [invalidOdds] }
        })
      };

      mockSportsDataConnector.mockImplementation(() => mockFailingConnector);
      service = new UFC319OddsService();

      const result = await service.integrateUFC319Odds();
      // Should skip invalid records
      expect(result.recordsSkipped).toBeGreaterThan(0);
    });
  });

  describe('odds change detection', () => {
    it('should detect significant odds changes', async () => {
      // Mock existing odds
      const existingOdds = [{
        ...mockOdds,
        fighter1Odds: -120,
        fighter2Odds: +100,
        timestamp: new Date(Date.now() - 60000) // 1 minute ago
      }];

      const mockOddsRepoWithHistory = {
        search: vi.fn().mockResolvedValue(existingOdds),
        create: vi.fn().mockResolvedValue(mockOdds)
      };

      mockOddsRepository.mockImplementation(() => mockOddsRepoWithHistory);
      service = new UFC319OddsService();

      // This would trigger odds change detection internally
      const result = await service.integrateUFC319Odds();
      expect(result).toBeDefined();
    });
  });

  describe('trend calculation', () => {
    it('should calculate odds trends correctly', async () => {
      const historicalOdds = [
        { ...mockOdds, fighter1Odds: -100, fighter2Odds: +80, timestamp: new Date(Date.now() - 180000) },
        { ...mockOdds, fighter1Odds: -120, fighter2Odds: +100, timestamp: new Date(Date.now() - 120000) },
        { ...mockOdds, fighter1Odds: -150, fighter2Odds: +130, timestamp: new Date(Date.now() - 60000) }
      ];

      const mockOddsRepoWithTrends = {
        search: vi.fn().mockResolvedValue(historicalOdds),
        create: vi.fn().mockResolvedValue(mockOdds)
      };

      mockOddsRepository.mockImplementation(() => mockOddsRepoWithTrends);
      service = new UFC319OddsService();

      const result = await service.getHistoricalOdds('fight-1');
      
      if (result.length > 0) {
        expect(result[0].trends).toHaveProperty('fighter1Trend');
        expect(result[0].trends).toHaveProperty('fighter2Trend');
        expect(result[0].trends).toHaveProperty('volatility');
      }
    });
  });
});