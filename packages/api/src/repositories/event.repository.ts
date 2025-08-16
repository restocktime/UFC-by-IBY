import { Collection, Db, ObjectId, CreateIndexesOptions } from 'mongodb';
import { Event } from '@ufc-platform/shared/types/event';
import { DatabaseManager } from '../database';

export interface EventSearchOptions {
  name?: string;
  city?: string;
  country?: string;
  commission?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface EventWithFightCount extends Event {
  fightCount: number;
  titleFightCount: number;
  mainEventCount: number;
}

export class EventRepository {
  private collection: Collection<Event>;
  private db: Db;

  constructor() {
    const dbManager = DatabaseManager.getInstance();
    this.db = dbManager.getMongoDB().getDb();
    this.collection = this.db.collection<Event>('events');
    this.setupIndexes();
  }

  private async setupIndexes(): Promise<void> {
    try {
      const indexes = [
        // Text search index for event name
        {
          key: { name: 'text' },
          name: 'event_name_text_search',
        },
        // Date index for chronological queries
        {
          key: { date: -1 },
          name: 'event_date_index',
        },
        // Venue indexes for location-based queries
        {
          key: { 'venue.city': 1 },
          name: 'venue_city_index',
        },
        {
          key: { 'venue.country': 1 },
          name: 'venue_country_index',
        },
        // Commission index
        {
          key: { commission: 1 },
          name: 'commission_index',
        },
        // Compound index for upcoming events
        {
          key: { date: 1, name: 1 },
          name: 'upcoming_events_index',
        },
        // Compound index for venue queries
        {
          key: { 'venue.country': 1, 'venue.city': 1, date: -1 },
          name: 'venue_compound_index',
        },
      ];

      for (const index of indexes) {
        await this.collection.createIndex(index.key, { 
          name: index.name,
          background: true 
        } as CreateIndexesOptions);
      }

      console.log('Event repository indexes created successfully');
    } catch (error) {
      console.error('Error creating event repository indexes:', error);
    }
  }

  // CRUD Operations

