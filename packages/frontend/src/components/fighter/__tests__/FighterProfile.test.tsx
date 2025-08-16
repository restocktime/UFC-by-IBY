import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { Fighter } from '@ufc-platform/shared';
import { FighterProfile } from '../FighterProfile';
import theme from '../../../theme';
import { vi } from 'vitest';

// Mock the chart components to avoid canvas rendering issues in tests
vi.mock('../PerformanceChart', () => ({
  PerformanceChart: ({ recentForm }: any) => (
    <div data-testid="performance-chart">
      Performance Chart - {recentForm.length} data points
    </div>
  ),
}));

vi.mock('../RecordChart', () => ({
  RecordChart: ({ record }: any) => (
    <div data-testid="record-chart">
      Record Chart - {record.wins}W-{record.losses}L-{record.draws}D
    </div>
  ),
}));

const mockFighter: Fighter = {
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
        date: new Date('2022-08-27'),
        result: 'win',
        performance: 92,
      },
    ],
  },
  trends: {
    performanceTrend: 'improving',
    activityLevel: 'active',
    injuryHistory: ['Shoulder injury (2021)', 'Hand injury (2020)'],
    lastFightDate: new Date('2023-03-04'),
  },
  lastUpdated: new Date(),
};

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('FighterProfile', () => {
  it('renders fighter basic information correctly', () => {
    renderWithTheme(<FighterProfile fighter={mockFighter} />);
    
    expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    expect(screen.getByText('"Bones"')).toBeInTheDocument();
    expect(screen.getByText('Jackson Wink MMA (Albuquerque, NM)')).toBeInTheDocument();
    expect(screen.getByText('Greg Jackson')).toBeInTheDocument();
  });

  it('displays fighter rankings and weight class', () => {
    renderWithTheme(<FighterProfile fighter={mockFighter} />);
    
    expect(screen.getByText('Light Heavyweight')).toBeInTheDocument();
    expect(screen.getByText('#1 Ranked')).toBeInTheDocument();
    expect(screen.getByText('P4P #2')).toBeInTheDocument();
  });

  it('shows fight record and win percentage', () => {
    renderWithTheme(<FighterProfile fighter={mockFighter} />);
    
    expect(screen.getByText('26-1-0')).toBeInTheDocument();
    expect(screen.getByText('96.3% Win Rate')).toBeInTheDocument();
  });

  it('displays calculated metrics correctly', () => {
    renderWithTheme(<FighterProfile fighter={mockFighter} />);
    
    expect(screen.getByText('3')).toBeInTheDocument(); // Win streak
    expect(screen.getByText('58.2%')).toBeInTheDocument(); // Striking accuracy
    expect(screen.getByText('95.8%')).toBeInTheDocument(); // Takedown defense
  });

  it('shows physical stats in correct format', () => {
    renderWithTheme(<FighterProfile fighter={mockFighter} />);
    
    expect(screen.getByText('6\'4"')).toBeInTheDocument(); // Height
    expect(screen.getByText('205 lbs')).toBeInTheDocument(); // Weight
    expect(screen.getByText('84.5"')).toBeInTheDocument(); // Reach
    expect(screen.getByText('44"')).toBeInTheDocument(); // Leg reach
    expect(screen.getByText('Orthodox')).toBeInTheDocument(); // Stance
  });

  it('displays performance trends and activity level', () => {
    renderWithTheme(<FighterProfile fighter={mockFighter} />);
    
    expect(screen.getByText('improving')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('1.2 fights/year')).toBeInTheDocument();
  });

  it('shows injury history when available', () => {
    renderWithTheme(<FighterProfile fighter={mockFighter} />);
    
    expect(screen.getByText('Shoulder injury (2021)')).toBeInTheDocument();
    expect(screen.getByText('Hand injury (2020)')).toBeInTheDocument();
  });

  it('handles fighter with no injury history', () => {
    const fighterNoInjuries = {
      ...mockFighter,
      trends: {
        ...mockFighter.trends,
        injuryHistory: [],
      },
    };

    renderWithTheme(<FighterProfile fighter={fighterNoInjuries} />);
    
    expect(screen.getByText('No significant injury history recorded')).toBeInTheDocument();
  });

  it('renders performance and record charts', () => {
    renderWithTheme(<FighterProfile fighter={mockFighter} />);
    
    expect(screen.getByTestId('performance-chart')).toBeInTheDocument();
    expect(screen.getByTestId('record-chart')).toBeInTheDocument();
  });

  it('displays loading state correctly', () => {
    renderWithTheme(<FighterProfile fighter={mockFighter} loading={true} />);
    
    expect(screen.getByText('Loading fighter profile...')).toBeInTheDocument();
    expect(screen.queryByText('Jon Jones')).not.toBeInTheDocument();
  });

  it('handles fighter without nickname', () => {
    const fighterNoNickname = {
      ...mockFighter,
      nickname: undefined,
    };

    renderWithTheme(<FighterProfile fighter={fighterNoNickname} />);
    
    expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    expect(screen.queryByText('"Bones"')).not.toBeInTheDocument();
  });

  it('handles fighter without rankings', () => {
    const fighterNoRankings = {
      ...mockFighter,
      rankings: {
        ...mockFighter.rankings,
        rank: undefined,
        p4pRank: undefined,
      },
    };

    renderWithTheme(<FighterProfile fighter={fighterNoRankings} />);
    
    expect(screen.getByText('Light Heavyweight')).toBeInTheDocument();
    expect(screen.queryByText('#1 Ranked')).not.toBeInTheDocument();
    expect(screen.queryByText('P4P #2')).not.toBeInTheDocument();
  });

  it('calculates win percentage correctly for different records', () => {
    const fighterDifferentRecord = {
      ...mockFighter,
      record: {
        wins: 15,
        losses: 3,
        draws: 2,
        noContests: 0,
      },
    };

    renderWithTheme(<FighterProfile fighter={fighterDifferentRecord} />);
    
    // 15 wins out of 20 total fights = 75%
    expect(screen.getByText('75.0% Win Rate')).toBeInTheDocument();
  });
});