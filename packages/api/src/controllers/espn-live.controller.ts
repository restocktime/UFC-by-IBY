import { Request, Response } from 'express';
import { ESPNAPIConnector } from '../ingestion/connectors/espn-api.connector.js';
import { LiveFightTrackerService } from '../services/live-fight-tracker.service.js';
import { EventRepository } from '../repositories/event.repository.js';

export class ESPNLiveController {
  private espnConnector: ESPNAPIConnector;
  private liveTracker: LiveFightTrackerService;
  private eventRepository: EventRepository;

  constructor(
    espnConnector?: ESPNAPIConnector,
    liveTracker?: LiveFightTrackerService,
    eventRepository?: EventRepository
  ) {
    this.espnConnector = espnConnector || new ESPNAPIConnector();
    this.liveTracker = liveTracker || new LiveFightTrackerService(this.espnConnector);
    this.eventRepository = eventRepository || new EventRepository();
  }

  /**
   * GET /api/espn/scoreboard
   * Get current UFC scoreboard from ESPN
   */
  public async getScoreboard(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.espnConnector.syncMMAEvents();
      
      res.json({
        success: true,
        data: {
          recordsProcessed: result.recordsProcessed,
          recordsSkipped: result.recordsSkipped,
          errors: result.errors,
          processingTime: result.processingTimeMs
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch ESPN scoreboard',
        message: error.message
      });
    }
  }

  /**
   * GET /api/espn/fighters
   * Get fighter rankings from ESPN
   */
  public async getFighterRankings(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.espnConnector.syncFighterRankings();
      
      res.json({
        success: true,
        data: {
          recordsProcessed: result.recordsProcessed,
          recordsSkipped: result.recordsSkipped,
          errors: result.errors,
          processingTime: result.processingTimeMs
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch ESPN fighter rankings',
        message: error.message
      });
    }
  }

  /**
   * GET /api/espn/live/:eventId
   * Get live fight data for a specific event
   */
  public async getLiveFightData(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = req.params;
      
      if (!eventId) {
        res.status(400).json({
          success: false,
          error: 'Event ID is required'
        });
        return;
      }

      const liveFights = await this.espnConnector.getLiveFightData(eventId);
      
      res.json({
        success: true,
        data: {
          eventId,
          liveFights,
          count: liveFights.length,
          lastUpdate: new Date()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch live fight data',
        message: error.message
      });
    }
  }

  /**
   * POST /api/espn/tracking/start/:eventId
   * Start tracking live fights for an event
   */
  public async startTracking(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = req.params;
      const { pollInterval, enableNotifications, trackStatistics } = req.body;

      if (!eventId) {
        res.status(400).json({
          success: false,
          error: 'Event ID is required'
        });
        return;
      }

      // Update tracker options if provided
      if (pollInterval || enableNotifications !== undefined || trackStatistics !== undefined) {
        this.liveTracker.updateOptions({
          ...(pollInterval && { pollIntervalMs: pollInterval }),
          ...(enableNotifications !== undefined && { enableNotifications }),
          ...(trackStatistics !== undefined && { trackStatistics })
        });
      }

      await this.liveTracker.startTrackingEvent(eventId);
      
      res.json({
        success: true,
        message: `Started tracking event ${eventId}`,
        data: {
          eventId,
          trackingStats: this.liveTracker.getTrackingStats()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Failed to start tracking',
        message: error.message
      });
    }
  }

  /**
   * POST /api/espn/tracking/stop/:eventId
   * Stop tracking live fights for an event
   */
  public async stopTracking(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = req.params;

      if (!eventId) {
        res.status(400).json({
          success: false,
          error: 'Event ID is required'
        });
        return;
      }

      this.liveTracker.stopTrackingEvent(eventId);
      
      res.json({
        success: true,
        message: `Stopped tracking event ${eventId}`,
        data: {
          eventId,
          trackingStats: this.liveTracker.getTrackingStats()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Failed to stop tracking',
        message: error.message
      });
    }
  }

