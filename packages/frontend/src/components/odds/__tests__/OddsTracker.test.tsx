import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OddsTracker } from '../OddsTracker';
import { apiService } from '../../../services/api';

// Mock the API service
vi.mock('../../../services/api', () => ({
  apiService: {
    get: vi.fn(),
  },
}));

// Mock recharts
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Legend: () => <div data-testid="legend" />,
}));

const mockOddsData = [
  {
    fightId: 'fight-1',
    fighter1Name: 'Jon Jones',
    fighter2Name: 'Stipe Miocic',
    currentOdds: [
      {
        fightId: 'fight-1',
        sportsbook: 'DraftKings',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        moneyline: { fighter1: -150, fighter2: +130 },
        method: { ko: +200, submission: +400, decision: +150 },
        rounds: { round1: +800, round2: +400, round3: +300 }
      },
      {
        fightId: 'fight-1',
        sportsbook: 'FanDuel',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        moneyline: { fighter1: -145, fighter2: +125 },
        method: { ko: +190, submission: +380, decision: +160 },
        rounds: { round1: +750, round2: +380, round3: +290 }
      }
    ],
    movements: [
      {
        fightId: 'fight-1',
        movementType: 'significant' as const,
        oldOdds: {
          fightId: 'fight-1',
          sportsbook: 'DraftKings',
          timestamp: new Date('2024-01-15T09:00:00Z'),
          moneyline: { fighter1: -140, fighter2: +120 },
          method: { ko: +210, submission: +420, decision: +140 },
          rounds: { round1: +820, round2: +420, round3: +310 }
        },
        newOdds: {
          fightId: 'fight-1',
          sportsbook: 'DraftKings',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          moneyline: { fighter1: -150, fighter2: +130 },
          method: { ko: +200, submission: +400, decision: +150 },
          rounds: { round1: +800, round2: +400, round3: +300 }
        },
        percentageChange: 7.1,
        timestamp: new Date('2024-01-15T10:00:00Z')
      }
    ],
    chartData: [
      {
        timestamp: '2024-01-15T09:00:00Z',
        fighter1Odds: -140,
        fighter2Odds: +120,
        sportsbook: 'DraftKings'
      },
      {
        timestamp: '2024-01-15T10:00:00Z',
        fighter1Odds: -150,
        fighter2Odds: +130,
        sportsbook: 'DraftKings'
      }
    ]
  }
];

describe('OddsTracker', () => {
  const mockApiGet = vi.mocked(apiService.get);

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(mockOddsData);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('renders loading state initially', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<OddsTracker />);
    
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders odds data after loading', async () => {
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(screen.getByText('Real-time Odds Tracker')).toBeInTheDocument();
    });

    expect(screen.getByText('Jon Jones vs Stipe Miocic')).toBeInTheDocument();
    expect(screen.getAllByText('-150')).toHaveLength(2); // Appears in card and table
    expect(screen.getAllByText('+130')).toHaveLength(2); // Appears in card and table
  });

  it('displays implied probabilities correctly', async () => {
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(screen.getByText('60.0%')).toBeInTheDocument(); // -150 odds
      expect(screen.getByText('43.5%')).toBeInTheDocument(); // +130 odds
    });
  });

  it('shows odds movement indicators', async () => {
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(screen.getByText('7.1% movement')).toBeInTheDocument();
    });
  });

  it('renders odds chart when fight is selected', async () => {
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });
  });

  it('displays current odds table', async () => {
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(screen.getByText('Current Odds by Sportsbook')).toBeInTheDocument();
      expect(screen.getByText('DraftKings')).toBeInTheDocument();
      expect(screen.getByText('FanDuel')).toBeInTheDocument();
    });
  });

  it('shows recent movements table', async () => {
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(screen.getByText('Recent Odds Movements')).toBeInTheDocument();
      expect(screen.getByText('+7.1%')).toBeInTheDocument();
    });
  });

  it('handles refresh button click', async () => {
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(screen.getByText('Real-time Odds Tracker')).toBeInTheDocument();
    });

    const refreshButton = screen.getByLabelText('Refresh odds');
    fireEvent.click(refreshButton);

    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('handles API errors gracefully', async () => {
    mockApiGet.mockRejectedValue(new Error('API Error'));
    
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch odds data')).toBeInTheDocument();
    });
  });

  it('formats odds correctly', async () => {
    render(<OddsTracker />);
    
    await waitFor(() => {
      // Negative odds should show as-is (appears in multiple places)
      expect(screen.getAllByText('-150').length).toBeGreaterThan(0);
      // Positive odds should have + prefix (appears in multiple places)
      expect(screen.getAllByText('+130').length).toBeGreaterThan(0);
    });
  });

  it('handles fight selection', async () => {
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(screen.getByText('Jon Jones vs Stipe Miocic')).toBeInTheDocument();
    });

    const fightCard = screen.getByText('Jon Jones vs Stipe Miocic').closest('.MuiCard-root');
    if (fightCard) {
      fireEvent.click(fightCard);
    }

    // Should still show the same fight since it's the only one
    expect(screen.getByText('Odds Movement - Jon Jones vs Stipe Miocic')).toBeInTheDocument();
  });

  it('shows no movements message when no movements exist', async () => {
    const dataWithoutMovements = [{
      ...mockOddsData[0],
      movements: []
    }];
    mockApiGet.mockResolvedValue(dataWithoutMovements);
    
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(screen.getByText('No recent movements detected')).toBeInTheDocument();
    });
  });

  it('fetches specific fight data when fightId prop is provided', async () => {
    render(<OddsTracker fightId="fight-1" />);
    
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/odds/fight/fight-1');
    });
  });

  it('fetches upcoming fights when no fightId is provided', async () => {
    render(<OddsTracker />);
    
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/odds/upcoming');
    });
  });

  it('sets up auto-refresh when enabled', async () => {
    vi.useFakeTimers();
    
    render(<OddsTracker autoRefresh={true} refreshInterval={5000} />);
    
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });

    // Fast-forward time
    vi.advanceTimersByTime(5000);
    
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });

    vi.useRealTimers();
  });

  it('does not set up auto-refresh when disabled', async () => {
    vi.useFakeTimers();
    
    render(<OddsTracker autoRefresh={false} />);
    
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });

    // Fast-forward time
    vi.advanceTimersByTime(30000);
    
    // Should still only be called once
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});