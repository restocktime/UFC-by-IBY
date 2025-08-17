import { Request, Response } from 'express';
import { UFC319IntegrationService } from '../services/ufc319-integration.service.js';
import { UFC319OddsService } from '../services/ufc319-odds.service.js';

export class UFC319Controller {
  private ufc319Service: UFC319IntegrationService;
  private oddsService: UFC319OddsService;

  constructor() {
    this.ufc319Service = new UFC319IntegrationService();
    this.oddsService = new UFC319OddsService();
  }

  /**
   * Integrate UFC 319 event data
   * POST /api/ufc319/integrate
   */
  public integrateEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.ufc319Service.integrateUFC319Event();
      
      res.status(200).json({
        success: true,
        message: 'UFC 319 event integration completed successfully',
        data: {
          event: result.event,
          fightersCount: result.fighters.length,
          fightsCount: result.fights.length,
          ingestionSummary: {
            totalProcessed: result.ingestionResults.reduce((sum, r) => sum + r.recordsProcessed, 0),
            totalSkipped: result.ingestionResults.reduce((sum, r) => sum + r.recordsSkipped, 0),
            totalErrors: result.ingestionResults.reduce((sum, r) => sum + r.errors.length, 0)
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to integrate UFC 319 event',
        error: error.message
      });
    }
  };

  /**
   * Get UFC 319 event data
   * GET /api/ufc319/event
   */
  public getEventData = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.ufc319Service.getUFC319Data();
      
      if (!data) {
        res.status(404).json({
          success: false,
          message: 'UFC 319 event data not found. Please integrate the event first.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          event: data.event,
          fighters: data.fighters,
          fights: data.fights,
          summary: {
            eventName: data.event.name,
            eventDate: data.event.date,
            fightersCount: data.fighters.length,
            fightsCount: data.fights.length,
            venue: data.event.venue
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to get UFC 319 event data',
        error: error.message
      });
    }
  };

