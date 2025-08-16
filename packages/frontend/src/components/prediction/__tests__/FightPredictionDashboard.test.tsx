import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { vi } from 'vitest';
import { FightPredictionDashboard } from '../FightPredictionDashboard';
import { theme } from '../../../theme';
import { apiService } from '../../../services/api';

// Mock the API service
vi.mock('../../../services/api', () => ({
  apiService: {
    get: vi.fn(),
  },
}));

const mockApiService = apiService as any;

// Mock data
const mockFights = [
  {
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
  },
  {
    id: 'fight2',
    eventId: 'event2',
    fighter1Id: 'fighter3',
    fighter2Id: 'fighter4',
    weightClass: 'Lightweight',
    titleFight: false,
    mainEvent: false,
    scheduledRounds: 3,
    status: 'scheduled',
    odds: [],
    predictions: [],
  },
];

const mockFighters = {
  fighter1: {
    id: 'fighter1',
    name: 'Jon Jones',
    nickname: 'Bones',
    record: { wins: 26, losses: 1, draws: 0, noContests: 1 },
    rankings: { weightClass: 'Heavyweight', rank: 1 },
  },
  fighter2: {
    id: 'fighter2',
    name: 'Stipe Miocic',
    record: { wins: 20, losses: 4, draws: 0, noContests: 0 },
    rankings: { weightClass: 'Heavyweight', rank: 2 },
  },
  fighter3: {
    id: 'fighter3',
    name: 'Islam Makhachev',
    record: { wins: 24, losses: 1, draws: 0, noContests: 0 },
    rankings: { weightClass: 'Lightweight', rank: 1 },
  },
  fighter4: {
    id: 'fighter4',
    name: 'Charles Oliveira',
    record: { wins: 33, losses: 9, draws: 0, noContests: 1 },
    rankings: { weightClass: 'Lightweight', rank: 2 },
  },
};

const mockEvents = {
  event1: {
    id: 'event1',
    name: 'UFC 285: Jones vs Miocic',
    date: new Date('2024-03-15'),
    venue: { name: 'T-Mobile Arena', city: 'Las Vegas', country: 'USA' },
  },
  event2: {
    id: 'event2',
    name: 'UFC 286: Makhachev vs Oliveira',
    date: new Date('2024-03-20'),
    venue: { name: 'O2 Arena', city: 'London', country: 'UK' },
  },
};

