/**
 * UFC Stats Scraping Engine Usage Example
 * 
 * This file demonstrates how to use the UFC Stats scraping engine
 * to collect fighter and fight data from UFCStats.com
 */

import { UFCStatsConnector } from '../connectors/ufc-stats.connector.js';
import { FighterRepository } from '../../repositories/fighter.repository.js';
import { FightRepository } from '../../repositories/fight.repository.js';

/**
 * Example: Basic UFC Stats scraping setup
 */
export async function basicScrapingExample() {
  console.log('🚀 Starting UFC Stats scraping example...');

  // Initialize repositories (in real usage, these would connect to actual databases)
  const fighterRepository = new FighterRepository();
  const fightRepository = new FightRepository();

  // Create the UFC Stats connector
  const ufcStatsConnector = new UFCStatsConnector(fighterRepository, fightRepository);

  // Set up event listeners for monitoring
  ufcStatsConnector.on('fighterProcessed', (event) => {
    console.log(`✅ Processed fighter: ${event.name}`);
  });

  ufcStatsConnector.on('fightProcessed', (event) => {
    console.log(`🥊 Processed fight: ${event.fighters}`);
  });

  ufcStatsConnector.on('scrapingError', (event) => {
    console.error(`❌ Scraping error at ${event.url}: ${event.error}`);
  });

  ufcStatsConnector.on('rateLimitWait', (event) => {
    console.log(`⏳ Rate limit wait: ${event.delay}ms for session ${event.sessionId}`);
  });

  ufcStatsConnector.on('sessionBlocked', (event) => {
    console.warn(`🚫 Session blocked: ${event.sessionId} - ${event.reason}`);
  });

  try {
    // Perform full data synchronization
    const result = await ufcStatsConnector.syncData();
    
    console.log('📊 Scraping Results:');
    console.log(`   Records Processed: ${result.recordsProcessed}`);
    console.log(`   Records Skipped: ${result.recordsSkipped}`);
    console.log(`   Errors: ${result.errors.length}`);
    console.log(`   Processing Time: ${result.processingTimeMs}ms`);
    
    if (result.errors.length > 0) {
      console.log('⚠️  Errors encountered:');
      result.errors.forEach(error => {
        console.log(`   - ${error.field}: ${error.message} (${error.severity})`);
      });
    }

  } catch (error) {
    console.error('💥 Scraping failed:', error);
  }
}

/**
 * Example: Scraping only fighter data
 */
export async function fighterOnlyScrapingExample() {
  console.log('👤 Starting fighter-only scraping example...');

  const fighterRepository = new FighterRepository();
  const ufcStatsConnector = new UFCStatsConnector(fighterRepository);

  // Monitor fighter processing
  ufcStatsConnector.on('fighterProcessed', (event) => {
    console.log(`✅ Fighter processed: ${event.name}`);
  });

  try {
    // Scrape only fighter list and details
    const result = await ufcStatsConnector.scrapeFighterList();
    
    console.log(`📊 Fighter Scraping Results:`);
    console.log(`   Fighters Processed: ${result.recordsProcessed}`);
    console.log(`   Fighters Skipped: ${result.recordsSkipped}`);
    console.log(`   Processing Time: ${result.processingTimeMs}ms`);

  } catch (error) {
    console.error('💥 Fighter scraping failed:', error);
  }
}

/**
 * Example: Scraping recent events and fights
 */
export async function recentEventsScrapingExample() {
  console.log('📅 Starting recent events scraping example...');

  const fightRepository = new FightRepository();
  const ufcStatsConnector = new UFCStatsConnector(undefined, fightRepository);

  // Monitor event and fight processing
  ufcStatsConnector.on('eventProcessed', (event) => {
    console.log(`🎪 Event processed: ${event.name} (${event.fightsCount} fights)`);
  });

  ufcStatsConnector.on('fightProcessed', (event) => {
    console.log(`🥊 Fight processed: ${event.fighters}`);
  });

  try {
    // Scrape recent events
    const result = await ufcStatsConnector.scrapeRecentEvents();
    
    console.log(`📊 Events Scraping Results:`);
    console.log(`   Records Processed: ${result.recordsProcessed}`);
    console.log(`   Records Skipped: ${result.recordsSkipped}`);

  } catch (error) {
    console.error('💥 Events scraping failed:', error);
  }
}

