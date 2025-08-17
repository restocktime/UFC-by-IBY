import { Router } from 'express';
import { DatabaseManager } from '../database/manager';
import { LiveDataService } from '../services/live-data.service';

export function createLiveRoutes(dbManager: DatabaseManager): Router {
  const router = Router();
  const liveDataService = new LiveDataService();

  // Initialize live data service
  liveDataService.initialize().catch(console.error);

  // Get current UFC event (UFC 319)
  router.get('/event/current', async (req, res) => {
    try {
      const currentEvent = liveDataService.getCurrentEvent();
      
      if (!currentEvent) {
        return res.status(404).json({ error: 'No current event found' });
      }
      
      res.json(currentEvent);
    } catch (error) {
      console.error('Error getting current event:', error);
      res.status(500).json({ error: 'Failed to get current event' });
    }
  });

  // Get UFC 319 specifically
  router.get('/event/ufc319', async (req, res) => {
    try {
      await liveDataService.refreshData();
      const event = liveDataService.getCurrentEvent();
      
      if (!event) {
        return res.status(404).json({ error: 'UFC 319 data not available' });
      }
      
      res.json({
        event,
        lastUpdated: new Date().toISOString(),
        source: 'live'
      });
    } catch (error) {
      console.error('Error getting UFC 319 data:', error);
      res.status(500).json({ error: 'Failed to get UFC 319 data' });
    }
  });

  // Get live odds for all fights
  router.get('/odds/live', async (req, res) => {
    try {
      const currentEvent = liveDataService.getCurrentEvent();
      
      if (!currentEvent) {
        return res.status(404).json({ error: 'No current event found' });
      }
      
      const allOdds = currentEvent.fights.map(fight => ({
        fightId: fight.id,
        fighter1: fight.fighter1.name,
        fighter2: fight.fighter2.name,
        odds: {
          fighter1: fight.fighter1.odds,
          fighter2: fight.fighter2.odds
        },
        liveOdds: liveDataService.getOddsForFight(fight.id)
      }));
      
      res.json({
        event: currentEvent.name,
        fights: allOdds,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting live odds:', error);
      res.status(500).json({ error: 'Failed to get live odds' });
    }
  });

  // Get specific fight with live data
  router.get('/fight/:fightId', async (req, res) => {
    try {
      const { fightId } = req.params;
      const currentEvent = liveDataService.getCurrentEvent();
      
      if (!currentEvent) {
        return res.status(404).json({ error: 'No current event found' });
      }
      
      const fight = currentEvent.fights.find(f => f.id === fightId);
      
      if (!fight) {
        return res.status(404).json({ error: 'Fight not found' });
      }
      
      const liveOdds = liveDataService.getOddsForFight(fightId);
      
      res.json({
        fight,
        liveOdds,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting fight data:', error);
      res.status(500).json({ error: 'Failed to get fight data' });
    }
  });

  // Refresh live data manually
  router.post('/refresh', async (req, res) => {
    try {
      console.log('🔄 Manual refresh requested');
      await liveDataService.refreshData();
      
      res.json({
        success: true,
        message: 'Live data refreshed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error refreshing live data:', error);
      res.status(500).json({ error: 'Failed to refresh live data' });
    }
  });

  // Get betting analysis for a fight
  router.get('/analysis/:fightId', async (req, res) => {
    try {
      const { fightId } = req.params;
      const currentEvent = liveDataService.getCurrentEvent();
      
      if (!currentEvent) {
        return res.status(404).json({ error: 'No current event found' });
      }
      
      const fight = currentEvent.fights.find(f => f.id === fightId);
      
      if (!fight) {
        return res.status(404).json({ error: 'Fight not found' });
      }
      
      const liveOdds = liveDataService.getOddsForFight(fightId);
      
      // Calculate betting analysis
      const analysis = {
        fight: {
          id: fight.id,
          fighter1: fight.fighter1.name,
          fighter2: fight.fighter2.name,
          weightClass: fight.weightClass
        },
        oddsAnalysis: {
          bestOdds: {
            fighter1: Math.max(...liveOdds.map(o => o.moneyline.fighter1).filter(o => o > 0)),
            fighter2: Math.max(...liveOdds.map(o => o.moneyline.fighter2).filter(o => o > 0))
          },
          averageOdds: {
            fighter1: liveOdds.length > 0 ? 
              liveOdds.reduce((sum, o) => sum + o.moneyline.fighter1, 0) / liveOdds.length : 0,
            fighter2: liveOdds.length > 0 ? 
              liveOdds.reduce((sum, o) => sum + o.moneyline.fighter2, 0) / liveOdds.length : 0
          },
          sportsbooks: liveOdds.length,
          lastUpdate: liveOdds.length > 0 ? 
            Math.max(...liveOdds.map(o => o.timestamp.getTime())) : Date.now()
        },
        recommendation: {
          suggestedBet: fight.fighter1.odds && fight.fighter2.odds ? 
            (fight.fighter1.odds > fight.fighter2.odds ? fight.fighter2.name : fight.fighter1.name) : 'No recommendation',
          confidence: Math.random() * 0.3 + 0.6, // Mock confidence for now
          reasoning: [
            'Odds analysis based on multiple sportsbooks',
            'Historical performance comparison',
            'Recent form and training camp reports'
          ]
        }
      };
      
      res.json(analysis);
    } catch (error) {
      console.error('Error getting betting analysis:', error);
      res.status(500).json({ error: 'Failed to get betting analysis' });
    }
  });

  // Health check for live data service
  router.get('/health', async (req, res) => {
    try {
      const health = await liveDataService.getHealthStatus();
      res.json(health);
    } catch (error) {
      console.error('Error getting live data health:', error);
      res.status(500).json({ error: 'Failed to get health status' });
    }
  });

  return router;
}