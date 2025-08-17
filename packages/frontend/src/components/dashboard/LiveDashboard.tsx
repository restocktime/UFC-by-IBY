import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Badge,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  Alert,
  Snackbar,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  Refresh,
  Notifications,
  NotificationsActive,
  TrendingUp,
  TrendingDown,
  Visibility,
  VisibilityOff,
  Add,
  Delete,
  PlayArrow,
  Pause,
  Timeline,
  Assessment,
} from '@mui/icons-material';
import { OddsTracker } from '../odds/OddsTracker';
import { LiveFightMonitor } from './LiveFightMonitor';
import { BettingOpportunityAlerts } from './BettingOpportunityAlerts';
import { CustomWatchlist } from './CustomWatchlist';
import { apiService } from '../../services/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`dashboard-tabpanel-${index}`}
      aria-labelledby={`dashboard-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface DashboardSettings {
  autoRefresh: boolean;
  refreshInterval: number;
  notifications: boolean;
  soundAlerts: boolean;
}

interface LiveEvent {
  id: string;
  name: string;
  status: 'upcoming' | 'live' | 'completed';
  startTime: string;
  fights: Array<{
    id: string;
    fighter1: string;
    fighter2: string;
    status: 'scheduled' | 'live' | 'completed';
  }>;
}

export const LiveDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState<DashboardSettings>({
    autoRefresh: true,
    refreshInterval: 30000,
    notifications: true,
    soundAlerts: false,
  });
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const fetchLiveEvents = useCallback(async () => {
    try {
      const events = await apiService.get<LiveEvent[]>('/events/live');
      setLiveEvents(events);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch live events:', error);
    }
  }, []);

  const handleSettingChange = (setting: keyof DashboardSettings, value: boolean | number) => {
    setSettings(prev => ({
      ...prev,
      [setting]: value,
    }));
  };

  const showNotification = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarOpen(true);
    
    if (settings.soundAlerts && 'Audio' in window) {
      // Play notification sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {
        // Ignore audio play errors
      });
    }
  };

  useEffect(() => {
    fetchLiveEvents();

    if (settings.autoRefresh) {
      const interval = setInterval(fetchLiveEvents, settings.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchLiveEvents, settings.autoRefresh, settings.refreshInterval]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!settings.notifications) return;

    const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'odds_movement':
          showNotification(`Significant odds movement detected: ${data.fight}`);
          setAlertCount(prev => prev + 1);
          break;
        case 'fight_start':
          showNotification(`Fight started: ${data.fight}`);
          break;
        case 'betting_opportunity':
          showNotification(`Betting opportunity: ${data.description}`);
          setAlertCount(prev => prev + 1);
          break;
        default:
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [settings.notifications, settings.soundAlerts]);

  const liveEventsCount = liveEvents.filter(event => event.status === 'live').length;
  const upcomingEventsCount = liveEvents.filter(event => event.status === 'upcoming').length;

  return (
    <Box>
      {/* Dashboard Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Live Dashboard
        </Typography>
        
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Typography>
          
          <Tooltip title="Refresh all data">
            <IconButton onClick={fetchLiveEvents} size="small">
              <Refresh />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Dashboard settings">
            <IconButton onClick={() => setSettingsDialogOpen(true)} size="small">
              <Assessment />
            </IconButton>
          </Tooltip>
          
          <Badge badgeContent={alertCount} color="error">
            <IconButton size="small">
              {settings.notifications ? <NotificationsActive /> : <Notifications />}
            </IconButton>
          </Badge>
        </Box>
      </Box>

      {/* Status Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" color="error.main">
                    {liveEventsCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Live Events
                  </Typography>
                </Box>
                <PlayArrow color="error" fontSize="large" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" color="warning.main">
                    {upcomingEventsCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Upcoming Events
                  </Typography>
                </Box>
                <Timeline color="warning" fontSize="large" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" color="success.main">
                    {alertCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Alerts
                  </Typography>
                </Box>
                <TrendingUp color="success" fontSize="large" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h4" color="info.main">
                    {settings.autoRefresh ? 'ON' : 'OFF'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Auto Refresh
                  </Typography>
                </Box>
                {settings.autoRefresh ? (
                  <PlayArrow color="info" fontSize="large" />
                ) : (
                  <Pause color="info" fontSize="large" />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Dashboard Tabs */}
      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="dashboard tabs">
            <Tab 
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <Timeline />
                  Odds Tracker
                </Box>
              } 
            />
            <Tab 
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <PlayArrow />
                  Live Fights
                  {liveEventsCount > 0 && (
                    <Chip size="small" label={liveEventsCount} color="error" />
                  )}
                </Box>
              } 
            />
            <Tab 
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <TrendingUp />
                  Opportunities
                  {alertCount > 0 && (
                    <Chip size="small" label={alertCount} color="warning" />
                  )}
                </Box>
              } 
            />
            <Tab 
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <Visibility />
                  Watchlist
                </Box>
              } 
            />
          </Tabs>
        </Box>

        <TabPanel value={activeTab} index={0}>
          <OddsTracker 
            autoRefresh={settings.autoRefresh}
            refreshInterval={settings.refreshInterval}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <LiveFightMonitor 
            events={liveEvents}
            autoRefresh={settings.autoRefresh}
            onFightUpdate={fetchLiveEvents}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <BettingOpportunityAlerts 
            onAlertCountChange={setAlertCount}
            notifications={settings.notifications}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          <CustomWatchlist 
            autoRefresh={settings.autoRefresh}
            refreshInterval={settings.refreshInterval}
          />
        </TabPanel>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)}>
        <DialogTitle>Dashboard Settings</DialogTitle>
        <DialogContent>
          <List>
            <ListItem>
              <ListItemText 
                primary="Auto Refresh" 
                secondary="Automatically refresh data"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.autoRefresh}
                  onChange={(e) => handleSettingChange('autoRefresh', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>
            
            <ListItem>
              <ListItemText 
                primary="Notifications" 
                secondary="Show real-time notifications"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.notifications}
                  onChange={(e) => handleSettingChange('notifications', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>
            
            <ListItem>
              <ListItemText 
                primary="Sound Alerts" 
                secondary="Play sound for important alerts"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.soundAlerts}
                  onChange={(e) => handleSettingChange('soundAlerts', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbarOpen(false)} 
          severity="info" 
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};