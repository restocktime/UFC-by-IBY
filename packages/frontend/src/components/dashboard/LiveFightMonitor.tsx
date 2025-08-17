import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  LinearProgress,
  Avatar,
  Button,
  IconButton,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Stop,
  Timer,
  Sports,
  Visibility,
  Refresh,
  Timeline,
  Assessment,
} from '@mui/icons-material';
import { format, differenceInMinutes, differenceInSeconds } from 'date-fns';
import { apiService } from '../../services/api';

interface LiveFight {
  id: string;
  fighter1: {
    id: string;
    name: string;
    record: string;
    avatar?: string;
  };
  fighter2: {
    id: string;
    name: string;
    record: string;
    avatar?: string;
  };
  status: 'scheduled' | 'walkouts' | 'round1' | 'round2' | 'round3' | 'round4' | 'round5' | 'completed';
  currentRound?: number;
  timeRemaining?: string;
  stats?: {
    fighter1: FightStats;
    fighter2: FightStats;
  };
  odds?: {
    fighter1: number;
    fighter2: number;
  };
  startTime: string;
  weightClass: string;
  title?: string;
}

interface FightStats {
  significantStrikes: number;
  totalStrikes: number;
  takedowns: number;
  takedownAccuracy: number;
  submissionAttempts: number;
  knockdowns: number;
}

interface LiveEvent {
  id: string;
  name: string;
  status: 'upcoming' | 'live' | 'completed';
  startTime: string;
  fights: LiveFight[];
}

interface LiveFightMonitorProps {
  events: LiveEvent[];
  autoRefresh: boolean;
  onFightUpdate: () => void;
}

