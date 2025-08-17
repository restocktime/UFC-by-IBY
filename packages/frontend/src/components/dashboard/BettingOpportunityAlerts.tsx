import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Badge,
  Divider,
  Paper,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Delete,
  Settings,
  MonetizationOn,
  Timeline,
  Assessment,
  Warning,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { apiService } from '../../services/api';

interface BettingOpportunity {
  id: string;
  type: 'arbitrage' | 'value_bet' | 'line_movement' | 'steam_move' | 'reverse_line';
  title: string;
  description: string;
  fight: {
    id: string;
    fighter1: string;
    fighter2: string;
    event: string;
  };
  odds: {
    sportsbook1: {
      name: string;
      fighter1Odds: number;
      fighter2Odds: number;
    };
    sportsbook2?: {
      name: string;
      fighter1Odds: number;
      fighter2Odds: number;
    };
  };
  expectedValue?: number;
  arbitrageProfit?: number;
  confidence: 'low' | 'medium' | 'high';
  timeRemaining?: string;
  timestamp: string;
  status: 'active' | 'expired' | 'taken';
}

interface AlertSettings {
  arbitrageEnabled: boolean;
  valueBetEnabled: boolean;
  lineMovementEnabled: boolean;
  steamMoveEnabled: boolean;
  reverseLineEnabled: boolean;
  minExpectedValue: number;
  minArbitrageProfit: number;
  minConfidence: 'low' | 'medium' | 'high';
  notifications: boolean;
}

interface BettingOpportunityAlertsProps {
  onAlertCountChange: (count: number) => void;
  notifications: boolean;
}

