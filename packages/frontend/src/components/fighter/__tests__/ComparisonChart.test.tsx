import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { Fighter } from '@ufc-platform/shared';
import { ComparisonChart } from '../ComparisonChart';
import theme from '../../../theme';
import { vi } from 'vitest';

// Mock recharts to avoid canvas rendering issues in tests
vi.mock('recharts', () => ({
  RadarChart: ({ children, data }: any) => (
    <div data-testid="radar-chart">
      {children}
      <div data-testid="chart-data">{data?.length} metrics</div>
    </div>
  ),
  PolarGrid: () => <div data-testid="polar-grid" />,
  PolarAngleAxis: ({ dataKey }: any) => <div data-testid="polar-angle-axis">{dataKey}</div>,
  PolarRadiusAxis: ({ domain }: any) => <div data-testid="polar-radius-axis">{domain?.join('-')}</div>,
  Radar: ({ name, dataKey }: any) => <div data-testid="radar">{name}: {dataKey}</div>,
  Legend: ({ content }: any) => <div data-testid="legend">{content?.name}</div>,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
}));

const mockFighter1: Fighter = {
  id: 'fighter-1',
  name: 'Jon Jones',
  nickname: 'Bones',
  physicalStats: {
    height: 76,
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
  },
  camp: {
    name: 'Jackson Wink MMA',
    location: 'Albuquerque, NM',
    headCoach: 'Greg Jackson',
  },
  socialMedia: {},
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
    ],
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
    height: 71,
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
  socialMedia: {},
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
        fightId: 'fight-3',
        date: new Date('2022-08-15'),
        result: 'loss',
        performance: 65,
      },
    ],
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

describe('ComparisonChart', () => {
  it('renders radar chart components', () => {
    renderWithTheme(<ComparisonChart fighter1={mockFighter1} fighter2={mockFighter2} />);
    
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('polar-grid')).toBeInTheDocument();
    expect(screen.getByTestId('polar-angle-axis')).toBeInTheDocument();
    expect(screen.getByTestId('polar-radius-axis')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('displays correct number of metrics', () => {
    renderWithTheme(<ComparisonChart fighter1={mockFighter1} fighter2={mockFighter2} />);
    
    // Should have 6 metrics: Win Rate, Striking Accuracy, Takedown Defense, Fight Frequency, Win Streak, Recent Form
    expect(screen.getByText('6 metrics')).toBeInTheDocument();
  });

  it('sets correct radar axis configuration', () => {
    renderWithTheme(<ComparisonChart fighter1={mockFighter1} fighter2={mockFighter2} />);
    
    expect(screen.getByText('metric')).toBeInTheDocument(); // dataKey for PolarAngleAxis
    expect(screen.getByText('0-100')).toBeInTheDocument(); // domain for PolarRadiusAxis
  });

  it('creates radar components for both fighters', () => {
    renderWithTheme(<ComparisonChart fighter1={mockFighter1} fighter2={mockFighter2} />);
    
    expect(screen.getByText('Jon Jones: Jon Jones')).toBeInTheDocument();
    expect(screen.getByText('Daniel Cormier: Daniel Cormier')).toBeInTheDocument();
  });

  it('displays scaling disclaimers', () => {
    renderWithTheme(<ComparisonChart fighter1={mockFighter1} fighter2={mockFighter2} />);
    
    expect(screen.getByText(/Fight Frequency and Win Streak values are scaled/)).toBeInTheDocument();
    expect(screen.getByText(/Recent Form shows average performance score/)).toBeInTheDocument();
  });

  it('handles fighters with no recent form data', () => {
    const fighter1NoForm = {
      ...mockFighter1,
      calculatedMetrics: {
        ...mockFighter1.calculatedMetrics,
        recentForm: [],
      },
    };

    const fighter2NoForm = {
      ...mockFighter2,
      calculatedMetrics: {
        ...mockFighter2.calculatedMetrics,
        recentForm: [],
      },
    };

    renderWithTheme(<ComparisonChart fighter1={fighter1NoForm} fighter2={fighter2NoForm} />);
    
    // Should still render the chart with default values for recent form
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    expect(screen.getByText('6 metrics')).toBeInTheDocument();
  });

  it('handles fighters with zero win percentage', () => {
    const fighter1NoWins = {
      ...mockFighter1,
      record: {
        wins: 0,
        losses: 5,
        draws: 0,
        noContests: 0,
      },
    };

    renderWithTheme(<ComparisonChart fighter1={fighter1NoWins} fighter2={mockFighter2} />);
    
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });

  it('handles fighters with high fight frequency', () => {
    const fighter1HighFreq = {
      ...mockFighter1,
      calculatedMetrics: {
        ...mockFighter1.calculatedMetrics,
        fightFrequency: 8.0, // This should be capped at 100 when scaled
      },
    };

    renderWithTheme(<ComparisonChart fighter1={fighter1HighFreq} fighter2={mockFighter2} />);
    
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });

  it('handles fighters with high win streak', () => {
    const fighter1HighStreak = {
      ...mockFighter1,
      calculatedMetrics: {
        ...mockFighter1.calculatedMetrics,
        winStreak: 15, // This should be capped at 100 when scaled
      },
    };

    renderWithTheme(<ComparisonChart fighter1={fighter1HighStreak} fighter2={mockFighter2} />);
    
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });
});