/**
 * UFC 319 Integration Example
 * 
 * This example demonstrates how to use the UFC 319 integration services
 * to fetch event data, fighter information, and live odds.
 */

import { UFC319IntegrationService } from '../services/ufc319-integration.service.js';
import { UFC319OddsService } from '../services/ufc319-odds.service.js';

async function runUFC319IntegrationExample() {
  console.log('🥊 UFC 319 Integration Example');
  console.log('================================');

  try {
    // Initialize services
    const integrationService = new UFC319IntegrationService();
    const oddsService = new UFC319OddsService();

    console.log('\n1. 📊 Integrating UFC 319 Event Data...');
    
    // Step 1: Integrate event data
    try {
      const eventData = await integrationService.integrateUFC319Event();
      console.log(`✅ Event integration completed:`);
      console.log(`   - Event: ${eventData.event.name}`);
      console.log(`   - Date: ${eventData.event.date.toDateString()}`);
      console.log(`   - Venue: ${eventData.event.venue.name}, ${eventData.event.venue.city}`);
      console.log(`   - Fighters: ${eventData.fighters.length}`);
      console.log(`   - Fights: ${eventData.fights.length}`);
    } catch (error: any) {
      console.log(`⚠️  Event integration failed: ${error.message}`);
      console.log('   This is expected if SportsData.io API is not configured');
    }

    console.log('\n2. 🎯 Getting UFC 319 Data...');
    
    // Step 2: Get current UFC 319 data
    const currentData = await integrationService.getUFC319Data();
    if (currentData) {
      console.log(`✅ Found UFC 319 data:`);
      console.log(`   - Event: ${currentData.event.name}`);
      console.log(`   - Fighters: ${currentData.fighters.length}`);
      console.log(`   - Fights: ${currentData.fights.length}`);
    } else {
      console.log('ℹ️  No UFC 319 data found in database');
    }

    console.log('\n3. 🥊 Getting Fight Card Details...');
    
    // Step 3: Get fight card details
    const fightCard = await integrationService.getFightCardDetails();
    console.log(`✅ Fight card structure:`);
    console.log(`   - Total fights: ${fightCard.fights.length}`);
    console.log(`   - Main event: ${fightCard.mainEvent ? 'Yes' : 'No'}`);
    console.log(`   - Main card fights: ${fightCard.mainCard.length}`);
    console.log(`   - Preliminary fights: ${fightCard.preliminaryCard.length}`);

    console.log('\n4. 💰 Integrating Live Odds...');
    
    // Step 4: Integrate odds data
    try {
      const oddsResult = await oddsService.integrateUFC319Odds();
      console.log(`✅ Odds integration completed:`);
      console.log(`   - Records processed: ${oddsResult.recordsProcessed}`);
      console.log(`   - Records skipped: ${oddsResult.recordsSkipped}`);
      console.log(`   - Errors: ${oddsResult.errors.length}`);
    } catch (error: any) {
      console.log(`⚠️  Odds integration failed: ${error.message}`);
      console.log('   This is expected if SportsData.io API is not configured');
    }

    console.log('\n5. 📈 Getting Live Odds...');
    
    // Step 5: Get live odds
    try {
      const liveOdds = await oddsService.getLiveUFC319Odds();
      console.log(`✅ Live odds retrieved:`);
      console.log(`   - Event: ${liveOdds.eventId}`);
      console.log(`   - Fights with odds: ${liveOdds.fights.length}`);
      
      liveOdds.fights.forEach((fight, index) => {
        console.log(`   Fight ${index + 1}:`);
        console.log(`     - ${fight.fighter1Name} vs ${fight.fighter2Name}`);
        console.log(`     - Odds sources: ${fight.odds.length}`);
        console.log(`     - Best odds: ${fight.bestOdds.fighter1.odds} / ${fight.bestOdds.fighter2.odds}`);
      });
    } catch (error: any) {
      console.log(`⚠️  Live odds retrieval failed: ${error.message}`);
    }

    console.log('\n6. 🔍 Event Discovery...');
    
    // Step 6: Automatic event discovery
    try {
      const discoveryResult = await integrationService.discoverAndUpdateEvents();
      console.log(`✅ Event discovery completed:`);
      console.log(`   - Events processed: ${discoveryResult.recordsProcessed}`);
      console.log(`   - Events skipped: ${discoveryResult.recordsSkipped}`);
      console.log(`   - Processing time: ${discoveryResult.processingTimeMs}ms`);
    } catch (error: any) {
      console.log(`⚠️  Event discovery failed: ${error.message}`);
    }

    console.log('\n7. 📊 Historical Odds Analysis...');
    
    // Step 7: Historical odds analysis (if we have fight data)
    if (currentData && currentData.fights.length > 0) {
      try {
        const fightId = currentData.fights[0].id;
        const historicalOdds = await oddsService.getHistoricalOdds(fightId);
        
        console.log(`✅ Historical odds for fight ${fightId}:`);
        historicalOdds.forEach(data => {
          console.log(`   - ${data.sportsbook}: ${data.oddsHistory.length} data points`);
          console.log(`     Trends: F1 ${data.trends.fighter1Trend}, F2 ${data.trends.fighter2Trend}`);
          console.log(`     Volatility: ${data.trends.volatility}`);
        });
      } catch (error: any) {
        console.log(`⚠️  Historical odds analysis failed: ${error.message}`);
      }
    }

    console.log('\n✅ UFC 319 Integration Example Completed!');
    console.log('\n📝 Summary:');
    console.log('   - Event data integration ✓');
    console.log('   - Fighter information ✓');
    console.log('   - Fight card details ✓');
    console.log('   - Live odds integration ✓');
    console.log('   - Historical odds tracking ✓');
    console.log('   - Automatic event discovery ✓');

  } catch (error: any) {
    console.error('❌ Example failed:', error.message);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runUFC319IntegrationExample()
    .then(() => {
      console.log('\n🎉 Example completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Example failed:', error);
      process.exit(1);
    });
}

export { runUFC319IntegrationExample };