/**
 * Example: Monitoring scraper status and health
 */
export async function monitoringExample() {
  console.log('📈 Starting scraper monitoring example...');

  const ufcStatsConnector = new UFCStatsConnector();

  // Get initial status
  const initialStatus = ufcStatsConnector.getStatus();
  console.log('🔍 Initial Scraper Status:');
  console.log(`   Source ID: ${initialStatus.sourceId}`);
  console.log(`   Total Sessions: ${initialStatus.totalSessions}`);
  console.log(`   Blocked Sessions: ${initialStatus.blockedSessions}`);
  console.log(`   Blocked Proxies: ${initialStatus.blockedProxies.join(', ') || 'None'}`);

  // Monitor session status
  initialStatus.sessions.forEach(session => {
    console.log(`   Session ${session.id}:`);
    console.log(`     Blocked: ${session.blocked}`);
    console.log(`     Requests: ${session.requestCount}`);
    console.log(`     Proxy: ${session.proxy}`);
  });

  // Set up comprehensive event monitoring
  const events = [
    'fighterProcessed', 'fightProcessed', 'eventProcessed',
    'scrapingError', 'rateLimitWait', 'sessionBlocked',
    'sessionReset', 'allSessionsBlocked', 'allSessionsReset'
  ];

  events.forEach(eventName => {
    ufcStatsConnector.on(eventName, (data) => {
      console.log(`📡 Event [${eventName}]:`, data);
    });
  });

  // Simulate some scraping activity
  try {
    await ufcStatsConnector.scrapeFighterList();
    
    // Check status after scraping
    const finalStatus = ufcStatsConnector.getStatus();
    console.log('🔍 Final Scraper Status:');
    console.log(`   Blocked Sessions: ${finalStatus.blockedSessions}`);
    console.log(`   Total Requests: ${finalStatus.sessions.reduce((sum, s) => sum + s.requestCount, 0)}`);

  } catch (error) {
    console.error('💥 Monitoring example failed:', error);
  }
}

/**
 * Example: Error handling and recovery
 */
