// Test script to verify deployment
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('.'));

// API routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Test deployment working',
    timestamp: new Date().toISOString()
  });
});

// Catch all for frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
  });
}

module.exports = app;