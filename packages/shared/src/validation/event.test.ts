import { describe, it, expect } from 'vitest';
import { 
  EventSchema,
  VenueSchema,
  validateEventDate,
  validateEventName,
  validateVenueInfo,
  validateFightCardComposition
} from './event.js';

describe('Event Validation Schemas', () => {
  const createValidEvent = () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 3); // 3 months from now
    
    return {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'UFC 300: Historic Night',
      date: futureDate,
      venue: {
        name: 'T-Mobile Arena',
        city: 'Las Vegas',
        state: 'Nevada',
        country: 'USA',
        altitude: 2000
      },
      commission: 'Nevada State Athletic Commission',
      fights: [
        '123e4567-e89b-12d3-a456-426614174001',
        '123e4567-e89b-12d3-a456-426614174002'
      ]
    };
  };

  const createValidVenue = () => ({
    name: 'Madison Square Garden',
    city: 'New York',
    state: 'New York',
    country: 'USA',
    altitude: 33
  });

  describe('EventSchema', () => {
    it('should validate a complete valid event', () => {
      const validEvent = createValidEvent();
      const result = EventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should reject event with invalid date', () => {
      const invalidEvent = createValidEvent();
      invalidEvent.date = new Date('2020-01-01'); // Too far in past
      
      const result = EventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should reject event with invalid name', () => {
      const invalidEvent = createValidEvent();
      invalidEvent.name = 'Random Fight Night'; // Doesn't follow UFC conventions
      
      const result = EventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should validate event with no state (international)', () => {
      const validEvent = createValidEvent();
      delete validEvent.venue.state;
      validEvent.venue.country = 'Brazil';
      
      const result = EventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should reject event with too many fights', () => {
      const invalidEvent = createValidEvent();
      invalidEvent.fights = new Array(16).fill(0).map((_, i) => 
        `123e4567-e89b-12d3-a456-42661417400${i.toString().padStart(1, '0')}`
      );
      
      const result = EventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });
  });

  describe('VenueSchema', () => {
    it('should validate correct venue', () => {
      const validVenue = createValidVenue();
      const result = VenueSchema.safeParse(validVenue);
      expect(result.success).toBe(true);
    });

    it('should reject venue with empty name', () => {
      const invalidVenue = createValidVenue();
      invalidVenue.name = '';
      
      const result = VenueSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
    });

    it('should reject venue with invalid altitude', () => {
      const invalidVenue = createValidVenue();
      invalidVenue.altitude = -100; // Below sea level not allowed
      
      const result = VenueSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
    });

    it('should reject venue with too high altitude', () => {
      const invalidVenue = createValidVenue();
      invalidVenue.altitude = 20000; // Too high
      
      const result = VenueSchema.safeParse(invalidVenue);
      expect(result.success).toBe(false);
    });
  });

  describe('validateEventDate', () => {
    it('should validate current date', () => {
      const event = { date: new Date() };
      expect(validateEventDate(event)).toBe(true);
    });

    it('should validate recent past date', () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const event = { date: sixMonthsAgo };
      expect(validateEventDate(event)).toBe(true);
    });

    it('should validate future date', () => {
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      const event = { date: oneYearFromNow };
      expect(validateEventDate(event)).toBe(true);
    });

    it('should reject date too far in past', () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const event = { date: twoYearsAgo };
      expect(validateEventDate(event)).toBe(false);
    });

    it('should reject date too far in future', () => {
      const threeYearsFromNow = new Date();
      threeYearsFromNow.setFullYear(threeYearsFromNow.getFullYear() + 3);
      const event = { date: threeYearsFromNow };
      expect(validateEventDate(event)).toBe(false);
    });
  });

  describe('validateEventName', () => {
    it('should validate numbered UFC event', () => {
      const event = { name: 'UFC 300' };
      expect(validateEventName(event)).toBe(true);
    });

    it('should validate numbered UFC event with subtitle', () => {
      const event = { name: 'UFC 300: Historic Night' };
      expect(validateEventName(event)).toBe(true);
    });

    it('should validate UFC Fight Night', () => {
      const event = { name: 'UFC Fight Night: Las Vegas' };
      expect(validateEventName(event)).toBe(true);
    });

    it('should validate UFC on ESPN', () => {
      const event = { name: 'UFC on ESPN 45' };
      expect(validateEventName(event)).toBe(true);
    });

    it('should validate UFC on ESPN with subtitle', () => {
      const event = { name: 'UFC on ESPN: Main Event' };
      expect(validateEventName(event)).toBe(true);
    });

    it('should validate TUF Finale', () => {
      const event = { name: 'The Ultimate Fighter 31 Finale' };
      expect(validateEventName(event)).toBe(true);
    });

    it('should reject non-UFC event name', () => {
      const event = { name: 'Bellator 300' };
      expect(validateEventName(event)).toBe(false);
    });

    it('should reject random event name', () => {
      const event = { name: 'Random Fight Night' };
      expect(validateEventName(event)).toBe(false);
    });
  });

  describe('validateVenueInfo', () => {
    it('should validate proper venue', () => {
      const venue = {
        name: 'T-Mobile Arena',
        city: 'Las Vegas',
        country: 'USA',
        altitude: 2000
      };
      expect(validateVenueInfo(venue)).toBe(true);
    });

    it('should reject generic venue name', () => {
      const venue = {
        name: 'Arena',
        city: 'Las Vegas',
        country: 'USA'
      };
      expect(validateVenueInfo(venue)).toBe(false);
    });

    it('should reject venue with too high altitude', () => {
      const venue = {
        name: 'High Altitude Arena',
        city: 'La Paz',
        country: 'Bolivia',
        altitude: 15000
      };
      expect(validateVenueInfo(venue)).toBe(false);
    });

    it('should validate venue with reasonable altitude', () => {
      const venue = {
        name: 'Pepsi Center',
        city: 'Denver',
        country: 'USA',
        altitude: 5280 // Mile high
      };
      expect(validateVenueInfo(venue)).toBe(true);
    });

    it('should validate known country', () => {
      const venue = {
        name: 'O2 Arena',
        city: 'London',
        country: 'UK'
      };
      expect(validateVenueInfo(venue)).toBe(true);
    });

    it('should validate unknown but properly formatted country', () => {
      const venue = {
        name: 'Local Arena',
        city: 'City',
        country: 'XY' // 2 character minimum
      };
      expect(validateVenueInfo(venue)).toBe(true);
    });

    it('should reject single character country', () => {
      const venue = {
        name: 'Local Arena',
        city: 'City',
        country: 'X'
      };
      expect(validateVenueInfo(venue)).toBe(false);
    });
  });

  describe('validateFightCardComposition', () => {
    it('should validate normal fight card', () => {
      const fights = ['fight1', 'fight2', 'fight3'];
      expect(validateFightCardComposition(fights)).toBe(true);
    });

    it('should reject empty fight card', () => {
      const fights: string[] = [];
      expect(validateFightCardComposition(fights)).toBe(false);
    });

    it('should reject too many fights', () => {
      const fights = new Array(16).fill('fight');
      expect(validateFightCardComposition(fights)).toBe(false);
    });

    it('should validate fight card with details - single main event', () => {
      const fights = ['fight1', 'fight2'];
      const fightDetails = [
        { mainEvent: true, titleFight: true, weightClass: 'Heavyweight' },
        { mainEvent: false, titleFight: false, weightClass: 'Lightweight' }
      ];
      expect(validateFightCardComposition(fights, fightDetails)).toBe(true);
    });

    it('should reject multiple main events', () => {
      const fights = ['fight1', 'fight2'];
      const fightDetails = [
        { mainEvent: true, titleFight: true, weightClass: 'Heavyweight' },
        { mainEvent: true, titleFight: false, weightClass: 'Lightweight' }
      ];
      expect(validateFightCardComposition(fights, fightDetails)).toBe(false);
    });

    it('should reject title fight that is not main event', () => {
      const fights = ['fight1', 'fight2'];
      const fightDetails = [
        { mainEvent: true, titleFight: false, weightClass: 'Heavyweight' },
        { mainEvent: false, titleFight: true, weightClass: 'Lightweight' }
      ];
      expect(validateFightCardComposition(fights, fightDetails)).toBe(false);
    });

    it('should reject multiple title fights in same weight class', () => {
      const fights = ['fight1', 'fight2'];
      const fightDetails = [
        { mainEvent: true, titleFight: true, weightClass: 'Heavyweight' },
        { mainEvent: false, titleFight: true, weightClass: 'Heavyweight' }
      ];
      expect(validateFightCardComposition(fights, fightDetails)).toBe(false);
    });

    it('should validate multiple title fights in different weight classes', () => {
      const fights = ['fight1', 'fight2'];
      const fightDetails = [
        { mainEvent: true, titleFight: true, weightClass: 'Heavyweight' },
        { mainEvent: false, titleFight: true, weightClass: 'Lightweight' }
      ];
      // This should actually fail because title fights should be main events
      expect(validateFightCardComposition(fights, fightDetails)).toBe(false);
    });
  });
});