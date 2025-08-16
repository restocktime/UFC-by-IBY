import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Switch,
  Slider,
  TextField,
  Button,
  Chip,
  Autocomplete,
  Alert,
  Snackbar,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Notifications,
  NotificationsOff,
  Save,
  Restore,
  Info,
} from '@mui/icons-material';
import { apiService } from '../../services/api';
import { UserPreferences, AlertType, DeliveryMethod, WeightClass } from '@ufc-platform/shared';

interface AlertSettingsProps {
  userId: string;
  onPreferencesChange?: (preferences: UserPreferences) => void;
}

const WEIGHT_CLASSES: WeightClass[] = [
  'Flyweight',
  'Bantamweight', 
  'Featherweight',
  'Lightweight',
  'Welterweight',
  'Middleweight',
  'Light Heavyweight',
  'Heavyweight',
  'Women\'s Strawweight',
  'Women\'s Flyweight',
  'Women\'s Bantamweight',
  'Women\'s Featherweight',
];

const ALERT_TYPES: { value: AlertType; label: string; description: string }[] = [
  {
    value: 'odds_movement',
    label: 'Odds Movement',
    description: 'Get notified when betting lines move significantly'
  },
  {
    value: 'fight_update',
    label: 'Fight Updates',
    description: 'Notifications about fight card changes, cancellations, etc.'
  },
  {
    value: 'prediction_change',
    label: 'Prediction Changes',
    description: 'Alerts when AI predictions change significantly'
  },
  {
    value: 'injury_report',
    label: 'Injury Reports',
    description: 'Updates about fighter injuries and medical suspensions'
  },
];

const DELIVERY_METHODS: { value: DeliveryMethod; label: string; icon: string }[] = [
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'push', label: 'Push Notifications', icon: '🔔' },
  { value: 'sms', label: 'SMS', icon: '📱' },
];

