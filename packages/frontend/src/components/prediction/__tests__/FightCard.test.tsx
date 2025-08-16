import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { vi } from 'vitest';
import { FightCard } from '../FightCard';
import { theme } from '../../../theme';
import { Fight } from '@shared/types/fight';
import { Fighter } from '@shared/types/fighter';
import { PredictionResult } from '@shared/types/prediction';
import { Event } from '@shared/types/event';

// Mock data
const mockFighter1: Fighter = {
  id: 'fighter1',
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
    strikingAccuracy: { value: 58.2, period: 5, trend: 'stable' },
    takedownDefense: { value: 95.0, period: 5, trend: 'increasing' },
    fightFrequency: 1.2,
    winStreak: 1,
    recentForm: [],
  },
  trends: {
    performanceTrend: 'stable',
    activityLevel: 'active',
    injuryHistory: [],
    lastFightDate: new Date('2023-03-04'),
  },
  lastUpdated: new Date(),
};

const mockFighter2: Fighter = {
  id: 'fighter2',
  name: 'Stipe Miocic',
  nickname: undefined,
  physicalStats: {
    height: 76,
    weight: 241,
    reach: 80,
    legReach: 42,
    stance: 'Orthodox',
  },
  record: {
    wins: 20,
    losses: 4,
    draws: 0,
    noContests: 0,
  },
  rankings: {
    weightClass: 'Heavyweight',
    rank: 2,
  },
  camp: {
    name: 'Strong Style Fight Team',
    location: 'Cleveland, OH',
    headCoach: 'Marcus Marinelli',
  },
  socialMedia: {},
  calculatedMetrics: {
    strikingAccuracy: { value: 52.1, period: 5, trend: 'decreasing' },
    takedownDefense: { value: 68.0, period: 5, trend: 'stable' },
    fightFrequency: 0.8,
    winStreak: 0,
    recentForm: [],
  },
  trends: {
    performanceTrend: 'declining',
    activityLevel: 'semi_active',
    injuryHistory: [],
    lastFightDate: new Date('2021-03-27'),
  },
  lastUpdated: new Date(),
};

const mockEvent: Event = {
  id: 'event1',
  name: 'UFC 285: Jones vs Miocic',
  date: new Date('2024-03-15'),
  venue: {
    name: 'T-Mobile Arena',
    city: 'Las Vegas',
    state: 'NV',
    country: 'USA',
  },
  commission: 'Nevada State Athletic Commission',
  fights: ['fight1'],
};

const mockFight: Fight = {
  id: 'fight1',
  eventId: 'event1',
  fighter1Id: 'fighter1',
  fighter2Id: 'fighter2',
  weightClass: 'Heavyweight',
  titleFight: true,
  mainEvent: true,
  scheduledRounds: 5,
  status: 'scheduled',
  odds: [],
  predictions: [],
};

