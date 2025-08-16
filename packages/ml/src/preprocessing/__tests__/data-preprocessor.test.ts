/**
 * Unit tests for DataPreprocessor class
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  DataPreprocessor, 
  PreprocessingConfig, 
  FeatureMetadata 
} from '../data-preprocessor.js';

describe('DataPreprocessor', () => {
  let preprocessor: DataPreprocessor;
  let config: PreprocessingConfig;
  let sampleData: any[][];
  let featureNames: string[];
  let featureMetadata: FeatureMetadata[];

  beforeEach(() => {
    config = {
      scalingMethod: 'standard',
      encodingMethod: 'onehot',
      handleMissingValues: 'mean',
      outlierDetection: true,
      outlierMethod: 'iqr',
      outlierThreshold: 1.5
    };

    preprocessor = new DataPreprocessor(config);

    sampleData = [
      [25, 'male', 70000, 1],
      [30, 'female', 80000, 0],
      [35, 'male', 90000, 1],
      [28, 'female', 75000, 0],
      [40, 'male', 100000, 1]
    ];

    featureNames = ['age', 'gender', 'salary', 'target'];

    featureMetadata = [
      { name: 'age', type: 'numerical', nullable: false, min: 18, max: 65 },
      { name: 'gender', type: 'categorical', nullable: false, categories: ['male', 'female'] },
      { name: 'salary', type: 'numerical', nullable: false, min: 30000, max: 150000 },
      { name: 'target', type: 'binary', nullable: false }
    ];
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(preprocessor).toBeDefined();
      expect(preprocessor.isFitted()).toBe(false);
    });
  });

  describe('fitTransform', () => {
    it('should fit and transform data successfully', async () => {
      const result = await preprocessor.fitTransform(sampleData, featureNames, featureMetadata);

      expect(result).toBeDefined();
      expect(result.features).toBeDefined();
      expect(result.featureNames).toBeDefined();
      expect(result.transformationApplied).toBe(true);
      expect(preprocessor.isFitted()).toBe(true);
    });

    it('should handle categorical encoding correctly', async () => {
      const result = await preprocessor.fitTransform(sampleData, featureNames, featureMetadata);

      // Should have one-hot encoded gender (male, female)
      expect(result.featureNames).toContain('gender_male');
      expect(result.featureNames).toContain('gender_female');
      expect(result.featureNames).not.toContain('gender');
    });

    it('should scale numerical features', async () => {
      const result = await preprocessor.fitTransform(sampleData, featureNames, featureMetadata);

      // Check that numerical features are scaled (should have different values)
      const ageIndex = result.featureNames.indexOf('age');
      const salaryIndex = result.featureNames.indexOf('salary');

      expect(ageIndex).toBeGreaterThanOrEqual(0);
      expect(salaryIndex).toBeGreaterThanOrEqual(0);

      // Scaled values should be different from original
      const originalAges = sampleData.map(row => row[0]);
      const scaledAges = result.features.map(row => row[ageIndex]);
      
      expect(scaledAges).not.toEqual(originalAges);
    });

    it('should return correct feature names after transformation', async () => {
      const result = await preprocessor.fitTransform(sampleData, featureNames, featureMetadata);

      expect(result.originalFeatureNames).toEqual(featureNames);
      expect(result.featureNames.length).toBeGreaterThanOrEqual(featureNames.length);
    });
  });

  describe('transform', () => {
    it('should transform new data using fitted preprocessor', async () => {
      // First fit the preprocessor
      await preprocessor.fitTransform(sampleData, featureNames, featureMetadata);

      // Then transform new data
      const newData = [
        [32, 'male', 85000, 1],
        [27, 'female', 72000, 0]
      ];

      const result = await preprocessor.transform(newData, featureNames);

      expect(result).toBeDefined();
      expect(result.features).toHaveLength(2);
      expect(result.featureNames).toEqual(
        (await preprocessor.fitTransform(sampleData, featureNames, featureMetadata)).featureNames
      );
    });

    it('should throw error if not fitted', async () => {
      const newData = [[32, 'male', 85000, 1]];

      await expect(preprocessor.transform(newData, featureNames))
        .rejects.toThrow('Preprocessor must be fitted before transforming data');
    });
  });

  describe('missing value handling', () => {
    it('should handle missing values with mean strategy', async () => {
      const configWithMean = { ...config, handleMissingValues: 'mean' as const };
      const preprocessorWithMean = new DataPreprocessor(configWithMean);

      const dataWithMissing = [
        [25, 'male', 70000, 1],
        [null, 'female', 80000, 0],
        [35, 'male', null, 1],
        [28, 'female', 75000, 0]
      ];

      const result = await preprocessorWithMean.fitTransform(dataWithMissing, featureNames, featureMetadata);

      expect(result.features).toBeDefined();
      // Should not have any null values in numerical columns
      result.features.forEach(row => {
        row.forEach(value => {
          expect(value).not.toBeNull();
          expect(value).not.toBeUndefined();
          expect(isNaN(value)).toBe(false);
        });
      });
    });

    it('should handle missing values with median strategy', async () => {
      const configWithMedian = { ...config, handleMissingValues: 'median' as const };
      const preprocessorWithMedian = new DataPreprocessor(configWithMedian);

      const dataWithMissing = [
        [25, 'male', 70000, 1],
        [null, 'female', 80000, 0],
        [35, 'male', 90000, 1],
        [28, 'female', 75000, 0]
      ];

      const result = await preprocessorWithMedian.fitTransform(dataWithMissing, featureNames, featureMetadata);

      expect(result.features).toBeDefined();
    });

    it('should handle missing values with mode strategy', async () => {
      const configWithMode = { ...config, handleMissingValues: 'mode' as const };
      const preprocessorWithMode = new DataPreprocessor(configWithMode);

      const dataWithMissing = [
        [25, 'male', 70000, 1],
        [30, null, 80000, 0],
        [35, 'male', 90000, 1],
        [28, 'male', 75000, 0]
      ];

      const result = await preprocessorWithMode.fitTransform(dataWithMissing, featureNames, featureMetadata);

      expect(result.features).toBeDefined();
    });
  });

  describe('outlier detection', () => {
    it('should detect and handle outliers with IQR method', async () => {
      const dataWithOutliers = [
        [25, 'male', 70000, 1],
        [30, 'female', 80000, 0],
        [35, 'male', 90000, 1],
        [28, 'female', 75000, 0],
        [100, 'male', 1000000, 1] // Outlier
      ];

      const result = await preprocessor.fitTransform(dataWithOutliers, featureNames, featureMetadata);

      expect(result.features).toBeDefined();
      // Outliers should be capped, not removed
      expect(result.features).toHaveLength(dataWithOutliers.length);
    });

    it('should detect and handle outliers with Z-score method', async () => {
      const configWithZScore = { ...config, outlierMethod: 'zscore' as const, outlierThreshold: 2 };
      const preprocessorWithZScore = new DataPreprocessor(configWithZScore);

      const dataWithOutliers = [
        [25, 'male', 70000, 1],
        [30, 'female', 80000, 0],
        [35, 'male', 90000, 1],
        [28, 'female', 75000, 0],
        [100, 'male', 1000000, 1] // Outlier
      ];

      const result = await preprocessorWithZScore.fitTransform(dataWithOutliers, featureNames, featureMetadata);

      expect(result.features).toBeDefined();
      expect(result.features).toHaveLength(dataWithOutliers.length);
    });

    it('should skip outlier detection when disabled', async () => {
      const configNoOutliers = { ...config, outlierDetection: false };
      const preprocessorNoOutliers = new DataPreprocessor(configNoOutliers);

      const dataWithOutliers = [
        [25, 'male', 70000, 1],
        [100, 'male', 1000000, 1] // Outlier
      ];

      const result = await preprocessorNoOutliers.fitTransform(dataWithOutliers, featureNames, featureMetadata);

      expect(result.features).toBeDefined();
      expect(result.features).toHaveLength(dataWithOutliers.length);
    });
  });

  describe('scaling methods', () => {
    it('should apply standard scaling', async () => {
      const result = await preprocessor.fitTransform(sampleData, featureNames, featureMetadata);

      const ageIndex = result.featureNames.indexOf('age');
      const ageValues = result.features.map(row => row[ageIndex]);
      
      // Standard scaled values should have approximately mean 0 and std 1
      const mean = ageValues.reduce((sum, val) => sum + val, 0) / ageValues.length;
      expect(Math.abs(mean)).toBeLessThan(0.1); // Close to 0
    });

    it('should apply min-max scaling', async () => {
      const configMinMax = { ...config, scalingMethod: 'minmax' as const };
      const preprocessorMinMax = new DataPreprocessor(configMinMax);

      const result = await preprocessorMinMax.fitTransform(sampleData, featureNames, featureMetadata);

      const ageIndex = result.featureNames.indexOf('age');
      const ageValues = result.features.map(row => row[ageIndex]);
      
      // Min-max scaled values should be between 0 and 1
      ageValues.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });

    it('should apply robust scaling', async () => {
      const configRobust = { ...config, scalingMethod: 'robust' as const };
      const preprocessorRobust = new DataPreprocessor(configRobust);

      const result = await preprocessorRobust.fitTransform(sampleData, featureNames, featureMetadata);

      expect(result.features).toBeDefined();
    });

    it('should skip scaling when method is none', async () => {
      const configNoScaling = { ...config, scalingMethod: 'none' as const };
      const preprocessorNoScaling = new DataPreprocessor(configNoScaling);

      const result = await preprocessorNoScaling.fitTransform(sampleData, featureNames, featureMetadata);

      // Numerical values should remain unchanged (except for encoding)
      expect(result.features).toBeDefined();
    });
  });

  describe('encoding methods', () => {
    it('should apply one-hot encoding', async () => {
      const result = await preprocessor.fitTransform(sampleData, featureNames, featureMetadata);

      expect(result.featureNames).toContain('gender_male');
      expect(result.featureNames).toContain('gender_female');

      // Check that one-hot encoding is correct
      const maleIndex = result.featureNames.indexOf('gender_male');
      const femaleIndex = result.featureNames.indexOf('gender_female');

      result.features.forEach((row, i) => {
        const originalGender = sampleData[i][1];
        if (originalGender === 'male') {
          expect(row[maleIndex]).toBe(1);
          expect(row[femaleIndex]).toBe(0);
        } else {
          expect(row[maleIndex]).toBe(0);
          expect(row[femaleIndex]).toBe(1);
        }
      });
    });

    it('should apply label encoding', async () => {
      const configLabel = { ...config, encodingMethod: 'label' as const };
      const preprocessorLabel = new DataPreprocessor(configLabel);

      const result = await preprocessorLabel.fitTransform(sampleData, featureNames, featureMetadata);

      expect(result.featureNames).toContain('gender');
      expect(result.featureNames).not.toContain('gender_male');
      expect(result.featureNames).not.toContain('gender_female');

      // Check that label encoding produces integers
      const genderIndex = result.featureNames.indexOf('gender');
      result.features.forEach(row => {
        expect(Number.isInteger(row[genderIndex])).toBe(true);
        expect(row[genderIndex]).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('state management', () => {
    it('should save and restore preprocessing state', async () => {
      const result = await preprocessor.fitTransform(sampleData, featureNames, featureMetadata);
      const state = preprocessor.getState();

      expect(state).toBeDefined();
      expect(state.scalers.size).toBeGreaterThan(0);
      expect(state.featureMetadata).toEqual(featureMetadata);

      // Create new preprocessor and load state
      const newPreprocessor = new DataPreprocessor(config);
      newPreprocessor.setState(state);

      expect(newPreprocessor.isFitted()).toBe(true);

      // Should be able to transform new data
      const newData = [[32, 'male', 85000, 1]];
      const newResult = await newPreprocessor.transform(newData, featureNames);

      expect(newResult.featureNames).toEqual(result.featureNames);
    });

    it('should track transformation history', async () => {
      await preprocessor.fitTransform(sampleData, featureNames, featureMetadata);
      
      const newData = [[32, 'male', 85000, 1]];
      await preprocessor.transform(newData, featureNames);

      const state = preprocessor.getState();
      expect(state.transformationHistory).toHaveLength(2);
      expect(state.transformationHistory[0].step).toBe('fit_transform');
      expect(state.transformationHistory[1].step).toBe('transform');
    });
  });

  describe('edge cases', () => {
    it('should handle empty dataset', async () => {
      const emptyData: any[][] = [];
      const emptyFeatureNames: string[] = [];
      const emptyMetadata: FeatureMetadata[] = [];

      const result = await preprocessor.fitTransform(emptyData, emptyFeatureNames, emptyMetadata);

      expect(result.features).toEqual([]);
      expect(result.featureNames).toEqual([]);
    });

    it('should handle single row dataset', async () => {
      const singleRowData = [sampleData[0]];
      
      const result = await preprocessor.fitTransform(singleRowData, featureNames, featureMetadata);

      expect(result.features).toHaveLength(1);
    });

    it('should handle dataset with only categorical features', async () => {
      const categoricalData = [
        ['male', 'A'],
        ['female', 'B'],
        ['male', 'A']
      ];

      const categoricalFeatureNames = ['gender', 'category'];
      const categoricalMetadata = [
        { name: 'gender', type: 'categorical', nullable: false, categories: ['male', 'female'] },
        { name: 'category', type: 'categorical', nullable: false, categories: ['A', 'B'] }
      ];

      const result = await preprocessor.fitTransform(categoricalData, categoricalFeatureNames, categoricalMetadata);

      expect(result.features).toBeDefined();
      expect(result.featureNames.length).toBeGreaterThan(categoricalFeatureNames.length);
    });

    it('should handle dataset with only numerical features', async () => {
      const numericalData = [
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0],
        [7.0, 8.0, 9.0]
      ];

      const numericalFeatureNames = ['num1', 'num2', 'num3'];
      const numericalMetadata = [
        { name: 'num1', type: 'numerical', nullable: false },
        { name: 'num2', type: 'numerical', nullable: false },
        { name: 'num3', type: 'numerical', nullable: false }
      ];

      const result = await preprocessor.fitTransform(numericalData, numericalFeatureNames, numericalMetadata);

      expect(result.features).toBeDefined();
      expect(result.featureNames).toEqual(numericalFeatureNames);
    });
  });
});