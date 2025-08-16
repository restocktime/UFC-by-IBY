import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { vi } from 'vitest';
import { PredictionDetails } from '../PredictionDetails';
import { theme } from '../../../theme';
import { Fight } from '@shared/types/fight';
import { Fighter } from '@shared/types/fighter';
import { PredictionResult } from '@shared/types/prediction';
import { Event } from '@shared/types/event';

// Mock data (reusing from FightCard tests)
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
    {
      feature: 'recent_form',
      importance: 0.4,
      description: 'Fighter 1 has better recent performance',
    },
  ],
  modelVersion: 'v2.1.0',
  timestamp: new Date('2024-03-10T10:00:00Z'),
};

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('PredictionDetails', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    fight: mockFight,
    fighter1: mockFighter1,
    fighter2: mockFighter2,
    event: mockEvent,
    prediction: mockPrediction,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog when open is true', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} />);
    
    expect(screen.getByText('Fight Prediction Analysis')).toBeInTheDocument();
    expect(screen.getByText('UFC 285: Jones vs Miocic')).toBeInTheDocument();
  });

  it('does not render dialog when open is false', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} open={false} />);
    
    expect(screen.queryByText('Fight Prediction Analysis')).not.toBeInTheDocument();
  });

  it('displays fight overview correctly', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} />);
    
    expect(screen.getByText('Fight Overview')).toBeInTheDocument();
    expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    expect(screen.getByText('Stipe Miocic')).toBeInTheDocument();
    expect(screen.getByText('26-1 • #1')).toBeInTheDocument();
    expect(screen.getByText('20-4 • #2')).toBeInTheDocument();
    expect(screen.getByText('Title Fight')).toBeInTheDocument();
    expect(screen.getByText('Main Event')).toBeInTheDocument();
  });

  it('displays win probabilities with progress bars', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} />);
    
    expect(screen.getByText('Win Probability')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  it('displays method predictions correctly', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} />);
    
    expect(screen.getByText('Method Prediction')).toBeInTheDocument();
    expect(screen.getByText('KO/TKO')).toBeInTheDocument();
    expect(screen.getByText('Submission')).toBeInTheDocument();
    expect(screen.getByText('Decision')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('displays round predictions', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} />);
    
    expect(screen.getByText('Round Prediction')).toBeInTheDocument();
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByText('Round 3')).toBeInTheDocument();
    expect(screen.getByText('Round 4')).toBeInTheDocument();
    expect(screen.getByText('Round 5')).toBeInTheDocument();
  });

  it('displays key factors with importance levels', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} />);
    
    expect(screen.getByText('Key Factors')).toBeInTheDocument();
    expect(screen.getByText('Striking accuracy')).toBeInTheDocument();
    expect(screen.getByText('Takedown defense')).toBeInTheDocument();
    expect(screen.getByText('Recent form')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });

  it('displays model information', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} />);
    
    expect(screen.getByText('Model Information')).toBeInTheDocument();
    expect(screen.getByText('Model Version: v2.1.0')).toBeInTheDocument();
    expect(screen.getByText('Confidence: 78%')).toBeInTheDocument();
  });

  it('displays compliance disclaimer', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} />);
    
    expect(screen.getByText(/This prediction is generated using machine learning models/)).toBeInTheDocument();
    expect(screen.getByText(/should not be used for gambling/)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const mockOnClose = vi.fn();
    renderWithTheme(<PredictionDetails {...defaultProps} onClose={mockOnClose} />);
    
    const closeButton = screen.getByText('Close');
    fireEvent.click(closeButton);
    
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onClose when dialog backdrop is clicked', async () => {
    const mockOnClose = vi.fn();
    renderWithTheme(<PredictionDetails {...defaultProps} onClose={mockOnClose} />);
    
    // Click on the backdrop (outside the dialog content)
    const backdrop = document.querySelector('.MuiBackdrop-root');
    if (backdrop) {
      fireEvent.click(backdrop);
      
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    }
  });

  it('handles high confidence predictions correctly', () => {
    const highConfidencePrediction = { ...mockPrediction, confidence: 0.85 };
    renderWithTheme(
      <PredictionDetails 
        {...defaultProps} 
        prediction={highConfidencePrediction} 
      />
    );
    
    expect(screen.getByText('85% Confidence')).toBeInTheDocument();
  });

  it('handles low confidence predictions correctly', () => {
    const lowConfidencePrediction = { ...mockPrediction, confidence: 0.45 };
    renderWithTheme(
      <PredictionDetails 
        {...defaultProps} 
        prediction={lowConfidencePrediction} 
      />
    );
    
    expect(screen.getByText('45% Confidence')).toBeInTheDocument();
  });

  it('handles fighters without rankings', () => {
    const fighter1WithoutRank = { 
      ...mockFighter1, 
      rankings: { ...mockFighter1.rankings, rank: undefined } 
    };
    renderWithTheme(
      <PredictionDetails 
        {...defaultProps} 
        fighter1={fighter1WithoutRank} 
      />
    );
    
    expect(screen.getByText('26-1')).toBeInTheDocument();
    expect(screen.queryByText('26-1 • #1')).not.toBeInTheDocument();
  });

  it('handles non-title, non-main event fights', () => {
    const regularFight = { ...mockFight, titleFight: false, mainEvent: false };
    renderWithTheme(
      <PredictionDetails 
        {...defaultProps} 
        fight={regularFight} 
      />
    );
    
    expect(screen.queryByText('Title Fight')).not.toBeInTheDocument();
    expect(screen.queryByText('Main Event')).not.toBeInTheDocument();
  });

  it('limits key factors display to 6 items', () => {
    const manyFactorsPrediction = {
      ...mockPrediction,
      keyFactors: [
        ...mockPrediction.keyFactors,
        { feature: 'factor4', importance: 0.3, description: 'Factor 4' },
        { feature: 'factor5', importance: 0.2, description: 'Factor 5' },
        { feature: 'factor6', importance: 0.1, description: 'Factor 6' },
        { feature: 'factor7', importance: 0.05, description: 'Factor 7' },
        { feature: 'factor8', importance: 0.02, description: 'Factor 8' },
      ],
    };
    
    renderWithTheme(
      <PredictionDetails 
        {...defaultProps} 
        prediction={manyFactorsPrediction} 
      />
    );
    
    // Should only show first 6 factors
    expect(screen.getByText('Factor 6')).toBeInTheDocument();
    expect(screen.queryByText('Factor 7')).not.toBeInTheDocument();
    expect(screen.queryByText('Factor 8')).not.toBeInTheDocument();
  });

  it('formats percentages correctly', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} />);
    
    // Check that percentages are properly formatted
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('displays proper icons for different feature types', () => {
    renderWithTheme(<PredictionDetails {...defaultProps} />);
    
    // Icons should be present for each key factor
    const keyFactorsSection = screen.getByText('Key Factors').closest('.MuiCard-root');
    expect(keyFactorsSection).toBeInTheDocument();
    
    // Check that feature names are properly formatted (underscores replaced with spaces)
    expect(screen.getByText('Striking accuracy')).toBeInTheDocument();
    expect(screen.getByText('Takedown defense')).toBeInTheDocument();
  });
});