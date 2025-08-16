/**
 * Odds Tracking API Routes
 */

import { Router } from 'express';
import { OddsController } from '../controllers/odds.controller.js';
import { DatabaseManager } from '../database/manager.js';

export function createOddsRoutes(dbManager: DatabaseManager): Router {
  const router = Router();
  const oddsController = new OddsController(dbManager);

  /**
   * @route GET /api/v1/odds/arbitrage
   * @desc Get arbitrage opportunities across all fights
   * @access Public
   * @query {number} minProfit - Minimum profit percentage (default: 1)
   * @query {number} maxStake - Maximum total stake (default: 1000)
   * @query {boolean} active - Only active opportunities (default: true)
   * @query {number} limit - Number of opportunities to return (default: 20, max: 100)
   */
  router.get('/arbitrage', async (req, res) => {
    await oddsController.getArbitrageOpportunities(req, res);
  });

  /**
   * @route GET /api/v1/odds/:fightId/current
   * @desc Get current odds for a specific fight
   * @access Public
   * @param {string} fightId - Fight ID
   * @query {string} sportsbooks - Comma-separated list of sportsbooks to include
   */
  router.get('/:fightId/current', async (req, res) => {
    await oddsController.getCurrentOdds(req, res);
  });

  /**
   * @route GET /api/v1/odds/:fightId/history
   * @desc Get historical odds for a fight
   * @access Public
   * @param {string} fightId - Fight ID
   * @query {string} sportsbook - Filter by specific sportsbook
   * @query {string} startDate - Start date for history (ISO string)
   * @query {string} endDate - End date for history (ISO string)
   * @query {string} interval - Time interval (5m, 15m, 30m, 1h, 4h, 12h, 1d)
   * @query {number} limit - Number of data points (default: 100, max: 1000)
   */
  router.get('/:fightId/history', async (req, res) => {
    await oddsController.getOddsHistory(req, res);
  });

  /**
   * @route GET /api/v1/odds/:fightId/movements
   * @desc Get odds movements for a fight
   * @access Public
   * @param {string} fightId - Fight ID
   * @query {number} minChange - Minimum percentage change to detect (default: 2)
   * @query {number} timeRange - Time range in hours to analyze (default: 24, max: 168)
   * @query {string} movementType - Filter by movement type (significant, reverse, steam, minor)
   * @query {string} sportsbook - Filter by specific sportsbook
   */
  router.get('/:fightId/movements', async (req, res) => {
    await oddsController.getOddsMovements(req, res);
  });

  /**
   * @route GET /api/v1/odds/:fightId/analysis
   * @desc Get comprehensive market analysis for a fight
   * @access Public
   * @param {string} fightId - Fight ID
   * @query {boolean} includeArbitrage - Include arbitrage opportunities (default: true)
   */
  router.get('/:fightId/analysis', async (req, res) => {
    await oddsController.getMarketAnalysis(req, res);
  });

  /**
   * @route GET /api/v1/odds/:fightId/compare
   * @desc Compare odds across sportsbooks for a fight
   * @access Public
   * @param {string} fightId - Fight ID
   * @query {string} sportsbooks - Comma-separated list of sportsbooks to compare
   */
  router.get('/:fightId/compare', async (req, res) => {
    await oddsController.compareOdds(req, res);
  });

  return router;
}