export const LiveFightMonitor: React.FC<LiveFightMonitorProps> = ({
  events,
  autoRefresh,
  onFightUpdate,
}) => {
  const [selectedFight, setSelectedFight] = useState<LiveFight | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [liveStats, setLiveStats] = useState<{ [fightId: string]: FightStats }>({});

  const liveEvents = events.filter(event => event.status === 'live');
  const liveFights = liveEvents.flatMap(event => 
    event.fights.filter(fight => 
      fight.status !== 'scheduled' && fight.status !== 'completed'
    )
  );

  const fetchLiveStats = async (fightId: string) => {
    try {
      const stats = await apiService.get<FightStats>(`/fights/${fightId}/live-stats`);
      setLiveStats(prev => ({
        ...prev,
        [fightId]: stats,
      }));
    } catch (error) {
      console.error('Failed to fetch live stats:', error);
    }
  };

  useEffect(() => {
    if (autoRefresh && liveFights.length > 0) {
      const interval = setInterval(() => {
        liveFights.forEach(fight => {
          fetchLiveStats(fight.id);
        });
        onFightUpdate();
      }, 10000); // Update every 10 seconds for live fights

      return () => clearInterval(interval);
    }
  }, [autoRefresh, liveFights.length, onFightUpdate]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'walkouts':
        return 'warning';
      case 'round1':
      case 'round2':
      case 'round3':
      case 'round4':
      case 'round5':
        return 'error';
      case 'completed':
        return 'success';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'walkouts':
        return 'Walkouts';
      case 'round1':
        return 'Round 1';
      case 'round2':
        return 'Round 2';
      case 'round3':
        return 'Round 3';
      case 'round4':
        return 'Round 4';
      case 'round5':
        return 'Round 5';
      case 'completed':
        return 'Completed';
      default:
        return 'Scheduled';
    }
  };

  const formatTimeRemaining = (timeString?: string) => {
    if (!timeString) return '--:--';
    return timeString;
  };

  const calculateProgress = (fight: LiveFight) => {
    if (fight.status === 'completed') return 100;
    if (fight.status === 'scheduled' || fight.status === 'walkouts') return 0;
    
    const roundNumber = parseInt(fight.status.replace('round', ''));
    const baseProgress = ((roundNumber - 1) / 5) * 100;
    
    // Add progress within current round based on time remaining
    if (fight.timeRemaining) {
      const [minutes, seconds] = fight.timeRemaining.split(':').map(Number);
      const totalSecondsRemaining = minutes * 60 + seconds;
      const roundProgress = ((300 - totalSecondsRemaining) / 300) * 20; // 20% per round
      return Math.min(baseProgress + roundProgress, 100);
    }
    
    return baseProgress;
  };

  const openFightDetails = (fight: LiveFight) => {
    setSelectedFight(fight);
    setDetailsDialogOpen(true);
    fetchLiveStats(fight.id);
  };

  if (liveFights.length === 0) {
    return (
      <Box textAlign="center" py={8}>
        <Sports sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No Live Fights
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Check back when events are live for real-time fight monitoring
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" component="h2">
          Live Fight Monitor
        </Typography>
        <Box display="flex" alignItems="center" gap={1}>
          <Chip 
            icon={<PlayArrow />} 
            label={`${liveFights.length} Live`} 
            color="error" 
            variant="outlined"
          />
          <Tooltip title="Refresh live data">
            <IconButton onClick={onFightUpdate} size="small">
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {liveFights.map((fight) => (
          <Grid item xs={12} lg={6} key={fight.id}>
            <Card 
              sx={{ 
                border: fight.status.includes('round') ? 2 : 1,
                borderColor: fight.status.includes('round') ? 'error.main' : 'divider',
              }}
            >
              <CardContent>
                {/* Fight Header */}
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" component="h3">
                    {fight.weightClass}
                    {fight.title && (
                      <Chip 
                        label={fight.title} 
                        size="small" 
                        color="primary" 
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Typography>
                  <Chip
                    icon={fight.status.includes('round') ? <Timer /> : <Pause />}
                    label={getStatusLabel(fight.status)}
                    color={getStatusColor(fight.status) as any}
                    size="small"
                  />
                </Box>

                {/* Fighters */}
                <Grid container spacing={2} alignItems="center" mb={2}>
                  <Grid item xs={5}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Avatar 
                        src={fight.fighter1.avatar} 
                        alt={fight.fighter1.name}
                        sx={{ width: 40, height: 40 }}
                      >
                        {fight.fighter1.name.charAt(0)}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {fight.fighter1.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {fight.fighter1.record}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  
                  <Grid item xs={2} textAlign="center">
                    <Typography variant="h6" color="text.secondary">
                      VS
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={5}>
                    <Box display="flex" alignItems="center" gap={1} justifyContent="flex-end">
                      <Box textAlign="right">
                        <Typography variant="subtitle1" fontWeight="bold">
                          {fight.fighter2.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {fight.fighter2.record}
                        </Typography>
                      </Box>
                      <Avatar 
                        src={fight.fighter2.avatar} 
                        alt={fight.fighter2.name}
                        sx={{ width: 40, height: 40 }}
                      >
                        {fight.fighter2.name.charAt(0)}
                      </Avatar>
                    </Box>
                  </Grid>
                </Grid>

                {/* Fight Progress */}
                {fight.status !== 'scheduled' && (
                  <Box mb={2}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="body2" color="text.secondary">
                        Fight Progress
                      </Typography>
                      {fight.timeRemaining && (
                        <Typography variant="body2" fontWeight="bold">
                          {formatTimeRemaining(fight.timeRemaining)}
                        </Typography>
                      )}
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={calculateProgress(fight)}
                      color={fight.status.includes('round') ? 'error' : 'primary'}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                )}

                {/* Current Odds */}
                {fight.odds && (
                  <Box mb={2}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Live Odds
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="body2" align="center">
                          {fight.odds.fighter1 > 0 ? `+${fight.odds.fighter1}` : fight.odds.fighter1}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" align="center">
                          {fight.odds.fighter2 > 0 ? `+${fight.odds.fighter2}` : fight.odds.fighter2}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                )}

                {/* Quick Stats */}
                {fight.stats && (
                  <Box mb={2}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Live Stats
                    </Typography>
                    <Grid container spacing={1}>
                      <Grid item xs={6}>
                        <Typography variant="caption" display="block">
                          Sig. Strikes: {fight.stats.fighter1.significantStrikes}
                        </Typography>
                        <Typography variant="caption" display="block">
                          Takedowns: {fight.stats.fighter1.takedowns}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} textAlign="right">
                        <Typography variant="caption" display="block">
                          {fight.stats.fighter2.significantStrikes} :Sig. Strikes
                        </Typography>
                        <Typography variant="caption" display="block">
                          {fight.stats.fighter2.takedowns} :Takedowns
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                )}

                {/* Actions */}
                <Box display="flex" gap={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Visibility />}
                    onClick={() => openFightDetails(fight)}
                    fullWidth
                  >
                    View Details
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Timeline />}
                    fullWidth
                  >
                    Odds History
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Fight Details Dialog */}
      <Dialog 
        open={detailsDialogOpen} 
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        {selectedFight && (
          <>
            <DialogTitle>
              {selectedFight.fighter1.name} vs {selectedFight.fighter2.name}
              <Chip 
                label={getStatusLabel(selectedFight.status)} 
                color={getStatusColor(selectedFight.status) as any}
                size="small"
                sx={{ ml: 2 }}
              />
            </DialogTitle>
            <DialogContent>
              {selectedFight.stats && (
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Statistic</TableCell>
                        <TableCell align="center">{selectedFight.fighter1.name}</TableCell>
                        <TableCell align="center">{selectedFight.fighter2.name}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>Significant Strikes</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter1.significantStrikes}</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter2.significantStrikes}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Total Strikes</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter1.totalStrikes}</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter2.totalStrikes}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Takedowns</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter1.takedowns}</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter2.takedowns}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Takedown Accuracy</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter1.takedownAccuracy}%</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter2.takedownAccuracy}%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Submission Attempts</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter1.submissionAttempts}</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter2.submissionAttempts}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Knockdowns</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter1.knockdowns}</TableCell>
                        <TableCell align="center">{selectedFight.stats.fighter2.knockdowns}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};