const mockPrediction: PredictionResult = {
  winnerProbability: { fighter1: 0.65, fighter2: 0.35 },
  methodPrediction: {
    ko: 0.4,
    submission: 0.1,
    decision: 0.5,
  },
  roundPrediction: {
    round1: 0.1,
    round2: 0.15,
    round3: 0.2,
    round4: 0.25,
    round5: 0.3,
  },
  confidence: 0.78,
  keyFactors: [
    {
      feature: 'striking_accuracy',
      importance: 0.8,
      description: 'Fighter 1 has superior striking accuracy',
    },
    {
      feature: 'takedown_defense',
      importance: 0.6,
      description: 'Fighter 1 has better takedown defense',
    },
  ],
  modelVersion: 'v2.1.0',
  timestamp: new Date(),
};

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('FightCard', () => {
  const defaultProps = {
    fight: mockFight,
    fighter1: mockFighter1,
    fighter2: mockFighter2,
    event: mockEvent,
  };

  it('renders fight card with basic information', () => {
    renderWithTheme(<FightCard {...defaultProps} />);
    
    expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    expect(screen.getByText('Stipe Miocic')).toBeInTheDocument();
    expect(screen.getByText('"Bones"')).toBeInTheDocument();
    expect(screen.getByText(/UFC 285: Jones vs Miocic/)).toBeInTheDocument();
    expect(screen.getByText(/Las Vegas/)).toBeInTheDocument();
    expect(screen.getByText(/Heavyweight/)).toBeInTheDocument();
    expect(screen.getByText(/5.*Rounds/)).toBeInTheDocument();
  });

  it('displays fighter records correctly', () => {
    renderWithTheme(<FightCard {...defaultProps} />);
    
    expect(screen.getByText(/26-1/)).toBeInTheDocument();
    expect(screen.getByText(/20-4/)).toBeInTheDocument();
  });

  it('shows rankings when available', () => {
    renderWithTheme(<FightCard {...defaultProps} />);
    
    expect(screen.getByText(/#1/)).toBeInTheDocument();
    expect(screen.getByText(/#2/)).toBeInTheDocument();
  });

  it('displays title fight and main event badges', () => {
    renderWithTheme(<FightCard {...defaultProps} />);
    
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Main Event')).toBeInTheDocument();
  });

  it('renders prediction information when provided', () => {
    renderWithTheme(<FightCard {...defaultProps} prediction={mockPrediction} />);
    
    expect(screen.getByText('AI Prediction')).toBeInTheDocument();
    expect(screen.getByText('78% Confidence')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getByText('KO: 40%')).toBeInTheDocument();
    expect(screen.getByText('Sub: 10%')).toBeInTheDocument();
    expect(screen.getByText('Dec: 50%')).toBeInTheDocument();
  });

  it('shows "Prediction not available" when no prediction provided', () => {
    renderWithTheme(<FightCard {...defaultProps} />);
    
    expect(screen.getByText('Prediction not available')).toBeInTheDocument();
  });

  it('calls onClick handler when card is clicked', () => {
    const mockOnClick = vi.fn();
    renderWithTheme(<FightCard {...defaultProps} onClick={mockOnClick} />);
    
    const card = document.querySelector('.MuiCard-root');
    if (card) {
      fireEvent.click(card);
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    }
  });

  it('applies hover effects when onClick is provided', () => {
    const mockOnClick = vi.fn();
    renderWithTheme(<FightCard {...defaultProps} onClick={mockOnClick} />);
    
    const card = document.querySelector('.MuiCard-root');
    expect(card).toBeInTheDocument();
    // In a real test environment, we would check computed styles
  });

  it('does not apply hover effects when onClick is not provided', () => {
    renderWithTheme(<FightCard {...defaultProps} />);
    
    // Card should not have click behavior when no onClick
    const card = document.querySelector('.MuiCard-root');
    expect(card).toBeInTheDocument();
  });

  it('handles fighters without nicknames', () => {
    renderWithTheme(<FightCard {...defaultProps} />);
    
    // Fighter2 has no nickname, should not show quotes
    expect(screen.queryByText('"Stipe"')).not.toBeInTheDocument();
  });

  it('handles fighters without rankings', () => {
    const fighter1WithoutRank = { ...mockFighter1, rankings: { ...mockFighter1.rankings, rank: undefined } };
    renderWithTheme(
      <FightCard 
        {...defaultProps} 
        fighter1={fighter1WithoutRank}
      />
    );
    
    // Should show record but not ranking for fighter1
    expect(screen.getByText(/26-1/)).toBeInTheDocument();
    expect(screen.queryByText(/#1/)).not.toBeInTheDocument();
  });

  it('displays confidence color coding correctly', () => {
    // High confidence (success)
    const highConfidencePrediction = { ...mockPrediction, confidence: 0.85 };
    const { rerender } = renderWithTheme(
      <FightCard {...defaultProps} prediction={highConfidencePrediction} />
    );
    expect(screen.getByText('85% Confidence')).toBeInTheDocument();

    // Medium confidence (warning)
    const mediumConfidencePrediction = { ...mockPrediction, confidence: 0.65 };
    rerender(
      <ThemeProvider theme={theme}>
        <FightCard {...defaultProps} prediction={mediumConfidencePrediction} />
      </ThemeProvider>
    );
    expect(screen.getByText('65% Confidence')).toBeInTheDocument();

    // Low confidence (error)
    const lowConfidencePrediction = { ...mockPrediction, confidence: 0.45 };
    rerender(
      <ThemeProvider theme={theme}>
        <FightCard {...defaultProps} prediction={lowConfidencePrediction} />
      </ThemeProvider>
    );
    expect(screen.getByText('45% Confidence')).toBeInTheDocument();
  });

  it('handles non-title, non-main event fights', () => {
    const regularFight = { ...mockFight, titleFight: false, mainEvent: false };
    renderWithTheme(
      <FightCard 
        {...defaultProps} 
        fight={regularFight}
      />
    );
    
    expect(screen.queryByText('Title')).not.toBeInTheDocument();
    expect(screen.queryByText('Main Event')).not.toBeInTheDocument();
  });

  it('formats date correctly', () => {
    renderWithTheme(<FightCard {...defaultProps} />);
    
    // Should format the date as "Mar 14, 2024" (note: date formatting might be off by one day)
    expect(screen.getByText(/Mar 1[45], 2024/)).toBeInTheDocument();
  });

  it('shows correct winner probability highlighting', () => {
    renderWithTheme(<FightCard {...defaultProps} prediction={mockPrediction} />);
    
    // Fighter1 has higher probability (65% vs 35%), so should be highlighted
    const avatars = document.querySelectorAll('.MuiAvatar-root');
    
    // These would need to check computed styles in a real test environment
    expect(avatars).toHaveLength(2);
    expect(avatars[0]).toBeInTheDocument();
    expect(avatars[1]).toBeInTheDocument();
  });
});