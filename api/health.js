export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    deployment: 'vercel',
    endpoints: [
      '/api/health',
      '/api/demo', 
      '/api/fighters',
      '/api/odds',
      '/api/predictions',
      '/api/live-data',
      '/api/espn-live'
    ]
  });
}