/**
 * ModelTrainer - Core class for training ML models with cross-validation and hyperparameter optimization
 */

import { FeatureImportance } from '@ufc-platform/shared';

export interface TrainingConfig {
  modelType: 'binary_classifier' | 'multi_class' | 'regression';
  crossValidationFolds: number;
  testSizeRatio: number;
  randomState: number;
  hyperparameterOptimization: boolean;
  maxIterations: number;
}

export interface HyperparameterSpace {
  [key: string]: {
    type: 'int' | 'float' | 'categorical';
    min?: number;
    max?: number;
    values?: any[];
  };
}

export interface TrainingData {
  features: number[][];
  labels: number[] | string[];
  featureNames: string[];
  sampleWeights?: number[];
}

export interface ValidationResult {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc?: number;
  confusionMatrix: number[][];
  crossValidationScores: number[];
}

export interface TrainingResult {
  modelId: string;
  modelVersion: string;
  validation: ValidationResult;
  featureImportance: FeatureImportance[];
  hyperparameters: Record<string, any>;
  trainingTime: number;
  datasetSize: number;
  timestamp: Date;
}

export class ModelTrainer {
  private config: TrainingConfig;
  private hyperparameterSpace: HyperparameterSpace;

  constructor(config: TrainingConfig, hyperparameterSpace?: HyperparameterSpace) {
    this.config = config;
    this.hyperparameterSpace = hyperparameterSpace || {};
  }

  /**
   * Train a model with the provided data
   */
  async train(data: TrainingData): Promise<TrainingResult> {
    const startTime = Date.now();
    
    // Validate training data
    this.validateTrainingData(data);
    
    // Split data for training and testing
    const { trainData, testData } = this.splitData(data);
    
    // Perform hyperparameter optimization if enabled
    let bestParams: Record<string, any> = {};
    if (this.config.hyperparameterOptimization) {
      bestParams = await this.optimizeHyperparameters(trainData);
    }
    
    // Train the final model with best parameters
    const model = await this.trainModel(trainData, bestParams);
    
    // Validate the model
    const validation = await this.validateModel(model, testData);
    
    // Calculate feature importance
    const featureImportance = await this.calculateFeatureImportance(model, data.featureNames);
    
    // Generate model ID and version
    const modelId = this.generateModelId();
    const modelVersion = this.generateModelVersion();
    
    const trainingTime = Math.max(1, Date.now() - startTime); // Ensure at least 1ms
    
    return {
      modelId,
      modelVersion,
      validation,
      featureImportance,
      hyperparameters: bestParams,
      trainingTime,
      datasetSize: data.features.length,
      timestamp: new Date()
    };
  }

  /**
   * Perform cross-validation on the model
   */
  async crossValidate(data: TrainingData, params?: Record<string, any>): Promise<number[]> {
    const folds = this.createCrossValidationFolds(data);
    const scores: number[] = [];
    
    for (const fold of folds) {
      const model = await this.trainModel(fold.train, params);
      const score = await this.evaluateModel(model, fold.validation);
      scores.push(score);
    }
    
    return scores;
  }

  /**
   * Validate training data integrity
   */
  private validateTrainingData(data: TrainingData): void {
    if (!data.features || !data.labels || !data.featureNames) {
      throw new Error('Training data must include features, labels, and feature names');
    }
    
    if (data.features.length !== data.labels.length) {
      throw new Error('Features and labels must have the same number of samples');
    }
    
    if (data.features.length === 0) {
      throw new Error('Training data cannot be empty');
    }
    
    if (data.features[0].length !== data.featureNames.length) {
      throw new Error('Number of features must match feature names length');
    }
    
    // Check for missing values
    for (let i = 0; i < data.features.length; i++) {
      for (let j = 0; j < data.features[i].length; j++) {
        if (data.features[i][j] === null || data.features[i][j] === undefined || isNaN(data.features[i][j])) {
          throw new Error(`Missing or invalid value at sample ${i}, feature ${j}`);
        }
      }
    }
  }

