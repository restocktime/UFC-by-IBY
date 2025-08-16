import { OddsSnapshot, OddsTimeSeries, MovementAlert, ArbitrageOpportunity } from '@ufc-platform/shared';

/**
 * Odds movement analysis data
 */
export interface OddsMovementData {
  fightId: string;
  snapshots: OddsSnapshot[];
  movements: MovementAlert[];
  arbitrageOpportunities: ArbitrageOpportunity[];
}

/**
 * Market consensus information
 */
export interface MarketConsensus {
  averageImpliedProbability: [number, number];
  standardDeviation: number;
  bookmakerCount: number;
  consensusStrength: number; // 0-1 scale
}

/**
 * Line movement metrics
 */
export interface LineMovementMetrics {
  totalMovement: number; // Total percentage change from opening
  movementVelocity: number; // Rate of change per hour
  reversalCount: number; // Number of direction changes
  steamMoves: number; // Number of significant rapid movements
  closingLineValue: number; // Difference between opening and closing
}

/**
 * Bookmaker confidence metrics
 */
export interface BookmakerConfidence {
  sharpBookmakers: string[]; // List of sharp bookmaker names
  publicBookmakers: string[]; // List of public bookmaker names
  sharpConsensus: [number, number]; // Sharp money consensus
  publicConsensus: [number, number]; // Public money consensus
  sharpPublicDivergence: number; // Difference between sharp and public
}

/**
 * Extracted odds-based features ready for ML models
 */
export interface OddsFeatures {
  // Implied probability features
  openingImpliedProbability: [number, number];
  closingImpliedProbability: [number, number];
  currentImpliedProbability: [number, number];
  
  // Market consensus features
  marketConsensusStrength: number;
  bookmakerAgreement: number;
  impliedProbabilityVariance: number;
  
  // Line movement features
  totalLineMovement: number;
  lineMovementVelocity: number;
  lineReversalCount: number;
  steamMoveCount: number;
  
  // Market efficiency features
  closingLineValue: number;
  arbitrageOpportunityCount: number;
  maxArbitrageProfit: number;
  
  // Bookmaker confidence features
  sharpMoneyPercentage: number;
  publicMoneyPercentage: number;
  sharpPublicDivergence: number;
  
  // Volume and liquidity features
  averageVolume: number;
  volumeSpike: number;
  liquidityScore: number;
  
  // Method and round betting features
  methodBettingVariance: number;
  roundBettingVariance: number;
  favoriteMethodOdds: number;
  favoriteRoundOdds: number;
}

/**
 * Configuration for odds feature extraction
 */
export interface OddsFeatureConfig {
  steamMoveThreshold: number; // Percentage change to qualify as steam move
  significantMoveThreshold: number; // Percentage change for significant movement
  sharpBookmakers: string[]; // List of sharp bookmaker identifiers
  publicBookmakers: string[]; // List of public bookmaker identifiers
  volumeSpikeFactor: number; // Multiplier for volume spike detection
  arbitrageMinProfit: number; // Minimum profit percentage for arbitrage
}

/**
 * OddsFeatureExtractor class for extracting ML-ready features from odds data
 */
export class OddsFeatureExtractor {
  private config: OddsFeatureConfig;

  constructor(config: OddsFeatureConfig = {
    steamMoveThreshold: 5.0, // 5% change
    significantMoveThreshold: 2.0, // 2% change
    sharpBookmakers: ['Pinnacle', 'Bookmaker', 'CRIS'],
    publicBookmakers: ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars'],
    volumeSpikeFactor: 2.0,
    arbitrageMinProfit: 1.0 // 1% minimum profit
  }) {
    this.config = config;
  }

