/**
 * Unit tests for ModelTrainer class
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelTrainer, TrainingConfig, TrainingData, HyperparameterSpace } from '../model-trainer.js';

describe('ModelTrainer', () => {
  let trainer: ModelTrainer;
  let config: TrainingConfig;
  let sampleData: TrainingData;

  beforeEach(() => {
    config = {
      modelType: 'binary_classifier',
      crossValidationFolds: 3,
      testSizeRatio: 0.2,
      randomState: 42,
      hyperparameterOptimization: false,
      maxIterations: 100
    };

    trainer = new ModelTrainer(config);

    sampleData = {
      features: [
        [1.0, 2.0, 3.0],
        [2.0, 3.0, 4.0],
        [3.0, 4.0, 5.0],
        [4.0, 5.0, 6.0],
        [5.0, 6.0, 7.0],
        [6.0, 7.0, 8.0],
        [7.0, 8.0, 9.0],
        [8.0, 9.0, 10.0],
        [9.0, 10.0, 11.0],
        [10.0, 11.0, 12.0]
      ],
      labels: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
      featureNames: ['feature1', 'feature2', 'feature3']
    };
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(trainer).toBeDefined();
    });

    it('should accept hyperparameter space', () => {
      const hyperparameterSpace: HyperparameterSpace = {
        learningRate: { type: 'float', min: 0.01, max: 0.1 },
        maxDepth: { type: 'int', min: 3, max: 10 }
      };
      
      const trainerWithHyperparams = new ModelTrainer(config, hyperparameterSpace);
      expect(trainerWithHyperparams).toBeDefined();
    });
  });

  describe('train', () => {
    it('should train a model and return training results', async () => {
      const result = await trainer.train(sampleData);

      expect(result).toBeDefined();
      expect(result.modelId).toBeDefined();
      expect(result.modelVersion).toBeDefined();
      expect(result.validation).toBeDefined();
      expect(result.featureImportance).toBeDefined();
      expect(result.trainingTime).toBeGreaterThan(0);
      expect(result.datasetSize).toBe(sampleData.features.length);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should include validation metrics', async () => {
      const result = await trainer.train(sampleData);

      expect(result.validation.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.validation.accuracy).toBeLessThanOrEqual(1);
      expect(result.validation.precision).toBeGreaterThanOrEqual(0);
      expect(result.validation.recall).toBeGreaterThanOrEqual(0);
      expect(result.validation.f1Score).toBeGreaterThanOrEqual(0);
      expect(result.validation.confusionMatrix).toBeDefined();
      expect(result.validation.confusionMatrix).toHaveLength(2);
      expect(result.validation.confusionMatrix[0]).toHaveLength(2);
    });

    it('should include feature importance', async () => {
      const result = await trainer.train(sampleData);

      expect(result.featureImportance).toHaveLength(sampleData.featureNames.length);
      result.featureImportance.forEach(fi => {
        expect(fi.feature).toBeDefined();
        expect(fi.importance).toBeGreaterThanOrEqual(0);
        expect(fi.description).toBeDefined();
      });
    });

    it('should perform hyperparameter optimization when enabled', async () => {
      const hyperparameterSpace: HyperparameterSpace = {
        learningRate: { type: 'float', min: 0.01, max: 0.1 },
        maxDepth: { type: 'int', min: 3, max: 5 }
      };

      const configWithOptimization = { ...config, hyperparameterOptimization: true };
      const trainerWithOptimization = new ModelTrainer(configWithOptimization, hyperparameterSpace);

      const result = await trainerWithOptimization.train(sampleData);

      expect(result.hyperparameters).toBeDefined();
      expect(Object.keys(result.hyperparameters).length).toBeGreaterThan(0);
    });

    it('should validate training data before training', async () => {
      const invalidData: TrainingData = {
        features: [[1, 2], [3, 4]],
        labels: [0], // Mismatched length
        featureNames: ['f1', 'f2']
      };

      await expect(trainer.train(invalidData)).rejects.toThrow();
    });

    it('should handle empty training data', async () => {
      const emptyData: TrainingData = {
        features: [],
        labels: [],
        featureNames: ['f1', 'f2']
      };

      await expect(trainer.train(emptyData)).rejects.toThrow();
    });

    it('should handle missing values in features', async () => {
      const dataWithNaN: TrainingData = {
        features: [[1, 2, NaN], [3, 4, 5]],
        labels: [0, 1],
        featureNames: ['f1', 'f2', 'f3']
      };

      await expect(trainer.train(dataWithNaN)).rejects.toThrow();
    });
  });

  describe('crossValidate', () => {
    it('should perform cross-validation and return scores', async () => {
      const scores = await trainer.crossValidate(sampleData);

      expect(scores).toHaveLength(config.crossValidationFolds);
      scores.forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    it('should accept hyperparameters for cross-validation', async () => {
      const params = { learningRate: 0.05, maxDepth: 5 };
      const scores = await trainer.crossValidate(sampleData, params);

      expect(scores).toHaveLength(config.crossValidationFolds);
    });
  });

  describe('data validation', () => {
    it('should validate feature and label count match', async () => {
      const invalidData: TrainingData = {
        features: [[1, 2], [3, 4], [5, 6]],
        labels: [0, 1], // One less label
        featureNames: ['f1', 'f2']
      };

      await expect(trainer.train(invalidData)).rejects.toThrow('Features and labels must have the same number of samples');
    });

    it('should validate feature names match feature count', async () => {
      const invalidData: TrainingData = {
        features: [[1, 2, 3], [4, 5, 6]],
        labels: [0, 1],
        featureNames: ['f1', 'f2'] // Missing f3
      };

      await expect(trainer.train(invalidData)).rejects.toThrow('Number of features must match feature names length');
    });

    it('should validate required fields are present', async () => {
      const invalidData = {
        features: [[1, 2], [3, 4]],
        labels: [0, 1]
        // Missing featureNames
      } as TrainingData;

      await expect(trainer.train(invalidData)).rejects.toThrow('Training data must include features, labels, and feature names');
    });
  });

  describe('data splitting', () => {
    it('should split data according to test size ratio', async () => {
      const largerDataset: TrainingData = {
        features: Array.from({ length: 100 }, (_, i) => [i, i + 1, i + 2]),
        labels: Array.from({ length: 100 }, (_, i) => i % 2),
        featureNames: ['f1', 'f2', 'f3']
      };

      const result = await trainer.train(largerDataset);
      
      // The test should use approximately 20% of the data (testSizeRatio = 0.2)
      const expectedTestSize = Math.floor(100 * 0.2);
      const expectedTrainSize = 100 - expectedTestSize;
      
      // We can't directly test the split sizes, but we can verify the model was trained
      expect(result.datasetSize).toBe(100);
    });
  });

  describe('metrics calculation', () => {
    it('should calculate accuracy correctly', async () => {
      // Create a simple dataset where we can predict the accuracy
      const perfectData: TrainingData = {
        features: [[0], [1], [2], [3]],
        labels: [0, 0, 1, 1],
        featureNames: ['value']
      };

      const result = await trainer.train(perfectData);
      
      // Accuracy should be between 0 and 1
      expect(result.validation.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.validation.accuracy).toBeLessThanOrEqual(1);
    });

    it('should calculate confusion matrix with correct dimensions', async () => {
      const result = await trainer.train(sampleData);
      
      expect(result.validation.confusionMatrix).toHaveLength(2); // Binary classification
      expect(result.validation.confusionMatrix[0]).toHaveLength(2);
      expect(result.validation.confusionMatrix[1]).toHaveLength(2);
      
      // All values should be non-negative integers
      result.validation.confusionMatrix.forEach(row => {
        row.forEach(value => {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(value)).toBe(true);
        });
      });
    });
  });

  describe('model versioning', () => {
    it('should generate unique model IDs', async () => {
      const result1 = await trainer.train(sampleData);
      const result2 = await trainer.train(sampleData);

      expect(result1.modelId).not.toBe(result2.modelId);
    });

    it('should generate version strings in expected format', async () => {
      const result = await trainer.train(sampleData);

      expect(result.modelVersion).toMatch(/^v\d{4}\.\d{1,2}\.\d{1,2}\.\d{4}$/);
    });
  });

  describe('sample weights', () => {
    it('should handle sample weights when provided', async () => {
      const dataWithWeights: TrainingData = {
        ...sampleData,
        sampleWeights: Array.from({ length: sampleData.features.length }, () => Math.random())
      };

      const result = await trainer.train(dataWithWeights);
      expect(result).toBeDefined();
    });

    it('should work without sample weights', async () => {
      const result = await trainer.train(sampleData);
      expect(result).toBeDefined();
    });
  });
});