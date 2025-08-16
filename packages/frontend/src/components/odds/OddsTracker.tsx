import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  Refresh,
  Timeline,
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { apiService } from '../../services/api';
import { OddsSnapshot, MovementAlert } from '@ufc-platform/shared';

interface OddsData {
  fightId: string;
  fighter1Name: string;
  fighter2Name: string;
  currentOdds: OddsSnapshot[];
  movements: MovementAlert[];
  chartData: ChartDataPoint[];
}

interface ChartDataPoint {
  timestamp: string;
  fighter1Odds: number;
  fighter2Odds: number;
  sportsbook: string;
}

interface OddsTrackerProps {
  fightId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const OddsTracker: React.FC<OddsTrackerProps> = ({
  fightId,
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
}) => {
  const [oddsData, setOddsData] = useState<OddsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFight, setSelectedFight] = useState<string | null>(fightId || null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchOddsData = async () => {
    try {
      setError(null);
      const endpoint = fightId ? `/odds/fight/${fightId}` : '/odds/upcoming';
      const response = await apiService.get<OddsData[]>(endpoint);
      setOddsData(response);
      setLastUpdate(new Date());
    } catch (err) {
      setError('Failed to fetch odds data');
      console.error('Error fetching odds:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOddsData();

    if (autoRefresh) {
      const interval = setInterval(fetchOddsData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fightId, autoRefresh, refreshInterval]);

  const getMovementIcon = (movementType: string) => {
    switch (movementType) {
      case 'significant':
        return <TrendingUp color="warning" />;
      case 'reverse':
        return <TrendingDown color="error" />;
      case 'steam':
        return <TrendingUp color="success" />;
      default:
        return <TrendingFlat color="disabled" />;
    }
  };

  const getMovementColor = (movementType: string) => {
    switch (movementType) {
      case 'significant':
        return 'warning';
      case 'reverse':
        return 'error';
      case 'steam':
        return 'success';
      default:
        return 'default';
    }
  };

  const formatOdds = (odds: number): string => {
    return odds > 0 ? `+${odds}` : `${odds}`;
  };

  const calculateImpliedProbability = (odds: number): number => {
    if (odds > 0) {
      return (100 / (odds + 100)) * 100;
    } else {
      return (Math.abs(odds) / (Math.abs(odds) + 100)) * 100;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" action={
        <IconButton color="inherit" size="small" onClick={fetchOddsData}>
          <Refresh />
        </IconButton>
      }>
        {error}
      </Alert>
    );
  }

  const selectedFightData = selectedFight 
    ? oddsData.find(fight => fight.fightId === selectedFight)
    : oddsData[0];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" component="h2">
          Real-time Odds Tracker
        </Typography>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Last updated: {format(lastUpdate, 'HH:mm:ss')}
          </Typography>
          <Tooltip title="Refresh odds">
            <IconButton onClick={fetchOddsData} size="small">
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Odds Overview Cards */}
        <Grid item xs={12}>
          <Grid container spacing={2}>
            {oddsData.slice(0, 3).map((fight) => (
              <Grid item xs={12} md={4} key={fight.fightId}>
                <Card 
                  sx={{ 
                    cursor: 'pointer',
                    border: selectedFight === fight.fightId ? 2 : 0,
                    borderColor: 'primary.main'
                  }}
                  onClick={() => setSelectedFight(fight.fightId)}
                >
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {fight.fighter1Name} vs {fight.fighter2Name}
                    </Typography>
                    
                    {fight.currentOdds.length > 0 && (
                      <Box>
                        <Grid container spacing={2}>
                          <Grid item xs={6}>
                            <Typography variant="body2" color="text.secondary">
                              {fight.fighter1Name}
                            </Typography>
                            <Typography variant="h6" color="primary">
                              {formatOdds(fight.currentOdds[0].moneyline.fighter1)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {calculateImpliedProbability(fight.currentOdds[0].moneyline.fighter1).toFixed(1)}%
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="body2" color="text.secondary">
                              {fight.fighter2Name}
                            </Typography>
                            <Typography variant="h6" color="primary">
                              {formatOdds(fight.currentOdds[0].moneyline.fighter2)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {calculateImpliedProbability(fight.currentOdds[0].moneyline.fighter2).toFixed(1)}%
                            </Typography>
                          </Grid>
                        </Grid>
                        
                        {fight.movements.length > 0 && (
                          <Box mt={2}>
                            <Chip
                              icon={getMovementIcon(fight.movements[0].movementType)}
                              label={`${fight.movements[0].percentageChange.toFixed(1)}% movement`}
                              color={getMovementColor(fight.movements[0].movementType) as any}
                              size="small"
                            />
                          </Box>
                        )}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>

        {/* Detailed View for Selected Fight */}
        {selectedFightData && (
          <>
            {/* Odds Movement Chart */}
            <Grid item xs={12} lg={8}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <Timeline />
                    <Typography variant="h6">
                      Odds Movement - {selectedFightData.fighter1Name} vs {selectedFightData.fighter2Name}
                    </Typography>
                  </Box>
                  
                  <Box height={400}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedFightData.chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="timestamp" 
                          tickFormatter={(value) => format(new Date(value), 'HH:mm')}
                        />
                        <YAxis />
                        <RechartsTooltip 
                          labelFormatter={(value) => format(new Date(value), 'MMM dd, HH:mm')}
                          formatter={(value: number, name: string) => [formatOdds(value), name]}
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="fighter1Odds" 
                          stroke="#1976d2" 
                          name={selectedFightData.fighter1Name}
                          strokeWidth={2}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="fighter2Odds" 
                          stroke="#d32f2f" 
                          name={selectedFightData.fighter2Name}
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Current Odds Table */}
            <Grid item xs={12} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Current Odds by Sportsbook
                  </Typography>
                  
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Sportsbook</TableCell>
                          <TableCell align="right">{selectedFightData.fighter1Name}</TableCell>
                          <TableCell align="right">{selectedFightData.fighter2Name}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedFightData.currentOdds.map((odds, index) => (
                          <TableRow key={index}>
                            <TableCell component="th" scope="row">
                              {odds.sportsbook}
                            </TableCell>
                            <TableCell align="right">
                              {formatOdds(odds.moneyline.fighter1)}
                            </TableCell>
                            <TableCell align="right">
                              {formatOdds(odds.moneyline.fighter2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>

            {/* Recent Movements */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Recent Odds Movements
                  </Typography>
                  
                  {selectedFightData.movements.length > 0 ? (
                    <TableContainer component={Paper} variant="outlined">
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Time</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Change</TableCell>
                            <TableCell>Old Odds</TableCell>
                            <TableCell>New Odds</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedFightData.movements.slice(0, 10).map((movement, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                {format(new Date(movement.timestamp), 'MMM dd, HH:mm')}
                              </TableCell>
                              <TableCell>
                                <Chip
                                  icon={getMovementIcon(movement.movementType)}
                                  label={movement.movementType}
                                  color={getMovementColor(movement.movementType) as any}
                                  size="small"
                                />
                              </TableCell>
                              <TableCell>
                                <Typography 
                                  color={movement.percentageChange > 0 ? 'success.main' : 'error.main'}
                                  fontWeight="bold"
                                >
                                  {movement.percentageChange > 0 ? '+' : ''}{movement.percentageChange.toFixed(1)}%
                                </Typography>
                              </TableCell>
                              <TableCell>
                                {formatOdds(movement.oldOdds.moneyline.fighter1)} / {formatOdds(movement.oldOdds.moneyline.fighter2)}
                              </TableCell>
                              <TableCell>
                                {formatOdds(movement.newOdds.moneyline.fighter1)} / {formatOdds(movement.newOdds.moneyline.fighter2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No recent movements detected
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
};