import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { FighterRepository } from '../fighter.repository';
import { Fighter } from '@ufc-platform/shared/types/fighter';
import { WeightClass, FightStance } from '@ufc-platform/shared/types/core';
import { DatabaseManager } from '../../database';

// Mock the database manager
vi.mock('../../database');

describe('FighterRepository', () => {
  let fighterRepository: FighterRepository;
  let mockCollection: any;
  let mockDb: any;
  let mockDbManager: any;

  const mockFighter: Omit<Fighter, 'id'> = {
    name: 'Jon Jones',
    nickname: 'Bones',
    physicalStats: {
      height: 76,
      weight: 205,
      reach: 84.5,
      legReach: 44,
      stance: FightStance.ORTHODOX,
    },
    record: {
      wins: 27,
      losses: 1,
      draws: 0,
      noContests: 1,
    },
    rankings: {
      weightClass: WeightClass.LIGHT_HEAVYWEIGHT,
      rank: 1,
      p4pRank: 1,
    },
    camp: {
      name: 'Jackson Wink MMA',
      location: 'Albuquerque, NM',
      headCoach: 'Greg Jackson',
    },
    socialMedia: {
      instagram: '@jonnybones',
      twitter: '@JonnyBones',
    },
    calculatedMetrics: {
      strikingAccuracy: { value: 58.2, period: 5, trend: 'stable' },
      takedownDefense: { value: 95.0, period: 5, trend: 'increasing' },
      fightFrequency: 1.2,
      winStreak: 1,
      recentForm: [
        {
          fightId: 'fight1',
          date: new Date('2023-03-04'),
          result: 'win',
          performance: 85,
        },
      ],
    },
    trends: {
      performanceTrend: 'stable',
      activityLevel: 'active',
      injuryHistory: [],
      lastFightDate: new Date('2023-03-04'),
    },
    lastUpdated: new Date(),
  };

  beforeEach(() => {
    // Mock collection methods
    mockCollection = {
      insertOne: vi.fn(),
      findOne: vi.fn(),
      find: vi.fn(),
      findOneAndUpdate: vi.fn(),
      deleteOne: vi.fn(),
      countDocuments: vi.fn(),
      createIndex: vi.fn().mockResolvedValue({}),
    };

    // Mock cursor methods
    const mockCursor = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn(),
    };

    mockCollection.find.mockReturnValue(mockCursor);

    // Mock database
    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    // Mock database manager
    mockDbManager = {
      getMongoDB: vi.fn().mockReturnValue({
        getDb: vi.fn().mockReturnValue(mockDb),
      }),
    };

    (DatabaseManager.getInstance as any).mockReturnValue(mockDbManager);

    fighterRepository = new FighterRepository();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new fighter successfully', async () => {
      const mockObjectId = new ObjectId();
      const mockInsertResult = { insertedId: mockObjectId };
      const mockCreatedFighter = { ...mockFighter, _id: mockObjectId };

      mockCollection.insertOne.mockResolvedValue(mockInsertResult);
      mockCollection.findOne.mockResolvedValue(mockCreatedFighter);

      const result = await fighterRepository.create(mockFighter);

      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockFighter,
          lastUpdated: expect.any(Date),
        })
      );
      expect(result).toEqual({
        ...mockCreatedFighter,
        id: mockObjectId.toString(),
      });
    });

    it('should throw error if creation fails', async () => {
      mockCollection.insertOne.mockRejectedValue(new Error('Database error'));

      await expect(fighterRepository.create(mockFighter)).rejects.toThrow('Failed to create fighter');
    });

    it('should throw error if created fighter cannot be retrieved', async () => {
      const mockObjectId = new ObjectId();
      mockCollection.insertOne.mockResolvedValue({ insertedId: mockObjectId });
      mockCollection.findOne.mockResolvedValue(null);

      await expect(fighterRepository.create(mockFighter)).rejects.toThrow('Failed to retrieve created fighter');
    });
  });

  describe('findById', () => {
    it('should find fighter by valid ID', async () => {
      const mockObjectId = new ObjectId();
      const mockFoundFighter = { ...mockFighter, _id: mockObjectId };

      mockCollection.findOne.mockResolvedValue(mockFoundFighter);

      const result = await fighterRepository.findById(mockObjectId.toString());

      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: mockObjectId });
      expect(result).toEqual({
        ...mockFoundFighter,
        id: mockObjectId.toString(),
      });
    });

    it('should return null for invalid ID', async () => {
      const result = await fighterRepository.findById('invalid-id');
      expect(result).toBeNull();
    });

    it('should return null if fighter not found', async () => {
      const mockObjectId = new ObjectId();
      mockCollection.findOne.mockResolvedValue(null);

      const result = await fighterRepository.findById(mockObjectId.toString());
      expect(result).toBeNull();
    });

    it('should throw error on database error', async () => {
      const mockObjectId = new ObjectId();
      mockCollection.findOne.mockRejectedValue(new Error('Database error'));

      await expect(fighterRepository.findById(mockObjectId.toString())).rejects.toThrow('Failed to find fighter');
    });
  });

  describe('findByName', () => {
    it('should find fighter by name (case insensitive)', async () => {
      const mockObjectId = new ObjectId();
      const mockFoundFighter = { ...mockFighter, _id: mockObjectId };

      mockCollection.findOne.mockResolvedValue(mockFoundFighter);

      const result = await fighterRepository.findByName('jon jones');

      expect(mockCollection.findOne).toHaveBeenCalledWith({
        name: { $regex: new RegExp('^jon jones$', 'i') }
      });
      expect(result).toEqual({
        ...mockFoundFighter,
        id: mockObjectId.toString(),
      });
    });

    it('should return null if fighter not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await fighterRepository.findByName('Unknown Fighter');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update fighter successfully', async () => {
      const mockObjectId = new ObjectId();
      const updates = { nickname: 'Bones Jones' };
      const mockUpdatedFighter = { ...mockFighter, ...updates, _id: mockObjectId };

      mockCollection.findOneAndUpdate.mockResolvedValue(mockUpdatedFighter);

      const result = await fighterRepository.update(mockObjectId.toString(), updates);

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockObjectId },
        { $set: { ...updates, lastUpdated: expect.any(Date) } },
        { returnDocument: 'after' }
      );
      expect(result).toEqual({
        ...mockUpdatedFighter,
        id: mockObjectId.toString(),
      });
    });

    it('should return null for invalid ID', async () => {
      const result = await fighterRepository.update('invalid-id', { nickname: 'Test' });
      expect(result).toBeNull();
    });

    it('should return null if fighter not found', async () => {
      const mockObjectId = new ObjectId();
      mockCollection.findOneAndUpdate.mockResolvedValue(null);

      const result = await fighterRepository.update(mockObjectId.toString(), { nickname: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete fighter successfully', async () => {
      const mockObjectId = new ObjectId();
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await fighterRepository.delete(mockObjectId.toString());

      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: mockObjectId });
      expect(result).toBe(true);
    });

    it('should return false for invalid ID', async () => {
      const result = await fighterRepository.delete('invalid-id');
      expect(result).toBe(false);
    });

    it('should return false if fighter not found', async () => {
      const mockObjectId = new ObjectId();
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await fighterRepository.delete(mockObjectId.toString());
      expect(result).toBe(false);
    });
  });

  describe('search', () => {
    it('should search fighters with text query', async () => {
      const mockObjectId = new ObjectId();
      const mockFighters = [{ ...mockFighter, _id: mockObjectId }];
      const mockCursor = mockCollection.find();
      
      mockCursor.toArray.mockResolvedValue(mockFighters);

      const result = await fighterRepository.search({ name: 'Jon Jones' });

      expect(mockCollection.find).toHaveBeenCalledWith({
        $text: { $search: 'Jon Jones' }
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ score: { $meta: 'textScore' } });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockObjectId.toString());
    });

    it('should search fighters by weight class', async () => {
      const mockObjectId = new ObjectId();
      const mockFighters = [{ ...mockFighter, _id: mockObjectId }];
      const mockCursor = mockCollection.find();
      
      mockCursor.toArray.mockResolvedValue(mockFighters);

      const result = await fighterRepository.search({ 
        weightClass: WeightClass.LIGHT_HEAVYWEIGHT 
      });

      expect(mockCollection.find).toHaveBeenCalledWith({
        'rankings.weightClass': WeightClass.LIGHT_HEAVYWEIGHT
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ 'rankings.rank': 1, name: 1 });
    });

    it('should search active fighters only', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fighterRepository.search({ active: true });

      expect(mockCollection.find).toHaveBeenCalledWith({
        'trends.activityLevel': { $in: ['active', 'semi_active'] }
      });
    });

    it('should search ranked fighters only', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fighterRepository.search({ ranked: true });

      expect(mockCollection.find).toHaveBeenCalledWith({
        'rankings.rank': { $exists: true, $ne: null }
      });
    });

    it('should apply pagination', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fighterRepository.search({ limit: 10, offset: 20 });

      expect(mockCursor.skip).toHaveBeenCalledWith(20);
      expect(mockCursor.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('compareFighters', () => {
    it('should compare two fighters successfully', async () => {
      const fighter1Id = new ObjectId().toString();
      const fighter2Id = new ObjectId().toString();
      
      const fighter2 = {
        ...mockFighter,
        name: 'Daniel Cormier',
        physicalStats: {
          ...mockFighter.physicalStats,
          height: 71,
          reach: 72.5,
        },
        record: {
          wins: 22,
          losses: 3,
          draws: 0,
          noContests: 1,
        },
      };

      // Mock findById calls
      vi.spyOn(fighterRepository, 'findById')
        .mockResolvedValueOnce({ ...mockFighter, id: fighter1Id })
        .mockResolvedValueOnce({ ...fighter2, id: fighter2Id });

      const result = await fighterRepository.compareFighters(fighter1Id, fighter2Id);

      expect(result).toBeDefined();
      expect(result?.fighter1.id).toBe(fighter1Id);
      expect(result?.fighter2.id).toBe(fighter2Id);
      expect(result?.comparison.reachAdvantage).toBe(12); // 84.5 - 72.5
      expect(result?.comparison.heightAdvantage).toBe(5); // 76 - 71
      expect(result?.comparison.physicalAdvantage).toBe('fighter1');
    });

    it('should return null if one fighter not found', async () => {
      const fighter1Id = new ObjectId().toString();
      const fighter2Id = new ObjectId().toString();

      vi.spyOn(fighterRepository, 'findById')
        .mockResolvedValueOnce({ ...mockFighter, id: fighter1Id })
        .mockResolvedValueOnce(null);

      const result = await fighterRepository.compareFighters(fighter1Id, fighter2Id);
      expect(result).toBeNull();
    });
  });

  describe('getTopRankedByWeightClass', () => {
    it('should get top ranked fighters by weight class', async () => {
      const mockObjectId = new ObjectId();
      const mockFighters = [{ ...mockFighter, _id: mockObjectId }];
      const mockCursor = mockCollection.find();
      
      mockCursor.toArray.mockResolvedValue(mockFighters);

      const result = await fighterRepository.getTopRankedByWeightClass(
        WeightClass.LIGHT_HEAVYWEIGHT, 
        10
      );

      expect(mockCollection.find).toHaveBeenCalledWith({
        'rankings.weightClass': WeightClass.LIGHT_HEAVYWEIGHT,
        'rankings.rank': { $exists: true, $ne: null, $lte: 10 }
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ 'rankings.rank': 1 });
      expect(mockCursor.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('count', () => {
    it('should count all fighters', async () => {
      mockCollection.countDocuments.mockResolvedValue(100);

      const result = await fighterRepository.count();

      expect(mockCollection.countDocuments).toHaveBeenCalledWith({});
      expect(result).toBe(100);
    });

    it('should count fighters with filters', async () => {
      mockCollection.countDocuments.mockResolvedValue(25);

      const result = await fighterRepository.count({
        weightClass: WeightClass.LIGHT_HEAVYWEIGHT,
        active: true,
      });

      expect(mockCollection.countDocuments).toHaveBeenCalledWith({
        'rankings.weightClass': WeightClass.LIGHT_HEAVYWEIGHT,
        'trends.activityLevel': { $in: ['active', 'semi_active'] }
      });
      expect(result).toBe(25);
    });
  });
});