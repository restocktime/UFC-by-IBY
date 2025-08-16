/**
 * DataPreprocessor - Handles feature scaling, encoding, and data transformations
 */

export interface PreprocessingConfig {
  scalingMethod: 'standard' | 'minmax' | 'robust' | 'none';
  encodingMethod: 'onehot' | 'label' | 'target';
  handleMissingValues: 'drop' | 'mean' | 'median' | 'mode' | 'forward_fill';
  outlierDetection: boolean;
  outlierMethod: 'iqr' | 'zscore' | 'isolation_forest';
  outlierThreshold: number;
}

export interface FeatureMetadata {
  name: string;
  type: 'numerical' | 'categorical' | 'binary' | 'ordinal';
  nullable: boolean;
  categories?: string[];
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
}

export interface PreprocessingState {
  scalers: Map<string, ScalerState>;
  encoders: Map<string, EncoderState>;
  featureMetadata: FeatureMetadata[];
  outlierDetectors: Map<string, OutlierDetectorState>;
  transformationHistory: TransformationStep[];
}

export interface ScalerState {
  method: 'standard' | 'minmax' | 'robust';
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  q25?: number;
  q75?: number;
  median?: number;
}

export interface EncoderState {
  method: 'onehot' | 'label' | 'target';
  categories: string[];
  mapping: Map<string, number>;
  targetMeans?: Map<string, number>;
}

export interface OutlierDetectorState {
  method: 'iqr' | 'zscore' | 'isolation_forest';
  threshold: number;
  q25?: number;
  q75?: number;
  mean?: number;
  std?: number;
}

export interface TransformationStep {
  step: string;
  timestamp: Date;
  parameters: Record<string, any>;
}

export interface ProcessedData {
  features: number[][];
  featureNames: string[];
  originalFeatureNames: string[];
  transformationApplied: boolean;
  preprocessingState: PreprocessingState;
}

export class DataPreprocessor {
  private config: PreprocessingConfig;
  private state: PreprocessingState;
  private fitted: boolean = false;

  constructor(config: PreprocessingConfig) {
    this.config = config;
    this.state = {
      scalers: new Map(),
      encoders: new Map(),
      featureMetadata: [],
      outlierDetectors: new Map(),
      transformationHistory: []
    };
  }

  /**
   * Fit the preprocessor on training data and transform it
   */
  async fitTransform(
    data: any[][],
    featureNames: string[],
    featureMetadata: FeatureMetadata[]
  ): Promise<ProcessedData> {
    this.state.featureMetadata = featureMetadata;
    
    // Handle missing values
    const cleanedData = this.handleMissingValues(data, featureMetadata);
    
    // Detect and handle outliers
    const outlierFreeData = this.config.outlierDetection 
      ? this.detectAndHandleOutliers(cleanedData, featureMetadata)
      : cleanedData;
    
    // Encode categorical features
    const encodedResult = this.fitEncoders(outlierFreeData, featureNames, featureMetadata);
    
    // Scale numerical features
    const scaledData = this.fitScalers(encodedResult.data, encodedResult.featureNames, featureMetadata);
    
    this.fitted = true;
    
    this.addTransformationStep('fit_transform', {
      originalFeatures: featureNames.length,
      processedFeatures: scaledData.featureNames.length,
      samplesProcessed: data.length
    });
    
    return {
      features: scaledData.data,
      featureNames: scaledData.featureNames,
      originalFeatureNames: featureNames,
      transformationApplied: true,
      preprocessingState: this.state
    };
  }

