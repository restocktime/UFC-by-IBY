export default function handler(req, res) {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'UFC Prediction Platform API',
    version: '1.0.0',
    deployment: 'Vercel',
    services: {
      api: 'online',
      database: 'simulated',
      cache: 'simulated'
    }
  });
}