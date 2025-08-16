import { z } from 'zod';

/**
 * Validation schemas for Event-related types
 */

export const VenueSchema = z.object({
  name: z.string().min(1).max(100),
  city: z.string().min(1).max(50),
  state: z.string().max(50).optional(),
  country: z.string().min(2).max(50),
  altitude: z.number().min(0).max(15000).optional() // feet above sea level
});

export const EventSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  date: z.date(),
  venue: VenueSchema.refine((data) => validateVenueInfo(data), {
    message: "Venue information is invalid"
  }),
  commission: z.string().min(1).max(100),
  fights: z.array(z.string().uuid()).max(15) // Fight IDs
}).refine((data) => validateEventDate(data), {
  message: "Event date must be reasonable"
}).refine((data) => validateEventName(data), {
  message: "Event name must follow UFC naming conventions"
});

/**
 * Validation functions for event constraints
 */

/**
 * Validates event date is reasonable
 */
export function validateEventDate(event: any): boolean {
  const { date } = event;
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const twoYearsFromNow = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
  
  // Event should be within reasonable timeframe (1 year ago to 2 years from now)
  return date >= oneYearAgo && date <= twoYearsFromNow;
}

/**
 * Validates event name follows UFC conventions
 */
export function validateEventName(event: any): boolean {
  const { name } = event;
  
  // UFC events typically follow patterns like:
  // "UFC 300", "UFC 300: Title Fight", "UFC Fight Night: Location"
  const ufcPatterns = [
    /^UFC \d+$/,                           // UFC 300
    /^UFC \d+: .+$/,                       // UFC 300: Title Fight
    /^UFC Fight Night: .+$/,               // UFC Fight Night: Location
    /^UFC on [A-Z]+ \d+$/,                // UFC on ESPN 1
    /^UFC on [A-Z]+: .+$/,                // UFC on ESPN: Event Name
    /^The Ultimate Fighter \d+ Finale$/    // TUF Finale
  ];
  
  return ufcPatterns.some(pattern => pattern.test(name));
}

/**
 * Validates venue information is complete and reasonable
 */
export function validateVenueInfo(venue: any): boolean {
  const { name, city, country, altitude } = venue;
  
  // Venue name should not be generic
  const genericNames = ['arena', 'stadium', 'center', 'venue'];
  if (genericNames.some(generic => name.toLowerCase() === generic)) {
    return false;
  }
  
  // Altitude should be reasonable for populated areas
  if (altitude && altitude > 12000) { // Above 12,000 feet is very high for events
    return false;
  }
  
  // Country should be valid ISO format or common name
  const validCountries = [
    'USA', 'United States', 'Canada', 'Brazil', 'UK', 'United Kingdom',
    'Australia', 'Germany', 'France', 'Japan', 'Mexico', 'Netherlands',
    'Sweden', 'Poland', 'Russia', 'China', 'South Korea', 'UAE'
  ];
  
  if (!validCountries.includes(country)) {
    // Allow other countries but they should be at least 2 characters
    return country.length >= 2;
  }
  
  return true;
}

/**
 * Validates fight card composition
 */
export function validateFightCardComposition(fights: string[], fightDetails?: any[]): boolean {
  // Must have at least 1 fight
  if (fights.length === 0) return false;
  
  // Cannot exceed 15 fights (typical UFC limit)
  if (fights.length > 15) return false;
  
  // If fight details are provided, validate composition
  if (fightDetails) {
    const mainEvents = fightDetails.filter(f => f.mainEvent);
    const titleFights = fightDetails.filter(f => f.titleFight);
    
    // Only one main event per card
    if (mainEvents.length > 1) return false;
    
    // Title fights should typically be main events
    const nonMainEventTitleFights = titleFights.filter(f => !f.mainEvent);
    if (nonMainEventTitleFights.length > 0) return false;
    
    // Check for weight class conflicts in title fights
    const titleFightWeightClasses = titleFights.map(f => f.weightClass);
    const uniqueWeightClasses = new Set(titleFightWeightClasses);
    if (titleFightWeightClasses.length !== uniqueWeightClasses.size) {
      return false; // Multiple title fights in same weight class
    }
  }
  
  return true;
}