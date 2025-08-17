/**
 * LiveDataTrainer - Handles training ML models with real historical data and continuous learning
 */

import { EventEmitter } from 'events';
import { ModelTrainer, TrainingData, TrainingResult } from './model-trainer.js';
import { FightFeatures, FightOutcome } from '../models/fight-outcome-predictor.js';
import { ModelManager, ModelMetadata } from '../models/model-manager.js';
import { DataPreprocessor } from '../preprocessing/data-preprocessor.js';

export interface LiveTrainingConfig {
  retrainingInterval: number; // hours between retraining
  minNewDataPoints: number; // minimum new data points to trigger retraining
  performanceThreshold: number; // minimum performance improvement to deploy new model
  maxTrainingHistory: number; // maximum number of fights to keep in training data
  continuousLearningEnabled: boolean;
  ensembleSize: number; // number of models in ensemble
  validationSplit: number; // percentage of data for validation
}

export interface TrainingDataPoint {
  features: FightFeatures;
  outcome: FightOutcome;
  timestamp: Date;
  dataQuality: number; // 0-1 quality score
  source: string; // data source identifier
}

export interface ModelPerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  calibrationError: number;
  predictionConfidence: number;
}

export interface RetrainingResult {
  modelId: string;
  previousPerformance: ModelPerformanceMetrics;
  newPerformance: ModelPerformanceMetrics;
  improvementPercent: number;
  deployed: boolean;
  trainingTime: number;
  dataPointsUsed: number;
  timestamp: Date;
}

export interface ContinuousLearningState {
  lastTrainingTime: Date;
  newDataCount: number;
  pendingDataPoints: TrainingDataPoint[];
  currentModelPerformance: ModelPerformanceMetrics;
  retrainingScheduled: boolean;
}

export class LiveDataTrainer extends EventEmitter {
  private config: LiveTrainingConfig;
  private modelManager: ModelManager;
  private dataPreprocessor: DataPreprocessor | null = null;
  private trainingHistory: TrainingDataPoint[] = [];
  private continuousLearningState: ContinuousLearningState;
  private retrainingTimer: NodeJS.Timeout | undefined;

  constructor(
    config: LiveTrainingConfig,
    modelManager: ModelManager
  ) {
    super();
    this.config = config;
    this.modelManager = modelManager;
    // DataPreprocessor will be initialized when needed
    
    this.continuousLearningState = {
      lastTrainingTime: new Date(0),
      newDataCount: 0,
      pendingDataPoints: [],
      currentModelPerformance: {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        rocAuc: 0,
        calibrationError: 1,
        predictionConfidence: 0
      },
      retrainingScheduled: false
    };

    if (this.config.continuousLearningEnabled) {
      this.startContinuousLearning();
    }
  }

  /**
   * Add new training data point for continuous learning
   */
  async addTrainingData(dataPoint: TrainingDataPoint): Promise<void> {
    // Validate data quality
    if (dataPoint.dataQuality < 0.5) {
      this.emit('lowQualityDataRejected', {
        dataPoint,
        reason: 'Quality score below threshold'
      });
      return;
    }

    // Add to training history
    this.trainingHistory.push(dataPoint);
    this.continuousLearningState.pendingDataPoints.push(dataPoint);
    this.continuousLearningState.newDataCount++;

    // Maintain maximum training history size
    if (this.trainingHistory.length > this.config.maxTrainingHistory) {
      const removed = this.trainingHistory.splice(0, this.trainingHistory.length - this.config.maxTrainingHistory);
      this.emit('trainingDataPruned', { removedCount: removed.length });
    }

    this.emit('trainingDataAdded', {
      dataPoint,
      totalDataPoints: this.trainingHistory.length,
      pendingCount: this.continuousLearningState.newDataCount
    });

    // Check if retraining should be triggered
    await this.checkRetrainingTriggers();
  }

