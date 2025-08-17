import { APIClientService } from '../api-client.service';
import { APIClientFactory } from '../api-client-factory';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock the dependencies
jest.mock('../api-client-factory');
jest.mock('../../config/api-keys', () => ({
  apiKeys: {
    sportsDataIO: {
      key: 'test-sportsdata-key',
      baseUrl: 'https://api.sportsdata.io/v3/mma',
      endpoints: {
        events: '/scores/json/Event',
        eventOdds: '/odds/json/EventOdds',
        fighters: '/scores/json/Fighters',
        fights: '/scores/json/Fights'
      }
    },
    oddsAPI: {
      key: 'test-odds-key',
      baseUrl: 'https://api.the-odds-api.com/v4',
      endpoints: {
        sports: '/sports',
        odds: '/sports/mma_mixed_martial_arts/odds',
        events: '/sports/mma_mixed_martial_arts/events'
      }
    },
    espnAPI: {
      baseUrl: 'https://site.web.api.espn.com/apis',
      endpoints: {
        scoreboard: '/personalized/v2/scoreboard/header',
        fighters: '/common/v3/sports/mma/ufc/athletes',
        events: '/common/v3/sports/mma/ufc/scoreboard'
      }
    }
  }
}));

jest.mock('../../config', () => ({
  config: {
    timeouts: {
      sportsDataIO: 30000,
      oddsAPI: 15000,
      espnAPI: 20000
    },
    rateLimits: {
      sportsDataIO: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      },
      oddsAPI: {
        requestsPerMinute: 10,
        requestsPerHour: 500,
        requestsPerDay: 1000
      },
      espnAPI: {
        requestsPerMinute: 100,
        requestsPerHour: 2000,
        requestsPerDay: 20000
      }
    }
  }
}));

