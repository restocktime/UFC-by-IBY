import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OddsRepository } from '../odds.repository';
import { OddsSnapshot } from '@ufc-platform/shared/types/fight';
import { DatabaseManager } from '../../database';

// Mock the database manager
vi.mock('../../database');

describe('OddsRepository', () => {
  let oddsRepository: OddsRepository;
  let mockWriteApi: any;
  let mockQueryApi: any;
  let mockInfluxDB: any;
  let mockDbManager: any;

  const mockOddsSnapshot: OddsSnapshot = {
    fightId: 'fight123',
    sportsbook: 'DraftKings',
    timestamp: new Date('2023-03-04T20:00:00Z'),
    moneyline: { fighter1: -150, fighter2: +130 },
    method: { ko: +200, submission: +400, decision: -120 },
    rounds: { round1: +800, round2: +400, round3: +300 },
  };

  beforeEach(() => {
    // Mock InfluxDB APIs
    mockWriteApi = {
      writePoint: vi.fn(),
      writePoints: vi.fn(),
      flush: vi.fn(),
      close: vi.fn(),
    };

    mockQueryApi = {
      collectRows: vi.fn(),
    };

    mockInfluxDB = {
      getWriteApi: vi.fn().mockReturnValue(mockWriteApi),
      getQueryApi: vi.fn().mockReturnValue(mockQueryApi),
    };

    mockDbManager = {
      getInfluxDB: vi.fn().mockReturnValue(mockInfluxDB),
    };

    (DatabaseManager.getInstance as any).mockReturnValue(mockDbManager);

    oddsRepository = new OddsRepository();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('writeOddsSnapshot', () => {
    it('should write odds snapshot successfully', async () => {
      await oddsRepository.writeOddsSnapshot(mockOddsSnapshot);

      expect(mockWriteApi.writePoint).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'odds',
        })
      );
    });

    it('should handle write errors', async () => {
      mockWriteApi.writePoint.mockRejectedValue(new Error('Write failed'));

      await expect(oddsRepository.writeOddsSnapshot(mockOddsSnapshot))
        .rejects.toThrow('Failed to write odds snapshot');
    });
  });
});