  /**
   * Transform new data using fitted preprocessor
   */
  async transform(
    data: any[][],
    featureNames: string[]
  ): Promise<ProcessedData> {
    if (!this.fitted) {
      throw new Error('Preprocessor must be fitted before transforming data');
    }
    
    // Handle missing values
    const cleanedData = this.handleMissingValues(data, this.state.featureMetadata);
    
    // Apply outlier detection (but don't refit)
    const outlierFreeData = this.config.outlierDetection 
      ? this.applyOutlierDetection(cleanedData)
      : cleanedData;
    
    // Apply encoding
    const encodedResult = this.applyEncoders(outlierFreeData, featureNames);
    
    // Apply scaling
    const scaledData = this.applyScalers(encodedResult.data, encodedResult.featureNames);
    
    this.addTransformationStep('transform', {
      samplesProcessed: data.length
    });
    
    return {
      features: scaledData.data,
      featureNames: scaledData.featureNames,
      originalFeatureNames: featureNames,
      transformationApplied: true,
      preprocessingState: this.state
    };
  }

  /**
   * Handle missing values in the dataset
   */
  private handleMissingValues(data: any[][], featureMetadata: FeatureMetadata[]): any[][] {
    const result = data.map(row => [...row]);
    
    for (let colIndex = 0; colIndex < featureMetadata.length; colIndex++) {
      const metadata = featureMetadata[colIndex];
      const columnValues = result.map(row => row[colIndex]);
      
      // Find missing value indices
      const missingIndices = columnValues
        .map((val, idx) => ({ val, idx }))
        .filter(({ val }) => val === null || val === undefined || val === '')
        .map(({ idx }) => idx);
      
      if (missingIndices.length === 0) continue;
      
      let fillValue: any;
      
      switch (this.config.handleMissingValues) {
        case 'drop':
          // Mark rows for removal (handled at dataset level)
          break;
        case 'mean':
          if (metadata.type === 'numerical') {
            const validValues = columnValues.filter(val => val !== null && val !== undefined && val !== '');
            fillValue = validValues.reduce((sum, val) => sum + Number(val), 0) / validValues.length;
          }
          break;
        case 'median':
          if (metadata.type === 'numerical') {
            const validValues = columnValues
              .filter(val => val !== null && val !== undefined && val !== '')
              .map(val => Number(val))
              .sort((a, b) => a - b);
            const mid = Math.floor(validValues.length / 2);
            fillValue = validValues.length % 2 === 0 
              ? (validValues[mid - 1] + validValues[mid]) / 2 
              : validValues[mid];
          }
          break;
        case 'mode':
          const validValues = columnValues.filter(val => val !== null && val !== undefined && val !== '');
          const frequency = new Map<any, number>();
          validValues.forEach(val => {
            frequency.set(val, (frequency.get(val) || 0) + 1);
          });
          fillValue = Array.from(frequency.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];
          break;
        case 'forward_fill':
          // Use previous valid value
          break;
      }
      
      // Apply fill value
      if (fillValue !== undefined) {
        missingIndices.forEach(idx => {
          result[idx][colIndex] = fillValue;
        });
      }
    }
    
    return result;
  }

  /**
   * Detect and handle outliers
   */
  private detectAndHandleOutliers(data: any[][], featureMetadata: FeatureMetadata[]): any[][] {
    const result = data.map(row => [...row]);
    
    for (let colIndex = 0; colIndex < featureMetadata.length; colIndex++) {
      const metadata = featureMetadata[colIndex];
      
      if (metadata.type !== 'numerical') continue;
      
      const columnValues = result.map(row => Number(row[colIndex])).filter(val => !isNaN(val));
      
      let outlierIndices: number[] = [];
      
      if (this.config.outlierMethod === 'iqr') {
        const sorted = [...columnValues].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        
        outlierIndices = result
          .map((row, idx) => ({ val: Number(row[colIndex]), idx }))
          .filter(({ val }) => val < lowerBound || val > upperBound)
          .map(({ idx }) => idx);
        
        this.state.outlierDetectors.set(metadata.name, {
          method: 'iqr',
          threshold: this.config.outlierThreshold,
          q25: q1,
          q75: q3
        });
      } else if (this.config.outlierMethod === 'zscore') {
        const mean = columnValues.reduce((sum, val) => sum + val, 0) / columnValues.length;
        const std = Math.sqrt(columnValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / columnValues.length);
        
        outlierIndices = result
          .map((row, idx) => ({ val: Number(row[colIndex]), idx }))
          .filter(({ val }) => Math.abs((val - mean) / std) > this.config.outlierThreshold)
          .map(({ idx }) => idx);
        
        this.state.outlierDetectors.set(metadata.name, {
          method: 'zscore',
          threshold: this.config.outlierThreshold,
          mean,
          std
        });
      }
      
      // Cap outliers to threshold values instead of removing
      outlierIndices.forEach(idx => {
        const val = Number(result[idx][colIndex]);
        const detector = this.state.outlierDetectors.get(metadata.name)!;
        
        if (detector.method === 'iqr') {
          const lowerBound = detector.q25! - 1.5 * (detector.q75! - detector.q25!);
          const upperBound = detector.q75! + 1.5 * (detector.q75! - detector.q25!);
          result[idx][colIndex] = val < lowerBound ? lowerBound : upperBound;
        } else if (detector.method === 'zscore') {
          const threshold = detector.threshold * detector.std!;
          result[idx][colIndex] = val > detector.mean! 
            ? detector.mean! + threshold 
            : detector.mean! - threshold;
        }
      });
    }
    
    return result;
  }

