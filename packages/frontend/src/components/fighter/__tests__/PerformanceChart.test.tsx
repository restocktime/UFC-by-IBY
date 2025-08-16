import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { FormIndicator } from '@ufc-platform/shared';
import { PerformanceChart } from '../PerformanceChart';
import theme from '../../../theme';
import { vi } from 'vitest';

// Mock recharts to avoid canvas rendering issues in tests
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: ({ dataKey }: any) => <div data-testid="x-axis">{dataKey}</div>,
  YAxis: ({ domain }: any) => <div data-testid="y-axis">{domain?.join('-')}</div>,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: ({ content }: any) => <div data-testid="tooltip">{content?.name}</div>,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
}));

const mockRecentForm: FormIndicator[] = [
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
    result: 'loss',
    performance: 65,
  },
];

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('PerformanceChart', () => {
  it('renders chart components when data is available', () => {
    renderWithTheme(<PerformanceChart recentForm={mockRecentForm} />);
    
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line')).toBeInTheDocument();
    expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    expect(screen.getByTestId('y-axis')).toBeInTheDocument();
    expect(screen.getByTestId('grid')).toBeInTheDocument();
  });

  it('displays no data message when recentForm is empty', () => {
    renderWithTheme(<PerformanceChart recentForm={[]} />);
    
    expect(screen.getByText('No recent performance data available')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });

  it('sets correct Y-axis domain', () => {
    renderWithTheme(<PerformanceChart recentForm={mockRecentForm} />);
    
    expect(screen.getByText('0-100')).toBeInTheDocument();
  });

  it('uses fight as X-axis data key', () => {
    renderWithTheme(<PerformanceChart recentForm={mockRecentForm} />);
    
    expect(screen.getByText('fight')).toBeInTheDocument();
  });

  it('handles single data point', () => {
    const singleForm: FormIndicator[] = [
      {
        fightId: 'fight-1',
        date: new Date('2023-03-04'),
        result: 'win',
        performance: 85,
      },
    ];

    renderWithTheme(<PerformanceChart recentForm={singleForm} />);
    
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.queryByText('No recent performance data available')).not.toBeInTheDocument();
  });

  it('handles multiple data points with different results', () => {
    const mixedResults: FormIndicator[] = [
      {
        fightId: 'fight-1',
        date: new Date('2023-03-04'),
        result: 'win',
        performance: 85,
      },
      {
        fightId: 'fight-2',
        date: new Date('2023-01-15'),
        result: 'loss',
        performance: 45,
      },
      {
        fightId: 'fight-3',
        date: new Date('2022-12-10'),
        result: 'draw',
        performance: 70,
      },
    ];

    renderWithTheme(<PerformanceChart recentForm={mixedResults} />);
    
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });
});