  /**
   * Split data into training and testing sets
   */
  private splitData(data: TrainingData): { trainData: TrainingData; testData: TrainingData } {
    const testSize = Math.floor(data.features.length * this.config.testSizeRatio);
    const trainSize = data.features.length - testSize;
    
    // Shuffle indices for random split
    const indices = Array.from({ length: data.features.length }, (_, i) => i);
    this.shuffleArray(indices);
    
    const trainIndices = indices.slice(0, trainSize);
    const testIndices = indices.slice(trainSize);
    
    const trainData: TrainingData = {
      features: trainIndices.map(i => data.features[i]),
      labels: trainIndices.map(i => data.labels[i]),
      featureNames: data.featureNames,
      sampleWeights: data.sampleWeights ? trainIndices.map(i => data.sampleWeights![i]) : undefined
    };
    
    const testData: TrainingData = {
      features: testIndices.map(i => data.features[i]),
      labels: testIndices.map(i => data.labels[i]),
      featureNames: data.featureNames,
      sampleWeights: data.sampleWeights ? testIndices.map(i => data.sampleWeights![i]) : undefined
    };
    
    return { trainData, testData };
  }

  /**
   * Create cross-validation folds
   */
  private createCrossValidationFolds(data: TrainingData): Array<{ train: TrainingData; validation: TrainingData }> {
    const folds: Array<{ train: TrainingData; validation: TrainingData }> = [];
    const foldSize = Math.floor(data.features.length / this.config.crossValidationFolds);
    
    // Shuffle indices
    const indices = Array.from({ length: data.features.length }, (_, i) => i);
    this.shuffleArray(indices);
    
    for (let i = 0; i < this.config.crossValidationFolds; i++) {
      const validationStart = i * foldSize;
      const validationEnd = i === this.config.crossValidationFolds - 1 
        ? data.features.length 
        : (i + 1) * foldSize;
      
      const validationIndices = indices.slice(validationStart, validationEnd);
      const trainIndices = indices.filter((_, idx) => idx < validationStart || idx >= validationEnd);
      
      const trainData: TrainingData = {
        features: trainIndices.map(idx => data.features[idx]),
        labels: trainIndices.map(idx => data.labels[idx]),
        featureNames: data.featureNames,
        sampleWeights: data.sampleWeights ? trainIndices.map(idx => data.sampleWeights![idx]) : undefined
      };
      
      const validationData: TrainingData = {
        features: validationIndices.map(idx => data.features[idx]),
        labels: validationIndices.map(idx => data.labels[idx]),
        featureNames: data.featureNames,
        sampleWeights: data.sampleWeights ? validationIndices.map(idx => data.sampleWeights![idx]) : undefined
      };
      
      folds.push({ train: trainData, validation: validationData });
    }
    
    return folds;
  }

  /**
   * Optimize hyperparameters using grid search or random search
   */
  private async optimizeHyperparameters(data: TrainingData): Promise<Record<string, any>> {
    const paramCombinations = this.generateParameterCombinations();
    let bestParams: Record<string, any> = {};
    let bestScore = -Infinity;
    
    for (const params of paramCombinations) {
      const scores = await this.crossValidate(data, params);
      const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestParams = { ...params };
      }
    }
    
