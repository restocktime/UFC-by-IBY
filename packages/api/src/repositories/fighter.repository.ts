import { Collection, Db, ObjectId, CreateIndexesOptions } from 'mongodb';
import { Fighter } from '@ufc-platform/shared/types/fighter';
import { WeightClass } from '@ufc-platform/shared/types/core';
import { DatabaseManager } from '../database';

export interface FighterSearchOptions {
  name?: string;
  weightClass?: WeightClass;
  active?: boolean;
  ranked?: boolean;
  limit?: number;
  offset?: number;
}

export interface FighterComparisonResult {
  fighter1: Fighter;
  fighter2: Fighter;
  comparison: {
    physicalAdvantage: 'fighter1' | 'fighter2' | 'even';
    experienceAdvantage: 'fighter1' | 'fighter2' | 'even';
    formAdvantage: 'fighter1' | 'fighter2' | 'even';
    reachAdvantage: number; // difference in inches
    heightAdvantage: number; // difference in inches
    recordComparison: {
      fighter1WinRate: number;
      fighter2WinRate: number;
    };
  };
}

export class FighterRepository {
  private collection: Collection<Fighter>;
  private db: Db;

  constructor() {
    const dbManager = DatabaseManager.getInstance();
    this.db = dbManager.getMongoDB().getDb();
    this.collection = this.db.collection<Fighter>('fighters');
    this.setupIndexes();
  }

  private async setupIndexes(): Promise<void> {
    try {
      const indexes = [
        // Text search index for name and nickname
        {
          key: { name: 'text', nickname: 'text' },
          name: 'fighter_text_search',
        },
        // Weight class index for filtering
        {
          key: { 'rankings.weightClass': 1 },
          name: 'weight_class_index',
        },
        // Ranking index for sorted queries
        {
          key: { 'rankings.rank': 1 },
          name: 'ranking_index',
        },
        // Last updated index for data freshness queries
        {
          key: { lastUpdated: -1 },
          name: 'last_updated_index',
        },
        // Active fighters index (based on recent activity)
        {
          key: { 'trends.activityLevel': 1, 'trends.lastFightDate': -1 },
          name: 'activity_index',
        },
        // Performance metrics index for comparisons
        {
          key: { 
            'calculatedMetrics.strikingAccuracy.value': -1,
            'calculatedMetrics.takedownDefense.value': -1 
          },
          name: 'performance_index',
        },
      ];

      for (const index of indexes) {
        await this.collection.createIndex(index.key, { 
          name: index.name,
          background: true 
        } as CreateIndexesOptions);
      }

      console.log('Fighter repository indexes created successfully');
    } catch (error) {
      console.error('Error creating fighter repository indexes:', error);
    }
  }

  // CRUD Operations