  /**
   * GET /api/espn/tracking/status
   * Get tracking status and statistics
   */
  public async getTrackingStatus(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.liveTracker.getTrackingStats();
      const trackedEvents = this.liveTracker.getTrackedEvents();
      
      res.json({
        success: true,
        data: {
          stats,
          trackedEvents,
          isTracking: trackedEvents.length > 0
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Failed to get tracking status',
        message: error.message
      });
    }
  }

  /**
   * GET /api/espn/tracking/fight/:fightId
   * Get live data for a specific fight
   */
  public async getFightTrackingData(req: Request, res: Response): Promise<void> {
    try {
      const { fightId } = req.params;

      if (!fightId) {
        res.status(400).json({
          success: false,
          error: 'Fight ID is required'
        });
        return;
      }

      const fightData = this.liveTracker.getLiveFightData(fightId);
      
      if (!fightData) {
        res.status(404).json({
          success: false,
          error: 'Fight not found or not being tracked'
        });
        return;
      }

      res.json({
        success: true,
        data: fightData
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Failed to get fight tracking data',
        message: error.message
      });
    }
  }

  /**
   * POST /api/espn/tracking/poll/:eventId
   * Manually trigger a poll for an event
   */
  public async manualPoll(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = req.params;

      if (!eventId) {
        res.status(400).json({
          success: false,
          error: 'Event ID is required'
        });
        return;
      }

      const updates = await this.liveTracker.pollEventFights(eventId);
      
      res.json({
        success: true,
        data: {
          eventId,
          updates,
          updateCount: updates.length,
          timestamp: new Date()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Failed to poll event',
        message: error.message
      });
    }
  }

  /**
   * POST /api/espn/sync/full
   * Perform full sync of ESPN data (events and fighters)
   */
  public async fullSync(req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Sync events and fighters in parallel
      const [eventsResult, fightersResult] = await Promise.all([
        this.espnConnector.syncMMAEvents(),
        this.espnConnector.syncFighterRankings()
      ]);

      const totalTime = Date.now() - startTime;
      
      res.json({
        success: true,
        data: {
          events: {
            recordsProcessed: eventsResult.recordsProcessed,
            recordsSkipped: eventsResult.recordsSkipped,
            errors: eventsResult.errors
          },
          fighters: {
            recordsProcessed: fightersResult.recordsProcessed,
            recordsSkipped: fightersResult.recordsSkipped,
            errors: fightersResult.errors
          },
          totalProcessingTime: totalTime
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Failed to perform full sync',
        message: error.message
      });
    }
  }

  /**
   * GET /api/espn/events/upcoming
   * Get upcoming UFC events from local database (synced from ESPN)
   */
  public async getUpcomingEvents(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10, offset = 0 } = req.query;
      
      // Get events from the future
      const events = await this.eventRepository.search({
        dateFrom: new Date(),
        limit: Number(limit),
        offset: Number(offset)
      });

      res.json({
        success: true,
        data: {
          events,
          count: events.length,
          limit: Number(limit),
          offset: Number(offset)
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Failed to get upcoming events',
        message: error.message
      });
    }
  }

  /**
   * WebSocket endpoint setup for real-time updates
   * This would be called from the WebSocket setup
   */
  public setupWebSocketHandlers(io: any): void {
    // Set up event listeners for live tracking updates
    this.liveTracker.on('fightUpdate', (update) => {
      io.emit('fight-update', update);
    });

    this.liveTracker.on('roundChange', (update) => {
      io.emit('round-change', update);
    });

    this.liveTracker.on('statusChange', (update) => {
      io.emit('status-change', update);
    });

    this.liveTracker.on('fightEnded', (update) => {
      io.emit('fight-ended', update);
    });

    this.liveTracker.on('knockdown', (update) => {
      io.emit('knockdown', update);
    });

    this.liveTracker.on('submissionAttempt', (update) => {
      io.emit('submission-attempt', update);
    });

    this.liveTracker.on('newFightDetected', (update) => {
      io.emit('new-fight', update);
    });

    this.liveTracker.on('trackingError', (error) => {
      io.emit('tracking-error', error);
    });
  }

  /**
   * Cleanup method to be called on server shutdown
   */
  public cleanup(): void {
    this.liveTracker.destroy();
  }
}