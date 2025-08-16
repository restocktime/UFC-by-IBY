import { Request, Response } from 'express';
import { ComplianceService, UserAcknowledgment } from './compliance.service';

export class ComplianceController {
  constructor(private complianceService: ComplianceService) {}

  /**
   * Get required disclaimers for a user
   */
  getRequiredDisclaimers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { jurisdiction } = req.query;
      const disclaimers = this.complianceService.getRequiredDisclaimers(jurisdiction as string);
      
      res.json({
        success: true,
        data: disclaimers,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch required disclaimers',
      });
    }
  };

  /**
   * Get pending acknowledgments for a user
   */
  getPendingAcknowledgments = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { jurisdiction } = req.query;
      
      const pendingAcknowledgments = this.complianceService.getPendingAcknowledgments(
        userId,
        jurisdiction as string
      );
      
      res.json({
        success: true,
        data: pendingAcknowledgments,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pending acknowledgments',
      });
    }
  };

  /**
   * Record user acknowledgment
   */
  recordAcknowledgment = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { disclaimerId, version } = req.body;
      
      const acknowledgment: UserAcknowledgment = {
        userId,
        disclaimerId,
        version,
        acknowledgedAt: new Date(),
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
      };
      
      this.complianceService.recordAcknowledgment(acknowledgment);
      
      res.json({
        success: true,
        message: 'Acknowledgment recorded successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to record acknowledgment',
      });
    }
  };

  /**
   * Get compliance indicators for content type
   */
  getComplianceIndicators = async (req: Request, res: Response): Promise<void> => {
    try {
      const { contentType } = req.params;
      
      if (!['prediction', 'odds', 'analysis'].includes(contentType)) {
        res.status(400).json({
          success: false,
          error: 'Invalid content type',
        });
        return;
      }
      
      const indicators = this.complianceService.generateComplianceIndicators(
        contentType as 'prediction' | 'odds' | 'analysis'
      );
      
      res.json({
        success: true,
        data: indicators,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to generate compliance indicators',
      });
    }
  };

  /**
   * Validate content compliance for a user
   */
  validateContentCompliance = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, contentType } = req.params;
      const { jurisdiction } = req.query;
      
      if (!['prediction', 'odds', 'analysis'].includes(contentType)) {
        res.status(400).json({
          success: false,
          error: 'Invalid content type',
        });
        return;
      }
      
      const validation = this.complianceService.validateContentCompliance(
        userId,
        contentType as 'prediction' | 'odds' | 'analysis',
        jurisdiction as string
      );
      
      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to validate content compliance',
      });
    }
  };

  /**
   * Get user's acknowledgment history
   */
  getAcknowledgmentHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      
      const history = this.complianceService.getUserAcknowledgmentHistory(userId);
      
      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch acknowledgment history',
      });
    }
  };

  /**
   * Get disclaimer by ID
   */
  getDisclaimer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { disclaimerId } = req.params;
      
      const disclaimer = this.complianceService.getDisclaimer(disclaimerId);
      
      if (!disclaimer) {
        res.status(404).json({
          success: false,
          error: 'Disclaimer not found',
        });
        return;
      }
      
      res.json({
        success: true,
        data: disclaimer,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch disclaimer',
      });
    }
  };
}