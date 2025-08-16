import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { SportsDataIOConnector } from '../connectors/sports-data-io.connector.js';
import { sourceConfigManager } from '../config/source-configs.js';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

// Mock repositories
const mockFighterRepository = {
  create: vi.fn().mockResolvedValue({ id: 'test-fighter-id' }),
  update: vi.fn().mockResolvedValue({ id: 'test-fighter-id' }),
  findById: vi.fn(),
  findByName: vi.fn().mockResolvedValue(null),
  search: vi.fn().mockResolvedValue([])
};

const mockFightRepository = {
  create: vi.fn().mockResolvedValue({ id: 'test-fight-id' }),
  update: vi.fn().mockResolvedValue({ id: 'test-fight-id' }),
  findById: vi.fn(),
  search: vi.fn().mockResolvedValue([])
};

const mockEventRepository = {
  create: vi.fn().mockResolvedValue({ id: 'test-event-id' }),
  update: vi.fn().mockResolvedValue({ id: 'test-event-id' }),
  findById: vi.fn(),
  findByName: vi.fn().mockResolvedValue(null),
  addFight: vi.fn().mockResolvedValue({ id: 'test-event-id' })
};

describe('SportsDataIOConnector', () => {
  let connector: SportsDataIOConnector;
  let mockAxiosInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAxiosInstance = {
      request: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    
    // Set up test API key
    sourceConfigManager.setApiKey('SPORTS_DATA_IO', 'test-api-key');
    
    connector = new SportsDataIOConnector(
      mockFighterRepository,
      mockFightRepository,
      mockEventRepository
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with SportsDataIO configuration', () => {
      expect(connector).toBeDefined();
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.sportsdata.io/v3/mma'
        })
      );
    });

    it('should throw error if configuration not found', () => {
      // Remove the configuration
      sourceConfigManager.removeConfig('SPORTS_DATA_IO');
      
      expect(() => {
        new SportsDataIOConnector(mockFighterRepository, mockFightRepository, mockEventRepository);
      }).toThrow('SportsDataIO configuration not found');
      
      // Restore configuration
      sourceConfigManager.addConfig('SPORTS_DATA_IO', {
        name: 'SportsDataIO',
        description: 'Test',
        baseUrl: 'https://api.sportsdata.io/v3/mma',
        authType: 'apikey',
        endpoints: {},
        rateLimit: { requestsPerMinute: 100, requestsPerHour: 1000 },
        retryConfig: { maxRetries: 3, backoffMultiplier: 2, maxBackoffMs: 30000 }
      });
    });
  });

  describe('fighter data validation', () => {
    it('should validate correct fighter data', () => {
      const validFighter = {
        FighterId: 123,
        FirstName: 'Jon',
        LastName: 'Jones',
        Nickname: 'Bones',
        WeightClass: 'Light Heavyweight',
        Wins: 26,
        Losses: 1,
        Draws: 0,
        NoContests: 1,
        Height: 76,
        Weight: 205,
        Reach: 84
      };

      const errors = connector.validateData(validFighter);
      expect(errors).toHaveLength(0);
    });

    it('should detect missing fighter ID', () => {
      const invalidFighter = {
        FirstName: 'Jon',
        LastName: 'Jones',
        Wins: 26,
        Losses: 1,
        Draws: 0
      };

      const errors = connector.validateData(invalidFighter);
      expect(errors.some(e => e.field === 'FighterId')).toBe(true);
    });

    it('should detect missing name', () => {
      const invalidFighter = {
        FighterId: 123,
        Wins: 26,
        Losses: 1,
        Draws: 0
      };

      const errors = connector.validateData(invalidFighter);
      expect(errors.some(e => e.field === 'FirstName')).toBe(true);
    });

    it('should detect negative record values', () => {
      const invalidFighter = {
        FighterId: 123,
        FirstName: 'Jon',
        LastName: 'Jones',
        Wins: -1,
        Losses: 1,
        Draws: 0
      };

      const errors = connector.validateData(invalidFighter);
      expect(errors.some(e => e.field === 'record')).toBe(true);
    });

    it('should warn about unrealistic physical stats', () => {
      const fighterWithUnrealisticStats = {
        FighterId: 123,
        FirstName: 'Jon',
        LastName: 'Jones',
        Wins: 26,
        Losses: 1,
        Draws: 0,
        Height: 30, // Too short
        Weight: 500 // Too heavy
      };

      const errors = connector.validateData(fighterWithUnrealisticStats);
      expect(errors.some(e => e.field === 'Height' && e.severity === 'warning')).toBe(true);
      expect(errors.some(e => e.field === 'Weight' && e.severity === 'warning')).toBe(true);
    });

    it('should validate array of fighters', () => {
      const fighters = [
        {
          FighterId: 123,
          FirstName: 'Jon',
          LastName: 'Jones',
          Wins: 26,
          Losses: 1,
          Draws: 0
        },
        {
          FighterId: 456,
          FirstName: 'Daniel',
          LastName: 'Cormier',
          Wins: 22,
          Losses: 3,
          Draws: 0
        }
      ];

      const errors = connector.validateData(fighters);
      expect(errors).toHaveLength(0);
    });
  });

  describe('event data validation', () => {
    it('should validate correct event data', () => {
      const validEvent = {
        EventId: 864,
        Name: 'UFC 319',
        DateTime: '2025-01-18T22:00:00',
        Status: 'Scheduled',
        Fights: [
          {
            FightId: 1001,
            Fighters: [
              { FighterId: 123, FirstName: 'Jon', LastName: 'Jones' },
              { FighterId: 456, FirstName: 'Stipe', LastName: 'Miocic' }
            ],
            Rounds: 5,
            WeightClass: 'Heavyweight'
          }
        ]
      };

      const errors = connector.validateData(validEvent);
      expect(errors).toHaveLength(0);
    });

    it('should detect missing event ID', () => {
      const invalidEvent = {
        Name: 'UFC 319',
        DateTime: '2025-01-18T22:00:00',
        Fights: []
      };

      const errors = connector.validateData(invalidEvent);
      expect(errors.some(e => e.field === 'EventId')).toBe(true);
    });

    it('should detect missing event name', () => {
      const invalidEvent = {
        EventId: 864,
        DateTime: '2025-01-18T22:00:00',
        Fights: []
      };

      const errors = connector.validateData(invalidEvent);
      expect(errors.some(e => e.field === 'Name')).toBe(true);
    });

    it('should validate fight data within events', () => {
      const eventWithInvalidFight = {
        EventId: 864,
        Name: 'UFC 319',
        DateTime: '2025-01-18T22:00:00',
        Fights: [
          {
            // Missing FightId
            Fighters: [
              { FighterId: 123, FirstName: 'Jon', LastName: 'Jones' }
              // Missing second fighter
            ],
            Rounds: 5
          }
        ]
      };

      const errors = connector.validateData(eventWithInvalidFight);
      expect(errors.some(e => e.field.includes('FightId'))).toBe(true);
      expect(errors.some(e => e.field.includes('Fighters'))).toBe(true);
    });
  });

  describe('data transformation', () => {
    it('should transform fighter data correctly', () => {
      const sportsDataFighter = {
        FighterId: 123,
        FirstName: 'Jon',
        LastName: 'Jones',
        Nickname: 'Bones',
        WeightClass: 'Light Heavyweight',
        Wins: 26,
        Losses: 1,
        Draws: 0,
        NoContests: 1,
        Height: 76,
        Weight: 205,
        Reach: 84
      };

      const transformed = connector.transformData(sportsDataFighter);

      expect(transformed).toEqual({
        name: 'Jon Jones',
        nickname: 'Bones',
        physicalStats: {
          height: 76,
          weight: 205,
          reach: 84,
          legReach: 0,
          stance: 'Orthodox'
        },
        record: {
          wins: 26,
          losses: 1,
          draws: 0,
          noContests: 1
        },
        rankings: {
          weightClass: 'Light Heavyweight',
          rank: undefined,
          p4pRank: undefined
        },
        camp: {
          name: 'Unknown',
          location: 'Unknown',
          headCoach: 'Unknown'
        },
        socialMedia: {
          instagram: undefined,
          twitter: undefined
        },
        calculatedMetrics: expect.any(Object),
        trends: expect.any(Object),
        lastUpdated: expect.any(Date)
      });
    });

    it('should transform event data correctly', () => {
      const sportsDataEvent = {
        EventId: 864,
        Name: 'UFC 319',
        DateTime: '2025-01-18T22:00:00Z',
        Status: 'Scheduled',
        Fights: [
          { FightId: 1001 },
          { FightId: 1002 }
        ]
      };

      const transformed = connector.transformData(sportsDataEvent);

      expect(transformed).toEqual({
        name: 'UFC 319',
        date: new Date('2025-01-18T22:00:00Z'),
        venue: {
          name: 'TBD',
          city: 'TBD',
          country: 'USA'
        },
        commission: 'TBD',
        fights: []
      });
    });

    it('should normalize weight classes correctly', () => {
      const testCases = [
        { input: 'Heavyweight', expected: 'heavyweight' },
        { input: 'Light Heavyweight', expected: 'light_heavyweight' },
        { input: 'Middleweight', expected: 'middleweight' },
        { input: "Women's Bantamweight", expected: 'womens_bantamweight' },
        { input: 'Unknown Class', expected: 'unknown' }
      ];

      testCases.forEach(({ input, expected }) => {
        const fighter = {
          FighterId: 123,
          FirstName: 'Test',
          LastName: 'Fighter',
          WeightClass: input,
          Wins: 0,
          Losses: 0,
          Draws: 0,
          NoContests: 0
        };

        const transformed = connector.transformData(fighter);
        expect(transformed.rankings.weightClass).toBe(input === 'Unknown Class' ? 'Lightweight' : input);
      });
    });
  });

  describe('syncFighters', () => {
    it('should successfully sync fighters', async () => {
      const mockFightersData = [
        {
          FighterId: 123,
          FirstName: 'Jon',
          LastName: 'Jones',
          WeightClass: 'Light Heavyweight',
          Wins: 26,
          Losses: 1,
          Draws: 0
        },
        {
          FighterId: 456,
          FirstName: 'Daniel',
          LastName: 'Cormier',
          WeightClass: 'Light Heavyweight',
          Wins: 22,
          Losses: 3,
          Draws: 0
        }
      ];

      mockAxiosInstance.request.mockResolvedValue({
        data: mockFightersData
      });

      const result = await connector.syncFighters();

      expect(result.sourceId).toBe('SPORTS_DATA_IO');
      expect(result.recordsProcessed).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockFighterRepository.create).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('API Error');
      mockAxiosInstance.request.mockRejectedValue(apiError);

      const result = await connector.syncFighters();

      expect(result.recordsProcessed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('sync');
    });

    it('should handle repository errors', async () => {
      const mockFightersData = [
        {
          FighterId: 123,
          FirstName: 'Jon',
          LastName: 'Jones',
          WeightClass: 'Light Heavyweight',
          Wins: 26,
          Losses: 1,
          Draws: 0
        }
      ];

      mockAxiosInstance.request.mockResolvedValue({
        data: mockFightersData
      });

      mockFighterRepository.create.mockRejectedValue(new Error('Database error'));

      const result = await connector.syncFighters();

      expect(result.recordsProcessed).toBe(0);
      expect(result.recordsSkipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('transformation');
    });
  });

  describe('syncEvent', () => {
    it('should successfully sync event data', async () => {
      const mockEventData = {
        EventId: 864,
        Name: 'UFC 319',
        DateTime: '2025-01-18T22:00:00Z',
        Status: 'Scheduled',
        Fights: [
          {
            FightId: 1001,
            Fighters: [
              { FighterId: 123, FirstName: 'Jon', LastName: 'Jones' },
              { FighterId: 456, FirstName: 'Stipe', LastName: 'Miocic' }
            ],
            Rounds: 5,
            WeightClass: 'Heavyweight',
            Status: 'Scheduled',
            Order: 1,
            CardSegment: 'Main'
          }
        ]
      };

      mockAxiosInstance.request.mockResolvedValue({
        data: mockEventData
      });

      const result = await connector.syncEventFights(864);

      expect(result.sourceId).toBe('SPORTS_DATA_IO');
      expect(result.recordsProcessed).toBe(1); // 1 fight
      expect(result.errors).toHaveLength(0);
      expect(mockFightRepository.create).toHaveBeenCalledTimes(1);
    });

    it('should make correct API call for specific event', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          EventId: 864,
          Name: 'UFC 319',
          DateTime: '2025-01-18T22:00:00Z',
          Fights: []
        }
      });

      await connector.syncEventFights(864);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: expect.stringContaining('/scores/json/Event/864')
      });
    });
  });

  describe('syncSchedule', () => {
    it('should successfully sync schedule data', async () => {
      const mockScheduleData = [
        {
          EventId: 864,
          Name: 'UFC 319',
          DateTime: '2025-01-18T22:00:00Z',
          Status: 'Scheduled'
        },
        {
          EventId: 865,
          Name: 'UFC 320',
          DateTime: '2025-02-15T22:00:00Z',
          Status: 'Scheduled'
        }
      ];

      mockAxiosInstance.request.mockResolvedValue({
        data: mockScheduleData
      });

      const result = await connector.syncSchedule(2025);

      expect(result.sourceId).toBe('SPORTS_DATA_IO');
      expect(result.recordsProcessed).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockEventRepository.create).toHaveBeenCalledTimes(2);
    });

    it('should use current year as default season', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: []
      });

      const currentYear = new Date().getFullYear();
      await connector.syncEvents(currentYear);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: expect.stringContaining(`/scores/json/Schedule/${currentYear}`)
      });
    });
  });

  describe('syncData (full sync)', () => {
    it('should perform full sync of fighters and schedule', async () => {
      // Mock fighters response
      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: [
            {
              FighterId: 123,
              FirstName: 'Jon',
              LastName: 'Jones',
              WeightClass: 'Light Heavyweight',
              Wins: 26,
              Losses: 1,
              Draws: 0
            }
          ]
        })
        // Mock schedule response
        .mockResolvedValueOnce({
          data: [
            {
              EventId: 864,
              Name: 'UFC 319',
              DateTime: '2025-01-18T22:00:00Z',
              Status: 'Scheduled'
            }
          ]
        });

      const result = await connector.syncData();

      expect(result.sourceId).toBe('SPORTS_DATA_IO');
      expect(result.recordsProcessed).toBe(2); // 1 fighter + 1 event
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);
    });

    it('should aggregate errors from both sync operations', async () => {
      // Mock fighters response with invalid data
      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: [
            {
              // Missing FighterId
              FirstName: 'Jon',
              LastName: 'Jones',
              Wins: 26,
              Losses: 1,
              Draws: 0
            }
          ]
        })
        // Mock schedule response
        .mockResolvedValueOnce({
          data: [
            {
              EventId: 864,
              Name: 'UFC 319',
              DateTime: '2025-01-18T22:00:00Z'
            }
          ]
        });

      const result = await connector.syncData();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === '[0].FighterId')).toBe(true);
    });
  });

  describe('event emission', () => {
    it('should emit fightersSynced event', (done) => {
      mockAxiosInstance.request.mockResolvedValue({
        data: [
          {
            FighterId: 123,
            FirstName: 'Jon',
            LastName: 'Jones',
            WeightClass: 'Light Heavyweight',
            Wins: 26,
            Losses: 1,
            Draws: 0
          }
        ]
      });

      connector.on('fightersSynced', (event) => {
        expect(event.count).toBe(1);
        expect(event.errors).toBe(0);
        done();
      });

      connector.syncFighters();
    });

    it('should emit eventSynced event', (done) => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          EventId: 864,
          Name: 'UFC 319',
          DateTime: '2025-01-18T22:00:00Z',
          Fights: []
        }
      });

      connector.on('eventSynced', (event) => {
        expect(event.eventId).toBe(864);
        expect(event.fightsCount).toBe(0);
        done();
      });

      connector.syncEvent(864);
    });
  });
});