/**
 * Event-related interfaces and types
 */

export interface Venue {
  name: string;
  city: string;
  state?: string;
  country: string;
  altitude?: number; // feet above sea level
}

export interface Event {
  id: string;
  name: string;
  date: Date;
  venue: Venue;
  commission: string;
  fights: string[]; // Fight IDs
}