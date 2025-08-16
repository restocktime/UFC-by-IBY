# UFC Stats Web Scraping Engine

This module implements a robust web scraping engine specifically designed for collecting detailed fight statistics and fighter data from UFCStats.com. The implementation includes anti-detection measures, rate limiting, proxy rotation, and comprehensive error handling.

## Features

### 🛡️ Anti-Detection Measures
- **User Agent Rotation**: Randomly selects from a pool of realistic browser user agents
- **Request Timing**: Randomized delays between requests (2-5 seconds)
- **Header Randomization**: Adds realistic HTTP headers with optional randomization
- **Proxy Support**: Supports HTTP, HTTPS, and SOCKS proxy rotation
- **Session Management**: Maintains separate sessions with cookies and state

### 🚦 Rate Limiting & Circuit Breaker
- **Intelligent Rate Limiting**: Respects site limits with configurable requests per minute/hour
- **Circuit Breaker Pattern**: Automatically stops requests when errors exceed threshold
- **Exponential Backoff**: Implements retry logic with exponential backoff and jitter
- **Session Blocking**: Automatically blocks and rotates problematic sessions

### 📊 Data Collection
- **Fighter Profiles**: Complete fighter statistics, physical stats, and fight history
- **Fight Details**: Detailed fight statistics including striking, grappling, and control time
- **Event Information**: UFC event details with fight cards and results
- **Historical Data**: Access to historical fight records and statistics

### 🔍 Data Validation & Quality
- **Schema Validation**: Validates scraped data against expected formats
- **Data Transformation**: Converts UFC Stats format to platform-standard format
- **Error Reporting**: Comprehensive error tracking with severity levels
- **Quality Scoring**: Confidence scoring for data reliability

## Architecture

### Base Classes

#### ScrapingEngine
Abstract base class providing core scraping functionality:

```typescript
abstract class ScrapingEngine extends EventEmitter {
  // Session management
  protected getNextSession(): ScrapingSession | null
  protected waitForRateLimit(session: ScrapingSession): Promise<void>
  protected markSessionAsBlocked(sessionId: string, reason: string): void
  
  // Abstract methods for implementation
  abstract validateData(data: any): ValidationError[]
  abstract transformData(data: any): any
  abstract syncData(): Promise<DataIngestionResult>
}
```

#### UFCStatsConnector
Concrete implementation for UFC Stats scraping:

```typescript
class UFCStatsConnector extends ScrapingEngine {
  // Main scraping methods
  async scrapeFighterList(): Promise<DataIngestionResult>
  async scrapeRecentEvents(): Promise<DataIngestionResult>
  async scrapeFighterDetails(url: string): Promise<UFCStatsFighter>
  async scrapeFightDetails(url: string): Promise<UFCStatsFight>
  
  // Data processing
  validateFighterData(fighter: UFCStatsFighter): ValidationError[]
  transformFighterData(fighter: UFCStatsFighter): Fighter
}
```

### Configuration

The scraping engine uses a comprehensive configuration system:

```typescript
interface ScrapingConfig extends SourceConfig {
  userAgents: string[];           // Pool of user agents to rotate
  proxies: ProxyConfig[];         // Proxy servers for rotation
  requestDelay: {                 // Delay between requests
    min: number;                  // Minimum delay (ms)
    max: number;                  // Maximum delay (ms)
  };
  antiDetection: {
    randomizeHeaders: boolean;    // Enable header randomization
    rotateProxies: boolean;       // Enable proxy rotation
    respectRobotsTxt: boolean;    // Respect robots.txt (future)
  };
}
```

### Session Management

Each scraping session maintains:

```typescript
interface ScrapingSession {
  id: string;                     // Unique session identifier
  proxy?: ProxyConfig;            // Associated proxy configuration
  userAgent: string;              // Current user agent
  cookies: Record<string, string>; // Session cookies
  requestCount: number;           // Number of requests made
  lastRequestTime: number;        // Timestamp of last request
  blocked: boolean;               // Whether session is blocked
}
```

## Usage Examples

### Basic Setup

```typescript
import { UFCStatsConnector } from './connectors/ufc-stats.connector.js';
import { FighterRepository, FightRepository } from '../repositories/index.js';

// Initialize repositories
const fighterRepo = new FighterRepository();
const fightRepo = new FightRepository();

// Create connector
const scraper = new UFCStatsConnector(fighterRepo, fightRepo);

// Set up event monitoring
scraper.on('fighterProcessed', (event) => {
  console.log(`Processed fighter: ${event.name}`);
});

scraper.on('scrapingError', (event) => {
  console.error(`Error at ${event.url}: ${event.error}`);
});

// Perform full sync
const result = await scraper.syncData();
console.log(`Processed ${result.recordsProcessed} records`);
```

