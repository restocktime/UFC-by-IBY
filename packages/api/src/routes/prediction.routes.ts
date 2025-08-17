import { Router } from 'express';
import { DatabaseManager } from '../database/manager';
import { PredictionController } from '../controllers/prediction.controller';

export function createPredictionRoutes(dbManager: DatabaseManager): Router {
  const router = Router();
  const predictionController = new PredictionController();

  // Get prediction for a fight
  router.get('/:fightId', async (req, res) => {
    try {
      const { fightId } = req.params;
      
      // Mock prediction data for demo
      const prediction = {
        fightId,
        winnerProbability: {
          fighter1: 0.65,
          fighter2: 0.35
        },
        confidence: 0.78,
        keyFactors: [
          'Reach advantage for Fighter 1',
          'Recent performance trends favor Fighter 1',
          'Historical matchup data suggests Fighter 1 advantage'
        ],
        methodProbability: {
          ko: 0.25,
          submission: 0.15,
          decision: 0.60
        },
        timestamp: new Date().toISOString(),
        modelVersion: '1.0.0'
      };

      res.json(prediction);
    } catch (error) {
      console.error('Error getting prediction:', error);
      res.status(500).json({ error: 'Failed to get prediction' });
    }
  });

  // Generate new prediction
  router.post('/', async (req, res) => {
    try {
      const { fightId, fighter1Id, fighter2Id, contextualData } = req.body;
      
      if (!fightId || !fighter1Id || !fighter2Id) {
        return res.status(400).json({ 
          error: 'Missing required fields: fightId, fighter1Id, fighter2Id' 
        });
      }

      // Mock prediction generation for demo
      const prediction = {
        fightId,
        fighter1Id,
        fighter2Id,
        winnerProbability: {
          fighter1: Math.random() * 0.4 + 0.3, // 0.3 to 0.7
          fighter2: Math.random() * 0.4 + 0.3  // 0.3 to 0.7
        },
        confidence: Math.random() * 0.3 + 0.6, // 0.6 to 0.9
        keyFactors: [
          'Physical attributes analysis',
          'Recent performance metrics',
          'Historical fight data',
          'Contextual factors (venue, altitude, etc.)'
        ],
        methodProbability: {
          ko: Math.random() * 0.4 + 0.1,
          submission: Math.random() * 0.3 + 0.1,
          decision: Math.random() * 0.4 + 0.4
        },
        contextualData,
        timestamp: new Date().toISOString(),
        modelVersion: '1.0.0',
        cached: false
      };

      // Normalize probabilities
      const total = prediction.winnerProbability.fighter1 + prediction.winnerProbability.fighter2;
      prediction.winnerProbability.fighter1 /= total;
      prediction.winnerProbability.fighter2 /= total;

      res.json(prediction);
    } catch (error) {
      console.error('Error generating prediction:', error);
      res.status(500).json({ error: 'Failed to generate prediction' });
    }
  });

  // Get prediction history
  router.get('/history/:fightId', async (req, res) => {
    try {
      const { fightId } = req.params;
      
      // Mock prediction history
      const history = [
        {
          timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          winnerProbability: { fighter1: 0.62, fighter2: 0.38 },
          confidence: 0.75,
          modelVersion: '0.9.0'
        },
        {
          timestamp: new Date(Date.now() - 43200000).toISOString(), // 12 hours ago
          winnerProbability: { fighter1: 0.64, fighter2: 0.36 },
          confidence: 0.77,
          modelVersion: '1.0.0'
        },
        {
          timestamp: new Date().toISOString(), // now
          winnerProbability: { fighter1: 0.65, fighter2: 0.35 },
          confidence: 0.78,
          modelVersion: '1.0.0'
        }
      ];

      res.json({ fightId, history });
    } catch (error) {
      console.error('Error getting prediction history:', error);
      res.status(500).json({ error: 'Failed to get prediction history' });
    }
  });

  return router;
}