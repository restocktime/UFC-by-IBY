import { Router } from 'express';
import { DatabaseManager } from '../database/manager';
import { LiveDataService } from '../services/live-data.service';

export function createFighterRoutes(dbManager: DatabaseManager): Router {
  const router = Router();
  const liveDataService = new LiveDataService();

  // Initialize live data service
  liveDataService.initialize().catch(console.error);

  // Mock fighter data (fallback)
  const mockFighters = [
    {
      id: 'fighter-1',
      name: 'Jon Jones',
      nickname: 'Bones',
      physicalStats: {
        height: 76,
        weight: 205,
        reach: 84.5,
        legReach: 44,
        stance: 'Orthodox'
      },
      record: {
        wins: 26,
        losses: 1,
        draws: 0,
        noContests: 1
      },
      rankings: {
        weightClass: 'Light Heavyweight',
        rank: 1
      },
      camp: {
        name: 'Jackson Wink MMA',
        location: 'Albuquerque, NM',
        headCoach: 'Greg Jackson'
      }
    },
    {
      id: 'fighter-2',
      name: 'Alexander Volkanovski',
      nickname: 'The Great',
      physicalStats: {
        height: 66,
        weight: 145,
        reach: 71.5,
        legReach: 38,
        stance: 'Orthodox'
      },
      record: {
        wins: 25,
        losses: 1,
        draws: 0,
        noContests: 0
      },
      rankings: {
        weightClass: 'Featherweight',
        rank: 1
      },
      camp: {
        name: 'Freestyle Fighting Gym',
        location: 'Sydney, Australia',
        headCoach: 'Joe Lopez'
      }
    },
    {
      id: 'fighter-3',
      name: 'Islam Makhachev',
      nickname: 'The Eagle',
      physicalStats: {
        height: 70,
        weight: 155,
        reach: 70,
        legReach: 40,
        stance: 'Orthodox'
      },
      record: {
        wins: 24,
        losses: 1,
        draws: 0,
        noContests: 0
      },
      rankings: {
        weightClass: 'Lightweight',
        rank: 1
      },
      camp: {
        name: 'American Kickboxing Academy',
        location: 'San Jose, CA',
        headCoach: 'Javier Mendez'
      }
    }
  ];

  // Get all fighters
  router.get('/', async (req, res) => {
    try {
      const { weightClass, limit = '20' } = req.query;
      
      // Try to get live fighters from current event
      const currentEvent = liveDataService.getCurrentEvent();
      let fighters = mockFighters;
      
      if (currentEvent?.fights) {
        // Extract fighters from live event
        const liveFighters = currentEvent.fights.flatMap(fight => [
          {
            id: fight.fighter1.id,
            name: fight.fighter1.name,
            nickname: fight.fighter1.nickname || '',
            record: { wins: 0, losses: 0, draws: 0 }, // Parse from fight.fighter1.record
            rankings: { weightClass: fight.weightClass },
            physicalStats: { height: 0, weight: 0, reach: 0, legReach: 0, stance: 'Orthodox' },
            camp: { name: 'Unknown', location: 'Unknown', headCoach: 'Unknown' }
          },
          {
            id: fight.fighter2.id,
            name: fight.fighter2.name,
            nickname: fight.fighter2.nickname || '',
            record: { wins: 0, losses: 0, draws: 0 }, // Parse from fight.fighter2.record
            rankings: { weightClass: fight.weightClass },
            physicalStats: { height: 0, weight: 0, reach: 0, legReach: 0, stance: 'Orthodox' },
            camp: { name: 'Unknown', location: 'Unknown', headCoach: 'Unknown' }
          }
        ]);
        
        // Combine live and mock data
        fighters = [...liveFighters, ...mockFighters];
      }
      
      if (weightClass) {
        fighters = fighters.filter(f => 
          f.rankings.weightClass.toLowerCase() === (weightClass as string).toLowerCase()
        );
      }
      
      const limitNum = parseInt(limit as string, 10);
      fighters = fighters.slice(0, limitNum);
      
      res.json(fighters);
    } catch (error) {
      console.error('Error getting fighters:', error);
      res.status(500).json({ error: 'Failed to get fighters' });
    }
  });

  // Get fighter by ID
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const fighter = mockFighters.find(f => f.id === id);
      
      if (!fighter) {
        return res.status(404).json({ error: 'Fighter not found' });
      }
      
      // Add additional stats for individual fighter view
      const fighterWithStats = {
        ...fighter,
        recentFights: [
          {
            date: '2023-12-01',
            opponent: 'Test Opponent 1',
            result: 'Win',
            method: 'Decision',
            round: 3
          },
          {
            date: '2023-08-15',
            opponent: 'Test Opponent 2',
            result: 'Win',
            method: 'KO',
            round: 2
          }
        ],
        stats: {
          strikeAccuracy: Math.random() * 20 + 40, // 40-60%
          takedownAccuracy: Math.random() * 30 + 30, // 30-60%
          submissionAttempts: Math.floor(Math.random() * 10),
          avgFightTime: '12:34'
        }
      };
      
      res.json(fighterWithStats);
    } catch (error) {
      console.error('Error getting fighter:', error);
      res.status(500).json({ error: 'Failed to get fighter' });
    }
  });

  // Create new fighter
  router.post('/', async (req, res) => {
    try {
      const fighterData = req.body;
      
      // Basic validation
      if (!fighterData.name || !fighterData.physicalStats || !fighterData.record) {
        return res.status(400).json({ 
          error: 'Missing required fields: name, physicalStats, record' 
        });
      }
      
      const newFighter = {
        id: `fighter-${Date.now()}`,
        ...fighterData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // In a real implementation, this would save to database
      mockFighters.push(newFighter);
      
      res.status(201).json(newFighter);
    } catch (error) {
      console.error('Error creating fighter:', error);
      res.status(500).json({ error: 'Failed to create fighter' });
    }
  });

  // Update fighter
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const fighterIndex = mockFighters.findIndex(f => f.id === id);
      
      if (fighterIndex === -1) {
        return res.status(404).json({ error: 'Fighter not found' });
      }
      
      mockFighters[fighterIndex] = {
        ...mockFighters[fighterIndex],
        ...updateData,
        updatedAt: new Date().toISOString()
      };
      
      res.json(mockFighters[fighterIndex]);
    } catch (error) {
      console.error('Error updating fighter:', error);
      res.status(500).json({ error: 'Failed to update fighter' });
    }
  });

  // Get fighter comparison
  router.get('/:id1/compare/:id2', async (req, res) => {
    try {
      const { id1, id2 } = req.params;
      
      const fighter1 = mockFighters.find(f => f.id === id1);
      const fighter2 = mockFighters.find(f => f.id === id2);
      
      if (!fighter1 || !fighter2) {
        return res.status(404).json({ error: 'One or both fighters not found' });
      }
      
      const comparison = {
        fighter1,
        fighter2,
        comparison: {
          height: {
            fighter1: fighter1.physicalStats.height,
            fighter2: fighter2.physicalStats.height,
            advantage: fighter1.physicalStats.height > fighter2.physicalStats.height ? 'fighter1' : 'fighter2'
          },
          reach: {
            fighter1: fighter1.physicalStats.reach,
            fighter2: fighter2.physicalStats.reach,
            advantage: fighter1.physicalStats.reach > fighter2.physicalStats.reach ? 'fighter1' : 'fighter2'
          },
          experience: {
            fighter1: fighter1.record.wins + fighter1.record.losses,
            fighter2: fighter2.record.wins + fighter2.record.losses,
            advantage: (fighter1.record.wins + fighter1.record.losses) > (fighter2.record.wins + fighter2.record.losses) ? 'fighter1' : 'fighter2'
          }
        }
      };
      
      res.json(comparison);
    } catch (error) {
      console.error('Error comparing fighters:', error);
      res.status(500).json({ error: 'Failed to compare fighters' });
    }
  });

  return router;
}