describe('APIClientService', () => {
  let service: APIClientService;
  let mockFactory: jest.Mocked<APIClientFactory>;
  let mockSportsDataIOClient: any;
  let mockOddsAPIClient: any;
  let mockESPNClient: any;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    // Create mock axios instances
    mockSportsDataIOClient = axios.create();
    mockOddsAPIClient = axios.create();
    mockESPNClient = axios.create();

    // Create mock adapters
    mockAdapter = new MockAdapter(axios);

    // Mock the factory
    mockFactory = {
      createClient: jest.fn(),
      getInstance: jest.fn(),
      getClient: jest.fn(),
      healthCheck: jest.fn(),
      getRateLimitStatus: jest.fn(),
      destroy: jest.fn()
    } as any;

    // Setup factory mock returns
    mockFactory.createClient
      .mockReturnValueOnce(mockSportsDataIOClient)
      .mockReturnValueOnce(mockOddsAPIClient)
      .mockReturnValueOnce(mockESPNClient);

    (APIClientFactory.getInstance as jest.Mock).mockReturnValue(mockFactory);

    service = new APIClientService();
  });

  afterEach(() => {
    mockAdapter.restore();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize all API clients', () => {
      expect(mockFactory.createClient).toHaveBeenCalledTimes(3);
      
      // Check SportsData.io client creation
      expect(mockFactory.createClient).toHaveBeenCalledWith('sportsDataIO', {
        baseURL: 'https://api.sportsdata.io/v3/mma',
        timeout: 30000,
        rateLimitConfig: {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
          requestsPerDay: 10000
        },
        useProxy: true,
        headers: {
          'User-Agent': 'UFC-Prediction-Platform/1.0'
        }
      });

      // Check Odds API client creation
      expect(mockFactory.createClient).toHaveBeenCalledWith('oddsAPI', {
        baseURL: 'https://api.the-odds-api.com/v4',
        timeout: 15000,
        rateLimitConfig: {
          requestsPerMinute: 10,
          requestsPerHour: 500,
          requestsPerDay: 1000
        },
        useProxy: true,
        headers: {
          'User-Agent': 'UFC-Prediction-Platform/1.0'
        }
      });

      // Check ESPN API client creation
      expect(mockFactory.createClient).toHaveBeenCalledWith('espnAPI', {
        baseURL: 'https://site.web.api.espn.com/apis',
        timeout: 20000,
        rateLimitConfig: {
          requestsPerMinute: 100,
          requestsPerHour: 2000,
          requestsPerDay: 20000
        },
        useProxy: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
    });
  });

  describe('SportsData.io API Methods', () => {
    beforeEach(() => {
      mockSportsDataIOClient.get = jest.fn();
    });

    it('should fetch UFC event data', async () => {
      const mockEventData = { eventId: '864', name: 'UFC 319' };
      mockSportsDataIOClient.get.mockResolvedValue({ data: mockEventData });

      const result = await service.getUFCEvent('864');

      expect(mockSportsDataIOClient.get).toHaveBeenCalledWith('/scores/json/Event/864', { params: undefined });
      expect(result).toEqual(mockEventData);
    });

    it('should fetch event odds', async () => {
      const mockOddsData = { eventId: '864', odds: [] };
      mockSportsDataIOClient.get.mockResolvedValue({ data: mockOddsData });

      const result = await service.getEventOdds('864');

      expect(mockSportsDataIOClient.get).toHaveBeenCalledWith('/odds/json/EventOdds/864', { params: undefined });
      expect(result).toEqual(mockOddsData);
    });

    it('should fetch all events', async () => {
      const mockEventsData = [{ eventId: '864' }, { eventId: '865' }];
      mockSportsDataIOClient.get.mockResolvedValue({ data: mockEventsData });

      const result = await service.getAllEvents();

      expect(mockSportsDataIOClient.get).toHaveBeenCalledWith('/scores/json/Event', { params: undefined });
      expect(result).toEqual(mockEventsData);
    });

    it('should fetch fighters', async () => {
      const mockFightersData = [{ fighterId: 1, name: 'Fighter 1' }];
      mockSportsDataIOClient.get.mockResolvedValue({ data: mockFightersData });

      const result = await service.getFighters();

      expect(mockSportsDataIOClient.get).toHaveBeenCalledWith('/scores/json/Fighters', { params: undefined });
      expect(result).toEqual(mockFightersData);
    });

    it('should handle SportsData.io API errors', async () => {
      const mockError = new Error('API Error');
      mockSportsDataIOClient.get.mockRejectedValue(mockError);

      await expect(service.getUFCEvent('864')).rejects.toThrow('API Error');
    });
  });

  describe('The Odds API Methods', () => {
    beforeEach(() => {
      mockOddsAPIClient.get = jest.fn();
    });

    it('should fetch live odds', async () => {
      const mockOddsData = { odds: [] };
      mockOddsAPIClient.get.mockResolvedValue({ data: mockOddsData });

      const result = await service.getLiveOdds('us', 'h2h', 'american');

      expect(mockOddsAPIClient.get).toHaveBeenCalledWith('/sports/mma_mixed_martial_arts/odds', {
        params: {
          regions: 'us',
          markets: 'h2h',
          oddsFormat: 'american'
        }
      });
      expect(result).toEqual(mockOddsData);
    });

    it('should fetch odds sports', async () => {
      const mockSportsData = [{ key: 'mma_mixed_martial_arts' }];
      mockOddsAPIClient.get.mockResolvedValue({ data: mockSportsData });

      const result = await service.getOddsSports();

      expect(mockOddsAPIClient.get).toHaveBeenCalledWith('/sports', { params: undefined });
      expect(result).toEqual(mockSportsData);
    });

    it('should fetch odds events', async () => {
      const mockEventsData = [{ id: 'event1' }];
      mockOddsAPIClient.get.mockResolvedValue({ data: mockEventsData });

      const result = await service.getOddsEvents();

      expect(mockOddsAPIClient.get).toHaveBeenCalledWith('/sports/mma_mixed_martial_arts/events', { params: undefined });
      expect(result).toEqual(mockEventsData);
    });
  });

  describe('ESPN API Methods', () => {
    beforeEach(() => {
      mockESPNClient.get = jest.fn();
    });

    it('should fetch ESPN scoreboard', async () => {
      const mockScoreboardData = { events: [] };
      mockESPNClient.get.mockResolvedValue({ data: mockScoreboardData });

      const result = await service.getESPNScoreboard();

      expect(mockESPNClient.get).toHaveBeenCalledWith('/personalized/v2/scoreboard/header', {
        params: {
          sport: 'mma',
          league: 'ufc',
          region: 'us',
          lang: 'en',
          contentorigin: 'espn',
          configuration: 'SITE_DEFAULT',
          platform: 'web',
          buyWindow: '1m',
          showAirings: 'buy,live,replay',
          showZipLookup: true,
          tz: 'America/New_York',
          postalCode: '33126',
          playabilitySource: 'playbackId'
        }
      });
      expect(result).toEqual(mockScoreboardData);
    });

    it('should fetch ESPN events', async () => {
      const mockEventsData = { events: [] };
      mockESPNClient.get.mockResolvedValue({ data: mockEventsData });

      const result = await service.getESPNEvents();

      expect(mockESPNClient.get).toHaveBeenCalledWith('/common/v3/sports/mma/ufc/scoreboard', { params: undefined });
      expect(result).toEqual(mockEventsData);
    });

    it('should fetch ESPN fighters', async () => {
      const mockFightersData = { athletes: [] };
      mockESPNClient.get.mockResolvedValue({ data: mockFightersData });

      const result = await service.getESPNFighters();

      expect(mockESPNClient.get).toHaveBeenCalledWith('/common/v3/sports/mma/ufc/athletes', { params: undefined });
      expect(result).toEqual(mockFightersData);
    });
  });

  describe('Health Check', () => {
    it('should perform health check on all APIs', async () => {
      mockSportsDataIOClient.get = jest.fn().mockResolvedValue({ data: {} });
      mockOddsAPIClient.get = jest.fn().mockResolvedValue({ data: {} });
      mockESPNClient.get = jest.fn().mockResolvedValue({ data: {} });

      const result = await service.healthCheck();

      expect(result.sportsDataIO.status).toBe(true);
      expect(result.oddsAPI.status).toBe(true);
      expect(result.espnAPI.status).toBe(true);
      expect(result.sportsDataIO.responseTime).toBeGreaterThan(0);
      expect(result.oddsAPI.responseTime).toBeGreaterThan(0);
      expect(result.espnAPI.responseTime).toBeGreaterThan(0);
    });

    it('should handle health check failures', async () => {
      const mockError = new Error('Connection failed');
      mockSportsDataIOClient.get = jest.fn().mockRejectedValue(mockError);
      mockOddsAPIClient.get = jest.fn().mockResolvedValue({ data: {} });
      mockESPNClient.get = jest.fn().mockResolvedValue({ data: {} });

      const result = await service.healthCheck();

      expect(result.sportsDataIO.status).toBe(false);
      expect(result.sportsDataIO.error).toBe('Connection failed');
      expect(result.oddsAPI.status).toBe(true);
      expect(result.espnAPI.status).toBe(true);
    });
  });

  describe('Rate Limit Status', () => {
    it('should return rate limit status from factory', () => {
      const mockRateLimitStatus = {
        sportsDataIO: { requests: 5, resetTime: Date.now() + 60000 },
        oddsAPI: { requests: 2, resetTime: Date.now() + 60000 }
      };
      mockFactory.getRateLimitStatus.mockReturnValue(mockRateLimitStatus);

      const result = service.getRateLimitStatus();

      expect(mockFactory.getRateLimitStatus).toHaveBeenCalled();
      expect(result).toEqual(mockRateLimitStatus);
    });
  });

  describe('Cleanup', () => {
    it('should destroy factory on cleanup', () => {
      service.destroy();

      expect(mockFactory.destroy).toHaveBeenCalled();
    });
  });
});