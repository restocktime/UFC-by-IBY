import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Divider,
} from '@mui/material';
import { Fighter } from '@ufc-platform/shared';
import { FighterProfile, FighterComparison } from './index';

// Example fighter data for demonstration
const exampleFighter1: Fighter = {
  id: 'fighter-1',
  name: 'Jon Jones',
  nickname: 'Bones',
  physicalStats: {
    height: 76, // 6'4"
    weight: 205,
    reach: 84.5,
    legReach: 44,
    stance: 'Orthodox',
  },
  record: {
    wins: 26,
    losses: 1,
    draws: 0,
    noContests: 1,
  },
  rankings: {
    weightClass: 'Light Heavyweight',
    rank: 1,
    p4pRank: 2,
  },
  camp: {
    name: 'Jackson Wink MMA',
    location: 'Albuquerque, NM',
    headCoach: 'Greg Jackson',
  },
  socialMedia: {
    instagram: '@jonnybones',
    twitter: '@JonnyBones',
  },
  calculatedMetrics: {
    strikingAccuracy: {
      value: 58.2,
      period: 5,
      trend: 'increasing',
    },
    takedownDefense: {
      value: 95.8,
      period: 5,
      trend: 'stable',
    },
    fightFrequency: 1.2,
    winStreak: 3,
    recentForm: [
      {
        fightId: 'fight-1',
        date: new Date('2023-03-04'),
        result: 'win',
        performance: 85,
      },
      {
        fightId: 'fight-2',
        date: new Date('2023-01-15'),
        result: 'win',
        performance: 92,
      },
      {
        fightId: 'fight-3',
        date: new Date('2022-08-27'),
        result: 'win',
        performance: 88,
      },
    ],
  },
  trends: {
    performanceTrend: 'improving',
    activityLevel: 'active',
    injuryHistory: ['Shoulder injury (2021)'],
    lastFightDate: new Date('2023-03-04'),
  },
  lastUpdated: new Date(),
};

const exampleFighter2: Fighter = {
  id: 'fighter-2',
  name: 'Daniel Cormier',
  nickname: 'DC',
  physicalStats: {
    height: 71, // 5'11"
    weight: 205,
    reach: 72.5,
    legReach: 40,
    stance: 'Southpaw',
  },
  record: {
    wins: 22,
    losses: 3,
    draws: 0,
    noContests: 1,
  },
  rankings: {
    weightClass: 'Light Heavyweight',
    rank: 2,
  },
  camp: {
    name: 'American Kickboxing Academy',
    location: 'San Jose, CA',
    headCoach: 'Javier Mendez',
  },
  socialMedia: {
    instagram: '@dc_mma',
    twitter: '@dc_mma',
  },
  calculatedMetrics: {
    strikingAccuracy: {
      value: 52.1,
      period: 5,
      trend: 'decreasing',
    },
    takedownDefense: {
      value: 78.9,
      period: 5,
      trend: 'stable',
    },
    fightFrequency: 1.8,
    winStreak: 0,
    recentForm: [
      {
        fightId: 'fight-4',
        date: new Date('2022-08-15'),
        result: 'loss',
        performance: 65,
      },
      {
        fightId: 'fight-5',
        date: new Date('2022-03-20'),
        result: 'win',
        performance: 78,
      },
    ],
  },
  trends: {
    performanceTrend: 'stable',
    activityLevel: 'semi_active',
    injuryHistory: ['Back injury (2020)', 'Hand injury (2019)'],
    lastFightDate: new Date('2022-08-15'),
  },
  lastUpdated: new Date(),
};

export function FighterExample() {
  const [view, setView] = useState<'profile1' | 'profile2' | 'comparison'>('profile1');

  return (
    <Box sx={{ p: 3 }}>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h4" gutterBottom>
            Fighter Components Demo
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            This demonstrates the FighterProfile and FighterComparison components with example data.
          </Typography>
          
          <Divider sx={{ my: 2 }} />
          
          <Grid container spacing={2}>
            <Grid item>
              <Button
                variant={view === 'profile1' ? 'contained' : 'outlined'}
                onClick={() => setView('profile1')}
              >
                Jon Jones Profile
              </Button>
            </Grid>
            <Grid item>
              <Button
                variant={view === 'profile2' ? 'contained' : 'outlined'}
                onClick={() => setView('profile2')}
              >
                Daniel Cormier Profile
              </Button>
            </Grid>
            <Grid item>
              <Button
                variant={view === 'comparison' ? 'contained' : 'outlined'}
                onClick={() => setView('comparison')}
              >
                Fighter Comparison
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {view === 'profile1' && <FighterProfile fighter={exampleFighter1} />}
      {view === 'profile2' && <FighterProfile fighter={exampleFighter2} />}
      {view === 'comparison' && (
        <FighterComparison fighter1={exampleFighter1} fighter2={exampleFighter2} />
      )}
    </Box>
  );
}