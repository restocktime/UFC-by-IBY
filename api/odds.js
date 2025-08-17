// Real API integration for live odds data
const ODDS_API_KEY = process.env.ODDS_API_KEY || '22e59e4eccd8562ad4b697aeeaccb0fb';

async function fetchLiveOdds() {
  try {
    // Fetch from The Odds API
    const response = await fetch(`https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'UFC-Prediction-Platform/1.0'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`Odds API error: ${response.status} ${response.statusText}`);
    }

    const oddsData = await response.json();
    
    // Transform the data to our format
    return oddsData.map(event => {
      const h2hMarket = event.bookmakers.find(book => 
        book.markets.some(market => market.key === 'h2h')
      )?.markets.find(market => market.key === 'h2h');

      return {
        id: event.id,
        eventId: event.id,
        sport: event.sport_title,
        eventName: event.home_team + ' vs ' + event.away_team,
        fighter1: event.home_team,
        fighter2: event.away_team,
        eventDate: event.commence_time,
        sportsbooks: event.bookmakers.map(book => {
          const h2hMarket = book.markets.find(market => market.key === 'h2h');
          return {
            name: book.title,
            lastUpdate: book.last_update,
            odds: h2hMarket ? {
              fighter1: h2hMarket.outcomes.find(o => o.name === event.home_team)?.price,
              fighter2: h2hMarket.outcomes.find(o => o.name === event.away_team)?.price
            } : null
          };
        }),
        markets: event.bookmakers[0]?.markets.map(market => ({
          key: market.key,
          outcomes: market.outcomes
        })) || [],
        lastUpdated: new Date().toISOString()
      };
    });

  } catch (error) {
    console.error('Error fetching odds:', error);
    // Return fallback data structure with error info
    return [{
      id: 'error',
      eventName: 'API Error',
      error: error.message,
      message: 'Unable to fetch live odds data. Please check API configuration and rate limits.',
      timestamp: new Date().toISOString(),
      rateLimitInfo: 'The Odds API has rate limits. Check your usage at dashboard.the-odds-api.com'
    }];
  }
}

async function fetchUFCEvents() {
  try {
    // Fetch upcoming UFC events from SportsData.io
    const SPORTSDATA_API_KEY = process.env.SPORTSDATA_IO_API_KEY || '81a9726b488c4b57b48e59042405d1a6';
    
    const response = await fetch(`https://api.sportsdata.io/v3/mma/scores/json/Schedule/UFC/2024?key=${SPORTSDATA_API_KEY}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'UFC-Prediction-Platform/1.0'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`SportsData API error: ${response.status} ${response.statusText}`);
    }

    const events = await response.json();
    
    return events.slice(0, 10).map(event => ({
      id: event.FightId,
      eventId: event.FightId,
      eventName: event.Name || `${event.Fighter1} vs ${event.Fighter2}`,
      fighter1: event.Fighter1,
      fighter2: event.Fighter2,
      eventDate: event.DateTime,
      weightClass: event.WeightClass,
      titleFight: event.IsTitleFight,
      mainEvent: event.IsMainEvent,
      status: event.Status,
      venue: event.Venue,
      location: event.Location,
      lastUpdated: new Date().toISOString()
    }));

  } catch (error) {
    console.error('Error fetching UFC events:', error);
    return [];
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
      const [liveOdds, ufcEvents] = await Promise.all([
        fetchLiveOdds(),
        fetchUFCEvents()
      ]);
      
      res.status(200).json({
        success: true,
        liveOdds: {
          data: liveOdds,
          total: liveOdds.length,
          source: 'The Odds API',
          lastUpdated: new Date().toISOString()
        },
        upcomingEvents: {
          data: ufcEvents,
          total: ufcEvents.length,
          source: 'SportsData.io API',
          lastUpdated: new Date().toISOString()
        },
        message: "Live odds and event data from multiple sources",
        apiUsage: {
          oddsAPI: "Check usage at dashboard.the-odds-api.com",
          sportsDataIO: "Professional MMA data integration"
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        message: "Error fetching live odds data",
        timestamp: new Date().toISOString()
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}