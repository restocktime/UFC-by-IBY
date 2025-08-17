# API Configuration Setup

This document describes the comprehensive API configuration system for the UFC Prediction Platform's live data integration.

## Overview

The API configuration system provides:
- **Environment-based configuration** for all API keys and settings
- **Proxy rotation system** using Oxylabs for reliable data access
- **Rate limiting** to prevent API quota exhaustion
- **Retry mechanisms** with exponential backoff for reliability
- **Error handling** with comprehensive error classification

## Environment Variables

### Required API Keys

```bash
# SportsData.io API (UFC events, fighters, odds)
SPORTSDATA_IO_API_KEY=81a9726b488c4b57b48e59042405d1a6

# The Odds API (live betting odds)
ODDS_API_KEY=22e59e4eccd8562ad4b697aeeaccb0fb

# ESPN API (optional - no key required for public endpoints)
ESPN_API_KEY=
```

### Proxy Configuration (Oxylabs)

```bash
# Oxylabs proxy credentials
OXYLABS_USERNAME=your_oxylabs_username
OXYLABS_PASSWORD=your_oxylabs_password
OXYLABS_HOST=isp.oxylabs.io
OXYLABS_PORTS=8001,8002,8003,8004,8005,8006,8007,8008,8009,8010
OXYLABS_COUNTRY=US
PROXY_ROTATION_INTERVAL=300000  # 5 minutes
```

### Rate Limiting Configuration

```bash
# SportsData.io rate limits
SPORTSDATA_IO_RATE_LIMIT_PER_MINUTE=60
SPORTSDATA_IO_RATE_LIMIT_PER_HOUR=1000
SPORTSDATA_IO_RATE_LIMIT_PER_DAY=10000

# The Odds API rate limits
ODDS_API_RATE_LIMIT_PER_MINUTE=10
ODDS_API_RATE_LIMIT_PER_HOUR=500
ODDS_API_RATE_LIMIT_PER_DAY=1000

# ESPN API rate limits
ESPN_API_RATE_LIMIT_PER_MINUTE=100
ESPN_API_RATE_LIMIT_PER_HOUR=2000
ESPN_API_RATE_LIMIT_PER_DAY=20000
```

### Retry and Timeout Configuration

```bash
# Retry configuration
API_MAX_RETRIES=3
API_RETRY_BASE_DELAY=1000        # 1 second
API_RETRY_MAX_DELAY=30000        # 30 seconds
API_RETRY_BACKOFF_MULTIPLIER=2

# Timeout configuration
API_DEFAULT_TIMEOUT=30000        # 30 seconds
SPORTSDATA_IO_TIMEOUT=30000
ODDS_API_TIMEOUT=15000
ESPN_API_TIMEOUT=20000
```

## API Client Factory

The `APIClientFactory` class provides a centralized way to create and manage HTTP clients with:

### Features

1. **Automatic Retry Logic**
   - Exponential backoff with jitter
   - Configurable retry limits
   - Smart retry conditions (5xx errors, network errors, rate limits)

2. **Rate Limiting**
   - Per-minute, per-hour, and per-day limits
   - Automatic request queuing
   - Rate limit status tracking

3. **Proxy Rotation**
   - Automatic proxy rotation for Oxylabs
   - Health monitoring and failover
   - Geographic targeting

4. **Error Handling**
   - Comprehensive error classification
   - Retry-after header support
   - Detailed error logging

### Usage Example

```typescript
import { APIClientFactory } from './api-client-factory';

const factory = APIClientFactory.getInstance();

// Create a client with rate limiting and proxy support
const client = factory.createClient('myAPI', {
  baseURL: 'https://api.example.com',
  timeout: 30000,
  rateLimitConfig: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000
  },
  useProxy: true,
  retryConfig: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  }
});

// Make requests
const response = await client.get('/endpoint');
```

## API Client Service

The `APIClientService` class provides high-level methods for interacting with specific APIs:

### SportsData.io Methods

```typescript
const apiClient = new APIClientService();

// Get UFC event data
const event = await apiClient.getUFCEvent('864');

// Get event odds
const odds = await apiClient.getEventOdds('864');

// Get all events
const events = await apiClient.getAllEvents();

// Get fighters
const fighters = await apiClient.getFighters();

// Get fights
const fights = await apiClient.getFights();
```

