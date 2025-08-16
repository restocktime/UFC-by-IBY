/**
 * UFC Prediction Platform - Shared Types and Utilities
 * 
 * This package contains all shared TypeScript interfaces, types, and utility functions
 * used across the API, ML, and frontend packages.
 */

// Core types
export * from './types/core.js';

// Entity types
export * from './types/fighter.js';
export * from './types/fight.js';
export * from './types/event.js';
export * from './types/notification.js';
export * from './types/odds.js';
export * from './types/prediction.js';
export * from './types/data-source.js';
export * from './types/user.js';

// Validation schemas (to be implemented)
export * from './validation/index.js';