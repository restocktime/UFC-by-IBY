import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SportsDataIOConnector } from '../connectors/sports-data-io.connector.js';
import { sourceConfigManager } from '../config/source-configs.js';

// Mock the repositories to avoid database dependencies
vi.mock('../../repositories/fighter.repository.js', () => ({
  FighterRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue({ id: 'test-fighter-id' }),
    update: vi.fn().mockResolvedValue({ id: 'test-fighter-id' }),
    findByName: vi.fn().mockResolvedValue(null)
  }))
}));

vi.mock('../../repositories/fight.repository.js', () => ({
  FightRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue({ id: 'test-fight-id' }),
    update: vi.fn().mockResolvedValue({ id: 'test-fight-id' }),
    search: vi.fn().mockResolvedValue([])
  }))
}));

vi.mock('../../repositories/event.repository.js', () => ({
  EventRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue({ id: 'test-event-id' }),
    update: vi.fn().mockResolvedValue({ id: 'test-event-id' }),
    findByName: vi.fn().mockResolvedValue(null),
    addFight: vi.fn().mockResolvedValue({ id: 'test-event-id' })
  }))
}));

describe('SportsDataIOConnector Integration', () => {
  let connector: SportsDataIOConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up test API key
    sourceConfigManager.setApiKey('SPORTS_DATA_IO', 'test-api-key');
    
    connector = new SportsDataIOConnector();
  });

  describe('data validation', () => {
    it('should validate fighter data correctly', () => {
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

    it('should detect missing required fields', () => {
      const invalidFighter = {
        // Missing FighterId - this should trigger validation error
        FirstName: 'Jon',
        LastName: 'Jones',
        Wins: 26,
        Losses: 1,
        Draws: 0,
        NoContests: 0
      };

      const errors = connector.validateFighterData(invalidFighter);
      expect(errors.some(e => e.field === 'FighterId')).toBe(true);
    });

    it('should validate event data', () => {
      const validEvent = {
        EventId: 864,
        Name: 'UFC 319',
        DateTime: '2025-01-18T22:00:00',
        Status: 'Scheduled'
      };

      const errors = connector.validateData(validEvent);
      expect(errors).toHaveLength(0);
    });

    it('should validate fight data', () => {
      const validFight = {
        FightId: 1001,
        EventId: 864,
        Fighters: [
          { FighterId: 123, FirstName: 'Jon', LastName: 'Jones' },
          { FighterId: 456, FirstName: 'Stipe', LastName: 'Miocic' }
        ],
        Rounds: 5,
        WeightClass: 'Heavyweight',
        Status: 'Scheduled'
      };

      const errors = connector.validateFightData(validFight);
      expect(errors).toHaveLength(0);
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

      expect(transformed).toMatchObject({
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
          weightClass: 'Light Heavyweight'
        }
      });
    });

    it('should transform event data correctly', () => {
      const sportsDataEvent = {
        EventId: 864,
        Name: 'UFC 319',
        DateTime: '2025-01-18T22:00:00Z',
        Status: 'Scheduled'
      };

      const transformed = connector.transformEventData(sportsDataEvent);

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

    it('should transform fight data correctly', () => {
      const sportsDataFight = {
        FightId: 1001,
        EventId: 864,
        Fighters: [
          { FighterId: 123, FirstName: 'Jon', LastName: 'Jones' },
          { FighterId: 456, FirstName: 'Stipe', LastName: 'Miocic' }
        ],
        Rounds: 5,
        WeightClass: 'Heavyweight',
        Status: 'Scheduled',
        CardSegment: 'Main'
      };

      const transformed = connector.transformFightData(sportsDataFight, 'test-event-id');

      expect(transformed).toMatchObject({
        eventId: 'test-event-id',
        fighter1Id: 'sportsdata_123',
        fighter2Id: 'sportsdata_456',
        weightClass: 'Heavyweight',
        titleFight: true,
        mainEvent: true,
        scheduledRounds: 5,
        status: 'scheduled'
      });
    });
  });

  describe('weight class mapping', () => {
    it('should map weight classes correctly', () => {
      const testCases = [
        { input: 'Heavyweight', expected: 'Heavyweight' },
        { input: 'Light Heavyweight', expected: 'Light Heavyweight' },
        { input: 'Middleweight', expected: 'Middleweight' },
        { input: "Women's Bantamweight", expected: "Women's Bantamweight" },
        { input: 'Unknown Class', expected: 'Lightweight' } // Default fallback
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
        expect(transformed.rankings.weightClass).toBe(expected);
      });
    });
  });

  describe('status mapping', () => {
    it('should map fight status correctly', () => {
      const testCases = [
        { input: 'Scheduled', expected: 'scheduled' },
        { input: 'InProgress', expected: 'in_progress' },
        { input: 'Final', expected: 'completed' },
        { input: 'Cancelled', expected: 'cancelled' }
      ];

      testCases.forEach(({ input, expected }) => {
        const fight = {
          FightId: 1001,
          EventId: 864,
          Fighters: [
            { FighterId: 123, FirstName: 'Fighter', LastName: 'One' },
            { FighterId: 456, FirstName: 'Fighter', LastName: 'Two' }
          ],
          Status: input,
          WeightClass: 'Lightweight',
          Rounds: 3
        };

        const transformed = connector.transformFightData(fight);
        expect(transformed.status).toBe(expected);
      });
    });
  });

  describe('method mapping', () => {
    it('should map fight methods correctly', () => {
      const testCases = [
        { input: 'KO', expected: 'KO/TKO' },
        { input: 'TKO', expected: 'KO/TKO' },
        { input: 'Submission', expected: 'Submission' },
        { input: 'Decision', expected: 'Decision' },
        { input: 'UD', expected: 'Decision' },
        { input: 'DQ', expected: 'DQ' },
        { input: undefined, expected: 'Decision' } // Default
      ];

      testCases.forEach(({ input, expected }) => {
        const fight = {
          FightId: 1001,
          EventId: 864,
          Fighters: [
            { FighterId: 123, FirstName: 'Fighter', LastName: 'One' },
            { FighterId: 456, FirstName: 'Fighter', LastName: 'Two' }
          ],
          Status: 'Final',
          WeightClass: 'Lightweight',
          Rounds: 3,
          WinnerId: 123,
          ResultType: input,
          ResultRound: 1,
          ResultClock: '4:32'
        };

        const transformed = connector.transformFightData(fight);
        expect(transformed.result?.method).toBe(expected);
      });
    });
  });
});