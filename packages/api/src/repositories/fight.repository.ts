import { Collection, Db, ObjectId, CreateIndexesOptions } from 'mongodb';
import { Fight, FightResult } from '@ufc-platform/shared/types/fight';
import { WeightClass, FightStatus } from '@ufc-platform/shared/types/core';
import { DatabaseManager } from '../database';

export interface FightSearchOptions {
  eventId?: string;
  fighterId?: string;
  weightClass?: WeightClass;
  status?: FightStatus;
  titleFight?: boolean;
  mainEvent?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface UpcomingFightsOptions {
  weightClass?: WeightClass;
  titleFightsOnly?: boolean;
  mainEventsOnly?: boolean;
  limit?: number;
  daysAhead?: number;
}

export class FightRepository {
  private collection: Collection<Fight>;
  private db: Db;

  constructor() {
    const dbManager = DatabaseManager.getInstance();
    this.db = dbManager.getMongoDB().getDb();
    this.collection = this.db.collection<Fight>('fights');
    this.setupIndexes();
  }

  private async setupIndexes(): Promise<void> {
    try {
      const indexes = [
        // Event ID index for event-based queries
        {
          key: { eventId: 1 },
          name: 'event_id_index',
        },
        // Fighter indexes for fighter-based queries
        {
          key: { fighter1Id: 1 },
          name: 'fighter1_index',
        },
        {
          key: { fighter2Id: 1 },
          name: 'fighter2_index',
        },
        // Compound index for fighter queries
        {
          key: { fighter1Id: 1, fighter2Id: 1 },
          name: 'fighters_compound_index',
        },
        // Weight class index
        {
          key: { weightClass: 1 },
          name: 'weight_class_index',
        },
        // Status index for filtering by fight status
        {
          key: { status: 1 },
          name: 'status_index',
        },
        // Title fight index
        {
          key: { titleFight: 1, weightClass: 1 },
          name: 'title_fight_index',
        },
        // Main event index
        {
          key: { mainEvent: 1 },
          name: 'main_event_index',
        },
        // Compound index for upcoming fights queries
        {
          key: { status: 1, eventId: 1 },
          name: 'upcoming_fights_index',
        },
      ];

      for (const index of indexes) {
        await this.collection.createIndex(index.key, { 
          name: index.name,
          background: true 
        } as CreateIndexesOptions);
      }

      console.log('Fight repository indexes created successfully');
    } catch (error) {
      console.error('Error creating fight repository indexes:', error);
    }
  }

  // CRUD Operations