  async create(fighter: Omit<Fighter, 'id'>): Promise<Fighter> {
    try {
      const fighterWithTimestamp = {
        ...fighter,
        lastUpdated: new Date(),
      };

      const result = await this.collection.insertOne(fighterWithTimestamp as Fighter);
      
      const createdFighter = await this.collection.findOne({ _id: result.insertedId });
      if (!createdFighter) {
        throw new Error('Failed to retrieve created fighter');
      }

      return {
        ...createdFighter,
        id: createdFighter._id.toString(),
      };
    } catch (error) {
      console.error('Error creating fighter:', error);
      throw new Error(`Failed to create fighter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findById(id: string): Promise<Fighter | null> {
    try {
      if (!ObjectId.isValid(id)) {
        return null;
      }

      const fighter = await this.collection.findOne({ _id: new ObjectId(id) });
      if (!fighter) {
        return null;
      }

      return {
        ...fighter,
        id: fighter._id.toString(),
      };
    } catch (error) {
      console.error('Error finding fighter by ID:', error);
      throw new Error(`Failed to find fighter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findByName(name: string): Promise<Fighter | null> {
    try {
      const fighter = await this.collection.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') } 
      });
      
      if (!fighter) {
        return null;
      }

      return {
        ...fighter,
        id: fighter._id.toString(),
      };
    } catch (error) {
      console.error('Error finding fighter by name:', error);
      throw new Error(`Failed to find fighter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async update(id: string, updates: Partial<Omit<Fighter, 'id'>>): Promise<Fighter | null> {
    try {
      if (!ObjectId.isValid(id)) {
        return null;
      }

      const updateData = {
        ...updates,
        lastUpdated: new Date(),
      };

      const result = await this.collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
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
      console.error('Error updating fighter:', error);
      throw new Error(`Failed to update fighter: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      console.error('Error deleting fighter:', error);
      throw new Error(`Failed to delete fighter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Search Operations

  async search(options: FighterSearchOptions): Promise<Fighter[]> {
    try {
      const query: any = {};
      
      // Text search
      if (options.name) {
        query.$text = { $search: options.name };
      }

      // Weight class filter
      if (options.weightClass) {
        query['rankings.weightClass'] = options.weightClass;
      }

      // Active fighters filter
      if (options.active !== undefined) {
        if (options.active) {
          query['trends.activityLevel'] = { $in: ['active', 'semi_active'] };
        } else {
          query['trends.activityLevel'] = 'inactive';
        }
      }

      // Ranked fighters filter
      if (options.ranked !== undefined) {
        if (options.ranked) {
          query['rankings.rank'] = { $exists: true, $ne: null };
        } else {
          query['rankings.rank'] = { $exists: false };
        }
      }

      const cursor = this.collection.find(query);

      // Apply sorting
      if (options.name) {
        // Sort by text search score when searching by name
        cursor.sort({ score: { $meta: 'textScore' } });
      } else {
        // Default sort by ranking, then by name
        cursor.sort({ 'rankings.rank': 1, name: 1 });
      }

      // Apply pagination
      if (options.offset) {
        cursor.skip(options.offset);
      }
      if (options.limit) {
        cursor.limit(options.limit);
      }

      const fighters = await cursor.toArray();
      
      return fighters.map(fighter => ({
        ...fighter,
        id: fighter._id.toString(),
      }));
    } catch (error) {
      console.error('Error searching fighters:', error);
      throw new Error(`Failed to search fighters: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findByWeightClass(weightClass: WeightClass, ranked: boolean = false): Promise<Fighter[]> {
    try {
      const query: any = { 'rankings.weightClass': weightClass };
      
      if (ranked) {
        query['rankings.rank'] = { $exists: true, $ne: null };
      }

      const fighters = await this.collection
        .find(query)
        .sort({ 'rankings.rank': 1, name: 1 })
        .toArray();

      return fighters.map(fighter => ({
        ...fighter,
        id: fighter._id.toString(),
      }));
    } catch (error) {
      console.error('Error finding fighters by weight class:', error);
      throw new Error(`Failed to find fighters: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Comparison Operations

  async compareFighters(fighter1Id: string, fighter2Id: string): Promise<FighterComparisonResult | null> {
    try {
      const [fighter1, fighter2] = await Promise.all([
        this.findById(fighter1Id),
        this.findById(fighter2Id),
      ]);

      if (!fighter1 || !fighter2) {
        return null;
      }

      const comparison = this.calculateComparison(fighter1, fighter2);

      return {
        fighter1,
        fighter2,
        comparison,
      };
    } catch (error) {
      console.error('Error comparing fighters:', error);
      throw new Error(`Failed to compare fighters: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private calculateComparison(fighter1: Fighter, fighter2: Fighter) {
    // Physical advantage calculation
    const reachAdvantage = fighter1.physicalStats.reach - fighter2.physicalStats.reach;
    const heightAdvantage = fighter1.physicalStats.height - fighter2.physicalStats.height;
    
    let physicalAdvantage: 'fighter1' | 'fighter2' | 'even' = 'even';
    const physicalScore1 = fighter1.physicalStats.reach + fighter1.physicalStats.height;
    const physicalScore2 = fighter2.physicalStats.reach + fighter2.physicalStats.height;
    
    if (Math.abs(physicalScore1 - physicalScore2) > 3) {
      physicalAdvantage = physicalScore1 > physicalScore2 ? 'fighter1' : 'fighter2';
    }

    // Experience advantage calculation
    const totalFights1 = fighter1.record.wins + fighter1.record.losses + fighter1.record.draws;
    const totalFights2 = fighter2.record.wins + fighter2.record.losses + fighter2.record.draws;
    
    let experienceAdvantage: 'fighter1' | 'fighter2' | 'even' = 'even';
    if (Math.abs(totalFights1 - totalFights2) > 3) {
      experienceAdvantage = totalFights1 > totalFights2 ? 'fighter1' : 'fighter2';
    }

    // Form advantage calculation
    const form1 = fighter1.calculatedMetrics.recentForm.reduce((sum, form) => 
      sum + form.performance, 0) / fighter1.calculatedMetrics.recentForm.length || 0;
    const form2 = fighter2.calculatedMetrics.recentForm.reduce((sum, form) => 
      sum + form.performance, 0) / fighter2.calculatedMetrics.recentForm.length || 0;
    
    let formAdvantage: 'fighter1' | 'fighter2' | 'even' = 'even';
    if (Math.abs(form1 - form2) > 10) {
      formAdvantage = form1 > form2 ? 'fighter1' : 'fighter2';
    }

    // Record comparison
    const fighter1WinRate = totalFights1 > 0 ? (fighter1.record.wins / totalFights1) * 100 : 0;
    const fighter2WinRate = totalFights2 > 0 ? (fighter2.record.wins / totalFights2) * 100 : 0;

    return {
      physicalAdvantage,
      experienceAdvantage,
      formAdvantage,
      reachAdvantage,
      heightAdvantage,
      recordComparison: {
        fighter1WinRate,
        fighter2WinRate,
      },
    };
  }

  // Utility Operations

  async getTopRankedByWeightClass(weightClass: WeightClass, limit: number = 15): Promise<Fighter[]> {
    try {
      const fighters = await this.collection
        .find({ 
          'rankings.weightClass': weightClass,
          'rankings.rank': { $exists: true, $ne: null, $lte: limit }
        })
        .sort({ 'rankings.rank': 1 })
        .limit(limit)
        .toArray();

      return fighters.map(fighter => ({
        ...fighter,
        id: fighter._id.toString(),
      }));
    } catch (error) {
      console.error('Error getting top ranked fighters:', error);
      throw new Error(`Failed to get top ranked fighters: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getActiveFighters(limit?: number): Promise<Fighter[]> {
    try {
      const query = {
        'trends.activityLevel': { $in: ['active', 'semi_active'] },
        'trends.lastFightDate': { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } // Last year
      };

      const cursor = this.collection
        .find(query)
        .sort({ 'trends.lastFightDate': -1, 'rankings.rank': 1 });

      if (limit) {
        cursor.limit(limit);
      }

      const fighters = await cursor.toArray();

      return fighters.map(fighter => ({
        ...fighter,
        id: fighter._id.toString(),
      }));
    } catch (error) {
      console.error('Error getting active fighters:', error);
      throw new Error(`Failed to get active fighters: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async count(options?: Partial<FighterSearchOptions>): Promise<number> {
    try {
      const query: any = {};
      
      if (options?.weightClass) {
        query['rankings.weightClass'] = options.weightClass;
      }
      
      if (options?.active !== undefined) {
        if (options.active) {
          query['trends.activityLevel'] = { $in: ['active', 'semi_active'] };
        } else {
          query['trends.activityLevel'] = 'inactive';
        }
      }

      return await this.collection.countDocuments(query);
    } catch (error) {
      console.error('Error counting fighters:', error);
      throw new Error(`Failed to count fighters: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}