/**
 * ESPN API Integration Example
 * 
 * This example demonstrates how to use the ESPN API connector and related services
 * for real-time fight data and fighter analytics.
 */

import { ESPNAPIConnector } from '../ingestion/connectors/espn-api.connector.js';
import { LiveFightTrackerService } from '../services/live-fight-tracker.service.js';
import { FighterAnalyticsService } from '../services/fighter-analytics.service.js';
import { sourceConfigManager, initializeConfigs } from '../ingestion/config/source-configs.js';

async function runESPNIntegrationExample() {
  console.log('🏟️  ESPN API Integration Example');
  console.log('================================\n');

  try {
    // Initialize configurations
    initializeConfigs();

    // Create ESPN API connector
    const espnConnector = new ESPNAPIConnector();
    console.log('✅ ESPN API Connector initialized');

    // Example 1: Sync MMA Events from ESPN
    console.log('\n📅 Syncing MMA Events from ESPN...');
    const eventsResult = await espnConnector.syncMMAEvents();
    console.log(`   - Processed: ${eventsResult.recordsProcessed} events`);
    console.log(`   - Skipped: ${eventsResult.recordsSkipped} events`);
    console.log(`   - Errors: ${eventsResult.errors.length}`);
    console.log(`   - Processing time: ${eventsResult.processingTimeMs}ms`);

    // Example 2: Sync Fighter Rankings
    console.log('\n🥊 Syncing Fighter Rankings from ESPN...');
    const fightersResult = await espnConnector.syncFighterRankings();
    console.log(`   - Processed: ${fightersResult.recordsProcessed} fighters`);
    console.log(`   - Skipped: ${fightersResult.recordsSkipped} fighters`);
    console.log(`   - Errors: ${fightersResult.errors.length}`);
    console.log(`   - Processing time: ${fightersResult.processingTimeMs}ms`);

    // Example 3: Get Live Fight Data
    console.log('\n🔴 Getting Live Fight Data...');
    const eventId = 'test-event-1'; // Replace with actual event ID
    const liveFights = await espnConnector.getLiveFightData(eventId);
    console.log(`   - Found ${liveFights.length} live fights`);
    
    liveFights.forEach((fight, index) => {
      console.log(`   Fight ${index + 1}:`);
      console.log(`     - ID: ${fight.fightId}`);
      console.log(`     - Status: ${fight.status}`);
      console.log(`     - Round: ${fight.currentRound || 'N/A'}`);
      console.log(`     - Time: ${fight.timeRemaining || 'N/A'}`);
    });

    // Example 4: Live Fight Tracking
    console.log('\n📡 Setting up Live Fight Tracking...');
    const liveTracker = new LiveFightTrackerService(espnConnector);
    
    // Set up event listeners
    liveTracker.on('fightUpdate', (update) => {
      console.log(`   🔄 Fight Update: ${update.fightId}`);
      console.log(`      Status: ${update.status}`);
      console.log(`      Changes: ${update.significantChanges.join(', ')}`);
    });

    liveTracker.on('roundChange', (update) => {
      console.log(`   🔔 Round Change: ${update.fightId} - Round ${update.currentRound}`);
    });

    liveTracker.on('fightEnded', (update) => {
      console.log(`   🏁 Fight Ended: ${update.fightId}`);
    });

    // Start tracking (if there are live fights)
    if (liveFights.length > 0) {
      await liveTracker.startTrackingEvent(eventId);
      console.log(`   ✅ Started tracking event: ${eventId}`);
      
      // Get tracking stats
      const stats = liveTracker.getTrackingStats();
      console.log(`   - Tracked events: ${stats.trackedEvents}`);
      console.log(`   - Tracked fights: ${stats.trackedFights}`);
      console.log(`   - Poll interval: ${stats.pollInterval}ms`);
    } else {
      console.log('   ⚠️  No live fights found to track');
    }

    // Example 5: Fighter Analytics
    console.log('\n📊 Fighter Analytics Example...');
    const analyticsService = new FighterAnalyticsService(espnConnector);
    
    // Note: This would require actual fighter IDs from your database
    const sampleFighterId = 'espn_athlete-1';
    
    try {
      const fighterAnalytics = await analyticsService.getFighterAnalytics(sampleFighterId);
      console.log(`   ✅ Analytics for: ${fighterAnalytics.fighterName}`);
      console.log(`   - Recent win rate: ${fighterAnalytics.recentPerformance.winRate.toFixed(1)}%`);
      console.log(`   - Finish rate: ${fighterAnalytics.recentPerformance.finishRate.toFixed(1)}%`);
      console.log(`   - Form trend: ${fighterAnalytics.predictionFactors.formTrend}`);
      console.log(`   - Experience level: ${fighterAnalytics.historicalTrends.experienceLevel}`);
      console.log(`   - Injury risk: ${fighterAnalytics.predictionFactors.injuryRisk}%`);
      
      // Training camp info
      console.log(`   - Training camp: ${fighterAnalytics.trainingCampInfo.currentCamp.name}`);
      console.log(`   - Location: ${fighterAnalytics.trainingCampInfo.currentCamp.location}`);
      console.log(`   - Head coach: ${fighterAnalytics.trainingCampInfo.currentCamp.headCoach}`);
      
    } catch (error: any) {
      console.log(`   ⚠️  Fighter analytics example skipped: ${error.message}`);
    }

    // Example 6: Fighter Comparison
    console.log('\n⚔️  Fighter Comparison Example...');
    const fighter1Id = 'espn_athlete-1';
    const fighter2Id = 'espn_athlete-2';
    
    try {
      const comparison = await analyticsService.compareFighters(fighter1Id, fighter2Id);
      console.log(`   ✅ Matchup: ${comparison.fighter1.fighterName} vs ${comparison.fighter2.fighterName}`);
      console.log(`   - Favored fighter: ${comparison.matchupAnalysis.prediction.favoredFighter}`);
      console.log(`   - Confidence: ${comparison.matchupAnalysis.prediction.confidence}%`);
      console.log(`   - Predicted method: ${comparison.matchupAnalysis.prediction.method}`);
      console.log(`   - Key factors: ${comparison.matchupAnalysis.keyFactors.join(', ')}`);
      
    } catch (error: any) {
      console.log(`   ⚠️  Fighter comparison example skipped: ${error.message}`);
    }

    // Example 7: Manual Polling
    console.log('\n🔄 Manual Polling Example...');
    if (liveFights.length > 0) {
      try {
        const updates = await liveTracker.pollEventFights(eventId);
        console.log(`   ✅ Manual poll completed: ${updates.length} updates`);
        
        updates.forEach((update, index) => {
          console.log(`   Update ${index + 1}:`);
          console.log(`     - Fight: ${update.fightId}`);
          console.log(`     - Changes: ${update.significantChanges.join(', ')}`);
        });
        
      } catch (error: any) {
        console.log(`   ⚠️  Manual polling failed: ${error.message}`);
      }
    }

    // Example 8: Configuration and Status
    console.log('\n⚙️  Configuration and Status...');
    const espnConfig = sourceConfigManager.getConfig('ESPN_API');
    if (espnConfig) {
      console.log(`   - Base URL: ${espnConfig.baseUrl}`);
      console.log(`   - Rate limit: ${espnConfig.rateLimit.requestsPerMinute}/min`);
      console.log(`   - Max retries: ${espnConfig.retryConfig.maxRetries}`);
      console.log(`   - Available endpoints: ${Object.keys(espnConfig.endpoints).join(', ')}`);
    }

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    liveTracker.stopAllTracking();
    liveTracker.destroy();
    console.log('   ✅ Live tracking stopped and cleaned up');

    console.log('\n✨ ESPN Integration Example completed successfully!');

  } catch (error: any) {
    console.error('❌ ESPN Integration Example failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Example usage patterns for different scenarios
export class ESPNIntegrationExamples {
  
  /**
   * Example: Real-time event monitoring
   */
  static async monitorLiveEvent(eventId: string): Promise<void> {
    const espnConnector = new ESPNAPIConnector();
    const liveTracker = new LiveFightTrackerService(espnConnector);

    // Set up comprehensive event monitoring
    liveTracker.on('fightUpdate', (update) => {
      console.log(`Fight ${update.fightId}: ${update.significantChanges.join(', ')}`);
    });

    liveTracker.on('knockdown', (update) => {
      console.log(`🥊 KNOCKDOWN in fight ${update.fightId}!`);
    });

    liveTracker.on('submissionAttempt', (update) => {
      console.log(`🤼 Submission attempt in fight ${update.fightId}!`);
    });

    await liveTracker.startTrackingEvent(eventId);
    console.log(`Started monitoring event: ${eventId}`);
  }

  /**
   * Example: Batch fighter analysis
   */
  static async analyzeFighterBatch(fighterIds: string[]): Promise<void> {
    const analyticsService = new FighterAnalyticsService();

    for (const fighterId of fighterIds) {
      try {
        const analytics = await analyticsService.getFighterAnalytics(fighterId);
        console.log(`${analytics.fighterName}: ${analytics.predictionFactors.formTrend} form, ${analytics.recentPerformance.winRate}% win rate`);
      } catch (error: any) {
        console.log(`Failed to analyze ${fighterId}: ${error.message}`);
      }
    }
  }

  /**
   * Example: Tournament bracket analysis
   */
  static async analyzeTournamentBracket(matchups: Array<[string, string]>): Promise<void> {
    const analyticsService = new FighterAnalyticsService();

    for (const [fighter1Id, fighter2Id] of matchups) {
      try {
        const comparison = await analyticsService.compareFighters(fighter1Id, fighter2Id);
        console.log(`${comparison.fighter1.fighterName} vs ${comparison.fighter2.fighterName}:`);
        console.log(`  Prediction: ${comparison.matchupAnalysis.prediction.favoredFighter} (${comparison.matchupAnalysis.prediction.confidence}%)`);
      } catch (error: any) {
        console.log(`Failed to analyze matchup: ${error.message}`);
      }
    }
  }

  /**
   * Example: Injury risk assessment
   */
  static async assessInjuryRisks(fighterIds: string[]): Promise<void> {
    const analyticsService = new FighterAnalyticsService();

    const highRiskFighters = [];

    for (const fighterId of fighterIds) {
      try {
        const analytics = await analyticsService.getFighterAnalytics(fighterId);
        if (analytics.predictionFactors.injuryRisk > 70) {
          highRiskFighters.push({
            name: analytics.fighterName,
            risk: analytics.predictionFactors.injuryRisk,
            recentInjuries: analytics.injuryReports.length
          });
        }
      } catch (error: any) {
        console.log(`Failed to assess ${fighterId}: ${error.message}`);
      }
    }

    console.log('High injury risk fighters:');
    highRiskFighters.forEach(fighter => {
      console.log(`  ${fighter.name}: ${fighter.risk}% risk (${fighter.recentInjuries} recent injuries)`);
    });
  }
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runESPNIntegrationExample().catch(console.error);
}

export { runESPNIntegrationExample };