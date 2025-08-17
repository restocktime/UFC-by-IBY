import { Router } from 'express';
import { DatabaseManager } from '../database/manager';
import { LiveDataService } from '../services/live-data.service';
import { OddsController } from '../controllers/odds.controller';

export function createOddsRoutes(dbManager: DatabaseManager): Router {
  const router = Router();
  const liveDataService = new LiveDataService();
  const oddsController = new OddsController(dbManager);

  // Initialize live data service
  liveDataService.initialize().catch(console.error);

  // Mock odds data
  const mockOdds = [
    {
      id: 'odds-1',
      fightId: 'fight-1',
      sportsbook: 'DraftKings',
      timestamp: new Date().toISOString(),
      moneyline: {
        fighter1: -200,
        fighter2: +170
      },
      method: {
        ko: {
          fighter1: +300,
          fighter2: +400
        },
        submission: {
          fighter1: +500,
          fighter2: +800
        },
        decision: {
          fighter1: +250,
          fighter2: +300
        }
      },
      rounds: {
        under2_5: +120,
        over2_5: -140
      }
    },
    {
      id: 'odds-2',
      fightId: 'fight-1',
      sportsbook: 'FanDuel',
      timestamp: new Date().toISOString(),
      moneyline: {
        fighter1: -195,
        fighter2: +165
      },
      method: {
        ko: {
          fighter1: +290,
          fighter2: +390
        },
        submission: {
          fighter1: +480,
          fighter2: +780
        },
        decision: {
          fighter1: +240,
          fighter2: +290
        }
      },
      rounds: {
        under2_5: +115,
        over2_5: -135
      }
    }
  ];

  // Get odds for a specific fight
  router.get('/fight/:fightId', async (req, res) => {
    try {
      const { fightId } = req.params;
      
      // Try to get live odds first
      const liveOdds = liveDataService.getOddsForFight(fightId);
      
      if (liveOdds.length > 0) {
        // Transform live odds to expected format
        const transformedOdds = liveOdds.map(odds => ({
          id: `${odds.fightId}-${odds.sportsbook}`,
          fightId: odds.fightId,
          sportsbook: odds.sportsbook,
          timestamp: odds.timestamp.toISOString(),
          moneyline: odds.moneyline,
          method: odds.markets?.method || {
            ko: { fighter1: 0, fighter2: 0 },
            submission: { fighter1: 0, fighter2: 0 },
            decision: { fighter1: 0, fighter2: 0 }
          },
          rounds: odds.markets?.rounds || {
            under2_5: 0,
            over2_5: 0
          }
        }));
        
        return res.json(transformedOdds);
      }
      
      // Fallback to mock data
      const fightOdds = mockOdds.filter(odds => odds.fightId === fightId);
      
      if (fightOdds.length === 0) {
        return res.status(404).json({ error: 'No odds found for this fight' });
      }
      
      res.json(fightOdds);
    } catch (error) {
      console.error('Error getting fight odds:', error);
      res.status(500).json({ error: 'Failed to get fight odds' });
    }
  });

  // Get all odds
  router.get('/', async (req, res) => {
    try {
      const { sportsbook, limit = '50' } = req.query;
      
      let odds = mockOdds;
      
      if (sportsbook) {
        odds = odds.filter(o => 
          o.sportsbook.toLowerCase() === (sportsbook as string).toLowerCase()
        );
      }
      
      const limitNum = parseInt(limit as string, 10);
      odds = odds.slice(0, limitNum);
      
      res.json(odds);
    } catch (error) {
      console.error('Error getting odds:', error);
      res.status(500).json({ error: 'Failed to get odds' });
    }
  });

  // Create new odds entry
  router.post('/', async (req, res) => {
    try {
      const oddsData = req.body;
      
      // Basic validation
      if (!oddsData.fightId || !oddsData.sportsbook || !oddsData.moneyline) {
        return res.status(400).json({ 
          error: 'Missing required fields: fightId, sportsbook, moneyline' 
        });
      }
      
      const newOdds = {
        id: `odds-${Date.now()}`,
        ...oddsData,
        timestamp: new Date().toISOString()
      };
      
      // In a real implementation, this would save to database
      mockOdds.push(newOdds);
      
      res.status(201).json(newOdds);
    } catch (error) {
      console.error('Error creating odds:', error);
      res.status(500).json({ error: 'Failed to create odds' });
    }
  });

  // Get odds movement for a fight
  router.get('/movement/:fightId', async (req, res) => {
    try {
      const { fightId } = req.params;
      
      // Mock odds movement data
      const movement = {
        fightId,
        timeframe: '24h',
        movements: [
          {
            timestamp: new Date(Date.now() - 86400000).toISOString(), // 24h ago
            sportsbook: 'DraftKings',
            moneyline: { fighter1: -180, fighter2: +150 }
          },
          {
            timestamp: new Date(Date.now() - 43200000).toISOString(), // 12h ago
            sportsbook: 'DraftKings',
            moneyline: { fighter1: -190, fighter2: +160 }
          },
          {
            timestamp: new Date().toISOString(), // now
            sportsbook: 'DraftKings',
            moneyline: { fighter1: -200, fighter2: +170 }
          }
        ],
        analysis: {
          trend: 'fighter1_favored',
          significantMovement: true,
          volumeIndicator: 'high',
          sharpMoney: 'fighter1'
        }
      };
      
      res.json(movement);
    } catch (error) {
      console.error('Error getting odds movement:', error);
      res.status(500).json({ error: 'Failed to get odds movement' });
    }
  });

  // Get best odds across sportsbooks
  router.get('/best/:fightId', async (req, res) => {
    try {
      const { fightId } = req.params;
      
      const fightOdds = mockOdds.filter(odds => odds.fightId === fightId);
      
      if (fightOdds.length === 0) {
        return res.status(404).json({ error: 'No odds found for this fight' });
      }
      
      // Find best odds for each fighter
      const bestOdds = {
        fightId,
        bestMoneyline: {
          fighter1: {
            odds: Math.max(...fightOdds.map(o => o.moneyline.fighter1)),
            sportsbook: fightOdds.find(o => o.moneyline.fighter1 === Math.max(...fightOdds.map(o => o.moneyline.fighter1)))?.sportsbook
          },
          fighter2: {
            odds: Math.max(...fightOdds.map(o => o.moneyline.fighter2)),
            sportsbook: fightOdds.find(o => o.moneyline.fighter2 === Math.max(...fightOdds.map(o => o.moneyline.fighter2)))?.sportsbook
          }
        },
        arbitrageOpportunity: false, // Would calculate this in real implementation
        timestamp: new Date().toISOString()
      };
      
      res.json(bestOdds);
    } catch (error) {
      console.error('Error getting best odds:', error);
      res.status(500).json({ error: 'Failed to get best odds' });
    }
  });

  // Get sportsbook comparison
  router.get('/compare/:fightId', async (req, res) => {
    try {
      const { fightId } = req.params;
      
      const fightOdds = mockOdds.filter(odds => odds.fightId === fightId);
      
      if (fightOdds.length === 0) {
        return res.status(404).json({ error: 'No odds found for this fight' });
      }
      
      const comparison = {
        fightId,
        sportsbooks: fightOdds.map(odds => ({
          name: odds.sportsbook,
          moneyline: odds.moneyline,
          method: odds.method,
          rounds: odds.rounds,
          timestamp: odds.timestamp
        })),
        spread: {
          fighter1: {
            min: Math.min(...fightOdds.map(o => o.moneyline.fighter1)),
            max: Math.max(...fightOdds.map(o => o.moneyline.fighter1)),
            avg: fightOdds.reduce((sum, o) => sum + o.moneyline.fighter1, 0) / fightOdds.length
          },
          fighter2: {
            min: Math.min(...fightOdds.map(o => o.moneyline.fighter2)),
            max: Math.max(...fightOdds.map(o => o.moneyline.fighter2)),
            avg: fightOdds.reduce((sum, o) => sum + o.moneyline.fighter2, 0) / fightOdds.length
          }
        }
      };
      
      res.json(comparison);
    } catch (error) {
      console.error('Error comparing odds:', error);
      res.status(500).json({ error: 'Failed to compare odds' });
    }
  });

  // === NEW MULTI-SPORTSBOOK ENDPOINTS ===

  // Sync multi-sportsbook odds for a specific fight
  router.post('/sync/:fightId', async (req, res) => {
    await oddsController.syncMultiSportsbookOdds(req, res);
  });

  // Get comprehensive market analysis
  router.get('/market-analysis/:fightId', async (req, res) => {
    await oddsController.getComprehensiveMarketAnalysis(req, res);
  });

  // Get sportsbook coverage information
  router.get('/sportsbooks/coverage', async (req, res) => {
    await oddsController.getSportsbookCoverage(req, res);
  });

  // Get live arbitrage opportunities
  router.get('/arbitrage/live', async (req, res) => {
    await oddsController.getLiveArbitrageOpportunities(req, res);
  });

  // Trigger full odds aggregation sync
  router.post('/sync/full', async (req, res) => {
    await oddsController.triggerFullSync(req, res);
  });

  // Update aggregation service configuration
  router.put('/config', async (req, res) => {
    await oddsController.updateAggregationConfig(req, res);
  });

  // === EXPANDED MARKET COVERAGE ENDPOINTS ===

  // Get expanded market coverage analysis
  router.get('/markets/coverage', async (req, res) => {
    await oddsController.getExpandedMarketCoverage(req, res);
  });

  // Get H2H market analysis
  router.get('/markets/h2h/analysis', async (req, res) => {
    await oddsController.getH2HMarketAnalysis(req, res);
  });

  // Get method of victory market analysis
  router.get('/markets/method/analysis', async (req, res) => {
    await oddsController.getMethodMarketAnalysis(req, res);
  });

  // Get round betting market analysis
  router.get('/markets/rounds/analysis', async (req, res) => {
    await oddsController.getRoundMarketAnalysis(req, res);
  });

  // Get prop betting market analysis
  router.get('/markets/props/analysis', async (req, res) => {
    await oddsController.getPropMarketAnalysis(req, res);
  });

  // Get cross-market arbitrage opportunities
  router.get('/markets/arbitrage/cross-market', async (req, res) => {
    await oddsController.getCrossMarketArbitrage(req, res);
  });

  // Get market trends analysis
  router.get('/markets/trends', async (req, res) => {
    await oddsController.getMarketTrends(req, res);
  });

  // Update market analysis configuration
  router.put('/markets/config', async (req, res) => {
    await oddsController.updateMarketAnalysisConfig(req, res);
  });

  // Enhanced odds endpoints using the controller
  router.get('/current/:fightId', async (req, res) => {
    await oddsController.getCurrentOdds(req, res);
  });

  router.get('/history/:fightId', async (req, res) => {
    await oddsController.getOddsHistory(req, res);
  });

  router.get('/movements/:fightId', async (req, res) => {
    await oddsController.getOddsMovements(req, res);
  });

  router.get('/analysis/:fightId', async (req, res) => {
    await oddsController.getMarketAnalysis(req, res);
  });

  router.get('/arbitrage', async (req, res) => {
    await oddsController.getArbitrageOpportunities(req, res);
  });

  router.get('/compare/:fightId', async (req, res) => {
    await oddsController.compareOdds(req, res);
  });

  return router;
}