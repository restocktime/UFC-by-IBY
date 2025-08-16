/**
 * OddsMovementDetector - Detects significant odds movements and triggers alerts
 */

import { EventEmitter } from 'events';
import { NotificationEvent, MovementType } from '@ufc-platform/shared';

export interface OddsSnapshot {
  fightId: string;
  sportsbook: string;
  timestamp: Date;
  moneyline: { fighter1: number; fighter2: number };
  method?: MethodOdds;
  rounds?: RoundOdds;
}

export interface MethodOdds {
  ko: { fighter1: number; fighter2: number };
  submission: { fighter1: number; fighter2: number };
  decision: { fighter1: number; fighter2: number };
}

export interface RoundOdds {
  under2_5: number;
  over2_5: number;
  under3_5: number;
  over3_5: number;
}

export interface MovementThresholds {
  significantPercentage: number;
  reversePercentage: number;
  steamPercentage: number;
  minimumTimeBetweenAlerts: number; // minutes
  minimumOddsValue: number;
}

export interface OddsMovement {
  fightId: string;
  sportsbook: string;
  movementType: MovementType;
  oldOdds: OddsSnapshot;
  newOdds: OddsSnapshot;
  percentageChange: {
    fighter1: number;
    fighter2: number;
  };
  impliedProbabilityChange: {
    fighter1: number;
    fighter2: number;
  };
  detectedAt: Date;
}

export interface OddsMovementDetectorConfig {
  thresholds: MovementThresholds;
  enabledSportsbooks: string[];
  enableRealTimeDetection: boolean;
  batchProcessingInterval: number; // milliseconds
}

export class OddsMovementDetector extends EventEmitter {
  private config: OddsMovementDetectorConfig;
  private oddsHistory = new Map<string, OddsSnapshot[]>(); // fightId -> snapshots
  private lastAlertTime = new Map<string, Date>(); // fightId -> last alert time
  private processingQueue: OddsSnapshot[] = [];
  private isProcessing = false;

  constructor(config: OddsMovementDetectorConfig) {
    super();
    this.config = config;
    
    if (config.enableRealTimeDetection) {
      this.startBatchProcessing();
    }
  }

  /**
   * Add new odds snapshot for analysis
   */
  async addOddsSnapshot(snapshot: OddsSnapshot): Promise<void> {
    // Validate snapshot
    if (!this.isValidSnapshot(snapshot)) {
      throw new Error('Invalid odds snapshot');
    }

    // Add to processing queue
    this.processingQueue.push(snapshot);

    // Process immediately if real-time detection is disabled
    if (!this.config.enableRealTimeDetection) {
      await this.processSnapshot(snapshot);
    }
  }

  /**
   * Process a single odds snapshot
   */
  private async processSnapshot(snapshot: OddsSnapshot): Promise<void> {
    const fightKey = `${snapshot.fightId}-${snapshot.sportsbook}`;
    
    // Get previous snapshots for this fight/sportsbook
    const history = this.oddsHistory.get(fightKey) || [];
    
    if (history.length === 0) {
      // First snapshot, just store it
      this.oddsHistory.set(fightKey, [snapshot]);
      return;
    }

    // Get the most recent previous snapshot
    const previousSnapshot = history[history.length - 1];
    
    // Detect movement
    const movement = this.detectMovement(previousSnapshot, snapshot);
    
    if (movement) {
      // Check if we should send alert (rate limiting)
      if (this.shouldSendAlert(snapshot.fightId)) {
        await this.triggerAlert(movement);
        this.lastAlertTime.set(snapshot.fightId, new Date());
      }
    }

    // Store the new snapshot
    history.push(snapshot);
    
    // Keep only recent history (last 100 snapshots)
    if (history.length > 100) {
      history.shift();
    }
    
    this.oddsHistory.set(fightKey, history);
  }