  /**
   * Retrain models with current data
   */
  async retrainModels(): Promise<RetrainingResult[]> {
    const startTime = Date.now();
    
    this.emit('retrainingStarted', {
      dataPointsAvailable: this.trainingHistory.length,
      newDataPoints: this.continuousLearningState.newDataCount
    });

    try {
      // Prepare training data
      const trainingData = await this.prepareTrainingData();
      
      // Train ensemble of models
      const ensembleResults = await this.trainEnsemble(trainingData);
      
      // Evaluate ensemble performance
      const ensemblePerformance = await this.evaluateEnsemble(ensembleResults, trainingData);
      
      // Compare with current model performance
      const improvementPercent = this.calculateImprovement(
        this.continuousLearningState.currentModelPerformance,
        ensemblePerformance
      );

      // Decide whether to deploy new models
      const shouldDeploy = improvementPercent >= this.config.performanceThreshold;
      
      if (shouldDeploy) {
        await this.deployEnsemble(ensembleResults);
        this.continuousLearningState.currentModelPerformance = ensemblePerformance;
      }

      // Reset continuous learning state
      this.continuousLearningState.lastTrainingTime = new Date();
      this.continuousLearningState.newDataCount = 0;
      this.continuousLearningState.pendingDataPoints = [];
      this.continuousLearningState.retrainingScheduled = false;

      const result: RetrainingResult = {
        modelId: `ensemble_${Date.now()}`,
        previousPerformance: this.continuousLearningState.currentModelPerformance,
        newPerformance: ensemblePerformance,
        improvementPercent,
        deployed: shouldDeploy,
        trainingTime: Date.now() - startTime,
        dataPointsUsed: this.trainingHistory.length,
        timestamp: new Date()
      };

      this.emit('retrainingCompleted', result);
      
      return [result];

    } catch (error: any) {
      this.emit('retrainingError', {
        error: error.message,
        trainingTime: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Prepare training data from historical data points
   */
  private async prepareTrainingData(): Promise<TrainingData> {
    // Sort by timestamp and quality
    const sortedData = this.trainingHistory
      .sort((a, b) => {
        // First by quality (higher quality first)
        if (a.dataQuality !== b.dataQuality) {
          return b.dataQuality - a.dataQuality;
        }
        // Then by timestamp (more recent first)
        return b.timestamp.getTime() - a.timestamp.getTime();
      });

    // Extract features and labels
    const features: number[][] = [];
    const labels: number[] = [];
    const featureNames: string[] = [];
    const sampleWeights: number[] = [];

    for (const dataPoint of sortedData) {
      // Extract feature vector
      const featureVector = this.extractFeatureVector(dataPoint.features);
      features.push(featureVector);

      // Extract label (1 for fighter1 win, 0 for fighter2 win)
      const label = dataPoint.outcome.winnerId === 'fighter1' ? 1 : 0;
      labels.push(label);

      // Calculate sample weight based on data quality and recency
      const recencyWeight = this.calculateRecencyWeight(dataPoint.timestamp);
      const weight = dataPoint.dataQuality * recencyWeight;
      sampleWeights.push(weight);
    }

    // Get feature names (only need to do this once)
    if (sortedData.length > 0) {
      featureNames.push(...this.getFeatureNames());
    }

    return {
      features,
      labels,
      featureNames,
      sampleWeights
    };
  }

  /**
   * Train ensemble of models with different configurations
   */
  private async trainEnsemble(trainingData: TrainingData): Promise<TrainingResult[]> {
    const ensembleResults: TrainingResult[] = [];

    // Define different model configurations for ensemble diversity
    const modelConfigs = [
      {
        modelType: 'binary_classifier' as const,
        crossValidationFolds: 5,
        testSizeRatio: this.config.validationSplit,
        randomState: 42,
        hyperparameterOptimization: true,
        maxIterations: 1000
      },
      {
        modelType: 'binary_classifier' as const,
        crossValidationFolds: 3,
        testSizeRatio: this.config.validationSplit,
        randomState: 123,
        hyperparameterOptimization: true,
        maxIterations: 1500
      },
      {
        modelType: 'binary_classifier' as const,
        crossValidationFolds: 7,
        testSizeRatio: this.config.validationSplit,
        randomState: 456,
        hyperparameterOptimization: false,
        maxIterations: 800
      }
    ];

    // Train each model in the ensemble
    for (let i = 0; i < Math.min(this.config.ensembleSize, modelConfigs.length); i++) {
      const config = modelConfigs[i];
      const trainer = new ModelTrainer(config);
      
      this.emit('ensembleModelTrainingStarted', {
        modelIndex: i,
        config
      });

      try {
        const result = await trainer.train(trainingData);
        ensembleResults.push(result);

        this.emit('ensembleModelTrainingCompleted', {
          modelIndex: i,
          result
        });

      } catch (error: any) {
        this.emit('ensembleModelTrainingError', {
          modelIndex: i,
          error: error.message
        });
        // Continue with other models even if one fails
      }
    }

    return ensembleResults;
  }

  /**
   * Evaluate ensemble performance
   */
  private async evaluateEnsemble(
    ensembleResults: TrainingResult[],
    trainingData: TrainingData
  ): Promise<ModelPerformanceMetrics> {
    if (ensembleResults.length === 0) {
      throw new Error('No models in ensemble to evaluate');
    }

    // Calculate weighted average of ensemble metrics
    const totalWeight = ensembleResults.reduce((sum, result) => sum + result.validation.f1Score, 0);
    
    let weightedAccuracy = 0;
    let weightedPrecision = 0;
    let weightedRecall = 0;
    let weightedF1Score = 0;
    let weightedRocAuc = 0;

    for (const result of ensembleResults) {
      const weight = result.validation.f1Score / totalWeight;
      weightedAccuracy += result.validation.accuracy * weight;
      weightedPrecision += result.validation.precision * weight;
      weightedRecall += result.validation.recall * weight;
      weightedF1Score += result.validation.f1Score * weight;
      weightedRocAuc += (result.validation.rocAuc || 0.5) * weight;
    }

    // Calculate ensemble-specific metrics
    const calibrationError = this.calculateCalibrationError(ensembleResults);
    const predictionConfidence = this.calculatePredictionConfidence(ensembleResults);

    return {
      accuracy: weightedAccuracy,
      precision: weightedPrecision,
      recall: weightedRecall,
      f1Score: weightedF1Score,
      rocAuc: weightedRocAuc,
      calibrationError,
      predictionConfidence
    };
  }

  /**
   * Deploy ensemble models
   */
  private async deployEnsemble(ensembleResults: TrainingResult[]): Promise<void> {
    for (let i = 0; i < ensembleResults.length; i++) {
      const result = ensembleResults[i];
      
      // Create model metadata
      const metadata: Partial<ModelMetadata> = {
        name: `Live Ensemble Model ${i + 1}`,
        description: `Continuously trained model ${i + 1} from live data`,
        tags: ['live-training', 'ensemble', 'continuous-learning'],
        author: 'live-data-trainer'
      };

      // Save model through model manager
      await this.modelManager.saveModel(
        { ensembleIndex: i, trainingResult: result },
        result,
        { featureMetadata: [] },
        metadata
      );

      this.emit('ensembleModelDeployed', {
        modelIndex: i,
        modelId: result.modelId
      });
    }
  }

  /**
   * Check if retraining should be triggered
   */
  private async checkRetrainingTriggers(): Promise<void> {
    const now = new Date();
    const timeSinceLastTraining = now.getTime() - this.continuousLearningState.lastTrainingTime.getTime();
    const hoursSinceLastTraining = timeSinceLastTraining / (1000 * 60 * 60);

    // Check triggers
    const hasEnoughNewData = this.continuousLearningState.newDataCount >= this.config.minNewDataPoints;
    const intervalReached = hoursSinceLastTraining >= this.config.retrainingInterval;
    const notAlreadyScheduled = !this.continuousLearningState.retrainingScheduled;

    if ((hasEnoughNewData || intervalReached) && notAlreadyScheduled) {
      this.continuousLearningState.retrainingScheduled = true;
      
      this.emit('retrainingTriggered', {
        trigger: hasEnoughNewData ? 'new_data' : 'interval',
        newDataCount: this.continuousLearningState.newDataCount,
        hoursSinceLastTraining
      });

      // Schedule retraining (allow some delay for batching)
      setTimeout(() => {
        this.retrainModels().catch(error => {
          this.emit('retrainingError', { error: error.message });
        });
      }, 5000); // 5 second delay
    }
  }

  /**
   * Start continuous learning process
   */
  private startContinuousLearning(): void {
    // Set up periodic retraining timer
    this.retrainingTimer = setInterval(() => {
      this.checkRetrainingTriggers().catch(error => {
        this.emit('continuousLearningError', { error: error.message });
      });
    }, 60 * 60 * 1000); // Check every hour

    this.emit('continuousLearningStarted', {
      retrainingInterval: this.config.retrainingInterval,
      minNewDataPoints: this.config.minNewDataPoints
    });
  }

  /**
   * Stop continuous learning process
   */
  stopContinuousLearning(): void {
    if (this.retrainingTimer) {
      clearInterval(this.retrainingTimer);
      this.retrainingTimer = undefined;
    }

    this.emit('continuousLearningStopped');
  }

  /**
   * Extract feature vector from fight features
   */
  private extractFeatureVector(features: FightFeatures): number[] {
    return [
      features.fighter1StrikingAccuracy,
      features.fighter1TakedownDefense,
      features.fighter1WinStreak,
      features.fighter1RecentForm,
      features.fighter1Experience,
      features.fighter1Age,
      features.fighter1Reach,
      features.fighter1Height,
      features.fighter1Weight,
      features.fighter2StrikingAccuracy,
      features.fighter2TakedownDefense,
      features.fighter2WinStreak,
      features.fighter2RecentForm,
      features.fighter2Experience,
      features.fighter2Age,
      features.fighter2Reach,
      features.fighter2Height,
      features.fighter2Weight,
      features.reachAdvantage,
      features.heightAdvantage,
      features.experienceAdvantage,
      features.ageAdvantage,
      features.titleFight,
      features.mainEvent,
      features.scheduledRounds,
      features.daysSinceLastFight1,
      features.daysSinceLastFight2,
      features.impliedProbability1 || 0.5,
      features.impliedProbability2 || 0.5,
      features.oddsMovement || 0
    ];
  }

  /**
   * Get feature names
   */
  private getFeatureNames(): string[] {
    return [
      'fighter1_striking_accuracy',
      'fighter1_takedown_defense',
      'fighter1_win_streak',
      'fighter1_recent_form',
      'fighter1_experience',
      'fighter1_age',
      'fighter1_reach',
      'fighter1_height',
      'fighter1_weight',
      'fighter2_striking_accuracy',
      'fighter2_takedown_defense',
      'fighter2_win_streak',
      'fighter2_recent_form',
      'fighter2_experience',
      'fighter2_age',
      'fighter2_reach',
      'fighter2_height',
      'fighter2_weight',
      'reach_advantage',
      'height_advantage',
      'experience_advantage',
      'age_advantage',
      'title_fight',
      'main_event',
      'scheduled_rounds',
      'days_since_last_fight_1',
      'days_since_last_fight_2',
      'implied_probability_1',
      'implied_probability_2',
      'odds_movement'
    ];
  }

  /**
   * Calculate recency weight for training samples
   */
  private calculateRecencyWeight(timestamp: Date): number {
    const now = new Date();
    const daysSince = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
    
    // Exponential decay with half-life of 180 days
    const halfLife = 180;
    return Math.exp(-Math.log(2) * daysSince / halfLife);
  }

  /**
   * Calculate improvement percentage between model performances
   */
  private calculateImprovement(
    previous: ModelPerformanceMetrics,
    current: ModelPerformanceMetrics
  ): number {
    // Use F1 score as primary metric for improvement
    if (previous.f1Score === 0) return current.f1Score > 0 ? 100 : 0;
    
    return ((current.f1Score - previous.f1Score) / previous.f1Score) * 100;
  }

  /**
   * Calculate calibration error for ensemble
   */
  private calculateCalibrationError(ensembleResults: TrainingResult[]): number {
    // Simplified calibration error calculation
    // In practice, this would require actual probability predictions vs outcomes
    const avgAccuracy = ensembleResults.reduce((sum, result) => sum + result.validation.accuracy, 0) / ensembleResults.length;
    const avgConfidence = 0.7; // Placeholder - would calculate from actual predictions
    
    return Math.abs(avgAccuracy - avgConfidence);
  }

  /**
   * Calculate prediction confidence for ensemble
   */
  private calculatePredictionConfidence(ensembleResults: TrainingResult[]): number {
    // Calculate confidence based on ensemble agreement
    const avgF1Score = ensembleResults.reduce((sum, result) => sum + result.validation.f1Score, 0) / ensembleResults.length;
    const f1Variance = ensembleResults.reduce((sum, result) => sum + Math.pow(result.validation.f1Score - avgF1Score, 2), 0) / ensembleResults.length;
    
    // Lower variance = higher confidence
    return Math.max(0, 1 - Math.sqrt(f1Variance));
  }

  /**
   * Get current training statistics
   */
  getTrainingStats(): {
    totalDataPoints: number;
    newDataPoints: number;
    lastTrainingTime: Date;
    currentPerformance: ModelPerformanceMetrics;
    retrainingScheduled: boolean;
  } {
    return {
      totalDataPoints: this.trainingHistory.length,
      newDataPoints: this.continuousLearningState.newDataCount,
      lastTrainingTime: this.continuousLearningState.lastTrainingTime,
      currentPerformance: this.continuousLearningState.currentModelPerformance,
      retrainingScheduled: this.continuousLearningState.retrainingScheduled
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<LiveTrainingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart continuous learning if interval changed
    if (newConfig.retrainingInterval && this.retrainingTimer) {
      this.stopContinuousLearning();
      this.startContinuousLearning();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): LiveTrainingConfig {
    return { ...this.config };
  }
}