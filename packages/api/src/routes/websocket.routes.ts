import { Router } from 'express';
import { webSocketController } from '../controllers/websocket.controller.js';

const router = Router();

// WebSocket connection management
router.get('/stats', webSocketController.getConnectionStats);
router.get('/clients', webSocketController.getConnectedClients);
router.post('/clients/:clientId/message', webSocketController.sendMessageToClient);
router.delete('/clients/:clientId', webSocketController.disconnectClient);

// Topic management
router.post('/topics/:topic/broadcast', webSocketController.broadcastToTopic);
router.get('/topics/:topic/subscribers', webSocketController.getTopicSubscribers);

// Live updates
router.post('/updates', webSocketController.publishLiveUpdate);

// Betting alerts
router.get('/alerts/users/:userId', webSocketController.getUserBettingAlerts);
router.post('/alerts', webSocketController.createBettingAlert);
router.put('/alerts/:alertId', webSocketController.updateBettingAlert);
router.delete('/alerts/:alertId', webSocketController.deleteBettingAlert);
router.get('/alerts/stats', webSocketController.getAlertStats);

// Betting opportunities
router.get('/opportunities', webSocketController.getBettingOpportunities);

export default router;