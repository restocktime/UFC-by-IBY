import { EventEmitter } from 'events';
import { ESPNAPIConnector, LiveFightData } from '../ingestion/connectors/espn-api.connector.js';
import { FightRepository } from '../repositories/fight.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import { Fight, FightStatus } from '@ufc-platform/shared';

export interface LiveFightUpdate {
  fightId: string;
  eventId: string;
  status: FightStatus;
  currentRound?: number;
  timeRemaining?: string;
  lastUpdate: Date;
  significantChanges: string[];
}

export interface FightTrackingOptions {
  pollIntervalMs: number;
  enableNotifications: boolean;
  trackStatistics: boolean;
  autoUpdateDatabase: boolean;
}

export class LiveFightTrackerService extends EventEmitter {
  private espnConnector: ESPNAPIConnector;
  private fightRepository: FightRepository;
  private eventRepository: EventRepository;
  private trackingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastKnownStates: Map<string, LiveFightData> = new Map();
  private options: FightTrackingOptions;

  constructor(
    espnConnector?: ESPNAPIConnector,
    fightRepository?: FightRepository,
    eventRepository?: EventRepository,
    options?: Partial<FightTrackingOptions>
  ) {
    super();
    
    this.espnConnector = espnConnector || new ESPNAPIConnector();
    this.fightRepository = fightRepository || new FightRepository();
    this.eventRepository = eventRepository || new EventRepository();
    
    this.options = {
      pollIntervalMs: 10000, // 10 seconds
      enableNotifications: true,
      trackStatistics: true,
      autoUpdateDatabase: true,
      ...options
    };
  }

  /**
   * Start tracking live fights for a specific event
   */
  public async startTrackingEvent(eventId: string): Promise<void> {
    if (this.trackingIntervals.has(eventId)) {
      throw new Error(`Already tracking event: ${eventId}`);
    }

    try {
      // Initial fetch to validate event exists and has live fights
      const liveFights = await this.espnConnector.getLiveFightData(eventId);
      
      if (liveFights.length === 0) {
        this.emit('noLiveFights', { eventId });
        return;
      }

      // Store initial states
      liveFights.forEach(fight => {
        this.lastKnownStates.set(fight.fightId, fight);
      });

      // Set up polling interval
      const interval = setInterval(async () => {
        try {
          await this.pollEventFights(eventId);
        } catch (error: any) {
          this.emit('trackingError', { eventId, error: error.message });
        }
      }, this.options.pollIntervalMs);

      this.trackingIntervals.set(eventId, interval);
      
      this.emit('trackingStarted', { 
        eventId, 
        fightsCount: liveFights.length,
        pollInterval: this.options.pollIntervalMs 
      });

    } catch (error: any) {
      throw new Error(`Failed to start tracking event ${eventId}: ${error.message}`);
    }
  }

  /**
   * Stop tracking live fights for a specific event
   */
  public stopTrackingEvent(eventId: string): void {
    const interval = this.trackingIntervals.get(eventId);
    if (interval) {
      clearInterval(interval);
      this.trackingIntervals.delete(eventId);
      
      // Clean up stored states for this event
      for (const [fightId, fightData] of this.lastKnownStates.entries()) {
        if (fightData.eventId === eventId) {
          this.lastKnownStates.delete(fightId);
        }
      }
      
      this.emit('trackingStopped', { eventId });
    }
  }

  /**
   * Stop all tracking
   */
  public stopAllTracking(): void {
    for (const eventId of this.trackingIntervals.keys()) {
      this.stopTrackingEvent(eventId);
    }
  }

  /**
   * Get currently tracked events
   */
  public getTrackedEvents(): string[] {
    return Array.from(this.trackingIntervals.keys());
  }

  /**
   * Get live fight data for a specific fight
   */
  public getLiveFightData(fightId: string): LiveFightData | undefined {
    return this.lastKnownStates.get(fightId);
  }