  /**
   * Detect odds movement between two snapshots
   */
  private detectMovement(oldSnapshot: OddsSnapshot, newSnapshot: OddsSnapshot): OddsMovement | null {
    // Calculate percentage changes
    const fighter1Change = this.calculatePercentageChange(
      oldSnapshot.moneyline.fighter1,
      newSnapshot.moneyline.fighter1
    );
    
    const fighter2Change = this.calculatePercentageChange(
      oldSnapshot.moneyline.fighter2,
      newSnapshot.moneyline.fighter2
    );

    // Calculate implied probability changes
    const oldProb1 = this.oddsToImpliedProbability(oldSnapshot.moneyline.fighter1);
    const newProb1 = this.oddsToImpliedProbability(newSnapshot.moneyline.fighter1);
    const oldProb2 = this.oddsToImpliedProbability(oldSnapshot.moneyline.fighter2);
    const newProb2 = this.oddsToImpliedProbability(newSnapshot.moneyline.fighter2);

    const probChange1 = newProb1 - oldProb1;
    const probChange2 = newProb2 - oldProb2;

    // Determine movement type
    const maxChange = Math.max(Math.abs(fighter1Change), Math.abs(fighter2Change));
    let movementType: MovementType | null = null;

    if (maxChange >= this.config.thresholds.steamPercentage) {
      movementType = 'steam';
    } else if (maxChange >= this.config.thresholds.reversePercentage) {
      // Check if it's a reverse (odds moved opposite to expected direction)
      movementType = 'reverse';
    } else if (maxChange >= this.config.thresholds.significantPercentage) {
      movementType = 'significant';
    }

    if (!movementType) {
      return null;
    }

    return {
      fightId: newSnapshot.fightId,
      sportsbook: newSnapshot.sportsbook,
      movementType,
      oldOdds: oldSnapshot,
      newOdds: newSnapshot,
      percentageChange: {
        fighter1: fighter1Change,
        fighter2: fighter2Change
      },
      impliedProbabilityChange: {
        fighter1: probChange1,
        fighter2: probChange2
      },
      detectedAt: new Date()
    };
  }

  /**
   * Calculate percentage change between two odds values
   */
  private calculatePercentageChange(oldOdds: number, newOdds: number): number {
    if (oldOdds === 0) return 0;
    
    // For negative odds, moving from -150 to -180 is an increase in implied probability
    // We want to calculate the percentage change in the absolute value
    const oldAbs = Math.abs(oldOdds);
    const newAbs = Math.abs(newOdds);
    
    return ((newAbs - oldAbs) / oldAbs) * 100;
  }

  /**
   * Convert odds to implied probability
   */
  private oddsToImpliedProbability(odds: number): number {
    if (odds > 0) {
      return 100 / (odds + 100);
    } else {
      return Math.abs(odds) / (Math.abs(odds) + 100);
    }
  }

  /**
   * Check if we should send alert (rate limiting)
   */
  private shouldSendAlert(fightId: string): boolean {
    const lastAlert = this.lastAlertTime.get(fightId);
    if (!lastAlert) return true;

    const timeSinceLastAlert = Date.now() - lastAlert.getTime();
    const minimumInterval = this.config.thresholds.minimumTimeBetweenAlerts * 60 * 1000;
    
    return timeSinceLastAlert >= minimumInterval;
  }

  /**
   * Trigger odds movement alert
   */
  private async triggerAlert(movement: OddsMovement): Promise<void> {
    const alertEvent: NotificationEvent = {
      id: `odds-movement-${movement.fightId}-${Date.now()}`,
      type: 'odds_movement',
      fightId: movement.fightId,
      data: {
        movementType: movement.movementType,
        sportsbook: movement.sportsbook,
        oldOdds: movement.oldOdds.moneyline,
        newOdds: movement.newOdds.moneyline,
        percentageChange: movement.percentageChange,
        impliedProbabilityChange: movement.impliedProbabilityChange,
        detectedAt: movement.detectedAt.toISOString()
      },
      priority: this.getAlertPriority(movement.movementType),
      timestamp: new Date()
    };

    this.emit('oddsMovementDetected', movement);
    this.emit('alertTriggered', alertEvent);
  }