  async create(fight: Omit<Fight, 'id'>): Promise<Fight> {
    try {
      const result = await this.collection.insertOne(fight as Fight);
      
      const createdFight = await this.collection.findOne({ _id: result.insertedId });
      if (!createdFight) {
        throw new Error('Failed to retrieve created fight');
      }

      return {
        ...createdFight,
        id: createdFight._id.toString(),
      };
    } catch (error) {
      console.error('Error creating fight:', error);
      throw new Error(`Failed to create fight: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findById(id: string): Promise<Fight | null> {
    try {
      if (!ObjectId.isValid(id)) {
        return null;
      }

      const fight = await this.collection.findOne({ _id: new ObjectId(id) });
      if (!fight) {
        return null;
      }

      return {
        ...fight,
        id: fight._id.toString(),
      };
    } catch (error) {
      console.error('Error finding fight by ID:', error);
      throw new Error(`Failed to find fight: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async update(id: string, updates: Partial<Omit<Fight, 'id'>>): Promise<Fight | null> {
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
      console.error('Error updating fight:', error);
      throw new Error(`Failed to update fight: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      console.error('Error deleting fight:', error);
      throw new Error(`Failed to delete fight: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Fight Scheduling and Result Tracking

  async updateResult(id: string, result: FightResult): Promise<Fight | null> {
    try {
      if (!ObjectId.isValid(id)) {
        return null;
      }

      const updatedFight = await this.collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { 
          $set: { 
            result,
            status: FightStatus.COMPLETED 
          } 
        },
        { returnDocument: 'after' }
      );

      if (!updatedFight) {
        return null;
      }

      return {
        ...updatedFight,
        id: updatedFight._id.toString(),
      };
    } catch (error) {
      console.error('Error updating fight result:', error);
      throw new Error(`Failed to update fight result: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateStatus(id: string, status: FightStatus): Promise<Fight | null> {
    try {
      if (!ObjectId.isValid(id)) {
        return null;
      }

      const updatedFight = await this.collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { status } },
        { returnDocument: 'after' }
      );

      if (!updatedFight) {
        return null;
      }

      return {
        ...updatedFight,
        id: updatedFight._id.toString(),
      };
    } catch (error) {
      console.error('Error updating fight status:', error);
      throw new Error(`Failed to update fight status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Query Operations

  async search(options: FightSearchOptions): Promise<Fight[]> {
    try {
      const query: any = {};
      
      if (options.eventId) {
        query.eventId = options.eventId;
      }

      if (options.fighterId) {
        query.$or = [
          { fighter1Id: options.fighterId },
          { fighter2Id: options.fighterId }
        ];
      }

      if (options.weightClass) {
        query.weightClass = options.weightClass;
      }

      if (options.status) {
        query.status = options.status;
      }

      if (options.titleFight !== undefined) {
        query.titleFight = options.titleFight;
      }

      if (options.mainEvent !== undefined) {
        query.mainEvent = options.mainEvent;
      }

      const cursor = this.collection.find(query);

      // Apply sorting - main events first, then title fights, then by order
      cursor.sort({ mainEvent: -1, titleFight: -1, _id: 1 });

      // Apply pagination
      if (options.offset) {
        cursor.skip(options.offset);
      }
      if (options.limit) {
        cursor.limit(options.limit);
      }

      const fights = await cursor.toArray();
      
      return fights.map(fight => ({
        ...fight,
        id: fight._id.toString(),
      }));
    } catch (error) {
      console.error('Error searching fights:', error);
      throw new Error(`Failed to search fights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findByEventId(eventId: string): Promise<Fight[]> {
    try {
      const fights = await this.collection
        .find({ eventId })
        .sort({ mainEvent: -1, titleFight: -1, _id: 1 })
        .toArray();

      return fights.map(fight => ({
        ...fight,
        id: fight._id.toString(),
      }));
    } catch (error) {
      console.error('Error finding fights by event ID:', error);
      throw new Error(`Failed to find fights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findByFighterId(fighterId: string, limit?: number): Promise<Fight[]> {
    try {
      const query = {
        $or: [
          { fighter1Id: fighterId },
          { fighter2Id: fighterId }
        ]
      };

      const cursor = this.collection
        .find(query)
        .sort({ _id: -1 }); // Most recent first

      if (limit) {
        cursor.limit(limit);
      }

      const fights = await cursor.toArray();

      return fights.map(fight => ({
        ...fight,
        id: fight._id.toString(),
      }));
    } catch (error) {
      console.error('Error finding fights by fighter ID:', error);
      throw new Error(`Failed to find fights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUpcomingFights(options: UpcomingFightsOptions = {}): Promise<Fight[]> {
    try {
      const query: any = {
        status: FightStatus.SCHEDULED
      };

      if (options.weightClass) {
        query.weightClass = options.weightClass;
      }

      if (options.titleFightsOnly) {
        query.titleFight = true;
      }

      if (options.mainEventsOnly) {
        query.mainEvent = true;
      }

      const cursor = this.collection
        .find(query)
        .sort({ eventId: 1, mainEvent: -1, titleFight: -1 });

      if (options.limit) {
        cursor.limit(options.limit);
      }

      const fights = await cursor.toArray();

      return fights.map(fight => ({
        ...fight,
        id: fight._id.toString(),
      }));
    } catch (error) {
      console.error('Error getting upcoming fights:', error);
      throw new Error(`Failed to get upcoming fights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getHistoricalResults(options: FightSearchOptions = {}): Promise<Fight[]> {
    try {
      const query: any = {
        status: FightStatus.COMPLETED,
        result: { $exists: true }
      };

      if (options.weightClass) {
        query.weightClass = options.weightClass;
      }

      if (options.fighterId) {
        query.$or = [
          { fighter1Id: options.fighterId },
          { fighter2Id: options.fighterId }
        ];
      }

      if (options.titleFight !== undefined) {
        query.titleFight = options.titleFight;
      }

      const cursor = this.collection
        .find(query)
        .sort({ _id: -1 }); // Most recent first

      if (options.limit) {
        cursor.limit(options.limit);
      }

      const fights = await cursor.toArray();

      return fights.map(fight => ({
        ...fight,
        id: fight._id.toString(),
      }));
    } catch (error) {
      console.error('Error getting historical results:', error);
      throw new Error(`Failed to get historical results: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getTitleFights(weightClass?: WeightClass, limit?: number): Promise<Fight[]> {
    try {
      const query: any = { titleFight: true };
      
      if (weightClass) {
        query.weightClass = weightClass;
      }

      const cursor = this.collection
        .find(query)
        .sort({ _id: -1 });

      if (limit) {
        cursor.limit(limit);
      }

      const fights = await cursor.toArray();

      return fights.map(fight => ({
        ...fight,
        id: fight._id.toString(),
      }));
    } catch (error) {
      console.error('Error getting title fights:', error);
      throw new Error(`Failed to get title fights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async count(options?: Partial<FightSearchOptions>): Promise<number> {
    try {
      const query: any = {};
      
      if (options?.eventId) {
        query.eventId = options.eventId;
      }
      
      if (options?.status) {
        query.status = options.status;
      }

      if (options?.weightClass) {
        query.weightClass = options.weightClass;
      }

      if (options?.titleFight !== undefined) {
        query.titleFight = options.titleFight;
      }

      return await this.collection.countDocuments(query);
    } catch (error) {
      console.error('Error counting fights:', error);
      throw new Error(`Failed to count fights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}