  /**
   * Manually trigger a poll for a specific event
   */
  public async pollEventFights(eventId: string): Promise<LiveFightUpdate[]> {
    try {
      const currentFights = await this.espnConnector.getLiveFightData(eventId);
      const updates: LiveFightUpdate[] = [];

      for (const currentFight of currentFights) {
        const lastKnown = this.lastKnownStates.get(currentFight.fightId);
        
        if (!lastKnown) {
          // New fight detected
          this.lastKnownStates.set(currentFight.fightId, currentFight);
          
          const update: LiveFightUpdate = {
            fightId: currentFight.fightId,
            eventId: currentFight.eventId,
            status: currentFight.status,
            currentRound: currentFight.currentRound,
            timeRemaining: currentFight.timeRemaining,
            lastUpdate: currentFight.lastUpdate,
            significantChanges: ['fight_started']
          };
          
          updates.push(update);
          this.emit('newFightDetected', update);
          continue;
        }

        // Check for changes
        const changes = this.detectChanges(lastKnown, currentFight);
        
        if (changes.length > 0) {
          const update: LiveFightUpdate = {
            fightId: currentFight.fightId,
            eventId: currentFight.eventId,
            status: currentFight.status,
            currentRound: currentFight.currentRound,
            timeRemaining: currentFight.timeRemaining,
            lastUpdate: currentFight.lastUpdate,
            significantChanges: changes
          };
          
          updates.push(update);
          this.lastKnownStates.set(currentFight.fightId, currentFight);
          
          // Emit specific events based on changes
          this.emitChangeEvents(update, changes);
          
          // Update database if enabled
          if (this.options.autoUpdateDatabase) {
            await this.updateFightInDatabase(update);
          }
        }
      }

      // Check for fights that ended (no longer in live data)
      await this.checkForEndedFights(eventId, currentFights);

      return updates;

    } catch (error: any) {
      this.emit('pollError', { eventId, error: error.message });
      throw error;
    }
  }

  /**
   * Detect changes between two fight states
   */
  private detectChanges(previous: LiveFightData, current: LiveFightData): string[] {
    const changes: string[] = [];

    // Status change
    if (previous.status !== current.status) {
      changes.push(`status_changed_${previous.status}_to_${current.status}`);
    }

    // Round change
    if (previous.currentRound !== current.currentRound) {
      changes.push(`round_changed_${previous.currentRound}_to_${current.currentRound}`);
    }

    // Time significant change (more than 30 seconds difference)
    if (previous.timeRemaining && current.timeRemaining) {
      const prevTime = this.parseTimeToSeconds(previous.timeRemaining);
      const currTime = this.parseTimeToSeconds(current.timeRemaining);
      
      if (Math.abs(prevTime - currTime) > 30) {
        changes.push('significant_time_change');
      }
    }

    // Statistics changes (if available)
    if (this.options.trackStatistics) {
      const statsChanges = this.detectStatsChanges(previous, current);
      changes.push(...statsChanges);
    }

    return changes;
  }

  /**
   * Detect statistics changes between fight states
   */
  private detectStatsChanges(previous: LiveFightData, current: LiveFightData): string[] {
    const changes: string[] = [];

    // Check fighter 1 stats
    if (previous.fighter1Stats && current.fighter1Stats) {
      if (previous.fighter1Stats.knockdowns !== current.fighter1Stats.knockdowns) {
        changes.push('fighter1_knockdown');
      }
      
      if (previous.fighter1Stats.submissionAttempts !== current.fighter1Stats.submissionAttempts) {
        changes.push('fighter1_submission_attempt');
      }
    }

    // Check fighter 2 stats
    if (previous.fighter2Stats && current.fighter2Stats) {
      if (previous.fighter2Stats.knockdowns !== current.fighter2Stats.knockdowns) {
        changes.push('fighter2_knockdown');
      }
      
      if (previous.fighter2Stats.submissionAttempts !== current.fighter2Stats.submissionAttempts) {
        changes.push('fighter2_submission_attempt');
      }
    }

    return changes;
  }