export const BettingOpportunityAlerts: React.FC<BettingOpportunityAlertsProps> = ({
  onAlertCountChange,

}) => {
  const [opportunities, setOpportunities] = useState<BettingOpportunity[]>([]);
  const [settings, setSettings] = useState<AlertSettings>({
    arbitrageEnabled: true,
    valueBetEnabled: true,
    lineMovementEnabled: true,
    steamMoveEnabled: true,
    reverseLineEnabled: false,
    minExpectedValue: 5,
    minArbitrageProfit: 2,
    minConfidence: 'medium',
    notifications: true,
  });
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<BettingOpportunity | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [loading] = useState(true);

  const fetchOpportunities = useCallback(async () => {
    try {
      const response = await apiService.get<BettingOpportunity[]>('/betting/opportunities', {
        params: {
          arbitrage: settings.arbitrageEnabled,
          valueBet: settings.valueBetEnabled,
          lineMovement: settings.lineMovementEnabled,
          steamMove: settings.steamMoveEnabled,
          reverseLine: settings.reverseLineEnabled,
          minEV: settings.minExpectedValue,
          minArbitrage: settings.minArbitrageProfit,
          minConfidence: settings.minConfidence,
        },
      });
      setOpportunities(response);
      onAlertCountChange(response.filter(opp => opp.status === 'active').length);
    } catch (error) {
      console.error('Failed to fetch betting opportunities:', error);
    } finally {
      setLoading(false);
    }
  }, [settings, onAlertCountChange]);

  useEffect(() => {
    fetchOpportunities();
    
    const interval = setInterval(fetchOpportunities, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchOpportunities]);

  const getOpportunityIcon = (type: string) => {
    switch (type) {
      case 'arbitrage':
        return <MonetizationOn />;
      case 'value_bet':
        return <TrendingUp />;
      case 'line_movement':
        return <Timeline />;
      case 'steam_move':
        return <TrendingUp />;
      case 'reverse_line':
        return <TrendingDown />;
      default:
        return <Assessment />;
    }
  };

  const getOpportunityColor = (type: string) => {
    switch (type) {
      case 'arbitrage':
        return 'success';
      case 'value_bet':
        return 'primary';
      case 'line_movement':
        return 'info';
      case 'steam_move':
        return 'warning';
      case 'reverse_line':
        return 'error';
      default:
        return 'default';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'success';
      case 'medium':
        return 'warning';
      case 'low':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatOdds = (odds: number): string => {
    return odds > 0 ? `+${odds}` : `${odds}`;
  };

  const handleSettingChange = (setting: keyof AlertSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [setting]: value,
    }));
  };

  const dismissOpportunity = async (opportunityId: string) => {
    try {
      await apiService.patch(`/betting/opportunities/${opportunityId}`, {
        status: 'expired',
      });
      setOpportunities(prev => 
        prev.map(opp => 
          opp.id === opportunityId 
            ? { ...opp, status: 'expired' as const }
            : opp
        )
      );
    } catch (error) {
      console.error('Failed to dismiss opportunity:', error);
    }
  };

  const openOpportunityDetails = (opportunity: BettingOpportunity) => {
    setSelectedOpportunity(opportunity);
    setDetailsDialogOpen(true);
  };

  const activeOpportunities = opportunities.filter(opp => opp.status === 'active');
  const expiredOpportunities = opportunities.filter(opp => opp.status === 'expired');

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" component="h2">
          Betting Opportunities
        </Typography>
        <Box display="flex" alignItems="center" gap={1}>
          <Badge badgeContent={activeOpportunities.length} color="error">
            <Chip 
              icon={<TrendingUp />} 
              label="Active Alerts" 
              color="primary" 
              variant="outlined"
            />
          </Badge>
          <Tooltip title="Alert settings">
            <IconButton onClick={() => setSettingsDialogOpen(true)} size="small">
              <Settings />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {activeOpportunities.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Assessment sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Active Opportunities
          </Typography>
          <Typography variant="body2" color="text.secondary">
            We're monitoring the markets for betting opportunities based on your settings
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {activeOpportunities.map((opportunity) => (
            <Grid item xs={12} md={6} key={opportunity.id}>
              <Card 
                sx={{ 
                  border: 2,
                  borderColor: `${getOpportunityColor(opportunity.type)}.main`,
                  '&:hover': {
                    boxShadow: 4,
                    cursor: 'pointer',
                  },
                }}
                onClick={() => openOpportunityDetails(opportunity)}
              >
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getOpportunityIcon(opportunity.type)}
                      <Typography variant="h6" component="h3">
                        {opportunity.title}
                      </Typography>
                    </Box>
                    <Box display="flex" gap={1}>
                      <Chip
                        label={opportunity.confidence}
                        color={getConfidenceColor(opportunity.confidence) as any}
                        size="small"
                      />
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissOpportunity(opportunity.id);
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {opportunity.fight.fighter1} vs {opportunity.fight.fighter2}
                  </Typography>

                  <Typography variant="body2" paragraph>
                    {opportunity.description}
                  </Typography>

                  <Grid container spacing={2} mb={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">
                        {opportunity.odds.sportsbook1.name}
                      </Typography>
                      <Typography variant="body2">
                        {formatOdds(opportunity.odds.sportsbook1.fighter1Odds)} / {formatOdds(opportunity.odds.sportsbook1.fighter2Odds)}
                      </Typography>
                    </Grid>
                    {opportunity.odds.sportsbook2 && (
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">
                          {opportunity.odds.sportsbook2.name}
                        </Typography>
                        <Typography variant="body2">
                          {formatOdds(opportunity.odds.sportsbook2.fighter1Odds)} / {formatOdds(opportunity.odds.sportsbook2.fighter2Odds)}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>

                  {opportunity.expectedValue && (
                    <Box mb={1}>
                      <Chip
                        icon={<TrendingUp />}
                        label={`EV: +${opportunity.expectedValue.toFixed(1)}%`}
                        color="success"
                        size="small"
                      />
                    </Box>
                  )}

                  {opportunity.arbitrageProfit && (
                    <Box mb={1}>
                      <Chip
                        icon={<MonetizationOn />}
                        label={`Profit: ${opportunity.arbitrageProfit.toFixed(1)}%`}
                        color="success"
                        size="small"
                      />
                    </Box>
                  )}

                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(opportunity.timestamp), 'HH:mm:ss')}
                    </Typography>
                    {opportunity.timeRemaining && (
                      <Chip
                        icon={<Warning />}
                        label={`Expires in ${opportunity.timeRemaining}`}
                        color="warning"
                        size="small"
                      />
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {expiredOpportunities.length > 0 && (
        <Box mt={4}>
          <Typography variant="h6" gutterBottom>
            Recent Opportunities
          </Typography>
          <List>
            {expiredOpportunities.slice(0, 5).map((opportunity) => (
              <ListItem key={opportunity.id} divider>
                <ListItemText
                  primary={opportunity.title}
                  secondary={`${opportunity.fight.fighter1} vs ${opportunity.fight.fighter2} - ${format(new Date(opportunity.timestamp), 'MMM dd, HH:mm')}`}
                />
                <ListItemSecondaryAction>
                  <Chip
                    label="Expired"
                    color="default"
                    size="small"
                  />
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Alert Settings</DialogTitle>
        <DialogContent>
          <Box py={2}>
            <Typography variant="subtitle1" gutterBottom>
              Opportunity Types
            </Typography>
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.arbitrageEnabled}
                  onChange={(e) => handleSettingChange('arbitrageEnabled', e.target.checked)}
                />
              }
              label="Arbitrage Opportunities"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.valueBetEnabled}
                  onChange={(e) => handleSettingChange('valueBetEnabled', e.target.checked)}
                />
              }
              label="Value Bets"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.lineMovementEnabled}
                  onChange={(e) => handleSettingChange('lineMovementEnabled', e.target.checked)}
                />
              }
              label="Line Movement"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.steamMoveEnabled}
                  onChange={(e) => handleSettingChange('steamMoveEnabled', e.target.checked)}
                />
              }
              label="Steam Moves"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.reverseLineEnabled}
                  onChange={(e) => handleSettingChange('reverseLineEnabled', e.target.checked)}
                />
              }
              label="Reverse Line Movement"
            />

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" gutterBottom>
              Thresholds
            </Typography>

            <TextField
              label="Min Expected Value (%)"
              type="number"
              value={settings.minExpectedValue}
              onChange={(e) => handleSettingChange('minExpectedValue', parseFloat(e.target.value))}
              fullWidth
              margin="normal"
              inputProps={{ min: 0, max: 100, step: 0.1 }}
            />

            <TextField
              label="Min Arbitrage Profit (%)"
              type="number"
              value={settings.minArbitrageProfit}
              onChange={(e) => handleSettingChange('minArbitrageProfit', parseFloat(e.target.value))}
              fullWidth
              margin="normal"
              inputProps={{ min: 0, max: 100, step: 0.1 }}
            />

            <FormControl fullWidth margin="normal">
              <InputLabel>Minimum Confidence</InputLabel>
              <Select
                value={settings.minConfidence}
                onChange={(e) => handleSettingChange('minConfidence', e.target.value)}
                label="Minimum Confidence"
              >
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => {
            setSettingsDialogOpen(false);
            fetchOpportunities();
          }} variant="contained">
            Save Settings
          </Button>
        </DialogActions>
      </Dialog>

      {/* Opportunity Details Dialog */}
      <Dialog 
        open={detailsDialogOpen} 
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        {selectedOpportunity && (
          <>
            <DialogTitle>
              {selectedOpportunity.title}
              <Chip 
                label={selectedOpportunity.type.replace('_', ' ')} 
                color={getOpportunityColor(selectedOpportunity.type) as any}
                size="small"
                sx={{ ml: 2 }}
              />
            </DialogTitle>
            <DialogContent>
              <Typography variant="h6" gutterBottom>
                {selectedOpportunity.fight.fighter1} vs {selectedOpportunity.fight.fighter2}
              </Typography>
              
              <Typography variant="body1" paragraph>
                {selectedOpportunity.description}
              </Typography>

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle1" gutterBottom>
                      {selectedOpportunity.odds.sportsbook1.name}
                    </Typography>
                    <Typography variant="body2">
                      {selectedOpportunity.fight.fighter1}: {formatOdds(selectedOpportunity.odds.sportsbook1.fighter1Odds)}
                    </Typography>
                    <Typography variant="body2">
                      {selectedOpportunity.fight.fighter2}: {formatOdds(selectedOpportunity.odds.sportsbook1.fighter2Odds)}
                    </Typography>
                  </Paper>
                </Grid>
                
                {selectedOpportunity.odds.sportsbook2 && (
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle1" gutterBottom>
                        {selectedOpportunity.odds.sportsbook2.name}
                      </Typography>
                      <Typography variant="body2">
                        {selectedOpportunity.fight.fighter1}: {formatOdds(selectedOpportunity.odds.sportsbook2.fighter1Odds)}
                      </Typography>
                      <Typography variant="body2">
                        {selectedOpportunity.fight.fighter2}: {formatOdds(selectedOpportunity.odds.sportsbook2.fighter2Odds)}
                      </Typography>
                    </Paper>
                  </Grid>
                )}
              </Grid>

              {(selectedOpportunity.expectedValue || selectedOpportunity.arbitrageProfit) && (
                <Box mt={3}>
                  <Typography variant="subtitle1" gutterBottom>
                    Opportunity Metrics
                  </Typography>
                  {selectedOpportunity.expectedValue && (
                    <Typography variant="body2">
                      Expected Value: +{selectedOpportunity.expectedValue.toFixed(2)}%
                    </Typography>
                  )}
                  {selectedOpportunity.arbitrageProfit && (
                    <Typography variant="body2">
                      Arbitrage Profit: {selectedOpportunity.arbitrageProfit.toFixed(2)}%
                    </Typography>
                  )}
                  <Typography variant="body2">
                    Confidence: {selectedOpportunity.confidence}
                  </Typography>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
              <Button 
                variant="contained" 
                color="primary"
                onClick={() => {
                  // Handle taking the opportunity
                  setDetailsDialogOpen(false);
                }}
              >
                Take Opportunity
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};