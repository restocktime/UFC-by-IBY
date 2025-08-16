import { Router } from 'express';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

const router = Router();
const complianceService = new ComplianceService();
const complianceController = new ComplianceController(complianceService);

// Get required disclaimers
router.get('/disclaimers/required', complianceController.getRequiredDisclaimers);

// Get specific disclaimer
router.get('/disclaimers/:disclaimerId', complianceController.getDisclaimer);

// Get compliance indicators for content type
router.get('/indicators/:contentType', complianceController.getComplianceIndicators);

// User-specific compliance endpoints
router.get('/users/:userId/pending-acknowledgments', complianceController.getPendingAcknowledgments);
router.post('/users/:userId/acknowledgments', complianceController.recordAcknowledgment);
router.get('/users/:userId/acknowledgment-history', complianceController.getAcknowledgmentHistory);

// Content compliance validation
router.get('/users/:userId/validate/:contentType', complianceController.validateContentCompliance);

export { router as complianceRoutes, complianceService };