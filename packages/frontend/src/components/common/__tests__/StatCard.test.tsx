import { render, screen } from '../../../test/test-utils';
import { StatCard } from '../StatCard';
import { Sports as SportsIcon } from '@mui/icons-material';

describe('StatCard', () => {
  it('renders basic stat card', () => {
    render(
      <StatCard
        title="Test Stat"
        value="123"
      />
    );

    expect(screen.getByText('Test Stat')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('renders with subtitle and icon', () => {
    render(
      <StatCard
        title="Test Stat"
        value="456"
        subtitle="Test subtitle"
        icon={<SportsIcon data-testid="sports-icon" />}
      />
    );

    expect(screen.getByText('Test subtitle')).toBeInTheDocument();
    expect(screen.getByTestId('sports-icon')).toBeInTheDocument();
  });

  it('renders with positive trend', () => {
    render(
      <StatCard
        title="Test Stat"
        value="789"
        trend={{ value: 5.2, isPositive: true }}
      />
    );

    expect(screen.getByText('+5.2%')).toBeInTheDocument();
  });

  it('renders with negative trend', () => {
    render(
      <StatCard
        title="Test Stat"
        value="789"
        trend={{ value: -3.1, isPositive: false }}
      />
    );

    expect(screen.getByText('-3.1%')).toBeInTheDocument();
  });
});