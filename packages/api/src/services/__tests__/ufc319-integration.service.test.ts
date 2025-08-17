import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { UFC319IntegrationService } from '../ufc319-integration.service.js';

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

vi.mock('../../repositories/event.repository.js', () => ({
  EventRepository: vi.fn()
}));

vi.mock('../../repositories/fighter.repository.js', () => ({
  FighterRepository: vi.fn()
}));

vi.mock('../../repositories/fight.repository.js', () => ({
  FightRepository: vi.fn()
}));

// Import after mocking
import { SportsDataIOConnector } from '../../ingestion/connectors/sports-data-io.connector.js';
import { EventRepository } from '../../repositories/event.repository.js';
import { FighterRepository } from '../../repositories/fighter.repository.js';
import { FightRepository } from '../../repositories/fight.repository.js';

describe('UFC319IntegrationService', () => {
  let service: UFC319IntegrationService;
  let mockSportsDataConnector: Mock;
  let mockEventRepository: Mock;
  let mockFighterRepository: Mock;
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
    fights: ['fight-1', 'fight-2']
  };

  const mockFighter = {
    id: 'fighter-1',
    name: 'Islam Makhachev',
    nickname: 'The Eagle',
    physicalStats: {
      height: 70,
      weight: 155,
      reach: 70,
      legReach: 40,
      stance: 'Orthodox' as const
    },
    record: {
      wins: 26,
      losses: 1,
      draws: 0,
      noContests: 0
    },
    rankings: {
      weightClass: 'Lightweight' as const,
      rank: 1,
      p4pRank: 1
    },
    camp: {
      name: 'American Kickboxing Academy',
      location: 'San Jose, CA',
      headCoach: 'Javier Mendez'
    },
    socialMedia: {
      instagram: '@islam_makhachev',
      twitter: '@MAKHACHEVMMA'
    },
    calculatedMetrics: {
      strikingAccuracy: { value: 0.52, period: 5, trend: 'improving' as const },
      takedownDefense: { value: 0.85, period: 5, trend: 'stable' as const },
      fightFrequency: 2.1,
      winStreak: 14,
      recentForm: ['W', 'W', 'W', 'W', 'W']
    },
    trends: {
      performanceTrend: 'improving' as const,
      activityLevel: 'active' as const,
      injuryHistory: [],
      lastFightDate: new Date('2024-10-26')
    },
    lastUpdated: new Date()
  };

  const mockFight = {
    id: 'fight-1',
    eventId: 'event-1',
    fighter1Id: 'fighter-1',
    fighter2Id: 'fighter-2',
    weightClass: 'Lightweight' as const,
    titleFight: true,
    mainEvent: true,
    scheduledRounds: 5,
    status: 'scheduled' as const,
    result: undefined,
    odds: [],
    predictions: []
  };

  const mockIngestionResult = {
    recordsProcessed: 10,
    recordsSkipped: 2,
    errors: [],
    processingTimeMs: 1500,
    sourceId: 'SPORTS_DATA_IO',
    timestamp: new Date()
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    mockSportsDataConnector = vi.mocked(SportsDataIOConnector);
    mockEventRepository = vi.mocked(EventRepository);
    mockFighterRepository = vi.mocked(FighterRepository);
    mockFightRepository = vi.mocked(FightRepository);

    // Mock constructor calls
    mockSportsDataConnector.mockImplementation(() => ({
      syncEventFights: vi.fn().mockResolvedValue(mockIngestionResult),
      syncFighters: vi.fn().mockResolvedValue(mockIngestionResult),
      syncEvents: vi.fn().mockResolvedValue(mockIngestionResult)
    }));

    mockEventRepository.mockImplementation(() => ({
      search: vi.fn().mockResolvedValue([mockEvent]),
      findById: vi.fn().mockResolvedValue(mockEvent),
      addFight: vi.fn().mockResolvedValue(undefined)
    }));

    mockFighterRepository.mockImplementation(() => ({
      search: vi.fn().mockResolvedValue([mockFighter]),
      findById: vi.fn().mockResolvedValue(mockFighter)
    }));

    mockFightRepository.mockImplementation(() => ({
      search: vi.fn().mockResolvedValue([mockFight])
    }));

    service = new UFC319IntegrationService();
  });

  describe('integrateUFC319Event', () => {
    it('should successfully integrate UFC 319 event data', async () => {
      const result = await service.integrateUFC319Event();

      expect(result).toBeDefined();
      expect(result.event).toEqual(mockEvent);
      expect(result.fighters).toEqual([mockFighter]);
      expect(result.fights).toEqual([mockFight]);
      expect(result.ingestionResults).toHaveLength(3);
    });

    it('should handle integration errors gracefully', async () => {
      const mockError = new Error('API connection failed');
      const mockConnector = {
        syncEventFights: vi.fn().mockRejectedValue(mockError),
        syncFighters: vi.fn().mockResolvedValue(mockIngestionResult),
        syncEvents: vi.fn().mockResolvedValue(mockIngestionResult)
      };

      mockSportsDataConnector.mockImplementation(() => mockConnector);
      service = new UFC319IntegrationService();

      await expect(service.integrateUFC319Event()).rejects.toThrow('UFC 319 integration failed');
    });
  });

  describe('getUFC319Data', () => {
    it('should return UFC 319 data when available', async () => {
      const result = await service.getUFC319Data();

      expect(result).toBeDefined();
      expect(result?.event).toEqual(mockEvent);
      expect(result?.fighters).toEqual([mockFighter]);
      expect(result?.fights).toEqual([mockFight]);
    });

    it('should return null when UFC 319 event is not found', async () => {
      const mockEmptyEventRepo = {
        search: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        addFight: vi.fn().mockResolvedValue(undefined)
      };

      mockEventRepository.mockImplementation(() => mockEmptyEventRepo);
      service = new UFC319IntegrationService();

      const result = await service.getUFC319Data();
      expect(result).toBeNull();
    });
  });

  describe('discoverAndUpdateEvents', () => {
    it('should discover and update events for current season', async () => {
      const result = await service.discoverAndUpdateEvents();

      expect(result).toEqual(mockIngestionResult);
    });

    it('should handle discovery errors', async () => {
      const mockError = new Error('Discovery failed');
      const mockConnector = {
        syncEvents: vi.fn().mockRejectedValue(mockError)
      };

      mockSportsDataConnector.mockImplementation(() => mockConnector);
      service = new UFC319IntegrationService();

      await expect(service.discoverAndUpdateEvents()).rejects.toThrow('Event discovery failed');
    });
  });

  describe('getFighterDetails', () => {
    it('should return fighter details when found', async () => {
      const result = await service.getFighterDetails('fighter-1');

      expect(result).toEqual(mockFighter);
    });

    it('should return null when fighter not found', async () => {
      const mockEmptyFighterRepo = {
        search: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null)
      };

      mockFighterRepository.mockImplementation(() => mockEmptyFighterRepo);
      service = new UFC319IntegrationService();

      const result = await service.getFighterDetails('nonexistent-fighter');
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const mockError = new Error('Database error');
      const mockErrorFighterRepo = {
        findById: vi.fn().mockRejectedValue(mockError)
      };

      mockFighterRepository.mockImplementation(() => mockErrorFighterRepo);
      service = new UFC319IntegrationService();

      const result = await service.getFighterDetails('fighter-1');
      expect(result).toBeNull();
    });
  });

  describe('getFightCardDetails', () => {
    it('should return fight card details for UFC 319', async () => {
      const result = await service.getFightCardDetails();

      expect(result).toBeDefined();
      expect(result.event).toEqual(mockEvent);
      expect(result.fights).toEqual([mockFight]);
      expect(result.mainEvent).toEqual(mockFight);
      expect(result.mainCard).toEqual([mockFight]);
      expect(result.preliminaryCard).toEqual([]);
    });

    it('should return fight card for specific event ID', async () => {
      const result = await service.getFightCardDetails('event-1');

      expect(result).toBeDefined();
      expect(result.event).toEqual(mockEvent);
      expect(result.fights).toEqual([mockFight]);
    });

    it('should handle missing event gracefully', async () => {
      const mockEmptyEventRepo = {
        search: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        addFight: vi.fn().mockResolvedValue(undefined)
      };

      mockEventRepository.mockImplementation(() => mockEmptyEventRepo);
      service = new UFC319IntegrationService();

      const result = await service.getFightCardDetails();

      expect(result.event).toBeNull();
      expect(result.fights).toEqual([]);
    });
  });
});