export const AlertSettings: React.FC<AlertSettingsProps> = ({
  userId,
  onPreferencesChange,
}) => {
  const [preferences, setPreferences] = useState<UserPreferences>({
    userId,
    followedFighters: [],
    weightClasses: [],
    alertTypes: [],
    deliveryMethods: [],
    thresholds: {
      oddsMovementPercentage: 10,
      predictionConfidenceChange: 15,
      injuryReportSeverity: 'major',
      minimumNotificationInterval: 30,
    },
    timezone: 'UTC',
    enabled: true,
  });

  const [fighters, setFighters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchPreferences();
    fetchFighters();
  }, [userId]);

  const fetchPreferences = async () => {
    try {
      const response = await apiService.get<UserPreferences>(`/users/${userId}/preferences`);
      setPreferences(response);
    } catch (error) {
      console.error('Error fetching preferences:', error);
      setMessage({ type: 'error', text: 'Failed to load preferences' });
    } finally {
      setLoading(false);
    }
  };

  const fetchFighters = async () => {
    try {
      const response = await apiService.get<{ id: string; name: string }[]>('/fighters/search');
      setFighters(response);
    } catch (error) {
      console.error('Error fetching fighters:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedPreferences = await apiService.put<UserPreferences>(
        `/users/${userId}/preferences`,
        preferences
      );
      setPreferences(updatedPreferences);
      setMessage({ type: 'success', text: 'Preferences saved successfully' });
      onPreferencesChange?.(updatedPreferences);
    } catch (error) {
      console.error('Error saving preferences:', error);
      setMessage({ type: 'error', text: 'Failed to save preferences' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPreferences({
      ...preferences,
      alertTypes: [],
      deliveryMethods: [],
      weightClasses: [],
      followedFighters: [],
      thresholds: {
        oddsMovementPercentage: 10,
        predictionConfidenceChange: 15,
        injuryReportSeverity: 'major',
        minimumNotificationInterval: 30,
      },
    });
  };

  const updatePreferences = (updates: Partial<UserPreferences>) => {
    setPreferences(prev => ({ ...prev, ...updates }));
  };

  const updateThresholds = (updates: Partial<UserPreferences['thresholds']>) => {
    setPreferences(prev => ({
      ...prev,
      thresholds: { ...prev.thresholds, ...updates }
    }));
  };

  const handleAlertTypeChange = (alertType: AlertType, checked: boolean) => {
    const newAlertTypes = checked
      ? [...preferences.alertTypes, alertType]
      : preferences.alertTypes.filter(type => type !== alertType);
    updatePreferences({ alertTypes: newAlertTypes });
  };

  const handleDeliveryMethodChange = (method: DeliveryMethod, checked: boolean) => {
    const newMethods = checked
      ? [...preferences.deliveryMethods, method]
      : preferences.deliveryMethods.filter(m => m !== method);
    updatePreferences({ deliveryMethods: newMethods });
  };

  if (loading) {
    return <Box>Loading preferences...</Box>;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" component="h2">
          Alert Settings
        </Typography>
        <Box display="flex" gap={1}>
          <Tooltip title="Reset to defaults">
            <IconButton onClick={handleReset}>
              <Restore />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Master Toggle */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box display="flex" alignItems="center" gap={2}>
                  {preferences.enabled ? <Notifications color="primary" /> : <NotificationsOff />}
                  <Box>
                    <Typography variant="h6">
                      Notifications {preferences.enabled ? 'Enabled' : 'Disabled'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Master switch for all notifications
                    </Typography>
                  </Box>
                </Box>
                <Switch
                  checked={preferences.enabled}
                  onChange={(e) => updatePreferences({ enabled: e.target.checked })}
                  size="large"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Alert Types */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Alert Types
              </Typography>
              <FormControl component="fieldset" fullWidth>
                <FormGroup>
                  {ALERT_TYPES.map((alertType) => (
                    <Box key={alertType.value} mb={2}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={preferences.alertTypes.includes(alertType.value)}
                            onChange={(e) => handleAlertTypeChange(alertType.value, e.target.checked)}
                            disabled={!preferences.enabled}
                          />
                        }
                        label={alertType.label}
                      />
                      <Typography variant="caption" display="block" color="text.secondary" ml={4}>
                        {alertType.description}
                      </Typography>
                    </Box>
                  ))}
                </FormGroup>
              </FormControl>
            </CardContent>
          </Card>
        </Grid>

        {/* Delivery Methods */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Delivery Methods
              </Typography>
              <FormControl component="fieldset" fullWidth>
                <FormGroup>
                  {DELIVERY_METHODS.map((method) => (
                    <FormControlLabel
                      key={method.value}
                      control={
                        <Checkbox
                          checked={preferences.deliveryMethods.includes(method.value)}
                          onChange={(e) => handleDeliveryMethodChange(method.value, e.target.checked)}
                          disabled={!preferences.enabled}
                        />
                      }
                      label={
                        <Box display="flex" alignItems="center" gap={1}>
                          <span>{method.icon}</span>
                          {method.label}
                        </Box>
                      }
                    />
                  ))}
                </FormGroup>
              </FormControl>
            </CardContent>
          </Card>
        </Grid>

        {/* Thresholds */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Alert Thresholds
              </Typography>
              
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <FormLabel>Odds Movement Threshold (%)</FormLabel>
                    <Box px={2}>
                      <Slider
                        value={preferences.thresholds.oddsMovementPercentage}
                        onChange={(_, value) => updateThresholds({ oddsMovementPercentage: value as number })}
                        min={1}
                        max={50}
                        step={1}
                        marks={[
                          { value: 5, label: '5%' },
                          { value: 10, label: '10%' },
                          { value: 25, label: '25%' },
                          { value: 50, label: '50%' },
                        ]}
                        valueLabelDisplay="on"
                        disabled={!preferences.enabled}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <FormLabel>Prediction Confidence Change (%)</FormLabel>
                    <Box px={2}>
                      <Slider
                        value={preferences.thresholds.predictionConfidenceChange}
                        onChange={(_, value) => updateThresholds({ predictionConfidenceChange: value as number })}
                        min={1}
                        max={50}
                        step={1}
                        marks={[
                          { value: 5, label: '5%' },
                          { value: 15, label: '15%' },
                          { value: 30, label: '30%' },
                          { value: 50, label: '50%' },
                        ]}
                        valueLabelDisplay="on"
                        disabled={!preferences.enabled}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Minimum Notification Interval (minutes)"
                    type="number"
                    value={preferences.thresholds.minimumNotificationInterval}
                    onChange={(e) => updateThresholds({ minimumNotificationInterval: parseInt(e.target.value) || 30 })}
                    inputProps={{ min: 1, max: 1440 }}
                    disabled={!preferences.enabled}
                    helperText="Minimum time between notifications for the same event"
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <FormLabel>Injury Report Severity</FormLabel>
                    <Box mt={1}>
                      <Chip
                        label="Minor"
                        variant={preferences.thresholds.injuryReportSeverity === 'minor' ? 'filled' : 'outlined'}
                        onClick={() => updateThresholds({ injuryReportSeverity: 'minor' })}
                        disabled={!preferences.enabled}
                        sx={{ mr: 1 }}
                      />
                      <Chip
                        label="Major"
                        variant={preferences.thresholds.injuryReportSeverity === 'major' ? 'filled' : 'outlined'}
                        onClick={() => updateThresholds({ injuryReportSeverity: 'major' })}
                        disabled={!preferences.enabled}
                        sx={{ mr: 1 }}
                      />
                      <Chip
                        label="All"
                        variant={preferences.thresholds.injuryReportSeverity === 'all' ? 'filled' : 'outlined'}
                        onClick={() => updateThresholds({ injuryReportSeverity: 'all' })}
                        disabled={!preferences.enabled}
                      />
                    </Box>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Weight Classes */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Weight Classes
              </Typography>
              <Autocomplete
                multiple
                options={WEIGHT_CLASSES}
                value={preferences.weightClasses}
                onChange={(_, newValue) => updatePreferences({ weightClasses: newValue })}
                disabled={!preferences.enabled}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Select weight classes to follow"
                    helperText="Only receive alerts for fights in these weight classes"
                  />
                )}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Followed Fighters */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Followed Fighters
              </Typography>
              <Autocomplete
                multiple
                options={fighters}
                getOptionLabel={(option) => option.name}
                value={fighters.filter(f => preferences.followedFighters.includes(f.id))}
                onChange={(_, newValue) => updatePreferences({ 
                  followedFighters: newValue.map(f => f.id) 
                })}
                disabled={!preferences.enabled}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip variant="outlined" label={option.name} {...getTagProps({ index })} />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Search and select fighters to follow"
                    helperText="Get priority alerts for these fighters"
                  />
                )}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Info Card */}
        <Grid item xs={12}>
          <Alert severity="info" icon={<Info />}>
            <Typography variant="body2">
              <strong>Privacy Notice:</strong> Your notification preferences are stored securely and only used to deliver relevant alerts. 
              You can modify or disable notifications at any time. We never share your preferences with third parties.
            </Typography>
          </Alert>
        </Grid>
      </Grid>

      <Snackbar
        open={!!message}
        autoHideDuration={6000}
        onClose={() => setMessage(null)}
      >
        {message && (
          <Alert severity={message.type} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
};