### The Odds API Methods

```typescript
// Get live odds
const liveOdds = await apiClient.getLiveOdds('us', 'h2h', 'american');

// Get available sports
const sports = await apiClient.getOddsSports();

// Get events
const events = await apiClient.getOddsEvents();
```

### ESPN API Methods

```typescript
// Get scoreboard
const scoreboard = await apiClient.getESPNScoreboard();

// Get events
const events = await apiClient.getESPNEvents();

// Get fighters
const fighters = await apiClient.getESPNFighters();
```

## Error Handling

The system includes comprehensive error handling with the `APIErrorHandler` class:

### Error Types

- **Network Errors**: Connection failures, timeouts
- **Authentication Errors**: Invalid API keys, expired tokens
- **Rate Limit Errors**: Quota exceeded, too many requests
- **Server Errors**: 5xx responses, maintenance mode
- **Client Errors**: Invalid requests, not found

### Error Response Format

```typescript
interface APIError {
  code: string;           // Error classification code
  message: string;        // Human-readable message
  statusCode?: number;    // HTTP status code
  retryable: boolean;     // Whether the error can be retried
  details?: any;          // Additional error context
}
```

### Usage Example

```typescript
import { APIErrorHandler } from './api-error-handler';

try {
  const response = await client.get('/endpoint');
} catch (error) {
  const apiError = APIErrorHandler.handleError(error, 'API call context');
  
  if (APIErrorHandler.isRetryableError(apiError)) {
    const delay = APIErrorHandler.getRetryDelay(apiError, attemptNumber);
    // Wait and retry
  } else {
    // Handle non-retryable error
    console.error(APIErrorHandler.formatErrorForLogging(apiError));
  }
}
```

## Health Monitoring

### Health Check

```typescript
const apiClient = new APIClientService();
const healthStatus = await apiClient.healthCheck();

// Returns:
// {
//   sportsDataIO: { status: true, responseTime: 150 },
//   oddsAPI: { status: true, responseTime: 200 },
//   espnAPI: { status: false, error: 'Connection timeout' }
// }
```

### Rate Limit Monitoring

```typescript
const rateLimitStatus = apiClient.getRateLimitStatus();

// Returns current rate limit usage for each API
// {
//   sportsDataIO: { requests: 45, resetTime: 1640995200000 },
//   oddsAPI: { requests: 8, resetTime: 1640995200000 }
// }
```

## Configuration Validation

Use the validation script to verify your configuration:

```bash
npx tsx src/scripts/validate-api-config.ts
```

This will check:
- ✅ Environment variables are set
- ✅ API keys are configured
- ✅ Rate limits are properly configured
- ✅ Retry mechanisms are set up
- ✅ Timeout values are reasonable

## Best Practices

### 1. API Key Security
- Store API keys in environment variables
- Never commit API keys to version control
- Rotate API keys regularly
- Use different keys for different environments

### 2. Rate Limiting
- Set conservative rate limits initially
- Monitor actual usage and adjust as needed
- Implement graceful degradation when limits are hit
- Use caching to reduce API calls

### 3. Error Handling
- Always handle API errors gracefully
- Implement proper retry logic for transient errors
- Log errors with sufficient context for debugging
- Provide meaningful error messages to users

### 4. Monitoring
- Monitor API response times and success rates
- Set up alerts for API failures
- Track rate limit usage to avoid quota exhaustion
- Monitor proxy health and rotation

### 5. Testing
- Test API integrations with mock data
- Validate error handling scenarios
- Test rate limiting behavior
- Verify proxy functionality

## Troubleshooting

### Common Issues

1. **API Key Invalid**
   - Verify the API key is correct
   - Check if the key has expired
   - Ensure the key has proper permissions

2. **Rate Limit Exceeded**
   - Check current rate limit usage
   - Adjust rate limit configuration
   - Implement request queuing

3. **Proxy Connection Failed**
   - Verify Oxylabs credentials
   - Check proxy server status
   - Try different proxy ports

4. **Network Timeouts**
   - Increase timeout values
   - Check network connectivity
   - Verify API endpoint availability

### Debug Mode

Enable debug logging by setting:
```bash
LOG_LEVEL=debug
```

This will provide detailed information about:
- API requests and responses
- Rate limit tracking
- Retry attempts
- Proxy rotation
- Error details