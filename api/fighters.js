// Real API integration for fighters data
const SPORTSDATA_API_KEY = process.env.SPORTSDATA_IO_API_KEY || '81a9726b488c4b57b48e59042405d1a6';

async function fetchFightersFromAPI() {
  try {
    // Fetch from SportsData.io API
    const response = await fetch(`https://api.sportsdata.io/v3/mma/scores/json/Fighters?key=${SPORTSDATA_API_KEY}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'UFC-Prediction-Platform/1.0'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`SportsData API error: ${response.status} ${response.statusText}`);
    }

    const fighters = await response.json();
    
    // Transform the data to our format
    return fighters.slice(0, 50).map(fighter => ({
      id: fighter.FighterId,
      name: `${fighter.FirstName} ${fighter.LastName}`,
      nickname: fighter.Nickname || '',
      weightClass: fighter.WeightClass,
      record: {
        wins: fighter.Wins || 0,
        losses: fighter.Losses || 0,
        draws: fighter.Draws || 0,
        noContests: fighter.NoContests || 0
      },
      physicalStats: {
        height: fighter.Height || 0,
        weight: fighter.Weight || 0,
        reach: fighter.Reach || 0,
        stance: fighter.Stance || 'Unknown'
      },
      birthDate: fighter.BirthDate,
      nationality: fighter.Nationality,
      birthPlace: fighter.BirthPlace,
      active: fighter.Active,
      lastUpdated: new Date().toISOString()
    }));

  } catch (error) {
    console.error('Error fetching fighters:', error);
    // Return fallback data structure with error info
    return [{
      id: 'error',
      name: 'API Error',
      error: error.message,
      message: 'Unable to fetch live fighter data. Please check API configuration.',
      timestamp: new Date().toISOString()
    }];
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const fighters = await fetchFightersFromAPI();
      
      res.status(200).json({
        success: true,
        data: fighters,
        total: fighters.length,
        source: 'SportsData.io API',
        timestamp: new Date().toISOString(),
        message: "Live fighter data from SportsData.io"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        message: "Error fetching fighter data",
        timestamp: new Date().toISOString()
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}