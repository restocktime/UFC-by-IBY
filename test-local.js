#!/usr/bin/env node

// Local test script to verify API functionality
const app = require('./api/index.js');
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting UFC Prediction Platform API...');
console.log('📁 Testing local deployment configuration...');

// Test that all required dependencies are available
try {
  require('express');
  require('cors');
  console.log('✅ Dependencies: express, cors loaded successfully');
} catch (error) {
  console.error('❌ Missing dependencies:', error.message);
  process.exit(1);
}

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log('\n🧪 Test these endpoints:');
  console.log(`   Root API: http://localhost:${PORT}/api/`);
  console.log(`   Health:   http://localhost:${PORT}/api/health`);
  console.log(`   Fighters: http://localhost:${PORT}/api/v1/fighters`);
  console.log(`   Frontend: http://localhost:${PORT}/`);
  console.log('\n🔧 Press Ctrl+C to stop');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});

// Test API endpoints
setTimeout(async () => {
  try {
    const fetch = (await import('node-fetch')).default;
    
    console.log('\n🧪 Running endpoint tests...');
    
    // Test health endpoint
    const healthResponse = await fetch(`http://localhost:${PORT}/api/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData.status);
    
    // Test fighters endpoint
    const fightersResponse = await fetch(`http://localhost:${PORT}/api/v1/fighters`);
    const fightersData = await fightersResponse.json();
    console.log('✅ Fighters endpoint:', fightersData.success ? 'Working' : 'Failed');
    
    console.log('\n🎯 Local test complete! Deploy to Vercel when ready.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}, 1000);