  /**
   * Get alert priority based on movement type
   */
  private getAlertPriority(movementType: MovementType): 'low' | 'medium' | 'high' | 'urgent' {
    switch (movementType) {
      case 'steam':
        return 'urgent';
      case 'reverse':
        return 'high';
      case 'significant':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Validate odds snapshot
   */
  private isValidSnapshot(snapshot: OddsSnapshot): boolean {
    if (!snapshot.fightId || !snapshot.sportsbook || !snapshot.timestamp) {
      return false;
    }

    if (!snapshot.moneyline || 
        typeof snapshot.moneyline.fighter1 !== 'number' || 
        typeof snapshot.moneyline.fighter2 !== 'number') {
      return false;
    }

    // Check minimum odds values
    if (Math.abs(snapshot.moneyline.fighter1) < this.config.thresholds.minimumOddsValue ||
        Math.abs(snapshot.moneyline.fighter2) < this.config.thresholds.minimumOddsValue) {
      return false;
    }

    return true;
  }

  /**
   * Start batch processing for real-time detection
   */
  private startBatchProcessing(): void {
    setInterval(async () => {
      if (this.processingQueue.length > 0 && !this.isProcessing) {
        this.isProcessing = true;
        
        try {
          const batch = this.processingQueue.splice(0, 10); // Process up to 10 at a time
          
          for (const snapshot of batch) {
            await this.processSnapshot(snapshot);
          }
        } catch (error) {
          this.emit('processingError', error);
        } finally {
          this.isProcessing = false;
        }
      }
    }, this.config.batchProcessingInterval);
  }

  /**
   * Get odds history for a fight
   */
  getOddsHistory(fightId: string, sportsbook?: string): OddsSnapshot[] {
    if (sportsbook) {
      const key = `${fightId}-${sportsbook}`;
      return this.oddsHistory.get(key) || [];
    }

    // Return all history for the fight across all sportsbooks
    const allHistory: OddsSnapshot[] = [];
    for (const [key, history] of this.oddsHistory) {
      if (key.startsWith(fightId)) {
        allHistory.push(...history);
      }
    }

    return allHistory.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get recent movements for a fight
   */
  getRecentMovements(fightId: string, hours: number = 24): OddsMovement[] {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const movements: OddsMovement[] = [];

    for (const [key, history] of this.oddsHistory) {
      if (!key.startsWith(fightId)) continue;

      for (let i = 1; i < history.length; i++) {
        // Check if the newer snapshot is within the time window
        if (history[i].timestamp >= cutoffTime) {
          const movement = this.detectMovement(history[i - 1], history[i]);
          if (movement) {
            movements.push(movement);
          }
        }
      }
    }

    return movements.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  }

  /**
   * Update detection thresholds
   */
  updateThresholds(thresholds: Partial<MovementThresholds>): void {
    this.config.thresholds = { ...this.config.thresholds, ...thresholds };
    this.emit('thresholdsUpdated', this.config.thresholds);
  }

  /**
   * Get detection statistics
   */
  getDetectionStats(): {
    totalSnapshots: number;
    totalMovements: number;
    movementsByType: Record<MovementType, number>;
    averageProcessingTime: number;
  } {
    let totalSnapshots = 0;
    let totalMovements = 0;
    const movementsByType: Record<string, number> = {
      significant: 0,
      reverse: 0,
      steam: 0
    };

    for (const history of this.oddsHistory.values()) {
      totalSnapshots += history.length;
      
      for (let i = 1; i < history.length; i++) {
        const movement = this.detectMovement(history[i - 1], history[i]);
        if (movement) {
          totalMovements++;
          movementsByType[movement.movementType]++;
        }
      }
    }

    return {
      totalSnapshots,
      totalMovements,
      movementsByType: movementsByType as Record<MovementType, number>,
      averageProcessingTime: 0 // Would track this in real implementation
    };
  }

  /**
   * Clear odds history
   */
  clearHistory(): void {
    this.oddsHistory.clear();
    this.lastAlertTime.clear();
    this.processingQueue = [];
    this.emit('historyCleared');
  }
}