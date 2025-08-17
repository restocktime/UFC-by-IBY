import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarketAnalysisService, MarketAnalysisConfig, ComprehensiveMarketAnalysis } from '../market-analysis.service.js';

// Mock dependencies
vi.mock('../../ingestion/connectors/odds-api.connector.js', () => ({
  OddsAPIConnector: vi.fn(() => ({
    getExpandedMarketCoverage: vi.fn(),
    syncMultiSportsbookOdds: vi.fn()
  }))
}));

vi.mock('../../repositories/odds.repository.js', () => ({
  OddsRepository: vi.fn(() => ({
    getLatestOdds: vi.fn(),
    getArbitrageOpportunities: vi.fn()
  }))
}));

describe('MarketAnalysisService', () => {
  let service: MarketAnalysisService;
  let mockOddsConnector: any;

  const mockConfig: Partial<MarketAnalysisConfig> = {
    enableH2HAnalysis: true,
    enableMethodAnalysis: true,
    enableRoundAnalysis: true,
    enablePropAnalysis: true,
    enableCrossMarketArbitrage: true,
    minArbitrageProfit: 2.0,
    analysisDepth: 'comprehensive'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the OddsAPIConnector
    const { OddsAPIConnector } = require('../../ingestion/connectors/odds-api.connector.js');
    mockOddsConnector = {
      getExpandedMarketCoverage: vi.fn(),
      syncMultiSportsbookOdds: vi.fn()
    };
    OddsAPIConnector.mockImplementation(() => mockOddsConnector);

    service = new MarketAnalysisService(mockConfig);
  });

  describe('Service Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultService = new MarketAnalysisService();
      expect(defaultService).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Comprehensive Market Analysis', () => {
    it('should generate comprehensive analysis successfully', async () => {
      const mockMarketCoverage = {
        totalEvents: 5,
        marketAvailability: {
          h2h: 100,
          methodOfVictory: 80,
          roundBetting: 60,
          propBets: 40
        },
        sportsbookCoverage: new Map([
          ['draftkings', { h2h: true, methodOfVictory: true, roundBetting: true, propBets: false }],
          ['fanduel', { h2h: true, methodOfVictory: true, roundBetting: false, propBets: true }]
        ])
      };

      const mockSyncResult = {
        recordsProcessed: 15,
        recordsSkipped: 0,
        errors: []
      };

      mockOddsConnector.getExpandedMarketCoverage.mockResolvedValue(mockMarketCoverage);
      mockOddsConnector.syncMultiSportsbookOdds.mockResolvedValue(mockSyncResult);

      const eventSpy = vi.fn();
      service.on('analysisCompleted', eventSpy);

      const analysis = await service.generateComprehensiveAnalysis('ufc319');

      expect(analysis).toBeDefined();
      expect(analysis.timestamp).toBeInstanceOf(Date);
      expect(analysis.totalFights).toBe(5);
      expect(analysis.totalSportsbooks).toBe(2);
      expect(analysis.marketCoverage.h2h).toBe(100);
      expect(analysis.marketCoverage.method).toBe(80);
      expect(analysis.marketCoverage.rounds).toBe(60);
      expect(analysis.marketCoverage.props).toBe(40);
      expect(analysis.h2hAnalysis).toBeDefined();
      expect(analysis.methodAnalysis).toBeDefined();
      expect(analysis.roundAnalysis).toBeDefined();
      expect(analysis.propAnalysis).toBeDefined();
      expect(analysis.crossMarketArbitrage).toBeInstanceOf(Array);
      expect(analysis.marketEfficiencyScore).toBeGreaterThanOrEqual(0);
      expect(analysis.recommendations).toBeInstanceOf(Array);

      expect(eventSpy).toHaveBeenCalledWith({
        eventId: 'ufc319',
        analysis: expect.any(Object),
        processingTime: expect.any(Number)
      });
    });

    it('should handle analysis errors gracefully', async () => {
      const error = new Error('API connection failed');
      mockOddsConnector.getExpandedMarketCoverage.mockRejectedValue(error);

      const errorSpy = vi.fn();
      service.on('analysisError', errorSpy);

      await expect(service.generateComprehensiveAnalysis()).rejects.toThrow('API connection failed');
      expect(errorSpy).toHaveBeenCalledWith({ 
        error: error.message, 
        eventId: undefined 
      });
    });
  });

  describe('Individual Market Analyses', () => {
    it('should generate H2H market analysis', async () => {
      const h2hAnalysis = await service.generateH2HAnalysis('ufc319');

      expect(h2hAnalysis).toBeDefined();
      expect(h2hAnalysis.totalFights).toBeGreaterThanOrEqual(0);
      expect(h2hAnalysis.avgSpread).toBeGreaterThanOrEqual(0);
      expect(h2hAnalysis.favoriteDistribution).toHaveProperty('heavy');
      expect(h2hAnalysis.favoriteDistribution).toHaveProperty('moderate');
      expect(h2hAnalysis.favoriteDistribution).toHaveProperty('slight');
      expect(h2hAnalysis.favoriteDistribution).toHaveProperty('pickEm');
      expect(h2hAnalysis.marketEfficiency).toBeGreaterThanOrEqual(0);
      expect(h2hAnalysis.marketEfficiency).toBeLessThanOrEqual(1);
      expect(h2hAnalysis.bestValueOpportunities).toBeInstanceOf(Array);
    });

    it('should generate method market analysis', async () => {
      const methodAnalysis = await service.generateMethodAnalysis('ufc319');

      expect(methodAnalysis).toBeDefined();
      expect(methodAnalysis.availability).toBeGreaterThanOrEqual(0);
      expect(methodAnalysis.availability).toBeLessThanOrEqual(100);
      expect(methodAnalysis.methodDistribution).toHaveProperty('ko');
      expect(methodAnalysis.methodDistribution).toHaveProperty('submission');
      expect(methodAnalysis.methodDistribution).toHaveProperty('decision');
      expect(methodAnalysis.valueOpportunities).toBeInstanceOf(Array);
      expect(methodAnalysis.crossMethodArbitrage).toBeInstanceOf(Array);
    });

    it('should generate round market analysis', async () => {
      const roundAnalysis = await service.generateRoundAnalysis('ufc319');

      expect(roundAnalysis).toBeDefined();
      expect(roundAnalysis.availability).toBeGreaterThanOrEqual(0);
      expect(roundAnalysis.availability).toBeLessThanOrEqual(100);
      expect(roundAnalysis.roundDistribution).toHaveProperty('round1');
      expect(roundAnalysis.roundDistribution).toHaveProperty('round2');
      expect(roundAnalysis.roundDistribution).toHaveProperty('round3');
      expect(roundAnalysis.totalRoundsAnalysis).toHaveProperty('under2_5');
      expect(roundAnalysis.totalRoundsAnalysis).toHaveProperty('over2_5');
      expect(roundAnalysis.earlyFinishOpportunities).toBeInstanceOf(Array);
    });

    it('should generate prop market analysis', async () => {
      const propAnalysis = await service.generatePropAnalysis('ufc319');

      expect(propAnalysis).toBeDefined();
      expect(propAnalysis.availability).toBeGreaterThanOrEqual(0);
      expect(propAnalysis.availability).toBeLessThanOrEqual(100);
      expect(propAnalysis.propTypes).toBeInstanceOf(Array);
      expect(propAnalysis.avgPropsPerFight).toBeGreaterThanOrEqual(0);
      expect(propAnalysis.popularProps).toBeInstanceOf(Array);
      expect(propAnalysis.uniqueProps).toBeInstanceOf(Array);
      expect(propAnalysis.highValueProps).toBeInstanceOf(Array);
    });
  });

  describe('Cross-Market Arbitrage', () => {
    it('should find cross-market arbitrage opportunities', async () => {
      const arbitrageOpportunities = await service.findCrossMarketArbitrage('ufc319');

      expect(arbitrageOpportunities).toBeInstanceOf(Array);
      
      if (arbitrageOpportunities.length > 0) {
        const opportunity = arbitrageOpportunities[0];
        expect(opportunity).toHaveProperty('fightId');
        expect(opportunity).toHaveProperty('type');
        expect(opportunity).toHaveProperty('markets');
        expect(opportunity).toHaveProperty('sportsbooks');
        expect(opportunity).toHaveProperty('profit');
        expect(opportunity).toHaveProperty('stakes');
        expect(opportunity).toHaveProperty('confidence');
        expect(opportunity).toHaveProperty('expiresAt');
        expect(opportunity.profit).toBeGreaterThan(0);
        expect(['high', 'medium', 'low']).toContain(opportunity.confidence);
      }
    });

    it('should categorize arbitrage opportunities correctly', async () => {
      const opportunities = await service.findCrossMarketArbitrage();
      
      const validTypes = ['method_h2h', 'round_method', 'prop_h2h', 'multi_market'];
      
      opportunities.forEach(opp => {
        expect(validTypes).toContain(opp.type);
        expect(opp.markets.length).toBeGreaterThanOrEqual(2);
        expect(opp.sportsbooks.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Market Trends Analysis', () => {
    it('should analyze market trends for different timeframes', async () => {
      const timeframes = ['1h', '6h', '24h', '7d'] as const;
      
      for (const timeframe of timeframes) {
        const trends = await service.analyzeMarketTrends(timeframe);
        
        expect(trends).toBeDefined();
        expect(trends.timeframe).toBe(timeframe);
        expect(trends).toHaveProperty('h2hTrends');
        expect(trends).toHaveProperty('methodTrends');
        expect(trends).toHaveProperty('arbitrageFrequency');
        
        expect(trends.h2hTrends).toHaveProperty('avgSpreadChange');
        expect(trends.h2hTrends).toHaveProperty('volatilityIncrease');
        expect(trends.h2hTrends).toHaveProperty('favoriteShifts');
        
        expect(trends.methodTrends).toHaveProperty('koOddsChange');
        expect(trends.methodTrends).toHaveProperty('submissionOddsChange');
        expect(trends.methodTrends).toHaveProperty('decisionOddsChange');
        
        expect(trends.arbitrageFrequency).toHaveProperty('total');
        expect(trends.arbitrageFrequency).toHaveProperty('avgDuration');
        expect(trends.arbitrageFrequency).toHaveProperty('avgProfit');
      }
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        minArbitrageProfit: 3.0,
        analysisDepth: 'basic' as const,
        enablePropAnalysis: false
      };

      const eventSpy = vi.fn();
      service.on('configurationUpdated', eventSpy);

      service.updateConfiguration(newConfig);

      expect(eventSpy).toHaveBeenCalledWith({
        config: expect.objectContaining(newConfig)
      });
    });

    it('should handle partial configuration updates', () => {
      const partialConfig = {
        enableCrossMarketArbitrage: false
      };

      service.updateConfiguration(partialConfig);

      // Should not throw and should maintain other config values
      expect(() => service.updateConfiguration(partialConfig)).not.toThrow();
    });
  });

  describe('Market Efficiency Calculations', () => {
    it('should calculate market efficiency scores correctly', async () => {
      const analysis = await service.generateComprehensiveAnalysis();
      
      expect(analysis.marketEfficiencyScore).toBeGreaterThanOrEqual(0);
      expect(analysis.marketEfficiencyScore).toBeLessThanOrEqual(1);
    });

    it('should generate meaningful recommendations', async () => {
      const analysis = await service.generateComprehensiveAnalysis();
      
      expect(analysis.recommendations).toBeInstanceOf(Array);
      
      // Recommendations should be strings
      analysis.recommendations.forEach(rec => {
        expect(typeof rec).toBe('string');
        expect(rec.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing market data gracefully', async () => {
      mockOddsConnector.getExpandedMarketCoverage.mockResolvedValue({
        totalEvents: 0,
        marketAvailability: {},
        sportsbookCoverage: new Map()
      });
      
      mockOddsConnector.syncMultiSportsbookOdds.mockResolvedValue({
        recordsProcessed: 0,
        recordsSkipped: 0,
        errors: []
      });

      const analysis = await service.generateComprehensiveAnalysis();
      
      expect(analysis.totalFights).toBe(0);
      expect(analysis.totalSportsbooks).toBe(0);
      expect(analysis.marketEfficiencyScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle individual analysis failures', async () => {
      // Mock one analysis to fail
      const originalGenerateH2HAnalysis = service.generateH2HAnalysis;
      service.generateH2HAnalysis = vi.fn().mockRejectedValue(new Error('H2H analysis failed'));

      mockOddsConnector.getExpandedMarketCoverage.mockResolvedValue({
        totalEvents: 1,
        marketAvailability: { h2h: 50 },
        sportsbookCoverage: new Map([['draftkings', {}]])
      });
      
      mockOddsConnector.syncMultiSportsbookOdds.mockResolvedValue({
        recordsProcessed: 1,
        recordsSkipped: 0,
        errors: []
      });

      // Should still complete analysis with empty H2H data
      const analysis = await service.generateComprehensiveAnalysis();
      
      expect(analysis).toBeDefined();
      expect(analysis.h2hAnalysis.totalFights).toBe(0); // Should use empty analysis
      
      // Restore original method
      service.generateH2HAnalysis = originalGenerateH2HAnalysis;
    });
  });
});