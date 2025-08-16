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
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  EmojiEvents,
  FitnessCenter,
  Timeline,
} from '@mui/icons-material';
import { Fighter } from '@ufc-platform/shared';
import { StatCard } from '../common/StatCard';
import { PerformanceChart } from './PerformanceChart';
import { RecordChart } from './RecordChart';

interface FighterProfileProps {
  fighter: Fighter;
  loading?: boolean;
}

export function FighterProfile({ fighter, loading = false }: FighterProfileProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading fighter profile...</Typography>
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

  const getPerformanceTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving':
        return 'success';
      case 'declining':
        return 'error';
      default:
        return 'info';
    }
  };

  const winPercentage = (
    (fighter.record.wins / (fighter.record.wins + fighter.record.losses + fighter.record.draws)) * 100
  ).toFixed(1);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item>
              <Avatar
                sx={{
                  width: 120,
                  height: 120,
                  bgcolor: theme.palette.primary.main,
                  fontSize: '2rem',
                  fontWeight: 'bold',
                }}
              >
                {fighter.name.split(' ').map(n => n[0]).join('')}
              </Avatar>
            </Grid>
            <Grid item xs>
              <Typography variant="h3" component="h1" gutterBottom>
                {fighter.name}
                {fighter.nickname && (
                  <Typography
                    component="span"
                    variant="h4"
                    sx={{ ml: 2, color: 'text.secondary', fontStyle: 'italic' }}
                  >
                    "{fighter.nickname}"
                  </Typography>
                )}
              </Typography>
              
              <Box display="flex" gap={1} mb={2}>
                <Chip
                  label={fighter.rankings.weightClass}
                  color="primary"
                  variant="outlined"
                />
                {fighter.rankings.rank && (
                  <Chip
                    label={`#${fighter.rankings.rank} Ranked`}
                    color="secondary"
                    icon={<EmojiEvents />}
                  />
                )}
                {fighter.rankings.p4pRank && (
                  <Chip
                    label={`P4P #${fighter.rankings.p4pRank}`}
                    color="warning"
                    icon={<EmojiEvents />}
                  />
                )}
              </Box>

              <Typography variant="body1" color="text.secondary">
                <strong>Camp:</strong> {fighter.camp.name} ({fighter.camp.location})
              </Typography>
              <Typography variant="body1" color="text.secondary">
                <strong>Head Coach:</strong> {fighter.camp.headCoach}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Record"
            value={`${fighter.record.wins}-${fighter.record.losses}-${fighter.record.draws}`}
            subtitle={`${winPercentage}% Win Rate`}
            icon={<EmojiEvents />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Win Streak"
            value={fighter.calculatedMetrics.winStreak}
            subtitle="Current Streak"
            icon={<Timeline />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Striking Accuracy"
            value={`${fighter.calculatedMetrics.strikingAccuracy.value.toFixed(1)}%`}
            subtitle={`${fighter.calculatedMetrics.strikingAccuracy.period} fight avg`}
            icon={getTrendIcon(fighter.calculatedMetrics.strikingAccuracy.trend)}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Takedown Defense"
            value={`${fighter.calculatedMetrics.takedownDefense.value.toFixed(1)}%`}
            subtitle={`${fighter.calculatedMetrics.takedownDefense.period} fight avg`}
            icon={getTrendIcon(fighter.calculatedMetrics.takedownDefense.trend)}
            color="warning"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Physical Stats */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <FitnessCenter sx={{ mr: 1 }} />
                Physical Stats
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Height</Typography>
                  <Typography variant="h6">
                    {Math.floor(fighter.physicalStats.height / 12)}'{fighter.physicalStats.height % 12}"
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Weight</Typography>
                  <Typography variant="h6">{fighter.physicalStats.weight} lbs</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Reach</Typography>
                  <Typography variant="h6">{fighter.physicalStats.reach}"</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Leg Reach</Typography>
                  <Typography variant="h6">{fighter.physicalStats.legReach}"</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">Stance</Typography>
                  <Chip
                    label={fighter.physicalStats.stance}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Performance Trends */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Performance Analysis
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Box mb={2}>
                <Typography variant="body2" color="text.secondary">Overall Trend</Typography>
                <Chip
                  label={fighter.trends.performanceTrend}
                  color={getPerformanceTrendColor(fighter.trends.performanceTrend) as any}
                  size="small"
                  sx={{ textTransform: 'capitalize' }}
                />
              </Box>
              
              <Box mb={2}>
                <Typography variant="body2" color="text.secondary">Activity Level</Typography>
                <Chip
                  label={fighter.trends.activityLevel.replace('_', ' ')}
                  color="info"
                  size="small"
                  sx={{ textTransform: 'capitalize' }}
                />
              </Box>
              
              <Box mb={2}>
                <Typography variant="body2" color="text.secondary">Fight Frequency</Typography>
                <Typography variant="h6">
                  {fighter.calculatedMetrics.fightFrequency.toFixed(1)} fights/year
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="body2" color="text.secondary">Last Fight</Typography>
                <Typography variant="body1">
                  {new Date(fighter.trends.lastFightDate).toLocaleDateString()}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Performance Chart */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Performance Trend
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <PerformanceChart recentForm={fighter.calculatedMetrics.recentForm} />
            </CardContent>
          </Card>
        </Grid>

        {/* Record Breakdown */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Record Breakdown
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <RecordChart record={fighter.record} />
            </CardContent>
          </Card>
        </Grid>

        {/* Injury History */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Injury History
              </Typography>
              <Divider sx={{ mb: 2 }} />
              {fighter.trends.injuryHistory.length > 0 ? (
                <Box>
                  {fighter.trends.injuryHistory.map((injury, index) => (
                    <Chip
                      key={index}
                      label={injury}
                      size="small"
                      color="warning"
                      variant="outlined"
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No significant injury history recorded
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}