  /**
   * Extract all odds-based features for a fight
   */
  extractFeatures(oddsData: OddsMovementData): OddsFeatures {
    const snapshots = this.sortSnapshotsByTime(oddsData.snapshots);
    const openingSnapshot = snapshots[0];
    const closingSnapshot = snapshots[snapshots.length - 1];
    
    const marketConsensus = this.calculateMarketConsensus(snapshots);
    const lineMovement = this.calculateLineMovementMetrics(snapshots);
    const bookmakerConfidence = this.calculateBookmakerConfidence(snapshots);
    
    return {
      // Implied probability features
      openingImpliedProbability: this.calculateImpliedProbability(openingSnapshot.moneyline),
      closingImpliedProbability: this.calculateImpliedProbability(closingSnapshot.moneyline),
      currentImpliedProbability: this.calculateImpliedProbability(closingSnapshot.moneyline),
      
      // Market consensus features
      marketConsensusStrength: marketConsensus.consensusStrength,
      bookmakerAgreement: this.calculateBookmakerAgreement(snapshots),
      impliedProbabilityVariance: marketConsensus.standardDeviation,
      
      // Line movement features
      totalLineMovement: lineMovement.totalMovement,
      lineMovementVelocity: lineMovement.movementVelocity,
      lineReversalCount: lineMovement.reversalCount,
      steamMoveCount: lineMovement.steamMoves,
      
      // Market efficiency features
      closingLineValue: lineMovement.closingLineValue,
      arbitrageOpportunityCount: oddsData.arbitrageOpportunities.length,
      maxArbitrageProfit: this.calculateMaxArbitrageProfit(oddsData.arbitrageOpportunities),
      
      // Bookmaker confidence features
      sharpMoneyPercentage: this.calculateImpliedProbability(bookmakerConfidence.sharpConsensus)[0],
      publicMoneyPercentage: this.calculateImpliedProbability(bookmakerConfidence.publicConsensus)[0],
      sharpPublicDivergence: bookmakerConfidence.sharpPublicDivergence,
      
      // Volume and liquidity features
      averageVolume: this.calculateAverageVolume(snapshots),
      volumeSpike: this.detectVolumeSpikes(snapshots),
      liquidityScore: this.calculateLiquidityScore(snapshots),
      
      // Method and round betting features
      methodBettingVariance: this.calculateMethodBettingVariance(snapshots),
      roundBettingVariance: this.calculateRoundBettingVariance(snapshots),
      favoriteMethodOdds: this.getFavoriteMethodOdds(closingSnapshot),
      favoriteRoundOdds: this.getFavoriteRoundOdds(closingSnapshot)
    };
  }

  /**
   * Calculate implied probability from moneyline odds
   */
  calculateImpliedProbability(moneyline: { fighter1: number; fighter2: number }): [number, number] {
    const prob1 = this.oddsToImpliedProbability(moneyline.fighter1);
    const prob2 = this.oddsToImpliedProbability(moneyline.fighter2);
    
    // Normalize to remove vig (bookmaker margin)
    const total = prob1 + prob2;
    return [prob1 / total, prob2 / total];
  }

  /**
   * Convert American odds to implied probability
   */
  private oddsToImpliedProbability(odds: number): number {
    if (odds > 0) {
      return 100 / (odds + 100);
    } else {
      return Math.abs(odds) / (Math.abs(odds) + 100);
    }
  }

