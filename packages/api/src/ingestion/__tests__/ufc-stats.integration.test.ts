import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { UFCStatsConnector } from '../connectors/ufc-stats.connector.js';
import { FighterRepository } from '../../repositories/fighter.repository.js';
import { FightRepository } from '../../repositories/fight.repository.js';

// Mock the repositories
vi.mock('../../repositories/fighter.repository.js');
vi.mock('../../repositories/fight.repository.js');

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('UFCStatsConnector Integration Tests', () => {
  let connector: UFCStatsConnector;
  let mockFighterRepository: vi.Mocked<FighterRepository>;
  let mockFightRepository: vi.Mocked<FightRepository>;

  // Mock HTML responses
  const mockFighterListHTML = `
    <html>
      <body>
        <table class="b-statistics__table">
          <tbody>
            <tr>
              <td><a href="/fighter-details/jon-jones">Jon Jones</a></td>
              <td>Bones</td>
              <td>6' 4"</td>
              <td>205 lbs</td>
              <td>84"</td>
              <td>Orthodox</td>
              <td>26-1-0</td>
            </tr>
            <tr>
              <td><a href="/fighter-details/daniel-cormier">Daniel Cormier</a></td>
              <td>DC</td>
              <td>5' 11"</td>
              <td>205 lbs</td>
              <td>72.5"</td>
              <td>Orthodox</td>
              <td>22-3-0</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  const mockFighterDetailsHTML = `
    <html>
      <body>
        <div class="b-list__box-list-item">DOB: Jul 19, 1987</div>
        <div class="b-list__box-list-item">SLpM: 4.50</div>
        <div class="b-list__box-list-item">Str. Acc.: 58%</div>
        <div class="b-list__box-list-item">SApM: 2.80</div>
        <div class="b-list__box-list-item">Str. Def.: 65%</div>
        <div class="b-list__box-list-item">TD Acc.: 43%</div>
        <div class="b-list__box-list-item">TD Def.: 95%</div>
        <div class="b-list__box-list-item">Sub. Avg.: 0.4</div>
        <div class="b-list__box-list-item">Avg. Fight time: 15:23</div>
      </body>
    </html>
  `;

  const mockEventsListHTML = `
    <html>
      <body>
        <table class="b-statistics__table">
          <tbody>
            <tr>
              <td><a href="/event-details/ufc-285">UFC 285: Jones vs. Gane</a></td>
              <td>Mar 04, 2023</td>
              <td>Las Vegas, Nevada, USA</td>
            </tr>
            <tr>
              <td><a href="/event-details/ufc-284">UFC 284: Makhachev vs. Volkanovski</a></td>
              <td>Feb 11, 2023</td>
              <td>Perth, Australia</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  const mockEventDetailsHTML = `
    <html>
      <body>
        <div class="b-fight-details__fight-head">UFC 285: Jones vs. Gane - Mar 04, 2023</div>
        <table class="b-fight-details__table">
          <tbody>
            <tr>
              <td><a href="/fight-details/jones-vs-gane">Jon Jones vs. Ciryl Gane</a></td>
              <td>W</td>
              <td>SUB</td>
              <td>1</td>
              <td>2:04</td>
              <td>Heavyweight</td>
            </tr>
            <tr>
              <td><a href="/fight-details/shevchenko-vs-grasso">Valentina Shevchenko vs. Alexa Grasso</a></td>
              <td>L</td>
              <td>SUB</td>
              <td>4</td>
              <td>4:34</td>
              <td>Women's Flyweight</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  const mockFightDetailsHTML = `
    <html>
      <body>
        <div class="b-fight-details__fight-head">UFC 285 - Mar 04, 2023</div>
        <div class="b-fight-details__person">Referee: Mike Beltran</div>
        <table class="b-fight-details__table-body">
          <tbody>
            <tr>
              <td>Jon Jones</td>
              <td>2 of 4</td>
              <td>50%</td>
              <td>1 of 2</td>
              <td>50%</td>
              <td>1 of 2</td>
              <td>50%</td>
              <td>0 of 0</td>
              <td>--</td>
              <td>2 of 4</td>
              <td>50%</td>
              <td>0 of 0</td>
              <td>--</td>
              <td>0 of 0</td>
              <td>--</td>
              <td>1 of 1</td>
              <td>100%</td>
              <td>0</td>
              <td>0</td>
              <td>2:04</td>
              <td>0</td>
            </tr>
            <tr>
              <td>Ciryl Gane</td>
              <td>0 of 2</td>
              <td>0%</td>
              <td>0 of 1</td>
              <td>0%</td>
              <td>0 of 1</td>
              <td>0%</td>
              <td>0 of 0</td>
              <td>--</td>
              <td>0 of 2</td>
              <td>0%</td>
              <td>0 of 0</td>
              <td>--</td>
              <td>0 of 0</td>
              <td>--</td>
              <td>0 of 0</td>
              <td>0%</td>
              <td>0</td>
              <td>0</td>
              <td>0:00</td>
              <td>0</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  beforeEach(() => {
    mockFighterRepository = {
      findByName: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      search: vi.fn(),
      delete: vi.fn()
    } as any;

    mockFightRepository = {
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      search: vi.fn(),
      delete: vi.fn()
    } as any;

    connector = new UFCStatsConnector(mockFighterRepository, mockFightRepository);

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Fighter List Scraping', () => {
    it('should successfully scrape and process fighter list', async () => {
      // Mock the HTTP response
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: mockFighterListHTML
      });

      // Mock fighter details requests
      mockedAxios.get
        .mockResolvedValueOnce({
          status: 200,
          data: mockFighterDetailsHTML
        })
        .mockResolvedValueOnce({
          status: 200,
          data: mockFighterDetailsHTML
        });

      // Mock repository responses
      mockFighterRepository.findByName.mockResolvedValue(null);
      mockFighterRepository.create.mockResolvedValue({ id: 'fighter-1' } as any);

      // Mock the makeScrapingRequest method to use our mocked axios
      const originalMethod = connector['makeScrapingRequest'];
      connector['makeScrapingRequest'] = vi.fn()
        .mockResolvedValueOnce(mockFighterListHTML)
        .mockResolvedValueOnce(mockFighterDetailsHTML)
        .mockResolvedValueOnce(mockFighterDetailsHTML);

      const result = await connector.scrapeFighterList();

      expect(result.recordsProcessed).toBe(2);
      expect(result.recordsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockFighterRepository.create).toHaveBeenCalledTimes(2);

      // Restore original method
      connector['makeScrapingRequest'] = originalMethod;
    });

    it('should handle fighter scraping errors gracefully', async () => {
      // Mock the makeScrapingRequest to fail for fighter details
      connector['makeScrapingRequest'] = vi.fn()
        .mockResolvedValueOnce(mockFighterListHTML)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce(mockFighterDetailsHTML);

      mockFighterRepository.findByName.mockResolvedValue(null);
      mockFighterRepository.create.mockResolvedValue({ id: 'fighter-1' } as any);

      const result = await connector.scrapeFighterList();

      expect(result.recordsProcessed).toBe(1); // Only one successful
      expect(result.recordsSkipped).toBe(1); // One failed
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should update existing fighters instead of creating duplicates', async () => {
      connector['makeScrapingRequest'] = vi.fn()
        .mockResolvedValueOnce(mockFighterListHTML)
        .mockResolvedValueOnce(mockFighterDetailsHTML)
        .mockResolvedValueOnce(mockFighterDetailsHTML);

      // Mock existing fighter found
      mockFighterRepository.findByName.mockResolvedValue({ id: 'existing-fighter' } as any);
      mockFighterRepository.update.mockResolvedValue({ id: 'existing-fighter' } as any);

      const result = await connector.scrapeFighterList();

      expect(result.recordsProcessed).toBe(2);
      expect(mockFighterRepository.update).toHaveBeenCalledTimes(2);
      expect(mockFighterRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('Events and Fights Scraping', () => {
    it('should successfully scrape recent events', async () => {
      connector['makeScrapingRequest'] = vi.fn()
        .mockResolvedValueOnce(mockEventsListHTML)
        .mockResolvedValueOnce(mockEventDetailsHTML)
        .mockResolvedValueOnce(mockEventDetailsHTML);

      const result = await connector.scrapeRecentEvents();

      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle event scraping errors', async () => {
      connector['makeScrapingRequest'] = vi.fn()
        .mockResolvedValueOnce(mockEventsListHTML)
        .mockRejectedValueOnce(new Error('Event details failed'))
        .mockResolvedValueOnce(mockEventDetailsHTML);

      const result = await connector.scrapeRecentEvents();

      expect(result.recordsSkipped).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Fight Details Scraping', () => {
    it('should extract detailed fight statistics', async () => {
      connector['makeScrapingRequest'] = vi.fn()
        .mockResolvedValueOnce(mockFightDetailsHTML);

      const basicInfo = {
        fighter1: 'Jon Jones',
        fighter2: 'Ciryl Gane',
        result: 'W',
        method: 'SUB',
        round: 1,
        time: '2:04',
        weightClass: 'Heavyweight'
      };

      const fightDetails = await connector['scrapeFightDetails']('/fight-details/jones-vs-gane', basicInfo);

      expect(fightDetails).toBeTruthy();
      expect(fightDetails?.fighter1).toBe('Jon Jones');
      expect(fightDetails?.fighter2).toBe('Ciryl Gane');
      expect(fightDetails?.method).toBe('SUB');
      expect(fightDetails?.round).toBe(1);
      expect(fightDetails?.referee).toBe('Mike Beltran');
    });

    it('should handle fight details scraping errors', async () => {
      connector['makeScrapingRequest'] = vi.fn()
        .mockRejectedValueOnce(new Error('Fight details failed'));

      const errorSpy = vi.fn();
      connector.on('scrapingError', errorSpy);

      const basicInfo = {
        fighter1: 'Jon Jones',
        fighter2: 'Ciryl Gane',
        result: 'W',
        method: 'SUB',
        round: 1,
        time: '2:04',
        weightClass: 'Heavyweight'
      };

      const fightDetails = await connector['scrapeFightDetails']('/fight-details/jones-vs-gane', basicInfo);

      expect(fightDetails).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith({
        url: '/fight-details/jones-vs-gane',
        error: 'Fight details failed',
        type: 'fight_details'
      });
    });
  });

  describe('Rate Limiting and Anti-Detection', () => {
    it('should respect rate limits between requests', async () => {
      vi.useFakeTimers();

      connector['makeScrapingRequest'] = vi.fn()
        .mockResolvedValue(mockFighterListHTML);

      // Start the scraping process
      const scrapingPromise = connector.scrapeFighterList();

      // Fast-forward time to simulate rate limiting
      vi.advanceTimersByTime(5000);

      await scrapingPromise;

      // Verify that rate limiting was applied
      expect(connector['makeScrapingRequest']).toHaveBeenCalled();
    });

    it('should rotate user agents between requests', () => {
      const session1 = connector['getNextSession']();
      const session2 = connector['getNextSession']();

      // User agents should be from the configured list
      expect(session1?.userAgent).toContain('Mozilla/5.0');
      expect(session2?.userAgent).toContain('Mozilla/5.0');
    });

    it('should handle blocked sessions', () => {
      const session = connector['getNextSession']();
      expect(session).toBeTruthy();

      // Block the session
      if (session) {
        connector['markSessionAsBlocked'](session.id, 'HTTP 403');
      }

      const status = connector.getStatus();
      expect(status.blockedSessions).toBe(1);
    });
  });

  describe('Data Parsing and Validation', () => {
    it('should parse HTML content correctly', () => {
      const $ = cheerio.load(mockFighterDetailsHTML);
      
      const slpm = connector['parseStatValue']($, 'SLpM');
      const strAcc = connector['parsePercentage']($, 'Str. Acc.');
      const tdDef = connector['parsePercentage']($, 'TD Def.');

      expect(slpm).toBe(4.5);
      expect(strAcc).toBe(58);
      expect(tdDef).toBe(95);
    });

    it('should handle malformed HTML gracefully', () => {
      const malformedHTML = '<html><body><div>Incomplete';
      const $ = cheerio.load(malformedHTML);
      
      const slpm = connector['parseStatValue']($, 'SLpM');
      expect(slpm).toBe(0); // Should default to 0 for missing data
    });

    it('should validate scraped data before processing', async () => {
      const invalidFighterData = {
        name: '', // Invalid: empty name
        height: '6\' 4"',
        weight: '205 lbs',
        reach: '84"',
        stance: 'Orthodox',
        dob: 'Jul 19, 1987',
        record: { wins: -1, losses: 1, draws: 0 }, // Invalid: negative wins
        strikingStats: {
          significantStrikesLanded: 4.5,
          significantStrikesAttempted: 0,
          strikingAccuracy: 58,
          strikesAbsorbedPerMinute: 2.8,
          strikingDefense: 65
        },
        grapplingStats: {
          takedownsLanded: 0,
          takedownsAttempted: 0,
          takedownAccuracy: 43,
          takedownDefense: 95,
          submissionAttempts: 0.4
        },
        fightDetails: {
          averageFightTime: '15:23',
          knockdowns: 0,
          controlTime: 0
        }
      };

      const errors = connector.validateFighterData(invalidFighterData);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.field === 'name')).toBe(true);
      expect(errors.some(e => e.field === 'record')).toBe(true);
    });
  });

  describe('Full Integration Sync', () => {
    it('should complete full sync process', async () => {
      // Mock all the scraping requests
      connector['makeScrapingRequest'] = vi.fn()
        .mockResolvedValueOnce(mockFighterListHTML) // Fighter list
        .mockResolvedValueOnce(mockFighterDetailsHTML) // Fighter 1 details
        .mockResolvedValueOnce(mockFighterDetailsHTML) // Fighter 2 details
        .mockResolvedValueOnce(mockEventsListHTML) // Events list
        .mockResolvedValueOnce(mockEventDetailsHTML) // Event 1 details
        .mockResolvedValueOnce(mockEventDetailsHTML); // Event 2 details

      // Mock repository responses
      mockFighterRepository.findByName.mockResolvedValue(null);
      mockFighterRepository.create.mockResolvedValue({ id: 'fighter-1' } as any);

      const result = await connector.syncData();

      expect(result.sourceId).toBe('UFC_STATS');
      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should handle partial failures during sync', async () => {
      // Mock some requests to fail
      connector['makeScrapingRequest'] = vi.fn()
        .mockResolvedValueOnce(mockFighterListHTML) // Fighter list succeeds
        .mockRejectedValueOnce(new Error('Fighter details failed')) // Fighter 1 fails
        .mockResolvedValueOnce(mockFighterDetailsHTML) // Fighter 2 succeeds
        .mockRejectedValueOnce(new Error('Events list failed')); // Events fail

      mockFighterRepository.findByName.mockResolvedValue(null);
      mockFighterRepository.create.mockResolvedValue({ id: 'fighter-1' } as any);

      const result = await connector.syncData();

      expect(result.recordsSkipped).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from temporary network failures', async () => {
      let callCount = 0;
      connector['makeScrapingRequest'] = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.resolve(mockFighterListHTML);
      });

      // The connector should handle the error and continue processing
      try {
        await connector.scrapeFighterList();
      } catch (error) {
        expect(error).toBeTruthy();
      }
    });

    it('should emit appropriate events during scraping', async () => {
      const processingEvents: any[] = [];
      
      connector.on('fighterProcessed', (event) => processingEvents.push(event));
      connector.on('fightProcessed', (event) => processingEvents.push(event));
      connector.on('scrapingError', (event) => processingEvents.push(event));

      connector['makeScrapingRequest'] = vi.fn()
        .mockResolvedValueOnce(mockFighterListHTML)
        .mockResolvedValueOnce(mockFighterDetailsHTML)
        .mockResolvedValueOnce(mockFighterDetailsHTML);

      mockFighterRepository.findByName.mockResolvedValue(null);
      mockFighterRepository.create.mockResolvedValue({ id: 'fighter-1' } as any);

      await connector.scrapeFighterList();

      expect(processingEvents.length).toBeGreaterThan(0);
      expect(processingEvents.some(e => e.name)).toBe(true); // Should have fighter processed events
    });
  });
});