import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ESPNAPIConnector, ESPNScoreboardResponse, ESPNEvent, ESPNAthlete } from '../connectors/espn-api.connector.js';
import { FighterRepository } from '../../repositories/fighter.repository.js';
import { FightRepository } from '../../repositories/fight.repository.js';
import { EventRepository } from '../../repositories/event.repository.js';
import { sourceConfigManager } from '../config/source-configs.js';

// Mock the repositories
vi.mock('../../repositories/fighter.repository.js');
vi.mock('../../repositories/fight.repository.js');
vi.mock('../../repositories/event.repository.js');

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      request: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    }))
  }
}));

describe('ESPNAPIConnector', () => {
  let connector: ESPNAPIConnector;
  let mockFighterRepo: vi.Mocked<FighterRepository>;
  let mockFightRepo: vi.Mocked<FightRepository>;
  let mockEventRepo: vi.Mocked<EventRepository>;

  const mockScoreboardResponse: ESPNScoreboardResponse = {
    sports: [{
      id: '1',
      name: 'MMA',
      leagues: [{
        id: '1',
        name: 'UFC',
        abbreviation: 'UFC',
        events: [{
          id: 'test-event-1',
          name: 'UFC 300: Test Event',
          shortName: 'UFC 300',
          date: '2024-04-13T23:00:00Z',
          status: {
            clock: 0,
            displayClock: '0:00',
            period: 0,
            type: {
              id: '1',
              name: 'STATUS_SCHEDULED',
              state: 'pre',
              completed: false,
              description: 'Scheduled'
            }
          },
          competitions: [{
            id: 'comp-1',
            date: '2024-04-13T23:00:00Z',
            type: { id: '1', abbreviation: 'STD' },
            timeValid: true,
            neutralSite: false,
            conferenceCompetition: false,
            playByPlayAvailable: false,
            recent: false,
            venue: {
              id: 'venue-1',
              fullName: 'T-Mobile Arena',
              address: {
                city: 'Las Vegas',
                state: 'NV',
                country: 'USA'
              }
            },
            competitors: [{
              id: 'fighter-1',
              uid: 'fighter-1-uid',
              type: 'team',
              order: 1,
              homeAway: 'home',
              team: {
                id: 'team-1',
                uid: 'team-1-uid',
                location: 'Fighter',
                name: 'One',
                abbreviation: 'F1',
                displayName: 'Fighter One',
                shortDisplayName: 'F. One',
                color: '000000',
                alternateColor: 'ffffff',
                isActive: true,
                venue: {
                  id: 'venue-1',
                  fullName: 'T-Mobile Arena',
                  address: { city: 'Las Vegas', state: 'NV', country: 'USA' }
                },
                links: [],
                logo: 'logo-url'
              }
            }, {
              id: 'fighter-2',
              uid: 'fighter-2-uid',
              type: 'team',
              order: 2,
              homeAway: 'away',
              team: {
                id: 'team-2',
                uid: 'team-2-uid',
                location: 'Fighter',
                name: 'Two',
                abbreviation: 'F2',
                displayName: 'Fighter Two',
                shortDisplayName: 'F. Two',
                color: '000000',
                alternateColor: 'ffffff',
                isActive: true,
                venue: {
                  id: 'venue-1',
                  fullName: 'T-Mobile Arena',
                  address: { city: 'Las Vegas', state: 'NV', country: 'USA' }
                },
                links: [],
                logo: 'logo-url'
              }
            }],
            status: {
              clock: 0,
              displayClock: '0:00',
              period: 0,
              type: {
                id: '1',
                name: 'STATUS_SCHEDULED',
                state: 'pre',
                completed: false,
                description: 'Scheduled'
              }
            }
          }]
        }]
      }]
    }]
  };

  const mockFighterRankings = {
    athletes: [{
      id: 'athlete-1',
      uid: 'athlete-1-uid',
      guid: 'athlete-1-guid',
      displayName: 'Jon Jones',
      shortName: 'J. Jones',
      weight: 205,
      displayWeight: '205 lbs',
      age: 36,
      dateOfBirth: '1987-07-19T00:00:00Z',
      birthPlace: {
        city: 'Rochester',
        state: 'NY',
        country: 'USA'
      },
      citizenship: 'USA',
      height: 76,
      displayHeight: '6\'4"',
      position: {
        id: '1',
        name: 'Light Heavyweight',
        displayName: 'Light Heavyweight',
        abbreviation: 'LHW'
      },
      jersey: '1',
      active: true,
      alternateIds: { sdr: 'sdr-id' },
      headshot: {
        href: 'headshot-url',
        alt: 'Jon Jones'
      },
      links: []
    }]
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock repositories
    mockFighterRepo = {
      findByName: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      search: vi.fn()
    } as any;

    mockFightRepo = {
      create: vi.fn(),
      update: vi.fn(),
      search: vi.fn()
    } as any;

    mockEventRepo = {
      findByName: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      addFight: vi.fn()
    } as any;

    // Mock the source config
    vi.spyOn(sourceConfigManager, 'getConfig').mockReturnValue({
      name: 'ESPN API',
      baseUrl: 'https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc',
      authType: 'none',
      endpoints: {
        scoreboard: '/scoreboard',
        fighters: '/athletes'
      },
      rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      retryConfig: { maxRetries: 2, backoffMultiplier: 1.5, maxBackoffMs: 10000 }
    });

    connector = new ESPNAPIConnector(mockFighterRepo, mockFightRepo, mockEventRepo);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with ESPN API configuration', () => {
      expect(sourceConfigManager.getConfig).toHaveBeenCalledWith('ESPN_API');
      expect(connector).toBeInstanceOf(ESPNAPIConnector);
    });

    it('should throw error if ESPN API configuration not found', () => {
      vi.spyOn(sourceConfigManager, 'getConfig').mockReturnValue(undefined);
      
      expect(() => new ESPNAPIConnector()).toThrow('ESPN API configuration not found');
    });
  });

  describe('validateScoreboardData', () => {
    it('should validate valid scoreboard data', () => {
      const errors = connector.validateScoreboardData(mockScoreboardResponse);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing sports array', () => {
      const invalidData = { sports: null } as any;
      const errors = connector.validateScoreboardData(invalidData);
      
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('sports');
      expect(errors[0].severity).toBe('error');
    });

    it('should validate events within leagues', () => {
      const dataWithInvalidEvent = {
        sports: [{
          id: '1',
          name: 'MMA',
          leagues: [{
            id: '1',
            name: 'UFC',
            abbreviation: 'UFC',
            events: [{
              id: '', // Invalid - empty ID
              name: 'UFC 300',
              date: 'invalid-date' // Invalid date format
            }]
          }]
        }]
      };

      const errors = connector.validateScoreboardData(dataWithInvalidEvent);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field.includes('id'))).toBe(true);
      expect(errors.some(e => e.field.includes('date'))).toBe(true);
    });
  });

  describe('validateEventData', () => {
    it('should validate valid event data', () => {
      const validEvent = mockScoreboardResponse.sports[0].leagues[0].events[0];
      const errors = connector.validateEventData(validEvent);
      expect(errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', () => {
      const invalidEvent = {
        id: '',
        name: '',
        date: 'invalid-date'
      } as ESPNEvent;

      const errors = connector.validateEventData(invalidEvent);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'id')).toBe(true);
      expect(errors.some(e => e.field === 'name')).toBe(true);
      expect(errors.some(e => e.field === 'date')).toBe(true);
    });

    it('should validate competition competitors', () => {
      const eventWithInvalidCompetition = {
        ...mockScoreboardResponse.sports[0].leagues[0].events[0],
        competitions: [{
          ...mockScoreboardResponse.sports[0].leagues[0].events[0].competitions[0],
          competitors: [{ id: 'only-one-competitor' }] // Should have 2 competitors
        }]
      };

      const errors = connector.validateEventData(eventWithInvalidCompetition);
      expect(errors.some(e => e.field.includes('competitors'))).toBe(true);
    });
  });

  describe('validateFighterData', () => {
    it('should validate valid fighter data', () => {
      const validFighter = mockFighterRankings.athletes[0];
      const errors = connector.validateFighterData(validFighter);
      expect(errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', () => {
      const invalidFighter = {
        id: '',
        displayName: '',
        weight: 500, // Unrealistic weight
        height: 100, // Unrealistic height
        age: 60 // Unrealistic age for active fighter
      } as ESPNAthlete;

      const errors = connector.validateFighterData(invalidFighter);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'id')).toBe(true);
      expect(errors.some(e => e.field === 'displayName')).toBe(true);
      expect(errors.some(e => e.field === 'weight' && e.severity === 'warning')).toBe(true);
      expect(errors.some(e => e.field === 'height' && e.severity === 'warning')).toBe(true);
      expect(errors.some(e => e.field === 'age' && e.severity === 'warning')).toBe(true);
    });
  });

  describe('transformEventData', () => {
    it('should transform ESPN event to internal event format', () => {
      const espnEvent = mockScoreboardResponse.sports[0].leagues[0].events[0];
      const transformed = connector.transformEventData(espnEvent);

      expect(transformed.name).toBe('UFC 300: Test Event');
      expect(transformed.date).toEqual(new Date('2024-04-13T23:00:00Z'));
      expect(transformed.venue.name).toBe('T-Mobile Arena');
      expect(transformed.venue.city).toBe('Las Vegas');
      expect(transformed.venue.state).toBe('NV');
      expect(transformed.venue.country).toBe('USA');
      expect(transformed.fights).toEqual([]);
    });

    it('should handle missing venue information', () => {
      const eventWithoutVenue = {
        ...mockScoreboardResponse.sports[0].leagues[0].events[0],
        competitions: [{
          ...mockScoreboardResponse.sports[0].leagues[0].events[0].competitions[0],
          venue: undefined
        }]
      };

      const transformed = connector.transformEventData(eventWithoutVenue);
      expect(transformed.venue.name).toBe('TBD');
      expect(transformed.venue.city).toBe('TBD');
      expect(transformed.venue.country).toBe('USA');
    });
  });

  describe('transformFighterData', () => {
    it('should transform ESPN athlete to internal fighter format', () => {
      const espnAthlete = mockFighterRankings.athletes[0];
      const transformed = connector.transformFighterData(espnAthlete);

      expect(transformed.name).toBe('Jon Jones');
      expect(transformed.physicalStats.height).toBe(76);
      expect(transformed.physicalStats.weight).toBe(205);
      expect(transformed.physicalStats.stance).toBe('Orthodox');
      expect(transformed.rankings.weightClass).toBe('Light Heavyweight');
      expect(transformed.trends.activityLevel).toBe('active');
      expect(transformed.camp.location).toBe('Rochester, USA');
    });

    it('should determine correct weight class from weight', () => {
      const lightweightFighter = {
        ...mockFighterRankings.athletes[0],
        weight: 155
      };

      const transformed = connector.transformFighterData(lightweightFighter);
      expect(transformed.rankings.weightClass).toBe('Lightweight');
    });

    it('should handle missing weight information', () => {
      const fighterWithoutWeight = {
        ...mockFighterRankings.athletes[0],
        weight: undefined
      };

      const transformed = connector.transformFighterData(fighterWithoutWeight);
      expect(transformed.rankings.weightClass).toBe('Lightweight'); // Default
      expect(transformed.physicalStats.weight).toBe(0);
    });
  });

  describe('syncMMAEvents', () => {
    it('should successfully sync MMA events', async () => {
      // Mock the makeRequest method
      const makeRequestSpy = vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockScoreboardResponse
      });

      // Mock repository methods
      mockEventRepo.findByName.mockResolvedValue(null);
      mockEventRepo.create.mockResolvedValue({ id: 'event-1', name: 'UFC 300: Test Event' } as any);
      mockFightRepo.search.mockResolvedValue([]);
      mockFightRepo.create.mockResolvedValue({ id: 'fight-1' } as any);

      const result = await connector.syncMMAEvents();

      expect(makeRequestSpy).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard'
      });

      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.sourceId).toBe('ESPN_API');
      expect(mockEventRepo.create).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const makeRequestSpy = vi.spyOn(connector as any, 'makeRequest').mockRejectedValue(
        new Error('API Error')
      );

      await expect(connector.syncMMAEvents()).rejects.toThrow('Failed to sync MMA events from ESPN: API Error');
    });

    it('should skip events with validation errors', async () => {
      const invalidScoreboardResponse = {
        sports: [{
          id: '1',
          name: 'MMA',
          leagues: [{
            id: '1',
            name: 'UFC',
            abbreviation: 'UFC',
            events: [{
              id: '', // Invalid - empty ID
              name: 'UFC 300',
              date: '2024-04-13T23:00:00Z'
            }]
          }]
        }]
      };

      const makeRequestSpy = vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: invalidScoreboardResponse
      });

      const result = await connector.syncMMAEvents();

      expect(result.recordsSkipped).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('syncFighterRankings', () => {
    it('should successfully sync fighter rankings', async () => {
      const makeRequestSpy = vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockFighterRankings
      });

      mockFighterRepo.findByName.mockResolvedValue(null);
      mockFighterRepo.create.mockResolvedValue({ id: 'fighter-1', name: 'Jon Jones' } as any);

      const result = await connector.syncFighterRankings();

      expect(makeRequestSpy).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc/athletes',
        params: { limit: '200' }
      });

      expect(result.recordsProcessed).toBe(1);
      expect(result.sourceId).toBe('ESPN_API');
      expect(mockFighterRepo.create).toHaveBeenCalled();
    });

    it('should update existing fighters', async () => {
      const makeRequestSpy = vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockFighterRankings
      });

      const existingFighter = { id: 'existing-fighter-1', name: 'Jon Jones' };
      mockFighterRepo.findByName.mockResolvedValue(existingFighter as any);
      mockFighterRepo.update.mockResolvedValue(existingFighter as any);

      const result = await connector.syncFighterRankings();

      expect(result.recordsProcessed).toBe(1);
      expect(mockFighterRepo.update).toHaveBeenCalled();
      expect(mockFighterRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getLiveFightData', () => {
    it('should fetch live fight data for an event', async () => {
      const mockLiveData = {
        competitions: [{
          id: 'live-comp-1',
          status: {
            clock: 180,
            displayClock: '3:00',
            period: 2,
            type: {
              id: '2',
              name: 'STATUS_IN_PROGRESS',
              state: 'in',
              completed: false,
              description: 'In Progress'
            }
          }
        }]
      };

      const makeRequestSpy = vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockLiveData
      });

      const liveFights = await connector.getLiveFightData('test-event-1');

      expect(makeRequestSpy).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc/summary',
        params: { event: 'test-event-1' }
      });

      expect(liveFights).toHaveLength(1);
      expect(liveFights[0].status).toBe('in_progress');
      expect(liveFights[0].currentRound).toBe(2);
      expect(liveFights[0].timeRemaining).toBe('3:00');
    });

    it('should handle API errors and return empty array', async () => {
      const makeRequestSpy = vi.spyOn(connector as any, 'makeRequest').mockRejectedValue(
        new Error('Live data API error')
      );

      const liveFights = await connector.getLiveFightData('test-event-1');

      expect(liveFights).toEqual([]);
    });
  });

  describe('cache management', () => {
    it('should cache live fight data', async () => {
      const mockLiveData = {
        competitions: [{
          id: 'live-comp-1',
          status: {
            type: { state: 'in' },
            period: 1,
            displayClock: '5:00'
          }
        }]
      };

      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockLiveData
      });

      await connector.getLiveFightData('test-event-1');

      const cachedData = connector.getCachedLiveFightData('espn_live-comp-1');
      expect(cachedData).toBeDefined();
      expect(cachedData?.status).toBe('in_progress');
    });

    it('should clear live fight cache', () => {
      // Add some data to cache first
      (connector as any).liveFightCache.set('test-fight', { fightId: 'test-fight' });
      
      expect(connector.getCachedLiveFightData('test-fight')).toBeDefined();
      
      connector.clearLiveFightCache();
      
      expect(connector.getCachedLiveFightData('test-fight')).toBeUndefined();
    });
  });
});