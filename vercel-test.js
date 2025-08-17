// Simple test to verify Vercel deployment
const express = require('express');
const app = express();

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Vercel deployment working!',
    timestamp: new Date().toISOString(),
    path: req.path
  });
});

module.exports = app;