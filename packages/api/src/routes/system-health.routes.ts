import { Router } from 'express';
import { SystemHealthController } from '../controllers/system-health.controller';

const router = Router();
const systemHealthController = new SystemHealthController();

// Health Check Routes
router.get('/health', systemHealthController.getHealthCheck.bind(systemHealthController));
router.get('/health/detailed', systemHealthController.getDetailedHealthCheck.bind(systemHealthController));
router.post('/health/check', systemHealthController.triggerHealthCheck.bind(systemHealthController));

// Performance Monitoring Routes
router.get('/performance/dashboard', systemHealthController.getPerformanceDashboard.bind(systemHealthController));
router.get('/performance/prediction-accuracy', systemHealthController.getPredictionAccuracy.bind(systemHealthController));
router.get('/performance/api', systemHealthController.getAPIPerformance.bind(systemHealthController));

// Alert Management Routes
router.get('/alerts', systemHealthController.getAlerts.bind(systemHealthController));
router.post('/alerts/configure', systemHealthController.configureAlert.bind(systemHealthController));

// System Metrics Routes
router.get('/metrics/system', systemHealthController.getSystemMetrics.bind(systemHealthController));
router.get('/metrics/database', systemHealthController.getDatabasePerformance.bind(systemHealthController));

// System Information Routes
router.get('/info', systemHealthController.getSystemInfo.bind(systemHealthController));

export default router;