  /**
   * Sort snapshots by timestamp
   */
  private sortSnapshotsByTime(snapshots: OddsSnapshot[]): OddsSnapshot[] {
    return [...snapshots].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Calculate market consensus metrics
   */
  private calculateMarketConsensus(snapshots: OddsSnapshot[]): MarketConsensus {
    if (snapshots.length === 0) {
      return {
        averageImpliedProbability: [0.5, 0.5],
        standardDeviation: 0,
        bookmakerCount: 0,
        consensusStrength: 0
      };
    }

    // Get latest snapshot from each bookmaker
    const latestByBookmaker = new Map<string, OddsSnapshot>();
    snapshots.forEach(snapshot => {
      const existing = latestByBookmaker.get(snapshot.sportsbook);
      if (!existing || snapshot.timestamp > existing.timestamp) {
        latestByBookmaker.set(snapshot.sportsbook, snapshot);
      }
    });

    const latestSnapshots = Array.from(latestByBookmaker.values());
    const probabilities = latestSnapshots.map(s => this.calculateImpliedProbability(s.moneyline));
    
    // Calculate average implied probability
    const avgProb1 = probabilities.reduce((sum, p) => sum + p[0], 0) / probabilities.length;
    const avgProb2 = probabilities.reduce((sum, p) => sum + p[1], 0) / probabilities.length;
    
    // Calculate standard deviation
    const variance1 = probabilities.reduce((sum, p) => sum + Math.pow(p[0] - avgProb1, 2), 0) / probabilities.length;
    const variance2 = probabilities.reduce((sum, p) => sum + Math.pow(p[1] - avgProb2, 2), 0) / probabilities.length;
    const avgVariance = (variance1 + variance2) / 2;
    const standardDeviation = Math.sqrt(avgVariance);
    
    // Consensus strength (inverse of standard deviation)
    const consensusStrength = Math.max(0, 1 - (standardDeviation * 10)); // Scale appropriately
    
    return {
      averageImpliedProbability: [avgProb1, avgProb2],
      standardDeviation,
      bookmakerCount: latestSnapshots.length,
      consensusStrength
    };
  }

  /**
   * Calculate line movement metrics
   */
  private calculateLineMovementMetrics(snapshots: OddsSnapshot[]): LineMovementMetrics {
    if (snapshots.length < 2) {
      return {
        totalMovement: 0,
        movementVelocity: 0,
        reversalCount: 0,
        steamMoves: 0,
        closingLineValue: 0
      };
    }

    const opening = snapshots[0];
    const closing = snapshots[snapshots.length - 1];
    
    // Calculate total movement (change in implied probability)
    const openingProb = this.calculateImpliedProbability(opening.moneyline);
    const closingProb = this.calculateImpliedProbability(closing.moneyline);
    const totalMovement = Math.abs(openingProb[0] - closingProb[0]);
    
    // Calculate movement velocity (change per hour)
    const timeSpan = (closing.timestamp.getTime() - opening.timestamp.getTime()) / (1000 * 60 * 60);
    const movementVelocity = timeSpan > 0 ? totalMovement / timeSpan : 0;
    
    // Count reversals and steam moves
    let reversalCount = 0;
    let steamMoves = 0;
    let lastDirection = 0;
    
    for (let i = 1; i < snapshots.length; i++) {
      const prevProb = this.calculateImpliedProbability(snapshots[i - 1].moneyline);
      const currProb = this.calculateImpliedProbability(snapshots[i].moneyline);
      
      const change = currProb[0] - prevProb[0];
      const percentChange = Math.abs(change / prevProb[0]) * 100;
      
      // Check for steam move
      if (percentChange >= this.config.steamMoveThreshold) {
        steamMoves++;
      }
      
      // Check for reversal
      const direction = change > 0 ? 1 : change < 0 ? -1 : 0;
      if (direction !== 0 && lastDirection !== 0 && direction !== lastDirection) {
        reversalCount++;
      }
      if (direction !== 0) {
        lastDirection = direction;
      }
    }
    
    return {
      totalMovement,
      movementVelocity,
      reversalCount,
      steamMoves,
      closingLineValue: totalMovement
    };
  }

  /**
   * Calculate bookmaker confidence metrics
   */
  private calculateBookmakerConfidence(snapshots: OddsSnapshot[]): BookmakerConfidence {
    const sharpSnapshots = snapshots.filter(s => 
      this.config.sharpBookmakers.includes(s.sportsbook)
    );
    const publicSnapshots = snapshots.filter(s => 
      this.config.publicBookmakers.includes(s.sportsbook)
    );
    
    // Calculate consensus for each group
    const sharpConsensus = this.calculateGroupConsensus(sharpSnapshots);
    const publicConsensus = this.calculateGroupConsensus(publicSnapshots);
    
    // Calculate divergence
    const sharpPublicDivergence = Math.abs(sharpConsensus[0] - publicConsensus[0]);
    
    return {
      sharpBookmakers: this.config.sharpBookmakers,
      publicBookmakers: this.config.publicBookmakers,
      sharpConsensus,
      publicConsensus,
      sharpPublicDivergence
    };
  }

  /**
   * Calculate consensus for a group of snapshots
   */
  private calculateGroupConsensus(snapshots: OddsSnapshot[]): [number, number] {
    if (snapshots.length === 0) return [0.5, 0.5];
    
    const probabilities = snapshots.map(s => this.calculateImpliedProbability(s.moneyline));
    const avgProb1 = probabilities.reduce((sum, p) => sum + p[0], 0) / probabilities.length;
    const avgProb2 = probabilities.reduce((sum, p) => sum + p[1], 0) / probabilities.length;
    
    return [avgProb1, avgProb2];
  }

  /**
   * Calculate bookmaker agreement score
   */
  private calculateBookmakerAgreement(snapshots: OddsSnapshot[]): number {
    const consensus = this.calculateMarketConsensus(snapshots);
    return consensus.consensusStrength;
  }

  /**
   * Calculate maximum arbitrage profit
   */
  private calculateMaxArbitrageProfit(opportunities: ArbitrageOpportunity[]): number {
    if (opportunities.length === 0) return 0;
    return Math.max(...opportunities.map(opp => opp.profit));
  }

  /**
   * Calculate average volume across snapshots
   */
  private calculateAverageVolume(snapshots: OddsSnapshot[]): number {
    const volumeSnapshots = snapshots.filter(s => s.volume !== undefined);
    if (volumeSnapshots.length === 0) return 0;
    
    const totalVolume = volumeSnapshots.reduce((sum, s) => sum + (s.volume || 0), 0);
    return totalVolume / volumeSnapshots.length;
  }

  /**
   * Detect volume spikes
   */
  private detectVolumeSpikes(snapshots: OddsSnapshot[]): number {
    const volumeSnapshots = snapshots.filter(s => s.volume !== undefined);
    if (volumeSnapshots.length < 2) return 0;
    
    const avgVolume = this.calculateAverageVolume(snapshots);
    const spikes = volumeSnapshots.filter(s => 
      (s.volume || 0) > avgVolume * this.config.volumeSpikeFactor
    );
    
    return spikes.length;
  }

  /**
   * Calculate liquidity score based on number of bookmakers and volume
   */
  private calculateLiquidityScore(snapshots: OddsSnapshot[]): number {
    const uniqueBookmakers = new Set(snapshots.map(s => s.sportsbook)).size;
    const avgVolume = this.calculateAverageVolume(snapshots);
    
    // Normalize bookmaker count (assume max 20 bookmakers)
    const bookmakerScore = Math.min(1, uniqueBookmakers / 20);
    
    // Normalize volume (assume max volume of 1000000)
    const volumeScore = Math.min(1, avgVolume / 1000000);
    
    return (bookmakerScore + volumeScore) / 2;
  }

  /**
   * Calculate variance in method betting odds
   */
  private calculateMethodBettingVariance(snapshots: OddsSnapshot[]): number {
    if (snapshots.length === 0) return 0;
    
    const koOdds = snapshots.map(s => s.method.ko);
    const submissionOdds = snapshots.map(s => s.method.submission);
    const decisionOdds = snapshots.map(s => s.method.decision);
    
    const koVariance = this.calculateVariance(koOdds);
    const submissionVariance = this.calculateVariance(submissionOdds);
    const decisionVariance = this.calculateVariance(decisionOdds);
    
    return (koVariance + submissionVariance + decisionVariance) / 3;
  }

  /**
   * Calculate variance in round betting odds
   */
  private calculateRoundBettingVariance(snapshots: OddsSnapshot[]): number {
    if (snapshots.length === 0) return 0;
    
    const round1Odds = snapshots.map(s => s.rounds.round1);
    const round2Odds = snapshots.map(s => s.rounds.round2);
    const round3Odds = snapshots.map(s => s.rounds.round3);
    
    const round1Variance = this.calculateVariance(round1Odds);
    const round2Variance = this.calculateVariance(round2Odds);
    const round3Variance = this.calculateVariance(round3Odds);
    
    return (round1Variance + round2Variance + round3Variance) / 3;
  }

  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return variance;
  }

