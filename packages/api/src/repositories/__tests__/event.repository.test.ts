import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { EventRepository } from '../event.repository';
import { Event } from '@ufc-platform/shared/types/event';
import { DatabaseManager } from '../../database';

// Mock the database manager
vi.mock('../../database');

describe('EventRepository', () => {
  let eventRepository: EventRepository;
  let mockCollection: any;
  let mockDb: any;
  let mockDbManager: any;

  const mockEvent: Omit<Event, 'id'> = {
    name: 'UFC 285: Jones vs. Gane',
    date: new Date('2023-03-04T22:00:00Z'),
    venue: {
      name: 'T-Mobile Arena',
      city: 'Las Vegas',
      state: 'Nevada',
      country: 'United States',
      altitude: 2001,
    },
    commission: 'Nevada State Athletic Commission',
    fights: ['fight1', 'fight2', 'fight3'],
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

    eventRepository = new EventRepository();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new event successfully', async () => {
      const mockObjectId = new ObjectId();
      const mockInsertResult = { insertedId: mockObjectId };
      const mockCreatedEvent = { ...mockEvent, _id: mockObjectId };

      mockCollection.insertOne.mockResolvedValue(mockInsertResult);
      mockCollection.findOne.mockResolvedValue(mockCreatedEvent);

      const result = await eventRepository.create(mockEvent);

      expect(mockCollection.insertOne).toHaveBeenCalledWith(mockEvent);
      expect(result).toEqual({
        ...mockCreatedEvent,
        id: mockObjectId.toString(),
      });
    });

    it('should throw error if creation fails', async () => {
      mockCollection.insertOne.mockRejectedValue(new Error('Database error'));

      await expect(eventRepository.create(mockEvent)).rejects.toThrow('Failed to create event');
    });
  });

  describe('findById', () => {
    it('should find event by valid ID', async () => {
      const mockObjectId = new ObjectId();
      const mockFoundEvent = { ...mockEvent, _id: mockObjectId };

      mockCollection.findOne.mockResolvedValue(mockFoundEvent);

      const result = await eventRepository.findById(mockObjectId.toString());

      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: mockObjectId });
      expect(result).toEqual({
        ...mockFoundEvent,
        id: mockObjectId.toString(),
      });
    });

    it('should return null for invalid ID', async () => {
      const result = await eventRepository.findById('invalid-id');
      expect(result).toBeNull();
    });

    it('should return null if event not found', async () => {
      const mockObjectId = new ObjectId();
      mockCollection.findOne.mockResolvedValue(null);

      const result = await eventRepository.findById(mockObjectId.toString());
      expect(result).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should find event by name (case insensitive)', async () => {
      const mockObjectId = new ObjectId();
      const mockFoundEvent = { ...mockEvent, _id: mockObjectId };

      mockCollection.findOne.mockResolvedValue(mockFoundEvent);

      const result = await eventRepository.findByName('ufc 285: jones vs. gane');

      expect(mockCollection.findOne).toHaveBeenCalledWith({
        name: { $regex: new RegExp('^ufc 285: jones vs. gane$', 'i') }
      });
      expect(result).toEqual({
        ...mockFoundEvent,
        id: mockObjectId.toString(),
      });
    });

    it('should return null if event not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await eventRepository.findByName('Unknown Event');
      expect(result).toBeNull();
    });
  });

  describe('addFight', () => {
    it('should add fight to event successfully', async () => {
      const mockObjectId = new ObjectId();
      const mockUpdatedEvent = { 
        ...mockEvent, 
        _id: mockObjectId,
        fights: [...mockEvent.fights, 'fight4']
      };

      mockCollection.findOneAndUpdate.mockResolvedValue(mockUpdatedEvent);

      const result = await eventRepository.addFight(mockObjectId.toString(), 'fight4');

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockObjectId },
        { $addToSet: { fights: 'fight4' } },
        { returnDocument: 'after' }
      );
      expect(result).toEqual({
        ...mockUpdatedEvent,
        id: mockObjectId.toString(),
      });
    });

    it('should return null for invalid ID', async () => {
      const result = await eventRepository.addFight('invalid-id', 'fight4');
      expect(result).toBeNull();
    });
  });

  describe('removeFight', () => {
    it('should remove fight from event successfully', async () => {
      const mockObjectId = new ObjectId();
      const mockUpdatedEvent = { 
        ...mockEvent, 
        _id: mockObjectId,
        fights: ['fight1', 'fight3'] // fight2 removed
      };

      mockCollection.findOneAndUpdate.mockResolvedValue(mockUpdatedEvent);

      const result = await eventRepository.removeFight(mockObjectId.toString(), 'fight2');

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockObjectId },
        { $pull: { fights: 'fight2' } },
        { returnDocument: 'after' }
      );
      expect(result).toEqual({
        ...mockUpdatedEvent,
        id: mockObjectId.toString(),
      });
    });
  });

  describe('search', () => {
    it('should search events with text query', async () => {
      const mockObjectId = new ObjectId();
      const mockEvents = [{ ...mockEvent, _id: mockObjectId }];
      const mockCursor = mockCollection.find();
      
      mockCursor.toArray.mockResolvedValue(mockEvents);

      const result = await eventRepository.search({ name: 'UFC 285' });

      expect(mockCollection.find).toHaveBeenCalledWith({
        $text: { $search: 'UFC 285' }
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ score: { $meta: 'textScore' } });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockObjectId.toString());
    });

    it('should search events by city', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await eventRepository.search({ city: 'Las Vegas' });

      expect(mockCollection.find).toHaveBeenCalledWith({
        'venue.city': { $regex: new RegExp('Las Vegas', 'i') }
      });
    });

    it('should search events by country', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await eventRepository.search({ country: 'United States' });

      expect(mockCollection.find).toHaveBeenCalledWith({
        'venue.country': { $regex: new RegExp('United States', 'i') }
      });
    });

    it('should search events by commission', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await eventRepository.search({ commission: 'Nevada' });

      expect(mockCollection.find).toHaveBeenCalledWith({
        commission: { $regex: new RegExp('Nevada', 'i') }
      });
    });

    it('should search events by date range', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await eventRepository.search({ dateFrom: startDate, dateTo: endDate });

      expect(mockCollection.find).toHaveBeenCalledWith({
        date: { $gte: startDate, $lte: endDate }
      });
    });

    it('should apply pagination', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await eventRepository.search({ limit: 10, offset: 20 });

      expect(mockCursor.skip).toHaveBeenCalledWith(20);
      expect(mockCursor.limit).toHaveBeenCalledWith(10);
    });

    it('should sort by date when no text search', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await eventRepository.search({ city: 'Las Vegas' });

      expect(mockCursor.sort).toHaveBeenCalledWith({ date: -1 });
    });
  });

  describe('getUpcomingEvents', () => {
    it('should get upcoming events', async () => {
      const mockObjectId = new ObjectId();
      const mockEvents = [{ ...mockEvent, _id: mockObjectId }];
      const mockCursor = mockCollection.find();
      
      mockCursor.toArray.mockResolvedValue(mockEvents);

      const result = await eventRepository.getUpcomingEvents(10);

      expect(mockCollection.find).toHaveBeenCalledWith({
        date: { $gte: expect.any(Date) }
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ date: 1 });
      expect(mockCursor.limit).toHaveBeenCalledWith(10);
    });

    it('should limit upcoming events by days ahead', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await eventRepository.getUpcomingEvents(undefined, 30);

      const callArgs = mockCollection.find.mock.calls[0][0];
      expect(callArgs.date.$gte).toBeInstanceOf(Date);
      expect(callArgs.date.$lte).toBeInstanceOf(Date);
    });
  });

  describe('getPastEvents', () => {
    it('should get past events', async () => {
      const mockObjectId = new ObjectId();
      const mockEvents = [{ ...mockEvent, _id: mockObjectId }];
      const mockCursor = mockCollection.find();
      
      mockCursor.toArray.mockResolvedValue(mockEvents);

      const result = await eventRepository.getPastEvents(10);

      expect(mockCollection.find).toHaveBeenCalledWith({
        date: { $lt: expect.any(Date) }
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ date: -1 });
      expect(mockCursor.limit).toHaveBeenCalledWith(10);
    });

    it('should limit past events by days back', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await eventRepository.getPastEvents(undefined, 30);

      const callArgs = mockCollection.find.mock.calls[0][0];
      expect(callArgs.date.$lt).toBeInstanceOf(Date);
      expect(callArgs.date.$gte).toBeInstanceOf(Date);
    });
  });

  describe('getEventsByVenue', () => {
    it('should get events by venue', async () => {
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await eventRepository.getEventsByVenue('Las Vegas', 'United States', 5);

      expect(mockCollection.find).toHaveBeenCalledWith({
        'venue.city': { $regex: new RegExp('Las Vegas', 'i') },
        'venue.country': { $regex: new RegExp('United States', 'i') }
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ date: -1 });
      expect(mockCursor.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('getEventsByDateRange', () => {
    it('should get events by date range', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');
      const mockCursor = mockCollection.find();
      mockCursor.toArray.mockResolvedValue([]);

      await eventRepository.getEventsByDateRange(startDate, endDate);

      expect(mockCollection.find).toHaveBeenCalledWith({
        date: { $gte: startDate, $lte: endDate }
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ date: 1 });
    });
  });

  describe('getEventsWithFightCounts', () => {
    it('should get events with fight counts', async () => {
      const mockEvents = [{
        ...mockEvent,
        _id: new ObjectId(),
        fightCount: 12,
        titleFightCount: 2,
        mainEventCount: 1
      }];

      mockCollection.aggregate().toArray.mockResolvedValue(mockEvents);

      const result = await eventRepository.getEventsWithFightCounts();

      expect(mockCollection.aggregate).toHaveBeenCalled();
      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      
      // Check that the pipeline includes lookup and addFields stages
      expect(pipeline.some((stage: any) => stage.$lookup)).toBe(true);
      expect(pipeline.some((stage: any) => stage.$addFields)).toBe(true);
    });

    it('should filter events with fight counts by date range', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');
      
      mockCollection.aggregate().toArray.mockResolvedValue([]);

      await eventRepository.getEventsWithFightCounts({ 
        dateFrom: startDate, 
        dateTo: endDate 
      });

      const pipeline = mockCollection.aggregate.mock.calls[0][0];
      const matchStage = pipeline.find((stage: any) => stage.$match);
      
      expect(matchStage).toBeDefined();
      expect(matchStage.$match.date.$gte).toEqual(startDate);
      expect(matchStage.$match.date.$lte).toEqual(endDate);
    });
  });

  describe('count', () => {
    it('should count all events', async () => {
      mockCollection.countDocuments.mockResolvedValue(50);

      const result = await eventRepository.count();

      expect(mockCollection.countDocuments).toHaveBeenCalledWith({});
      expect(result).toBe(50);
    });

    it('should count events with filters', async () => {
      mockCollection.countDocuments.mockResolvedValue(15);

      const result = await eventRepository.count({
        city: 'Las Vegas',
        country: 'United States',
      });

      expect(mockCollection.countDocuments).toHaveBeenCalledWith({
        'venue.city': { $regex: new RegExp('Las Vegas', 'i') },
        'venue.country': { $regex: new RegExp('United States', 'i') }
      });
      expect(result).toBe(15);
    });

    it('should count events with date range filter', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');
      
      mockCollection.countDocuments.mockResolvedValue(25);

      const result = await eventRepository.count({
        dateFrom: startDate,
        dateTo: endDate,
      });

      expect(mockCollection.countDocuments).toHaveBeenCalledWith({
        date: { $gte: startDate, $lte: endDate }
      });
      expect(result).toBe(25);
    });
  });
});