import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LiveFightTrackerService } from '../live-fight-tracker.service.js';
import { ESPNAPIConnector, LiveFightData } from '../../ingestion/connectors/espn-api.connector.js';
import { FightRepository } from '../../repositories/fight.repository.js';
import { EventRepository } from '../../repositories/event.repository.js';

// Mock the dependencies
vi.mock('../../ingestion/connectors/espn-api.connector.js');
vi.mock('../../repositories/fight.repository.js');
vi.mock('../../repositories/event.repository.js');

describe('LiveFightTrackerService', () => {
  let service: LiveFightTrackerService;
  let mockESPNConnector: vi.Mocked<ESPNAPIConnector>;
  let mockFightRepo: vi.Mocked<FightRepository>;
  let mockEventRepo: vi.Mocked<EventRepository>;

  const mockLiveFightData: LiveFightData = {
    eventId: 'test-event-1',
    fightId: 'test-fight-1',
    status: 'in_progress',
    currentRound: 1,
    timeRemaining: '5:00',
    lastUpdate: new Date('2024-01-01T20:00:00Z')
  };

  const mockUpdatedFightData: LiveFightData = {
    eventId: 'test-event-1',
    fightId: 'test-fight-1',
    status: 'in_progress',
    currentRound: 2,
    timeRemaining: '4:30',
    lastUpdate: new Date('2024-01-01T20:05:00Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create mock instances
    mockESPNConnector = {
      getLiveFightData: vi.fn(),
      getCachedLiveFightData: vi.fn(),
      clearLiveFightCache: vi.fn()
    } as any;

    mockFightRepo = {
      search: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findById: vi.fn()
    } as any;

    mockEventRepo = {
      findById: vi.fn(),
      update: vi.fn()
    } as any;

    service = new LiveFightTrackerService(
      mockESPNConnector,
      mockFightRepo,
      mockEventRepo,
      {
        pollIntervalMs: 1000, // 1 second for testing
        enableNotifications: true,
        trackStatistics: true,
        autoUpdateDatabase: true
      }
    );
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultService = new LiveFightTrackerService();
      expect(defaultService).toBeInstanceOf(LiveFightTrackerService);
    });

    it('should initialize with custom options', () => {
      const customOptions = {
        pollIntervalMs: 5000,
        enableNotifications: false,
        trackStatistics: false,
        autoUpdateDatabase: false
      };

      const customService = new LiveFightTrackerService(
        mockESPNConnector,
        mockFightRepo,
        mockEventRepo,
        customOptions
      );

      expect(customService).toBeInstanceOf(LiveFightTrackerService);
    });
  });

  describe('startTrackingEvent', () => {
    it('should start tracking an event with live fights', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);

      const trackingStartedSpy = vi.fn();
      service.on('trackingStarted', trackingStartedSpy);

      await service.startTrackingEvent('test-event-1');

      expect(mockESPNConnector.getLiveFightData).toHaveBeenCalledWith('test-event-1');
      expect(trackingStartedSpy).toHaveBeenCalledWith({
        eventId: 'test-event-1',
        fightsCount: 1,
        pollInterval: 1000
      });
      expect(service.getTrackedEvents()).toContain('test-event-1');
    });

    it('should emit noLiveFights when no live fights are found', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([]);

      const noLiveFightsSpy = vi.fn();
      service.on('noLiveFights', noLiveFightsSpy);

      await service.startTrackingEvent('test-event-1');

      expect(noLiveFightsSpy).toHaveBeenCalledWith({ eventId: 'test-event-1' });
      expect(service.getTrackedEvents()).not.toContain('test-event-1');
    });

    it('should throw error if already tracking the event', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);

      await service.startTrackingEvent('test-event-1');

      await expect(service.startTrackingEvent('test-event-1'))
        .rejects.toThrow('Already tracking event: test-event-1');
    });

    it('should handle API errors gracefully', async () => {
      mockESPNConnector.getLiveFightData.mockRejectedValue(new Error('API Error'));

      await expect(service.startTrackingEvent('test-event-1'))
        .rejects.toThrow('Failed to start tracking event test-event-1: API Error');
    });
  });

  describe('stopTrackingEvent', () => {
    it('should stop tracking an event', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);

      const trackingStoppedSpy = vi.fn();
      service.on('trackingStopped', trackingStoppedSpy);

      await service.startTrackingEvent('test-event-1');
      service.stopTrackingEvent('test-event-1');

      expect(trackingStoppedSpy).toHaveBeenCalledWith({ eventId: 'test-event-1' });
      expect(service.getTrackedEvents()).not.toContain('test-event-1');
    });

    it('should handle stopping non-tracked event gracefully', () => {
      expect(() => service.stopTrackingEvent('non-existent-event')).not.toThrow();
    });
  });

  describe('pollEventFights', () => {
    beforeEach(async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);
      await service.startTrackingEvent('test-event-1');
    });

    it('should detect new fights', async () => {
      const newFight: LiveFightData = {
        eventId: 'test-event-1',
        fightId: 'test-fight-2',
        status: 'in_progress',
        currentRound: 1,
        timeRemaining: '5:00',
        lastUpdate: new Date()
      };

      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData, newFight]);

      const newFightSpy = vi.fn();
      service.on('newFightDetected', newFightSpy);

      const updates = await service.pollEventFights('test-event-1');

      expect(updates).toHaveLength(1);
      expect(updates[0].fightId).toBe('test-fight-2');
      expect(updates[0].significantChanges).toContain('fight_started');
      expect(newFightSpy).toHaveBeenCalled();
    });

    it('should detect round changes', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockUpdatedFightData]);

      const roundChangeSpy = vi.fn();
      service.on('roundChange', roundChangeSpy);

      const updates = await service.pollEventFights('test-event-1');

      expect(updates).toHaveLength(1);
      expect(updates[0].significantChanges).toContain('round_changed_1_to_2');
      expect(roundChangeSpy).toHaveBeenCalled();
    });

    it('should detect status changes', async () => {
      const completedFight: LiveFightData = {
        ...mockLiveFightData,
        status: 'completed'
      };

      mockESPNConnector.getLiveFightData.mockResolvedValue([completedFight]);

      const statusChangeSpy = vi.fn();
      const fightEndedSpy = vi.fn();
      service.on('statusChange', statusChangeSpy);
      service.on('fightEnded', fightEndedSpy);

      const updates = await service.pollEventFights('test-event-1');

      expect(updates).toHaveLength(1);
      expect(updates[0].significantChanges).toContain('status_changed_in_progress_to_completed');
      expect(statusChangeSpy).toHaveBeenCalled();
      expect(fightEndedSpy).toHaveBeenCalled();
    });

    it('should update database when autoUpdateDatabase is enabled', async () => {
      const mockFight = { id: 'db-fight-1', eventId: 'test-event-1' };
      mockFightRepo.search.mockResolvedValue([mockFight] as any);
      mockFightRepo.update.mockResolvedValue(mockFight as any);

      mockESPNConnector.getLiveFightData.mockResolvedValue([mockUpdatedFightData]);

      const databaseUpdatedSpy = vi.fn();
      service.on('databaseUpdated', databaseUpdatedSpy);

      await service.pollEventFights('test-event-1');

      expect(mockFightRepo.search).toHaveBeenCalledWith({
        eventId: 'test-event-1',
        limit: 100
      });
      expect(mockFightRepo.update).toHaveBeenCalled();
      expect(databaseUpdatedSpy).toHaveBeenCalled();
    });

    it('should handle API errors during polling', async () => {
      mockESPNConnector.getLiveFightData.mockRejectedValue(new Error('Polling error'));

      const pollErrorSpy = vi.fn();
      service.on('pollError', pollErrorSpy);

      await expect(service.pollEventFights('test-event-1')).rejects.toThrow('Polling error');
      expect(pollErrorSpy).toHaveBeenCalledWith({
        eventId: 'test-event-1',
        error: 'Polling error'
      });
    });
  });

  describe('automatic polling', () => {
    it('should automatically poll at specified intervals', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);

      await service.startTrackingEvent('test-event-1');

      // Clear the initial call
      mockESPNConnector.getLiveFightData.mockClear();

      // Advance time by poll interval
      vi.advanceTimersByTime(1000);

      expect(mockESPNConnector.getLiveFightData).toHaveBeenCalledWith('test-event-1');
    });

    it('should handle polling errors without stopping tracking', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);

      const trackingErrorSpy = vi.fn();
      service.on('trackingError', trackingErrorSpy);

      await service.startTrackingEvent('test-event-1');

      // Make subsequent polls fail
      mockESPNConnector.getLiveFightData.mockRejectedValue(new Error('Poll error'));

      vi.advanceTimersByTime(1000);

      expect(trackingErrorSpy).toHaveBeenCalledWith({
        eventId: 'test-event-1',
        error: 'Poll error'
      });

      // Event should still be tracked
      expect(service.getTrackedEvents()).toContain('test-event-1');
    });
  });

  describe('getLiveFightData', () => {
    it('should return live fight data for tracked fight', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);

      await service.startTrackingEvent('test-event-1');

      const fightData = service.getLiveFightData('test-fight-1');
      expect(fightData).toEqual(mockLiveFightData);
    });

    it('should return undefined for non-tracked fight', () => {
      const fightData = service.getLiveFightData('non-existent-fight');
      expect(fightData).toBeUndefined();
    });
  });

  describe('getTrackingStats', () => {
    it('should return tracking statistics', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);

      await service.startTrackingEvent('test-event-1');

      const stats = service.getTrackingStats();

      expect(stats.trackedEvents).toBe(1);
      expect(stats.trackedFights).toBe(1);
      expect(stats.pollInterval).toBe(1000);
      expect(typeof stats.uptime).toBe('number');
    });
  });

  describe('updateOptions', () => {
    it('should update tracking options', () => {
      const newOptions = {
        enableNotifications: false,
        trackStatistics: false
      };

      service.updateOptions(newOptions);

      const stats = service.getTrackingStats();
      expect(stats.pollInterval).toBe(1000); // Should remain unchanged
    });

    it('should restart tracking when poll interval changes', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);

      await service.startTrackingEvent('test-event-1');

      const trackingStoppedSpy = vi.fn();
      const trackingStartedSpy = vi.fn();
      service.on('trackingStopped', trackingStoppedSpy);
      service.on('trackingStarted', trackingStartedSpy);

      service.updateOptions({ pollIntervalMs: 2000 });

      expect(trackingStoppedSpy).toHaveBeenCalled();

      // Advance time to trigger restart
      vi.advanceTimersByTime(1000);

      expect(trackingStartedSpy).toHaveBeenCalled();
    });
  });

  describe('stopAllTracking', () => {
    it('should stop all tracked events', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);

      await service.startTrackingEvent('test-event-1');
      await service.startTrackingEvent('test-event-2');

      expect(service.getTrackedEvents()).toHaveLength(2);

      service.stopAllTracking();

      expect(service.getTrackedEvents()).toHaveLength(0);
    });
  });

  describe('change detection', () => {
    it('should detect significant time changes', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);
      await service.startTrackingEvent('test-event-1');

      const significantTimeChange: LiveFightData = {
        ...mockLiveFightData,
        timeRemaining: '4:00' // 1 minute difference
      };

      mockESPNConnector.getLiveFightData.mockResolvedValue([significantTimeChange]);

      const updates = await service.pollEventFights('test-event-1');

      expect(updates[0].significantChanges).toContain('significant_time_change');
    });

    it('should detect statistics changes when enabled', async () => {
      const fightWithStats: LiveFightData = {
        ...mockLiveFightData,
        fighter1Stats: {
          significantStrikes: { landed: 5, attempted: 10 },
          totalStrikes: { landed: 8, attempted: 15 },
          takedowns: { landed: 1, attempted: 2 },
          submissionAttempts: 0,
          knockdowns: 0,
          controlTime: '1:30'
        }
      };

      mockESPNConnector.getLiveFightData.mockResolvedValue([fightWithStats]);
      await service.startTrackingEvent('test-event-1');

      const updatedStats: LiveFightData = {
        ...fightWithStats,
        fighter1Stats: {
          ...fightWithStats.fighter1Stats!,
          knockdowns: 1 // Knockdown detected
        }
      };

      mockESPNConnector.getLiveFightData.mockResolvedValue([updatedStats]);

      const knockdownSpy = vi.fn();
      service.on('knockdown', knockdownSpy);

      const updates = await service.pollEventFights('test-event-1');

      expect(updates[0].significantChanges).toContain('fighter1_knockdown');
      expect(knockdownSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle database update errors gracefully', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);
      await service.startTrackingEvent('test-event-1');

      mockFightRepo.search.mockRejectedValue(new Error('Database error'));

      const databaseErrorSpy = vi.fn();
      service.on('databaseUpdateError', databaseErrorSpy);

      mockESPNConnector.getLiveFightData.mockResolvedValue([mockUpdatedFightData]);

      await service.pollEventFights('test-event-1');

      expect(databaseErrorSpy).toHaveBeenCalledWith({
        fightId: 'test-fight-1',
        error: 'Database error'
      });
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on destroy', async () => {
      mockESPNConnector.getLiveFightData.mockResolvedValue([mockLiveFightData]);

      await service.startTrackingEvent('test-event-1');

      expect(service.getTrackedEvents()).toHaveLength(1);

      service.destroy();

      expect(service.getTrackedEvents()).toHaveLength(0);
      expect(service.listenerCount('fightUpdate')).toBe(0);
    });
  });
});