import { OddsAPIConnector } from '../connectors/odds-api.connector.js';
import { OddsRepository } from '../../repositories/odds.repository.js';
import { initializeConfigs } from '../config/source-configs.js';

/**
 * Example usage of the OddsAPIConnector
 * 
 * This example demonstrates how to:
 * 1. Initialize the connector with custom options
 * 2. Sync odds data from The Odds API
 * 3. Handle events and monitor the ingestion process
 * 4. Check API usage statistics
 */

async function main() {
  try {
    // Initialize configurations (loads API keys from environment)
    initializeConfigs();

    // Create odds repository
    const oddsRepository = new OddsRepository();

    // Create connector with custom movement detection options
    const connector = new OddsAPIConnector(oddsRepository, {
      minPercentageChange: 5,        // Detect movements >= 5%
      timeWindowMinutes: 15,         // Check for movements in 15-minute windows
      enableArbitrageDetection: true, // Enable arbitrage opportunity detection
      minArbitrageProfit: 2          // Minimum 2% profit for arbitrage alerts
    });

    // Set up event listeners
    connector.on('eventProcessed', (data) => {
      console.log(`✅ Processed event ${data.eventId}: ${data.bookmakers} bookmakers, ${data.oddsSnapshots} odds snapshots`);
    });

    connector.on('oddsMovement', (data) => {
      console.log(`📈 Odds movement detected for ${data.fightId} at ${data.sportsbook}: ${data.percentageChange.toFixed(2)}% (${data.movementType})`);
    });

    connector.on('syncComplete', (result) => {
      console.log(`🎯 Sync completed: ${result.recordsProcessed} processed, ${result.recordsSkipped} skipped, ${result.errors.length} errors`);
      console.log(`⏱️  Processing time: ${result.processingTimeMs}ms`);
    });

    connector.on('syncError', (error) => {
      console.error(`❌ Sync error: ${error.error}`);
    });

    connector.on('rateLimitHit', (data) => {
      console.warn(`⏳ Rate limit hit (${data.type}), waiting ${data.waitTime}ms`);
    });

    connector.on('circuitBreakerStateChange', (data) => {
      console.log(`🔌 Circuit breaker state changed to: ${data.state}`);
    });

    // Check API usage before syncing
    console.log('📊 Checking API usage...');
    const usage = await connector.getUsageStats();
    console.log(`API Usage: ${usage.requests_used}/${usage.requests_used + usage.requests_remaining} requests used`);

    // Sync MMA odds data
    console.log('🔄 Starting odds sync...');
    const result = await connector.syncMMAOdds();

    // Display results
    console.log('\n📋 Sync Results:');
    console.log(`- Records processed: ${result.recordsProcessed}`);
    console.log(`- Records skipped: ${result.recordsSkipped}`);
    console.log(`- Errors: ${result.errors.length}`);
    console.log(`- Processing time: ${result.processingTimeMs}ms`);

    if (result.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error.field}: ${error.message} (${error.severity})`);
      });
    }

    // Check updated usage
    const updatedUsage = await connector.getUsageStats();
    console.log(`\n📊 Updated API Usage: ${updatedUsage.requests_used}/${updatedUsage.requests_used + updatedUsage.requests_remaining} requests used`);

    // Clean up
    await oddsRepository.flush();
    await oddsRepository.close();

    console.log('✨ Example completed successfully!');

  } catch (error) {
    console.error('💥 Error in example:', error);
    process.exit(1);
  }
}

// Example of setting up a scheduled sync
async function scheduledSync() {
  const connector = new OddsAPIConnector();

  // Sync every 5 minutes
  setInterval(async () => {
    try {
      console.log('🔄 Running scheduled odds sync...');
      await connector.syncMMAOdds();
    } catch (error) {
      console.error('❌ Scheduled sync failed:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  console.log('⏰ Scheduled sync started (every 5 minutes)');
}

// Example of monitoring specific fights
async function monitorSpecificFights() {
  const oddsRepository = new OddsRepository();
  const connector = new OddsAPIConnector(oddsRepository);

  // Monitor specific fights for movements
  const fightsToMonitor = [
    'odds_api_Jon_Jones_vs_Stipe_Miocic_2024-12-07',
    'odds_api_Islam_Makhachev_vs_Arman_Tsarukyan_2024-12-07'
  ];

  connector.on('oddsMovement', (data) => {
    if (fightsToMonitor.includes(data.fightId)) {
      console.log(`🎯 MONITORED FIGHT MOVEMENT: ${data.fightId}`);
      console.log(`   Sportsbook: ${data.sportsbook}`);
      console.log(`   Change: ${data.percentageChange.toFixed(2)}%`);
      console.log(`   Type: ${data.movementType}`);
      
      // You could send notifications, alerts, etc. here
    }
  });

  // Start monitoring
  await connector.syncMMAOdds();
}

// Run the main example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  main as runOddsAPIExample,
  scheduledSync as runScheduledSync,
  monitorSpecificFights as runFightMonitoring
};