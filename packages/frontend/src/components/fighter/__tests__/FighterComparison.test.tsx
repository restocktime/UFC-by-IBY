import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { Fighter } from '@ufc-platform/shared';
import { FighterComparison } from '../FighterComparison';
import theme from '../../../theme';
import { vi } from 'vitest';

// Mock the comparison chart component
vi.mock('../ComparisonChart', () => ({
  ComparisonChart: ({ fighter1, fighter2 }: any) => (
    <div data-testid="comparison-chart">
      Comparison Chart - {fighter1.name} vs {fighter2.name}
    </div>
  ),
}));

const mockFighter1: Fighter = {
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
    recentForm: [],
  },
  trends: {
    performanceTrend: 'improving',
    activityLevel: 'active',
    injuryHistory: [],
    lastFightDate: new Date('2023-03-04'),
  },
  lastUpdated: new Date(),
};

const mockFighter2: Fighter = {
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
    recentForm: [],
  },
  trends: {
    performanceTrend: 'stable',
    activityLevel: 'semi_active',
    injuryHistory: [],
    lastFightDate: new Date('2022-08-15'),
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

describe('FighterComparison', () => {
  it('renders both fighter names and nicknames', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    expect(screen.getAllByText('Jon Jones')).toHaveLength(2); // Header and table
    expect(screen.getByText('"Bones"')).toBeInTheDocument();
    expect(screen.getAllByText('Daniel Cormier')).toHaveLength(2); // Header and table
    expect(screen.getByText('"DC"')).toBeInTheDocument();
  });

  it('displays both fighters rankings', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    expect(screen.getAllByText('Light Heavyweight')).toHaveLength(2);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('shows fight records in comparison table', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    expect(screen.getByText('26-1-0')).toBeInTheDocument();
    expect(screen.getByText('22-3-0')).toBeInTheDocument();
    expect(screen.getByText('(96.3% win rate)')).toBeInTheDocument();
    expect(screen.getByText('(88.0% win rate)')).toBeInTheDocument();
  });

  it('compares striking accuracy with trend indicators', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    expect(screen.getByText('58.2%')).toBeInTheDocument();
    expect(screen.getByText('52.1%')).toBeInTheDocument();
  });

  it('compares takedown defense percentages', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    expect(screen.getByText('95.8%')).toBeInTheDocument();
    expect(screen.getByText('78.9%')).toBeInTheDocument();
  });

  it('shows win streaks comparison', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    // Win streaks should be displayed in the table
    const winStreakCells = screen.getAllByText('3');
    expect(winStreakCells.length).toBeGreaterThan(0);
    
    const zeroStreakCells = screen.getAllByText('0');
    expect(zeroStreakCells.length).toBeGreaterThan(0);
  });

  it('displays physical stats comparison', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    expect(screen.getByText('6\'4"')).toBeInTheDocument();
    expect(screen.getByText('5\'11"')).toBeInTheDocument();
    expect(screen.getByText('84.5"')).toBeInTheDocument();
    expect(screen.getByText('72.5"')).toBeInTheDocument();
    expect(screen.getByText('Orthodox')).toBeInTheDocument();
    expect(screen.getByText('Southpaw')).toBeInTheDocument();
  });

  it('compares performance trends', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    expect(screen.getByText('improving')).toBeInTheDocument();
    expect(screen.getByText('stable')).toBeInTheDocument();
  });

  it('compares activity levels', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('semi active')).toBeInTheDocument();
  });

  it('displays fight frequency comparison', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    expect(screen.getByText('1.2/year')).toBeInTheDocument();
    expect(screen.getByText('1.8/year')).toBeInTheDocument();
  });

  it('renders comparison chart', () => {
    renderWithTheme(
      <FighterComparison fighter1={mockFighter1} fighter2={mockFighter2} />
    );
    
    expect(screen.getByTestId('comparison-chart')).toBeInTheDocument();
    expect(screen.getByText('Comparison Chart - Jon Jones vs Daniel Cormier')).toBeInTheDocument();
  });

  it('displays loading state correctly', () => {
    renderWithTheme(
      <FighterComparison 
        fighter1={mockFighter1} 
        fighter2={mockFighter2} 
        loading={true} 
      />
    );
    
    expect(screen.getByText('Loading fighter comparison...')).toBeInTheDocument();
    expect(screen.queryByText('Jon Jones')).not.toBeInTheDocument();
  });

  it('handles fighters without nicknames', () => {
    const fighter1NoNickname = { ...mockFighter1, nickname: undefined };
    const fighter2NoNickname = { ...mockFighter2, nickname: undefined };

    renderWithTheme(
      <FighterComparison fighter1={fighter1NoNickname} fighter2={fighter2NoNickname} />
    );
    
    expect(screen.getAllByText('Jon Jones')).toHaveLength(2); // Header and table
    expect(screen.getAllByText('Daniel Cormier')).toHaveLength(2); // Header and table
    expect(screen.queryByText('"Bones"')).not.toBeInTheDocument();
    expect(screen.queryByText('"DC"')).not.toBeInTheDocument();
  });

  it('handles fighters without rankings', () => {
    const fighter1NoRank = {
      ...mockFighter1,
      rankings: { ...mockFighter1.rankings, rank: undefined },
    };
    const fighter2NoRank = {
      ...mockFighter2,
      rankings: { ...mockFighter2.rankings, rank: undefined },
    };

    renderWithTheme(
      <FighterComparison fighter1={fighter1NoRank} fighter2={fighter2NoRank} />
    );
    
    expect(screen.getAllByText('Light Heavyweight')).toHaveLength(2);
    expect(screen.queryByText('#1')).not.toBeInTheDocument();
    expect(screen.queryByText('#2')).not.toBeInTheDocument();
  });

  it('calculates win percentages correctly', () => {
    const fighter1Custom = {
      ...mockFighter1,
      record: { wins: 10, losses: 2, draws: 1, noContests: 0 },
    };
    const fighter2Custom = {
      ...mockFighter2,
      record: { wins: 8, losses: 4, draws: 0, noContests: 0 },
    };

    renderWithTheme(
      <FighterComparison fighter1={fighter1Custom} fighter2={fighter2Custom} />
    );
    
    // 10 wins out of 13 total = 76.9%
    expect(screen.getByText('(76.9% win rate)')).toBeInTheDocument();
    // 8 wins out of 12 total = 66.7%
    expect(screen.getByText('(66.7% win rate)')).toBeInTheDocument();
  });
});