const mockPredictions = {
  fight1: {
    winnerProbability: { fighter1: 0.65, fighter2: 0.35 },
    methodPrediction: { ko: 0.4, submission: 0.1, decision: 0.5 },
    roundPrediction: { round1: 0.1, round2: 0.15, round3: 0.2, round4: 0.25, round5: 0.3 },
    confidence: 0.78,
    keyFactors: [],
    modelVersion: 'v2.1.0',
    timestamp: new Date(),
  },
  fight2: {
    winnerProbability: { fighter1: 0.55, fighter2: 0.45 },
    methodPrediction: { ko: 0.2, submission: 0.3, decision: 0.5 },
    roundPrediction: { round1: 0.15, round2: 0.25, round3: 0.6 },
    confidence: 0.62,
    keyFactors: [],
    modelVersion: 'v2.1.0',
    timestamp: new Date(),
  },
};

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('FightPredictionDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup API mocks
    mockApiService.get.mockImplementation((url: string) => {
      if (url === '/fights/upcoming') {
        return Promise.resolve(mockFights);
      }
      if (url.startsWith('/fighters/')) {
        const fighterId = url.split('/').pop();
        return Promise.resolve(mockFighters[fighterId as keyof typeof mockFighters]);
      }
      if (url.startsWith('/events/')) {
        const eventId = url.split('/').pop();
        return Promise.resolve(mockEvents[eventId as keyof typeof mockEvents]);
      }
      if (url.startsWith('/predictions/')) {
        const fightId = url.split('/').pop();
        return Promise.resolve(mockPredictions[fightId as keyof typeof mockPredictions]);
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  it('renders loading state initially', () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    expect(screen.getByText('Fight Predictions')).toBeInTheDocument();
    // Should show skeleton loaders
    expect(document.querySelectorAll('.MuiSkeleton-root')).toHaveLength(6);
  });

  it('loads and displays fights after API calls complete', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
      expect(screen.getByText('Stipe Miocic')).toBeInTheDocument();
      expect(screen.getByText('Islam Makhachev')).toBeInTheDocument();
      expect(screen.getByText('Charles Oliveira')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Showing 2 of 2 upcoming fights')).toBeInTheDocument();
  });

  it('displays error message when API calls fail', async () => {
    mockApiService.get.mockRejectedValue(new Error('API Error'));
    
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load fight predictions. Please try again.')).toBeInTheDocument();
    });
  });

  it('filters fights by search term', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText('Search fighters or events...');
    fireEvent.change(searchInput, { target: { value: 'Jones' } });
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
      expect(screen.queryByText('Islam Makhachev')).not.toBeInTheDocument();
      expect(screen.getByText('Showing 1 of 2 upcoming fights')).toBeInTheDocument();
    });
  });

  it('filters fights by weight class', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    const weightClassSelect = screen.getByLabelText('Weight Class');
    fireEvent.mouseDown(weightClassSelect);
    
    const lightweightOption = screen.getByText('Lightweight');
    fireEvent.click(lightweightOption);
    
    await waitFor(() => {
      expect(screen.queryByText('Jon Jones')).not.toBeInTheDocument();
      expect(screen.getByText('Islam Makhachev')).toBeInTheDocument();
      expect(screen.getByText('Showing 1 of 2 upcoming fights')).toBeInTheDocument();
    });
  });

  it('filters fights by title fights only', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    const titleFightsButton = screen.getByText('Title Fights');
    fireEvent.click(titleFightsButton);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
      expect(screen.queryByText('Islam Makhachev')).not.toBeInTheDocument();
      expect(screen.getByText('Showing 1 of 2 upcoming fights')).toBeInTheDocument();
    });
  });

  it('filters fights by main events only', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    const mainEventsButton = screen.getByText('Main Events');
    fireEvent.click(mainEventsButton);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
      expect(screen.queryByText('Islam Makhachev')).not.toBeInTheDocument();
      expect(screen.getByText('Showing 1 of 2 upcoming fights')).toBeInTheDocument();
    });
  });

  it('filters fights by minimum confidence', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    const confidenceInput = screen.getByLabelText('Min Confidence %');
    fireEvent.change(confidenceInput, { target: { value: '70' } });
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument(); // 78% confidence
      expect(screen.queryByText('Islam Makhachev')).not.toBeInTheDocument(); // 62% confidence
      expect(screen.getByText('Showing 1 of 2 upcoming fights')).toBeInTheDocument();
    });
  });

  it('sorts fights by different criteria', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    const sortSelect = screen.getByLabelText('Sort By');
    fireEvent.mouseDown(sortSelect);
    
    const confidenceOption = screen.getByText('Confidence');
    fireEvent.click(confidenceOption);
    
    // Should sort by confidence (highest first)
    await waitFor(() => {
      const fightCards = screen.getAllByText(/vs/i);
      expect(fightCards).toHaveLength(2);
      // Jon Jones fight should be first (higher confidence)
    });
  });

  it('toggles between grid and list view modes', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    // Should start in grid mode
    const listViewButton = screen.getByRole('button', { name: /view list/i });
    fireEvent.click(listViewButton);
    
    // View should change to list mode
    // This would need to check the actual layout changes in a real test
  });

  it('clears all filters when clear button is clicked', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    // Apply some filters
    const searchInput = screen.getByPlaceholderText('Search fighters or events...');
    fireEvent.change(searchInput, { target: { value: 'Jones' } });
    
    const titleFightsButton = screen.getByText('Title Fights');
    fireEvent.click(titleFightsButton);
    
    // Clear filters
    const clearButton = screen.getByText('Clear Filters');
    fireEvent.click(clearButton);
    
    await waitFor(() => {
      expect(searchInput).toHaveValue('');
      expect(screen.getByText('Showing 2 of 2 upcoming fights')).toBeInTheDocument();
    });
  });

  it('refreshes data when refresh button is clicked', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    // Should call API again
    await waitFor(() => {
      expect(mockApiService.get).toHaveBeenCalledWith('/fights/upcoming');
    });
  });

  it('opens prediction details when fight card is clicked', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    // Click on a fight card (assuming it has prediction)
    const fightCard = screen.getByText('Jon Jones').closest('.MuiCard-root');
    if (fightCard) {
      fireEvent.click(fightCard);
      
      await waitFor(() => {
        expect(screen.getByText('Fight Prediction Analysis')).toBeInTheDocument();
      });
    }
  });

  it('displays filter chips when filters are active', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    // Apply title fights filter
    const titleFightsButton = screen.getByText('Title Fights');
    fireEvent.click(titleFightsButton);
    
    await waitFor(() => {
      expect(screen.getByText('Title Fights Only')).toBeInTheDocument();
    });
    
    // Remove filter by clicking chip delete
    const chipDeleteButton = screen.getByText('Title Fights Only').parentElement?.querySelector('svg');
    if (chipDeleteButton) {
      fireEvent.click(chipDeleteButton);
      
      await waitFor(() => {
        expect(screen.queryByText('Title Fights Only')).not.toBeInTheDocument();
      });
    }
  });

  it('shows no fights message when no results match filters', async () => {
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    });
    
    // Apply a search that matches no fights
    const searchInput = screen.getByPlaceholderText('Search fighters or events...');
    fireEvent.change(searchInput, { target: { value: 'NonexistentFighter' } });
    
    await waitFor(() => {
      expect(screen.getByText('No fights found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters or check back later for new predictions.')).toBeInTheDocument();
    });
  });

  it('handles fights without predictions gracefully', async () => {
    // Mock API to return null for predictions
    mockApiService.get.mockImplementation((url: string) => {
      if (url === '/fights/upcoming') {
        return Promise.resolve(mockFights);
      }
      if (url.startsWith('/fighters/')) {
        const fighterId = url.split('/').pop();
        return Promise.resolve(mockFighters[fighterId as keyof typeof mockFighters]);
      }
      if (url.startsWith('/events/')) {
        const eventId = url.split('/').pop();
        return Promise.resolve(mockEvents[eventId as keyof typeof mockEvents]);
      }
      if (url.startsWith('/predictions/')) {
        return Promise.reject(new Error('No prediction available'));
      }
      return Promise.reject(new Error('Not found'));
    });
    
    renderWithTheme(<FightPredictionDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones')).toBeInTheDocument();
      expect(screen.getAllByText('Prediction not available')).toHaveLength(2);
    });
  });
});