### Fighter-Only Scraping

```typescript
// Scrape only fighter data
const fighterResult = await scraper.scrapeFighterList();
console.log(`Scraped ${fighterResult.recordsProcessed} fighters`);
```

### Event and Fight Scraping

```typescript
// Scrape recent events and fights
const eventResult = await scraper.scrapeRecentEvents();
console.log(`Scraped ${eventResult.recordsProcessed} events/fights`);
```

### Monitoring and Status

```typescript
// Get scraper status
const status = scraper.getStatus();
console.log(`Active sessions: ${status.totalSessions - status.blockedSessions}`);
console.log(`Blocked proxies: ${status.blockedProxies.join(', ')}`);

// Reset blocked sessions
scraper.resetAllSessions();
```

## Data Structures

### Fighter Data

The scraper extracts comprehensive fighter information:

```typescript
interface UFCStatsFighter {
  name: string;                   // Fighter name
  nickname?: string;              // Fighter nickname
  height: string;                 // Height (e.g., "6' 4\"")
  weight: string;                 // Weight (e.g., "205 lbs")
  reach: string;                  // Reach (e.g., "84\"")
  stance: string;                 // Fighting stance
  dob: string;                    // Date of birth
  record: {                       // Fight record
    wins: number;
    losses: number;
    draws: number;
  };
  strikingStats: {                // Striking statistics
    significantStrikesLanded: number;
    strikingAccuracy: number;
    strikesAbsorbedPerMinute: number;
    strikingDefense: number;
  };
  grapplingStats: {               // Grappling statistics
    takedownAccuracy: number;
    takedownDefense: number;
    submissionAttempts: number;
  };
  fightDetails: {                 // Additional fight details
    averageFightTime: string;
    knockdowns: number;
    controlTime: number;
  };
}
```

### Fight Data

Detailed fight statistics are collected:

```typescript
interface UFCStatsFight {
  event: string;                  // Event name
  date: string;                   // Fight date
  fighter1: string;               // First fighter name
  fighter2: string;               // Second fighter name
  result: string;                 // Fight result
  method: string;                 // Finish method
  round: number;                  // Round finished
  time: string;                   // Time of finish
  weightClass: string;            // Weight class
  referee: string;                // Referee name
  detailedStats?: {               // Detailed fight statistics
    fighter1Stats: FightStats;
    fighter2Stats: FightStats;
  };
}
```

## Error Handling

The scraping engine implements comprehensive error handling:

### Network Errors
- **Connection Timeouts**: Automatic retry with exponential backoff
- **DNS Resolution**: Proxy rotation on DNS failures
- **Rate Limiting**: Intelligent delay calculation and session rotation

### HTTP Errors
- **403 Forbidden**: Session blocking and proxy rotation
- **429 Too Many Requests**: Extended delays and session cooling
- **5xx Server Errors**: Retry with backoff

### Data Errors
- **Parsing Failures**: Graceful degradation with error logging
- **Validation Errors**: Data quality scoring and error reporting
- **Missing Data**: Default value assignment with warnings

### Session Management
- **Blocked Sessions**: Automatic detection and rotation
- **Proxy Failures**: Proxy health monitoring and rotation
- **Session Recovery**: Automatic session reset and recovery

## Events

The scraping engine emits various events for monitoring:

```typescript
// Data processing events
scraper.on('fighterProcessed', (event) => { /* Fighter successfully processed */ });
scraper.on('fightProcessed', (event) => { /* Fight successfully processed */ });
scraper.on('eventProcessed', (event) => { /* Event successfully processed */ });

// Error events
scraper.on('scrapingError', (event) => { /* Scraping error occurred */ });
scraper.on('sessionBlocked', (event) => { /* Session was blocked */ });
scraper.on('allSessionsBlocked', (event) => { /* All sessions blocked */ });

// Rate limiting events
scraper.on('rateLimitWait', (event) => { /* Waiting for rate limit */ });
scraper.on('sessionReset', (event) => { /* Session was reset */ });
scraper.on('allSessionsReset', (event) => { /* All sessions reset */ });
```

## Configuration

### Environment Variables

