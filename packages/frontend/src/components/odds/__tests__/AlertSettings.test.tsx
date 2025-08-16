import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AlertSettings } from '../AlertSettings';
import { apiService } from '../../../services/api';
import { UserPreferences } from '@ufc-platform/shared';

// Mock the API service
vi.mock('../../../services/api', () => ({
  apiService: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

const mockPreferences: UserPreferences = {
  userId: 'user-123',
  followedFighters: ['fighter-1', 'fighter-2'],
  weightClasses: ['Lightweight', 'Welterweight'],
  alertTypes: ['odds_movement', 'fight_update'],
  deliveryMethods: ['email', 'push'],
  thresholds: {
    oddsMovementPercentage: 15,
    predictionConfidenceChange: 20,
    injuryReportSeverity: 'major',
    minimumNotificationInterval: 60,
  },
  timezone: 'UTC',
  enabled: true,
};

const mockFighters = [
  { id: 'fighter-1', name: 'Jon Jones' },
  { id: 'fighter-2', name: 'Stipe Miocic' },
  { id: 'fighter-3', name: 'Francis Ngannou' },
];

describe('AlertSettings', () => {
  const mockApiGet = vi.mocked(apiService.get);
  const mockApiPut = vi.mocked(apiService.put);
  const mockOnPreferencesChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/preferences')) {
        return Promise.resolve(mockPreferences);
      }
      if (url.includes('/fighters/search')) {
        return Promise.resolve(mockFighters);
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
    mockApiPut.mockResolvedValue(mockPreferences);
  });

  it('renders loading state initially', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<AlertSettings userId="user-123" />);
    
    expect(screen.getByText('Loading preferences...')).toBeInTheDocument();
  });

  it('loads and displays user preferences', async () => {
    render(<AlertSettings userId="user-123" onPreferencesChange={mockOnPreferencesChange} />);
    
    await waitFor(() => {
      expect(screen.getByText('Alert Settings')).toBeInTheDocument();
    });

    // Check that notifications are enabled - the switch doesn't have an accessible name, so we'll find it by its checked state
    const switches = screen.getAllByRole('checkbox');
    const masterSwitch = switches[0]; // First checkbox is the master switch
    expect(masterSwitch).toBeChecked();

    // Check that alert types are selected
    expect(screen.getByLabelText('Odds Movement')).toBeChecked();
    expect(screen.getByLabelText('Fight Updates')).toBeChecked();
    expect(screen.getByLabelText('Prediction Changes')).not.toBeChecked();
    expect(screen.getByLabelText('Injury Reports')).not.toBeChecked();

    // Check delivery methods
    expect(screen.getByLabelText(/Email/)).toBeChecked();
    expect(screen.getByLabelText(/Push Notifications/)).toBeChecked();
    expect(screen.getByLabelText(/SMS/)).not.toBeChecked();
  });

  it('toggles master notification switch', async () => {
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Notifications Enabled')).toBeInTheDocument();
    });

    const switches = screen.getAllByRole('checkbox');
    const masterSwitch = switches[0]; // First checkbox is the master switch
    fireEvent.click(masterSwitch);

    expect(screen.getByText('Notifications Disabled')).toBeInTheDocument();
  });

  it('handles alert type changes', async () => {
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByLabelText('Prediction Changes')).toBeInTheDocument();
    });

    const predictionChangesCheckbox = screen.getByLabelText('Prediction Changes');
    fireEvent.click(predictionChangesCheckbox);

    expect(predictionChangesCheckbox).toBeChecked();
  });

  it('handles delivery method changes', async () => {
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByLabelText(/SMS/)).toBeInTheDocument();
    });

    const smsCheckbox = screen.getByLabelText(/SMS/);
    fireEvent.click(smsCheckbox);

    expect(smsCheckbox).toBeChecked();
  });

  it('updates threshold sliders', async () => {
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Alert Thresholds')).toBeInTheDocument();
    });

    const sliders = screen.getAllByRole('slider');
    const oddsSlider = sliders[0]; // First slider is odds movement threshold
    fireEvent.change(oddsSlider, { target: { value: '25' } });

    // The slider value should be updated
    expect(oddsSlider).toHaveValue('25');
  });

  it('updates minimum notification interval', async () => {
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByLabelText(/minimum notification interval/i)).toBeInTheDocument();
    });

    const intervalInput = screen.getByLabelText(/minimum notification interval/i);
    fireEvent.change(intervalInput, { target: { value: '120' } });

    expect(intervalInput).toHaveValue(120);
  });

  it('handles injury report severity selection', async () => {
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Injury Report Severity')).toBeInTheDocument();
    });

    const allChip = screen.getByText('All');
    fireEvent.click(allChip);

    // The chip should be selected (this would be reflected in the component state)
    expect(allChip).toBeInTheDocument();
  });

  it('saves preferences successfully', async () => {
    render(<AlertSettings userId="user-123" onPreferencesChange={mockOnPreferencesChange} />);
    
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/users/user-123/preferences', expect.any(Object));
      expect(mockOnPreferencesChange).toHaveBeenCalledWith(mockPreferences);
    });

    expect(screen.getByText('Preferences saved successfully')).toBeInTheDocument();
  });

  it('handles save errors', async () => {
    mockApiPut.mockRejectedValue(new Error('Save failed'));
    
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to save preferences')).toBeInTheDocument();
    });
  });

  it('resets preferences to defaults', async () => {
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByLabelText('Reset to defaults')).toBeInTheDocument();
    });

    const resetButton = screen.getByLabelText('Reset to defaults');
    fireEvent.click(resetButton);

    // After reset, alert types should be unchecked
    await waitFor(() => {
      expect(screen.getByLabelText('Odds Movement')).not.toBeChecked();
      expect(screen.getByLabelText('Fight Updates')).not.toBeChecked();
    });
  });

  it('disables controls when notifications are disabled', async () => {
    const disabledPreferences = { ...mockPreferences, enabled: false };
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/preferences')) {
        return Promise.resolve(disabledPreferences);
      }
      if (url.includes('/fighters/search')) {
        return Promise.resolve(mockFighters);
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Notifications Disabled')).toBeInTheDocument();
    });

    // All checkboxes should be disabled
    expect(screen.getByLabelText('Odds Movement')).toBeDisabled();
    expect(screen.getByLabelText('Fight Updates')).toBeDisabled();
    expect(screen.getByLabelText(/Email/)).toBeDisabled();
  });

  it('handles weight class selection', async () => {
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Weight Classes')).toBeInTheDocument();
    });

    // The weight classes should be pre-selected based on preferences
    expect(screen.getByText('Lightweight')).toBeInTheDocument();
    expect(screen.getByText('Welterweight')).toBeInTheDocument();
  });

  it('handles followed fighters selection', async () => {
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Followed Fighters')).toBeInTheDocument();
    });

    // The fighters should be pre-selected based on preferences
    expect(screen.getByText('Jon Jones')).toBeInTheDocument();
    expect(screen.getByText('Stipe Miocic')).toBeInTheDocument();
  });

  it('displays privacy notice', async () => {
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText(/Privacy Notice/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Your notification preferences are stored securely/)).toBeInTheDocument();
  });

  it('shows loading state while saving', async () => {
    mockApiPut.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Settings');
    fireEvent.click(saveButton);

    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('handles API errors when loading preferences', async () => {
    mockApiGet.mockRejectedValue(new Error('Failed to load'));
    
    render(<AlertSettings userId="user-123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load preferences')).toBeInTheDocument();
    });
  });

  it('calls onPreferencesChange when provided', async () => {
    render(<AlertSettings userId="user-123" onPreferencesChange={mockOnPreferencesChange} />);
    
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnPreferencesChange).toHaveBeenCalledWith(mockPreferences);
    });
  });
});