  /**
   * Get favorite method odds from latest snapshot
   */
  private getFavoriteMethodOdds(snapshot: OddsSnapshot): number {
    const methods = [snapshot.method.ko, snapshot.method.submission, snapshot.method.decision];
    return Math.min(...methods); // Lowest odds = favorite
  }

  /**
   * Get favorite round odds from latest snapshot
   */
  private getFavoriteRoundOdds(snapshot: OddsSnapshot): number {
    const rounds = [
      snapshot.rounds.round1,
      snapshot.rounds.round2,
      snapshot.rounds.round3,
      snapshot.rounds.round4 || Infinity,
      snapshot.rounds.round5 || Infinity
    ].filter(r => r !== Infinity);
    
    return Math.min(...rounds); // Lowest odds = favorite
  }

  /**
   * Detect arbitrage opportunities in current odds
   */
  detectArbitrageOpportunities(snapshots: OddsSnapshot[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Get latest snapshot from each bookmaker
    const latestByBookmaker = new Map<string, OddsSnapshot>();
    snapshots.forEach(snapshot => {
      const existing = latestByBookmaker.get(snapshot.sportsbook);
      if (!existing || snapshot.timestamp > existing.timestamp) {
        latestByBookmaker.set(snapshot.sportsbook, snapshot);
      }
    });

    const latestSnapshots = Array.from(latestByBookmaker.values());
    
    if (latestSnapshots.length < 2) return opportunities;
    
    // Find best odds for each fighter
    let bestOdds1 = -Infinity;
    let bestOdds2 = -Infinity;
    let bestBook1 = '';
    let bestBook2 = '';
    
    latestSnapshots.forEach(snapshot => {
      if (snapshot.moneyline.fighter1 > bestOdds1) {
        bestOdds1 = snapshot.moneyline.fighter1;
        bestBook1 = snapshot.sportsbook;
      }
      if (snapshot.moneyline.fighter2 > bestOdds2) {
        bestOdds2 = snapshot.moneyline.fighter2;
        bestBook2 = snapshot.sportsbook;
      }
    });
    
    // Calculate arbitrage profit
    const prob1 = this.oddsToImpliedProbability(bestOdds1);
    const prob2 = this.oddsToImpliedProbability(bestOdds2);
    const totalProb = prob1 + prob2;
    
    if (totalProb < 1) {
      const profit = ((1 / totalProb) - 1) * 100;
      
      if (profit >= this.config.arbitrageMinProfit) {
        const stake1 = prob1 / totalProb;
        const stake2 = prob2 / totalProb;
        
        opportunities.push({
          fightId: latestSnapshots[0].fightId,
          sportsbooks: [bestBook1, bestBook2],
          profit,
          stakes: {
            [bestBook1]: stake1,
            [bestBook2]: stake2
          },
          expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
        });
      }
    }
    
    return opportunities;
  }

  /**
   * Calculate closing line value for a bet
   */
  calculateClosingLineValue(
    betOdds: number,
    closingOdds: number,
    betSide: 'fighter1' | 'fighter2'
  ): number {
    const betProb = this.oddsToImpliedProbability(betOdds);
    const closingProb = this.oddsToImpliedProbability(closingOdds);
    
    // Positive CLV means you got better odds (lower implied probability) than closing
    // If you bet at lower implied probability than closing, you got better value
    return closingProb - betProb;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OddsFeatureConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): OddsFeatureConfig {
    return { ...this.config };
  }
}