  /**
   * Fit encoders for categorical features
   */
  private fitEncoders(
    data: any[][], 
    featureNames: string[], 
    featureMetadata: FeatureMetadata[]
  ): { data: number[][]; featureNames: string[] } {
    const result: number[][] = [];
    const newFeatureNames: string[] = [];
    
    // First pass: determine new feature names
    for (let colIndex = 0; colIndex < featureMetadata.length; colIndex++) {
      const metadata = featureMetadata[colIndex];
      const originalName = featureNames[colIndex];
      const columnValues = data.map(row => row[colIndex]);
      
      if (metadata.type === 'categorical') {
        const uniqueValues = Array.from(new Set(columnValues.filter(val => val !== null && val !== undefined)));
        
        if (this.config.encodingMethod === 'onehot') {
          // One-hot encoding - add feature for each category
          uniqueValues.forEach(category => {
            newFeatureNames.push(`${originalName}_${category}`);
          });
          
          this.state.encoders.set(originalName, {
            method: 'onehot',
            categories: uniqueValues,
            mapping: new Map(uniqueValues.map((val, idx) => [val, idx]))
          });
        } else if (this.config.encodingMethod === 'label') {
          // Label encoding - keep original feature name
          newFeatureNames.push(originalName);
          
          this.state.encoders.set(originalName, {
            method: 'label',
            categories: uniqueValues,
            mapping: new Map(uniqueValues.map((val, idx) => [val, idx]))
          });
        }
      } else {
        // Numerical feature - keep as is
        newFeatureNames.push(originalName);
      }
    }
    
    // Second pass: transform the data
    for (const row of data) {
      const transformedRow: number[] = [];
      
      for (let colIndex = 0; colIndex < featureMetadata.length; colIndex++) {
        const metadata = featureMetadata[colIndex];
        const originalName = featureNames[colIndex];
        const value = row[colIndex];
        
        if (metadata.type === 'categorical') {
          const encoder = this.state.encoders.get(originalName)!;
          
          if (encoder.method === 'onehot') {
            // Add one-hot encoded values
            encoder.categories.forEach(category => {
              transformedRow.push(value === category ? 1 : 0);
            });
          } else if (encoder.method === 'label') {
            // Add label encoded value
            transformedRow.push(encoder.mapping.get(value) || 0);
          }
        } else {
          // Numerical feature
          transformedRow.push(Number(value));
        }
      }
      
      result.push(transformedRow);
    }
    
    return { data: result, featureNames: newFeatureNames };
  }

