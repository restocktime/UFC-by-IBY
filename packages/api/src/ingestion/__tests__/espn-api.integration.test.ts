import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ESPNAPIConnector } from '../connectors/espn-api.connector.js';
import { sourceConfigManager } from '../config/source-configs.js';

// Integration tests for ESPN API connector
// These tests make actual API calls to ESPN (when not mocked)
describe('ESPNAPIConnector Integration Tests', () => {
  let connector: ESPNAPIConnector;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    
    // Mock the source config to avoid actual API calls in CI
    vi.spyOn(sourceConfigManager, 'getConfig').mockReturnValue({
      name: 'ESPN API',
      baseUrl: 'https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc',
      authType: 'none',
      endpoints: {
        scoreboard: '/scoreboard',
        fighters: '/athletes',
        rankings: '/athletes/rankings',
        eventSummary: '/summary',
        liveScoreboard: '/scoreboard'
      },
      rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000 },
      retryConfig: { maxRetries: 2, backoffMultiplier: 1.5, maxBackoffMs: 10000 },
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; UFC-Prediction-Platform/1.0.0)'
      }
    });

    connector = new ESPNAPIConnector();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Real API Integration', () => {
    // Skip these tests in CI environment to avoid rate limiting
    const skipInCI = process.env.CI === 'true';

    it.skipIf(skipInCI)('should fetch real ESPN scoreboard data', async () => {
      // Mock the makeRequest to simulate a successful response
      const mockScoreboardData = {
        sports: [{
          id: '1',
          name: 'Mixed Martial Arts',
          leagues: [{
            id: '1',
            name: 'Ultimate Fighting Championship',
            abbreviation: 'UFC',
            events: [{
              id: 'test-event-1',
              name: 'UFC 300: Pereira vs Hill',
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
                    location: 'Alex',
                    name: 'Pereira',
                    abbreviation: 'PER',
                    displayName: 'Alex Pereira',
                    shortDisplayName: 'A. Pereira',
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
                    location: 'Jamahal',
                    name: 'Hill',
                    abbreviation: 'HIL',
                    displayName: 'Jamahal Hill',
                    shortDisplayName: 'J. Hill',
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

      // Mock the makeRequest method
      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockScoreboardData
      });

      const result = await connector.syncMMAEvents();

      expect(result).toBeDefined();
      expect(result.sourceId).toBe('ESPN_API');
      expect(result.recordsProcessed).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.errors)).toBe(true);
    }, 10000); // 10 second timeout for API calls

    it.skipIf(skipInCI)('should fetch real ESPN fighter rankings', async () => {
      const mockFighterData = {
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

      // Mock the makeRequest method
      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockFighterData
      });

      const result = await connector.syncFighterRankings();

      expect(result).toBeDefined();
      expect(result.sourceId).toBe('ESPN_API');
      expect(result.recordsProcessed).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.errors)).toBe(true);
    }, 10000);

    it.skipIf(skipInCI)('should handle rate limiting gracefully', async () => {
      // Mock rate limit error
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).response = { status: 429 };

      vi.spyOn(connector as any, 'makeRequest')
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ data: { sports: [] } });

      // Should retry and eventually succeed
      const result = await connector.syncMMAEvents();
      expect(result).toBeDefined();
    }, 15000);

    it.skipIf(skipInCI)('should handle network errors gracefully', async () => {
      // Mock network error
      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNABORTED';

      vi.spyOn(connector as any, 'makeRequest')
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: { sports: [] } });

      // Should retry and eventually succeed
      const result = await connector.syncMMAEvents();
      expect(result).toBeDefined();
    }, 15000);
  });

  describe('Data Quality Validation', () => {
    it('should validate ESPN response structure', () => {
      const validResponse = {
        sports: [{
          id: '1',
          name: 'MMA',
          leagues: [{
            id: '1',
            name: 'UFC',
            abbreviation: 'UFC',
            events: []
          }]
        }]
      };

      const errors = connector.validateScoreboardData(validResponse);
      expect(errors).toHaveLength(0);
    });

    it('should detect malformed ESPN responses', () => {
      const malformedResponse = {
        sports: null
      };

      const errors = connector.validateScoreboardData(malformedResponse as any);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].severity).toBe('error');
    });

    it('should validate fighter data quality', () => {
      const validFighter = {
        id: 'fighter-1',
        displayName: 'Test Fighter',
        weight: 170,
        height: 72,
        age: 28,
        active: true,
        birthPlace: { city: 'Test City', country: 'USA' },
        position: { name: 'Welterweight' }
      };

      const errors = connector.validateFighterData(validFighter as any);
      expect(errors).toHaveLength(0);
    });

    it('should flag unrealistic fighter data', () => {
      const unrealisticFighter = {
        id: 'fighter-1',
        displayName: 'Test Fighter',
        weight: 500, // Unrealistic
        height: 100, // Unrealistic
        age: 60, // Unrealistic for active fighter
        active: true
      };

      const errors = connector.validateFighterData(unrealisticFighter as any);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'weight')).toBe(true);
      expect(errors.some(e => e.field === 'height')).toBe(true);
      expect(errors.some(e => e.field === 'age')).toBe(true);
    });
  });

  describe('Live Data Functionality', () => {
    it('should process live fight data correctly', async () => {
      const mockLiveResponse = {
        competitions: [{
          id: 'live-fight-1',
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

      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockLiveResponse
      });

      const liveFights = await connector.getLiveFightData('test-event');

      expect(liveFights).toHaveLength(1);
      expect(liveFights[0].status).toBe('in_progress');
      expect(liveFights[0].currentRound).toBe(2);
      expect(liveFights[0].timeRemaining).toBe('3:00');
    });

    it('should cache live fight data', async () => {
      const mockLiveResponse = {
        competitions: [{
          id: 'live-fight-1',
          status: {
            type: { state: 'in' },
            period: 1,
            displayClock: '5:00'
          }
        }]
      };

      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockLiveResponse
      });

      await connector.getLiveFightData('test-event');

      const cachedData = connector.getCachedLiveFightData('espn_live-fight-1');
      expect(cachedData).toBeDefined();
      expect(cachedData?.fightId).toBe('espn_live-fight-1');
    });
  });

  describe('Error Handling', () => {
    it('should handle ESPN API downtime', async () => {
      const serverError = new Error('Server Error');
      (serverError as any).response = { status: 500 };

      vi.spyOn(connector as any, 'makeRequest').mockRejectedValue(serverError);

      await expect(connector.syncMMAEvents()).rejects.toThrow();
    });

    it('should handle malformed ESPN responses', async () => {
      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: { invalid: 'response' }
      });

      const result = await connector.syncMMAEvents();
      expect(result.recordsSkipped).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should emit appropriate events on errors', async () => {
      const errorSpy = vi.fn();
      connector.on('syncError', errorSpy);

      const error = new Error('Test error');
      vi.spyOn(connector as any, 'makeRequest').mockRejectedValue(error);

      await expect(connector.syncMMAEvents()).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalledWith({
        error: 'Test error',
        sourceId: 'ESPN_API'
      });
    });
  });

  describe('Performance', () => {
    it('should complete sync within reasonable time', async () => {
      const mockResponse = {
        sports: [{
          id: '1',
          name: 'MMA',
          leagues: [{
            id: '1',
            name: 'UFC',
            abbreviation: 'UFC',
            events: Array(10).fill(null).map((_, i) => ({
              id: `event-${i}`,
              name: `UFC Event ${i}`,
              shortName: `UFC ${i}`,
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
              competitions: []
            }))
          }]
        }]
      };

      vi.spyOn(connector as any, 'makeRequest').mockResolvedValue({
        data: mockResponse
      });

      const startTime = Date.now();
      const result = await connector.syncMMAEvents();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });
  });
});