export async function errorHandlingExample() {
  console.log('🛡️ Starting error handling example...');

  const ufcStatsConnector = new UFCStatsConnector();

  // Set up error event handlers
  ufcStatsConnector.on('scrapingError', (event) => {
    console.error(`❌ Scraping Error:`);
    console.error(`   URL: ${event.url}`);
    console.error(`   Type: ${event.type}`);
    console.error(`   Error: ${event.error}`);
  });

  ufcStatsConnector.on('sessionBlocked', (event) => {
    console.warn(`🚫 Session Blocked:`);
    console.warn(`   Session: ${event.sessionId}`);
    console.warn(`   Reason: ${event.reason}`);
    console.warn(`   Proxy: ${event.proxy ? `${event.proxy.host}:${event.proxy.port}` : 'None'}`);
  });

  ufcStatsConnector.on('allSessionsBlocked', () => {
    console.error('🚨 All sessions blocked! Resetting...');
    ufcStatsConnector.resetAllSessions();
  });

  try {
    // Attempt scraping with error handling
    const result = await ufcStatsConnector.syncData();
    
    if (result.errors.length > 0) {
      console.log('⚠️  Errors encountered during scraping:');
      result.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. Field: ${error.field}`);
        console.log(`      Message: ${error.message}`);
        console.log(`      Severity: ${error.severity}`);
        console.log(`      Value: ${JSON.stringify(error.value)}`);
      });
    }

  } catch (error) {
    console.error('💥 Critical error in scraping:', error);
  }
}

/**
 * Example: Data validation and transformation
 */
export async function dataValidationExample() {
  console.log('🔍 Starting data validation example...');

  const ufcStatsConnector = new UFCStatsConnector();

  // Example fighter data from UFC Stats
  const sampleFighterData = {
    name: 'Jon Jones',
    nickname: 'Bones',
    height: '6\' 4"',
    weight: '205 lbs',
    reach: '84"',
    stance: 'Orthodox',
    dob: 'Jul 19, 1987',
    record: { wins: 26, losses: 1, draws: 0 },
    strikingStats: {
      significantStrikesLanded: 4.5,
      significantStrikesAttempted: 0,
      strikingAccuracy: 58,
      strikesAbsorbedPerMinute: 2.8,
      strikingDefense: 65
    },
    grapplingStats: {
      takedownsLanded: 0,
      takedownsAttempted: 0,
      takedownAccuracy: 43,
      takedownDefense: 95,
      submissionAttempts: 0.4
    },
    fightDetails: {
      averageFightTime: '15:23',
      knockdowns: 0,
      controlTime: 0
    }
  };

  // Validate the data
  console.log('🔍 Validating fighter data...');
  const validationErrors = ufcStatsConnector.validateData(sampleFighterData);
  
  if (validationErrors.length === 0) {
    console.log('✅ Fighter data is valid');
    
    // Transform the data
    console.log('🔄 Transforming fighter data...');
    const transformedData = ufcStatsConnector.transformData(sampleFighterData);
    
    console.log('📊 Transformed Fighter Data:');
    console.log(`   Name: ${transformedData.name}`);
    console.log(`   Nickname: ${transformedData.nickname}`);
    console.log(`   Height: ${transformedData.physicalStats.height} inches`);
    console.log(`   Weight: ${transformedData.physicalStats.weight} lbs`);
    console.log(`   Reach: ${transformedData.physicalStats.reach} inches`);
    console.log(`   Stance: ${transformedData.physicalStats.stance}`);
    console.log(`   Record: ${transformedData.record.wins}-${transformedData.record.losses}-${transformedData.record.draws}`);
    console.log(`   Weight Class: ${transformedData.rankings.weightClass}`);
    console.log(`   Striking Accuracy: ${transformedData.calculatedMetrics.strikingAccuracy.value}%`);
    console.log(`   Takedown Defense: ${transformedData.calculatedMetrics.takedownDefense.value}%`);
    
  } else {
    console.log('❌ Fighter data validation failed:');
    validationErrors.forEach(error => {
      console.log(`   - ${error.field}: ${error.message} (${error.severity})`);
    });
  }
}

/**
 * Main function to run all examples
 */
export async function runAllExamples() {
  console.log('🎯 Running all UFC Stats scraping examples...\n');

  const examples = [
    { name: 'Data Validation', fn: dataValidationExample },
    { name: 'Monitoring', fn: monitoringExample },
    { name: 'Error Handling', fn: errorHandlingExample },
    { name: 'Fighter Only Scraping', fn: fighterOnlyScrapingExample },
    { name: 'Recent Events Scraping', fn: recentEventsScrapingExample },
    { name: 'Basic Scraping', fn: basicScrapingExample }
  ];

  for (const example of examples) {
    try {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`📋 Running: ${example.name}`);
      console.log(`${'='.repeat(50)}`);
      
      await example.fn();
      
      console.log(`✅ ${example.name} completed successfully`);
      
    } catch (error) {
      console.error(`❌ ${example.name} failed:`, error);
    }
    
    // Add delay between examples
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🎉 All examples completed!');
}

// Export individual examples for selective usage
export {
  basicScrapingExample,
  fighterOnlyScrapingExample,
  recentEventsScrapingExample,
  monitoringExample,
  errorHandlingExample,
  dataValidationExample
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}