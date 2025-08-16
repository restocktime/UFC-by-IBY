import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UFCStatsConnector, UFCStatsFighter, UFCStatsFight } from '../connectors/ufc-stats.connector.js';
import { FighterRepository } from '../../repositories/fighter.repository.js';
import { FightRepository } from '../../repositories/fight.repository.js';
import { ValidationError } from '@ufc-platform/shared';

// Mock the repositories
vi.mock('../../repositories/fighter.repository.js');
vi.mock('../../repositories/fight.repository.js');

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}));

// Mock cheerio
vi.mock('cheerio', () => ({
  load: vi.fn()
}));

describe('UFCStatsConnector', () => {
  let connector: UFCStatsConnector;
  let mockFighterRepository: vi.Mocked<FighterRepository>;
  let mockFightRepository: vi.Mocked<FightRepository>;

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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct configuration', () => {
      const status = connector.getStatus();
      expect(status.sourceId).toBe('UFC_STATS');
    });

    it('should create default repositories when none provided', () => {
      const defaultConnector = new UFCStatsConnector();
      expect(defaultConnector).toBeInstanceOf(UFCStatsConnector);
    });
  });

  describe('Data Validation', () => {
    describe('validateFighterData', () => {
      it('should validate valid fighter data', () => {
        const validFighter: UFCStatsFighter = {
          name: 'Jon Jones',
          nickname: 'Bones',
          height: '6\' 4"',
          weight: '205 lbs',
          reach: '84"',
          stance: 'Orthodox',
          dob: 'Jul 19, 1987',
          record: { wins: 26, losses: 1, draws: 0 },
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

        const errors = connector.validateFighterData(validFighter);
        expect(errors).toHaveLength(0);
      });

      it('should return errors for missing required fields', () => {
        const invalidFighter: UFCStatsFighter = {
          name: '',
          height: '6\' 4"',
          weight: '205 lbs',
          reach: '84"',
          stance: 'Orthodox',
          dob: 'Jul 19, 1987',
          record: { wins: 26, losses: 1, draws: 0 },
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

        const errors = connector.validateFighterData(invalidFighter);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('name');
        expect(errors[0].severity).toBe('error');
      });

      it('should return errors for negative record values', () => {
        const invalidFighter: UFCStatsFighter = {
          name: 'Test Fighter',
          height: '6\' 0"',
          weight: '170 lbs',
          reach: '72"',
          stance: 'Orthodox',
          dob: 'Jan 1, 1990',
          record: { wins: -1, losses: 5, draws: 0 },
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

        const errors = connector.validateFighterData(invalidFighter);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('record');
        expect(errors[0].severity).toBe('error');
      });
    });

    describe('validateFightData', () => {
      it('should validate valid fight data', () => {
        const validFight: UFCStatsFight = {
          event: 'UFC 285',
          date: 'Mar 04, 2023',
          fighter1: 'Jon Jones',
          fighter2: 'Ciryl Gane',
          result: 'W',
          method: 'SUB',
          round: 1,
          time: '2:04',
          weightClass: 'Heavyweight',
          referee: 'Mike Beltran'
        };

        const errors = connector.validateFightData(validFight);
        expect(errors).toHaveLength(0);
      });

      it('should return errors for missing fighter names', () => {
        const invalidFight: UFCStatsFight = {
          event: 'UFC 285',
          date: 'Mar 04, 2023',
          fighter1: '',
          fighter2: 'Ciryl Gane',
          result: 'W',
          method: 'SUB',
          round: 1,
          time: '2:04',
          weightClass: 'Heavyweight',
          referee: 'Mike Beltran'
        };

        const errors = connector.validateFightData(invalidFight);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('fighter1');
        expect(errors[0].severity).toBe('error');
      });

      it('should return warnings for invalid round numbers', () => {
        const invalidFight: UFCStatsFight = {
          event: 'UFC 285',
          date: 'Mar 04, 2023',
          fighter1: 'Jon Jones',
          fighter2: 'Ciryl Gane',
          result: 'W',
          method: 'SUB',
          round: 6, // Invalid round number
          time: '2:04',
          weightClass: 'Heavyweight',
          referee: 'Mike Beltran'
        };

        const errors = connector.validateFightData(invalidFight);
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('round');
        expect(errors[0].severity).toBe('warning');
      });
    });

    describe('validateData', () => {
      it('should route to fighter validation for fighter data', () => {
        const fighterData = { name: 'Test Fighter' };
        const spy = vi.spyOn(connector, 'validateFighterData');
        
        connector.validateData(fighterData);
        
        expect(spy).toHaveBeenCalledWith(fighterData);
      });

      it('should route to fight validation for fight data', () => {
        const fightData = { fighter1: 'Fighter A', fighter2: 'Fighter B' };
        const spy = vi.spyOn(connector, 'validateFightData');
        
        connector.validateData(fightData);
        
        expect(spy).toHaveBeenCalledWith(fightData);
      });

      it('should return error for unknown data type', () => {
        const unknownData = { someField: 'value' };
        
        const errors = connector.validateData(unknownData);
        
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('data');
        expect(errors[0].message).toBe('Unknown data type');
      });
    });
  });

  describe('Data Transformation', () => {
    describe('transformFighterData', () => {
      it('should transform UFC Stats fighter to platform format', () => {
        const ufcStatsFighter: UFCStatsFighter = {
          name: 'Jon Jones',
          nickname: 'Bones',
          height: '6\' 4"',
          weight: '205 lbs',
          reach: '84"',
          stance: 'Orthodox',
          dob: 'Jul 19, 1987',
          record: { wins: 26, losses: 1, draws: 0 },
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

        const transformed = connector.transformFighterData(ufcStatsFighter);

        expect(transformed.name).toBe('Jon Jones');
        expect(transformed.nickname).toBe('Bones');
        expect(transformed.physicalStats.height).toBe(76); // 6'4" = 76 inches
        expect(transformed.physicalStats.weight).toBe(205);
        expect(transformed.physicalStats.reach).toBe(84);
        expect(transformed.physicalStats.stance).toBe('Orthodox');
        expect(transformed.record.wins).toBe(26);
        expect(transformed.record.losses).toBe(1);
        expect(transformed.record.draws).toBe(0);
        expect(transformed.calculatedMetrics.strikingAccuracy.value).toBe(58);
        expect(transformed.calculatedMetrics.takedownDefense.value).toBe(95);
      });

      it('should handle missing optional fields', () => {
        const ufcStatsFighter: UFCStatsFighter = {
          name: 'Test Fighter',
          height: '5\' 10"',
          weight: '155 lbs',
          reach: '70"',
          stance: 'Southpaw',
          dob: 'Jan 1, 1990',
          record: { wins: 10, losses: 2, draws: 1 },
          strikingStats: {
            significantStrikesLanded: 3.2,
            significantStrikesAttempted: 0,
            strikingAccuracy: 45,
            strikesAbsorbedPerMinute: 3.1,
            strikingDefense: 55
          },
          grapplingStats: {
            takedownsLanded: 0,
            takedownsAttempted: 0,
            takedownAccuracy: 35,
            takedownDefense: 75,
            submissionAttempts: 0.2
          },
          fightDetails: {
            averageFightTime: '12:45',
            knockdowns: 0,
            controlTime: 0
          }
        };

        const transformed = connector.transformFighterData(ufcStatsFighter);

        expect(transformed.name).toBe('Test Fighter');
        expect(transformed.nickname).toBeUndefined();
        expect(transformed.physicalStats.height).toBe(70); // 5'10" = 70 inches
        expect(transformed.rankings.weightClass).toBe('Lightweight'); // Inferred from 155 lbs
      });
    });

    describe('transformData', () => {
      it('should route to fighter transformation for fighter data', () => {
        const fighterData = { name: 'Test Fighter' };
        const spy = vi.spyOn(connector, 'transformFighterData');
        
        connector.transformData(fighterData);
        
        expect(spy).toHaveBeenCalledWith(fighterData);
      });

      it('should route to fight transformation for fight data', () => {
        const fightData = { fighter1: 'Fighter A', fighter2: 'Fighter B' };
        const spy = vi.spyOn(connector, 'transformFightData');
        
        connector.transformData(fightData);
        
        expect(spy).toHaveBeenCalledWith(fightData);
      });

      it('should return data unchanged for unknown types', () => {
        const unknownData = { someField: 'value' };
        
        const result = connector.transformData(unknownData);
        
        expect(result).toEqual(unknownData);
      });
    });
  });

  describe('Helper Methods', () => {
    describe('parseHeight', () => {
      it('should parse height strings correctly', () => {
        expect(connector['parseHeight']('6\' 4"')).toBe(76);
        expect(connector['parseHeight']('5\' 10"')).toBe(70);
        expect(connector['parseHeight']('5\' 0"')).toBe(60);
      });

      it('should return 0 for invalid height strings', () => {
        expect(connector['parseHeight']('invalid')).toBe(0);
        expect(connector['parseHeight']('')).toBe(0);
      });
    });

    describe('parseWeight', () => {
      it('should parse weight strings correctly', () => {
        expect(connector['parseWeight']('205 lbs')).toBe(205);
        expect(connector['parseWeight']('155 lbs')).toBe(155);
        expect(connector['parseWeight']('125')).toBe(125);
      });

      it('should return 0 for invalid weight strings', () => {
        expect(connector['parseWeight']('invalid')).toBe(0);
        expect(connector['parseWeight']('')).toBe(0);
      });
    });

    describe('parseReach', () => {
      it('should parse reach strings correctly', () => {
        expect(connector['parseReach']('84"')).toBe(84);
        expect(connector['parseReach']('70"')).toBe(70);
        expect(connector['parseReach']('72')).toBe(72);
      });

      it('should return 0 for invalid reach strings', () => {
        expect(connector['parseReach']('invalid')).toBe(0);
        expect(connector['parseReach']('')).toBe(0);
      });
    });

    describe('mapStance', () => {
      it('should map stance strings correctly', () => {
        expect(connector['mapStance']('Orthodox')).toBe('Orthodox');
        expect(connector['mapStance']('Southpaw')).toBe('Southpaw');
        expect(connector['mapStance']('Switch')).toBe('Switch');
      });

      it('should default to Orthodox for unknown stances', () => {
        expect(connector['mapStance']('Unknown')).toBe('Orthodox');
        expect(connector['mapStance']('')).toBe('Orthodox');
      });
    });

    describe('inferWeightClass', () => {
      it('should infer weight classes correctly', () => {
        expect(connector['inferWeightClass']('125 lbs')).toBe('Flyweight');
        expect(connector['inferWeightClass']('135 lbs')).toBe('Bantamweight');
        expect(connector['inferWeightClass']('145 lbs')).toBe('Featherweight');
        expect(connector['inferWeightClass']('155 lbs')).toBe('Lightweight');
        expect(connector['inferWeightClass']('170 lbs')).toBe('Welterweight');
        expect(connector['inferWeightClass']('185 lbs')).toBe('Middleweight');
        expect(connector['inferWeightClass']('205 lbs')).toBe('Light Heavyweight');
        expect(connector['inferWeightClass']('265 lbs')).toBe('Heavyweight');
      });

      it('should default to Heavyweight for very heavy weights', () => {
        expect(connector['inferWeightClass']('300 lbs')).toBe('Heavyweight');
      });
    });

    describe('parseRecord', () => {
      it('should parse record strings correctly', () => {
        expect(connector['parseRecord']('26-1-0')).toEqual({
          wins: 26,
          losses: 1,
          draws: 0
        });

        expect(connector['parseRecord']('15-3-1')).toEqual({
          wins: 15,
          losses: 3,
          draws: 1
        });
      });

      it('should return zeros for invalid record strings', () => {
        expect(connector['parseRecord']('invalid')).toEqual({
          wins: 0,
          losses: 0,
          draws: 0
        });

        expect(connector['parseRecord']('')).toEqual({
          wins: 0,
          losses: 0,
          draws: 0
        });
      });
    });
  });

  describe('Status and Monitoring', () => {
    it('should provide status information', () => {
      const status = connector.getStatus();
      
      expect(status.sourceId).toBe('UFC_STATS');
      expect(status.totalSessions).toBeGreaterThan(0);
      expect(status.blockedSessions).toBe(0);
      expect(Array.isArray(status.sessions)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle scraping errors gracefully', async () => {
      // Mock a scraping method to throw an error
      const originalMethod = connector['makeScrapingRequest'];
      connector['makeScrapingRequest'] = vi.fn().mockRejectedValue(new Error('Network error'));

      try {
        await connector.scrapeFighterList();
      } catch (error: any) {
        expect(error.message).toContain('Failed to scrape fighter list from UFCStats');
      }

      // Restore original method
      connector['makeScrapingRequest'] = originalMethod;
    });

    it('should emit error events for scraping failures', () => {
      const errorSpy = vi.fn();
      connector.on('scrapingError', errorSpy);

      // This would be called internally when scraping fails
      connector.emit('scrapingError', {
        url: 'http://test.com',
        error: 'Test error',
        type: 'fighter_details'
      });

      expect(errorSpy).toHaveBeenCalledWith({
        url: 'http://test.com',
        error: 'Test error',
        type: 'fighter_details'
      });
    });
  });
});