```bash
# Rate limiting
UFC_STATS_RATE_LIMIT_PER_MINUTE=30
UFC_STATS_RATE_LIMIT_PER_HOUR=500

# Proxy configuration (optional)
UFC_STATS_PROXY_LIST="http://proxy1:8080,https://proxy2:8080"
UFC_STATS_PROXY_AUTH="user:pass"

# Request delays
UFC_STATS_MIN_DELAY=2000
UFC_STATS_MAX_DELAY=5000

# Anti-detection
UFC_STATS_RANDOMIZE_HEADERS=true
UFC_STATS_ROTATE_PROXIES=true
```

### Programmatic Configuration

```typescript
const config: UFCStatsScrapingConfig = {
  baseUrl: 'http://ufcstats.com',
  rateLimit: {
    requestsPerMinute: 30,
    requestsPerHour: 500
  },
  requestDelay: {
    min: 2000,
    max: 5000
  },
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  ],
  proxies: [
    { host: 'proxy.example.com', port: 8080, protocol: 'http' }
  ],
  antiDetection: {
    randomizeHeaders: true,
    rotateProxies: true,
    respectRobotsTxt: true
  }
};
```

## Testing

The implementation includes comprehensive tests:

### Unit Tests
- Data parsing and validation logic
- Session management functionality
- Error handling scenarios
- Configuration validation

### Integration Tests
- Full scraping workflows with mock HTML
- Rate limiting and anti-detection measures
- Error recovery and resilience
- Data transformation accuracy

### Performance Tests
- High-load scraping scenarios
- Memory usage monitoring
- Session rotation efficiency
- Rate limiting effectiveness

## Best Practices

### Respectful Scraping
1. **Rate Limiting**: Never exceed reasonable request rates
2. **User Agent**: Use realistic browser user agents
3. **Robots.txt**: Respect site policies (future implementation)
4. **Error Handling**: Gracefully handle failures without hammering

### Data Quality
1. **Validation**: Always validate scraped data
2. **Transformation**: Normalize data to platform standards
3. **Error Reporting**: Track and report data quality issues
4. **Confidence Scoring**: Assign confidence levels to data

### Monitoring
1. **Event Logging**: Monitor all scraping events
2. **Performance Metrics**: Track success rates and timing
3. **Error Analysis**: Analyze and respond to error patterns
4. **Health Checks**: Regular status monitoring

### Security
1. **Proxy Rotation**: Use diverse proxy pools
2. **Session Management**: Isolate and rotate sessions
3. **Anti-Detection**: Implement realistic browsing patterns
4. **Error Handling**: Avoid revealing scraping patterns

## Future Enhancements

### Planned Features
- **JavaScript Rendering**: Puppeteer integration for dynamic content
- **CAPTCHA Handling**: Automated CAPTCHA solving
- **Machine Learning**: Pattern recognition for anti-detection
- **Distributed Scraping**: Multi-node scraping coordination

### Performance Improvements
- **Caching**: Intelligent response caching
- **Compression**: Request/response compression
- **Connection Pooling**: HTTP connection reuse
- **Parallel Processing**: Concurrent request handling

### Data Enhancements
- **Real-time Updates**: Live fight statistics
- **Historical Analysis**: Trend detection and analysis
- **Data Enrichment**: Cross-reference with other sources
- **Quality Metrics**: Advanced data quality scoring

## Troubleshooting

### Common Issues

#### All Sessions Blocked
```typescript
// Reset all sessions
scraper.resetAllSessions();

// Check proxy health
const status = scraper.getStatus();
console.log('Blocked proxies:', status.blockedProxies);
```

#### Rate Limiting Issues
```typescript
// Increase delays
const config = scraper.getConfig();
config.requestDelay.min = 5000;
config.requestDelay.max = 10000;
```

#### Data Validation Errors
```typescript
// Check validation errors
const result = await scraper.syncData();
result.errors.forEach(error => {
  console.log(`${error.field}: ${error.message}`);
});
```

### Debugging

Enable detailed logging:

```typescript
scraper.on('rateLimitWait', (event) => {
  console.log(`Waiting ${event.delay}ms for session ${event.sessionId}`);
});

scraper.on('sessionBlocked', (event) => {
  console.log(`Session ${event.sessionId} blocked: ${event.reason}`);
});
```

## License

This scraping engine is part of the UFC Prediction Platform and is subject to the project's license terms. Use responsibly and in accordance with UFC Stats' terms of service.