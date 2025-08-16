/**
 * Example usage of SportsDataIO Connector
 * 
 * This file demonstrates how to use the SportsDataIOConnector to sync
 * fighter and fight data from the SportsDataIO API.
 */

import { SportsDataIOConnector } from '../connectors/sports-data-io.connector.js';
import { initializeConfigs } from '../config/source-configs.js';

async function exampleUsage() {
  // Initialize configurations (loads API keys from environment)
  initializeConfigs();

  // Create connector instance
  const connector = new SportsDataIOConnector();

  try {
    console.log('Starting SportsDataIO sync...');

    // Sync all fighters
    console.log('Syncing fighters...');
    const fighterResult = await connector.syncFighters();
    console.log(`Fighters synced: ${fighterResult.recordsProcessed} processed, ${fighterResult.recordsSkipped} skipped`);
    
    if (fighterResult.errors.length > 0) {
      console.log('Fighter sync errors:', fighterResult.errors);
    }

    // Sync current season events and fights
    const currentYear = new Date().getFullYear();
    console.log(`Syncing events for ${currentYear}...`);
    const eventResult = await connector.syncEvents(currentYear);
    console.log(`Events synced: ${eventResult.recordsProcessed} processed, ${eventResult.recordsSkipped} skipped`);
    
    if (eventResult.errors.length > 0) {
      console.log('Event sync errors:', eventResult.errors);
    }

    // Full sync (combines fighters and events)
    console.log('Performing full sync...');
    const fullResult = await connector.syncData();
    console.log(`Full sync completed: ${fullResult.recordsProcessed} total records processed`);
    console.log(`Processing time: ${fullResult.processingTimeMs}ms`);

  } catch (error) {
    console.error('Sync failed:', error);
  }
}

// Event listeners for monitoring sync progress
function setupEventListeners(connector: SportsDataIOConnector) {
  connector.on('fighterProcessed', (event) => {
    console.log(`Fighter processed: ${event.name} (ID: ${event.fighterId})`);
  });

  connector.on('fightProcessed', (event) => {
    console.log(`Fight processed: ${event.fightId} for event ${event.eventId}`);
  });

  connector.on('eventProcessed', (event) => {
    console.log(`Event processed: ${event.name} (${event.fightsCount} fights)`);
  });

  connector.on('rateLimitHit', (event) => {
    console.log(`Rate limit hit (${event.type}), waiting ${event.waitTime}ms`);
  });

  connector.on('retryAttempt', (event) => {
    console.log(`Retry attempt ${event.attempt}/${event.maxRetries}, waiting ${event.backoffTime}ms`);
  });

  connector.on('circuitBreakerStateChange', (event) => {
    console.log(`Circuit breaker state changed to: ${event.state}`);
  });
}

// Example of syncing specific event
async function syncSpecificEvent(eventId: number) {
  const connector = new SportsDataIOConnector();
  setupEventListeners(connector);

  try {
    console.log(`Syncing specific event: ${eventId}`);
    const result = await connector.syncEventFights(eventId);
    console.log(`Event ${eventId} synced: ${result.recordsProcessed} fights processed`);
    return result;
  } catch (error) {
    console.error(`Failed to sync event ${eventId}:`, error);
    throw error;
  }
}

// Example of data validation
function validateSampleData() {
  const connector = new SportsDataIOConnector();

  // Sample fighter data from SportsDataIO
  const sampleFighter = {
    FighterId: 123,
    FirstName: 'Jon',
    LastName: 'Jones',
    Nickname: 'Bones',
    WeightClass: 'Light Heavyweight',
    Wins: 26,
    Losses: 1,
    Draws: 0,
    NoContests: 1,
    Height: 76,
    Weight: 205,
    Reach: 84
  };

  // Validate the data
  const errors = connector.validateFighterData(sampleFighter);
  
  if (errors.length === 0) {
    console.log('Fighter data is valid');
    
    // Transform the data
    const transformed = connector.transformFighterData(sampleFighter);
    console.log('Transformed fighter:', transformed);
  } else {
    console.log('Validation errors:', errors);
  }
}

// Export functions for use in other modules
export {
  exampleUsage,
  syncSpecificEvent,
  validateSampleData,
  setupEventListeners
};

// Run example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleUsage().catch(console.error);
}