  /**
   * Get UFC 319 fight card
   * GET /api/ufc319/fight-card
   */
  public getFightCard = async (req: Request, res: Response): Promise<void> => {
    try {
      const fightCard = await this.ufc319Service.getFightCardDetails();
      
      if (!fightCard.event) {
        res.status(404).json({
          success: false,
          message: 'UFC 319 fight card not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          event: fightCard.event,
          mainEvent: fightCard.mainEvent,
          mainCard: fightCard.mainCard,
          preliminaryCard: fightCard.preliminaryCard,
          totalFights: fightCard.fights.length,
          cardStructure: {
            mainEventCount: fightCard.mainEvent ? 1 : 0,
            mainCardCount: fightCard.mainCard.length,
            preliminaryCardCount: fightCard.preliminaryCard.length
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to get UFC 319 fight card',
        error: error.message
      });
    }
  };

  /**
   * Get specific fighter information
   * GET /api/ufc319/fighter/:fighterId
   */
  public getFighterDetails = async (req: Request, res: Response): Promise<void> => {
    try {
      const { fighterId } = req.params;
      const fighter = await this.ufc319Service.getFighterDetails(fighterId);
      
      if (!fighter) {
        res.status(404).json({
          success: false,
          message: `Fighter with ID ${fighterId} not found`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          fighter,
          profile: {
            name: fighter.name,
            nickname: fighter.nickname,
            record: fighter.record,
            physicalStats: fighter.physicalStats,
            rankings: fighter.rankings,
            camp: fighter.camp
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to get fighter details',
        error: error.message
      });
    }
  };

  /**
   * Discover and update events automatically
   * POST /api/ufc319/discover-events
   */
  public discoverEvents = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.ufc319Service.discoverAndUpdateEvents();
      
      res.status(200).json({
        success: true,
        message: 'Event discovery completed',
        data: {
          recordsProcessed: result.recordsProcessed,
          recordsSkipped: result.recordsSkipped,
          errors: result.errors,
          processingTimeMs: result.processingTimeMs
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to discover events',
        error: error.message
      });
    }
  };

  /**
   * Get integration status
   * GET /api/ufc319/status
   */
  public getIntegrationStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.ufc319Service.getUFC319Data();
      
      const status = {
        isIntegrated: !!data,
        hasEventData: !!data?.event,
        hasFighterData: (data?.fighters.length || 0) > 0,
        hasFightData: (data?.fights.length || 0) > 0,
        lastUpdated: data?.event?.lastUpdated || null,
        summary: data ? {
          eventName: data.event.name,
          eventDate: data.event.date,
          fightersCount: data.fighters.length,
          fightsCount: data.fights.length
        } : null
      };

      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to get integration status',
        error: error.message
      });
    }
  };

  /**
   * Integrate UFC 319 odds data
   * POST /api/ufc319/odds/integrate
   */
  public integrateOdds = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.oddsService.integrateUFC319Odds();
      
      res.status(200).json({
        success: true,
        message: 'UFC 319 odds integration completed successfully',
        data: {
          recordsProcessed: result.recordsProcessed,
          recordsSkipped: result.recordsSkipped,
          errors: result.errors,
          processingTimeMs: result.processingTimeMs
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to integrate UFC 319 odds',
        error: error.message
      });
    }
  };

  /**
   * Get live odds for UFC 319
   * GET /api/ufc319/odds/live
   */
  public getLiveOdds = async (req: Request, res: Response): Promise<void> => {
    try {
      const liveOdds = await this.oddsService.getLiveUFC319Odds();
      
      res.status(200).json({
        success: true,
        data: {
          event: liveOdds.eventId,
          fights: liveOdds.fights,
          totalFights: liveOdds.fights.length,
          lastUpdated: new Date().toISOString(),
          summary: {
            totalSportsbooks: new Set(
              liveOdds.fights.flatMap(f => f.odds.map(o => o.sportsbook))
            ).size,
            avgOddsAge: liveOdds.fights.length > 0 ? 
              liveOdds.fights.reduce((sum, f) => 
                sum + (Date.now() - f.lastUpdated.getTime()), 0
              ) / liveOdds.fights.length / 1000 / 60 : 0 // in minutes
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to get live odds',
        error: error.message
      });
    }
  };

  /**
   * Get historical odds for a specific fight
   * GET /api/ufc319/odds/history/:fightId
   */
  public getHistoricalOdds = async (req: Request, res: Response): Promise<void> => {
    try {
      const { fightId } = req.params;
      const { sportsbook } = req.query;
      
      const historicalData = await this.oddsService.getHistoricalOdds(
        fightId, 
        sportsbook as string
      );
      
      if (historicalData.length === 0) {
        res.status(404).json({
          success: false,
          message: `No historical odds found for fight ${fightId}`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          fightId,
          sportsbooks: historicalData.map(data => ({
            sportsbook: data.sportsbook,
            dataPoints: data.oddsHistory.length,
            trends: data.trends,
            firstRecord: data.oddsHistory[0]?.timestamp,
            lastRecord: data.oddsHistory[data.oddsHistory.length - 1]?.timestamp,
            history: data.oddsHistory
          }))
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to get historical odds',
        error: error.message
      });
    }
  };

  /**
   * Get odds comparison across sportsbooks
   * GET /api/ufc319/odds/comparison/:fightId
   */
  public getOddsComparison = async (req: Request, res: Response): Promise<void> => {
    try {
      const { fightId } = req.params;
      
      const historicalData = await this.oddsService.getHistoricalOdds(fightId);
      
      if (historicalData.length === 0) {
        res.status(404).json({
          success: false,
          message: `No odds found for fight ${fightId}`
        });
        return;
      }

      // Get latest odds from each sportsbook
      const latestOdds = historicalData.map(data => {
        const latest = data.oddsHistory[data.oddsHistory.length - 1];
        return {
          sportsbook: data.sportsbook,
          fighter1Odds: latest.fighter1Odds,
          fighter2Odds: latest.fighter2Odds,
          timestamp: latest.timestamp,
          trend: data.trends
        };
      });

      // Find best odds for each fighter
      const bestFighter1Odds = latestOdds.reduce((best, current) => 
        current.fighter1Odds > best.fighter1Odds ? current : best
      );
      
      const bestFighter2Odds = latestOdds.reduce((best, current) => 
        current.fighter2Odds > best.fighter2Odds ? current : best
      );

      // Calculate arbitrage opportunities
      const arbitrageOpportunity = this.calculateArbitrage(
        bestFighter1Odds.fighter1Odds,
        bestFighter2Odds.fighter2Odds
      );

      res.status(200).json({
        success: true,
        data: {
          fightId,
          comparison: latestOdds,
          bestOdds: {
            fighter1: {
              sportsbook: bestFighter1Odds.sportsbook,
              odds: bestFighter1Odds.fighter1Odds
            },
            fighter2: {
              sportsbook: bestFighter2Odds.sportsbook,
              odds: bestFighter2Odds.fighter2Odds
            }
          },
          arbitrage: arbitrageOpportunity,
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to get odds comparison',
        error: error.message
      });
    }
  };

  /**
   * Calculate arbitrage opportunity
   */
  private calculateArbitrage(fighter1Odds: number, fighter2Odds: number): {
    hasOpportunity: boolean;
    profitMargin?: number;
    stakes?: { fighter1: number; fighter2: number };
  } {
    // Convert American odds to decimal
    const decimal1 = fighter1Odds > 0 ? (fighter1Odds / 100) + 1 : (100 / Math.abs(fighter1Odds)) + 1;
    const decimal2 = fighter2Odds > 0 ? (fighter2Odds / 100) + 1 : (100 / Math.abs(fighter2Odds)) + 1;

    // Calculate implied probabilities
    const prob1 = 1 / decimal1;
    const prob2 = 1 / decimal2;
    const totalProb = prob1 + prob2;

    if (totalProb < 1) {
      // Arbitrage opportunity exists
      const profitMargin = (1 - totalProb) * 100;
      const totalStake = 100; // Assume $100 total stake
      
      return {
        hasOpportunity: true,
        profitMargin,
        stakes: {
          fighter1: totalStake * prob1,
          fighter2: totalStake * prob2
        }
      };
    }

    return { hasOpportunity: false };
  }
}