/**
 * Betting Analysis Routes - REST API routes for betting analysis functionality
 */

import { Router } from 'express';
import { bettingAnalysisController } from '../controllers/betting-analysis.controller.js';

const router = Router();

// Value betting analysis
router.post('/analyze/value', async (req, res) => {
  await bettingAnalysisController.analyzeValueBets(req, res);
});

// Bankroll management
router.post('/bankroll/recommendations', async (req, res) => {
  await bettingAnalysisController.getBankrollRecommendations(req, res);
});

// Expected value calculation
router.post('/calculate/expected-value', async (req, res) => {
  await bettingAnalysisController.calculateExpectedValue(req, res);
});

// Betting strategies
router.post('/strategies', async (req, res) => {
  await bettingAnalysisController.createStrategy(req, res);
});

router.get('/strategies', async (req, res) => {
  await bettingAnalysisController.getActiveStrategies(req, res);
});

router.post('/strategies/apply', async (req, res) => {
  await bettingAnalysisController.applyStrategies(req, res);
});

router.get('/strategies/:strategyId/performance', async (req, res) => {
  await bettingAnalysisController.getStrategyPerformance(req, res);
});

router.post('/strategies/:strategyId/performance', async (req, res) => {
  await bettingAnalysisController.updateStrategyPerformance(req, res);
});

// Arbitrage detection
router.post('/analyze/arbitrage', async (req, res) => {
  await bettingAnalysisController.detectArbitrage(req, res);
});

// Market analysis
router.post('/analyze/market', async (req, res) => {
  await bettingAnalysisController.analyzeMarket(req, res);
});

// Feature engineering
router.post('/features/extract', async (req, res) => {
  await bettingAnalysisController.extractFeatures(req, res);
});

router.get('/features/:fightId', async (req, res) => {
  await bettingAnalysisController.getCachedFeatures(req, res);
});

router.get('/features/importance', async (req, res) => {
  await bettingAnalysisController.getFeatureImportance(req, res);
});

export default router;