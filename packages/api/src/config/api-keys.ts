import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const apiKeys = {
  // SportsData.io API
  sportsDataIO: {
    key: process.env.SPORTSDATA_IO_API_KEY || '81a9726b488c4b57b48e59042405d1a6',
    baseUrl: 'https://api.sportsdata.io/v3/mma',
    endpoints: {
      events: '/scores/json/Event',
      eventOdds: '/odds/json/EventOdds',
      fighters: '/scores/json/Fighters',
      fights: '/scores/json/Fights'
    }
  },

  // The Odds API
  oddsAPI: {
    key: process.env.ODDS_API_KEY || '22e59e4eccd8562ad4b697aeeaccb0fb',
    baseUrl: 'https://api.the-odds-api.com/v4',
    endpoints: {
      sports: '/sports',
      odds: '/sports/mma_mixed_martial_arts/odds',
      events: '/sports/mma_mixed_martial_arts/events'
    }
  },

  // ESPN API (no key required)
  espnAPI: {
    baseUrl: 'https://site.web.api.espn.com/apis',
    endpoints: {
      scoreboard: '/personalized/v2/scoreboard/header',
      fighters: '/common/v3/sports/mma/ufc/athletes',
      events: '/common/v3/sports/mma/ufc/scoreboard'
    }
  }
};

export const proxyConfig = {
  oxylabs: {
    host: 'isp.oxylabs.io',
    ports: [8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010],
    ips: [
      '50.117.73.134', '50.117.73.135', '50.117.73.136', '50.117.73.137',
      '50.117.73.138', '50.117.73.139', '50.117.73.14', '50.117.73.140',
      '50.117.73.141', '50.117.73.144'
    ],
    username: process.env.OXYLABS_USERNAME || '',
    password: process.env.OXYLABS_PASSWORD || '',
    country: 'US'
  }
};

export const rateLimits = {
  sportsDataIO: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000
  },
  oddsAPI: {
    requestsPerMinute: 10,
    requestsPerHour: 500,
    requestsPerDay: 1000
  },
  espnAPI: {
    requestsPerMinute: 100,
    requestsPerHour: 2000,
    requestsPerDay: 20000
  }
};