#!/usr/bin/env node

// Vercel ignore script to prevent building when only packages/ directory changes
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Get the list of changed files
  const changedFiles = execSync('git diff --name-only HEAD~1 HEAD', { 
    encoding: 'utf8',
    stdio: 'pipe'
  }).trim().split('\n').filter(Boolean);

  console.log('Changed files:', changedFiles);

  // Check if only packages/ directory files changed
  const nonPackageChanges = changedFiles.filter(file => 
    !file.startsWith('packages/') && 
    !file.endsWith('.md') &&
    !file.includes('test') &&
    file !== '.gitignore'
  );

  console.log('Non-package changes:', nonPackageChanges);

  // If only package files changed, skip build
  if (nonPackageChanges.length === 0 && changedFiles.length > 0) {
    console.log('Only packages/ directory changed, skipping build...');
    process.exit(0);
  }

  // Check if API files or frontend files changed
  const apiChanged = changedFiles.some(file => file.startsWith('api/'));
  const frontendChanged = changedFiles.some(file => 
    file.startsWith('packages/frontend/public/') ||
    file === 'vercel.json' ||
    file === 'package.json'
  );

  if (apiChanged || frontendChanged) {
    console.log('API or frontend files changed, proceeding with build...');
    process.exit(1);
  }

  console.log('No significant changes detected, skipping build...');
  process.exit(0);

} catch (error) {
  // If we can't determine changes, proceed with build to be safe
  console.log('Could not determine changes, proceeding with build...');
  process.exit(1);
}