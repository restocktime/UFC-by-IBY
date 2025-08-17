/**
 * Enhanced Prediction Engine Example
 * Demonstrates the complete betting analysis and feature engineering workflow
 */

import { bettingAnalysisService } from '../services/betting-analysis.service.js';
import { realTimeFeatureEngineeringService } from '../features/real-time-feature-engineering.service.js';
import { LiveDataTrainer } from '../../ml/src/training/live-data-trainer.js';
import { ModelManager } from '../../ml/src/models/model-manager.js';
import { FightData, FighterData, OddsData, PredictionResult } from '@ufc-platform/shared';

// Mock data for demonstration
const mockFightData: FightData = {
  id: 'ufc319_main_event',
  fighter1: { name: 'Jon Jones', id: 'jones_j' },
  fighter2: { name: 'Stipe Miocic', id: 'miocic_s' },
  weightClass: 'Heavyweight',
  isTitleFight: true,
  isMainEvent: true,
  scheduledRounds: 5,
  eventId: 'ufc319',
  eventDate: new Date('2024-11-16'),
  venue: 'Madison Square Garden'
} as FightData;

const mockFighter1Data: FighterData = {
  id: 'jones_j',
  name: 'Jon Jones',
  dateOfBirth: '1987-07-19',
  stats: {
    strikingAccuracy: 0.58,
    takedownDefense: 0.95,
    significantStrikes: 1200,
    takedowns: 45,
    submissions: 6
  },
  physicalStats: {
    height: 193,
    weight: 115,
    reach: 215
  },
  record: {
    wins: 27,
    losses: 1,
    draws: 0,
    totalFights: 28
  }
} as FighterData;

const mockFighter2Data: FighterData = {
  id: 'miocic_s',
  name: 'Stipe Miocic',
  dateOfBirth: '1982-08-19',
  stats: {
    strikingAccuracy: 0.52,
    takedownDefense: 0.68,
    significantStrikes: 980,
    takedowns: 12,
    submissions: 0
  },
  physicalStats: {
    height: 193,
    weight: 115,
    reach: 203
  },
  record: {
    wins: 20,
    losses: 4,
    draws: 0,
    totalFights: 24
  }
} as FighterData;

const mockOddsData: OddsData[] = [
  {
    id: 'odds_1',
    fightId: 'ufc319_main_event',
    fighter: 'Jon Jones',
    sportsbook: 'DraftKings',
    odds: 1.67,
    timestamp: new Date(),
    market: 'moneyline'
  },
  {
    id: 'odds_2',
    fightId: 'ufc319_main_event',
    fighter: 'Stipe Miocic',
    sportsbook: 'DraftKings',
    odds: 2.30,
    timestamp: new Date(),
    market: 'moneyline'
  },
  {
    id: 'odds_3',
    fightId: 'ufc319_main_event',
    fighter: 'Jon Jones',
    sportsbook: 'FanDuel',
    odds: 1.70,
    timestamp: new Date(),
    market: 'moneyline'
  },
  {
    id: 'odds_4',
    fightId: 'ufc319_main_event',
    fighter: 'Stipe Miocic',
    sportsbook: 'FanDuel',
    odds: 2.25,
    timestamp: new Date(),
    market: 'moneyline'
  }
];

const mockPrediction: PredictionResult = {
  winnerProbability: { fighter1: 0.72, fighter2: 0.28 },
  methodPrediction: { ko: 0.35, submission: 0.25, decision: 0.40 },
  roundPrediction: { round1: 0.15, round2: 0.20, round3: 0.25, round4: 0.20, round5: 0.20 },
  confidence: 0.82,
  keyFactors: [
    { feature: 'reach_advantage', importance: 0.15, value: 12 },
    { feature: 'takedown_defense', importance: 0.18, value: 0.95 },
    { feature: 'experience_advantage', importance: 0.12, value: 4 }
  ],
  modelVersion: 'ensemble_v2.1',
  timestamp: new Date()
};

