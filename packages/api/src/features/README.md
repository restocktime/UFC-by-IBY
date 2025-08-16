# Feature Engineering Service

The Feature Engineering Service provides comprehensive feature extraction capabilities for the UFC Prediction Platform. It transforms raw fight data, contextual information, and betting odds into ML-ready features for prediction models.

## Components

### 1. MetricsCalculator

Calculates rolling statistics and performance trends for fighters based on their fight history.

**Key Features:**
- Rolling averages for striking accuracy, takedown defense, control time
- Fight frequency calculation
- Trend analysis with configurable time windows
- Performance form indicators

**Usage:**
```typescript
import { MetricsCalculator } from './features';

const calculator = new MetricsCalculator({
  windowSize: 5,
  minDataPoints: 3,
  trendThreshold: 10
});

const rollingStats = calculator.calculateRollingStats(fightStats);
```

### 2. ContextualFeatureExtractor

Extracts features from contextual information including training camps, injuries, weight cuts, and opponent matchups.

**Key Features:**
- Camp reputation and specialization encoding
- Injury impact and recovery status analysis
- Weight cut difficulty and consistency metrics
- Layoff and venue experience factors
- Style mismatch and size advantage calculations

**Usage:**
```typescript
import { ContextualFeatureExtractor } from './features';

const extractor = new ContextualFeatureExtractor({
  injuryLookbackDays: 365,
  weightCutLookbackFights: 5,
  layoffThresholdDays: 180
});

const contextualFeatures = extractor.extractFeatures(contextualData);
```

### 3. OddsFeatureExtractor

Analyzes betting market data to extract features related to line movements, market consensus, and bookmaker confidence.

**Key Features:**
- Implied probability calculations
- Line movement velocity and reversal detection
- Steam move identification
- Sharp vs public money divergence
- Arbitrage opportunity detection
- Closing line value calculation

**Usage:**
```typescript
import { OddsFeatureExtractor } from './features';

const extractor = new OddsFeatureExtractor({
  steamMoveThreshold: 5.0,
  sharpBookmakers: ['Pinnacle', 'Bookmaker'],
  publicBookmakers: ['DraftKings', 'FanDuel']
});

const oddsFeatures = extractor.extractFeatures(oddsData);
```

### 4. FeatureEngineeringService

Factory class that provides a unified interface to all feature engineering components.

**Usage:**
```typescript
import { FeatureEngineeringService } from './features';

const service = new FeatureEngineeringService();

const allFeatures = await service.extractAllFeatures(
  fightStats,
  contextualData,
  oddsData
);
```

## Feature Categories

### Rolling Statistics Features
- `strikingAccuracy`: Rolling average striking accuracy with trend
- `takedownDefense`: Rolling average takedown defense percentage
- `fightFrequency`: Fights per year calculation
- `winRate`: Rolling win percentage with trend analysis

### Contextual Features
- `campReputation`: Training camp quality score (0-1)
- `recentInjuryImpact`: Impact of recent injuries (0-1)
- `weightCutDifficulty`: Historical weight cut difficulty (0-1)
- `layoffDuration`: Time since last fight (normalized)
- `styleMismatchScore`: Style advantage/disadvantage (-1 to 1)

### Odds Features
- `openingImpliedProbability`: Market opening probabilities
- `totalLineMovement`: Total line movement from open to close
- `marketConsensusStrength`: Agreement between bookmakers (0-1)
- `sharpPublicDivergence`: Difference between sharp and public money
- `closingLineValue`: Value of betting position vs closing line

## Configuration

Each component accepts configuration objects to customize behavior:

```typescript
// Metrics Calculator Config
{
  windowSize: 5,           // Number of fights in rolling window
  minDataPoints: 3,        // Minimum fights required
  trendThreshold: 10       // Percentage change for trend detection
}

// Contextual Extractor Config
{
  injuryLookbackDays: 365,      // Days to look back for injuries
  weightCutLookbackFights: 5,   // Fights to analyze for weight cuts
  layoffThresholdDays: 180,     // Days to consider significant layoff
  altitudeThresholdFeet: 3000,  // Altitude requiring adjustment
  timeZoneThresholdHours: 3     // Time zone change threshold
}

// Odds Extractor Config
{
  steamMoveThreshold: 5.0,              // Percentage for steam moves
  significantMoveThreshold: 2.0,        // Percentage for significant moves
  sharpBookmakers: ['Pinnacle'],        // Sharp bookmaker list
  publicBookmakers: ['DraftKings'],     // Public bookmaker list
  volumeSpikeFactor: 2.0,               // Volume spike multiplier
  arbitrageMinProfit: 1.0               // Minimum arbitrage profit %
}
```

## Testing

The feature engineering service includes comprehensive unit tests covering:
- Statistical calculations and edge cases
- Feature extraction accuracy
- Configuration management
- Error handling and boundary conditions

Run tests with:
```bash
npm test src/features/
```

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **Requirement 1.2**: Rolling averages for key metrics and performance trends
- **Requirement 1.4**: Performance trend detection over configurable time windows
- **Requirement 4.1**: Camp data and contextual feature extraction
- **Requirement 4.2**: Injury reports and weight cut impact features
- **Requirement 4.3**: Layoff calculation and weight class change features
- **Requirement 2.1**: Line movement and market confidence features
- **Requirement 2.4**: Implied probabilities and market consensus
- **Requirement 3.4**: Bookmaker confidence scoring and arbitrage detection