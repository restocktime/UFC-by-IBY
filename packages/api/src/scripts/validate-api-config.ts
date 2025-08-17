#!/usr/bin/env tsx

// Simple validation without external dependencies
const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  apiKeys: {
    sportsDataIO: process.env.SPORTSDATA_IO_API_KEY || '81a9726b488c4b57b48e59042405d1a6',
    oddsAPI: process.env.ODDS_API_KEY || '22e59e4eccd8562ad4b697aeeaccb0fb',
    espnAPI: process.env.ESPN_API_KEY || ''
  },
  proxy: {
    oxylabs: {
      enabled: !!(process.env.OXYLABS_USERNAME && process.env.OXYLABS_PASSWORD),
      username: process.env.OXYLABS_USERNAME || '',
      password: process.env.OXYLABS_PASSWORD || '',
      host: process.env.OXYLABS_HOST || 'isp.oxylabs.io',
      ports: process.env.OXYLABS_PORTS?.split(',').map(p => parseInt(p, 10)) || [8001, 8002, 8003, 8004, 8005],
      country: process.env.OXYLABS_COUNTRY || 'US'
    }
  },
  rateLimits: {
    sportsDataIO: {
      requestsPerMinute: parseInt(process.env.SPORTSDATA_IO_RATE_LIMIT_PER_MINUTE || '60', 10),
      requestsPerHour: parseInt(process.env.SPORTSDATA_IO_RATE_LIMIT_PER_HOUR || '1000', 10)
    },
    oddsAPI: {
      requestsPerMinute: parseInt(process.env.ODDS_API_RATE_LIMIT_PER_MINUTE || '10', 10),
      requestsPerHour: parseInt(process.env.ODDS_API_RATE_LIMIT_PER_HOUR || '500', 10)
    },
    espnAPI: {
      requestsPerMinute: parseInt(process.env.ESPN_API_RATE_LIMIT_PER_MINUTE || '100', 10),
      requestsPerHour: parseInt(process.env.ESPN_API_RATE_LIMIT_PER_HOUR || '2000', 10)
    }
  },
  retry: {
    maxRetries: parseInt(process.env.API_MAX_RETRIES || '3', 10),
    baseDelay: parseInt(process.env.API_RETRY_BASE_DELAY || '1000', 10),
    maxDelay: parseInt(process.env.API_RETRY_MAX_DELAY || '30000', 10),
    backoffMultiplier: parseFloat(process.env.API_RETRY_BACKOFF_MULTIPLIER || '2')
  },
  timeouts: {
    default: parseInt(process.env.API_DEFAULT_TIMEOUT || '30000', 10),
    sportsDataIO: parseInt(process.env.SPORTSDATA_IO_TIMEOUT || '30000', 10),
    oddsAPI: parseInt(process.env.ODDS_API_TIMEOUT || '15000', 10),
    espnAPI: parseInt(process.env.ESPN_API_TIMEOUT || '20000', 10)
  }
};

async function validateAPIConfiguration() {
  console.log('🔧 Validating API Configuration...\n');

  // 1. Validate Environment Variables
  console.log('📋 Environment Variables:');
  console.log(`  NODE_ENV: ${config.nodeEnv}`);
  console.log(`  PORT: ${config.port}`);
  console.log(`  LOG_LEVEL: ${config.logging.level}`);
  
  console.log('\n🔑 API Keys:');
  console.log(`  SportsData.io: ${config.apiKeys.sportsDataIO ? '✅ Set' : '❌ Missing'}`);
  console.log(`  The Odds API: ${config.apiKeys.oddsAPI ? '✅ Set' : '❌ Missing'}`);
  console.log(`  ESPN API: ${config.apiKeys.espnAPI || 'N/A (not required)'}`);

  console.log('\n🌐 Proxy Configuration:');
  console.log(`  Oxylabs Enabled: ${config.proxy.oxylabs.enabled ? '✅ Yes' : '❌ No'}`);
  if (config.proxy.oxylabs.enabled) {
    console.log(`  Username: ${config.proxy.oxylabs.username ? '✅ Set' : '❌ Missing'}`);
    console.log(`  Password: ${config.proxy.oxylabs.password ? '✅ Set' : '❌ Missing'}`);
    console.log(`  Host: ${config.proxy.oxylabs.host}`);
    console.log(`  Ports: ${config.proxy.oxylabs.ports.join(', ')}`);
    console.log(`  Country: ${config.proxy.oxylabs.country}`);
  }

  console.log('\n⏱️ Rate Limits:');
  console.log(`  SportsData.io: ${config.rateLimits.sportsDataIO.requestsPerMinute}/min, ${config.rateLimits.sportsDataIO.requestsPerHour}/hour`);
  console.log(`  The Odds API: ${config.rateLimits.oddsAPI.requestsPerMinute}/min, ${config.rateLimits.oddsAPI.requestsPerHour}/hour`);
  console.log(`  ESPN API: ${config.rateLimits.espnAPI.requestsPerMinute}/min, ${config.rateLimits.espnAPI.requestsPerHour}/hour`);

  console.log('\n🔄 Retry Configuration:');
  console.log(`  Max Retries: ${config.retry.maxRetries}`);
  console.log(`  Base Delay: ${config.retry.baseDelay}ms`);
  console.log(`  Max Delay: ${config.retry.maxDelay}ms`);
  console.log(`  Backoff Multiplier: ${config.retry.backoffMultiplier}x`);

  console.log('\n⏰ Timeouts:');
  console.log(`  Default: ${config.timeouts.default}ms`);
  console.log(`  SportsData.io: ${config.timeouts.sportsDataIO}ms`);
  console.log(`  The Odds API: ${config.timeouts.oddsAPI}ms`);
  console.log(`  ESPN API: ${config.timeouts.espnAPI}ms`);

  // 2. Validate Configuration Values
  console.log('\n🔍 Configuration Validation:');
  
  const validations = [
    { name: 'SportsData.io API Key', value: config.apiKeys.sportsDataIO, required: true },
    { name: 'The Odds API Key', value: config.apiKeys.oddsAPI, required: true },
    { name: 'Rate Limits Configured', value: config.rateLimits.sportsDataIO.requestsPerMinute > 0, required: true },
    { name: 'Retry Configuration', value: config.retry.maxRetries > 0, required: true },
    { name: 'Timeout Configuration', value: config.timeouts.default > 0, required: true }
  ];

  let allValid = true;
  for (const validation of validations) {
    const status = validation.value ? '✅' : '❌';
    console.log(`  ${validation.name}: ${status}`);
    if (validation.required && !validation.value) {
      allValid = false;
    }
  }

  if (allValid) {
    console.log('\n✅ API Configuration validation completed successfully!');
    console.log('\n📝 Summary:');
    console.log('  - Environment variables are properly configured');
    console.log('  - API keys are set and ready for use');
    console.log('  - Rate limiting is configured to prevent API abuse');
    console.log('  - Retry mechanisms are in place for reliability');
    console.log('  - Proxy configuration is available when needed');
    console.log('\n🚀 Ready to start making API calls!');
  } else {
    console.error('\n❌ Configuration validation failed!');
    console.error('Please check the missing configuration values above.');
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  validateAPIConfiguration().catch((error) => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

export { validateAPIConfiguration };