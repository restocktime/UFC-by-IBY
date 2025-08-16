
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Avatar,
  Chip,
  Divider,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  EmojiEvents,
  FitnessCenter,
  CompareArrows,
} from '@mui/icons-material';
import { Fighter } from '@ufc-platform/shared';
import { ComparisonChart } from './ComparisonChart';

interface FighterComparisonProps {
  fighter1: Fighter;
  fighter2: Fighter;
  loading?: boolean;
}

export function FighterComparison({ 
  fighter1, 
  fighter2, 
  loading = false 
}: FighterComparisonProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading fighter comparison...</Typography>
      </Box>
    );
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp color="success" />;
      case 'decreasing':
        return <TrendingDown color="error" />;
      default:
        return <TrendingFlat color="info" />;
    }
  };

  const getWinPercentage = (fighter: Fighter) => {
    const total = fighter.record.wins + fighter.record.losses + fighter.record.draws;
    return total > 0 ? ((fighter.record.wins / total) * 100).toFixed(1) : '0.0';
  };

  const getBetterValue = (value1: number, value2: number, higherIsBetter = true) => {
    if (value1 === value2) return 'equal';
    return higherIsBetter ? (value1 > value2 ? 'fighter1' : 'fighter2') : (value1 < value2 ? 'fighter1' : 'fighter2');
  };

  const getValueColor = (comparison: string, fighter: 'fighter1' | 'fighter2') => {
    if (comparison === 'equal') return 'text.primary';
    if (comparison === fighter) return 'success.main';
    return 'error.main';
  };

  const FighterHeader = ({ fighter }: { fighter: Fighter }) => (
    <Box textAlign="center">
      <Avatar
        sx={{
          width: 100,
          height: 100,
          bgcolor: theme.palette.primary.main,
          fontSize: '1.5rem',
          fontWeight: 'bold',
          mx: 'auto',
          mb: 2,
        }}
      >
        {fighter.name.split(' ').map(n => n[0]).join('')}
      </Avatar>
      
      <Typography variant="h5" component="h2" gutterBottom>
        {fighter.name}
      </Typography>
      
      {fighter.nickname && (
        <Typography
          variant="body1"
          sx={{ color: 'text.secondary', fontStyle: 'italic', mb: 1 }}
        >
          "{fighter.nickname}"
        </Typography>
      )}
      
      <Box display="flex" justifyContent="center" gap={1} mb={2}>
        <Chip
          label={fighter.rankings.weightClass}
          color="primary"
          size="small"
          variant="outlined"
        />
        {fighter.rankings.rank && (
          <Chip
            label={`#${fighter.rankings.rank}`}
            color="secondary"
            size="small"
            icon={<EmojiEvents />}
          />
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      {/* Header Comparison */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={5}>
              <FighterHeader fighter={fighter1} />
            </Grid>
            <Grid item xs={2}>
              <Box display="flex" justifyContent="center">
                <CompareArrows 
                  sx={{ 
                    fontSize: 48, 
                    color: theme.palette.primary.main,
                    transform: 'rotate(90deg)',
                  }} 
                />
              </Box>
            </Grid>
            <Grid item xs={5}>
              <FighterHeader fighter={fighter2} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Stats Comparison Table */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <EmojiEvents sx={{ mr: 1 }} />
            Fight Statistics Comparison
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          <TableContainer component={Paper} sx={{ bgcolor: 'transparent' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{fighter1.name}</TableCell>
                  <TableCell align="center">Statistic</TableCell>
                  <TableCell align="right">{fighter2.name}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell 
                    sx={{ 
                      color: getValueColor(
                        getBetterValue(
                          parseFloat(getWinPercentage(fighter1)), 
                          parseFloat(getWinPercentage(fighter2))
                        ), 
                        'fighter1'
                      ),
                      fontWeight: 'bold',
                    }}
                  >
                    {fighter1.record.wins}-{fighter1.record.losses}-{fighter1.record.draws}
                    <br />
                    <Typography variant="caption">
                      ({getWinPercentage(fighter1)}% win rate)
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" color="text.secondary">
                      Record
                    </Typography>
                  </TableCell>
                  <TableCell 
                    align="right"
                    sx={{ 
                      color: getValueColor(
                        getBetterValue(
                          parseFloat(getWinPercentage(fighter1)), 
                          parseFloat(getWinPercentage(fighter2))
                        ), 
                        'fighter2'
                      ),
                      fontWeight: 'bold',
                    }}
                  >
                    {fighter2.record.wins}-{fighter2.record.losses}-{fighter2.record.draws}
                    <br />
                    <Typography variant="caption">
                      ({getWinPercentage(fighter2)}% win rate)
                    </Typography>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell 
                    sx={{ 
                      color: getValueColor(
                        getBetterValue(
                          fighter1.calculatedMetrics.winStreak, 
                          fighter2.calculatedMetrics.winStreak
                        ), 
                        'fighter1'
                      ),
                      fontWeight: 'bold',
                    }}
                  >
                    {fighter1.calculatedMetrics.winStreak}
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" color="text.secondary">
                      Win Streak
                    </Typography>
                  </TableCell>
                  <TableCell 
                    align="right"
                    sx={{ 
                      color: getValueColor(
                        getBetterValue(
                          fighter1.calculatedMetrics.winStreak, 
                          fighter2.calculatedMetrics.winStreak
                        ), 
                        'fighter2'
                      ),
                      fontWeight: 'bold',
                    }}
                  >
                    {fighter2.calculatedMetrics.winStreak}
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell 
                    sx={{ 
                      color: getValueColor(
                        getBetterValue(
                          fighter1.calculatedMetrics.strikingAccuracy.value, 
                          fighter2.calculatedMetrics.strikingAccuracy.value
                        ), 
                        'fighter1'
                      ),
                      fontWeight: 'bold',
                    }}
                  >
                    {fighter1.calculatedMetrics.strikingAccuracy.value.toFixed(1)}%
                    {getTrendIcon(fighter1.calculatedMetrics.strikingAccuracy.trend)}
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" color="text.secondary">
                      Striking Accuracy
                    </Typography>
                  </TableCell>
                  <TableCell 
                    align="right"
                    sx={{ 
                      color: getValueColor(
                        getBetterValue(
                          fighter1.calculatedMetrics.strikingAccuracy.value, 
                          fighter2.calculatedMetrics.strikingAccuracy.value
                        ), 
                        'fighter2'
                      ),
                      fontWeight: 'bold',
                    }}
                  >
                    {getTrendIcon(fighter2.calculatedMetrics.strikingAccuracy.trend)}
                    {fighter2.calculatedMetrics.strikingAccuracy.value.toFixed(1)}%
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell 
                    sx={{ 
                      color: getValueColor(
                        getBetterValue(
                          fighter1.calculatedMetrics.takedownDefense.value, 
                          fighter2.calculatedMetrics.takedownDefense.value
                        ), 
                        'fighter1'
                      ),
                      fontWeight: 'bold',
                    }}
                  >
                    {fighter1.calculatedMetrics.takedownDefense.value.toFixed(1)}%
                    {getTrendIcon(fighter1.calculatedMetrics.takedownDefense.trend)}
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" color="text.secondary">
                      Takedown Defense
                    </Typography>
                  </TableCell>
                  <TableCell 
                    align="right"
                    sx={{ 
                      color: getValueColor(
                        getBetterValue(
                          fighter1.calculatedMetrics.takedownDefense.value, 
                          fighter2.calculatedMetrics.takedownDefense.value
                        ), 
                        'fighter2'
                      ),
                      fontWeight: 'bold',
                    }}
                  >
                    {getTrendIcon(fighter2.calculatedMetrics.takedownDefense.trend)}
                    {fighter2.calculatedMetrics.takedownDefense.value.toFixed(1)}%
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell 
                    sx={{ 
                      color: getValueColor(
                        getBetterValue(
                          fighter1.calculatedMetrics.fightFrequency, 
                          fighter2.calculatedMetrics.fightFrequency
                        ), 
                        'fighter1'
                      ),
                      fontWeight: 'bold',
                    }}
                  >
                    {fighter1.calculatedMetrics.fightFrequency.toFixed(1)}/year
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" color="text.secondary">
                      Fight Frequency
                    </Typography>
                  </TableCell>
                  <TableCell 
                    align="right"
                    sx={{ 
                      color: getValueColor(
                        getBetterValue(
                          fighter1.calculatedMetrics.fightFrequency, 
                          fighter2.calculatedMetrics.fightFrequency
                        ), 
                        'fighter2'
                      ),
                      fontWeight: 'bold',
                    }}
                  >
                    {fighter2.calculatedMetrics.fightFrequency.toFixed(1)}/year
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Physical Stats Comparison */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <FitnessCenter sx={{ mr: 1 }} />
                Physical Comparison
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell>Height</TableCell>
                      <TableCell align="center">
                        {Math.floor(fighter1.physicalStats.height / 12)}'{fighter1.physicalStats.height % 12}"
                      </TableCell>
                      <TableCell align="center">vs</TableCell>
                      <TableCell align="center">
                        {Math.floor(fighter2.physicalStats.height / 12)}'{fighter2.physicalStats.height % 12}"
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Weight</TableCell>
                      <TableCell align="center">{fighter1.physicalStats.weight} lbs</TableCell>
                      <TableCell align="center">vs</TableCell>
                      <TableCell align="center">{fighter2.physicalStats.weight} lbs</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Reach</TableCell>
                      <TableCell align="center">{fighter1.physicalStats.reach}"</TableCell>
                      <TableCell align="center">vs</TableCell>
                      <TableCell align="center">{fighter2.physicalStats.reach}"</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Stance</TableCell>
                      <TableCell align="center">{fighter1.physicalStats.stance}</TableCell>
                      <TableCell align="center">vs</TableCell>
                      <TableCell align="center">{fighter2.physicalStats.stance}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Performance Trends
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Box mb={2}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Overall Performance Trend
                </Typography>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Chip
                    label={fighter1.trends.performanceTrend}
                    size="small"
                    color={
                      fighter1.trends.performanceTrend === 'improving' ? 'success' :
                      fighter1.trends.performanceTrend === 'declining' ? 'error' : 'info'
                    }
                    sx={{ textTransform: 'capitalize' }}
                  />
                  <Typography variant="body2" color="text.secondary">vs</Typography>
                  <Chip
                    label={fighter2.trends.performanceTrend}
                    size="small"
                    color={
                      fighter2.trends.performanceTrend === 'improving' ? 'success' :
                      fighter2.trends.performanceTrend === 'declining' ? 'error' : 'info'
                    }
                    sx={{ textTransform: 'capitalize' }}
                  />
                </Box>
              </Box>

              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Activity Level
                </Typography>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Chip
                    label={fighter1.trends.activityLevel.replace('_', ' ')}
                    size="small"
                    color="info"
                    sx={{ textTransform: 'capitalize' }}
                  />
                  <Typography variant="body2" color="text.secondary">vs</Typography>
                  <Chip
                    label={fighter2.trends.activityLevel.replace('_', ' ')}
                    size="small"
                    color="info"
                    sx={{ textTransform: 'capitalize' }}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Performance Chart Comparison */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Performance Comparison Chart
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <ComparisonChart fighter1={fighter1} fighter2={fighter2} />
        </CardContent>
      </Card>
    </Box>
  );
}