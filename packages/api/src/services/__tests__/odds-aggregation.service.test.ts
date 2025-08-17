import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { OddsAggregationService, AggregationConfig, MarketAnalysis } from '../odds-aggregation.service.js';
import { OddsAPIConnector } from '../../ingestion/connectors/odds-api.connector.js';
import { OddsRepository } from '../../repositories/odds.repository.js';

// Mock dependencies
vi.mock('../../ingestion/connectors/odds-api.connector.js');
vi.mock('../../repositories/odds.repository.js');
vi.mock('../../database/manager.js', () => ({
  DatabaseManager: {
    getInstance: vi.fn(() => ({
      getInfluxDB: vi.fn()
    }))
  }
}));

describe('OddsAggregationService', () => {
  let service: OddsAggregationService;
  let mockOddsConnector: any;
  let mockOddsRepository: any;

  const mockConfig: Partial<AggregationConfig> = {
    updateInterval: 1, // 1 minute for testing
    enableRealTimeUpdates: false, // Disable for testing
    prioritySportsbooks: ['draftkings', 'fanduel', 'hardrockbet'],
    minSportsbooksRequired: 2,
    arbitrageThreshold: 2.0
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock OddsAPIConnector
    mockOddsConnector = {
      getAvailableSportsbooks: vi.fn(),
      syncMultiSportsbookOdds: vi.fn(),
      setSportsbookFilter: vi.fn(),
      on: vi.fn(),
      emit: vi.fn()
    };

    // Mock OddsRepository
    mockOddsRepository = {
      getLatestOdds: vi.fn(),
      getArbitrageOpportunities: vi.fn()
    };

    // Mock constructors
    (OddsAPIConnector as any).mockImplementation(() => mockOddsConnector);
    (OddsRepository as any).mockImplementation(() => mockOddsRepository);

    service = new OddsAggregationService(mockConfig);
  });

  afterEach(async () => {
    await service.stopAggregation();
  });

  describe('Service Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultService = new OddsAggregationService();
      expect(defaultService).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      expect(service).toBeDefined();
      expect(mockOddsConnector.setSportsbookFilter).toHaveBeenCalledWith({
        prioritySportsbooks: mockConfig.prioritySportsbooks
      });
    });

    it('should set up event listeners', () => {
      expect(mockOddsConnector.on).toHaveBeenCalledWith('eventProcessed', expect.any(Function));
      expect(mockOddsConnector.on).toHaveBeenCalledWith('arbitrageDetected', expect.any(Function));
      expect(mockOddsConnector.on).toHaveBeenCalledWith('oddsMovement', expect.any(Function));
    });
  });

  describe('Full Sync Operations', () => {
    it('should perform full sync successfully', async () => {
      const mockSportsbooks = ['draftkings', 'fanduel', 'betmgm', 'hardrockbet'];
      const mockSyncResult = {
        recordsProcessed: 25,
        recordsSkipped: 2,
        errors: [],
        processingTimeMs: 1500
      };

      mockOddsConnector.getAvailableSportsbooks.mockResolvedValue(mockSportsbooks);
      mockOddsConnector.syncMultiSportsbookOdds.mockResolvedValue(mockSyncResult);

      const eventSpy = vi.fn();
      service.on('fullSyncCompleted', eventSpy);

      await service.performFullSync();

      expect(mockOddsConnector.getAvailableSportsbooks).toHaveBeenCalled();
      expect(mockOddsConnector.syncMultiSportsbookOdds).toHaveBeenCalled();
      expect(eventSpy).toHaveBeenCalledWith({
        result: mockSyncResult,
        sportsbooksCount: mockSportsbooks.length,
        timestamp: expect.any(Date)
      });
    });

    it('should handle sync errors gracefully', async () => {
      const error = new Error('API rate limit exceeded');
      mockOddsConnector.getAvailableSportsbooks.mockRejectedValue(error);

      const errorSpy = vi.fn();
      service.on('syncError', errorSpy);

      await expect(service.performFullSync()).rejects.toThrow('API rate limit exceeded');
      expect(errorSpy).toHaveBeenCalledWith({ error: error.message });
    });
  });

  describe('Specific Fight Sync', () => {
    it('should sync odds for specific fight', async () => {
      const fightId = 'ufc319_jones_vs_miocic';
      const mockAnalysis: MarketAnalysis = {
        fightId,
        totalSportsbooks: 4,
        marketDepth: {
          moneyline: 4,
          method: 3,
          rounds: 2
        },
        consensus: {
          fighter1Probability: 0.65,
          fighter2Probability: 0.35,
          confidence: 0.85
        },
        bestOdds: {
          fighter1: { odds: -150, sportsbook: 'DraftKings' },
          fighter2: { odds: +180, sportsbook: 'Hard Rock Bet' }
        },
        arbitrageOpportunities: 1,
        marketEfficiency: 0.78
      };

      const mockOddsData = [
        {
          sportsbook: 'DraftKings',
          odds: { moneyline: [-150, +130], method: { ko: 200, submission: 300, decision: 150 }, rounds: { round1: 400, round2: 350, round3: 300 } },
          impliedProbability: [0.6, 0.43]
        },
        {
          sportsbook: 'FanDuel',
          odds: { moneyline: [-140, +120], method: { ko: 180, submission: 280, decision: 140 }, rounds: { round1: 380, round2: 330, round3: 280 } },
          impliedProbability: [0.58, 0.45]
        },
        {
          sportsbook: 'Hard Rock Bet',
          odds: { moneyline: [-160, +180], method: { ko: 220, submission: 320, decision: 160 }, rounds: { round1: 420, round2: 370, round3: 320 } },
          impliedProbability: [0.62, 0.36]
        }
      ];

      mockOddsConnector.syncMultiSportsbookOdds.mockResolvedValue({ recordsProcessed: 3, recordsSkipped: 0, errors: [] });
      mockOddsRepository.getLatestOdds.mockResolvedValue(mockOddsData);
      mockOddsRepository.getArbitrageOpportunities.mockResolvedValue([
        { fightId, profit: 2.5, expiresAt: new Date(Date.now() + 3600000) }
      ]);

      const eventSpy = vi.fn();
      service.on('fightSyncCompleted', eventSpy);

      const result = await service.syncSpecificFight(fightId);

      expect(mockOddsConnector.syncMultiSportsbookOdds).toHaveBeenCalledWith(fightId);
      expect(mockOddsRepository.getLatestOdds).toHaveBeenCalledWith(fightId);
      expect(result.fightId).toBe(fightId);
      expect(result.totalSportsbooks).toBe(3);
      expect(result.consensus.fighter1Probability).toBeCloseTo(0.6, 1);
      expect(eventSpy).toHaveBeenCalled();
    });

    it('should throw error when no odds found for fight', async () => {
      const fightId = 'nonexistent_fight';
      mockOddsConnector.syncMultiSportsbookOdds.mockResolvedValue({ recordsProcessed: 0, recordsSkipped: 0, errors: [] });
      mockOddsRepository.getLatestOdds.mockResolvedValue([]);

      await expect(service.generateMarketAnalysis(fightId)).rejects.toThrow(`No odds found for fight: ${fightId}`);
    });
  });

  describe('Market Analysis', () => {
    it('should generate comprehensive market analysis', async () => {
      const fightId = 'test_fight';
      const mockOddsData = [
        {
          sportsbook: 'DraftKings',
          odds: { 
            moneyline: [-150, +130], 
            method: { ko: 200, submission: 300, decision: 150 }, 
            rounds: { round1: 400, round2: 350, round3: 300 } 
          },
          impliedProbability: [0.6, 0.43]
        },
        {
          sportsbook: 'FanDuel',
          odds: { 
            moneyline: [-140, +120], 
            method: { ko: 180, submission: 280, decision: 140 }, 
            rounds: { round1: 380, round2: 330, round3: 280 } 
          },
          impliedProbability: [0.58, 0.45]
        },
        {
          sportsbook: 'Hard Rock Bet',
          odds: { 
            moneyline: [-160, +140], 
            method: { ko: 220, submission: 320, decision: 160 }, 
            rounds: { round1: 420, round2: 370, round3: 320 } 
          },
          impliedProbability: [0.62, 0.42]
        }
      ];

      mockOddsRepository.getLatestOdds.mockResolvedValue(mockOddsData);
      mockOddsRepository.getArbitrageOpportunities.mockResolvedValue([
        { fightId, profit: 2.5, expiresAt: new Date(Date.now() + 3600000) }
      ]);

      const analysis = await service.generateMarketAnalysis(fightId);

      expect(analysis.fightId).toBe(fightId);
      expect(analysis.totalSportsbooks).toBe(3);
      expect(analysis.marketDepth.moneyline).toBe(3);
      expect(analysis.marketDepth.method).toBe(3);
      expect(analysis.marketDepth.rounds).toBe(3);
      expect(analysis.consensus.fighter1Probability).toBeCloseTo(0.6, 1);
      expect(analysis.consensus.fighter2Probability).toBeCloseTo(0.43, 1);
      expect(analysis.bestOdds.fighter1.odds).toBe(-140); // Best odds for fighter 1
      expect(analysis.bestOdds.fighter2.odds).toBe(140); // Best odds for fighter 2
      expect(analysis.arbitrageOpportunities).toBe(1);
      expect(analysis.marketEfficiency).toBeGreaterThan(0);
    });

    it('should handle empty odds data', async () => {
      const fightId = 'empty_fight';
      mockOddsRepository.getLatestOdds.mockResolvedValue([]);

      await expect(service.generateMarketAnalysis(fightId)).rejects.toThrow(`No odds found for fight: ${fightId}`);
    });
  });

  describe('Arbitrage Opportunities', () => {
    it('should fetch active arbitrage opportunities', async () => {
      const mockOpportunities = [
        {
          fightId: 'fight1',
          profit: 3.2,
          sportsbooks: ['DraftKings', 'Hard Rock Bet'],
          expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
        },
        {
          fightId: 'fight2',
          profit: 2.8,
          sportsbooks: ['FanDuel', 'BetMGM'],
          expiresAt: new Date(Date.now() + 1800000) // 30 minutes from now
        },
        {
          fightId: 'fight3',
          profit: 4.1,
          sportsbooks: ['Caesars', 'Hard Rock Bet'],
          expiresAt: new Date(Date.now() - 600000) // Expired (10 minutes ago)
        }
      ];

      mockOddsRepository.getArbitrageOpportunities.mockResolvedValue(mockOpportunities);

      const opportunities = await service.getArbitrageOpportunities(2.5);

      expect(mockOddsRepository.getArbitrageOpportunities).toHaveBeenCalledWith(undefined, 2.5);
      expect(opportunities).toHaveLength(2); // Should exclude expired opportunity
      expect(opportunities[0].profit).toBe(3.2);
      expect(opportunities[1].profit).toBe(2.8);
    });

    it('should handle repository errors gracefully', async () => {
      mockOddsRepository.getArbitrageOpportunities.mockRejectedValue(new Error('Database error'));

      const opportunities = await service.getArbitrageOpportunities();

      expect(opportunities).toEqual([]);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const newConfig = {
        arbitrageThreshold: 1.0,
        prioritySportsbooks: ['draftkings', 'fanduel']
      };

      const eventSpy = vi.fn();
      service.on('configurationUpdated', eventSpy);

      service.updateConfiguration(newConfig);

      expect(mockOddsConnector.setSportsbookFilter).toHaveBeenCalledWith({
        prioritySportsbooks: newConfig.prioritySportsbooks
      });
      expect(eventSpy).toHaveBeenCalledWith({
        config: expect.objectContaining(newConfig)
      });
    });
  });

  describe('Sportsbook Coverage', () => {
    it('should return sportsbook coverage data', async () => {
      // Trigger coverage update by performing sync
      mockOddsConnector.getAvailableSportsbooks.mockResolvedValue(['draftkings', 'fanduel', 'hardrockbet']);
      mockOddsConnector.syncMultiSportsbookOdds.mockResolvedValue({ recordsProcessed: 10, recordsSkipped: 0, errors: [] });

      await service.performFullSync();

      const coverage = await service.getSportsbookCoverage();

      expect(coverage).toBeInstanceOf(Array);
      expect(coverage.length).toBeGreaterThan(0);
      
      if (coverage.length > 0) {
        expect(coverage[0]).toHaveProperty('sportsbook');
        expect(coverage[0]).toHaveProperty('availability');
        expect(coverage[0]).toHaveProperty('reliability');
        expect(coverage[0]).toHaveProperty('marketCoverage');
      }
    });
  });

  describe('Service Lifecycle', () => {
    it('should start aggregation service', async () => {
      mockOddsConnector.getAvailableSportsbooks.mockResolvedValue(['draftkings', 'fanduel']);
      mockOddsConnector.syncMultiSportsbookOdds.mockResolvedValue({ recordsProcessed: 5, recordsSkipped: 0, errors: [] });

      const eventSpy = vi.fn();
      service.on('aggregationStarted', eventSpy);

      await service.startAggregation();

      expect(eventSpy).toHaveBeenCalledWith({
        config: expect.any(Object),
        timestamp: expect.any(Date)
      });
    });

    it('should stop aggregation service', async () => {
      const eventSpy = vi.fn();
      service.on('aggregationStopped', eventSpy);

      await service.stopAggregation();

      expect(eventSpy).toHaveBeenCalledWith({
        timestamp: expect.any(Date)
      });
    });

    it('should handle start errors', async () => {
      mockOddsConnector.getAvailableSportsbooks.mockRejectedValue(new Error('Network error'));

      const errorSpy = vi.fn();
      service.on('aggregationError', errorSpy);

      await expect(service.startAggregation()).rejects.toThrow('Network error');
      expect(errorSpy).toHaveBeenCalledWith({ error: 'Network error' });
    });
  });

  describe('Event Forwarding', () => {
    it('should forward connector events', () => {
      const eventData = { fightId: 'test', sportsbook: 'DraftKings' };
      const eventSpy = vi.fn();
      
      service.on('oddsUpdated', eventSpy);

      // Simulate connector event
      const eventHandler = mockOddsConnector.on.mock.calls.find(call => call[0] === 'eventProcessed')[1];
      eventHandler(eventData);

      expect(eventSpy).toHaveBeenCalledWith(eventData);
    });
  });
});