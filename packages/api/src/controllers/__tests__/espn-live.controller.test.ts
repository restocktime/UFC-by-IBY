import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { ESPNLiveController } from '../espn-live.controller.js';
import { ESPNAPIConnector } from '../../ingestion/connectors/espn-api.connector.js';
import { LiveFightTrackerService } from '../../services/live-fight-tracker.service.js';
import { EventRepository } from '../../repositories/event.repository.js';

// Mock the dependencies
vi.mock('../../ingestion/connectors/espn-api.connector.js');
vi.mock('../../services/live-fight-tracker.service.js');
vi.mock('../../repositories/event.repository.js');

describe('ESPNLiveController', () => {
  let controller: ESPNLiveController;
  let mockESPNConnector: vi.Mocked<ESPNAPIConnector>;
  let mockLiveTracker: vi.Mocked<LiveFightTrackerService>;
  let mockEventRepo: vi.Mocked<EventRepository>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock instances
    mockESPNConnector = {
      syncMMAEvents: vi.fn(),
      syncFighterRankings: vi.fn(),
      getLiveFightData: vi.fn()
    } as any;

    mockLiveTracker = {
      startTrackingEvent: vi.fn(),
      stopTrackingEvent: vi.fn(),
      getTrackingStats: vi.fn(),
      getTrackedEvents: vi.fn(),
      getLiveFightData: vi.fn(),
      pollEventFights: vi.fn(),
      updateOptions: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn()
    } as any;

    mockEventRepo = {
      search: vi.fn()
    } as any;

    controller = new ESPNLiveController(mockESPNConnector, mockLiveTracker, mockEventRepo);

    // Mock request and response objects
    mockReq = {
      params: {},
      query: {},
      body: {}
    };

    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis()
    };
  });

  describe('getScoreboard', () => {
    it('should return scoreboard data successfully', async () => {
      const mockResult = {
        recordsProcessed: 5,
        recordsSkipped: 1,
        errors: [],
        processingTimeMs: 1500
      };

      mockESPNConnector.syncMMAEvents.mockResolvedValue(mockResult);

      await controller.getScoreboard(mockReq as Request, mockRes as Response);

      expect(mockESPNConnector.syncMMAEvents).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          recordsProcessed: 5,
          recordsSkipped: 1,
          errors: [],
          processingTime: 1500
        }
      });
    });

    it('should handle errors gracefully', async () => {
      mockESPNConnector.syncMMAEvents.mockRejectedValue(new Error('API Error'));

      await controller.getScoreboard(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch ESPN scoreboard',
        message: 'API Error'
      });
    });
  });

  describe('getFighterRankings', () => {
    it('should return fighter rankings successfully', async () => {
      const mockResult = {
        recordsProcessed: 10,
        recordsSkipped: 0,
        errors: [],
        processingTimeMs: 2000
      };

      mockESPNConnector.syncFighterRankings.mockResolvedValue(mockResult);

      await controller.getFighterRankings(mockReq as Request, mockRes as Response);

      expect(mockESPNConnector.syncFighterRankings).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          recordsProcessed: 10,
          recordsSkipped: 0,
          errors: [],
          processingTime: 2000
        }
      });
    });

    it('should handle errors gracefully', async () => {
      mockESPNConnector.syncFighterRankings.mockRejectedValue(new Error('Rankings Error'));

      await controller.getFighterRankings(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch ESPN fighter rankings',
        message: 'Rankings Error'
      });
    });
  });

  describe('getLiveFightData', () => {
    it('should return live fight data for valid event ID', async () => {
      mockReq.params = { eventId: 'test-event-1' };
      
      const mockLiveFights = [{
        eventId: 'test-event-1',
        fightId: 'test-fight-1',
        status: 'in_progress',
        currentRound: 2,
        timeRemaining: '3:45',
        lastUpdate: new Date()
      }];

      mockESPNConnector.getLiveFightData.mockResolvedValue(mockLiveFights);

      await controller.getLiveFightData(mockReq as Request, mockRes as Response);

      expect(mockESPNConnector.getLiveFightData).toHaveBeenCalledWith('test-event-1');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          eventId: 'test-event-1',
          liveFights: mockLiveFights,
          count: 1,
          lastUpdate: expect.any(Date)
        }
      });
    });

    it('should return error for missing event ID', async () => {
      mockReq.params = {};

      await controller.getLiveFightData(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event ID is required'
      });
    });

    it('should handle API errors', async () => {
      mockReq.params = { eventId: 'test-event-1' };
      mockESPNConnector.getLiveFightData.mockRejectedValue(new Error('Live data error'));

      await controller.getLiveFightData(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch live fight data',
        message: 'Live data error'
      });
    });
  });

  describe('startTracking', () => {
    it('should start tracking successfully', async () => {
      mockReq.params = { eventId: 'test-event-1' };
      mockReq.body = {
        pollInterval: 5000,
        enableNotifications: true,
        trackStatistics: true
      };

      const mockStats = {
        trackedEvents: 1,
        trackedFights: 2,
        pollInterval: 5000,
        uptime: 12345
      };

      mockLiveTracker.startTrackingEvent.mockResolvedValue();
      mockLiveTracker.getTrackingStats.mockReturnValue(mockStats);

      await controller.startTracking(mockReq as Request, mockRes as Response);

      expect(mockLiveTracker.updateOptions).toHaveBeenCalledWith({
        pollIntervalMs: 5000,
        enableNotifications: true,
        trackStatistics: true
      });
      expect(mockLiveTracker.startTrackingEvent).toHaveBeenCalledWith('test-event-1');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Started tracking event test-event-1',
        data: {
          eventId: 'test-event-1',
          trackingStats: mockStats
        }
      });
    });

    it('should return error for missing event ID', async () => {
      mockReq.params = {};

      await controller.startTracking(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event ID is required'
      });
    });

    it('should handle tracking errors', async () => {
      mockReq.params = { eventId: 'test-event-1' };
      mockLiveTracker.startTrackingEvent.mockRejectedValue(new Error('Tracking error'));

      await controller.startTracking(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to start tracking',
        message: 'Tracking error'
      });
    });
  });

  describe('stopTracking', () => {
    it('should stop tracking successfully', async () => {
      mockReq.params = { eventId: 'test-event-1' };

      const mockStats = {
        trackedEvents: 0,
        trackedFights: 0,
        pollInterval: 10000,
        uptime: 12345
      };

      mockLiveTracker.getTrackingStats.mockReturnValue(mockStats);

      await controller.stopTracking(mockReq as Request, mockRes as Response);

      expect(mockLiveTracker.stopTrackingEvent).toHaveBeenCalledWith('test-event-1');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Stopped tracking event test-event-1',
        data: {
          eventId: 'test-event-1',
          trackingStats: mockStats
        }
      });
    });

    it('should return error for missing event ID', async () => {
      mockReq.params = {};

      await controller.stopTracking(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event ID is required'
      });
    });
  });

  describe('getTrackingStatus', () => {
    it('should return tracking status successfully', async () => {
      const mockStats = {
        trackedEvents: 2,
        trackedFights: 4,
        pollInterval: 10000,
        uptime: 12345
      };

      const mockTrackedEvents = ['event-1', 'event-2'];

      mockLiveTracker.getTrackingStats.mockReturnValue(mockStats);
      mockLiveTracker.getTrackedEvents.mockReturnValue(mockTrackedEvents);

      await controller.getTrackingStatus(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          stats: mockStats,
          trackedEvents: mockTrackedEvents,
          isTracking: true
        }
      });
    });

    it('should handle errors gracefully', async () => {
      mockLiveTracker.getTrackingStats.mockImplementation(() => {
        throw new Error('Stats error');
      });

      await controller.getTrackingStatus(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get tracking status',
        message: 'Stats error'
      });
    });
  });

  describe('getFightTrackingData', () => {
    it('should return fight data when fight is being tracked', async () => {
      mockReq.params = { fightId: 'test-fight-1' };

      const mockFightData = {
        eventId: 'test-event-1',
        fightId: 'test-fight-1',
        status: 'in_progress',
        currentRound: 2,
        timeRemaining: '3:45',
        lastUpdate: new Date()
      };

      mockLiveTracker.getLiveFightData.mockReturnValue(mockFightData);

      await controller.getFightTrackingData(mockReq as Request, mockRes as Response);

      expect(mockLiveTracker.getLiveFightData).toHaveBeenCalledWith('test-fight-1');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockFightData
      });
    });

    it('should return 404 when fight is not found', async () => {
      mockReq.params = { fightId: 'non-existent-fight' };
      mockLiveTracker.getLiveFightData.mockReturnValue(undefined);

      await controller.getFightTrackingData(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Fight not found or not being tracked'
      });
    });

    it('should return error for missing fight ID', async () => {
      mockReq.params = {};

      await controller.getFightTrackingData(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Fight ID is required'
      });
    });
  });

  describe('manualPoll', () => {
    it('should perform manual poll successfully', async () => {
      mockReq.params = { eventId: 'test-event-1' };

      const mockUpdates = [{
        fightId: 'test-fight-1',
        eventId: 'test-event-1',
        status: 'in_progress',
        significantChanges: ['round_changed_1_to_2'],
        lastUpdate: new Date()
      }];

      mockLiveTracker.pollEventFights.mockResolvedValue(mockUpdates);

      await controller.manualPoll(mockReq as Request, mockRes as Response);

      expect(mockLiveTracker.pollEventFights).toHaveBeenCalledWith('test-event-1');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          eventId: 'test-event-1',
          updates: mockUpdates,
          updateCount: 1,
          timestamp: expect.any(Date)
        }
      });
    });

    it('should return error for missing event ID', async () => {
      mockReq.params = {};

      await controller.manualPoll(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event ID is required'
      });
    });

    it('should handle polling errors', async () => {
      mockReq.params = { eventId: 'test-event-1' };
      mockLiveTracker.pollEventFights.mockRejectedValue(new Error('Poll error'));

      await controller.manualPoll(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to poll event',
        message: 'Poll error'
      });
    });
  });

  describe('fullSync', () => {
    it('should perform full sync successfully', async () => {
      const mockEventsResult = {
        recordsProcessed: 5,
        recordsSkipped: 1,
        errors: []
      };

      const mockFightersResult = {
        recordsProcessed: 20,
        recordsSkipped: 2,
        errors: []
      };

      mockESPNConnector.syncMMAEvents.mockResolvedValue(mockEventsResult);
      mockESPNConnector.syncFighterRankings.mockResolvedValue(mockFightersResult);

      await controller.fullSync(mockReq as Request, mockRes as Response);

      expect(mockESPNConnector.syncMMAEvents).toHaveBeenCalled();
      expect(mockESPNConnector.syncFighterRankings).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          events: mockEventsResult,
          fighters: mockFightersResult,
          totalProcessingTime: expect.any(Number)
        }
      });
    });

    it('should handle sync errors', async () => {
      mockESPNConnector.syncMMAEvents.mockRejectedValue(new Error('Sync error'));

      await controller.fullSync(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to perform full sync',
        message: 'Sync error'
      });
    });
  });

  describe('getUpcomingEvents', () => {
    it('should return upcoming events successfully', async () => {
      mockReq.query = { limit: '5', offset: '0' };

      const mockEvents = [
        { id: 'event-1', name: 'UFC 300', date: new Date('2024-04-13') },
        { id: 'event-2', name: 'UFC 301', date: new Date('2024-05-04') }
      ];

      mockEventRepo.search.mockResolvedValue(mockEvents);

      await controller.getUpcomingEvents(mockReq as Request, mockRes as Response);

      expect(mockEventRepo.search).toHaveBeenCalledWith({
        dateFrom: expect.any(Date),
        limit: 5,
        offset: 0
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          events: mockEvents,
          count: 2,
          limit: 5,
          offset: 0
        }
      });
    });

    it('should use default pagination values', async () => {
      mockReq.query = {};
      mockEventRepo.search.mockResolvedValue([]);

      await controller.getUpcomingEvents(mockReq as Request, mockRes as Response);

      expect(mockEventRepo.search).toHaveBeenCalledWith({
        dateFrom: expect.any(Date),
        limit: 10,
        offset: 0
      });
    });

    it('should handle database errors', async () => {
      mockEventRepo.search.mockRejectedValue(new Error('Database error'));

      await controller.getUpcomingEvents(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get upcoming events',
        message: 'Database error'
      });
    });
  });

  describe('setupWebSocketHandlers', () => {
    it('should set up WebSocket event handlers', () => {
      const mockIO = {
        emit: vi.fn()
      };

      controller.setupWebSocketHandlers(mockIO);

      // Verify that event listeners are set up
      expect(mockLiveTracker.on).toHaveBeenCalledWith('fightUpdate', expect.any(Function));
      expect(mockLiveTracker.on).toHaveBeenCalledWith('roundChange', expect.any(Function));
      expect(mockLiveTracker.on).toHaveBeenCalledWith('statusChange', expect.any(Function));
      expect(mockLiveTracker.on).toHaveBeenCalledWith('fightEnded', expect.any(Function));
      expect(mockLiveTracker.on).toHaveBeenCalledWith('knockdown', expect.any(Function));
      expect(mockLiveTracker.on).toHaveBeenCalledWith('submissionAttempt', expect.any(Function));
      expect(mockLiveTracker.on).toHaveBeenCalledWith('newFightDetected', expect.any(Function));
      expect(mockLiveTracker.on).toHaveBeenCalledWith('trackingError', expect.any(Function));
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', () => {
      controller.cleanup();
      expect(mockLiveTracker.destroy).toHaveBeenCalled();
    });
  });
});