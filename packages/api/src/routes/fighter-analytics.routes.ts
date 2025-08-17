import { Router } from 'express';
import { FighterAnalyticsController } from '../controllers/fighter-analytics.controller.js';

const router = Router();
const fighterAnalyticsController = new FighterAnalyticsController();

/**
 * Fighter Analytics Routes
 * Base path: /api/fighters
 */

// Individual fighter analytics
router.get('/:fighterId/analytics', fighterAnalyticsController.getFighterAnalytics.bind(fighterAnalyticsController));
router.get('/:fighterId/performance', fighterAnalyticsController.getFighterPerformance.bind(fighterAnalyticsController));
router.get('/:fighterId/trends', fighterAnalyticsController.getFighterTrends.bind(fighterAnalyticsController));
router.get('/:fighterId/prediction-factors', fighterAnalyticsController.getFighterPredictionFactors.bind(fighterAnalyticsController));
router.get('/:fighterId/training-camp', fighterAnalyticsController.getFighterTrainingCamp.bind(fighterAnalyticsController));
router.get('/:fighterId/injury-report', fighterAnalyticsController.getFighterInjuryReport.bind(fighterAnalyticsController));
router.get('/:fighterId/form-analysis', fighterAnalyticsController.getFighterFormAnalysis.bind(fighterAnalyticsController));

// Fighter comparison routes
router.post('/compare', fighterAnalyticsController.compareFighters.bind(fighterAnalyticsController));
router.get('/compare/:fighter1Id/:fighter2Id', fighterAnalyticsController.compareFightersParams.bind(fighterAnalyticsController));
router.get('/:fighterId/matchup-preview/:opponentId', fighterAnalyticsController.getMatchupPreview.bind(fighterAnalyticsController));

export default router;