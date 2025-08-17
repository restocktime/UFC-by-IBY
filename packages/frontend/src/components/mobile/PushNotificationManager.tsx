import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Button,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
} from '@mui/material';
import {
  Notifications,
  NotificationsOff,
  Settings,
  TrendingUp,
  Timeline,
  Sports,
  Warning,
} from '@mui/icons-material';

interface NotificationSettings {
  enabled: boolean;
  oddsMovement: {
    enabled: boolean;
    threshold: number; // percentage change
  };
  bettingOpportunities: {
    enabled: boolean;
    minExpectedValue: number;
  };
  fightUpdates: {
    enabled: boolean;
    liveOnly: boolean;
  };
  arbitrageAlerts: {
    enabled: boolean;
    minProfit: number;
  };
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
}

interface PendingNotification {
  id: string;
  type: 'odds_movement' | 'betting_opportunity' | 'fight_update' | 'arbitrage';
  title: string;
  message: string;
  timestamp: string;
  data?: any;
}

export const PushNotificationManager: React.FC = () => {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: false,
    oddsMovement: {
      enabled: true,
      threshold: 10,
    },
    bettingOpportunities: {
      enabled: true,
      minExpectedValue: 5,
    },
    fightUpdates: {
      enabled: true,
      liveOnly: false,
    },
    arbitrageAlerts: {
      enabled: true,
      minProfit: 2,
    },
    quietHours: {
      enabled: false,
      startTime: '22:00',
      endTime: '08:00',
    },
  });
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [pendingNotifications, setPendingNotifications] = useState<PendingNotification[]>([]);
  const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    checkNotificationPermission();
    loadSettings();
    registerServiceWorker();
    loadPendingNotifications();
  }, []);

  const checkNotificationPermission = () => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        setSettings(prev => ({ ...prev, enabled: true }));
        saveSettings({ ...settings, enabled: true });
      }
    }
  };

  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        setServiceWorkerRegistration(registration);
        
        // Subscribe to push notifications
        if (settings.enabled && notificationPermission === 'granted') {
          subscribeToPush(registration);
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  };

  const subscribeToPush = async (registration: ServiceWorkerRegistration) => {
    try {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.REACT_APP_VAPID_PUBLIC_KEY,
      });
      
      // Send subscription to server
      // await apiService.post('/notifications/subscribe', subscription);
      console.log('Push subscription successful:', subscription);
    } catch (error) {
      console.error('Push subscription failed:', error);
    }
  };

  const loadSettings = () => {
    const saved = localStorage.getItem('notificationSettings');
    if (saved) {
      try {
        const parsedSettings = JSON.parse(saved);
        setSettings(parsedSettings);
      } catch (error) {
        console.error('Failed to load notification settings:', error);
      }
    }
  };

  const saveSettings = (newSettings: NotificationSettings) => {
    localStorage.setItem('notificationSettings', JSON.stringify(newSettings));
    setSettings(newSettings);
  };

  const loadPendingNotifications = () => {
    const saved = localStorage.getItem('pendingNotifications');
    if (saved) {
      try {
        const notifications = JSON.parse(saved);
        setPendingNotifications(notifications);
      } catch (error) {
        console.error('Failed to load pending notifications:', error);
      }
    }
  };

  const showNotification = (notification: PendingNotification) => {
    if (notificationPermission === 'granted' && settings.enabled) {
      // Check quiet hours
      if (settings.quietHours.enabled) {
        const now = new Date();
        const currentTime = now.getHours() * 100 + now.getMinutes();
        const startTime = parseInt(settings.quietHours.startTime.replace(':', ''));
        const endTime = parseInt(settings.quietHours.endTime.replace(':', ''));
        
        if (startTime > endTime) {
          // Quiet hours span midnight
          if (currentTime >= startTime || currentTime <= endTime) {
            return; // Don't show notification during quiet hours
          }
        } else {
          // Normal quiet hours
          if (currentTime >= startTime && currentTime <= endTime) {
            return; // Don't show notification during quiet hours
          }
        }
      }

      new Notification(notification.title, {
        body: notification.message,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: notification.type,
        data: notification.data,
        requireInteraction: notification.type === 'arbitrage' || notification.type === 'betting_opportunity',
      });
    } else {
      // Store for later if notifications are disabled
      const updated = [...pendingNotifications, notification];
      setPendingNotifications(updated);
      localStorage.setItem('pendingNotifications', JSON.stringify(updated));
    }
  };

  const clearPendingNotifications = () => {
    setPendingNotifications([]);
    localStorage.removeItem('pendingNotifications');
  };

  const handleSettingChange = (path: string, value: any) => {
    const keys = path.split('.');
    const newSettings = { ...settings };
    let current: any = newSettings;
    
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    saveSettings(newSettings);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'odds_movement':
        return <Timeline />;
      case 'betting_opportunity':
        return <TrendingUp />;
      case 'fight_update':
        return <Sports />;
      case 'arbitrage':
        return <Warning />;
      default:
        return <Notifications />;
    }
  };

  // Simulate receiving notifications (in real app, this would come from WebSocket/Push)
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.1) { // 10% chance every 30 seconds
        const mockNotification: PendingNotification = {
          id: Date.now().toString(),
          type: 'odds_movement',
          title: 'Odds Movement Alert',
          message: 'Jones vs Miocic odds moved 15%',
          timestamp: new Date().toISOString(),
        };
        showNotification(mockNotification);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [settings, notificationPermission]);

  return (
    <Box>
      {/* Notification Permission Status */}
      {notificationPermission === 'default' && (
        <Alert 
          severity="info" 
          action={
            <Button color="inherit" size="small" onClick={requestNotificationPermission}>
              Enable
            </Button>
          }
          sx={{ mb: 2 }}
        >
          Enable notifications to receive real-time betting alerts
        </Alert>
      )}

      {notificationPermission === 'denied' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Notifications are blocked. Enable them in your browser settings to receive alerts.
        </Alert>
      )}

      {/* Main Settings */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Push Notifications
            </Typography>
            <Button
              size="small"
              startIcon={<Settings />}
              onClick={() => setSettingsDialogOpen(true)}
            >
              Settings
            </Button>
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={settings.enabled && notificationPermission === 'granted'}
                onChange={(e) => {
                  if (e.target.checked && notificationPermission !== 'granted') {
                    requestNotificationPermission();
                  } else {
                    handleSettingChange('enabled', e.target.checked);
                  }
                }}
                disabled={notificationPermission === 'denied'}
              />
            }
            label="Enable Push Notifications"
          />

          {settings.enabled && notificationPermission === 'granted' && (
            <Box mt={2}>
              <Typography variant="body2" color="success.main">
                ✓ Notifications are active
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Pending Notifications */}
      {pendingNotifications.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1">
                Pending Notifications
              </Typography>
              <Button size="small" onClick={clearPendingNotifications}>
                Clear All
              </Button>
            </Box>
            
            <List dense>
              {pendingNotifications.slice(-5).map((notification) => (
                <ListItem key={notification.id}>
                  <Box display="flex" alignItems="center" gap={1} mr={2}>
                    {getNotificationIcon(notification.type)}
                  </Box>
                  <ListItemText
                    primary={notification.title}
                    secondary={notification.message}
                  />
                  <ListItemSecondaryAction>
                    <Chip
                      label={new Date(notification.timestamp).toLocaleTimeString()}
                      size="small"
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Notification Settings</DialogTitle>
        <DialogContent>
          <List>
            <ListItem>
              <ListItemText
                primary="Odds Movement Alerts"
                secondary={`Alert when odds change by ${settings.oddsMovement.threshold}% or more`}
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.oddsMovement.enabled}
                  onChange={(e) => handleSettingChange('oddsMovement.enabled', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>

            {settings.oddsMovement.enabled && (
              <Box px={2} pb={2}>
                <Typography variant="body2" gutterBottom>
                  Threshold: {settings.oddsMovement.threshold}%
                </Typography>
                <Slider
                  value={settings.oddsMovement.threshold}
                  onChange={(e, value) => handleSettingChange('oddsMovement.threshold', value)}
                  min={1}
                  max={50}
                  step={1}
                  marks={[
                    { value: 5, label: '5%' },
                    { value: 15, label: '15%' },
                    { value: 25, label: '25%' },
                  ]}
                />
              </Box>
            )}

            <ListItem>
              <ListItemText
                primary="Betting Opportunities"
                secondary={`Alert for opportunities with ${settings.bettingOpportunities.minExpectedValue}%+ expected value`}
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.bettingOpportunities.enabled}
                  onChange={(e) => handleSettingChange('bettingOpportunities.enabled', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>

            <ListItem>
              <ListItemText
                primary="Fight Updates"
                secondary="Notifications for fight starts, results, and announcements"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.fightUpdates.enabled}
                  onChange={(e) => handleSettingChange('fightUpdates.enabled', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>

            <ListItem>
              <ListItemText
                primary="Arbitrage Alerts"
                secondary={`Alert for arbitrage opportunities with ${settings.arbitrageAlerts.minProfit}%+ profit`}
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.arbitrageAlerts.enabled}
                  onChange={(e) => handleSettingChange('arbitrageAlerts.enabled', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>

            <ListItem>
              <ListItemText
                primary="Quiet Hours"
                secondary={`No notifications from ${settings.quietHours.startTime} to ${settings.quietHours.endTime}`}
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.quietHours.enabled}
                  onChange={(e) => handleSettingChange('quietHours.enabled', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>

            {settings.quietHours.enabled && (
              <Box px={2} pb={2}>
                <Box display="flex" gap={2}>
                  <TextField
                    label="Start Time"
                    type="time"
                    value={settings.quietHours.startTime}
                    onChange={(e) => handleSettingChange('quietHours.startTime', e.target.value)}
                    size="small"
                  />
                  <TextField
                    label="End Time"
                    type="time"
                    value={settings.quietHours.endTime}
                    onChange={(e) => handleSettingChange('quietHours.endTime', e.target.value)}
                    size="small"
                  />
                </Box>
              </Box>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};