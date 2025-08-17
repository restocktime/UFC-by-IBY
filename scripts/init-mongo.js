// MongoDB initialization script for development
// This script creates the necessary collections and indexes

// Switch to the application database
db = db.getSiblingDB('ufc_platform');

// Create collections
db.createCollection('fighters');
db.createCollection('fights');
db.createCollection('events');
db.createCollection('odds');
db.createCollection('predictions');
db.createCollection('users');
db.createCollection('user_preferences');

// Create indexes for fighters collection
db.fighters.createIndex({ "name": 1 });
db.fighters.createIndex({ "rankings.weightClass": 1 });
db.fighters.createIndex({ "rankings.rank": 1 });
db.fighters.createIndex({ "camp.name": 1 });

// Create indexes for fights collection
db.fights.createIndex({ "eventId": 1 });
db.fights.createIndex({ "fighter1Id": 1 });
db.fights.createIndex({ "fighter2Id": 1 });
db.fights.createIndex({ "weightClass": 1 });
db.fights.createIndex({ "status": 1 });
db.fights.createIndex({ "titleFight": 1 });

// Create indexes for events collection
db.events.createIndex({ "date": 1 });
db.events.createIndex({ "venue.city": 1 });
db.events.createIndex({ "venue.country": 1 });

// Create indexes for odds collection
db.odds.createIndex({ "fightId": 1 });
db.odds.createIndex({ "sportsbook": 1 });
db.odds.createIndex({ "timestamp": 1 });
db.odds.createIndex({ "fightId": 1, "timestamp": 1 });

// Create indexes for predictions collection
db.predictions.createIndex({ "fightId": 1 });
db.predictions.createIndex({ "modelVersion": 1 });
db.predictions.createIndex({ "timestamp": 1 });
db.predictions.createIndex({ "confidence": 1 });

// Create indexes for users collection
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "username": 1 }, { unique: true });

// Create indexes for user_preferences collection
db.user_preferences.createIndex({ "userId": 1 }, { unique: true });
db.user_preferences.createIndex({ "followedFighters": 1 });
db.user_preferences.createIndex({ "weightClasses": 1 });

// Insert sample data for development
print('Creating sample data...');

// Sample fighters
const sampleFighters = [
  {
    _id: 'fighter-1',
    name: 'Jon Jones',
    nickname: 'Bones',
    physicalStats: {
      height: 76,
      weight: 205,
      reach: 84.5,
      legReach: 44,
      stance: 'Orthodox'
    },
    record: {
      wins: 26,
      losses: 1,
      draws: 0,
      noContests: 1
    },
    rankings: {
      weightClass: 'Light Heavyweight',
      rank: 1
    },
    camp: {
      name: 'Jackson Wink MMA',
      location: 'Albuquerque, NM',
      headCoach: 'Greg Jackson'
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'fighter-2',
    name: 'Alexander Volkanovski',
    nickname: 'The Great',
    physicalStats: {
      height: 66,
      weight: 145,
      reach: 71.5,
      legReach: 38,
      stance: 'Orthodox'
    },
    record: {
      wins: 25,
      losses: 1,
      draws: 0,
      noContests: 0
    },
    rankings: {
      weightClass: 'Featherweight',
      rank: 1
    },
    camp: {
      name: 'Freestyle Fighting Gym',
      location: 'Sydney, Australia',
      headCoach: 'Joe Lopez'
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

db.fighters.insertMany(sampleFighters);

// Sample event
const sampleEvent = {
  _id: 'event-1',
  name: 'UFC 285: Jones vs. Gane',
  date: new Date('2024-03-04T00:00:00Z'),
  venue: {
    name: 'T-Mobile Arena',
    city: 'Las Vegas',
    state: 'Nevada',
    country: 'USA',
    altitude: 2001
  },
  commission: 'Nevada State Athletic Commission',
  fights: ['fight-1'],
  createdAt: new Date(),
  updatedAt: new Date()
};

db.events.insertOne(sampleEvent);

// Sample fight
const sampleFight = {
  _id: 'fight-1',
  eventId: 'event-1',
  fighter1Id: 'fighter-1',
  fighter2Id: 'fighter-2',
  weightClass: 'Light Heavyweight',
  titleFight: true,
  mainEvent: true,
  scheduledRounds: 5,
  status: 'scheduled',
  createdAt: new Date(),
  updatedAt: new Date()
};

db.fights.insertOne(sampleFight);

// Sample odds
const sampleOdds = [
  {
    _id: 'odds-1',
    fightId: 'fight-1',
    sportsbook: 'DraftKings',
    timestamp: new Date(),
    moneyline: {
      fighter1: -200,
      fighter2: +170
    },
    method: {
      ko: {
        fighter1: +300,
        fighter2: +400
      },
      submission: {
        fighter1: +500,
        fighter2: +800
      },
      decision: {
        fighter1: +250,
        fighter2: +300
      }
    },
    rounds: {
      under2_5: +120,
      over2_5: -140
    },
    createdAt: new Date()
  }
];

db.odds.insertMany(sampleOdds);

print('Sample data created successfully!');
print('Database initialization complete.');