  async create(event: Omit<Event, 'id'>): Promise<Event> {
    try {
      const result = await this.collection.insertOne(event as Event);
      
      const createdEvent = await this.collection.findOne({ _id: result.insertedId });
      if (!createdEvent) {
        throw new Error('Failed to retrieve created event');
      }

      return {
        ...createdEvent,
        id: createdEvent._id.toString(),
      };
    } catch (error) {
      console.error('Error creating event:', error);
      throw new Error(`Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findById(id: string): Promise<Event | null> {
    try {
      if (!ObjectId.isValid(id)) {
        return null;
      }

      const event = await this.collection.findOne({ _id: new ObjectId(id) });
      if (!event) {
        return null;
      }

      return {
        ...event,
        id: event._id.toString(),
      };
    } catch (error) {
      console.error('Error finding event by ID:', error);
      throw new Error(`Failed to find event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findByName(name: string): Promise<Event | null> {
    try {
      const event = await this.collection.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') } 
      });
      
      if (!event) {
        return null;
      }

      return {
        ...event,
        id: event._id.toString(),
      };
    } catch (error) {
      console.error('Error finding event by name:', error);
      throw new Error(`Failed to find event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async update(id: string, updates: Partial<Omit<Event, 'id'>>): Promise<Event | null> {
    try {
      if (!ObjectId.isValid(id)) {
        return null;
      }

      const result = await this.collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updates },
        { returnDocument: 'after' }
      );

      if (!result) {
        return null;
      }

      return {
        ...result,
        id: result._id.toString(),
      };
    } catch (error) {
      console.error('Error updating event:', error);
      throw new Error(`Failed to update event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      if (!ObjectId.isValid(id)) {
        return false;
      }

      const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Error deleting event:', error);
      throw new Error(`Failed to delete event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Event Management Operations

  async addFight(eventId: string, fightId: string): Promise<Event | null> {
    try {
      if (!ObjectId.isValid(eventId)) {
        return null;
      }

      const result = await this.collection.findOneAndUpdate(
        { _id: new ObjectId(eventId) },
        { $addToSet: { fights: fightId } },
        { returnDocument: 'after' }
      );

      if (!result) {
        return null;
      }

      return {
        ...result,
        id: result._id.toString(),
      };
    } catch (error) {
      console.error('Error adding fight to event:', error);
      throw new Error(`Failed to add fight to event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async removeFight(eventId: string, fightId: string): Promise<Event | null> {
    try {
      if (!ObjectId.isValid(eventId)) {
        return null;
      }

      const result = await this.collection.findOneAndUpdate(
        { _id: new ObjectId(eventId) },
        { $pull: { fights: fightId } },
        { returnDocument: 'after' }
      );

      if (!result) {
        return null;
      }

      return {
        ...result,
        id: result._id.toString(),
      };
    } catch (error) {
      console.error('Error removing fight from event:', error);
      throw new Error(`Failed to remove fight from event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Query Operations

  async search(options: EventSearchOptions): Promise<Event[]> {
    try {
      const query: any = {};
      
      // Text search
      if (options.name) {
        query.$text = { $search: options.name };
      }

      // Location filters
      if (options.city) {
        query['venue.city'] = { $regex: new RegExp(options.city, 'i') };
      }

      if (options.country) {
        query['venue.country'] = { $regex: new RegExp(options.country, 'i') };
      }

      // Commission filter
      if (options.commission) {
        query.commission = { $regex: new RegExp(options.commission, 'i') };
      }

      // Date range filter
      if (options.dateFrom || options.dateTo) {
        query.date = {};
        if (options.dateFrom) {
          query.date.$gte = options.dateFrom;
        }
        if (options.dateTo) {
          query.date.$lte = options.dateTo;
        }
      }

      const cursor = this.collection.find(query);

      // Apply sorting
      if (options.name) {
        // Sort by text search score when searching by name
        cursor.sort({ score: { $meta: 'textScore' } });
      } else {
        // Default sort by date (most recent first)
        cursor.sort({ date: -1 });
      }

      // Apply pagination
      if (options.offset) {
        cursor.skip(options.offset);
      }
      if (options.limit) {
        cursor.limit(options.limit);
      }

      const events = await cursor.toArray();
      
      return events.map(event => ({
        ...event,
        id: event._id.toString(),
      }));
    } catch (error) {
      console.error('Error searching events:', error);
      throw new Error(`Failed to search events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUpcomingEvents(limit?: number, daysAhead?: number): Promise<Event[]> {
    try {
      const now = new Date();
      const query: any = { date: { $gte: now } };

      if (daysAhead) {
        const futureDate = new Date(now.getTime() + (daysAhead * 24 * 60 * 60 * 1000));
        query.date.$lte = futureDate;
      }

      const cursor = this.collection
        .find(query)
        .sort({ date: 1 }); // Earliest first

      if (limit) {
        cursor.limit(limit);
      }

      const events = await cursor.toArray();

      return events.map(event => ({
        ...event,
        id: event._id.toString(),
      }));
    } catch (error) {
      console.error('Error getting upcoming events:', error);
      throw new Error(`Failed to get upcoming events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPastEvents(limit?: number, daysBack?: number): Promise<Event[]> {
    try {
      const now = new Date();
      const query: any = { date: { $lt: now } };

      if (daysBack) {
        const pastDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        query.date.$gte = pastDate;
      }

      const cursor = this.collection
        .find(query)
        .sort({ date: -1 }); // Most recent first

      if (limit) {
        cursor.limit(limit);
      }

      const events = await cursor.toArray();

      return events.map(event => ({
        ...event,
        id: event._id.toString(),
      }));
    } catch (error) {
      console.error('Error getting past events:', error);
      throw new Error(`Failed to get past events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getEventsByVenue(city: string, country: string, limit?: number): Promise<Event[]> {
    try {
      const query = {
        'venue.city': { $regex: new RegExp(city, 'i') },
        'venue.country': { $regex: new RegExp(country, 'i') }
      };

      const cursor = this.collection
        .find(query)
        .sort({ date: -1 });

      if (limit) {
        cursor.limit(limit);
      }

      const events = await cursor.toArray();

      return events.map(event => ({
        ...event,
        id: event._id.toString(),
      }));
    } catch (error) {
      console.error('Error getting events by venue:', error);
      throw new Error(`Failed to get events by venue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getEventsByDateRange(startDate: Date, endDate: Date): Promise<Event[]> {
    try {
      const events = await this.collection
        .find({
          date: {
            $gte: startDate,
            $lte: endDate
          }
        })
        .sort({ date: 1 })
        .toArray();

      return events.map(event => ({
        ...event,
        id: event._id.toString(),
      }));
    } catch (error) {
      console.error('Error getting events by date range:', error);
      throw new Error(`Failed to get events by date range: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Aggregation Operations

  async getEventsWithFightCounts(options: EventSearchOptions = {}): Promise<EventWithFightCount[]> {
    try {
      const matchStage: any = {};
      
      if (options.dateFrom || options.dateTo) {
        matchStage.date = {};
        if (options.dateFrom) {
          matchStage.date.$gte = options.dateFrom;
        }
        if (options.dateTo) {
          matchStage.date.$lte = options.dateTo;
        }
      }

      const pipeline = [
        ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
        {
          $lookup: {
            from: 'fights',
            localField: 'fights',
            foreignField: '_id',
            as: 'fightDetails'
          }
        },
        {
          $addFields: {
            fightCount: { $size: '$fightDetails' },
            titleFightCount: {
              $size: {
                $filter: {
                  input: '$fightDetails',
                  cond: { $eq: ['$$this.titleFight', true] }
                }
              }
            },
            mainEventCount: {
              $size: {
                $filter: {
                  input: '$fightDetails',
                  cond: { $eq: ['$$this.mainEvent', true] }
                }
              }
            }
          }
        },
        {
          $project: {
            fightDetails: 0
          }
        },
        {
          $sort: { date: -1 }
        }
      ];

      if (options.limit) {
        pipeline.push({ $limit: options.limit });
      }

      const events = await this.collection.aggregate(pipeline).toArray();

      return events.map(event => ({
        ...event,
        id: event._id.toString(),
      })) as EventWithFightCount[];
    } catch (error) {
      console.error('Error getting events with fight counts:', error);
      throw new Error(`Failed to get events with fight counts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async count(options?: Partial<EventSearchOptions>): Promise<number> {
    try {
      const query: any = {};
      
      if (options?.city) {
        query['venue.city'] = { $regex: new RegExp(options.city, 'i') };
      }
      
      if (options?.country) {
        query['venue.country'] = { $regex: new RegExp(options.country, 'i') };
      }

      if (options?.dateFrom || options?.dateTo) {
        query.date = {};
        if (options.dateFrom) {
          query.date.$gte = options.dateFrom;
        }
        if (options.dateTo) {
          query.date.$lte = options.dateTo;
        }
      }

      return await this.collection.countDocuments(query);
    } catch (error) {
      console.error('Error counting events:', error);
      throw new Error(`Failed to count events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}