  /**
   * Emit specific events based on detected changes
   */
  private emitChangeEvents(update: LiveFightUpdate, changes: string[]): void {
    // General update event
    this.emit('fightUpdate', update);

    // Specific change events
    changes.forEach(change => {
      if (change.includes('status_changed')) {
        this.emit('statusChange', update);
      } else if (change.includes('round_changed')) {
        this.emit('roundChange', update);
      } else if (change.includes('knockdown')) {
        this.emit('knockdown', update);
      } else if (change.includes('submission_attempt')) {
        this.emit('submissionAttempt', update);
      }
    });

    // Fight ending events
    if (update.status === 'completed') {
      this.emit('fightEnded', update);
    }
  }

  /**
   * Check for fights that are no longer in the live data (ended)
   */
  private async checkForEndedFights(eventId: string, currentFights: LiveFightData[]): Promise<void> {
    const currentFightIds = new Set(currentFights.map(f => f.fightId));
    
    for (const [fightId, fightData] of this.lastKnownStates.entries()) {
      if (fightData.eventId === eventId && !currentFightIds.has(fightId)) {
        // Fight is no longer in live data - likely ended
        const endedUpdate: LiveFightUpdate = {
          fightId,
          eventId,
          status: 'completed',
          lastUpdate: new Date(),
          significantChanges: ['fight_ended']
        };

        this.emit('fightEnded', endedUpdate);
        
        if (this.options.autoUpdateDatabase) {
          await this.updateFightInDatabase(endedUpdate);
        }
        
        // Remove from tracking
        this.lastKnownStates.delete(fightId);
      }
    }
  }

  /**
   * Update fight information in the database
   */
  private async updateFightInDatabase(update: LiveFightUpdate): Promise<void> {
    try {
      // Find the fight in the database
      const fights = await this.fightRepository.search({
        eventId: update.eventId,
        limit: 100
      });

      // Match by ESPN fight ID (stored in fight ID or external reference)
      const fight = fights.find(f => 
        f.id.includes(update.fightId) || 
        f.id === update.fightId
      );

      if (fight) {
        const updateData: Partial<Fight> = {
          status: update.status
        };

        // If fight is completed, we might want to fetch final result
        if (update.status === 'completed') {
          // Additional logic to fetch and store fight result
          // This would require additional ESPN API calls
        }

        await this.fightRepository.update(fight.id, updateData);
        
        this.emit('databaseUpdated', { 
          fightId: fight.id, 
          update: updateData 
        });
      }

    } catch (error: any) {
      this.emit('databaseUpdateError', { 
        fightId: update.fightId, 
        error: error.message 
      });
    }
  }

  /**
   * Parse time string (MM:SS) to seconds
   */
  private parseTimeToSeconds(timeString: string): number {
    const [minutes, seconds] = timeString.split(':').map(Number);
    return (minutes * 60) + seconds;
  }

  /**
   * Get tracking statistics
   */
  public getTrackingStats(): {
    trackedEvents: number;
    trackedFights: number;
    pollInterval: number;
    uptime: number;
  } {
    return {
      trackedEvents: this.trackingIntervals.size,
      trackedFights: this.lastKnownStates.size,
      pollInterval: this.options.pollIntervalMs,
      uptime: process.uptime()
    };
  }

  /**
   * Update tracking options
   */
  public updateOptions(newOptions: Partial<FightTrackingOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    // If poll interval changed, restart all tracking with new interval
    if (newOptions.pollIntervalMs) {
      const trackedEvents = this.getTrackedEvents();
      this.stopAllTracking();
      
      // Restart tracking with new interval
      setTimeout(() => {
        trackedEvents.forEach(eventId => {
          this.startTrackingEvent(eventId).catch(error => {
            this.emit('restartError', { eventId, error: error.message });
          });
        });
      }, 1000);
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopAllTracking();
    this.removeAllListeners();
  }
}