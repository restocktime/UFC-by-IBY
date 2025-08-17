import { Router } from 'express';
import { DatabaseManager } from '../database/manager.js';
import { UFC319Controller } from '../controllers/ufc319.controller.js';

export function createUFC319Routes(dbManager: DatabaseManager): Router {
  const router = Router();
  const ufc319Controller = new UFC319Controller();

  /**
   * UFC 319 Event Integration Routes
   */

  // Integration endpoints
  router.post('/integrate', ufc319Controller.integrateEvent);
  router.post('/discover-events', ufc319Controller.discoverEvents);

  // Data retrieval endpoints
  router.get('/event', ufc319Controller.getEventData);
  router.get('/fight-card', ufc319Controller.getFightCard);
  router.get('/fighter/:fighterId', ufc319Controller.getFighterDetails);
  router.get('/status', ufc319Controller.getIntegrationStatus);

  // Odds endpoints
  router.post('/odds/integrate', ufc319Controller.integrateOdds);
  router.get('/odds/live', ufc319Controller.getLiveOdds);
  router.get('/odds/history/:fightId', ufc319Controller.getHistoricalOdds);
  router.get('/odds/comparison/:fightId', ufc319Controller.getOddsComparison);

  return router;
}