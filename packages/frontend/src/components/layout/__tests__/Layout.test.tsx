import { render, screen } from '../../../test/test-utils';
import { Layout } from '../Layout';

describe('Layout', () => {
  it('renders with default title', () => {
    render(
      <Layout>
        <div>Test content</div>
      </Layout>
    );

    expect(screen.getByText('UFC Prediction Platform')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders with custom title', () => {
    render(
      <Layout title="Custom Title">
        <div>Test content</div>
      </Layout>
    );

    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  it('renders navigation and notification center', () => {
    render(
      <Layout>
        <div>Test content</div>
      </Layout>
    );

    // Check for navigation items
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Fighters')).toBeInTheDocument();
    expect(screen.getByText('Predictions')).toBeInTheDocument();
    expect(screen.getByText('Odds Tracker')).toBeInTheDocument();

    // Check for notification center
    expect(screen.getByLabelText('notifications')).toBeInTheDocument();
  });
});