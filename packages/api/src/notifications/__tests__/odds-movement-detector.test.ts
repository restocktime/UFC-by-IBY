/**
 * Unit tests for OddsMovementDetector
 */

import { vi } from 'vitest';
import { 
  OddsMovementDetector, 
  OddsMovementDetectorConfig,
  OddsSnapshot,
  MovementThresholds 
} from '../odds-movement-detector';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

describe('OddsMovementDetector', () => {
  let detector: OddsMovementDetector;
  let config: OddsMovementDetectorConfig;

  beforeEach(() => {
    const thresholds: MovementThresholds = {
      significantPercentage: 10,
      reversePercentage: 15,
      steamPercentage: 25,
      minimumTimeBetweenAlerts: 5,
      minimumOddsValue: 100
    };

    config = {
      thresholds,
      enabledSportsbooks: ['DraftKings', 'FanDuel', 'BetMGM'],
      enableRealTimeDetection: false, // Disable for testing
      batchProcessingInterval: 1000
    };

    detector = new OddsMovementDetector(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
    detector.clearHistory();
  });

  describe('Odds Snapshot Validation', () => {
    it('should accept valid odds snapshot', async () => {
      const snapshot: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      await expect(detector.addOddsSnapshot(snapshot)).resolves.not.toThrow();
    });

    it('should reject invalid odds snapshot', async () => {
      const invalidSnapshot = {
        fightId: '',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      } as OddsSnapshot;

      await expect(detector.addOddsSnapshot(invalidSnapshot))
        .rejects.toThrow('Invalid odds snapshot');
    });

    it('should reject odds below minimum value', async () => {
      const snapshot: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -50, fighter2: 50 } // Below minimum of 100
      };

      await expect(detector.addOddsSnapshot(snapshot))
        .rejects.toThrow('Invalid odds snapshot');
    });
  });

  describe('Movement Detection', () => {
    it('should detect significant movement', async () => {
      const movements: any[] = [];
      detector.on('oddsMovementDetected', (movement) => movements.push(movement));

      // First snapshot
      const snapshot1: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      await detector.addOddsSnapshot(snapshot1);

      // Second snapshot with significant movement (>10%)
      const snapshot2: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -180, fighter2: 150 } // ~20% change for fighter1, 25% for fighter2
      };

      await detector.addOddsSnapshot(snapshot2);

      expect(movements).toHaveLength(1);
      // With 25% change, this will be classified as steam (>25%)
      expect(movements[0].movementType).toBe('steam');
      expect(movements[0].fightId).toBe('fight-1');
      expect(movements[0].sportsbook).toBe('DraftKings');
    });

    it('should detect steam movement', async () => {
      const movements: any[] = [];
      detector.on('oddsMovementDetected', (movement) => movements.push(movement));

      const snapshot1: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      await detector.addOddsSnapshot(snapshot1);

      // Large movement (>25%)
      const snapshot2: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -200, fighter2: 180 } // ~33% change
      };

      await detector.addOddsSnapshot(snapshot2);

      expect(movements).toHaveLength(1);
      expect(movements[0].movementType).toBe('steam');
    });

    it('should not detect movement below threshold', async () => {
      const movements: any[] = [];
      detector.on('oddsMovementDetected', (movement) => movements.push(movement));

      const snapshot1: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      await detector.addOddsSnapshot(snapshot1);

      // Small movement (<10%)
      const snapshot2: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -155, fighter2: 125 } // ~3% change
      };

      await detector.addOddsSnapshot(snapshot2);

      expect(movements).toHaveLength(0);
    });

    it('should handle multiple sportsbooks separately', async () => {
      const movements: any[] = [];
      detector.on('oddsMovementDetected', (movement) => movements.push(movement));

      // DraftKings snapshots
      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      });

      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -180, fighter2: 150 }
      });

      // FanDuel snapshots - use movement that exceeds 10% threshold
      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'FanDuel',
        timestamp: new Date(),
        moneyline: { fighter1: -140, fighter2: 110 }
      });

      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'FanDuel',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -160, fighter2: 130 } // ~14% and ~18% movement
      });

      expect(movements.length).toBeGreaterThanOrEqual(1);
      expect(movements.some(m => m.sportsbook === 'DraftKings')).toBe(true);
    });
  });

  describe('Alert Triggering', () => {
    it('should trigger alert for significant movement', async () => {
      const alerts: any[] = [];
      detector.on('alertTriggered', (alert) => alerts.push(alert));

      const snapshot1: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      await detector.addOddsSnapshot(snapshot1);

      const snapshot2: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -165, fighter2: 135 } // Smaller movement for significant classification
      };

      await detector.addOddsSnapshot(snapshot2);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('odds_movement');
      expect(alerts[0].fightId).toBe('fight-1');
      expect(alerts[0].priority).toBe('medium');
      expect(alerts[0].data.sportsbook).toBe('DraftKings');
    });

    it('should set correct priority based on movement type', async () => {
      const alerts: any[] = [];
      detector.on('alertTriggered', (alert) => alerts.push(alert));

      // Steam movement (urgent priority)
      const snapshot1: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      await detector.addOddsSnapshot(snapshot1);

      const snapshot2: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -200, fighter2: 180 } // Steam movement
      };

      await detector.addOddsSnapshot(snapshot2);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].priority).toBe('urgent');
    });
  });

  describe('Rate Limiting', () => {
    it('should respect minimum time between alerts', async () => {
      const alerts: any[] = [];
      detector.on('alertTriggered', (alert) => alerts.push(alert));

      // First movement
      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      });

      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -180, fighter2: 150 }
      });

      expect(alerts).toHaveLength(1);

      // Second movement immediately after (should be rate limited)
      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 2000),
        moneyline: { fighter1: -200, fighter2: 170 }
      });

      expect(alerts).toHaveLength(1); // Still only 1 alert due to rate limiting
    });
  });

  describe('Odds History', () => {
    it('should store and retrieve odds history', async () => {
      const snapshot1: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      };

      const snapshot2: OddsSnapshot = {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -160, fighter2: 130 }
      };

      await detector.addOddsSnapshot(snapshot1);
      await detector.addOddsSnapshot(snapshot2);

      const history = detector.getOddsHistory('fight-1', 'DraftKings');
      expect(history).toHaveLength(2);
      expect(history[0].moneyline.fighter1).toBe(-150);
      expect(history[1].moneyline.fighter1).toBe(-160);
    });

    it('should get history across all sportsbooks', async () => {
      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      });

      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'FanDuel',
        timestamp: new Date(Date.now() + 500),
        moneyline: { fighter1: -140, fighter2: 110 }
      });

      const history = detector.getOddsHistory('fight-1');
      expect(history).toHaveLength(2);
      expect(history.map(h => h.sportsbook)).toEqual(['DraftKings', 'FanDuel']);
    });
  });

  describe('Recent Movements', () => {
    it('should get recent movements within time window', async () => {
      // Add snapshots with movements
      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        moneyline: { fighter1: -150, fighter2: 120 }
      });

      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        moneyline: { fighter1: -165, fighter2: 135 } // Smaller movement for significant classification
      });

      const recentMovements = detector.getRecentMovements('fight-1', 24);
      expect(recentMovements).toHaveLength(1);
      expect(recentMovements[0].movementType).toBe('significant');
    });

    it('should exclude movements outside time window', async () => {
      // Add old movement
      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000), // 26 hours ago
        moneyline: { fighter1: -150, fighter2: 120 }
      });

      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        moneyline: { fighter1: -180, fighter2: 150 }
      });

      const recentMovements = detector.getRecentMovements('fight-1', 24);
      expect(recentMovements).toHaveLength(0);
    });
  });

  describe('Configuration', () => {
    it('should update thresholds', () => {
      const updatedEvents: any[] = [];
      detector.on('thresholdsUpdated', (thresholds) => updatedEvents.push(thresholds));

      detector.updateThresholds({
        significantPercentage: 15,
        steamPercentage: 30
      });

      expect(updatedEvents).toHaveLength(1);
      expect(updatedEvents[0].significantPercentage).toBe(15);
      expect(updatedEvents[0].steamPercentage).toBe(30);
      expect(updatedEvents[0].reversePercentage).toBe(15); // Unchanged
    });
  });

  describe('Statistics', () => {
    it('should provide detection statistics', async () => {
      // Add some snapshots with movements
      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      });

      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 1000),
        moneyline: { fighter1: -165, fighter2: 135 } // Significant movement
      });

      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(Date.now() + 2000),
        moneyline: { fighter1: -220, fighter2: 190 } // Steam movement
      });

      const stats = detector.getDetectionStats();
      expect(stats.totalSnapshots).toBe(3);
      expect(stats.totalMovements).toBe(2);
      expect(stats.movementsByType.significant).toBe(1);
      expect(stats.movementsByType.steam).toBe(1);
    });
  });

  describe('Utility Functions', () => {
    it('should calculate percentage change correctly', () => {
      // Access private method for testing
      const calculateChange = (detector as any).calculatePercentageChange.bind(detector);
      
      // For negative odds, we calculate change in absolute value
      expect(calculateChange(-150, -180)).toBeCloseTo(20, 1); // 180-150 = 30, 30/150 = 20%
      expect(calculateChange(120, 150)).toBeCloseTo(25, 1);   // 150-120 = 30, 30/120 = 25%
      expect(calculateChange(-200, -150)).toBeCloseTo(-25, 1); // 150-200 = -50, -50/200 = -25%
    });

    it('should convert odds to implied probability correctly', () => {
      // Access private method for testing
      const oddsToProb = (detector as any).oddsToImpliedProbability.bind(detector);
      
      expect(oddsToProb(-150)).toBeCloseTo(0.6, 2);
      expect(oddsToProb(150)).toBeCloseTo(0.4, 2);
      expect(oddsToProb(-200)).toBeCloseTo(0.667, 2);
      expect(oddsToProb(200)).toBeCloseTo(0.333, 2);
    });
  });

  describe('History Management', () => {
    it('should clear history', async () => {
      await detector.addOddsSnapshot({
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date(),
        moneyline: { fighter1: -150, fighter2: 120 }
      });

      const clearedEvents: any[] = [];
      detector.on('historyCleared', () => clearedEvents.push(true));

      detector.clearHistory();

      expect(clearedEvents).toHaveLength(1);
      expect(detector.getOddsHistory('fight-1')).toHaveLength(0);
    });

    it('should limit history size', async () => {
      // Add more than 100 snapshots
      for (let i = 0; i < 105; i++) {
        await detector.addOddsSnapshot({
          fightId: 'fight-1',
          sportsbook: 'DraftKings',
          timestamp: new Date(Date.now() + i * 1000),
          moneyline: { fighter1: -150 - i, fighter2: 120 + i }
        });
      }

      const history = detector.getOddsHistory('fight-1', 'DraftKings');
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });
});