  /**
   * Fit scalers for numerical features
   */
  private fitScalers(
    data: number[][], 
    featureNames: string[], 
    featureMetadata: FeatureMetadata[]
  ): { data: number[][]; featureNames: string[] } {
    if (this.config.scalingMethod === 'none') {
      return { data, featureNames };
    }
    
    const result = data.map(row => [...row]);
    
    for (let colIndex = 0; colIndex < featureNames.length; colIndex++) {
      const featureName = featureNames[colIndex];
      
      // Skip scaling for one-hot encoded features (they should remain 0 or 1)
      if (featureName.includes('_') && this.isOneHotEncodedFeature(featureName)) {
        continue;
      }
      
      // Skip scaling for label encoded categorical features (they should remain integers)
      if (this.isLabelEncodedFeature(featureName)) {
        continue;
      }
      
      const columnValues = data.map(row => row[colIndex]);
      
      let scalerState: ScalerState;
      
      switch (this.config.scalingMethod) {
        case 'standard':
          const mean = columnValues.reduce((sum, val) => sum + val, 0) / columnValues.length;
          const std = Math.sqrt(columnValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / columnValues.length);
          scalerState = { method: 'standard', mean, std };
          
          // Apply standardization
          for (let rowIndex = 0; rowIndex < result.length; rowIndex++) {
            result[rowIndex][colIndex] = (result[rowIndex][colIndex] - mean) / (std || 1);
          }
          break;
          
        case 'minmax':
          const min = Math.min(...columnValues);
          const max = Math.max(...columnValues);
          scalerState = { method: 'minmax', min, max };
          
          // Apply min-max scaling
          const range = max - min || 1;
          for (let rowIndex = 0; rowIndex < result.length; rowIndex++) {
            result[rowIndex][colIndex] = (result[rowIndex][colIndex] - min) / range;
          }
          break;
          
        case 'robust':
          const sorted = [...columnValues].sort((a, b) => a - b);
          const q25 = sorted[Math.floor(sorted.length * 0.25)];
          const q75 = sorted[Math.floor(sorted.length * 0.75)];
          const median = sorted[Math.floor(sorted.length * 0.5)];
          scalerState = { method: 'robust', q25, q75, median };
          
          // Apply robust scaling
          const iqr = q75 - q25 || 1;
          for (let rowIndex = 0; rowIndex < result.length; rowIndex++) {
            result[rowIndex][colIndex] = (result[rowIndex][colIndex] - median) / iqr;
          }
          break;
          
        default:
          scalerState = { method: 'standard', mean: 0, std: 1 };
      }
      
      this.state.scalers.set(featureName, scalerState);
    }
    
    return { data: result, featureNames };
  }

  /**
   * Check if a feature name represents a one-hot encoded feature
   */
  private isOneHotEncodedFeature(featureName: string): boolean {
    const parts = featureName.split('_');
    if (parts.length < 2) return false;
    
    const baseName = parts.slice(0, -1).join('_');
    const encoder = this.state.encoders.get(baseName);
    
    return encoder?.method === 'onehot';
  }

  /**
   * Check if a feature name represents a label encoded feature
   */
  private isLabelEncodedFeature(featureName: string): boolean {
    const encoder = this.state.encoders.get(featureName);
    return encoder?.method === 'label';
  }

  /**
   * Apply fitted encoders to new data
   */
  private applyEncoders(data: any[][], featureNames: string[]): { data: number[][]; featureNames: string[] } {
    const result: number[][] = [];
    const newFeatureNames: string[] = [];
    
    // Reconstruct feature names in the same order as fitEncoders
    for (let i = 0; i < this.state.featureMetadata.length; i++) {
      const metadata = this.state.featureMetadata[i];
      const originalName = metadata.name;
      
      if (metadata.type === 'categorical' && this.state.encoders.has(originalName)) {
        const encoder = this.state.encoders.get(originalName)!;
        
        if (encoder.method === 'onehot') {
          encoder.categories.forEach(category => {
            newFeatureNames.push(`${originalName}_${category}`);
          });
        } else {
          newFeatureNames.push(originalName);
        }
      } else {
        newFeatureNames.push(originalName);
      }
    }
    
    // Transform data
    for (const row of data) {
      const transformedRow: number[] = [];
      
      for (let colIndex = 0; colIndex < this.state.featureMetadata.length; colIndex++) {
        const metadata = this.state.featureMetadata[colIndex];
        const originalName = metadata.name;
        const value = row[colIndex];
        
        if (metadata.type === 'categorical' && this.state.encoders.has(originalName)) {
          const encoder = this.state.encoders.get(originalName)!;
          
          if (encoder.method === 'onehot') {
            encoder.categories.forEach(category => {
              transformedRow.push(value === category ? 1 : 0);
            });
          } else if (encoder.method === 'label') {
            transformedRow.push(encoder.mapping.get(value) || 0);
          }
        } else {
          transformedRow.push(Number(value));
        }
      }
      
      result.push(transformedRow);
    }
    
    return { data: result, featureNames: newFeatureNames };
  }

