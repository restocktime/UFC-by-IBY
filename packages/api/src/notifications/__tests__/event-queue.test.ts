/**
 * Unit tests for EventQueue
 */

import { EventQueue, EventQueueConfig } from '../event-queue';
import { NotificationEvent } from '@ufc-platform/shared';
import { vi } from 'vitest';

// Mock Redis
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      xgroup: vi.fn(),
      xadd: vi.fn(),
      xreadgroup: vi.fn(),
      xpending: vi.fn(),
      xclaim: vi.fn(),
      xack: vi.fn(),
      xlen: vi.fn(),
      xinfo: vi.fn(),
      quit: vi.fn()
    }))
  };
});

describe('EventQueue', () => {
  let eventQueue: EventQueue;
  let config: EventQueueConfig;
  let mockRedis: any;

  beforeEach(() => {
    config = {
      redisUrl: 'redis://localhost:6379',
      streamName: 'test-events',
      consumerGroup: 'test-group',
      consumerName: 'test-consumer',
      maxRetries: 3,
      retryDelayMs: 1000,
      batchSize: 10,
      blockTimeMs: 1000
    };

    eventQueue = new EventQueue(config);
    mockRedis = (eventQueue as any).redis;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create consumer group on initialization', async () => {
      mockRedis.xgroup.mockResolvedValue('OK');

      await eventQueue.initialize();

      expect(mockRedis.xgroup).toHaveBeenCalledWith(
        'CREATE',
        'test-events',
        'test-group',
        '$',
        'MKSTREAM'
      );
    });

    it('should handle existing consumer group gracefully', async () => {
      const error = new Error('BUSYGROUP Consumer Group name already exists');
      mockRedis.xgroup.mockRejectedValue(error);

      await expect(eventQueue.initialize()).resolves.not.toThrow();
    });

    it('should throw error for other initialization failures', async () => {
      const error = new Error('Connection failed');
      mockRedis.xgroup.mockRejectedValue(error);

      await expect(eventQueue.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('Event Enqueueing', () => {
    it('should enqueue event and return message ID', async () => {
      const event: NotificationEvent = {
        id: 'test-event-1',
        type: 'odds_movement',
        fightId: 'fight-123',
        data: { oldOdds: 150, newOdds: 120 },
        priority: 'medium',
        timestamp: new Date('2024-01-01T12:00:00Z')
      };

      mockRedis.xadd.mockResolvedValue('1640995200000-0');

      const messageId = await eventQueue.enqueue(event);

      expect(messageId).toBe('1640995200000-0');
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'test-events',
        '*',
        'id', 'test-event-1',
        'type', 'odds_movement',
        'fightId', 'fight-123',
        'fighterId', '',
        'data', JSON.stringify({ oldOdds: 150, newOdds: 120 }),
        'priority', 'medium',
        'timestamp', '2024-01-01T12:00:00.000Z',
        'userId', '',
        'attempts', '0'
      );
    });

    it('should handle events with optional fields', async () => {
      const event: NotificationEvent = {
        id: 'test-event-2',
        type: 'injury_report',
        fighterId: 'fighter-456',
        userId: 'user-789',
        data: { severity: 'minor' },
        priority: 'low',
        timestamp: new Date('2024-01-01T12:00:00Z')
      };

      mockRedis.xadd.mockResolvedValue('1640995200001-0');

      await eventQueue.enqueue(event);

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'test-events',
        '*',
        'id', 'test-event-2',
        'type', 'injury_report',
        'fightId', '',
        'fighterId', 'fighter-456',
        'data', JSON.stringify({ severity: 'minor' }),
        'priority', 'low',
        'timestamp', '2024-01-01T12:00:00.000Z',
        'userId', 'user-789',
        'attempts', '0'
      );
    });
  });

  describe('Event Callbacks', () => {
    it('should register and remove event callbacks', () => {
      const callback = vi.fn();

      eventQueue.onEvent('odds_movement', callback);
      expect((eventQueue as any).consumerCallbacks.has('odds_movement')).toBe(true);

      eventQueue.removeEventCallback('odds_movement');
      expect((eventQueue as any).consumerCallbacks.has('odds_movement')).toBe(false);
    });
  });

  describe('Message Processing', () => {
    it('should parse event fields correctly', () => {
      const fields = [
        'id', 'test-event-1',
        'type', 'odds_movement',
        'fightId', 'fight-123',
        'data', '{"oldOdds":150,"newOdds":120}',
        'priority', 'medium',
        'timestamp', '2024-01-01T12:00:00.000Z'
      ];

      const eventData = (eventQueue as any).parseEventFields(fields);

      expect(eventData).toEqual({
        id: 'test-event-1',
        type: 'odds_movement',
        fightId: 'fight-123',
        data: '{"oldOdds":150,"newOdds":120}',
        priority: 'medium',
        timestamp: '2024-01-01T12:00:00.000Z'
      });
    });

    it('should reconstruct event from parsed data', () => {
      const eventData = {
        id: 'test-event-1',
        type: 'odds_movement',
        fightId: 'fight-123',
        fighterId: '',
        data: '{"oldOdds":150,"newOdds":120}',
        priority: 'medium',
        timestamp: '2024-01-01T12:00:00.000Z',
        userId: ''
      };

      const event = (eventQueue as any).reconstructEvent(eventData);

      expect(event).toEqual({
        id: 'test-event-1',
        type: 'odds_movement',
        fightId: 'fight-123',
        fighterId: undefined,
        data: { oldOdds: 150, newOdds: 120 },
        priority: 'medium',
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        userId: undefined
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle processing errors with retry logic', async () => {
      const messageId = '1640995200000-0';
      const fields = [
        'id', 'test-event-1',
        'type', 'odds_movement',
        'attempts', '1'
      ];
      const error = new Error('Processing failed');

      mockRedis.xadd.mockResolvedValue('1640995200001-0');
      mockRedis.xack.mockResolvedValue(1);

      await (eventQueue as any).handleProcessingError(messageId, fields, error);

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'test-events',
        '*',
        'id', 'test-event-1',
        'type', 'odds_movement',
        'attempts', '2',
        'lastError', 'Processing failed'
      );
      expect(mockRedis.xack).toHaveBeenCalledWith('test-events', 'test-group', messageId);
    });

    it('should move to dead letter queue after max retries', async () => {
      const messageId = '1640995200000-0';
      const fields = [
        'id', 'test-event-1',
        'type', 'odds_movement',
        'attempts', '3' // Max retries reached
      ];
      const error = new Error('Processing failed');

      mockRedis.xadd.mockResolvedValue('1640995200001-0');
      mockRedis.xack.mockResolvedValue(1);

      await (eventQueue as any).handleProcessingError(messageId, fields, error);

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'test-events:dead-letter',
        '*',
        'originalMessageId', messageId,
        'error', 'Processing failed',
        'timestamp', expect.any(String),
        'id', 'test-event-1',
        'type', 'odds_movement',
        'attempts', '3'
      );
    });
  });

  describe('Queue Statistics', () => {
    it('should return queue statistics', async () => {
      mockRedis.xlen.mockResolvedValue(42);
      mockRedis.xinfo.mockResolvedValue([
        ['name', 'test-group', 'consumers', 1, 'pending', 5]
      ]);
      mockRedis.xpending.mockResolvedValue([5, '1640995200000-0', '1640995200005-0', [
        ['consumer1', '3'],
        ['consumer2', '2']
      ]]);

      const stats = await eventQueue.getStats();

      expect(stats).toEqual({
        streamLength: 42,
        consumerGroupInfo: [['name', 'test-group', 'consumers', 1, 'pending', 5]],
        pendingCount: 5
      });
    });

    it('should handle empty pending info', async () => {
      mockRedis.xlen.mockResolvedValue(0);
      mockRedis.xinfo.mockResolvedValue([]);
      mockRedis.xpending.mockResolvedValue(null);

      const stats = await eventQueue.getStats();

      expect(stats.pendingCount).toBe(0);
    });
  });

  describe('Cleanup', () => {
    it('should stop consuming and quit Redis connection', async () => {
      mockRedis.quit.mockResolvedValue('OK');

      await eventQueue.cleanup();

      expect((eventQueue as any).isConsuming).toBe(false);
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });
});