// Simple health check endpoint for Vercel
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    status: 'OK',
    message: 'UFC Prediction Platform API is running!',
    timestamp: new Date().toISOString(),
    deployment: 'Vercel',
    version: '1.0.0'
  });
};