/**
 * Comprehensive example demonstrating the enhanced prediction engine
 */
export async function demonstrateEnhancedPredictionEngine(): Promise<void> {
  console.log('🥊 Enhanced Prediction Engine Demonstration');
  console.log('==========================================\n');

  try {
    // 1. Feature Engineering
    console.log('1. 🔧 Real-time Feature Engineering');
    console.log('-----------------------------------');
    
    const contextData = {
      venue: 'Madison Square Garden',
      eventImportance: 'high',
      injuries: [],
      trainingCamp: {
        jones: { quality: 'excellent', duration: 12 },
        miocic: { quality: 'good', duration: 10 }
      }
    };

    const engineering = await realTimeFeatureEngineeringService.extractFeatures(
      mockFightData,
      mockFighter1Data,
      mockFighter2Data,
      mockOddsData,
      contextData
    );

    console.log(`✅ Extracted ${Object.keys(engineering.baseFeatures).length} base features`);
    console.log(`✅ Generated ${engineering.dynamicFeatures.length} dynamic features`);
    console.log(`✅ Created ${engineering.derivedFeatures.length} derived features`);
    console.log(`✅ Identified ${engineering.contextualFeatures.length} contextual features`);
    
    // Display key features
    console.log('\n📊 Key Features:');
    console.log(`   Reach Advantage: ${engineering.baseFeatures.reachAdvantage}cm`);
    console.log(`   Experience Advantage: ${engineering.baseFeatures.experienceAdvantage} fights`);
    console.log(`   Jones Takedown Defense: ${engineering.baseFeatures.fighter1TakedownDefense}`);
    console.log(`   Miocic Striking Accuracy: ${engineering.baseFeatures.fighter2StrikingAccuracy}`);

    // 2. Value Betting Analysis
    console.log('\n2. 💰 Value Betting Analysis');
    console.log('----------------------------');
    
    const valueBets = await bettingAnalysisService.analyzeValueBets(
      mockFightData,
      mockOddsData,
      mockPrediction
    );

    console.log(`✅ Found ${valueBets.length} value betting opportunities`);
    
    for (const bet of valueBets) {
      console.log(`\n🎯 Value Bet: ${bet.fighter}`);
      console.log(`   Sportsbook: ${bet.sportsbook}`);
      console.log(`   Current Odds: ${bet.currentOdds}`);
      console.log(`   Fair Odds: ${bet.fairOdds.toFixed(2)}`);
      console.log(`   Expected Value: ${(bet.expectedValue * 100).toFixed(1)}%`);
      console.log(`   Kelly Fraction: ${(bet.kellyFraction * 100).toFixed(1)}%`);
      console.log(`   Risk Level: ${bet.riskLevel}`);
      console.log(`   Reasoning: ${bet.reasoning.join(', ')}`);
    }

    // 3. Bankroll Management
    console.log('\n3. 🏦 Bankroll Management');
    console.log('-------------------------');
    
    const bankroll = 10000; // $10,000 bankroll
    const recommendations = bettingAnalysisService.generateBankrollRecommendations(
      bankroll,
      'moderate'
    );

    console.log(`💵 Total Bankroll: $${bankroll.toLocaleString()}`);
    console.log(`📈 Recommended Unit Size: $${recommendations.recommendedUnit}`);
    console.log(`🎯 Max Single Bet: $${recommendations.maxBetSize}`);
    console.log(`⚠️  Current Risk: ${(recommendations.currentRisk * 100).toFixed(1)}%`);
    console.log(`📊 Diversification Score: ${(recommendations.diversificationScore * 100).toFixed(1)}%`);

    console.log('\n📋 Risk Profiles:');
    Object.entries(recommendations.recommendations).forEach(([profile, rec]) => {
      console.log(`   ${profile.charAt(0).toUpperCase() + profile.slice(1)}:`);
      console.log(`     Unit Size: $${rec.unitSize}`);
      console.log(`     Max Bet: $${rec.maxSingleBet}`);
      console.log(`     Daily Risk: $${rec.maxDailyRisk}`);
    });

    // 4. Strategy Application
    console.log('\n4. 🎯 Betting Strategy Application');
    console.log('----------------------------------');
    
    // Create a custom strategy
    const strategyId = bettingAnalysisService.createStrategy({
      name: 'High Confidence Value',
      description: 'Target high confidence bets with strong expected value',
      type: 'value',
      parameters: {
        minExpectedValue: 0.08,
        maxRiskPerBet: 0.03,
        minConfidence: 0.75,
        maxOdds: 3.0,
        minOdds: 1.4,
        bankrollPercentage: 0.02
      },
      filters: [
        {
          field: 'riskLevel',
          operator: 'in',
          value: ['low', 'medium'],
          description: 'Only low to medium risk bets'
        }
      ],
      isActive: true
    });

    console.log(`✅ Created custom strategy: ${strategyId}`);

    const strategyResults = await bettingAnalysisService.applyStrategies(
      mockFightData,
      mockOddsData,
      mockPrediction
    );

    console.log(`🔍 Applied ${strategyResults.length} active strategies`);
    
    for (const result of strategyResults) {
      console.log(`\n📈 Strategy: ${result.strategy.name}`);
      console.log(`   Opportunities Found: ${result.opportunities.length}`);
      
      for (const opp of result.opportunities) {
        console.log(`   • ${opp.fighter}: ${(opp.expectedValue * 100).toFixed(1)}% EV`);
      }
    }

    // 5. Arbitrage Detection
    console.log('\n5. ⚖️  Arbitrage Detection');
    console.log('-------------------------');
    
    const arbitrageOpportunities = bettingAnalysisService.detectArbitrageOpportunities(
      mockFightData,
      mockOddsData
    );

    if (arbitrageOpportunities.length > 0) {
      console.log(`✅ Found ${arbitrageOpportunities.length} arbitrage opportunities`);
      
      for (const arb of arbitrageOpportunities) {
        console.log(`\n💎 Arbitrage Opportunity:`);
        console.log(`   Total Stake: $${arb.totalStake}`);
        console.log(`   Guaranteed Profit: $${arb.guaranteedProfit.toFixed(2)}`);
        console.log(`   Profit Margin: ${arb.profitMargin.toFixed(2)}%`);
        console.log(`   Bets Required:`);
        
        for (const bet of arb.bets) {
          console.log(`     ${bet.fighter} @ ${bet.odds} (${bet.sportsbook}): $${bet.stake.toFixed(2)}`);
        }
        
        if (arb.riskFactors.length > 0) {
          console.log(`   ⚠️  Risk Factors: ${arb.riskFactors.join(', ')}`);
        }
      }
    } else {
      console.log('❌ No arbitrage opportunities found');
    }

    // 6. Market Analysis
    console.log('\n6. 📈 Market Analysis');
    console.log('--------------------');
    
    // Create mock historical odds for market analysis
    const historicalOdds = [
      ...mockOddsData,
      ...mockOddsData.map(odds => ({
        ...odds,
        id: odds.id + '_hist1',
        odds: odds.odds + 0.05,
        timestamp: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      })),
      ...mockOddsData.map(odds => ({
        ...odds,
        id: odds.id + '_hist2',
        odds: odds.odds + 0.10,
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      }))
    ];

    const marketAnalysis = bettingAnalysisService.analyzeMarket(
      mockFightData.id,
      historicalOdds
    );

    console.log(`📊 Market Efficiency: ${(marketAnalysis.efficiency * 100).toFixed(1)}%`);
    console.log(`💧 Liquidity Score: ${(marketAnalysis.liquidity * 100).toFixed(1)}%`);
    console.log(`📈 Market Sentiment: ${marketAnalysis.marketSentiment}`);
    console.log(`💰 Total Volume: $${marketAnalysis.totalVolume.toLocaleString()}`);
    console.log(`🧠 Sharp Money: $${marketAnalysis.sharpMoney.toLocaleString()}`);
    console.log(`👥 Public Money: $${marketAnalysis.publicMoney.toLocaleString()}`);
    console.log(`🔄 Line Movements: ${marketAnalysis.lineMovement.length}`);

    // 7. Live Data Training Simulation
    console.log('\n7. 🤖 Live Data Model Training');
    console.log('------------------------------');
    
    const modelManager = new ModelManager();
    const liveTrainer = new LiveDataTrainer({
      retrainingInterval: 24,
      minNewDataPoints: 10,
      performanceThreshold: 2.0,
      maxTrainingHistory: 1000,
      continuousLearningEnabled: true,
      ensembleSize: 3,
      validationSplit: 0.2
    }, modelManager);

    // Simulate adding training data
    const trainingDataPoint = {
      features: engineering.baseFeatures,
      outcome: {
        winnerId: 'fighter1', // Jones wins
        method: 'Decision' as const,
        round: 5
      },
      timestamp: new Date(),
      dataQuality: 0.92,
      source: 'live_event'
    };

    await liveTrainer.addTrainingData(trainingDataPoint);
    
    const trainingStats = liveTrainer.getTrainingStats();
    console.log(`📚 Total Training Data Points: ${trainingStats.totalDataPoints}`);
    console.log(`🆕 New Data Points: ${trainingStats.newDataPoints}`);
    console.log(`🎯 Current Model Performance: ${(trainingStats.currentPerformance.f1Score * 100).toFixed(1)}%`);
    console.log(`⏰ Last Training: ${trainingStats.lastTrainingTime.toLocaleString()}`);

    // 8. Feature Importance Analysis
    console.log('\n8. 🎯 Feature Importance Analysis');
    console.log('---------------------------------');
    
    const featureImportance = realTimeFeatureEngineeringService.getFeatureImportance();
    const topFeatures = Array.from(featureImportance.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    console.log('🏆 Top 5 Most Important Features:');
    topFeatures.forEach(([feature, importance], index) => {
      console.log(`   ${index + 1}. ${feature}: ${(importance * 100).toFixed(1)}%`);
    });

    // 9. Expected Value Calculations
    console.log('\n9. 🧮 Expected Value Calculations');
    console.log('---------------------------------');
    
    for (const odds of mockOddsData.slice(0, 2)) {
      const trueProbability = odds.fighter === 'Jon Jones' ? 0.72 : 0.28;
      const evCalc = bettingAnalysisService.calculateExpectedValue(
        trueProbability,
        odds.odds
      );

      console.log(`\n💡 ${odds.fighter} (${odds.sportsbook}):`);
      console.log(`   Odds: ${odds.odds}`);
      console.log(`   True Probability: ${(trueProbability * 100).toFixed(1)}%`);
      console.log(`   Expected Value: ${(evCalc.expectedValue * 100).toFixed(1)}%`);
      console.log(`   Break-even Odds: ${evCalc.breakEvenOdds.toFixed(2)}`);
      console.log(`   Margin of Safety: ${(evCalc.marginOfSafety * 100).toFixed(1)}%`);
    }

    console.log('\n✅ Enhanced Prediction Engine demonstration completed successfully!');
    console.log('\n🎯 Key Capabilities Demonstrated:');
    console.log('   • Real-time feature engineering with 30+ features');
    console.log('   • Advanced value betting analysis with Kelly criterion');
    console.log('   • Intelligent bankroll management recommendations');
    console.log('   • Custom betting strategy creation and application');
    console.log('   • Arbitrage opportunity detection');
    console.log('   • Market efficiency and sentiment analysis');
    console.log('   • Continuous learning with live data integration');
    console.log('   • Feature importance tracking and optimization');
    console.log('   • Comprehensive expected value calculations');

  } catch (error) {
    console.error('❌ Error in enhanced prediction engine demonstration:', error);
    throw error;
  }
}

// Run the demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateEnhancedPredictionEngine()
    .then(() => {
      console.log('\n🎉 Demonstration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Demonstration failed:', error);
      process.exit(1);
    });
}