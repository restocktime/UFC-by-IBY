import { Router } from 'express';
import { ProxyHealthController } from '../controllers/proxy-health.controller';

const router = Router();
const proxyHealthController = new ProxyHealthController();

/**
 * @route GET /api/proxy-health
 * @desc Get comprehensive proxy infrastructure health status
 * @access Public
 */
router.get('/', proxyHealthController.getHealthStatus.bind(proxyHealthController));

/**
 * @route GET /api/proxy-health/proxy/stats
 * @desc Get detailed proxy statistics
 * @access Public
 */
router.get('/proxy/stats', proxyHealthController.getProxyStats.bind(proxyHealthController));

/**
 * @route GET /api/proxy-health/proxy/test/:host/:port
 * @desc Test connectivity of a specific proxy endpoint
 * @access Public
 */
router.get('/proxy/test/:host/:port', proxyHealthController.testProxyConnectivity.bind(proxyHealthController));

/**
 * @route POST /api/proxy-health/proxy/rotate
 * @desc Force proxy rotation
 * @access Public
 */
router.post('/proxy/rotate', proxyHealthController.rotateProxy.bind(proxyHealthController));

/**
 * @route GET /api/proxy-health/cache/stats
 * @desc Get cache statistics and memory usage
 * @access Public
 */
router.get('/cache/stats', proxyHealthController.getCacheStats.bind(proxyHealthController));

/**
 * @route POST /api/proxy-health/cache/clear
 * @desc Clear cache by namespace or entirely
 * @access Public
 */
router.post('/cache/clear', proxyHealthController.clearCache.bind(proxyHealthController));

/**
 * @route GET /api/proxy-health/queue/stats
 * @desc Get request queue statistics
 * @query apiSource - Optional API source to filter stats
 * @access Public
 */
router.get('/queue/stats', proxyHealthController.getQueueStats.bind(proxyHealthController));

/**
 * @route POST /api/proxy-health/queue/clear/:apiSource
 * @desc Clear request queue for specific API source
 * @access Public
 */
router.post('/queue/clear/:apiSource', proxyHealthController.clearQueue.bind(proxyHealthController));

export default router;