  /**
   * Apply fitted scalers to new data
   */
  private applyScalers(data: number[][], featureNames: string[]): { data: number[][]; featureNames: string[] } {
    if (this.config.scalingMethod === 'none') {
      return { data, featureNames };
    }
    
    const result = data.map(row => [...row]);
    
    for (let colIndex = 0; colIndex < featureNames.length; colIndex++) {
      const featureName = featureNames[colIndex];
      
      // Skip scaling for one-hot encoded features
      if (featureName.includes('_') && this.isOneHotEncodedFeature(featureName)) {
        continue;
      }
      
      // Skip scaling for label encoded categorical features
      if (this.isLabelEncodedFeature(featureName)) {
        continue;
      }
      
      const scaler = this.state.scalers.get(featureName);
      
      if (!scaler) continue;
      
      for (let rowIndex = 0; rowIndex < result.length; rowIndex++) {
        const value = result[rowIndex][colIndex];
        
        switch (scaler.method) {
          case 'standard':
            result[rowIndex][colIndex] = (value - scaler.mean!) / (scaler.std! || 1);
            break;
          case 'minmax':
            const range = (scaler.max! - scaler.min!) || 1;
            result[rowIndex][colIndex] = (value - scaler.min!) / range;
            break;
          case 'robust':
            const iqr = (scaler.q75! - scaler.q25!) || 1;
            result[rowIndex][colIndex] = (value - scaler.median!) / iqr;
            break;
        }
      }
    }
    
    return { data: result, featureNames };
  }

  /**
   * Apply outlier detection to new data
   */
  private applyOutlierDetection(data: any[][]): any[][] {
    const result = data.map(row => [...row]);
    
    for (const [featureName, detector] of this.state.outlierDetectors) {
      const featureIndex = this.state.featureMetadata.findIndex(meta => meta.name === featureName);
      if (featureIndex === -1) continue;
      
      for (let rowIndex = 0; rowIndex < result.length; rowIndex++) {
        const value = Number(result[rowIndex][featureIndex]);
        
        if (detector.method === 'iqr') {
          const lowerBound = detector.q25! - 1.5 * (detector.q75! - detector.q25!);
          const upperBound = detector.q75! + 1.5 * (detector.q75! - detector.q25!);
          
          if (value < lowerBound || value > upperBound) {
            result[rowIndex][featureIndex] = value < lowerBound ? lowerBound : upperBound;
          }
        } else if (detector.method === 'zscore') {
          const zScore = Math.abs((value - detector.mean!) / detector.std!);
          
          if (zScore > detector.threshold) {
            const threshold = detector.threshold * detector.std!;
            result[rowIndex][featureIndex] = value > detector.mean! 
              ? detector.mean! + threshold 
              : detector.mean! - threshold;
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Add transformation step to history
   */
  private addTransformationStep(step: string, parameters: Record<string, any>): void {
    this.state.transformationHistory.push({
      step,
      timestamp: new Date(),
      parameters
    });
  }

  /**
   * Get preprocessing state for serialization
   */
  getState(): PreprocessingState {
    return this.state;
  }

  /**
   * Load preprocessing state from serialization
   */
  setState(state: PreprocessingState): void {
    this.state = state;
    this.fitted = true;
  }

  /**
   * Check if preprocessor is fitted
   */
  isFitted(): boolean {
    return this.fitted;
  }
}