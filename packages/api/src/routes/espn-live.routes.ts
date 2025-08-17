import { Router } from 'express';
import { ESPNLiveController } from '../controllers/espn-live.controller.js';

const router = Router();
const espnLiveController = new ESPNLiveController();

/**
 * ESPN API Routes
 * Base path: /api/espn
 */

// Data fetching routes
router.get('/scoreboard', espnLiveController.getScoreboard.bind(espnLiveController));
router.get('/fighters', espnLiveController.getFighterRankings.bind(espnLiveController));
router.get('/live/:eventId', espnLiveController.getLiveFightData.bind(espnLiveController));
router.get('/events/upcoming', espnLiveController.getUpcomingEvents.bind(espnLiveController));

// Live tracking routes
router.post('/tracking/start/:eventId', espnLiveController.startTracking.bind(espnLiveController));
router.post('/tracking/stop/:eventId', espnLiveController.stopTracking.bind(espnLiveController));
router.get('/tracking/status', espnLiveController.getTrackingStatus.bind(espnLiveController));
router.get('/tracking/fight/:fightId', espnLiveController.getFightTrackingData.bind(espnLiveController));
router.post('/tracking/poll/:eventId', espnLiveController.manualPoll.bind(espnLiveController));

// Sync routes
router.post('/sync/full', espnLiveController.fullSync.bind(espnLiveController));

export default router;