import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { FightRecord } from '@ufc-platform/shared';
import { RecordChart } from '../RecordChart';
import theme from '../../../theme';
import { vi } from 'vitest';

// Mock recharts to avoid canvas rendering issues in tests
vi.mock('recharts', () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ data }: any) => <div data-testid="pie">{data?.length} segments</div>,
  Cell: () => <div data-testid="cell" />,
  Tooltip: ({ content }: any) => <div data-testid="tooltip">{content?.name}</div>,
  Legend: ({ content }: any) => <div data-testid="legend">{content?.name}</div>,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
}));

const mockRecord: FightRecord = {
  wins: 26,
  losses: 1,
  draws: 0,
  noContests: 1,
};

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('RecordChart', () => {
  it('renders chart components when data is available', () => {
    renderWithTheme(<RecordChart record={mockRecord} />);
    
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    expect(screen.getByTestId('pie')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('filters out categories with zero values', () => {
    const recordWithZeros: FightRecord = {
      wins: 10,
      losses: 2,
      draws: 0, // This should be filtered out
      noContests: 0, // This should be filtered out
    };

    renderWithTheme(<RecordChart record={recordWithZeros} />);
    
    // Should only show 2 segments (wins and losses)
    expect(screen.getByText('2 segments')).toBeInTheDocument();
  });

  it('includes all categories when they have values', () => {
    const fullRecord: FightRecord = {
      wins: 15,
      losses: 3,
      draws: 1,
      noContests: 1,
    };

    renderWithTheme(<RecordChart record={fullRecord} />);
    
    // Should show 4 segments (all categories)
    expect(screen.getByText('4 segments')).toBeInTheDocument();
  });

  it('displays no data message when all values are zero', () => {
    const emptyRecord: FightRecord = {
      wins: 0,
      losses: 0,
      draws: 0,
      noContests: 0,
    };

    renderWithTheme(<RecordChart record={emptyRecord} />);
    
    expect(screen.getByText('No fight record data available')).toBeInTheDocument();
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
  });

  it('handles record with only wins', () => {
    const winsOnlyRecord: FightRecord = {
      wins: 5,
      losses: 0,
      draws: 0,
      noContests: 0,
    };

    renderWithTheme(<RecordChart record={winsOnlyRecord} />);
    
    // Should show 1 segment (only wins)
    expect(screen.getByText('1 segments')).toBeInTheDocument();
  });

  it('handles record with only losses', () => {
    const lossesOnlyRecord: FightRecord = {
      wins: 0,
      losses: 3,
      draws: 0,
      noContests: 0,
    };

    renderWithTheme(<RecordChart record={lossesOnlyRecord} />);
    
    // Should show 1 segment (only losses)
    expect(screen.getByText('1 segments')).toBeInTheDocument();
  });

  it('handles record with draws only', () => {
    const drawsOnlyRecord: FightRecord = {
      wins: 0,
      losses: 0,
      draws: 2,
      noContests: 0,
    };

    renderWithTheme(<RecordChart record={drawsOnlyRecord} />);
    
    // Should show 1 segment (only draws)
    expect(screen.getByText('1 segments')).toBeInTheDocument();
  });

  it('handles record with no contests only', () => {
    const noContestsOnlyRecord: FightRecord = {
      wins: 0,
      losses: 0,
      draws: 0,
      noContests: 1,
    };

    renderWithTheme(<RecordChart record={noContestsOnlyRecord} />);
    
    // Should show 1 segment (only no contests)
    expect(screen.getByText('1 segments')).toBeInTheDocument();
  });
});