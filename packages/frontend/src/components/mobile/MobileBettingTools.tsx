import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  IconButton,
  Fab,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Avatar,
  SwipeableDrawer,
  BottomNavigation,
  BottomNavigationAction,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Badge,
  Alert,
  Snackbar,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  TrendingUp,
  Timeline,
  Notifications,
  Calculate,
  Speed,
  Bookmark,
  Share,
  Refresh,
  Close,
  Add,
  Remove,
  MonetizationOn,
  Assessment,
  Warning,
} from '@mui/icons-material';
import { QuickBetAnalyzer } from './QuickBetAnalyzer';
import { MobileOddsComparison } from './MobileOddsComparison';
import { BettingCalculator } from './BettingCalculator';
import { OfflineAnalyses } from './OfflineAnalyses';
import { PushNotificationManager } from './PushNotificationManager';

interface MobileBettingToolsProps {
  onNotificationPermission?: (granted: boolean) => void;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  action: () => void;
}

export const MobileBettingTools: React.FC<MobileBettingToolsProps> = ({
  onNotificationPermission,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [activeTab, setActiveTab] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const [quickAnalyzerOpen, setQuickAnalyzerOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(3);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const quickActions: QuickAction[] = [
    {
      id: 'analyze',
      label: 'Quick Analysis',
      icon: <Assessment />,
      color: 'primary',
      action: () => setQuickAnalyzerOpen(true),
    },
    {
      id: 'calculate',
      label: 'Bet Calculator',
      icon: <Calculate />,
      color: 'secondary',
      action: () => setCalculatorOpen(true),
    },
    {
      id: 'compare',
      label: 'Compare Odds',
      icon: <Timeline />,
      color: 'success',
      action: () => setActiveTab(1),
    },
    {
      id: 'opportunities',
      label: 'Opportunities',
      icon: <TrendingUp />,
      color: 'warning',
      action: () => setActiveTab(2),
    },
  ];

  const showNotification = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarOpen(true);
  };

  // Register service worker for offline functionality
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    }
  }, []);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        onNotificationPermission?.(permission === 'granted');
      });
    }
  }, [onNotificationPermission]);

  if (!isMobile) {
    return (
      <Alert severity="info">
        Mobile betting tools are optimized for mobile devices. 
        Switch to a mobile device or resize your browser window to access these features.
      </Alert>
    );
  }

  return (
    <Box sx={{ pb: 7 }}> {/* Bottom padding for navigation */}
      {/* Main Content */}
      <Box sx={{ p: 2 }}>
        {/* Quick Actions Grid */}
        <Typography variant="h6" gutterBottom>
          Quick Actions
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {quickActions.map((action) => (
            <Grid item xs={6} sm={3} key={action.id}>
              <Card 
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': { boxShadow: 4 },
                  '&:active': { transform: 'scale(0.98)' },
                }}
                onClick={action.action}
              >
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Box color={`${action.color}.main`} mb={1}>
                    {action.icon}
                  </Box>
                  <Typography variant="caption" display="block">
                    {action.label}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Active Opportunities */}
        <Box mb={3}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Active Opportunities
            </Typography>
            <Badge badgeContent={notificationCount} color="error">
              <IconButton size="small" onClick={() => setDrawerOpen(true)}>
                <Notifications />
              </IconButton>
            </Badge>
          </Box>
          
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <Avatar sx={{ bgcolor: 'success.main' }}>
                  <MonetizationOn />
                </Avatar>
                <Box flex={1}>
                  <Typography variant="subtitle2">
                    Arbitrage Opportunity
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Jones vs Miocic - 2.3% profit
                  </Typography>
                </Box>
                <Chip label="2m left" color="warning" size="small" />
              </Box>
              
              <Button 
                variant="contained" 
                fullWidth 
                size="small"
                onClick={() => showNotification('Opportunity details opened')}
              >
                View Details
              </Button>
            </CardContent>
          </Card>
        </Box>

        {/* Recent Analyses */}
        <Typography variant="h6" gutterBottom>
          Recent Analyses
        </Typography>
        <OfflineAnalyses />
      </Box>

      {/* Speed Dial for Quick Actions */}
      <SpeedDial
        ariaLabel="Quick betting actions"
        sx={{ position: 'fixed', bottom: 80, right: 16 }}
        icon={<SpeedDialIcon />}
        open={speedDialOpen}
        onClose={() => setSpeedDialOpen(false)}
        onOpen={() => setSpeedDialOpen(true)}
      >
        <SpeedDialAction
          icon={<Assessment />}
          tooltipTitle="Quick Analysis"
          onClick={() => {
            setSpeedDialOpen(false);
            setQuickAnalyzerOpen(true);
          }}
        />
        <SpeedDialAction
          icon={<Calculate />}
          tooltipTitle="Calculator"
          onClick={() => {
            setSpeedDialOpen(false);
            setCalculatorOpen(true);
          }}
        />
        <SpeedDialAction
          icon={<Refresh />}
          tooltipTitle="Refresh Data"
          onClick={() => {
            setSpeedDialOpen(false);
            showNotification('Data refreshed');
          }}
        />
      </SpeedDial>

      {/* Bottom Navigation */}
      <BottomNavigation
        value={activeTab}
        onChange={(event, newValue) => setActiveTab(newValue)}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
        }}
      >
        <BottomNavigationAction
          label="Dashboard"
          icon={<Assessment />}
        />
        <BottomNavigationAction
          label="Odds"
          icon={<Timeline />}
        />
        <BottomNavigationAction
          label="Opportunities"
          icon={
            <Badge badgeContent={notificationCount} color="error">
              <TrendingUp />
            </Badge>
          }
        />
        <BottomNavigationAction
          label="Tools"
          icon={<Calculate />}
        />
      </BottomNavigation>

      {/* Notifications Drawer */}
      <SwipeableDrawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpen={() => setDrawerOpen(true)}
        PaperProps={{
          sx: { width: '100%', maxWidth: 400 }
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Notifications
            </Typography>
            <IconButton onClick={() => setDrawerOpen(false)}>
              <Close />
            </IconButton>
          </Box>
          
          <List>
            <ListItem>
              <ListItemText
                primary="Odds Movement Alert"
                secondary="Jones vs Miocic odds shifted 15%"
              />
              <ListItemSecondaryAction>
                <Chip label="2m ago" size="small" />
              </ListItemSecondaryAction>
            </ListItem>
            
            <ListItem>
              <ListItemText
                primary="Arbitrage Opportunity"
                secondary="2.3% profit available"
              />
              <ListItemSecondaryAction>
                <Chip label="5m ago" size="small" color="success" />
              </ListItemSecondaryAction>
            </ListItem>
            
            <ListItem>
              <ListItemText
                primary="Fight Announcement"
                secondary="New main event confirmed"
              />
              <ListItemSecondaryAction>
                <Chip label="1h ago" size="small" />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </Box>
      </SwipeableDrawer>

      {/* Quick Bet Analyzer Modal */}
      <Drawer
        anchor="bottom"
        open={quickAnalyzerOpen}
        onClose={() => setQuickAnalyzerOpen(false)}
        PaperProps={{
          sx: { 
            height: '90vh',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Quick Bet Analyzer
            </Typography>
            <IconButton onClick={() => setQuickAnalyzerOpen(false)}>
              <Close />
            </IconButton>
          </Box>
          <QuickBetAnalyzer />
        </Box>
      </Drawer>

      {/* Betting Calculator Modal */}
      <Drawer
        anchor="bottom"
        open={calculatorOpen}
        onClose={() => setCalculatorOpen(false)}
        PaperProps={{
          sx: { 
            height: '80vh',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Betting Calculator
            </Typography>
            <IconButton onClick={() => setCalculatorOpen(false)}>
              <Close />
            </IconButton>
          </Box>
          <BettingCalculator />
        </Box>
      </Drawer>

      {/* Push Notification Manager */}
      <PushNotificationManager />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </Box>
  );
};