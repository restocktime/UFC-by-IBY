/**
 * Fighter Analytics API Routes
 */

import { Router } from 'express';
import { FighterController } from '../controllers/fighter.controller.js';
import { DatabaseManager } from '../database/manager.js';

export function createFighterRoutes(dbManager: DatabaseManager): Router {
  const router = Router();
  const fighterController = new FighterController(dbManager);

  /**
   * @route GET /api/v1/fighters/search
   * @desc Search fighters by name or criteria
   * @access Public
   * @query {string} q - Search query (fighter name)
   * @query {string} weightClass - Filter by weight class
   * @query {number} minRank - Minimum ranking
   * @query {number} maxRank - Maximum ranking
   * @query {boolean} active - Filter active fighters (default: true)
   * @query {number} limit - Number of results (default: 20, max: 100)
   * @query {number} offset - Offset for pagination (default: 0)
   */
  router.get('/search', async (req, res) => {
    await fighterController.searchFighters(req, res);
  });

  /**
   * @route GET /api/v1/fighters/rankings/:weightClass
   * @desc Get fighter rankings for a weight class
   * @access Public
   * @param {string} weightClass - Weight class name
   * @query {number} limit - Number of ranked fighters to return (default: 15, max: 50)
   */
  router.get('/rankings/:weightClass', async (req, res) => {
    await fighterController.getWeightClassRankings(req, res);
  });

  /**
   * @route GET /api/v1/fighters/compare/:fighter1Id/:fighter2Id
   * @desc Compare two fighters side-by-side
   * @access Public
   * @param {string} fighter1Id - First fighter ID
   * @param {string} fighter2Id - Second fighter ID
   * @query {number} timeRange - Time range in days for analysis (default: 365)
   */
  router.get('/compare/:fighter1Id/:fighter2Id', async (req, res) => {
    await fighterController.compareFighters(req, res);
  });

  /**
   * @route GET /api/v1/fighters/:fighterId
   * @desc Get fighter profile and basic statistics
   * @access Public
   * @param {string} fighterId - Fighter ID
   */
  router.get('/:fighterId', async (req, res) => {
    await fighterController.getFighterProfile(req, res);
  });

  /**
   * @route GET /api/v1/fighters/:fighterId/analytics
   * @desc Get comprehensive fighter analytics
   * @access Public
   * @param {string} fighterId - Fighter ID
   * @query {number} timeRange - Time range in days for analysis (default: 365)
   */
  router.get('/:fighterId/analytics', async (req, res) => {
    await fighterController.getFighterAnalytics(req, res);
  });

  /**
   * @route GET /api/v1/fighters/:fighterId/trends
   * @desc Get fighter performance trends
   * @access Public
   * @param {string} fighterId - Fighter ID
   * @query {number} timeRange - Time range in days (default: 365, min: 30)
   * @query {string} metrics - Comma-separated list of metrics to analyze
   */
  router.get('/:fighterId/trends', async (req, res) => {
    await fighterController.getFighterTrends(req, res);
  });

  return router;
}