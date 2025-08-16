/**
 * Prediction API Routes
 */

import { Router } from 'express';
import { PredictionController } from '../controllers/prediction.controller.js';
import { DatabaseManager } from '../database/manager.js';

export function createPredictionRoutes(dbManager: DatabaseManager): Router {
  const router = Router();
  const predictionController = new PredictionController(dbManager);

  /**
   * @route GET /api/v1/predictions/:fightId
   * @desc Get prediction for a specific fight
   * @access Public
   * @param {string} fightId - Fight ID
   * @query {string} useCache - Whether to use cached prediction (default: true)
   */
  router.get('/:fightId', async (req, res) => {
    await predictionController.getFightPrediction(req, res);
  });

  /**
   * @route POST /api/v1/predictions/batch
   * @desc Get predictions for multiple fights
   * @access Public
   * @body {string[]} fightIds - Array of fight IDs
   * @body {boolean} useCache - Whether to use cached predictions (default: true)
   */
  router.post('/batch', async (req, res) => {
    await predictionController.getBatchPredictions(req, res);
  });

  /**
   * @route GET /api/v1/predictions/:fightId/history
   * @desc Get prediction history for a fight
   * @access Public
   * @param {string} fightId - Fight ID
   * @query {string} limit - Number of results to return (default: 10, max: 100)
   * @query {string} offset - Number of results to skip (default: 0)
   */
  router.get('/:fightId/history', async (req, res) => {
    await predictionController.getPredictionHistory(req, res);
  });

  /**
   * @route GET /api/v1/predictions/:fightId/confidence
   * @desc Get confidence intervals for a prediction
   * @access Public
   * @param {string} fightId - Fight ID
   * @query {string} confidenceLevel - Confidence level (default: 0.95)
   */
  router.get('/:fightId/confidence', async (req, res) => {
    await predictionController.getConfidenceIntervals(req, res);
  });

  /**
   * @route DELETE /api/v1/predictions/cache
   * @desc Clear prediction cache
   * @access Admin
   * @query {string} fightId - Specific fight ID to clear (optional)
   */
  router.delete('/cache', async (req, res) => {
    await predictionController.clearCache(req, res);
  });

  /**
   * @route GET /api/v1/predictions/stats
   * @desc Get prediction statistics
   * @access Public
   */
  router.get('/stats', async (req, res) => {
    await predictionController.getPredictionStats(req, res);
  });

  return router;
}