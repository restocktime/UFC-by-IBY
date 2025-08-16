import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { FightRepository } from '../fight.repository';
import { Fight, FightResult } from '@ufc-platform/shared/types/fight';
import { WeightClass, FightStatus, FightMethod } from '@ufc-platform/shared/types/core';
import { DatabaseManager } from '../../database';

// Mock the database manager
vi.mock('../../database');

describe('FightRepository', () => {
  let fightRepository: FightRepository;
  let mockCollection: any;
  let mockDb: any;
  let mockDbManager: any;

  const mockFight: Omit<Fight, 'id'> = {
    eventId: 'event123',
    fighter1Id: 'fighter1',
    fighter2Id: 'fighter2',
    weightClass: WeightClass.LIGHT_HEAVYWEIGHT,
    titleFight: true,
    mainEvent: true,
    scheduledRounds: 5,
    status: FightStatus.SCHEDULED,
    odds: [],
    predictions: [],
  };

  const mockFightResult: FightResult = {
    winnerId: 'fighter1',
    method: FightMethod.KO_TKO,
    round: 2,
    time: '3:45',
    details: 'Left hook knockout',
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
      aggregate: vi.fn(),
    };

    // Mock cursor methods
    const mockCursor = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn(),
    };

    mockCollection.find.mockReturnValue(mockCursor);
    mockCollection.aggregate.mockReturnValue({ toArray: vi.fn() });

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

    fightRepository = new FightRepository();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new fight successfully', async () => {
      const mockObjectId = new ObjectId();
      const mockInsertResult = { insertedId: mockObjectId };
      const mockCreatedFight = { ...mockFight, _id: mockObjectId };

      mockCollection.insertOne.mockResolvedValue(mockInsertResult);
      mockCollection.findOne.mockResolvedValue(mockCreatedFight);

      const result = await fightRepository.create(mockFight);

      expect(mockCollection.insertOne).toHaveBeenCalledWith(mockFight);
      expect(result).toEqual({
        ...mockCreatedFight,
        id: mockObjectId.toString(),
      });
    });

    it('should throw error if creation fails', async () => {
      mockCollection.insertOne.mockRejectedValue(new Error('Database error'));

      await expect(fightRepository.create(mockFight)).rejects.toThrow('Failed to create fight');
    });
  });

  describe('findById', () => {
    it('should find fight by valid ID', async () => {
      const mockObjectId = new ObjectId();
      const mockFoundFight = { ...mockFight, _id: mockObjectId };

      mockCollection.findOne.mockResolvedValue(mockFoundFight);

      const result = await fightRepository.findById(mockObjectId.toString());

      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: mockObjectId });
      expect(result).toEqual({
        ...mockFoundFight,
        id: mockObjectId.toString(),
      });
    });

    it('should return null for invalid ID', async () => {
      const result = await fightRepository.findById('invalid-id');
      expect(result).toBeNull();
    });

    it('should return null if fight not found', async () => {
      const mockObjectId = new ObjectId();
      mockCollection.findOne.mockResolvedValue(null);

      const result = await fightRepository.findById(mockObjectId.toString());
      expect(result).toBeNull();
    });
  });

  describe('updateResult', () => {
    it('should update fight result successfully', async () => {
      const mockObjectId = new ObjectId();
      const mockUpdatedFight = { 
        ...mockFight, 
        _id: mockObjectId,
        result: mockFightResult,
        status: FightStatus.COMPLETED
      };

      mockCollection.findOneAndUpdate.mockResolvedValue(mockUpdatedFight);

      const result = await fightRepository.updateResult(mockObjectId.toString(), mockFightResult);

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockObjectId },
        { 
          $set: { 
            result: mockFightResult,
            status: FightStatus.COMPLETED 
          } 
        },
        { returnDocument: 'after' }
      );
      expect(result).toEqual({
        ...mockUpdatedFight,
        id: mockObjectId.toString(),
      });
    });

    it('should return null for invalid ID', async () => {
      const result = await fightRepository.updateResult('invalid-id', mockFightResult);
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update fight status successfully', async () => {
      const mockObjectId = new ObjectId();
      const mockUpdatedFight = { 
        ...mockFight, 
        _id: mockObjectId,
        status: FightStatus.IN_PROGRESS
      };

      mockCollection.findOneAndUpdate.mockResolvedValue(mockUpdatedFight);

      const result = await fightRepository.updateStatus(mockObjectId.toString(), FightStatus.IN_PROGRESS);

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockObjectId },
        { $set: { status: FightStatus.IN_PROGRESS } },
        { returnDocument: 'after' }
      );
      expect(result).toEqual({
        ...mockUpdatedFight,
        id: mockObjectId.toString(),
      });
    });
  });

  describe('search', () => {
    it('should search fights by event ID', async () => {
      const mockObjectId = new ObjectId();
      const mockFights = [{ ...mockFight, _id: mockObjectId }];
      const mockCursor = mockCollection.find();
      
      mockCursor.toArray.mockResolvedValue(mockFights);

      const result = await fightRepository.search({ eventId: 'event123' });

      expect(mockCollection.find).toHaveBeenCalledWith({ eventId: 'event123' });
      expect(mockCursor.sort).toHaveBeenCalledWith({ mainEvent: -1, titleFight: -1, _id: 1 });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockObjectId.toString());
    });

    it('should search fights by fighter ID', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fightRepository.search({ fighterId: 'fighter1' });

      expect(mockCollection.find).toHaveBeenCalledWith({
        $or: [
          { fighter1Id: 'fighter1' },
          { fighter2Id: 'fighter1' }
        ]
      });
    });

    it('should search fights by weight class', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fightRepository.search({ weightClass: WeightClass.LIGHT_HEAVYWEIGHT });

      expect(mockCollection.find).toHaveBeenCalledWith({
        weightClass: WeightClass.LIGHT_HEAVYWEIGHT
      });
    });

    it('should search title fights only', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fightRepository.search({ titleFight: true });

      expect(mockCollection.find).toHaveBeenCalledWith({ titleFight: true });
    });

    it('should apply pagination', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fightRepository.search({ limit: 10, offset: 20 });

      expect(mockCursor.skip).toHaveBeenCalledWith(20);
      expect(mockCursor.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('findByEventId', () => {
    it('should find fights by event ID', async () => {
      const mockObjectId = new ObjectId();
      const mockFights = [{ ...mockFight, _id: mockObjectId }];
      const mockCursor = mockCollection.find();
      
      mockCursor.toArray.mockResolvedValue(mockFights);

      const result = await fightRepository.findByEventId('event123');

      expect(mockCollection.find).toHaveBeenCalledWith({ eventId: 'event123' });
      expect(mockCursor.sort).toHaveBeenCalledWith({ mainEvent: -1, titleFight: -1, _id: 1 });
      expect(result).toHaveLength(1);
    });
  });

  describe('findByFighterId', () => {
    it('should find fights by fighter ID', async () => {
      const mockObjectId = new ObjectId();
      const mockFights = [{ ...mockFight, _id: mockObjectId }];
      const mockCursor = mockCollection.find();
      
      mockCursor.toArray.mockResolvedValue(mockFights);

      const result = await fightRepository.findByFighterId('fighter1', 5);

      expect(mockCollection.find).toHaveBeenCalledWith({
        $or: [
          { fighter1Id: 'fighter1' },
          { fighter2Id: 'fighter1' }
        ]
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ _id: -1 });
      expect(mockCursor.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('getUpcomingFights', () => {
    it('should get upcoming fights', async () => {
      const mockObjectId = new ObjectId();
      const mockFights = [{ ...mockFight, _id: mockObjectId }];
      const mockCursor = mockCollection.find();
      
      mockCursor.toArray.mockResolvedValue(mockFights);

      const result = await fightRepository.getUpcomingFights({ limit: 10 });

      expect(mockCollection.find).toHaveBeenCalledWith({
        status: FightStatus.SCHEDULED
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ eventId: 1, mainEvent: -1, titleFight: -1 });
      expect(mockCursor.limit).toHaveBeenCalledWith(10);
    });

    it('should filter upcoming fights by weight class', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fightRepository.getUpcomingFights({ 
        weightClass: WeightClass.LIGHT_HEAVYWEIGHT 
      });

      expect(mockCollection.find).toHaveBeenCalledWith({
        status: FightStatus.SCHEDULED,
        weightClass: WeightClass.LIGHT_HEAVYWEIGHT
      });
    });

    it('should filter title fights only', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fightRepository.getUpcomingFights({ titleFightsOnly: true });

      expect(mockCollection.find).toHaveBeenCalledWith({
        status: FightStatus.SCHEDULED,
        titleFight: true
      });
    });
  });

  describe('getHistoricalResults', () => {
    it('should get historical fight results', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fightRepository.getHistoricalResults({ limit: 20 });

      expect(mockCollection.find).toHaveBeenCalledWith({
        status: FightStatus.COMPLETED,
        result: { $exists: true }
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ _id: -1 });
      expect(mockCursor.limit).toHaveBeenCalledWith(20);
    });
  });

  describe('getTitleFights', () => {
    it('should get title fights', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await fightRepository.getTitleFights(WeightClass.LIGHT_HEAVYWEIGHT, 10);

      expect(mockCollection.find).toHaveBeenCalledWith({
        titleFight: true,
        weightClass: WeightClass.LIGHT_HEAVYWEIGHT
      });
      expect(mockCursor.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('count', () => {
    it('should count all fights', async () => {
      mockCollection.countDocuments.mockResolvedValue(100);

      const result = await fightRepository.count();

      expect(mockCollection.countDocuments).toHaveBeenCalledWith({});
      expect(result).toBe(100);
    });

    it('should count fights with filters', async () => {
      mockCollection.countDocuments.mockResolvedValue(25);

      const result = await fightRepository.count({
        status: FightStatus.SCHEDULED,
        titleFight: true,
      });

      expect(mockCollection.countDocuments).toHaveBeenCalledWith({
        status: FightStatus.SCHEDULED,
        titleFight: true
      });
      expect(result).toBe(25);
    });
  });
});