    return bestParams;
  }

  /**
   * Generate parameter combinations for hyperparameter optimization
   */
  private generateParameterCombinations(): Record<string, any>[] {
    const combinations: Record<string, any>[] = [];
    const paramNames = Object.keys(this.hyperparameterSpace);
    
    if (paramNames.length === 0) {
      return [{}];
    }
    
    // Simple grid search implementation
    const generateCombinations = (index: number, current: Record<string, any>): void => {
      if (index === paramNames.length) {
        combinations.push({ ...current });
        return;
      }
      
      const paramName = paramNames[index];
      const paramConfig = this.hyperparameterSpace[paramName];
      
      let values: any[] = [];
      
      if (paramConfig.type === 'categorical') {
        values = paramConfig.values || [];
      } else if (paramConfig.type === 'int') {
        const min = paramConfig.min || 0;
        const max = paramConfig.max || 100;
        values = Array.from({ length: Math.min(10, max - min + 1) }, (_, i) => min + i);
      } else if (paramConfig.type === 'float') {
        const min = paramConfig.min || 0;
        const max = paramConfig.max || 1;
        values = Array.from({ length: 10 }, (_, i) => min + (max - min) * i / 9);
      }
      
      for (const value of values) {
        current[paramName] = value;
        generateCombinations(index + 1, current);
      }
    };
    
    generateCombinations(0, {});
    return combinations.slice(0, 100); // Limit to 100 combinations
  }

  /**
   * Train the actual model (placeholder - would integrate with actual ML library)
   */
  private async trainModel(data: TrainingData, params?: Record<string, any>): Promise<any> {
    // This is a placeholder implementation
    // In a real implementation, this would use libraries like scikit-learn, XGBoost, etc.
    return {
      type: this.config.modelType,
      parameters: params || {},
      trained: true,
      trainingData: data
    };
  }

  /**
   * Validate the trained model
   */
  private async validateModel(model: any, testData: TrainingData): Promise<ValidationResult> {
    // Placeholder implementation - would use actual model predictions
    const predictions = await this.predict(model, testData.features);
    
    return this.calculateMetrics(testData.labels as number[], predictions);
  }

  /**
   * Evaluate model performance
   */
  private async evaluateModel(model: any, data: TrainingData): Promise<number> {
    const predictions = await this.predict(model, data.features);
    const accuracy = this.calculateAccuracy(data.labels as number[], predictions);
    return accuracy;
  }

  /**
   * Make predictions with the model
   */
  private async predict(model: any, features: number[][]): Promise<number[]> {
    // Placeholder implementation
    return features.map(() => Math.random() > 0.5 ? 1 : 0);
  }

  /**
   * Calculate various performance metrics
   */
  private calculateMetrics(actual: number[], predicted: number[]): ValidationResult {
    const accuracy = this.calculateAccuracy(actual, predicted);
    const { precision, recall, f1Score } = this.calculatePrecisionRecallF1(actual, predicted);
    const confusionMatrix = this.calculateConfusionMatrix(actual, predicted);
    
    return {
      accuracy,
      precision,
      recall,
      f1Score,
      confusionMatrix,
      crossValidationScores: [] // Would be populated during cross-validation
    };
  }

  /**
   * Calculate accuracy
   */
  private calculateAccuracy(actual: number[], predicted: number[]): number {
    if (actual.length === 0) return 0;
    const correct = actual.reduce((sum, val, idx) => sum + (val === predicted[idx] ? 1 : 0), 0);
    return correct / actual.length;
  }

  /**
   * Calculate precision, recall, and F1 score
   */
  private calculatePrecisionRecallF1(actual: number[], predicted: number[]): { precision: number; recall: number; f1Score: number } {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] === 1 && predicted[i] === 1) tp++;
      else if (actual[i] === 0 && predicted[i] === 1) fp++;
      else if (actual[i] === 1 && predicted[i] === 0) fn++;
      else if (actual[i] === 0 && predicted[i] === 0) tn++;
    }
    
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    
    return { precision, recall, f1Score };
  }

  /**
   * Calculate confusion matrix
   */
  private calculateConfusionMatrix(actual: number[], predicted: number[]): number[][] {
    if (actual.length === 0) {
      return [[0, 0], [0, 0]];
    }
    
    // Determine the number of classes
    const maxActual = Math.max(...actual);
    const maxPredicted = Math.max(...predicted);
    const numClasses = Math.max(maxActual, maxPredicted, 1) + 1;
    
    // Initialize matrix with appropriate size
    const matrix: number[][] = Array(numClasses).fill(null).map(() => Array(numClasses).fill(0));
    
    for (let i = 0; i < actual.length; i++) {
      const actualClass = Math.max(0, Math.min(actual[i], numClasses - 1));
      const predictedClass = Math.max(0, Math.min(predicted[i], numClasses - 1));
      matrix[actualClass][predictedClass]++;
    }
    
    return matrix;
  }

  /**
   * Calculate feature importance
   */
  private async calculateFeatureImportance(model: any, featureNames: string[]): Promise<FeatureImportance[]> {
    // Placeholder implementation - would extract from actual model
    return featureNames.map((name, index) => ({
      feature: name,
      importance: Math.random(),
      description: `Importance of ${name} feature`
    })).sort((a, b) => b.importance - a.importance);
  }

  /**
   * Generate unique model ID
   */
  private generateModelId(): string {
    return `model_${this.config.modelType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate model version
   */
  private generateModelVersion(): string {
    const date = new Date();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `v${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}.${hours}${minutes}`;
  }

  /**
   * Shuffle array in place
   */
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}